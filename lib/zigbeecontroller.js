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
const utils = require('./utils');
const { waitForDebugger } = require('inspector');
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
        this.herdsmanStarted = false;
        this.extensions = [
            new DeviceAvailabilityExt(this, {}),
            new DeviceConfigureExt(this, {}),
            new DeviceEventExt(this, {}),
            new DelayedActionExt(this, {}),
        ];
    }

    configure(options) {
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
                path: options.sp.port,
                adapter: options.sp.adapter,
            },
            adapter: {
                forceStartWithInconsistentAdapterConfiguration: options.startWithInconsistent
            },
            legacy : false,

        };
        // https://github.com/ioBroker/ioBroker.zigbee/issues/668
        if (!options.extPanIdFix) {
            delete herdsmanSettings.network.extendedPanID;
            herdsmanSettings.network.extenedPanID = options.net.extPanId;
        }

        if (options.transmitPower == undefined) {
            this.transmitPower = 0;
        } else {
            this.transmitPower = options.transmitPower;
        }
        this.disableLed = options.disableLed;
        this.warnOnDeviceAnnouncement = options.warnOnDeviceAnnouncement;

        this.debug(`Using zigbee-herdsman with settings: ${JSON.stringify(herdsmanSettings)}`);
        this.herdsman = new ZigbeeHerdsman.Controller(herdsmanSettings, this.adapter.log);
        this.callExtensionMethod('setOptions', [{
            disableActivePing: options.disablePing,
            disableForcedPing: false,
            pingTimeout: 300,
            pingCount: 3
        }]);
    }

    // Start controller
    async start() {
        try {
            //this.debug(`Using zigbee-herdsman with settings2: ${JSON.stringify(this)}`);
            this.debug(`Starting zigbee-herdsman...`);

            // install event handlers before start
            this.herdsman.on('adapterDisconnected', this.handleDisconnected.bind(this));
            this.herdsman.on('deviceAnnounce', this.handleDeviceAnnounce.bind(this));
            this.herdsman.on('deviceInterview', this.handleDeviceInterview.bind(this));
            this.herdsman.on('deviceJoined', this.handleDeviceJoined.bind(this));
            this.herdsman.on('deviceLeave', this.handleDeviceLeave.bind(this));
            this.herdsman.on('message', this.handleMessage.bind(this));
            this.herdsman.on('permitJoinChanged', this.handlePermitJoinChanged.bind(this));

            await this.herdsman.start();

            this.debug('zigbee-herdsman started');
            this.herdsmanStarted = true;
            this.info(`Coordinator firmware version: ${JSON.stringify(await this.herdsman.getCoordinatorVersion())}`);

            // debug info from herdsman getNetworkParameters
            const debNetworkParam = JSON.parse(JSON.stringify(await this.herdsman.getNetworkParameters()));
            const extendedPanIDDebug = typeof debNetworkParam.extendedPanID === 'string' ? debNetworkParam.extendedPanID.replace('0x', '') : debNetworkParam.extendedPanID;

            let extPanIDDebug = '';
            for (let i = extendedPanIDDebug.length - 1; i >= 0; i--) {
                extPanIDDebug += extendedPanIDDebug[i - 1];
                extPanIDDebug += extendedPanIDDebug[i];
                i--;
            }

            this.info(`Zigbee network parameters: panID=${debNetworkParam.panID} channel=${debNetworkParam.channel} extendedPanID=${extPanIDDebug}`);
        } catch (e) {
            try {
                await this.herdsman.stop();
            }
            catch (error) {
                this.warn(`Starting zigbee-herdsman problem : ${error && error.message ? error.message : 'no error message'}`)
            }
            this.sendError(e);
            this.error(`Starting zigbee-herdsman problem : ${JSON.stringify(e.message)}`);
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
            this.sendError(e);
        }

        // only for CC1352P and CC26X2R1 transmit power
        let powerText = 'normal';

        if (this.transmitPower != '0') {
            switch (this.transmitPower) {
                case '-22':
                    powerText = 'low';
                    break;
                case '19':
                    powerText = 'high';
                    break;
                case '20':
                    powerText = 'high+';
                    break;
                default:
                    powerText = 'normal';
            }
        }


        this.info(`  --> transmitPower : ${powerText}`);
        try {
            await this.herdsman.setTransmitPower(this.transmitPower);
        } catch (e) {
            this.sendError(e);
            this.info('Unable to set transmit power, unsupported function.');
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

    async getGroups() {
        try {
            if (this.herdsman) {
                return await this.herdsman.getGroups();
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
            return this.herdsman.getGroupByID(id);
        } catch (error) {
            this.sendError(error);
            return undefined;
        }
    }

    async verifyGroupExists(id) {
        const nid = typeof id === 'number' ? id : parseInt(id);
        let group = await this.herdsman.getGroupByID(nid);
        if (!group) {
            group = await this.herdsman.createGroup(nid);
            group.toZigbee = groupConverters;
            group.model = 'group';
            this.debug(`verifyGroupExists: created group ${nid}`);
        } else {
            this.debug(`verifyGroupExists: group ${nid} exists`);
        }
    }

    async addPairingCode(code) {
        this.debug(`calling addPairingCode with ${code}`);
        if (code) {
            await this.herdsman.addInstallCode(code);
            this.info(`added code ${code} for pairing`);
            return true;
        }
        return false;
    }

    async getGroupMembersFromController(id) {
        const members = [];
        try {
            const group = await this.getGroupByID(id);
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
                this.error(`getGroupMembersFromController: error is  ${JSON.stringify(error)} ${JSON.stringify(new Error().stack)}`);
            } else {
                this.error('unidentified error in getGroupMembersFromController');
            }
        }
        return members;
    }

    getDevice(key) {
        return this.herdsman.getDeviceByIeeeAddr(key);
    }

    getDevicesByType(type) {
        return this.herdsman.getDevicesByType(type);
    }

    getDeviceByNetworkAddress(networkAddress) {
        return this.herdsman.getDeviceByNetworkAddress(networkAddress);
    }

    async resolveEntity(key, ep) {
        // assert(typeof key === 'string' || key.constructor.name === 'Device', `Wrong type '${typeof key}'`);

        if (typeof key === 'string') {
            if (key === 'coordinator') {
                const coordinator = this.herdsman.getDevicesByType('Coordinator')[0];
                return {
                    type: 'device',
                    device: coordinator,
                    endpoint: coordinator.getEndpoint(1),
                    name: 'Coordinator',
                };
            } else {
                const device = await this.herdsman.getDeviceByIeeeAddr(key);
                if (device) {
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
                        name: key,
                    };
                }
            }
        } else if (typeof key === 'number') {
            let group = await this.herdsman.getGroupByID(key);
            if (!group) group = await this.herdsman.createGroup(key);
            group.toZigbee = groupConverters;
            group.model = 'group';
            return {
                type: 'group',
                mapped: group,
                group,
                name: `Group ${key}`,
            };
        } else {
            let mapped;
            try {
                mapped = await zigbeeHerdsmanConverters.findByDevice(key);
            } catch (err) {
                this.error(`zigbeeHerdsmanConverters findByDevice ${key.ieeeAddr}`);
            }

            return {
                type: 'device',
                device: key,
                mapped: mapped,
                name: key.type === 'Coordinator' ? 'Coordinator' : key.ieeeAddr,
            };
        }
    }

    async incMsgHandler(message) {
        this.debug('incoming msg', message);
        const device = await this.herdsman.getDeviceByIeeeAddr(message.srcaddr);
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
    async stop() {
        // Call extensions
        await this.callExtensionMethod('stop', []);

        try {
            await this.permitJoin(0);
            await this.herdsman.stop();
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
            this.debug(`Event handlePermitJoinChanged received with ${JSON.stringify(data)}`);
            if (data.permitted) {
                if (!this._permitJoinInterval) {
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
                this.emit('pairing', 'Pairing time left', 0);
                this.emit('pairing', 'Closing network.');
            }

        }
            catch (error) {
            this.error(`Error in handlePermitJoinChanged:  ${error.message}`);
        }

    }

    // Remove device
    async remove(deviceID, force, callback) {
        try {
            const device = await this.herdsman.getDeviceByIeeeAddr(deviceID);
            if (device) {
                try {
                    await device.removeFromNetwork();
                    //this.herdsman.adapter.removeDevice(device.networkAddress, device.ieeeAddr);
                } catch (error) {
                    this.sendError(error);
                    if (error)
                        this.debug(`Failed to remove device. If device is remove is all fine, when not use Force remove`);
                    // skip error if force
                    if (!force) {
                        throw error;
                    } else {
                        this.debug(`Force remove`);
                    }
                }

                try {
                    await device.removeFromDatabase();
                } catch (error) {
                    this.sendError(error);
                    // skip error
                    if (error)
                        this.debug(`Failed to remove from DB ${error.stack}`);
                }
                this.debug('Remove successful.');
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
            this.debug('handleDeviceLeave', message);
            const entity = await this.resolveEntity(message.device || message.ieeeAddr);
            const friendlyName = entity ? entity.name : message.ieeeAddr;
            this.debug(`Device '${friendlyName}' left the network`);
            this.emit('leave', message.ieeeAddr);
            // Call extensions
            this.callExtensionMethod(
                'onDeviceLeave',
                [message, entity],
            );
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to handleDeviceLeave ${error.stack}`);
        }
    }

    async handleDeviceAnnounce(message) {
        this.debug('handleDeviceAnnounce', message);
        const entity = await this.resolveEntity(message.device || message.ieeeAddr);
        const friendlyName = entity.name;
        if (this.warnOnDeviceAnnouncement) {
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
        this.debug('handleDeviceJoined', message);
        //const entity = await this.resolveEntity(message.device || message.ieeeAddr);
        //this.emit('new', entity);
    }

    async handleDeviceInterview(message) {
        this.debug('handleDeviceInterview', message);
        // safeguard: We do not allow to start an interview if the network is not opened
        if (message.status === 'started' && !this.herdsman.getPermitJoin()) {
            this.warn(`Blocked interview for '${message.ieeeAddr}' because the network is closed`);
            return;
        }
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
                this.debug(
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

    async handleMessage(data) {
        this.debug(`handleMessage`, data);
        const entity = await this.resolveEntity(data.device || data.ieeeAddr);
        const name = (entity && entity._modelID) ? entity._modelID : data.device.ieeeAddr;
        this.debug(
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
            this.warn('get Map called');
            const devices = this.herdsman.getDevices(true);
            const lqis = [];
            const routing = [];

            for (const device of devices.filter((d) => d.type !== 'EndDevice')) {
                const resolved = await this.resolveEntity(device);
                let result;

                try {
                    result = await device.lqi();
                } catch (error) {
                    this.sendError(error);
                    error && this.debug(`Failed to execute LQI for '${resolved.name}'. ${safeJsonStringify(error.stack)}`);

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
                                parent: resolved.device.ieeeAddr,
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

                this.debug(`LQI succeeded for '${resolved.name}'`);

                try {
                    result = await device.routingTable();
                } catch (error) {
                    this.sendError(error);
                    if (error) {
                        this.debug(`Failed to execute routing table for '${resolved.name}'. ${safeJsonStringify(error.stack)}`);
                    }
                }

                this.debug(`Routing for '${resolved.name}': ${safeJsonStringify(result)}`);
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
                this.debug(`Routing table succeeded for '${resolved.name}'`);
            }
            this.debug(`Get map succeeded ${safeJsonStringify(lqis)}`);

            callback && callback({lqis, routing});
        } catch (error) {
            this.sendError(error);
            this.debug(`Failed to get map: ${safeJsonStringify(error.stack)}`);
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

        this.debug(`Zigbee publish to '${deviceID}', ${cid} - cmd ${cmd} - payload ${JSON.stringify(zclData)} - cfg ${JSON.stringify(cfg)} - endpoint ${ep}`);

        if (cfg == null) {
            cfg = {};
        }

        if (type === 'foundation') {
            cfg.disableDefaultResponse = true;

            if (cmd === 'read' && !Array.isArray(zclData)) {
                /*                // needs to be iterable (string[] | number [])
                zclData[Symbol.iterator] = function* () {
                    let k;
                    for (k in this) {
                        yield k;
                    }
                };
*/
            }
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

    async addDevToGroup(devId, groupId, epid) {
        try {
            this.debug(`called addDevToGroup with ${devId}, ${groupId}, ${epid}`);
            const entity = await this.resolveEntity(devId);
            const group = await this.resolveEntity(groupId);
            this.debug(`addDevFromGroup - entity: ${utils.getEntityInfo(entity)}`);
            // generate group debug info and display it
            const members = await this.getGroupMembersFromController(groupId);
            const memberIDs = [];
            for (const member of members) {
                memberIDs.push(member.ieee);
            }
            this.debug(`addDevToGroup ${groupId} with ${memberIDs.length} members ${safeJsonStringify(memberIDs)}`);
            if (epid != undefined) {
                for (const ep of entity.endpoints) {
                    this.debug(`checking ep ${ep.ID} of ${devId} (${epid})`);
                    if (ep.ID == epid) {
                        if (ep.inputClusters.includes(4) || ep.outputClusters.includes(4)) {
                            this.debug(`adding endpoint ${ep.ID} (${epid}) to group ${groupId}`);
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
        this.debug(`removeDevFromGroup with ${devId}, ${groupId}, ${epid}`);
        let entity;
        try {
            entity = await this.resolveEntity(devId);
            const group = await this.resolveEntity(groupId);

            const members = await this.getGroupMembersFromController(groupId);
            const memberIDs = [];
            for (const member of members) {
                memberIDs.push(member.ieee);
            }

            this.debug(`removeDevFromGroup - entity: ${utils.getEntityInfo(entity)}`);
            this.debug(`removeDevFromGroup ${groupId} with ${memberIDs.length} members ${safeJsonStringify(memberIDs)}`);

            if (epid != undefined) {
                for (const ep of entity.endpoints) {
                    this.debug(`checking ep ${ep.ID} of ${devId} (${epid})`);
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
            this.debug(`entity: ${safeJsonStringify(entity)}`);
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

        this.debug(`Binding ${log}`);
        ep.bind(cluster, target, error => {
            if (error) {
                this.sendError(error);
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
            this.debug(`scanresult is  ${JSON.stringify(scanresult)}`)
            result.energyvalues = scanresult[1].entryList;
            this.debug(`result is  ${JSON.stringify(result)}`)
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
