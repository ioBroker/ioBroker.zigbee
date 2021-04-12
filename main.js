/**
 *
 * Zigbee devices adapter
 *
 */
'use strict';

let debug;
try {
    debug = require('zigbee-herdsman/node_modules/debug');
} catch (e) {
    debug = require('debug');
}
const originalLogMethod = debug.log;

const safeJsonStringify = require('./lib/json');
const fs = require('fs');
const pathLib = require('path');
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const SerialListPlugin = require('./lib/seriallist');
const CommandsPlugin = require('./lib/commands');
const GroupsPlugin = require('./lib/groups');
const NetworkMapPlugin = require('./lib/networkmap');
const DeveloperPlugin = require('./lib/developer');
const BindingPlugin = require('./lib/binding');
const OtaPlugin = require('./lib/ota');
const BackupPlugin = require('./lib/backup');
const ZigbeeController = require('./lib/zigbeecontroller');
const StatesController = require('./lib/statescontroller');
const ExcludePlugin = require('./lib/exclude');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const vm = require('vm');

const createByteArray = function (hexString) {
    const bytes = [];
    for (let c = 0; c < hexString.length; c += 2) {
        bytes.push(parseInt(hexString.substr(c, 2), 16));
    }
    return bytes;
};

const E_INFO=1;
const E_DEBUG=2;
const E_WARN=3;
const E_ERROR=4;

const errorCodes = {
    9999: { severity:E_INFO, message:'No response'},
    233: { severity:E_DEBUG, message:'MAC NO ACK'},
    205: { severity:E_WARN, message:'No network route'},
    134: { severity:E_ERROR, message:'Unnsupported Attribute'},
};


