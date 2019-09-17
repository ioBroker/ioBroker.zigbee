'use strict';

const ZigbeeHerdsman = require('zigbee-herdsman');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const EventEmitter = require('events').EventEmitter;
// const debug = require('debug')('zigbee:controller');
const Queue = require('queue');
const safeJsonStringify = require('./json');
const bytesArrayToWordArray = require('./utils').bytesArrayToWordArray;
// Xiaomi uses 4151 and 4447 (lumi.plug) as manufacturer ID.
const xiaomiManufacturerID = [4151, 4447];
const zclId = require('zcl-id');
//const cieApp = require('./zapp');

 const OneJanuary2000 = new Date('January 01, 2000 00:00:00').getTime();

function isFunction(functionToCheck) {
    return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

class ZigbeeController extends EventEmitter {
    /*
      events:

      log - log (level, msg, data)
      event - preparsed device events (type, dev, msg, data)
      new - new device connected to network (id, msg)
      leave - device leave the network (id, msg)
      join - join countdown (counter)
      ready - connection successfull ()
    */
    constructor(options) {
        super();
        const herdsmanSettings = {
            network: {
                panID: options.net.panId,
                extenedPanID: options.net.extPanId,
                channelList: options.net.channelList,
                networkKey: options.net.precfgkey,
            },
            databasePath: options.dbPath,
            backupPath: options.backupPath,
            serialPort: {
                baudRate: options.sp.baudRate,
                rtscts: options.sp.rtscts,
                path: options.sp.port,
            },
        };
        this.disableLed = options.disableLED;
        this.debug(`Using zigbee-herdsman with settings: ${JSON.stringify(herdsmanSettings)}`);
        this._permitJoinTime = 0;
        this.herdsman = new ZigbeeHerdsman.Controller(herdsmanSettings);
        
        // /**
        //  * Setup command queue.
        //  * The command queue ensures that only 1 command is executed at a time.
        //  * When executing multiple commands at the same time, some commands may fail.
        //  */
        // this.queue = new Queue();
        // this.queue.concurrency = 20;
        // this.queue.timeout = 200;
        // this.queue.autostart = true;

        // this.handleReady   = this.handleReady.bind(this);
        // this.handleMessage = this.handleMessage.bind(this);
        // this.handleError   = this.handleError.bind(this);
        // this.handleJoining = this.handleJoining.bind(this);
        // this.incMsgHandler = this.incMsgHandler.bind(this); 

        // this.shepherd.on('ready', this.handleReady);
        // this.shepherd.on('ind', this.handleMessage);
        // this.shepherd.on('error', this.handleError);
        // this.shepherd.on('permitJoining', this.handleJoining);
        // this.shepherd.controller.on('ZCL:incomingMsg', this.incMsgHandler);

        // this.configured = [];
        this.extensions = [];
    }

    // Start controller
    async start() {
        this.debug(`Starting zigbee-herdsman...`);
        await this.herdsman.start();
        
        this.herdsman.on('adapterDisconnected', () => this.emit('disconnect'));
        this.herdsman.on('deviceAnnounce', this.handleDeviceAnnounce.bind(this));
        this.herdsman.on('deviceInterview', this.handleDeviceInterview.bind(this));
        this.herdsman.on('deviceJoined', this.handleDeviceJoined.bind(this));
        this.herdsman.on('deviceLeave', this.handleDeviceLeave.bind(this));
        //this.herdsman.on('message', (data) => this.emit('event', 'message', data));
        this.herdsman.on('message', this.handleMessage.bind(this));

        this.debug('zigbee-herdsman started');
        this.info(`Coordinator firmware version: ${JSON.stringify(await this.getCoordinatorVersion())}`);
        this.debug(`Zigbee network parameters: ${JSON.stringify(await this.herdsman.getNetworkParameters())}`);

        // for (const device of await this.getClients()) {
        //     // If a whitelist is used, all other device will be removed from the network.
        //     if (settings.get().whitelist.length > 0) {
        //         if (!settings.get().whitelist.includes(device.ieeeAddr)) {
        //             logger.warn(`Blacklisted device is connected (${device.ieeeAddr}), removing...`);
        //             device.removeFromNetwork();
        //         }
        //     } else if (settings.get().ban.includes(device.ieeeAddr)) {
        //         logger.warn(`Banned device is connected (${device.ieeeAddr}), removing...`);
        //         device.removeFromNetwork();
        //     }
        // }

        // Check if we have to turn off the led
        if (this.disableLed) {
            this.herdsman.disableLED();
        }

        // Call extensions
        this.callExtensionMethod('onZigbeeStarted', []);

        // Log zigbee clients on startup
        const devices = await this.getClients();
        if (devices.length > 0) {
            this.info(`Currently ${devices.length} devices are joined:`);
        } else {
            this.info(`Currently no devices.`);
        }
        for (const device of devices) {
            const entity = await this.resolveEntity(device);
            this.info(
                (entity.device.ieeeAddr) +
                ` (addr ${entity.device.networkAddress}): ` +
                (entity.mapped ?
                    `${entity.mapped.model} - ${entity.mapped.vendor} ${entity.mapped.description} ` :
                    `Not supported (model ${entity.device.modelID})`) +
                `(${entity.device.type})`
            );
        }
        this.emit('ready');
    }

    getCoordinatorVersion() {
        return this.herdsman.getCoordinatorVersion();
    }

    info(message, data) {
        //debug('info', message, data);
        this.emit('log', 'info', message, data);
    }

    error(message, data) {
        //debug('error', message, data);
        this.emit('log', 'error', message, data);
    }

    debug(message, data) {
        //debug('debug', message, data);
        this.emit('log', 'debug', message, data);
    }

    event(type, dev, message, data) {
        //debug('event', type, message, data);
        this.emit('event', type, dev, message, data);
    }

    callExtensionMethod(method, parameters) {
        for (const extension of this.extensions) {
            if (extension[method]) {
                try {
                    extension[method](...parameters);
                } catch (error) {
                    this.error(`Failed to call '${extension.constructor.name}' '${method}' (${error.stack})`);
                    throw error;
                }
            }
        }
    }

    async getClients() {
        const devices = await this.herdsman.getDevices({});
        return devices.filter((device) => device.type !== 'Coordinator');
    }

    getDevice(query) {
        return this.herdsman.getDevice(query);
    }

    async resolveEntity(key) {
        //assert(typeof key === 'string' || key.constructor.name === 'Device', `Wrong type '${typeof key}'`);

        if (typeof key === 'string') {
            if (key === 'coordinator') {
                const coordinator = this.getDevice({type: 'Coordinator'});
                return {
                    type: 'device',
                    device: coordinator,
                    endpoint: coordinator.getEndpoint(1),
                    name: 'Coordinator',
                };
            } else {
                const device = await this.getDevice({ieeeAddr: key});
                const mapped = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
                const endpoints = mapped && mapped.endpoint ? mapped.endpoint(device) : null;
                if (endpoints && endpoints['default']) {
                    endpoint = device.getEndpoint(endpoints['default']);
                } else {
                    endpoint = device.endpoints[0];
                }
                return {
                    type: 'device', 
                    device, 
                    mapped, 
                    endpoint, 
                    name: key,
                    isDefaultEndpoint, endpointName,
                };
            }

            // let postfix = postfixes.find((p) => key.endsWith(`/${p}`));
            // const postfixByNumber = key.match(keyEndpointByNumber);
            // if (!postfix && postfixByNumber) {
            //     postfix = Number(postfixByNumber[1]);
            // }
            // if (postfix) {
            //     key = key.replace(`/${postfix}`, '');
            // }

            // const entity = settings.getEntity(key);
            // if (!entity) {
            //     return null;
            // } else if (entity.type === 'device') {
            //     const device = await this.getDevice({ieeeAddr: entity.ID});
            //     const mapped = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
            //     const endpoints = mapped && mapped.endpoint ? mapped.endpoint(device) : null;
            //     let isDefaultEndpoint = true;
            //     let endpoint;
            //     if (postfix) {
            //         isDefaultEndpoint = false;
            //         if (postfixByNumber) {
            //             endpoint = device.getEndpoint(postfix);
            //         } else {
            //             assert(mapped != null, `Postfix '${postfix}' is given but device is unsupported`);
            //             assert(endpoints != null, `Postfix '${postfix}' is given but device defines no endpoints`);
            //             const endpointID = endpoints[postfix];
            //             assert(endpointID, `Postfix '${postfix}' is given but device has no such endpoint`);
            //             endpoint = device.getEndpoint(endpointID);
            //         }
            //     } else if (endpoints && endpoints['default']) {
            //         endpoint = device.getEndpoint(endpoints['default']);
            //     } else {
            //         endpoint = device.endpoints[0];
            //     }

            //     const endpointName = endpoints ? Object.entries(endpoints).find((e) => e[1] === endpoint.ID)[0] : null;
            //     return {
            //         type: 'device', device, settings: entity, mapped, endpoint, name: entity.friendlyName,
            //         isDefaultEndpoint, endpointName,
            //     };
            // } else {
            //     let group = await this.getGroup({groupID: entity.ID});
            //     if (!group) group = await this.createGroup(entity.ID);
            //     return {type: 'group', group, settings: entity, name: entity.friendlyName};
            // }
        } else {
            return {
                type: 'device',
                device: key,
                mapped: zigbeeHerdsmanConverters.findByZigbeeModel(key.modelID),
                name: key.type === 'Coordinator' ? 'Coordinator' : key.ieeeAddr,
            };
        }
    }

    getInfo() {
        return this.shepherd.info();
    }

    // Start controller
    // start(callback) {
    //     // start the server
    //     this.shepherd.start((err) => {
    //         if (err) {
    //             this.info('Error while starting zigbee-shepherd, attempting to fix... (takes 60 seconds)');
    //             this.shepherd.controller.close();

    //             setTimeout(() => {
    //                 this.info(`Starting zigbee-shepherd`);
    //                 this.shepherd.start((error) => {
    //                     if (error) {
    //                         this.error('Error while starting zigbee-shepherd!', error);
    //                         if (callback) callback(error);
    //                     } else {
    //                         this.info('zigbee-shepherd started');
    //                         if (callback) callback();
    //                     }
    //                 });
    //             }, 60 * 1000);
    //         } else {
    //             this.info('zigbee-shepherd started!');
    //             if (callback) callback();
    //         }
    //     });
    // }

    // mode: soft, hard
    reset(mode, callback) {
        this.shepherd.reset(mode, callback);
    }

    handleReady() {
        // Mount cieApp
        // this.shepherd.mount(cieApp, (err, epId) => {
        //     if (!err) {
        //         this.debug(`Mounted the cieApp (epId ${epId})`);
        //     } else {
        //         this.error(`Failed to mount the cieApp`);
        //     }
        // }, 21);

        // Set all Xiaomi devices (manufId === 4151) to be online, so shepherd won't try
        // to query info from devices (which would fail because they go tosleep).
        // Xiaomi lumi.plug has manufId === 4447 and can be in the sleep mode too
        const devices = this.getAllClients();
        devices.forEach(device => {
            const dev = this.shepherd.find(device.ieeeAddr, device.epList[0]).getDevice();
            if (xiaomiManufacturerID.includes(device.manufId)) {
                dev.update({
                     status: 'online',
                     joinTime: Math.floor(Date.now() / 1000),
                });
            }
            // thinking that is not router
            // https://github.com/Koenkk/zigbee2mqtt/issues/1594
            if (['lumi.ctrl_neutral2', 'lumi.ctrl_neutral1'].includes(dev.modelId)) {
                if (dev.type === 'Router') {
                    dev.update({type: 'EndDevice'});
                }
            }
            // setup time cluster response
            this.setupOnZclFoundation(device);
        });
        const firmware = this.getInfo().firmware || {};
        this.info(`Zigbee-shepherd ready. Firmware version: ${firmware.version} rev ${firmware.revision}`);
        this.emit('ready');
        this.startRouterPoll();
    }

    handleError(message) {
        // This event may appear if zigbee-shepherd cannot decode bad packets (invalid checksum).
        this.error(message);
    }

    handleJoining(joinTimeLeft) {
        this.debug('Join countdown', joinTimeLeft);
        this.emit('join', joinTimeLeft);
    }

    async incMsgHandler(message){
        this.debug('incoming msg', message);
        const device = await this.herdsman.getDevice({ieeeAddr: message.srcaddr});
        if (!device) {
            this.debug('Message without device!');
            return;
        }
        // We can't handle devices without modelId.
        if (!device.modelId) {
            this.debug('Message without modelId!');
            return;
        }
        this.event('msg', device.ieeeAddr, message, {
            modelId: device.modelId
        });
    }

    // Stop controller
    async stop(callback) {
        // Call extensions
        await this.callExtensionMethod('stop', []);

        try {
            await this.permitJoin(0);
            await this.herdsman.stop();
        } catch (error) {
            this.error('Failed to stop zigbee');
        }

        // this.clearPollTimer();
        // this.queue.stop();
        // this.shepherd.stop((error) => {
        //     this.info('zigbee-shepherd stopped');
        //     if (callback) callback(error);
        // });
    }

    // getCoordinator() {
    //     const device = this.shepherd.list().find((d) => d.type === 'Coordinator');
    //     return this.shepherd.find(device.ieeeAddr, 1);
    // }

    // Permit join
    async permitJoin(permitTime, devid, failure) {
        // let permitDev = 'all';
        // if (isFunction(devid) && !isFunction(failure)) {
        //     failure = devid;
        // } else {
        //     const dev = this.getDevice(devid);
        //     if (dev) {
        //         permitDev = dev.nwkAddr;
        //     }
        // }

        if (permitTime) {
            this.info('Zigbee: allowing new devices to join.');
        } else {
            this.info('Zigbee: disabling joining new devices.');
        }

        if (permitTime && !this.herdsman.getPermitJoin()) {
            clearInterval(this._permitJoinInterval);
            this._permitJoinTime = permitTime;
            await this.herdsman.permitJoin(true);
            this._permitJoinInterval = setInterval(async () => {
                this.emit('pairing', 'Pairing time left', this._permitJoinTime);
                if (this._permitJoinTime === 0) {
                    this.info('Zigbee: stop joining');
                    clearInterval(this._permitJoinInterval);
                    await this.herdsman.permitJoin(false);
                }
                this._permitJoinTime -= 1;
            }, 1000);
        } else if (this.herdsman.getPermitJoin()) {
            if (permitTime) {
                this.info('Joining already permitted');
            } else {
                clearInterval(this._permitJoinInterval);
                await this.herdsman.permitJoin(false);
            }
        }
    }

    // Remove device
    remove(deviceID, callback) {
        this.shepherd.remove(deviceID, {}, (error) => {
            if (error) {
                this.error('Remove failure.', error);                
                if (callback) callback(error);
            } else {
                this.debug('Remove successful.');
                if (callback) callback();
            }
        });
    }

    forceRemove(deviceID, callback) {
        const device = this.shepherd._findDevByAddr(deviceID);
        // force
        return this.shepherd._unregisterDev(device, (err, result) => {
            return callback(err, result);
        });
    }

    // Zigbee events
    async handleDeviceLeave(message) {
        this.debug('handleDeviceLeave', message);
        const entity = await this.resolveEntity(message.device || message.ieeeAddr);
        const friendlyName = entity.name;
        this.debug(`Device '${friendlyName}' left the network`);
        this.emit('leave', entity);
    }
    
    async handleDeviceAnnounce(message) {
        this.debug('handleDeviceAnnounce', message);
        const entity = await this.resolveEntity(message.device || message.ieeeAddr);
        const friendlyName = entity.name;
        this.debug(`Device '${friendlyName}' announced itself`);
        this.emit('pairing', `Device '${friendlyName}' announced itself`);
    }

    async handleDeviceJoined(message) {
        this.debug('handleDeviceJoined', message);
        const entity = await this.resolveEntity(message.device || message.ieeeAddr);
        this.emit('new', entity);
    }

    async handleDeviceInterview(message) {
        this.debug('handleDeviceInterview', message);
        const entity = await this.resolveEntity(message.device || message.ieeeAddr);
        const friendlyName = entity.name;
        if (message.status === 'successful') {
            this.info(`Successfully interviewed '${friendlyName}', device has succesfully been paired`);

            if (entity.mapped) {
                const {vendor, description, model} = entity.mapped;
                this.info(
                    `Device '${friendlyName}' is supported, identified as: ${vendor} ${description} (${model})`
                );

                const log = {friendly_name: friendlyName, model, vendor, description, supported: true};
                this.emit('pairing', 'Interview successful', log);
            } else {
                this.warn(
                    `Device '${friendlyName}' with Zigbee model '${data.device.modelID}' is NOT supported, ` +
                    `please follow https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`
                );
                this.emit('pairing', 'Interview successful', {friendly_name: friendlyName, supported: false});
            }
        } else if (data.status === 'failed') {
            this.error(`Failed to interview '${friendlyName}', device has not succesfully been paired`);
            this.emit('pairing', 'Interview failed', {friendly_name: friendlyName});
        } else {
            if (data.status === 'started') {
                this.info(`Starting interview of '${friendlyName}'`);
                this.emit('pairing', 'Interview started', {friendly_name: friendlyName});
            }
        }
    }

    async handleMessage(message) {
        this.debug('handleMessage', message);
        const entity = await this.resolveEntity(message.device || message.ieeeAddr);

        // force setup zcl-handler
        // if (message.endpoints && message.endpoints[0].device) {
        //     this.setupOnZclFoundation(message.endpoints[0].device);
        // }

        switch (message.type) {
            case 'deviceJoined':
                this.newDevice(message);
                break;
            case 'deviceInterview':
                this.interviewDevice(message);
                break;
            case 'deviceLeave':
                this.leavingDevice(message);
                break;
            case 'deviceAnnounce':
                this.debug(`Device '${entity.name}' announced itself`);
            default:
                const device = message.device;
                if (!device) {
                    this.debug('Message without device!');
                    return;
                }
                // We dont handle messages without endpoints.
                if (!device.endpoints) {
                    this.debug('Message without endpoints!');
                    //return;
                }
                // We can't handle devices without modelId.
                if (!device.modelID) {
                    this.debug('Message without modelId!');
                    //return;
                }
                // After this point we cant handle message without cid anymore.
                if (message.cluster === undefined) {
                    this.debug('Message without data cluster!');
                    //return;
                }
                // send pre-parsed event
                this.event(message.type, device.ieeeAddr, message, {
                    cid: message.cluster,
                    modelId: device.modelID,
                });
        }
    }

    newDevice(message) {
        this.debug('new device ' + message.data + ' joining the network!');
        this.emit('new', message.data, message);
    }

    leavingDevice(message) {
        this.debug('device ' + message.data + ' leaving the network!');
        this.emit('leave', message.data, message);
    }

    interviewDevice(message) {
        // calc progress
        let maxEp = message.status.endpoint.total,
            curEp = message.status.endpoint.current,
            maxCl = message.status.endpoint.cluster.total,
            curCl = message.status.endpoint.cluster.current,
            progress = Math.round(curCl * 100 / maxCl);

        this.event('interview', message.data, message, {
            totalEp: maxEp, currentEp: curEp, progress: progress
        });
    }

    // Zigbee commands

    checkOnline(deviceID, callback) {
        const device = this.shepherd._findDevByAddr(deviceID);

        if (device) {
            this.debug(`Check online ${deviceID}`, deviceID);
            this.shepherd.controller.checkOnline(device, callback);
        }
    }

    getMap(callback) {
        if (callback) callback([]);
        // if (!this.enabled()) {
        //     if (callback) callback([]);
        // }
        // this.shepherd.lqiScan().then((result)=>{
        //     this.debug('lqiScan result: ', result);
        //     if (callback) callback(result);
        // });
    }
    
    configureReport(ieeeAddr, reports) {
        reports.forEach((r) => {
            const device = this.shepherd.find(ieeeAddr, r.ep);
            if (device) {
                device.report(r.cid, r.attr, r.minInt, r.maxInt, r.repChange, error => {
                    if (error) {
                        this.error(`Failed to configure reporting for ${ieeeAddr} ${r.cid} ${r.attr}`, error);
                    } else {
                        this.info(`Configured reporting for ${ieeeAddr} ${r.cid} ${r.attr}`);
                    }
                });
            } else {
                this.error(`Failed to configure reporting for ${ieeeAddr} ${r.cid} ${r.attr} (device not found)`);
            }
        });
    }

    // getDevice(deviceID) {
    //     return this.shepherd.list().find((d) => d.ieeeAddr === deviceID);
    // }

    publish(deviceID, cid, cmd, zclData, cfg, ep, type, callback) {
        // Find device in zigbee-shepherd
        let device;
        if( (typeof deviceID === 'object') && (deviceID !== null) ) {
            device = deviceID;
        } else {
            if (deviceID === 0) {
                device = this.getCoordinator();
            } else {
                device = this.getDevice(deviceID);
                if (!device || !device.epList || !device.epList.length) {
                    this.error(`Zigbee cannot determine endpoint for '${deviceID}'`);
                    return;
                }

                ep = ep ? ep : device.epList[0];
                device = this.shepherd.find(deviceID, ep);
            }
        }

        if (!device) {
            this.error(
                `Zigbee cannot publish message to device because '${deviceID}' is not known by zigbee-shepherd`
            );
            return;
        }

        this.debug(`Zigbee publish to '${deviceID}', ${cid} - cmd ${cmd} - payload ${JSON.stringify(zclData)} - cfg ${JSON.stringify(cfg)} - endpoint ${ep}`);
        
        // Add job to queue
        this.queue.push((queueCallback) => {
            const callback_ = (error, resp) => {
                if (error) {
                    this.error(
                        `Zigbee publish to '${deviceID}', ${cid} - ${cmd} - ${JSON.stringify(zclData)} - ${ep} ` +
                        `failed with error ${error}`);
                }
                if (callback) callback(error, resp);
                queueCallback();
            };
            if (type === 'functional') {
                device.functional(cid, cmd, zclData, cfg, callback_);
            } else if (type === 'foundation') {
                device.foundation(cid, cmd, zclData, cfg, callback_);
            } else {
                this.error(`Unknown zigbee publish type ${type}`);
                queueCallback();
            }
        });
    }
    
    publishDisableQueue(deviceID, cid, cmd, zclData, cfg, ep, type, callback) {
        // Find device in zigbee-shepherd
        let device = this.getDevice(deviceID);
        if (!device || !device.epList || !device.epList.length) {
            this.error(`Zigbee cannot determine endpoint for '${deviceID}'`);
            return;
        }

        ep = ep ? ep : device.epList[0];
        device = this.shepherd.find(deviceID, ep);

        if (!device) {
            this.error(
                `Zigbee cannot publish message to device because '${deviceID}' is not known by zigbee-shepherd`
            );
            return;
        }

        this.debug(`Zigbee publish to '${deviceID}', ${cid} - cmd ${cmd} - payload ${JSON.stringify(zclData)} - cfg ${JSON.stringify(cfg)} - endpoint ${ep}`);

        const callback_ = (error, resp) => {
            if (error) {
                this.error(
                    `Zigbee publish to '${deviceID}', ${cid} - ${cmd} - ${JSON.stringify(zclData)} - ${ep} ` +
                    `failed with error ${error}`);
            }
            if (callback) callback(error, resp);
        };
        if (type === 'functional') {
            device.functional(cid, cmd, zclData, cfg, callback_);
        } else if (type === 'foundation') {
            device.foundation(cid, cmd, zclData, cfg, callback_);
        } else {
            this.error(`Unknown zigbee publish type ${type}`);
        }
    }

    disableLed() {
        this.shepherd.controller.request('UTIL', 'ledControl', {ledid: 3, mode: 0});
    }

    read(deviceID, cid, attr, ep, callback) {
        // Find device in zigbee-shepherd
        let device = this.getDevice(deviceID);
        if (!device || !device.epList || !device.epList.length) {
            this.error(`Zigbee cannot determine endpoint for '${deviceID}'`);
            return;
        }
        ep = ep ? ep : device.epList[0];
        device = this.shepherd.find(deviceID, ep);
        if (!device) {
            this.error(`Zigbee cannot read attribute from device because '${deviceID}' not known by zigbee-shepherd`);
            return;
        }

        device.read(cid, attr, callback);
    }

    getGroup(ID) {
        return this.shepherd.getGroup(ID);
    }

    findGroup(groupId, success, fail) {
        const _callback = (error, rsp) => {
            if (error) {
                this.debug(`Failed to find group ${groupId} in coordinator`, error);
                if (fail) fail(error);
            } else {
                this.debug(`Successfully find group ${groupId} in coordinator: ${safeJsonStringify(rsp)}`);
                success && success(rsp);
            }
        };
        this.shepherd.controller.request('ZDO', 'extFindGroup', {endpoint: 1, groupid: parseInt(groupId)}, _callback);
    }

    addGroup(groupId, name, success) {
        const callback = (error, rsp) => {
            if (error) {
                this.error(`Failed to add group ${groupId} to coordinator`, error);
            } else {
                this.debug(`Successfully add group ${groupId} to coordinator: ${safeJsonStringify(rsp)}`);
                success && success(rsp);
            }
        };
        this.findGroup(groupId, null, _error => {
            const payload = {endpoint: 1, groupid: parseInt(groupId), namelen: name.length, groupname: name};
            this.shepherd.controller.request('ZDO', 'extAddGroup', payload, callback);
        });
    }

    getGroups(success) {
        const callback = (error, rsp) => {
            if (error) {
                this.error(`Failed to get groups from coordinator`, error);
            } else {
                this.debug(`Successfully get groups from coordinator: ${safeJsonStringify(rsp)}`);

                if (rsp.groups > 0) {
                    const groupsIds = bytesArrayToWordArray(rsp.grouplist);
                    const chain = [];
                    groupsIds.forEach(element => {
                        chain.push(new Promise((resolve, reject) => {
                            this.findGroup(element, (group) => {
                                group.name = group.groupname.toString('utf8');
                                return resolve(group);
                            });
                        }));
                    });
                    Promise.all(chain).then((result)=>{
                        this.debug(`Successfully get groups from coordinator: ${safeJsonStringify(result)}`);
                        success && success(result);
                    });
                } else {
                    success && success([]);
                }
            }
        };
        //const payload = {};
        //this.shepherd.controller.request('ZDO', 'extCountAllGroups', payload, callback);
        const payload = {endpoint: 1};
        this.shepherd.controller.request('ZDO', 'extFindAllGroupsEndpoint', payload, callback);
    }

    removeAllGroup(success, fail) {
        const _callback = (error, rsp) => {
            if (error) {
                this.error(`Failed to remove groups in coordinator`, error);
                if (fail) fail(error);
            } else {
                this.debug(`Successfully remove groups in coordinator: ${safeJsonStringify(rsp)}`);
                success && success(rsp);
            }
        };
        this.shepherd.controller.request('ZDO', 'extRemoveAllGroup', {endpoint: 1}, _callback);
    }

    removeGroup(groupId, success, fail) {
        const _callback = (error, rsp) => {
            if (error) {
                this.error(`Failed to remove group ${groupId} from coordinator`, error);
                if (fail) fail(error);
            } else {
                this.debug(`Successfully remove group ${groupId} from coordinator: ${safeJsonStringify(rsp)}`);
                success && success(rsp);
            }
        };
        this.shepherd.controller.request('ZDO', 'extRemoveGroup', {endpoint: 1, groupid: parseInt(groupId)}, _callback);
    }

    removeUnusedGroups(usedGroupIds, success) {
        this.getGroups(groups => {
            groups.forEach(group => {
                if (usedGroupIds.indexOf(group.groupid) < 0) {
                    this.removeGroup(group.groupid);
                }  
            });
            success && success();
        });
    }

    addDevToGroup(devId, groupId, success) {
        const callback = (error, rsp) => {
            if (error) {
                this.error(`Failed to add device ${devId} to group ${groupId}`, error);
            } else {
                this.debug(`Successfully add device ${devId} to group ${groupId}: ${safeJsonStringify(rsp)}`);
                success && success(rsp);
            }
        };
        this.publish(devId, 'genGroups', 'add', {groupid: parseInt(groupId), groupname: ''}, null, null, 'functional', callback);
    }

    removeDevFromAllGroups(devId, success) {
        const callback = (error, rsp) => {
            if (error) {
                this.error(`Failed to revove dev ${devId} from all groups`, error);
            } else {
                this.debug(`Successfully revove dev ${devId} from all groups: ${safeJsonStringify(rsp)}`);
                success && success(rsp);
            }
        };
        this.publish(devId, 'genGroups', 'removeAll', {}, null, null, 'functional', callback);
    }

    setAvailability(devId, isAvailable) {
      this.debug(`Device ${devId} is ` + (isAvailable ? 'available' : 'not reachable' ));

      const device = this.shepherd._findDevByAddr(devId);
      if (!device) {
          return;
      }

      // We can't handle devices without modelId.
      if (!device.modelId) {
          this.debug('Message without modelId!');
          return;
      }
      this.event('msg', device.ieeeAddr, { available: isAvailable }, {
          modelId: device.modelId
      });
    }

    clearPollTimer () {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    startRouterPoll() {
        this.clearPollTimer();
        this.pollTimer = setInterval(() => {
            this.getAllClients()
                //.filter((d) => xiaomiManufacturerID.includes(d.manufId)) // Filter Xiaomi devices
                .filter((d) => d.type === 'Router') // Filter routers
                .filter((d) => d.powerSource && d.powerSource !== 'Battery') // Remove battery powered devices
                .forEach((d) => this.checkOnline(d.ieeeAddr, (error) => this.setAvailability(d.ieeeAddr, !error)) ); // Ping devices.
        }, 60 * 1000); // 1minute
    }

    setupOnZclFoundation(device) {
        if (device && device.epList && !this.configured.includes(device.ieeeAddr)) {
            this.configured.push(device.ieeeAddr);

            device.epList.forEach(epID => {
                const ep = this.getEndpoint(device.ieeeAddr, epID);
                ep.onZclFoundation = this.onZclFoundation.bind(this);
            });
        }
    }

    onZclFoundation(message, endpoint) {
        const cmd = message.zclMsg.cmdId;

        if (cmd === 'read') {
            this.readResponse(message, endpoint);
        }
    }

    readResponse(message, endpoint) {
        const clusterID = message.clusterid;
        const cluster = zclId.cluster(clusterID).key;
        const attributes = message.zclMsg.payload.map((p) => zclId.attr(message.clusterid, p.attrId));
        const response = [];

        attributes.forEach((attribute) => {
            if (cluster === 'genTime' && attribute.key === 'time') {
                const time = Math.round(((new Date()).getTime() - OneJanuary2000) / 1000);
                response.push(this.createReadResponseRec(clusterID, attribute.value, time));
            }
        });

        this.publish(
            endpoint.device.ieeeAddr, cluster, 'readRsp', response,
            {direction: 1, seqNum: message.zclMsg.seqNum, disDefaultRsp: 1}, endpoint.epId, 'foundation'
        );
    }

    createReadResponseRec(cId, attrId, value) {
        return {
            attrId: attrId,
            status: 0,
            attrData: value,
            dataType: zclId.attrType(cId, attrId).value,
        };
    }

    getEndpoint(ieeeAddr, ep) {
        // If no ep is given, the first endpoint will be returned
        // Find device in zigbee-shepherd
        const device = this.getDevice(ieeeAddr);
        if (!device || !device.epList || !device.epList.length) {
            this.error(`Zigbee cannot determine endpoint for '${ieeeAddr}'`);
            return null;
        }

        ep = ep ? ep : device.epList[0];
        const endpoint = this.shepherd.find(ieeeAddr, ep);
        return endpoint;
    }

    bind(ep, cluster, target, callback) {
        const log = ` ${ep.device.ieeeAddr} - ${cluster}`;
        target = !target ? this.getCoordinator() : target;

        this.debug(`Binding ${log}`);
        ep.bind(cluster, target, (error) => {
            if (error) {
                this.error(`Failed to bind ${log} - (${error})`);
            } else {
                this.debug(`Successfully bound ${log}`);
            }

            callback(error);
        });
    }

    unbind(ep, cluster, target, callback) {
        const log = ` ${ep.device.ieeeAddr} - ${cluster}`;
        target = !target ? this.getCoordinator() : target;

        this.debug(`Unbinding ${log}`);
        ep.unbind(cluster, target, (error) => {
            if (error) {
                this.error(`Failed to unbind ${log} - (${error})`);
            } else {
                this.debug(`Successfully unbound ${log}`);
            }

            callback(error);
        });
    }
}

module.exports = ZigbeeController;
