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
            new DeviceAvailabilityExt(this, {}, adapter.config),
            new DeviceConfigureExt(this, {}),
            new DeviceEventExt(this, {}),
            new DelayedActionExt(this, {}),
        ];
        this.herdsmanTimeoutRegexp = new RegExp(/(\d+)ms/);
        this.herdsmanLogSettings = {};
        this.debugActive = true;
        this.ListDevicesAtStart = adapter.config.listDevicesAtStart;
        this.deviceQueryActive = [];
        this.storedOptions = undefined;
        this.isConfigured = false;
        this.disabledDevices = new Set();
    }

    setDeviceEnable(id, enable) {
        try {
            const ieee = `0x${id.split('.').pop()}`;
            if (enable) this.disabledDevices.add(ieee); else this.disabledDevices.delete(ieee);
            return this.disabledDevices.has(ieee);
        }
        catch {
            return false;
        }
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
            this.warn(`unable to access ${port}`)
            return '';
        }
    }

    configure(options) {
        this.storedOptions = options;
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
        this.readAtAnnounce = this.adapter.config.readAtAnnounce;
        this.warnOnDeviceAnnouncement = this.adapter.config.warnOnDeviceAnnouncement;

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
        this.herdsmanLogSettings.panID = herdsmanSettings.network.panID;
        this.herdsmanLogSettings.channel = herdsmanSettings.network.channelList[0];
        this.herdsmanLogSettings.extendedPanID = utils.byteArrayToString(herdsmanSettings.network.extendedPanID);
        this.herdsman = new ZigbeeHerdsman.Controller(herdsmanSettings, this.adapter.log);
        this.callExtensionMethod('setOptions', [{
            pingCluster: this.adapter.config.pingCluster,
            startReadDelay: this.adapter.config.readAllAtStart ? this.adapter.config.startReadDelay : 0,
            disableForcedPing: false,
            pingTimeout: 300,
            pingCount: 3
        }]);
        this.isConfigured = true;
    }

    async stopHerdsman() {
        try {
            this.emit('pairing', 'stopping zigbee-herdsman');
            await this.herdsman.stop();
        }
        catch (error) {
            this.emit('pairing', `error stopping zigbee-herdsman: ${error && error.message ? error.message : 'no reason given'}`);
        }
        this.isConfigured = false;
        this.emit('pairing', 'herdsman stopped !');
        this.herdsmanStarted = false;
        delete this.herdsman;

    }

    // Start controller
    async start() {
        try {
            if (!this.isConfigured) this.configure(this.storedOptions);
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
            const result = await this.herdsman.start();
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
                this.info(configParameters)
                this.info(networkParameters);
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
                this.debug('Disable LED');
                await this.herdsman.setLED(false);
            } else {
                await this.herdsman.setLED(true);
            }
        } catch (e) {
            this.debug('Unable to disable LED, unsupported function.');
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
                    this.debug('failed to resolve Entity for ' + device.ieeeAddr);
                    continue;
                }
                //await this.adapter.stController.AddModelFromHerdsman(device, entity.mapped.model);

                this.adapter.getObject(utils.zbIdorIeeetoAdId(this.adapter, device.ieeeAddr, false), (err, obj) => {
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
                if (this.ListDevicesAtStart) this.info(msg);
            }

            const Groups = await this.getGroups();
            for (const group of Groups) {
                if (this.ListDevicesAtStart) this.info(`${group.stateName} (addr ${group.id}): Group with ${group.size} members.`);
            }

            // Log zigbee clients on startup
            // const devices = await this.getClients();
            const gm = Groups.length > 0 ? `and ${Groups.length} group${Groups.length > 1?'s':''} ` : '';
            const m = deviceCount > 0 ? `${deviceCount} devices ${gm}are part of the network` : `No devices ${gm}`;
            this.info(m);
            this.emit('pairing',m)
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

    getGroupIterator() {
        if (this.herdsman.database) {
            this.herdsman.getGroupsIterator()
        }
        else {
            return[].values();
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
                            deviceNetworkAddress: nwk,
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

    async getDevice(key) {
        try {
            const dev = await this.herdsman.getDeviceByIeeeAddr(key);
            return dev;
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
        if (typeof key === 'object') {
            return rv;
        }
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

    async getGroup(id) {
        return await this.herdsman.getGroupByID(id);
    }

    async resolveEntity(key, ep) {
        try {
            const _key = await this.analyzeKey(key);
            if (_key.message !== 'success') return undefined;

            if (_key.kind == 'coordinator') {
                const coordinator = this.herdsman.getDevicesByType('Coordinator')[0];
                if (coordinator) return {
                    type: 'device',
                    device: coordinator,
                    endpoint: coordinator.getEndpoint(1),
                    name: 'Coordinator',
                    mapped: { model: 'Coordinator'},
                    options:{}
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
                    device: group,
                    endpoint: group,
                    //group,
                    name: `Group ${_key.key}`,
                    options: {},
                };

            }
            //if (_key.kind === 'ieee')
            const device = (_key.kind === 'ieee' ? this.herdsman.getDeviceByIeeeAddr(_key.key) : key);
            if (device && device.model === 'group') {
                return {
                    type: 'group',
                    mapped: device,
                    device,
                    endpoint: device,
                    name: `Group ${device.groupID}`,
                    options:{}
                }
            }
            if (device) {
                const t = Date.now();
                let mapped = undefined;
                try {
                    mapped = await zigbeeHerdsmanConverters.findByDevice(device, false);
                }
                catch (error) {
                    // intentionally empty
                }
                if (!mapped) {
                    if (device.type === 'Coordinator')
                        return {
                            type: 'device',
                            device: device,
                            mapped: { model: 'Coordinator'},
                            endpoint: device.getEndpoint(1),
                            name: 'Coordinator',
                        };
                    if (device.interviewState != 'IN_PROGRESS') this.emit('stash_unknown_model', `resoveEntity${device.ieeeAddr}`,`Resolve Entity did not manage to find a mapped device for ${device.ieeeAddr} of type ${device.modelID}`);
                }
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
                const options = mapped ? this.adapter.stController.localConfig.getOptions(device.ieeeAddr, mapped.model) : {};
                return {
                    type: 'device',
                    device,
                    mapped,
                    endpoint,
                    endpoints: device.endpoints,
                    name: device._ieeeAddr,
                    options:options
                };
            }
            else {
                this.debug(`resolve_entity failed for ${JSON.stringify(_key)}`);
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
            if (this.herdsmanStarted) {
                await this.permitJoin(0);
                await this.herdsman.stop();
                this.herdsmanStarted = false;
                this.info('zigbecontroller stopped successfully');
                return;
            }
            else this.info('zigbecontroller stopped successfully - ZH was not running');
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
    async permitJoin(permitTime, devid) {
        if (!this.herdsmanStarted) return false;
        try {
            const starter = this._permitJoinTime > 0? 'Extending open network':'Opening network';
            this._permitJoinTime = permitTime;
            const dId = devid || this._permitJoinDevId
            if (permitTime > 0) {
                this.info(`${starter}${dId ? ' on device ' + dId : ''}.`);
                this.emit('pairing', `${starter}${dId ? 'on device ' + dId : ''}.`);
                await this.herdsman.permitJoin(permitTime, dId);
                this._permitJoinDevId = dId;
            }
            else {
                await this.herdsman.permitJoin(0);
                this.info(`Closing network.`);
                this.emit('pairing', `Closing network${this._permitJoinDevId ? ' on '+this._permitJoinDevId : ''}.`)
                this._permitJoinDevId = undefined;
            }
        } catch (e) {
            this._permitJoinTime = 0;
            this._permitJoinDevId = undefined;
            this.sendError(e);
            this.error(`Failed to open the network: ${e.stack}`);
            return false;
        }
        return true;
    }

    async handlePermitJoinChanged(data)
    {
        try {
            if (this.debugActive) this.debug(`Event handlePermitJoinChanged received with ${JSON.stringify(data)}`);
            if (data.permitted) {
                if (!this._permitJoinInterval) {
                    this.emit('pairing',`Pairing possible for ${this._permitJoinTime} seconds`)
                    this.info(`Opened zigbee Network for ${this._permitJoinTime} seconds`)
                    this._permitJoinInterval = setInterval(async () => {
                        this.emit('pairing', 'Pairing time left', this._permitJoinTime);
                        this._permitJoinTime -= 1;
                    }, 1000);
                }
            }
            else if (this._permitJoinInterval) {
                const timestr = this._permitJoinTime > 0 ? ` with ${this._permitJoinTime} second${this._permitJoinTime > 1 ? 's':''} remaining.`: '.';
                this.info(`Closed Zigbee network${timestr}`)
                this.emit('pairing', `Closed network${timestr}`, 0);
                clearInterval(this._permitJoinInterval);
                this._permitJoinInterval = null;
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
            let message = 'no reason given';
            if (error && error.message) {
                if (error.message.includes('AREQ - ZDO - mgmtLeaveRsp after'))
                    message = `No response to mgmtLeaveRequest from the device - device may be offline.`;
                else
                    message = error.message;

            }
            const msg = `Failed to remove ${deviceID ? 'device ' + deviceID : 'unspecified device'}: ${message}`;
            if (callback) callback(msg); else return { status:false, error:msg};
        }
        if (!callback) return {status:true};
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
                this.warn(`Device '${friendlyName}' left the network`);
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
        const friendlyName = entity ? entity.name : message.ieeeAddr ? message.ieeeAddr : message.device && message.device.ieeeAddr ? message.device.ieeeAddr : 'without data';

        this.emit('pairing', `Device '${friendlyName}' announced itself`);
        if (!entity) return;

        if (this.adapter.stController.checkDebugDevice(friendlyName)) {
            this.emit('device_debug', {ID: Date.now(), data: {flag:'da', states:[{id: '--', value:'--', payload:message}] , IO:true} ,message:`Device '${friendlyName}' announced itself`});
        }

        if (this.herdsman.getPermitJoin() && (entity?.device?.interviewState != 'SUCCESSFUL')) {
            this.info(`ignoring device announcement for ${entity?.device?.modelID ? entity?.device?.modelID : 'unknown model'} due to interview state ${entity?.device?.interviewState} while the network is open.`);
            this.emit('pairing', `ignoring device announcement while interview state is ${entity?.device?.interviewState}`);
            return;
        }


        if (this.warnOnDeviceAnnouncement) {
            this.warn(`Device '${friendlyName}' announced itself${this.readAtAnnounce ? ', trying to read its status' : ''}`);
        } else {
            this.info(`Device '${friendlyName}' announced itself${this.readAtAnnounce ? ', trying to read its status' : ''}`);
        }

        /*
        if (networkOpen && entity.device && entity.device.modelID && entity.device.interviewState != 'IN_PROGRESS')
        {
            //entity.device.modelID = entity.device._modelID;
            //this.emit('new', entity);
            return;
        }
        */
        try {
            if (entity && entity.mapped) {
                if (entity.options?.hasOwnProperty('resend_states')) {
                    // trigger setting the states
                    this.emit('resend_states',entity, this.readAtAnnounce );
                }
                else
                    if (this.readAtAnnounce) await this.doDeviceQuery(message.device || message.ieeeAddr, Date.now(), false);

                this.callExtensionMethod(
                    'onZigbeeEvent',
                    [{'device': message.device, 'type': 'deviceAnnounce', options: entity.options || {}}, entity ? entity.mapped : null]);
                this.callExtensionMethod('registerDevicePing', [message.device, entity]);
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to handleDeviceAnnounce ${error.stack}`);
        }
    }

    async handleDeviceJoined(message) {
        if (this.debugActive) this.debug('handleDeviceJoined', message);
        //const entity = await this.resolveEntity(message.device || message.ieeeAddr);
        // this.emit('new', entity);
        //if (entity && entity.mapped) this.callExtensionMethod([message, entity.mapped]);
    }

    async handleDeviceInterview(message) {
        if (this.debugActive) this.debug('handleDeviceInterview',JSON.stringify(message));
        // safeguard: We do not allow to start an interview if the network is not opened
        if (message.status === 'started' && !this.herdsman.getPermitJoin()) {
            this.warn(`Ignored interview for '${message.ieeeAddr}' because the network is closed`);
            return;
        }
        try {
            const entity = await this.resolveEntity(message.device || message.ieeeAddr);
            const friendlyName = entity.name;
            const onZigbeeEventparameters = [message, entity.mapped ? entity.mapped: null];

            switch (message.status) {
                case 'successful': {
                    this.info(`Successfully interviewed '${friendlyName}', device has successfully been paired`);
                    const msgArr = [];

                    if (entity.mapped) {
                        const {vendor, description, model} = entity.mapped;
                        this.info(
                            `Device '${friendlyName}' is supported, identified as: ${vendor} ${description} (${model})`
                        );
                        msgArr.push(`firendly name: ${friendlyName}`);
                        if (model) msgArr.push(`model: ${model}`); else msgArr.push(`model: unknown`);

                        if (vendor) msgArr.push(`vendor: ${vendor}`);
                        if (description) msgArr.push(`description: ${description}`);
                        msgArr.push('supported:true');
                        onZigbeeEventparameters[0]={...message,type:'deviceInterview', options: entity.options || {}};
                    } else {
                        if (this.debugActive) this.debug(
                            `Device '${friendlyName}' with Zigbee model '${message.device.modelID}' is NOT supported, ` +
                            `please follow https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`
                        );
                    }
                    this.emit('pairing', 'Interview successful', msgArr.join(', '));
                    this.emit('new', entity);
                    break;
                }
                case 'failed': {
                    this.error(`Failed to interview '${friendlyName}', device has not successfully been paired. Try again !!!!!!!!!! `);
                    this.emit('pairing', 'Interview failed', friendlyName);
                    break;
                }
                default: {
                    if (message.status === 'started') {
                        this.info(`Starting interview of '${friendlyName}'`);
                        this.emit('pairing', 'Interview started', friendlyName);
                    }

                }
            }

            this.callExtensionMethod(
                'onZigbeeEvent',
                onZigbeeEventparameters,
            );
        }
        catch (error) {
            this.error('handleDeviceInterview: ' + (error && error.message ? error.message : 'no error message'));
        }
    }

    async handleMessage(data) {
        if (this.debugActive) this.debug(`handleMessage`, data);

        const is = data.device.interviewState;
        if (is != 'SUCCESSFUL' && is != 'FAILED') {
            this.debug(`message ${JSON.stringify(data)} received during interview.`)
        }
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
            [{...data, options:entity.options || {}}, entity ? entity.mapped : null],
        );
    }

    async getMap(callback) {
        try {
            const MapData = { lqi:{}, routing:{}, sdev:[], edev:[], ddev: []};
            this.info('Collecting Map Data');
            const devices = this.herdsman.getDevices(true);
            const lqis = [];
            const routing = [];
            const errors = [];

            const mappables = devices.filter((d) => d.type !== 'EndDevice');
            let cnt = mappables.length;
            this.emit('pairing', `Map Devices left:${cnt}`)
            for (const device of mappables)
            {
                cnt--;
                if (this.disabledDevices.has(device.ieeeAddr)) {
                    MapData.ddev.push(device.ieeeAddr);
                    lqis.push({
                        parent: 'undefined',
                        networkAddress: 0,
                        ieeeAddr: device.ieeeAddr,
                        lqi: 'undefined',
                        relationship: 0,
                        depth: 0,
                        status: 'disabled',
                    });
                    continue;
                }
                let resolved = await this.resolveEntity(device, 0);
                if (!resolved) {
                    resolved = { name:'unresolved device', device:device }
                    if (this.debugActive) this.debug('resolve Entity failed for ' + device.ieeeAddr)
                }

                let attemptRouting = true;

                try {
                    const result = await device.lqi();
                    MapData.sdev.push(`lqi ${device.ieeeAddr}`);
                    MapData.lqi[device.ieeeAddr] = result;
                    const r_arr = Array.isArray(result) ? result : result?.neighbors;
                    if (r_arr) {
                        for (const dev of r_arr) {
                            const ieeeAddr = dev.ieeeAddr || dev.eui64;
                            if (dev !== undefined && ieeeAddr !== '0xffffffffffffffff') {
                                const lq = (dev.linkquality == undefined) ? dev.lqi== undefined ? 0 : dev.lqi : dev.linkquality
                                lqis.push({
                                    parent: (resolved ? resolved.device.ieeeAddr : undefined),
                                    networkAddress: dev.networkAddress || dev.nwkAddress,
                                    ieeeAddr: ieeeAddr,
                                    lqi: lq,
                                    relationship: dev.relationship,
                                    depth: dev.depth,
                                    status: lq > 0 ? 'online' : 'offline',
                                });
                            }
                        }
                    }
                } catch (error) {
                    MapData.edev.push(device.ieeeAddr);
                    const eReason = this.filterHerdsmanError(error.message);
                    errors.push(`Failed to execute LQI for '${resolved ? resolved.name : 'unresolved device'} (${resolved ? resolved.device.modelID : 'unknown'}') : ${eReason}.`);
                    attemptRouting = eReason != 'Timeout'
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

                if (attemptRouting) try {
                    const result = await device.routingTable();
                    const r_arr = Array.isArray(result) ? result : result?.table;
                    MapData.routing[device.ieeeAddr] = result;
                    if (r_arr !== undefined) {
                        for (const dev of r_arr) {
                            routing.push({
                                source: resolved.device.ieeeAddr,
                                destination: dev.destinationAddress,
                                nextHop: dev.nextHop ? dev.nextHop: dev.nextHopAddress,
                                status: dev.status,
                            });
                        }
                    }
                } catch (error) {
                    MapData.edev.push(`routing ${device.ieeeAddr}`);
                    if (error) {
                        errors.push(`Failed to collect routing table for '${resolved?.name || 'unresolved device'} (${resolved?.device?.modelID || 'unknown'}') : ${this.filterHerdsmanError(error.message)}`);
                    }
                }
                else errors.push(`Omitted collecting routing table for '${resolved?.name || 'unresolved device'} (${resolved?.device?.modelID ||'unknown'}') : LQI timed out`);
                this.emit('pairing', `Map Devices left: ${cnt}`);
            }
            this.emit('pairing', 'Map data collection complete');

            const fs = require('fs');
            fs.writeFileSync(this.adapter.expandFileName('mapdata.json'), JSON.stringify(MapData));

            callback && callback({lqis, routing, errors});
            if (errors.length) {
                this.info(`Map Data collection complete with ${errors.length} issues:`);
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

    processSyncStatesList(deviceId, model, syncStateList) {
        syncStateList.forEach((syncState) => {
            this.emit('acknowledge_state',deviceId, model, syncState.stateDesc, syncState.value);
        });
    }

    // publishing to the zigbee network
    // publish raw zigbee data
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

        //        try { NO Try/Catach here, this is ONLY called from the developer tab and error handling is done there

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
        /*        }
        catch (error)
        {
            //this.error(`error sending ${type} ${cmd} to endpoint: ${(error && error.message ? error.message : 'no error message')} ${(error && error.stack ? error.stack : 'no call stack')}`)
        }
        */
    }


    async getConverterValue(converter, target, key, preparedValue, preparedObject, meta) {
        if (preparedObject) {
        //  try {
            return  { result:await converter.convertSet(target, key, preparedObject, meta), fromObject:true };
        //  }
        //      catch (error)
        //  {
        //      return { result:await converter.convertSet(target, key, preparedValue, meta), fromObject:false };
        //  }
        }
        else return { result:await converter.convertSet(target, key, preparedValue, meta), fromObject:false };
    }

    // publish via converter
    //
    async publishFromState(deviceId, model, stateModel, stateList, options, debugID, has_elevated_debug) {
        let isGroup = false;
        //const has_elevated_debug = this.stController.checkDebugDevice(deviceId)

        if (has_elevated_debug)
        {
            const stateNames = stateList.map((state) => state.stateDesc.id);
            const message = `Publishing to ${deviceId} of model ${model} with ${stateNames.join(', ')}`;
            this.emit('device_debug', { ID:debugID, data: { ID: deviceId, flag: '03', IO:false }, message: message});
        }
        else
            if (this.debugActive) this.debug(`main publishFromState : ${deviceId} ${model} ${safeJsonStringify(stateList)}`);
        if (model === 'group') {
            isGroup = true;
            deviceId = parseInt(deviceId);
        }
        try {
            const entity = await this.resolveEntity(deviceId);
            if (this.debugActive) this.debug(`entity: ${deviceId} ${model} ${safeJsonStringify(entity)}`);
            const mappedModel = entity ? entity.mapped : undefined;

            if (!mappedModel) {
                if (this.debugActive) this.debug(`No mapped model for ${model}`);
                if (has_elevated_debug) {
                    const message=`No mapped model ${deviceId} (model ${model})`;
                    this.emit('device_debug', { ID:debugID, data: { error: 'NOMODEL' , IO:false }, message: message});
                }
                return;
            }

            if (!mappedModel.toZigbee)
            {
                this.error(`No toZigbee in mapped model for ${model}`);
                return;
            }

            stateList.forEach(async changedState => {
                const stateDesc = changedState.stateDesc;
                const value = changedState.value;

                let converter = undefined;
                let msg_counter = 0;
                if (stateDesc.isOption) {
                    if (has_elevated_debug) {
                        const message = `No converter needed on option state for ${deviceId} of type ${model}`;
                        this.emit('device_debug', { ID:debugID, data: { flag: `SUCCESS` , IO:false }, message:message});
                    }
                    else
                        if (this.debugActive) this.debug(`No converter needed on option state for ${deviceId} of type ${model}`);

                    return;
                }
                // force read for brightness
                const skey = stateDesc.setattr || stateDesc.prop || stateDesc.id;
                const readKey = { key: undefined, converter: undefined };
                if (skey === 'brightness') readKey.key = 'state';
                if (skey === 'state') readKey.key = 'brightness';

                for (const c of mappedModel.toZigbee) {

                    if (!c.hasOwnProperty('convertSet')) continue;
                    if (this.debugActive) this.debug(`Type of toZigbee is '${typeof c}', Contains key ${(c.hasOwnProperty('key')?JSON.stringify(c.key):'false ')}`)
                    if (!c.hasOwnProperty('key'))
                    {
                        if (converter === undefined)
                        {
                            if (readKey.key && readKey.converter === undefined && c.hasOwnProperty('convertGet'))
                                readKey.converter = c;
                            converter = c;
                            if (has_elevated_debug) {
                                const message = `Setting converter to keyless converter for ${deviceId} of type ${model}`;
                                this.emit('device_debug', { ID:debugID, data: { flag: `s4.${msg_counter}` , IO:false }, message:message});
                            }
                            else
                                if (this.debugActive) this.debug(`Setting converter to keyless converter for ${deviceId} of type ${model}`);
                            msg_counter++;
                        }
                        else
                        {
                            if (has_elevated_debug)
                            {
                                const message = `ignoring keyless converter for ${deviceId} of type ${model}`;
                                this.emit('device_debug', { ID:debugID, data: { flag: `i4.${msg_counter}` , IO:false} , message:message});
                            }
                            else
                                if (this.debugActive) this.debug(`ignoring keyless converter for ${deviceId} of type ${model}`);
                            msg_counter++;
                        }
                        continue;
                    }
                    if (c.key.includes(stateDesc.prop) || c.key.includes(stateDesc.setattr) || c.key.includes(stateDesc.id))
                    {
                        const message = `${(converter===undefined?'Setting':'Overriding')}' converter to converter with key(s)'${JSON.stringify(c.key)}}`;
                        if (has_elevated_debug) {
                            this.emit('device_debugug', { ID:debugID, data: { flag: `${converter===undefined ? 's' : 'o'}4.${msg_counter}` , IO:false }, message:message});

                        }
                        else
                            if (this.debugActive) this.debug(message);
                        converter = c;
                        msg_counter++;
                    }
                    if (readKey.key && c.key.includes(readKey.key) && c.hasOwnProperty('convertGet'))
                        readKey.converter = c;
                }
                if (converter === undefined) {
                    if (stateDesc.isInternalState) {
                        this.emit('acknowledge_state', deviceId, undefined, stateDesc , undefined );
                        return;
                    }
                    const message = `No converter available for '${model}' with key '${stateDesc.id}' `;
                    if (has_elevated_debug) {
                        this.emit('device_debug', { ID:debugID, data: { error: 'NOCONV',states:[{id:stateDesc.id, value:value, payload:'no converter'}] , IO:false }, message:message});
                    }
                    else {
                        this.info(message);
                    }
                    return;
                }

                const preparedValue = (stateDesc.setter) ? stateDesc.setter(value, options) : value;
                const preparedOptions = (stateDesc.setterOpt) ? stateDesc.setterOpt(value, options) : {};

                let syncStateList = [];
                if (stateModel && stateModel.syncStates) {
                    stateModel.syncStates.forEach(syncFunct => {
                        const res = syncFunct(stateDesc, value, options);
                        if (res) {
                            syncStateList = syncStateList.concat(res);
                        }
                    });
                }

                const epName = stateDesc.epname !== undefined ? stateDesc.epname : (stateDesc.prop || stateDesc.id);
                const key = stateDesc.setattr || stateDesc.prop || stateDesc.id;
                const message = `convert ${key} with value ${safeJsonStringify(preparedValue)} and options ${safeJsonStringify(preparedOptions)} for device ${deviceId} ${stateDesc.epname ? `with Endpoint ${epName}` : 'without Endpoint'}`;
                if (has_elevated_debug) {
                    this.emit('device_debug', { ID:debugID, data: { flag: '04', payload: {key:key, ep: stateDesc.epname, value:preparedValue, options:preparedOptions}, IO:false }, message:message});
                }
                else
                    if (this.debugActive) this.debug(message);

                let target;
                if (model === 'group') {
                    target = entity.mapped;
                } else {
                    target = await this.resolveEntity(deviceId, epName);
                    target = target.endpoint;
                }

                if (this.debugActive) this.debug(`target: ${safeJsonStringify(target)}`);

                const meta = {
                    endpoint_name: stateDesc.epname,
                    options: preparedOptions,
                    device: entity.device,
                    mapped: model === 'group' ? [] : mappedModel,
                    message: {[key]: preparedValue},
                    logger: this,
                    state: {},
                };

                // new toZigbee
                if (preparedValue !== undefined && Object.keys(meta.message).filter(p => p.startsWith('state')).length > 0) {
                    if (typeof preparedValue === 'number') {
                        meta.message.state = preparedValue > 0 ? 'ON' : 'OFF';
                    } else {
                        meta.message.state = preparedValue;
                    }
                }
                if (has_elevated_debug) {
                    this.emit('device_debug', { ID:debugID, data: { states:[{id:stateDesc.id, value:value, payload:preparedValue, ep:stateDesc.epname}] , IO:false }});
                }

                if (preparedOptions !== undefined) {
                    if (preparedOptions.hasOwnProperty('state')) {
                        meta.state = preparedOptions.state;
                    }
                }
                let retry = 2;
                /*
                let preparedObject = null;
                try {
                    preparedObject = JSON.parse(preparedValue);
                }
                catch (error)
                { }
                */

                do
                {
                    try {
                        const result = await converter.convertSet(target, key, preparedValue, meta);
                        const fromObject = false;
                        const preparedObject = null;
                        //const { result, fromObject } = await this.getConverterValue(converter, target, key, preparedValue, preparedObject, meta);
                        const message = `convert result ${safeJsonStringify(result)} for device ${deviceId}`;
                        if (isGroup)
                            this.emit('published', deviceId, model, stateModel, stateList, options, debugID, has_elevated_debug );
                        if (has_elevated_debug) {
                            this.emit('device_debug', { ID:debugID, data: { flag: 'SUCCESS' , IO:false }, message:message});
                        }
                        else
                            if (this.debugActive) this.debug(message);
                        if (result !== undefined) {
                            if (!stateDesc.noack) {
                                this.emit('acknowledge_state', deviceId, model, stateDesc, value );
                            }
                            // process sync state list
                            this.processSyncStatesList(deviceId, model, syncStateList);
                        }
                        else {
                            if (has_elevated_debug) {
                                const stringvalue = fromObject ? safeJsonStringify(preparedObject) : typeof preparedValue == 'object' ? safeJsonStringify(preparedValue) : preparedValue;
                                const message = `Convert does not return a result result for ${key} with ${stringvalue} on device ${deviceId}.`;
                                this.emit('device_debug', { ID:debugID, data: { flag: '06' , IO:false }, message:message});
                            }
                        }
                        retry = 0;
                    } catch (error) {
                        if (has_elevated_debug) {
                            const message = `caught error ${error?.message? error.message : 'no reason given'} when setting value for device ${deviceId}.`;
                            this.emit('device_debug', { ID:debugID, data: { error: `EXSET${error.code == 25 ? retry : ''}` , IO:false },message:message});
                        }
                        if (error.code === 25 && retry > 0) {
                            this.warn(`Error ${error.code} on send command to ${deviceId}. (${retry} tries left.), Error: ${error.message}`);
                            retry--;
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                        else {
                            retry = 0;
                            this.adapter.filterError(`Error ${error.code} on send command to ${deviceId}.` +
                            ` Error: ${error.message}`, `Send command to ${deviceId} failed with`, error);
                        }
                    }
                } while (retry > 0);

                if (readKey.converter) {
                    const tt = preparedOptions.transition || preparedOptions.transition_time;
                    setTimeout(async () => { await readKey.converter.convertGet(target, readKey.key, {device:entity.device})}, tt ? tt * 1000 : 100)
                }

            });
        } catch (err) {
            const message = `No entity for ${deviceId} : ${err && err.message ? err.message : 'no error message'}`;
            this.emit('device_debug', { ID:debugID, data: { error: 'EXPUB' , IO:false }, message:message});
        }
    }

    extractEP(key, endpoints) {
        try {
            if (endpoints) for (const ep of Object.keys(endpoints)) {
                if (key.endsWith('_'+ep)) return { setattr: key.replace('_'+ep, ''), epname:ep }
            }
        }
        catch {
            return {};
        }
        return {};
    }

    // publish via payload
    //
    // This function is introduced to explicitly allow user level scripts to send Commands
    // directly to the zigbee device. It utilizes the zigbee-herdsman-converters to generate
    // the exact zigbee message to be sent and can be used to set device options which are
    // not exposed as states. It serves as a wrapper function for "publishFromState" with
    // extended parameter checking
    //
    // The payload can either be a JSON object or the string representation of a JSON object
    // The following keys are supported in the object:
    // device: name of the device. For a device zigbee.0.0011223344556677 this would be 0011223344556677
    // payload: The data to send to the device as JSON object (key/Value pairs)
    // endpoint: optional: the endpoint to send the data to, if supported.
    // acknowledge: optional: if to update the devices 'send_payload' DP (if present) after successful publish
    async publishPayload(payload, debugID, has_elevated_debug) {
        let payloadObj = {};
        if (typeof payload === 'string') {
            try {
                payloadObj = JSON.parse(payload);
            } catch (e) {
                this.log.error(`Unable to parse ${safeJsonStringify(payload)}: ${safeJsonStringify(e)}`);
                return {
                    success: false,
                    error: `Unable to parse ${safeJsonStringify(payload)}: ${safeJsonStringify(e)}`
                };
            }
        } else if (typeof payload === 'object') {
            payloadObj = payload;
        } else return { success: false, error: 'illegal type of payload: ' + typeof payload};


        if (payloadObj.hasOwnProperty('device') && payloadObj.hasOwnProperty('payload')) {
            try {
                const isDevice = !payloadObj.device.includes('group_');
                const stateList = [];
                const devID = isDevice ? `0x${payloadObj.device}` : parseInt(payloadObj.device.replace('group_', ''));

                const entity = await this.resolveEntity(devID);
                if (!entity) {
                    this.log.error(`Device ${safeJsonStringify(payloadObj.device)} not found`);
                    return {success: false, error: `Device ${safeJsonStringify(payloadObj.device)} not found`};
                }
                const mappedModel = entity.mapped;
                if (!mappedModel) {
                    this.log.error(`No Model for Device ${safeJsonStringify(payloadObj.device)}`);
                    return {success: false, error: `No Model for Device ${safeJsonStringify(payloadObj.device)}`};
                }
                if (typeof payloadObj.payload !== 'object') {
                    this.log.error(`Illegal payload type for ${safeJsonStringify(payloadObj.device)}`);
                    return {success: false, error: `Illegal payload type for ${safeJsonStringify(payloadObj.device)}`};
                }
                const endpoints = mappedModel && mappedModel.endpoint ? mappedModel.endpoint(entity.device) : null;
                for (const key in payloadObj.payload) {
                    if (payloadObj.payload[key] != undefined) {
                        const datatype = typeof payloadObj.payload[key];
                        const epobj = this.extractEP(key, endpoints);
                        if (payloadObj.endpoint) {
                            epobj.epname = payloadObj.endpoint;
                            delete epobj.setattr;
                        }
                        stateList.push({
                            stateDesc: {
                                id: key,
                                prop: key,
                                role: 'state',
                                type: datatype,
                                noack:true,
                                epname: epobj.epname,
                                setattr: epobj.setattr,
                            },
                            value: payloadObj.payload[key],
                            index: 0,
                            timeout: 0,
                        });
                    }
                }
                try {
                    await this.publishFromState(`0x${payload.device}`, payload.model, payload.stateModel, stateList, payload.options, debugID, has_elevated_debug);
                    if (payload.acknowledge) {
                        this.emit('acknowledge_state', payload.device, payload.model, { id:'send_payload' }, undefined);
                    }
                    return {success: true};
                } catch (error) {
                    this.log.error(`Error ${error.code} on send command to ${payload.device}.` + ` Error: ${error.stack} ` + `Send command to ${payload.device} failed with ` + error);
                    this.adapter.filterError(`Error ${error.code} on send command to ${payload.device}.` + ` Error: ${error.stack}`, `Send command to ${payload.device} failed with`, error);
                    return {success: false, error};
                }
            } catch (e) {
                return {success: false, error: e};
            }
        }

        return {success: false, error: `missing parameter device or payload in message ${JSON.stringify(payload)}`};
    }

    async doDeviceQuery(deviceId, debugID, elevated) {
        const entity = await this.resolveEntity(deviceId);
        if (this.debugActive) this.debug(`doDeviceQuery: resolveEntity for entity: ${deviceId} is ${safeJsonStringify(entity)}`);
        const mappedModel = entity ? entity.mapped : undefined;
        if (mappedModel) {
            const epmap = mappedModel.endpoint ? mappedModel.endpoint() : [];
            if (elevated) {
                const message  = `Device query for '${entity.device.ieeeAddr}' triggered`;
                this.emit('device_debug', { ID:debugID, data: { flag: 'qs' ,states:[{id:'device_query', value:true, payload:'device_query'}], IO:false }, message:message});
            }
            else
                if (this.debugActive) this.debug(`Device query for '${entity.device.ieeeAddr}' started`);
                else this.info(`Device query for '${entity.device.ieeeAddr}' started`);

            const payload = { key:'device_query', read_states:[], unread_states:[] };
            let cCount = 0;
            for (const converter of mappedModel.toZigbee) {
                if (converter.hasOwnProperty('convertGet')) {
                    cCount++;
                    const sources = new Set();
                    if (!converter.endpoints) sources.add(entity.device.endpoints[0]);
                    const epCandidates = converter.endpoints ? converter.endpoints : epmap ? Object.keys(epmap) : undefined;
                    if (epCandidates) {
                        for (const epname of epCandidates) {
                            const source = entity.device.endpoints.find((id) => id.ID == epmap[epname]);
                            if (source) sources.add(source);
                        }
                    }
                    if (sources.size == 0) sources.add(entity.device.endpoints[0]);
                    for (const source of sources) {
                        for (const k of converter.key)
                            try {
                                await converter.convertGet(source, k, {device:entity.device});
                                payload.read_states.push(`${cCount}.${k}`);
                                if (elevated) {
                                    const message = `read for state ${k} of '${converter.key.join(',')}' of '${entity.device.ieeeAddr}/${source.ID}' after device query`;
                                    this.warn(`ELEVATED O02.1 ${message}`);
                                    this.emit('device_debug', { ID:debugID, data: { flag: '03', IO:false }, message:message });
                                }
                                else
                                    this.debug(`read for state${converter.key.length ? '' : 's'} '${converter.key.join(',')}' of '${entity.device.ieeeAddr}/${source.ID}' after device query`);
                            } catch (error) {
                                payload.unread_states.push(`${cCount}.${k}`);
                                if (elevated) {
                                    const message = `Failed to read for state ${k} of '${converter.key.join(',')}' of '${source.ID}' from query with '${error && error.message ? error.message : 'no error message'}`;
                                    this.warn(`ELEVATED OE02.1 ${message}`);
                                    this.emit('device_debug', { ID:debugID, data: { error: 'NOTREAD' , IO:false }, message:message });
                                }
                                else
                                    this.debug(`failed to read for state${converter.key.length ? '' : 's'} '${converter.key.join(',')}' of '${source.ID}'after device query`);
                            }
                    }
                }
            }
            if (elevated) {
                const message = `ELEVATED O07: Device query for '${entity.device.ieeeAddr}}' complete`;
                this.emit('device_debug', { ID:debugID, data: { flag: 'qe' , IO:false , payload }, message:message});
            }
            else
                this.info(`Device query for '${entity.device.ieeeAddr}' complete`);
        }
    }

    async deviceQuery(deviceId, debugID, elevated, callback) {
        if (this.deviceQueryActive.includes (deviceId)) {
            this.info(`Device query for ${deviceId} is still active.`);
            return;
        }
        this.deviceQueryActive.push(deviceId);
        try {
            await this.doDeviceQuery(deviceId, debugID, elevated);
        }
        catch (e) {
            this.warn('error in doDeviceQuery')
        }
        const idx = this.deviceQueryActive.indexOf(deviceId)
        if (idx > -1)
            this.deviceQueryActive.splice(idx, 1);
        if (callback) callback(deviceId);
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
        let entity; // needed to have access to entity outside in the catch path.
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