class Zigbee extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super(Object.assign(options || {}, {
            dirname: __dirname.indexOf('node_modules') !== -1 ? undefined : __dirname,
            name: 'zigbee',
            systemConfig: true,
        }));
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.on('message', this.onMessage.bind(this));

        this.query_device_block = [];

        this.stController = new StatesController(this);
        this.stController.on('log', this.onLog.bind(this));
        this.stController.on('changed', this.publishFromState.bind(this));
        this.plugins = [
            new SerialListPlugin(this),
            new CommandsPlugin(this),
            new GroupsPlugin(this),
            new NetworkMapPlugin(this),
            new DeveloperPlugin(this),
            new BindingPlugin(this),
            new ExcludePlugin(this),
            new OtaPlugin(this),
            new BackupPlugin(this),
        ];
    }

    async onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'SendToDevice':
                let rv = {
                    success: false,
                    loc:-1,
                };
                try {
                    rv = await this.SendPayload(obj.message);
                }
                catch (e) {
                    rv.error = e;
                }
                this.sendTo(obj.from, obj.command, rv, obj.callback);
                break;
            }
        }
    }

    filterError(errormessage, message, error) {
        if (error.code === undefined)
        {
            let em =  error.stack.match(/failed \((.+?)\) at/);
            if (!em) em = error.stack.match(/failed \((.+?)\)/);
            this.log.error(`${message} no error code (${(em ? em[1]:'undefined')})`);
            this.log.debug(`Stack trace for ${em}: ${error.stack}`);
            return;
        }
        const ecode = errorCodes[error.code];
        if (ecode === undefined) {
            this.log.error(errormessage);
            return;
        }
        switch (ecode.severity) {
            case E_INFO: this.log.info(`${message}: Code ${error.code} (${ecode.message})`);
                break;
            case E_DEBUG: this.log.debug(`${message}: Code ${error.code} (${ecode.message})`);
                break;
            case E_WARN: this.log.warn(`${message}: Code ${error.code} (${ecode.message})`);
                break;
            case E_ERROR: this.log.error(`${message}: Code ${error.code} (${ecode.message})`);
                break;
            default: this.log.error(`${message}: Code ${error.code} (malformed error)`);
        }
    }

    debugLog (data) {
        this.log.debug(data.slice(data.indexOf('zigbee-herdsman')));
    }

    async onReady() {
        if (this.config.debugHerdsman) {
            debug.log = this.debugLog.bind(this);
            debug.enable('zigbee-herdsman*');
        }

        // external converters
        this.applyExternalConverters();
        // get exclude list from object
        this.getState('exclude.all', (err, state) => {
            this.stController.getExcludeExposes(state);
        });

        this.subscribeStates('*');
        // set connection false before connect to zigbee
        this.setState('info.connection', false);
        const zigbeeOptions = this.getZigbeeOptions();
        this.zbController = new ZigbeeController();
        this.zbController.on('log', this.onLog.bind(this));
        this.zbController.on('ready', this.onZigbeeAdapterReady.bind(this));
        this.zbController.on('disconnect', this.onZigbeeAdapterDisconnected.bind(this));
        this.zbController.on('new', this.newDevice.bind(this));
        this.zbController.on('leave', this.leaveDevice.bind(this));
        this.zbController.on('pairing', this.onPairing.bind(this));
        this.zbController.on('event', this.onZigbeeEvent.bind(this));
        this.zbController.on('msg', this.onZigbeeEvent.bind(this));
        this.zbController.on('publish', this.publishToState.bind(this));
        this.zbController.configure(zigbeeOptions);
        await this.callPluginMethod('configure', [zigbeeOptions]);

        this.reconnectCounter = 1;
        this.doConnect();
    }

    * getExternalDefinition() {
        if (this.config.external === undefined) {
            return;
        }
        const extfiles = this.config.external.split(';');
        for (const moduleName of extfiles) {
            if (!moduleName) continue;
            this.log.info(`Apply converter from module: ${moduleName}`);
            const sandbox = {
                require,
                module: {},
            };
            const converterCode = fs.readFileSync(moduleName, {encoding: 'utf8'});
            vm.runInNewContext(converterCode, sandbox);
            const converter = sandbox.module.exports;
            if (Array.isArray(converter)) {
                for (const item of converter) {
                    yield item;
                }
            } else {
                yield converter;
            }
        }
    }

    applyExternalConverters(){
        for (const definition of this.getExternalDefinition()) {
            const toAdd = {...definition};
            delete toAdd['homeassistant'];
            zigbeeHerdsmanConverters.addDeviceDefinition(toAdd);
        }
    }

    async doConnect() {
        let debugversion = '';
        try {
            const DebugIdentify = require('./debugidentify');
            debugversion = DebugIdentify.ReportIdentifier();
        }
        catch {
            debugversion = ' npm ...';
        }

        // installed version
        let gitVers = '';
        try {
            this.log.info('Starting Zigbee ' + debugversion);

            await this.getForeignObject('system.adapter.' + this.namespace, (err, obj) => {
                if (!err && obj && obj.common.installedFrom && obj.common.installedFrom.includes('://')) {
                    const instFrom = obj.common.installedFrom;
                    gitVers = gitVers + instFrom.replace('tarball','commit');
                } else {
                    gitVers = obj.common.installedFrom;
                }
                this.log.info('Installed Version: ' + gitVers );
            });

            await this.zbController.start();
        } catch (error) {
            this.setState('info.connection', false);
            this.log.error(`Failed to start Zigbee`);
            if (error.stack) {
                this.log.error(error.stack);
            } else {
                this.log.error(error);
            }
            if (this.reconnectCounter > 0) {
                this.tryToReconnect();
            }
        }
    }

    async onZigbeeAdapterDisconnected() {
        this.reconnectCounter = 5;
        this.log.error('Adapter disconnected, stopping');
        this.setState('info.connection', false);
        await this.callPluginMethod('stop');
        this.tryToReconnect();
    }

    tryToReconnect() {
        this.reconnectTimer = setTimeout(()=>{
            if (this.config.port.indexOf('tcp://') !== -1) {
                // Controller connect though WiFi.
                // Unlikely USB dongle, connection broken may only caused user unpluged the dongle,
                // WiFi connected gateway is possible that device connection is broken caused by
                // AP issue or Zigbee gateway power is turned off unexpectedly.
                // So try to reconnect gateway every 10 seconds all the time.
                this.log.info(`Try to reconnect.`);
            } else {
                this.log.info(`Try to reconnect. ${this.reconnectCounter} attempts left`);
                this.reconnectCounter -= 1;
            }
            this.doConnect();
        }, 10*1000); // every 10 seconds
    }

    async onZigbeeAdapterReady() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.log.info(`Zigbee started`);
        // https://github.com/ioBroker/ioBroker.zigbee/issues/668
        const extPanIdFix = this.config.extPanIdFix ? this.config.extPanIdFix : false;
        if (!extPanIdFix) {
            const configExtPanId = this.config.extPanID ? '0x'+this.config.extPanID.toLowerCase() : '0xdddddddddddddddd';
            let networkExtPanId = (await this.zbController.herdsman.getNetworkParameters()).extendedPanID;
            let needChange = false;
            this.log.debug(`Config value ${configExtPanId} : Network value ${networkExtPanId}`);
            const adapterType = this.config.adapterType || 'zstack';
            if (adapterType === 'zstack') {
                if (configExtPanId != networkExtPanId) {
                    // try to read from nvram
                    const result = await this.zbController.herdsman.adapter.znp.request(
                        1, // Subsystem.SYS
                        'osalNvRead',
                        {
                            id: 45, // EXTENDED_PAN_ID
                            len: 0x08,
                            offset: 0x00,
                        },
                        null, [
                            0, // ZnpCommandStatus.SUCCESS
                            2, // ZnpCommandStatus.INVALID_PARAM
                        ]
                    );
                    const nwExtPanId = '0x'+result.payload.value.reverse().toString('hex');
                    this.log.debug(`Config value ${configExtPanId} : nw value ${nwExtPanId}`);
                    if (configExtPanId != nwExtPanId) {
                        networkExtPanId = nwExtPanId;
                        needChange = true;
                    }
                } else {
                    needChange = true;
                }
            }
            if (needChange) {
                // need change config value and mark that fix is applied
                this.log.debug(`Fix extPanId value to ${networkExtPanId}. And restart adapter.`);
                this.updateConfig({extPanID: networkExtPanId.substr(2), extPanIdFix: true});
            } else {
                // only mark that fix is applied
                this.log.debug(`Fix without changes. And restart adapter.`);
                this.updateConfig({extPanIdFix: true});
            }
        }

        this.setState('info.connection', true);

        const devicesFromDB = await this.zbController.getClients(false);
        for (const device of devicesFromDB) {
            const entity = await this.zbController.resolveEntity(device);
            if (entity) {
                const model = (entity.mapped) ? entity.mapped.model : entity.device.modelID;
                this.stController.updateDev(device.ieeeAddr.substr(2), model, model, () => {
                    this.stController.syncDevStates(device, model);
                });
            }
        }
        await this.callPluginMethod('start', [this.zbController, this.stController]);
    }

    async checkIfModelUpdate(entity) {
        const model = (entity.mapped) ? entity.mapped.model : entity.device.modelID,
            device = entity.device,
            devId = device.ieeeAddr.substr(2);
        return new Promise((resolve) => {
            this.getObject(devId, (err, obj) => {
                if (obj && obj.common.type != model) {
                    // let's change model
                    this.getStatesOf(devId, (err, states) => {
                        if (!err && states) {
                            const chain = [];
                            states.forEach((state) => {
                                chain.push(this.deleteStateAsync(devId, null, state._id));
                            });
                            Promise.all(chain).then(()=>{
                                this.stController.deleteDeviceStates(devId, () => {
                                    this.stController.updateDev(devId, model, model, async () => {
                                        await this.stController.syncDevStates(device, model);
                                        resolve();
                                    });
                                });
                            });
                        } else {
                            resolve();
                        }
                    });
                } else {
                    resolve();
                }
            });
        });
    }



    async onZigbeeEvent(type, entity, message){
        this.log.debug(`Type ${type} device ${safeJsonStringify(entity)} incoming event: ${safeJsonStringify(message)}`);
        if (!entity.mapped) {
            return;
        }
        const device = entity.device,
            mappedModel = entity.mapped,
            model = (entity.mapped) ? entity.mapped.model : entity.device.modelID,
            cluster = message.cluster,
            devId = device.ieeeAddr.substr(2),
            meta = {device: device};
        //this assigment give possibility to use iobroker logger in code of the converters, via meta.logger
        meta.logger = this.log;

        await this.checkIfModelUpdate(entity);
        // always publish link_quality
        if (message.linkquality) {
            this.publishToState(devId, model, {linkquality: message.linkquality});
        }
        let converters = mappedModel.fromZigbee.filter(c => c && c.cluster === cluster && (
            (c.type instanceof Array) ? c.type.includes(type) : c.type === type));
        if (!converters.length && type === 'readResponse') {
            converters = mappedModel.fromZigbee.filter(c => c.cluster === cluster && (
                (c.type instanceof Array) ? c.type.includes('attributeReport') : c.type === 'attributeReport'));
        }
        if (!converters.length) {
            if (type != 'readResponse') {
                this.log.debug(
                    `No converter available for '${mappedModel.model}' with cluster '${cluster}' and type '${type}'`
                );
            }
            return;
        }

        converters.forEach((converter) => {
            const publish = (payload) => {
                this.log.debug(`Publish ${safeJsonStringify(payload)} to ${safeJsonStringify(devId)}`);
                if (payload) {
                    this.publishToState(devId, model, payload);
                }
            };

            this.stController.collectOptions(devId, model, (options) => {
                const payload = converter.convert(mappedModel, message, publish, options, meta);
                if (payload) {
                    // Add device linkquality.
                    publish(payload);
                }
            });
        });
    }

    publishToState(devId, model, payload) {
        this.stController.publishToState(devId, model, payload);
    }

    acknowledgeState(deviceId, model, stateDesc, value) {
        if (model === 'group') {
            const stateId = this.namespace + '.group_' + deviceId + '.' + stateDesc.id;
            this.setState(stateId, value, true);
        } else {
            const stateId = this.namespace + '.' + deviceId.replace('0x', '') + '.' + stateDesc.id;
            this.setState(stateId, value, true);
        }
    }

    processSyncStatesList(deviceId, model, syncStateList) {
        syncStateList.forEach((syncState) => {
            this.acknowledgeState(deviceId, model, syncState.stateDesc, syncState.value);
        });
    }

    async publishFromState(deviceId, model, stateModel, stateList, options){
        let isGroup = false;
        if (model == 'group') {
            isGroup = true;
            deviceId = parseInt(deviceId);
        }
        const entity = await this.zbController.resolveEntity(deviceId);
        this.log.debug(`entity: ${safeJsonStringify(entity)}`);
        const mappedModel = entity.mapped;
        this.log.debug('Mapped Model: ' +  JSON.stringify(mappedModel));

        stateList.forEach(async(changedState) => {
            const stateDesc = changedState.stateDesc;
            const value = changedState.value;

            if (stateDesc.isOption) {
                // acknowledge state with given value
                this.acknowledgeState(deviceId, model, stateDesc, value);
                // process sync state list
                //this.processSyncStatesList(deviceId, modelId, syncStateList);
                // if this is the device query state => trigger the device query

                // on activation of the 'device_query' state trigger hardware query where possible
                if (stateDesc.id == 'device_query') {
                    if (this.query_device_block.indexOf(deviceId) > -1) {
                        this.log.warn(`Device query for '${entity.device.ieeeAddr}' blocked`);
                        return;
                    }
                    if (mappedModel) {
                        this.query_device_block.push(deviceId);
                        this.log.debug(`Device query for '${entity.device.ieeeAddr}' started`);
                        for (const converter of mappedModel.toZigbee) {
                            if (converter.hasOwnProperty('convertGet')) {
                                for (const ckey of converter.key) {
                                    try {
                                        await converter.convertGet(entity.device.endpoints[0], ckey, {});
                                    } catch (error) {
                                        this.log.warn(`Failed to read state '${JSON.stringify(ckey)}'of '${entity.device.ieeeAddr}' after query with '${JSON.stringify(error)}'`);
                                    }
                                }
                            }
                        }
                        this.log.debug(`Device query for '${entity.device.ieeeAddr}' done`);
                        const idToRemove = deviceId;
                        setTimeout(()=>{
                            const idx = this.query_device_block.indexOf(idToRemove);
                            if (idx > -1)  this.query_device_block.splice(idx);
                        }, 10000);
                    }
                    return;
                }
                return;
            }
            const converter = mappedModel.toZigbee.find((c) => c && (c.key.includes(stateDesc.prop) || c.key.includes(stateDesc.setattr) || c.key.includes(stateDesc.id)));
            if (!converter) {
                this.log.error(`No converter available for '${model}' with key '${stateDesc.id}' `);
                return;
            }

            const preparedValue = (stateDesc.setter) ? stateDesc.setter(value, options) : value;
            const preparedOptions = (stateDesc.setterOpt) ? stateDesc.setterOpt(value, options) : {};
            let syncStateList = [];
            if (stateModel && stateModel.syncStates) {
                stateModel.syncStates.forEach((syncFunct) => {
                    const res = syncFunct(stateDesc, value, options);
                    if (res) {
                        syncStateList = syncStateList.concat(res);
                    }
                });
            }

            const epName = stateDesc.epname !== undefined ? stateDesc.epname : (stateDesc.prop || stateDesc.id);
            const key = stateDesc.setattr || stateDesc.prop || stateDesc.id;
            this.log.debug(`convert ${key}, ${preparedValue}, ${safeJsonStringify(preparedOptions)}`);

            let target;
            if (model === 'group') {
                target = entity.mapped;
            } else {
                target = await this.zbController.resolveEntity(deviceId, epName);
                target = target.endpoint;
            }
            this.log.debug(`target: ${safeJsonStringify(target)}`);
            const meta = {
                endpoint_name: epName,
                options: preparedOptions,
                device: entity.device,
                mapped: (model == 'group') ? [] : mappedModel,
                message: {[key]: preparedValue},
                logger: this.log,
                state: {},
            };
            if (preparedOptions.hasOwnProperty('state')) {
                meta.state = preparedOptions.state;
            }
            try {
                const result = await converter.convertSet(target, key, preparedValue, meta);
                this.log.debug(`convert result ${safeJsonStringify(result)}`);
                if (stateModel && !isGroup)
                    this.acknowledgeState(deviceId, model, stateDesc, value);
                // process sync state list
                this.processSyncStatesList(deviceId, model, syncStateList);
                if (isGroup) {
                    await this.callPluginMethod('queryGroupMemberState', [deviceId, stateDesc])
                    this.acknowledgeState(deviceId, model, stateDesc, value);
                }
            } catch(error) {
                this.filterError(`Error ${error.code} on send command to ${deviceId}.`+
                   ` Error: ${error.stack}`, `Send command to ${deviceId} failed with`, error);
            }
        });
    }
    //
    //
    // This function is introduced to explicitly allow user level scripts to send Commands
    // directly to the zigbee device. It utilizes the zigbee-herdsman-converters to generate
    // the exact zigbee message to be sent and can be used to set device options which are
    // not exposed as states. It serves as a wrapper function for "publishFromState" with
    // extended parameter checking
    //
    // This function is NEVER called from within the adapter itself. The entire structure
    // is built for end user use.
    // The payload can either be a JSON object or the string representation of a JSON object
    // The following keys are supported in the object:
    // device: name of the device. For a device zigbee.0.0011223344556677 this would be 0011223344556677
    // payload: The data to send to the device as JSON object (key/Value pairs)
    // endpoint: optional: the endpoint to send the data to, if supported.
    //
    async SendPayload(payload) {
        this.log.debug(`publishToDevice called with ${safeJsonStringify(payload)}`);
        let payload_obj = {};
        if (typeof payload === 'string') {
            try {
                payload_obj = JSON.parse()
            } catch (e) {
                this.log.error(`Unable to parse ${safeJsonStringify(payload)}: ${safeJsonStringify(e)}`)
                return {success:false, error: `Unable to parse ${safeJsonStringify(payload)}: ${safeJsonStringify(e)}`};
            }
        } else if (typeof payload === 'object') {
            payload_obj = payload;
        }
        if (payload_obj.hasOwnProperty('device') && payload_obj.hasOwnProperty('payload'))
        {
            try {
                const isDevice =  payload.device.indexOf('group_') == -1;
                let stateList = [];
                const devID = (isDevice ? `0x${payload.device}`:parseInt(payload.device.replace('group_', '')));
                this.log.warn(`A ${payload.device} ${devID}`);

                const entity = await this.zbController.resolveEntity(devID);;
                if (!entity) {
                    this.log.error(`Device ${safeJsonStringify(payload_obj.device)} not found`);
                    return {success: false, error: `Device ${safeJsonStringify(payload_obj.device)} not found`};
                }
                const mappedModel = entity.mapped;
                if (!mappedModel) {
                    this.log.error(`No Model for Device ${safeJsonStringify(payload_obj.device)}`);
                    return {success: false, error: `No Model for Device ${safeJsonStringify(payload_obj.device)}`};
                }
                if (typeof payload_obj.payload !== 'object') {
                    this.log.error(`Illegal payload type for ${safeJsonStringify(payload_obj.device)}`);
                    return {success: false, error: `Illegal payload type for ${safeJsonStringify(payload_obj.device)}`};
                }
                for (var key in payload_obj.payload) {
                    if (payload_obj.payload[key] != undefined) {
                        const datatype = typeof payload_obj.payload[key];
                        stateList.push({stateDesc: {
                            id:key,
                            prop:key,
                            role:'state',
                            type:datatype,
                            epname:payload_obj.endpoint,
                        }, value: payload_obj.payload[key], index:0, timeout:0})
                    }
                }
                try {
                    this.log.debug(`Calling publish to state for ${safeJsonStringify(payload_obj.device)} with ${safeJsonStringify(stateList)}`)
                    await this.publishFromState(devID, (isDevice ? '': 'group'), undefined, stateList, undefined);
                    return {success: true};
                }
                catch (error)
                {
                    this.filterError(`Error ${error.code} on send command to ${payload.device}.`+
                       ` Error: ${error.stack}`, `Send command to ${payload.device} failed with`, error);
                    return {success:false, error: error};
                }
            }
            catch (e) {
                return {success:false, error: e};
            }

        }
        return {success:false, error: 'missing parameter device or payload in message ' + JSON.stringify(payload)};
    }


    newDevice(entity) {
        this.log.debug(`New device event: ${safeJsonStringify(entity)}`);
        const dev = entity.device;
        if (dev) {
            this.getObject(dev.ieeeAddr.substr(2), (err, obj) => {
                if (!obj) {
                    const model = (entity.mapped) ? entity.mapped.model : entity.device.modelID;
                    this.log.debug(`new device ${dev.ieeeAddr} ${dev.networkAddress} ${model} `);
                    this.logToPairing(`New device joined '${dev.ieeeAddr}' model ${model}`, true);
                    this.stController.updateDev(dev.ieeeAddr.substr(2), model, model, () => {
                        this.stController.syncDevStates(dev, model);
                    });
                }
                //                else this.log.warn(`Device ${safeJsonStringify(entity)} rejoined, no new device`);
            });
        }
    }

    leaveDevice(ieeeAddr) {
        this.log.debug(`Leave device event: ${ieeeAddr}`);
        if (ieeeAddr) {
            const devId = ieeeAddr.substr(2);
            this.log.debug('Delete device ' + devId + ' from iobroker.');
            this.stController.deleteDeviceStates(devId);
        }
    }

    async callPluginMethod(method, parameters) {
        for (const plugin of this.plugins) {
            if (plugin[method]) {
                try {
                    if (parameters !== undefined) {
                        await plugin[method](...parameters);
                    } else {
                        await plugin[method]();
                    }
                } catch (error) {
                    if (error && !error.hasOwnProperty('code'))
                        this.log.error(`Failed to call '${plugin.constructor.name}' '${method}' (${error.stack})`);
                    throw error;
                }
            }
        }
    }

    /**
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            if (this.config.debugHerdsman) {
                debug.disable();
                debug.log = originalLogMethod;
            }

            this.log.info('cleaned everything up...');
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            await this.callPluginMethod('stop');
            if (this.zbController) {
                await this.zbController.stop();
            }
            callback();
        } catch (error) {
            this.log.error(`Unload error (${error.stack})`);
            callback();
        }
    }

    getZigbeeOptions() {
        // file path for db
        const dataDir = (this.systemConfig) ? this.systemConfig.dataDir : '';
        const dbDir = pathLib.normalize(utils.controllerDir + '/' + dataDir + this.namespace.replace('.', '_'));
        if (this.systemConfig && !fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
        const port = this.config.port;
        if (!port) {
            this.log.error('Serial port not selected! Go to settings page.');
        }
        const panID = parseInt(this.config.panID ? this.config.panID : 0x1a62);
        const channel = parseInt(this.config.channel ? this.config.channel : 11);
        const precfgkey = createByteArray(this.config.precfgkey ? this.config.precfgkey : '01030507090B0D0F00020406080A0C0D');
        const extPanId = createByteArray(this.config.extPanID ? this.config.extPanID : 'DDDDDDDDDDDDDDDD').reverse();
        const adapterType = this.config.adapterType || 'zstack';
        // https://github.com/ioBroker/ioBroker.zigbee/issues/668
        const extPanIdFix = this.config.extPanIdFix ? this.config.extPanIdFix : false;

        return {
            net: {
                panId: panID,
                extPanId: extPanId,
                channelList: [channel],
                precfgkey: precfgkey
            },
            sp: {
                port: port,
                baudRate: 115200,
                rtscts: false,
                adapter: adapterType,
            },
            dbDir: dbDir,
            dbPath: 'shepherd.db',
            backupPath: 'nvbackup.json',
            disableLed: this.config.disableLed,
            disablePing: this.config.disablePing,
            transmitPower: this.config.transmitPower,
            extPanIdFix: extPanIdFix,
        };
    }

    onPairing(message, data) {
        if (Number.isInteger(data)) {
            this.setState('info.pairingCountdown', data);
        }
        if (data === 0) {
            // set pairing mode off
            this.setState('info.pairingMode', false);
        }
        if (data) {
            this.logToPairing(`${message}: ${data.toString()}`);
        } else {
            this.logToPairing(`${message}`);
        }
    }

    logToPairing(message) {
        this.setState('info.pairingMessage', message);
    }

    onLog(level, msg, data) {
        if (msg) {
            let logger = this.log.info;
            switch (level) {
                case 'error':
                    logger = this.log.error;
                    if (data)
                        data = data.toString();
                    this.logToPairing('Error: ' + msg + '. ' + data, true);
                    break;
                case 'debug':
                    logger = this.log.debug;
                    break;
                case 'info':
                    logger = this.log.info;
                    break;
                case 'warn':
                    logger = this.log.warn;
                    break;
            }
            if (data) {
                if (typeof data === 'string') {
                    logger(msg + '. ' + data);
                } else {
                    logger(msg + '. ' + safeJsonStringify(data));
                }
            } else {
                logger(msg);
            }
        }
    }


}


if (module && module.parent) {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Zigbee(options);
} else {
    // or start the instance directly
    new Zigbee();
}
