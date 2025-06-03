'use strict';

const pathLib = require('path');
const ZigbeeHerdsman = require('zigbee-herdsman');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const ZDO = require('zigbee-herdsman/dist/zspec/zdo');
const zigbeeHerdsmanConvertersPhilips = require('zigbee-herdsman-converters/lib/philips');
const EventEmitter = require('events').EventEmitter;
const safeJsonStringify = require('./json');
const DeviceAvailabilityExt = require('./zbDeviceAvailability');
const DeviceConfigureExt = require('./zbDeviceConfigure');
const DeviceEventExt = require('./zbDeviceEvent');
const DelayedActionExt = require('./zbDelayedAction');
const Groups = require('./groups');
const utils = require('./utils');

const { access, constants } =require('node:fs/promises');

const groupConverters = [
    zigbeeHerdsmanConverters.toZigbee.light_onoff_brightness,
    zigbeeHerdsmanConverters.toZigbee.light_color_colortemp,
    zigbeeHerdsmanConvertersPhilips.tz.effect, // Support Hue effects for groups
    zigbeeHerdsmanConverters.toZigbee.ignore_transition,
    zigbeeHerdsmanConverters.toZigbee.cover_position_tilt,
    zigbeeHerdsmanConverters.toZigbee.thermostat_occupied_heating_setpoint,
    zigbeeHerdsmanConverters.toZigbee.tint_scene,
    zigbeeHerdsmanConverters.toZigbee.light_brightness_move,
    zigbeeHerdsmanConverters.toZigbee.light_brightness_step,
    zigbeeHerdsmanConverters.toZigbee.light_colortemp_step,
    zigbeeHerdsmanConverters.toZigbee.light_colortemp_move,
    zigbeeHerdsmanConverters.toZigbee.light_hue_saturation_move,
    zigbeeHerdsmanConverters.toZigbee.light_hue_saturation_step


    /*   zigbeeHerdsmanConverters.toZigbeeConverters.light_onoff_brightness,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_colortemp,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_color,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_alert,
    zigbeeHerdsmanConverters.toZigbeeConverters.ignore_transition,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_brightness_move,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_brightness_step,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_colortemp_move,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_colortemp_step,
    zigbeeHerdsmanConverters.toZigbeeConverters.light_colortemp_startup*/

];

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
    constructor(adapter) {
        super();
        this.adapter = adapter;
        this._permitJoinTime = 0;
        this.transmitPower = 0;
        this.herdsmanStarted = false;
        this.extensions = [
            new DeviceAvailabilityExt(this, {}),
            new DeviceConfigureExt(this, {}),
            new DeviceEventExt(this, {}),
            new DelayedActionExt(this, {}),
        ];
        this.herdsmanTimeoutRegexp = new RegExp(/(\d+)ms/);
        this.herdsmanLogSettings = {};
        this.debugActive = true;

    }



    reverseIEEE(source) {
        const rv = [];
        for (let i=0;i<source.length;i+=2)
            rv.push(source.slice(i,i+2))
        return rv.reverse().join('');
    }

    async testConnectable(port) {
        const netAddress = utils.getNetAddress(port);
        if (netAddress && netAddress.strAddress) return netAddress.strAddress;
        try {
            const _port = port.trim();
            await access(_port, constants.R_OK | constants.W_OK);
            return _port;
        }
        catch (error) {
            console.warn(`unable to access ${port}`)
            return '';
        }
    }

    configure(options) {

        if (options.transmitPower != undefined) {
            this.transmitPower = options.transmitPower;
        }

        this.powerText = '';
        if (this.transmitPower !== '0') {
            const powerLevels = {
                '-22': 'low',
                '19': 'high',
                '20': 'high+'
            };

            this.powerText = powerLevels[this.transmitPower] || 'normal';
        }

        //this.info(`  --> transmitPower : ${this.powerText}`);

        const herdsmanSettings = {
            network: {
                panID: options.net.panId,
                extendedPanID: options.net.extPanId,
                channelList: options.net.channelList,
                networkKey: options.net.precfgkey,
            },
            databasePath: pathLib.join(options.dbDir, options.dbPath),
            backupPath: pathLib.join(options.dbDir, options.backupPath),
            serialPort: {
                baudRate: options.sp.baudRate,
                rtscts: options.sp.rtscts,
                path: (typeof options.sp.port == 'string' ? options.sp.port.trim() : options.sp.port),
                adapter: options.sp.adapter,
            },
            transmitpower: this.transmitPower,
            adapter: {
                forceStartWithInconsistentAdapterConfiguration: options.startWithInconsistent
            },
            legacy : false,

        };
        // detect net port and rebuild
        const tcpPort = utils.getNetAddress(herdsmanSettings.serialPort.path);
        if (tcpPort && tcpPort.host)
            herdsmanSettings.serialPort.path = `tcp://${tcpPort.host}:${tcpPort.port ? tcpPort.port : 80}`;
        // https://github.com/ioBroker/ioBroker.zigbee/issues/668
        if (!options.extPanIdFix) {
            delete herdsmanSettings.network.extendedPanID;
            herdsmanSettings.network.extenedPanID = options.net.extPanId;
        }

        if (options.transmitPower != undefined) {
            herdsmanSettings.transmitPower = options.transmitPower;
        }
        this.disableLed = options.disableLed;
        this.warnOnDeviceAnnouncement = options.warnOnDeviceAnnouncement;
        this.herdsmanLogSettings.panID = herdsmanSettings.network.panID;
        this.herdsmanLogSettings.channel = herdsmanSettings.network.channelList[0];
        this.herdsmanLogSettings.extendedPanID = utils.byteArrayToString(herdsmanSettings.network.extendedPanID);
        this.herdsman = new ZigbeeHerdsman.Controller(herdsmanSettings, this.adapter.log);
        this.callExtensionMethod('setOptions', [{
            disableActivePing: options.disablePing,
            disableForcedPing: false,
            pingTimeout: 300,
            pingCount: 3
        }]);
    }

    async stopHerdsman() {
        try {
            this.emit('pairing', 'stopping zigbee-herdsman');
            await this.herdsman.stop();
            this.emit('pairing', 'herdsman stopped !');
            this.herdsmanStarted = false;
        }
        catch (error) {
            this.emit('pairing', `error stopping zigbee-herdsman: ${error && error.message ? error.message : 'no reason given'}`);
        }
    }

    // Start controller
    async start() {
        try {
            this.emit('pairing',`Starting zigbee-herdsman...`);
            this.powerText = '';
            if (this.transmitPower !== '0') {
                const powerLevels = {
                    '-22': 'low',
                    '19': 'high',
                    '20': 'high+'
                };
                this.powerText = powerLevels[this.transmitPower] || 'normal';
            }
            this.info(`configured transmit power : ${this.powerText}`);
            if (this.debugActive) this.debug(`Starting zigbee-herdsman...`);

            // install event handlers before start
            this.herdsman.on('adapterDisconnected', this.handleDisconnected.bind(this));
            this.herdsman.on('deviceAnnounce', this.handleDeviceAnnounce.bind(this));
            this.herdsman.on('deviceInterview', this.handleDeviceInterview.bind(this));
            this.herdsman.on('deviceJoined', this.handleDeviceJoined.bind(this));
            this.herdsman.on('deviceLeave', this.handleDeviceLeave.bind(this));
            this.herdsman.on('message', this.handleMessage.bind(this));
            this.herdsman.on('permitJoinChanged', this.handlePermitJoinChanged.bind(this));

            this.info('Starting Zigbee-Herdsman');
            await this.herdsman.start();
            this.herdsmanStarted = true;
            const cv = await this.herdsman.getCoordinatorVersion();
            const MetaSt = `${cv.meta.transportrev ? cv.meta.transportrev : 'X'}-${cv.meta.product ? cv.meta.product : 'X'}.${cv.meta.majorrel ? cv.meta.majorrel : 'X'}.${cv.meta.minorrel ? cv.meta.minorrel : 'X'}.${cv.meta.maintrel ? cv.meta.maintrel : 'X'}`;
            const msg = `Zigbee-Herdsman started successfully with Coordinator firmware version: ${cv.type} : ${cv.meta.revision ? cv.meta.revision : ''} (${MetaSt})`;
            this.emit('pairing',msg)
            this.info(msg);

            // debug info from herdsman getNetworkParameters
            const debNetworkParam = JSON.parse(JSON.stringify(await this.herdsman.getNetworkParameters()));
            const extendedPanIDDebug = typeof debNetworkParam.extendedPanID === 'string' ? debNetworkParam.extendedPanID.replace('0x', '') : debNetworkParam.extendedPanID;

            this.emit('pairing',`Network parameters: panID=${debNetworkParam.panID} channel=${debNetworkParam.channel} extendedPanID=${this.reverseIEEE(extendedPanIDDebug)}`);
            if (this.debugActive) this.debug(`Network parameters: panID=${debNetworkParam.panID} channel=${debNetworkParam.channel} extendedPanID=${this.reverseIEEE(extendedPanIDDebug)}`);
        } catch (e) {
            try {
                const debNetworkParam = JSON.parse(JSON.stringify(await this.herdsman.getNetworkParameters()));
                const extendedPanIDDebug = typeof debNetworkParam.extendedPanID === 'string' ? debNetworkParam.extendedPanID.replace('0x', '') : debNetworkParam.extendedPanID;

                const configParameters = `Network parameters in Config     : panID=${this.herdsmanLogSettings.panID} channel=${this.herdsmanLogSettings.channel} extendedPanID=${this.reverseIEEE(this.herdsmanLogSettings.extendedPanID)}`;
                const networkParameters = `Network parameters on Coordinator: panID=${debNetworkParam.panID} channel=${debNetworkParam.channel} extendedPanID=${this.reverseIEEE(extendedPanIDDebug)}`;
                this.emit('pairing',configParameters)
                this.emit('pairing',networkParameters);
                this.warn(configParameters)
                this.warn(networkParameters);
            }
            catch (error) {
                this.emit('pairing',`Unable to obtain herdsman settings`);
                this.info(`Unable to obtain herdsman settings`)
            }
            try {
                await this.herdsman.stop();
            }
            catch (error) {
                this.emit('pairing','unable to stop zigbee-herdsman after failed startup');
                this.warn('unable to stop zigbee-herdsman after failed startup');
            }
            this.sendError(e);
            const msg = `Starting zigbee-herdsman problem : ${(e && e.message ? e.message : 'no error message')}`
            this.error(msg);
            this.emit('pairing', msg);
            throw 'Error herdsman start';
        }
        // Check if we have to turn off the LED
        try {
            if (this.disableLed) {
                this.info('Disable LED');
                await this.herdsman.setLED(false);
            } else {
                await this.herdsman.setLED(true);
            }
        } catch (e) {
            this.info('Unable to disable LED, unsupported function.');
            this.emit('pairing','Unable to disable LED, unsupported function.');
        }

        const deviceIterator = this.getClientIterator();
        let deviceCount = 0;
        try {
            //this.emit('pairing','identifying connected devices')
            for (const device of deviceIterator) {
                deviceCount++;
                // get the model description for the known devices
                const entity = await this.resolveEntity(device);
                if (!entity) {
                    this.warn('failed to resolve Entity for ' + device.ieeeAddr);
                    //this.emit('pairing','failed to resolve Entity for ' + device.ieeeAddr)
                    continue;
                }
                //await this.adapter.stController.AddModelFromHerdsman(device, entity.mapped.model);

                this.adapter.getObject(device.ieeeAddr.substr(2), (err, obj) => {
                    if (obj && obj.common && obj.common.deactivated) {
                        this.callExtensionMethod('deregisterDevicePing', [device, entity]);
                    } else {
                        this.callExtensionMethod('registerDevicePing', [device, entity]);
                    }
                });
                // ensure that objects for all found clients are present

                if (entity.mapped) {
                    this.emit('new', entity);
                }
                const msg = (entity.device.ieeeAddr +
                    ` (addr ${entity.device.networkAddress}): ` +
                    (entity.mapped ? `${entity.mapped.model} - ${entity.mapped.vendor} ${entity.mapped.description} ` : `Unsupported (model ${entity.device.modelID})`) +
                    `(${entity.device.type})`);
                //this.emit('pairing',msg);
                this.info(msg);
            }

            // Log zigbee clients on startup
            // const devices = await this.getClients();
            if (deviceCount > 0) {
                this.info(`Currently ${deviceCount} devices are joined:`);
                this.emit('pairing',`Currently ${deviceCount} devices are joined:`)
            } else {
                this.info(`No devices are currently joined.`);
                this.emit('pairing',`No devices are currently joined.`);
            }
            this.callExtensionMethod('onZigbeeStarted', []);
        }
        catch (error) {
            const msg = 'error iterating devices : '+ (error && error.message ? error.message: 'no reason given');
            this.error(msg);
            this.emit('pairing',msg);
        }
        try {
            this.getGroups();
        }
        catch (error) {
            const msg = 'error iterating groups : '+ (error && error.message ? error.message: 'no reason given');
            this.error(msg);
            this.emit('pairing',msg);
        }
        this.emit('ready');
    }

    info(message, data) {
        this.emit('log', 'info', message, data);
    }

    error(message, data) {
        this.emit('log', 'error', message, data);
    }

    debug(message, data) {
        this.emit('log', 'debug', message, data);
    }

    warn(message, data) {
        this.emit('log', 'warn', message, data);
    }

    event(type, dev, message, data) {
        this.emit('event', type, dev, message, data);
    }

    sendError(error, message) {
        this.adapter.sendError(error, message);
    }

    filterHerdsmanError(message) {
        if (typeof message != 'string' || message == '') return 'no error message';
        if (message.match(this.herdsmanTimeoutRegexp)) return 'Timeout';
        return message;
    }

    callExtensionMethod(method, parameters) {
        const result = [];
        for (const extension of this.extensions) {
            if (extension[method]) {
                try {
                    if (parameters !== undefined) {
                        result.push(extension[method](...parameters));
                    } else {
                        result.push(extension[method]());
                    }
                } catch (error) {
                    this.sendError(error);
                    this.error(`Failed to call '${extension.constructor.name}' '${method}' (${error.stack})`);
                }
            }
        }
        return Promise.all(result);
    }

    async getClients(all) {
        if (this.herdsman.database) {
            const devices = await this.herdsman.getDevices();
            if (all) {
                return devices;
            } else {
                return devices.filter(device => device.type !== 'Coordinator');
            }
        } else {
            return [];
        }
    }

    getClientIterator(all) {
        if (this.herdsman.database) {
            return this.herdsman.getDevicesIterator( function(device) { return (all? true: device.type !== 'Coordinator')});
        } else {
            return [].values();
        }
    }

    async getGroups() {
        try {
            if (this.herdsman) {
                const rv = [];
                const groupIterator =  this.herdsman.getGroupsIterator();
                for (const g of groupIterator) {
                    const members = await this.getGroupMembersFromController(g.groupID);
                    rv.push({ id: g.groupID, size: (members ? members.length : 0), stateName: 'group_'+g.groupID});
                }
                return rv;
            } else {
                return null;
            }
        } catch (error) {
            this.sendError(error);
            this.error(JSON.stringify(error));
            return undefined;
        }
    }

    async removeGroupById(id) {
        const group = await this.getGroupByID(Number(id));
        try {
            group && group.removeFromNetwork();
        } catch (error) {
            this.sendError(error);
            this.error(`error in removeGroupById: ${error}`);
        }
    }

    async getGroupByID(id) {
        try {
            const rv = this.herdsman.getGroupByID(id);
            return rv;
        } catch (error) {
            this.sendError(error);
            // this.error('error getting group for ' + id + ' ' + (error && error.message ? error.message : 'without message'));
            return undefined;
        }
    }

    async verifyGroupExists(id) {
        try {
            const nid = typeof id === 'number' ? id : parseInt(id);
            let group = await this.herdsman.getGroupByID(nid);
            if (!group) {
                group = await this.herdsman.createGroup(nid);
                group.toZigbee = groupConverters;
                group.model = 'group';
                if (this.debugActive) this.debug(`verifyGroupExists: created group ${nid}`);
            } else {
                if (this.debugActive) this.debug(`verifyGroupExists: group ${nid} exists`);
            }
            return group
        }
        catch (error) {
            this.error(`verifyGroupExists: ${error && error.message ? error.message : 'unspecified error'}`);
        }
    }

    async rebuildGroupIcon(grp) {
        const g = (typeof grp === 'number') ? this.herdsman.getGroupByID(grp) : grp;
        if (typeof g === 'object' && g.groupID)
        {
            const members = await this.getGroupMembersFromController(g.groupID);
            return `img/group_${members.length}.png`
        }
        return 'img/group_x.png';
    }

    async addPairingCode(code) {
        if (this.debugActive) this.debug(`calling addPairingCode with ${code}`);
        if (code) {
            try {
                await this.herdsman.addInstallCode(code);
                this.info(`added code ${code} for pairing`);
                return true;
            }
            catch (error) {
                this.error(`addPairingCode: ${error && error.message ? error.message : 'unspecified error'}`);
            }
        }
        return false;
    }

    async getGroupMembersFromController(id) {
        const members = [];
        try {
            const group = await this.getGroupByID(Number(id));
            if (group) {
                const groupMembers = group.members;
                for (const member of groupMembers) {
                    const epid = member.ID ? member.ID : -1;
                    const nwk = member.deviceNetworkAddress;
                    const device = this.getDeviceByNetworkAddress(nwk);
                    if (device && device.ieeeAddr) {
                        members.push({
                            ieee: device.ieeeAddr,
                            model: device.modelID,
                            epid,
                            ep: member
                        });
                    }
                }
            } else {
                return undefined;
            }
        } catch (error) {
            this.sendError(error);
            if (error) {
                this.error(`getGroupMembersFromController: ${(error && error.message ? error.message : 'no error message')} ${(error && error.stack ? error.stack : 'no call stack')}`);
            } else {
                this.error('unidentified error in getGroupMembersFromController');
            }
        }
        return members;
    }

    getDevice(key) {
        try {
            return this.herdsman.getDeviceByIeeeAddr(key);
        }
        catch (error) {
            this.error(`getDeviceByIeeeAddr: ${(error && error.message ? error.message : 'no error message')}`);
            return undefined;
        }
    }

    getDevicesByType(type) {
        try {
            return this.herdsman.getDevicesByType(type);
        }
        catch (error) {
            this.error(`getDevicesByType: ${(error && error.message ? error.message : 'no error message')}`);
            return undefined;
        }
    }

    getDeviceByNetworkAddress(networkAddress) {
        try {
            return this.herdsman.getDeviceByNetworkAddress(networkAddress);
        }
        catch (error) {
            this.error(`getDeviceByNetworkAddress: ${(error && error.message ? error.message : 'no error message')}`);
            return undefined;
        }
    }

    async analyzeKey(key) {
        const rv = {
            kind: 'device',
            key: key,
            message: 'success'
        }
        if (typeof key === 'object') return rv;
        if (typeof key === 'number') {
            rv.kind = 'group';
            return rv;
        }
        if (typeof key === 'string') {
            if (key === 'coordinator') {
                rv.kind = 'coordinator'
                return rv;
            };
            const kp = key.split('_');
            if (kp[0] === 'group' && kp.length > 1) {
                rv.kind = 'group';
                rv.key = Number(kp[1]);
                return rv;
            }
            if (key.startsWith('0x')) {
                rv.kind = 'ieee'
                return rv;
            };
            if (key.trim().length === 16) {
                rv.key = `0x${key.trim()}`
                rv.kind = 'ieee';
                return rv;
            };
        }
        rv.message = 'failed';
        return rv;
    }

    async resolveEntity(key, ep) {
        // this.warn('resolve entity with key of tyoe ' + typeof (key));
        try {
            const _key = await this.analyzeKey(key);
            if (_key.message !== 'success') return undefined;

            if (_key.kind == 'coordinator') {
                const coordinator = this.herdsman.getDevicesByType('Coordinator')[0];
                return {
                    type: 'device',
                    device: coordinator,
                    endpoint: coordinator.getEndpoint(1),
                    name: 'Coordinator',
                };
            }
            if (_key.kind === 'group') {
                let group = await this.herdsman.getGroupByID(_key.key);
                if (!group) group = await this.herdsman.createGroup(_key.key);
                group.toZigbee = groupConverters;
                group.model = 'group';
                return {
                    type: 'group',
                    mapped: group,
                    group,
                    name: `Group ${_key.key}`,
                };

            }
            if (_key.kind === 'ieee') _key.key = await this.herdsman.getDeviceByIeeeAddr(_key.key);
            const device = _key.key;
            if (device) {
                const t = Date.now();
                const mapped = await zigbeeHerdsmanConverters.findByDevice(device);
                const endpoints = mapped && mapped.endpoint ? mapped.endpoint(device) : null;
                let endpoint;
                if (endpoints && ep != undefined && endpoints[ep]) {
                    endpoint = device.getEndpoint(endpoints[ep]);
                } else if (endpoints && endpoints['default']) {
                    endpoint = device.getEndpoint(endpoints['default']);
                } else {
                    const epNum = parseInt(ep);
                    if (!isNaN(epNum)) {
                        endpoint = device.getEndpoint(epNum);
                    } else {
                        endpoint = device.endpoints[0];
                    }
                }
                return {
                    type: 'device',
                    device,
                    mapped,
                    endpoint,
                    endpoints: device.endpoints,
                    name: device._ieeeAddr,
                };
            }
        }
        catch (error)
        {
            this.error('Resolve entity error: ' + (error && error.message ? error.message : 'no reason given'))
        }
        return undefined;
    }

    async incMsgHandler(message) {
        try {
            if (this.debugActive) this.debug('incoming msg', message);
            const device = await this.herdsman.getDeviceByIeeeAddr(message.srcaddr);
            if (!device) {
                if (this.debugActive) this.debug('Message without device!');
                return;
            }
            // We can't handle devices without modelId.
            if (!device.modelId) {
                if (this.debugActive) this.debug('Message without modelId!');
                return;
            }
            this.event('msg', device.ieeeAddr, message, {
                modelId: device.modelId
            });
        }
        catch (error) {
            this.error('incMsgHandler: ' + (error && error.message ? error.message : 'no error message'));
        }
    }

    // Stop controller
    async stop() {
        // Call extensions
        try {
            await this.callExtensionMethod('stop', []);
        }
        catch (error) {
            this.error('unable to call extension Method stop: ' + (error && error.message ? error.message : 'no error message'));
        }

        try {
            if (this.HerdsmanStarted) await this.permitJoin(0);
            await this.herdsman.stop();
            this.HerdsmanStarted = false;
            this.info('zigbecontroller stopped successfully');
        } catch (error) {
            this.sendError(error);
            if (this.herdsmanStarted) {
                this.error(`Failed to stop zigbee (${error.stack})`);
            } else {
                this.warn(`Failed to stop zigbee during startup`);
            }
        }
    }

    async handleDisconnected() {
        this.herdsmanStarted = false;
        this.emit('disconnect');
    }

    connected() {
        return this.herdsmanStarted;
    }

    // Permit join
    async permitJoin(permitTime, devid, failure) {
        try {
            this._permitJoinTime = permitTime;
            await this.herdsman.permitJoin(permitTime);
        } catch (e) {
            this.sendError(e);
            this.error(`Failed to open the network: ${e.stack}`);
        }
    }

    async handlePermitJoinChanged(data)
    {
        try {
            if (this.debugActive) this.debug(`Event handlePermitJoinChanged received with ${JSON.stringify(data)}`);
            if (data.permitted) {
                if (!this._permitJoinInterval) {
                    this.emit('pairing',`Pairing possible for ${this._permitJoinTime} seconds`)
                    this.info(`Opening zigbee Network for ${this._permitJoinTime} seconds`)
                    this._permitJoinInterval = setInterval(async () => {
                        this.emit('pairing', 'Pairing time left', this._permitJoinTime);
                        this._permitJoinTime -= 1;
                    }, 1000);
                }
            }
            else {
                this.info(`Closing Zigbee network, ${this._permitJoinTime} seconds remaining`)
                clearInterval(this._permitJoinInterval);
                this._permitJoinInterval = null;
                // this.emit('pairing', 'Pairing time left', 0);
                this.emit('pairing', 'Closing network.',0);
            }
        }
        catch (error) {
            this.error(`Error in handlePermitJoinChanged:  ${error.message}`);
        }
    }

    // Remove device
    async remove(deviceID, force, callback) {
        try {
            const device = this.herdsman.getDeviceByIeeeAddr(deviceID);
            if (device) {
                try {
                    await device.removeFromNetwork();
                    //this.herdsman.adapter.removeDevice(device.networkAddress, device.ieeeAddr);
                } catch (error) {
                    this.sendError(error);
                    if (error)
                        if (this.debugActive) this.debug(`Failed to remove device. If device is remove is all fine, when not use Force remove`);
                    // skip error if force
                    if (!force) {
                        throw error;
                    } else {
                        if (this.debugActive) this.debug(`Force remove`);
                    }
                }

                try {
                    device.removeFromDatabase();
                } catch (error) {
                    this.sendError(error);
                    // skip error
                    if (error)
                        if (this.debugActive) this.debug(`Failed to remove from DB ${error.stack}`);
                }
                if (this.debugActive) this.debug('Remove successful.');
                callback && callback();
                this.callExtensionMethod(
                    'onDeviceRemove',
                    [device],
                );
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to remove ${error.stack}`);
            callback && callback(`Failed to remove ${error.stack}`);
        }
    }

    // Zigbee events
    async handleDeviceLeave(message) {
        try {
            if (this.debugActive) this.debug('handleDeviceLeave', message);
            const entity = await this.resolveEntity(message.device || message.ieeeAddr);
            const friendlyName = entity ? entity.name : message.ieeeAddr;
            if (this.adapter.stController.checkDebugDevice(friendlyName)) {
                this.emit('device_debug', {ID: Date.now(), data: {flag:'dl', states:[{id: '--', value:'--', payload:message}], IO:true},message:`Device '${friendlyName}' has left the network`});
            }
            else
                this.info(`Device '${friendlyName}' left the network`);
            this.emit('leave', message.ieeeAddr);
            // Call extensions
            this.callExtensionMethod(
                'onDeviceLeave',
                [message, entity],
            );
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to handleDeviceLeave ${error && error.message ? error.message : 'no error message given'}`);
        }
    }

    async handleDeviceAnnounce(message) {
        if (this.debugActive) this.debug('handleDeviceAnnounce', message);
        const entity = await this.resolveEntity(message.device || message.ieeeAddr);
        const friendlyName = entity.name;
        if (this.adapter.stController.checkDebugDevice(friendlyName)) {
            this.emit('device_debug', {ID: Date.now(), data: {flag:'da', states:[{id: '--', value:'--', payload:message}] , IO:true} ,message:`Device '${friendlyName}' announced itself`});
        }
        else if (this.warnOnDeviceAnnouncement) {
            this.warn(`Device '${friendlyName}' announced itself`);
        } else {
            this.info(`Device '${friendlyName}' announced itself`);
        }

        try {
            if (entity && entity.mapped) {
                this.callExtensionMethod(
                    'onZigbeeEvent',
                    [{'device': message.device, 'type': 'deviceAnnounce'}, entity ? entity.mapped : null]);
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to handleDeviceLeave ${error.stack}`);
        }

        this.emit('pairing', `Device '${friendlyName}' announced itself`);
        if (!this.herdsman.getPermitJoin()) {
            this.callExtensionMethod('registerDevicePing', [message.device, entity]);
        }
        // if has modelID so can create device
        if (entity.device && entity.device._modelID) {
            entity.device.modelID = entity.device._modelID;
            this.emit('new', entity);
        }
    }

    async handleDeviceJoined(message) {
        if (this.debugActive) this.debug('handleDeviceJoined', message);
        //const entity = await this.resolveEntity(message.device || message.ieeeAddr);
        //this.emit('new', entity);
    }

    async handleDeviceInterview(message) {
        if (this.debugActive) this.debug('handleDeviceInterview', message);
        // safeguard: We do not allow to start an interview if the network is not opened
        if (message.status === 'started' && !this.herdsman.getPermitJoin()) {
            this.warn(`Blocked interview for '${message.ieeeAddr}' because the network is closed`);
            return;
        }
        try {
            const entity = await this.resolveEntity(message.device || message.ieeeAddr);
            const friendlyName = entity.name;
            if (message.status === 'successful') {
                this.info(`Successfully interviewed '${friendlyName}', device has successfully been paired`);

                if (entity.mapped) {
                    const {vendor, description, model} = entity.mapped;
                    this.info(
                        `Device '${friendlyName}' is supported, identified as: ${vendor} ${description} (${model})`
                    );

                    const log = {friendly_name: friendlyName, model, vendor, description, supported: true};
                    this.emit('pairing', 'Interview successful', JSON.stringify(log));
                    entity.device.modelID = entity.device._modelID;
                    this.emit('new', entity);
                    // send to extensions again (for configure)
                    this.callExtensionMethod(
                        'onZigbeeEvent',
                        [message, entity ? entity.mapped : null],
                    );
                } else {
                    if (this.debugActive) this.debug(
                        `Device '${friendlyName}' with Zigbee model '${message.device.modelID}' is NOT supported, ` +
                        `please follow https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`
                    );
                    const frName = {friendly_name: friendlyName, supported: false};
                    this.emit('pairing', 'Interview successful', JSON.stringify(frName));
                    entity.device.modelID = entity.device._modelID;
                    this.emit('new', entity);
                }
            } else if (message.status === 'failed') {
                this.error(`Failed to interview '${friendlyName}', device has not successfully been paired. Try again !!!!!!!!!! `);
                //this.error(`Failed to interview '${friendlyName}', device has not successfully been paired. Try again !!!!!!!!!! ${message.error}`);
                this.emit('pairing', 'Interview failed', friendlyName);
            } else {
                if (message.status === 'started') {
                    this.info(`Starting interview of '${friendlyName}'`);
                    this.emit('pairing', 'Interview started', friendlyName);
                }
            }
        }
        catch (error) {
            this.error('handleDeviceInterview: ' + (error && error.message ? error.message : 'no error message'));
        }
    }

    async handleMessage(data) {
        if (this.debugActive) this.debug(`handleMessage`, data);
        const entity = await this.resolveEntity(data.device || data.ieeeAddr);
        const name = (entity && entity._modelID) ? entity._modelID : data.device.ieeeAddr;
        if (this.debugActive) this.debug(
            `Received Zigbee message from '${name}', type '${data.type}', cluster '${data.cluster}'` +
            `, data '${JSON.stringify(data.data)}' from endpoint ${data.endpoint.ID}` +
            (data.hasOwnProperty('groupID') ? ` with groupID ${data.groupID}` : ``)
        );
        this.event(data.type, entity, data);

        // Call extensions
        this.callExtensionMethod(
            'onZigbeeEvent',
            [data, entity ? entity.mapped : null],
        );
    }

    async getMap(callback) {
        try {
            this.info('Collecting Map Data');
            const devices = this.herdsman.getDevices(true);
            const lqis = [];
            const routing = [];
            const errors = [];

            await Promise.all(devices.filter((d) => d.type !== 'EndDevice').map(async device =>
            {
                let resolved = await this.resolveEntity(device, 0);
                if (!resolved) {
                    resolved = { name:'unresolved device', device:device }
                    if (this.debugActive) this.debug('resolve Entity failed for ' + device.ieeeAddr)
                }
                let result;

                try {
                    result = await device.lqi();
                } catch (error) {
                    errors.push(`Failed to execute LQI for '${resolved ? resolved.name : 'unresolved device'} (${resolved ? resolved.device.modelID : 'unknown'}') : ${this.filterHerdsmanError(error.message)}.`);
                    lqis.push({
                        parent: 'undefined',
                        networkAddress: 0,
                        ieeeAddr: device.ieeeAddr,
                        lqi: 'undefined',
                        relationship: 0,
                        depth: 0,
                        status: 'offline',
                    });
                }

                if (result !== undefined) {
                    for (const dev of result.neighbors) {
                        if (dev !== undefined && dev.ieeeAddr !== '0xffffffffffffffff') {
                            lqis.push({
                                parent: (resolved ? resolved.device.ieeeAddr : undefined),
                                networkAddress: dev.networkAddress,
                                ieeeAddr: dev.ieeeAddr,
                                lqi: dev.linkquality,
                                relationship: dev.relationship,
                                depth: dev.depth,
                                status: dev.linkquality > 0 ? 'online' : 'offline',
                            });
                        }
                    }
                }

                try {
                    result = await device.routingTable();
                } catch (error) {
                    if (error) {
                        errors.push(`Failed to collect routing table for '${resolved ? resolved.name : 'unresolved device'} (${resolved ? resolved.device.modelID : 'unknown'}') : ${this.filterHerdsmanError(error.message)}`);
                    }
                }

                if (result !== undefined) {
                    if (result.table !== undefined) {
                        for (const dev of result.table) {
                            routing.push({
                                source: resolved.device.ieeeAddr,
                                destination: dev.destinationAddress,
                                nextHop: dev.nextHop,
                                status: dev.status,
                            });
                        }
                    }
                }
            }
            ));

            callback && callback({lqis, routing, errors});
            if (errors.length) {
                if (this.debugActive) this.debug(`Map Data collection complete with ${errors.length} issues:`);
                for (const msg of errors)
                    if (this.debugActive) this.debug(msg);
            }
            else
                this.info('Map data collection complete');
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to get map: ${safeJsonStringify(error.stack)}`);
        }
    }


    async publish(deviceID, cid, cmd, zclData, cfg, ep, type, callback, zclSeqNum) {
        const entity = await this.resolveEntity(deviceID, ep);
        const device = entity.device;
        const endpoint = entity.endpoint;
        if (!device) {
            this.error(
                `Zigbee cannot publish message to device because '${deviceID}' is not known`
            );
            return;
        }
        if (!endpoint) {
            this.error(
                `Zigbee cannot publish message to endpoint because '${ep}' is not known`
            );
            return;
        }

        if (this.debugActive) this.debug(`Zigbee publish to '${deviceID}', ${cid} - cmd ${cmd} - payload ${JSON.stringify(zclData)} - cfg ${JSON.stringify(cfg)} - endpoint ${ep}`);

        if (cfg == null) {
            cfg = {};
        }

        try {

            if (type === 'foundation') {
                cfg.disableDefaultResponse = true;
                let result;
                if (cmd === 'configReport') {
                    result = await endpoint.configureReporting(cid, zclData, cfg);
                } else {
                    if (cmd === 'read' && !Array.isArray(zclData))
                        result = await endpoint[cmd](cid, Object.keys(zclData), cfg);
                    else
                        result = await endpoint[cmd](cid, zclData, cfg);
                }
                callback && callback(undefined, result);
            } else if (type === 'functionalResp') {
                cfg.disableDefaultResponse = false;
                const result = await endpoint.commandResponse(cid, cmd, zclData, cfg, zclSeqNum);
                callback && callback(undefined, result);
            } else {
                cfg.disableDefaultResponse = false;
                const result = await endpoint.command(cid, cmd, zclData, cfg);
                callback && callback(undefined, result);
            }
        }
        catch (error)
        {
            this.log.error(`error sending ${type} ${cmd} to endpoint: ${(error && error.message ? error.message : 'no error message')} ${(error && error.stack ? error.stack : 'no call stack')}`)
        }

    }

    async addDevToGroup(devId, groupId, epid) {
        try {
            if (this.debugActive) this.debug(`called addDevToGroup with ${devId}, ${groupId}, ${epid}`);
            const entity = await this.resolveEntity(devId);
            const group = await this.resolveEntity(groupId);
            if (this.debugActive) this.debug(`addDevFromGroup - entity: ${utils.getEntityInfo(entity)}`);
            // generate group debug info and display it
            const members = await this.getGroupMembersFromController(groupId);
            const memberIDs = [];
            for (const member of members) {
                memberIDs.push(member.ieee);
            }
            if (this.debugActive) this.debug(`addDevToGroup ${groupId} with ${memberIDs.length} members ${safeJsonStringify(memberIDs)}`);
            if (epid != undefined) {
                for (const ep of entity.endpoints) {
                    if (this.debugActive) this.debug(`checking ep ${ep.ID} of ${devId} (${epid})`);
                    if (ep.ID == epid) {
                        if (ep.inputClusters.includes(4) || ep.outputClusters.includes(4)) {
                            if (this.debugActive) this.debug(`adding endpoint ${ep.ID} (${epid}) to group ${groupId}`);
                            await (ep.addToGroup(group.mapped));
                        }
                        else this.error(`cluster genGroups not supported for endpoint ${epid} of ${devId}`);
                    }
                }
            } else {
                if (entity.endpoint.inputClusters.includes(4)) {
                    this.info(`adding endpoint ${entity.endpoint.ID} of ${devId} to group`);
                    await entity.endpoint.addToGroup(group.mapped);
                } else {
                    let added = false;
                    for (const ep of entity.endpoints) {
                        if (ep.inputClusters.includes(4)) {
                            await ep.addToGroup(group.mapped);
                            added = true;
                            break;
                        }
                    }
                    if (!added) {
                        throw ('cluster genGroups not supported');
                    }
                }
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Exception when trying to Add ${devId}  to group ${groupId}`, error);
            return {error: `Failed to add ${devId}  to group ${groupId}: ${JSON.stringify(error)}`};
        }
        return {};
    }

    async removeDevFromGroup(devId, groupId, epid) {
        if (this.debugActive) this.debug(`removeDevFromGroup with ${devId}, ${groupId}, ${epid}`);
        let entity;
        try {
            entity = await this.resolveEntity(devId);
            const group = await this.resolveEntity(groupId);

            if (epid != undefined) {
                for (const ep of entity.endpoints) {
                    if (this.debugActive) this.debug(`checking ep ${ep.ID} of ${devId} (${epid})`);
                    if (ep.ID == epid && (ep.inputClusters.includes(4) || ep.outputClusters.includes(4))) {
                        await ep.removeFromGroup(group.mapped);
                        this.info(`removing endpoint ${ep.ID} of ${devId} from group ${groupId}`);
                    }
                }
            } else {
                await entity.endpoint.removeFromGroup(group.mapped);
                this.info(`removing endpoint ${entity.endpoint.ID} of ${devId} from group ${groupId}`);
            }

        } catch (error) {
            this.sendError(error);
            this.error(`Exception when trying remove ${devId} (ep ${epid ? epid : (entity ? entity.endpoint.ID : '')}) from group ${devId}`, error);
            return {error: `Failed to remove dev ${devId} (ep ${epid ? epid : (entity ? entity.endpoint.ID : '')}) from group ${devId}`};
        }
        return {};
    }

    async removeDevFromAllGroups(devId) {
        try {
            const entity = await this.resolveEntity(devId);
            if (this.debugActive) this.debug(`entity: ${safeJsonStringify(entity)}`);
            for (const ep of entity.endpoints) {
                if (ep.inputClusters.includes(4) || ep.outputClusters.includes(4)) {
                    await ep.removefromAllGroups();
                }
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Exception when trying remove ${devId} from all groups`, error);
            return {error: `Failed to remove dev ${devId} from all groups: ${error}`};
        }
        return {};
    }

    bind(ep, cluster, target, callback) {
        const log = ` ${ep.device.ieeeAddr} - ${cluster}`;
        target = !target ? this.getCoordinator() : target;

        if (this.debugActive) this.debug(`Binding ${log}`);
        try {
            ep.bind(cluster, target, error => {
                if (error) {
                    this.sendError(error);
                    this.error(`Failed to bind ${log} - (${error})`);
                } else {
                    if (this.debugActive) this.debug(`Successfully bound ${log}`);
                }

                callback(error);
            });
        }
        catch (error) {
            callback(error)
        }
    }

    unbind(ep, cluster, target, callback) {
        const log = ` ${ep.device.ieeeAddr} - ${cluster}`;
        target = !target ? this.getCoordinator() : target;

        if (this.debugActive) this.debug(`Unbinding ${log}`);
        try {
            ep.unbind(cluster, target, (error) => {
                if (error) {
                    this.error(`Failed to unbind ${log} - (${error})`);
                } else {
                    if (this.debugActive) this.debug(`Successfully unbound ${log}`);
                }

                callback(error);
            });
        }
        catch (error) {
            callback (error)
        }
    }

    reset(mode, callback) {
        try {
            this.herdsman.reset(mode);
            callback && callback();
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to reset ${error.stack}`);
            callback && callback(error);
        }
    }

    async touchlinkReset(permitTime) {
        try {
            await this.herdsman.touchlinkFactoryResetFirst();
            this.permitJoin(permitTime);
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to touchlinkReset ${error.stack}`);
        }
    }

    async getChannelsEnergy() {
        const clusterId = ZDO.ClusterId.NWK_UPDATE_REQUEST;
        const result = {};
        try
        {
            const payload = ZDO.Buffalo.buildRequest(false, clusterId, [11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26], 0x05, 1, 0, undefined);
            const scanresult = await this.herdsman.adapter.sendZdo(0x0, 0x0, clusterId , payload, false);
            if (this.debugActive) this.debug(`scanresult is  ${JSON.stringify(scanresult)}`)
            result.energyvalues = scanresult[1].entryList;
            if (this.debugActive) this.debug(`result is  ${JSON.stringify(result)}`)
        }
        catch (error) {
            this.sendError(error);
            this.error(`Failed to scan channels ${error.stack}`);
            result.error = error;

        }
        return result;

    }
}

module.exports = ZigbeeController;
