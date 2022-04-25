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
const path = require('path');
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
const util = require('util');

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

let _pairingMode = false;

const errorCodes = {
    9999: { severity:E_INFO, message:'No response'},
    233: { severity:E_DEBUG, message:'MAC NO ACK'},
    205: { severity:E_WARN, message:'No network route'},
    134: { severity:E_WARN, message:'Unnsupported Attribute'},
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
                case 'SendToDevice': {
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
    }

    sendError(error, message) {
        if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
            const sentryInstance = this.getPluginInstance('sentry');
            if (sentryInstance) {
                const Sentry = sentryInstance.getSentryObject();
                if (Sentry) {
                    if (message) {
                        Sentry.configureScope(scope => {
                            scope.addBreadcrumb({
                                type: "error", // predefined types
                                category: "error message",
                                level: Sentry.Severity.Error,
                                message: message
                            });
                        });
                    }
                    if (typeof error == 'string') {
                        Sentry.captureException(new Error(error));
                    } else {
                        Sentry.captureException(error);
                    }
                }
            }
        }
    }

    filterError(errormessage, message, error) {
        if (error.code === undefined)
        {
            let em =  error.stack.match(/failed \((.+?)\) at/);
            if (!em) em = error.stack.match(/failed \((.+?)\)/);
            this.log.error(`${message} no error code (${(em ? em[1]:'undefined')})`);
            this.sendError(error, `${message} no error code`);
            this.log.debug(`Stack trace for ${em}: ${error.stack}`);
            return;
        }
        const ecode = errorCodes[error.code];
        if (ecode === undefined) {
            this.log.error(errormessage);
            this.sendError(error, errormessage);
            return;
        }
        switch (ecode.severity) {
            case E_INFO: this.log.info(`${message}: Code ${error.code} (${ecode.message})`);
                break;
            case E_DEBUG: this.log.debug(`${message}: Code ${error.code} (${ecode.message})`);
                break;
            case E_WARN: this.log.warn(`${message}: Code ${error.code} (${ecode.message})`);
                break;
            case E_ERROR:
                this.log.error(`${message}: Code ${error.code} (${ecode.message})`);
                this.sendError(error, `${message}: Code ${error.code} (${ecode.message})`);
                break;
            default:
                this.log.error(`${message}: Code ${error.code} (malformed error)`);
                this.sendError(error, `${message}: Code ${error.code} (malformed error)`);
        }
    }

    debugLog (data, ...args) {
        const message = (args) ? util.format(data, ...args) : data;
        this.log.debug(message.slice(message.indexOf('zigbee-herdsman')));
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
        this.setState('info.connection', false, true);
        const zigbeeOptions = this.getZigbeeOptions();
        this.zbController = new ZigbeeController(this);
        this.zbController.on('log', this.onLog.bind(this));
        this.zbController.on('ready', this.onZigbeeAdapterReady.bind(this));
        this.zbController.on('disconnect', this.onZigbeeAdapterDisconnected.bind(this));
        this.zbController.on('new', this.newDevice.bind(this));
        this.zbController.on('leave', this.leaveDevice.bind(this));
        this.zbController.on('pairing', this.onPairing.bind(this));
        this.zbController.on('event', this.onZigbeeEvent.bind(this));
        this.zbController.on('msg', this.onZigbeeEvent.bind(this));
        this.zbController.on('publish', this.publishToState.bind(this));
        this.zbController.on('deviceStatusUpdate', this.onDeviceStatusUpdate.bind(this));
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
            const sandbox = {
                require,
                module: {},
            };
            const mN = (fs.existsSync(moduleName) ? moduleName : this.expandFileName(moduleName).replace('.', '_'));
            if (!fs.existSync(mN)) {
              this.log.warn(`External converter not loaded - neither ${moduleName} nor ${mN} exist.`)

            }
            else {
                const converterCode = fs.readFileSync(mN, {encoding: 'utf8'}).toString();
                let converterLoaded = true;
                if (converterCode.match(/..\/lib\/legacy/gm)) {
                    this.log.warn(`External converter ${mN} contains an unsupported reference to '/lib/legacy' - external converter not loaded.`)
                    converterLoaded = false;
                }
                else
                {
                    // remove the require statements and attempt to place them in the sandbox
                    const requiredLibraries = converterCode.matchAll(/(\w+) += +require\(['"](\S+)['"]\);/gm);
                    for (const line of requiredLibraries) {
                        try {
                            sandbox[line[1]] = require(line[2]);
                        }
                        catch (e) {
                            this.log.warn(`error adding ${line[1]} to the sandbox: ${e}`);
                            converterLoaded = false;
                        }
                    }
                }
                if (converterLoaded) {
                    this.log.info(`Apply converter from module: ${mN}`);
                    this.log.warn(converterCode.replace(/const (\w+) += +require\(['"](\S+)['"]\);/gm, ''));
                    try {
                        vm.runInNewContext(converterCode.replace(/const (\w+) += +require\(['"](\S+)['"]\);/gm, ''), sandbox);
                        const converter = sandbox.module.exports;

                        if (Array.isArray(converter)) for (const item of converter) yield item;
                        else yield converter;
                    }
                    catch (e) {
                        this.log.error(`Unable to apply converter from module: ${mN} - the code does not run: ${e}`)
                    }
                }
                else
                    this.log.info(`Ignoring converter from module: ${mN} - see warn messages for reason`);

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
            this.setState('info.connection', false, true);
            this.log.error(`Failed to start Zigbee`);
            if (error.stack) {
                this.log.error(error.stack);
            } else {
                this.log.error(error);
            }
            this.sendError(error, `Failed to start Zigbee`);
            if (this.reconnectCounter > 0) {
                this.tryToReconnect();
            }
        }
    }

    async onZigbeeAdapterDisconnected() {
        this.reconnectCounter = 5;
        this.log.error('Adapter disconnected, stopping');
        this.sendError('Adapter disconnected, stopping');
        this.setState('info.connection', false, true);
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
                    try {
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
                    } catch (e) {
                        this.log.error(`Unable to apply ExtPanID changes: ${e}`);
                        this.sendError(e, `Unable to apply ExtPanID changes`);
                        needChange = false;
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

        this.setState('info.connection', true, true);

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
        // publish raw event to "from_zigbee"
        // some cleanup
        const msgForState = Object.assign({}, message);
        delete msgForState['device'];
        delete msgForState['endpoint'];
        msgForState['endpoint_id'] = message.endpoint.ID;
        this.publishToState(devId, model, {msg_from_zigbee: safeJsonStringify(msgForState)});

        if (!entity.mapped) {
            return;
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
        if (!mappedModel) {
            this.log.debug(`No mapped model for ${model}`);
            return;
        }
        this.log.debug('Mapped Model: ' +  JSON.stringify(mappedModel));

        stateList.forEach(async(changedState) => {
            const stateDesc = changedState.stateDesc;
            const value = changedState.value;

            if (stateDesc.id == 'send_payload') {
                try {
                    const json_value = JSON.parse(value);
                    const payload = { device:deviceId.replace('0x', ''), payload:json_value };
                    const result = await(this.SendPayload(payload));
                    if (result.hasOwnProperty('success') && result.success) {
                        this.acknowledgeState(deviceId, model, stateDesc, value);
                    }
                } catch (error) {
                    this.log.warn(`send_payload: ${value} does not parse as JSON Object : ${error.message}`);
                    return;
                }
                return;
            }

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
                this.sendError(`No converter available for '${model}' with key '${stateDesc.id}' `);
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
            this.log.debug(`convert ${key}, ${safeJsonStringify(preparedValue)}, ${safeJsonStringify(preparedOptions)}`);

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
                if (result !== undefined) {
                    if (stateModel && !isGroup)
                        this.acknowledgeState(deviceId, model, stateDesc, value);
                    // process sync state list
                    this.processSyncStatesList(deviceId, model, syncStateList);
                    if (isGroup) {
                        await this.callPluginMethod('queryGroupMemberState', [deviceId, stateDesc]);
                        this.acknowledgeState(deviceId, model, stateDesc, value);
                    }
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
                payload_obj = JSON.parse();
            } catch (e) {
                this.log.error(`Unable to parse ${safeJsonStringify(payload)}: ${safeJsonStringify(e)}`);
                this.sendError(e, `Unable to parse ${safeJsonStringify(payload)}: ${safeJsonStringify(e)}`);
                return {success:false, error: `Unable to parse ${safeJsonStringify(payload)}: ${safeJsonStringify(e)}`};
            }
        } else if (typeof payload === 'object') {
            payload_obj = payload;
        }
        if (payload_obj.hasOwnProperty('device') && payload_obj.hasOwnProperty('payload'))
        {
            try {
                const isDevice =  payload.device.indexOf('group_') == -1;
                const stateList = [];
                const devID = (isDevice ? `0x${payload.device}`:parseInt(payload.device.replace('group_', '')));

                const entity = await this.zbController.resolveEntity(devID);
                if (!entity) {
                    this.log.error(`Device ${safeJsonStringify(payload_obj.device)} not found`);
                    this.sendError(`Device ${safeJsonStringify(payload_obj.device)} not found`);
                    return {success: false, error: `Device ${safeJsonStringify(payload_obj.device)} not found`};
                }
                const mappedModel = entity.mapped;
                if (!mappedModel) {
                    this.log.error(`No Model for Device ${safeJsonStringify(payload_obj.device)}`);
                    this.sendError(`No Model for Device ${safeJsonStringify(payload_obj.device)}`);
                    return {success: false, error: `No Model for Device ${safeJsonStringify(payload_obj.device)}`};
                }
                if (typeof payload_obj.payload !== 'object') {
                    this.log.error(`Illegal payload type for ${safeJsonStringify(payload_obj.device)}`);
                    this.sendError(`Illegal payload type for ${safeJsonStringify(payload_obj.device)}`);
                    return {success: false, error: `Illegal payload type for ${safeJsonStringify(payload_obj.device)}`};
                }
                for (const key in payload_obj.payload) {
                    if (payload_obj.payload[key] != undefined) {
                        const datatype = typeof payload_obj.payload[key];
                        stateList.push({stateDesc: {
                            id:key,
                            prop:key,
                            role:'state',
                            type:datatype,
                            epname:payload_obj.endpoint,
                        }, value: payload_obj.payload[key], index:0, timeout:0});
                    }
                }
                try {
                    this.log.debug(`Calling publish to state for ${safeJsonStringify(payload_obj.device)} with ${safeJsonStringify(stateList)}`);
                    await this.publishFromState(`0x${payload.device}`, '', undefined, stateList, payload.options);
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
                    if (error && !error.hasOwnProperty('code')) {
                        this.log.error(`Failed to call '${plugin.constructor.name}' '${method}' (${error.stack})`);
                        this.sendError(error, `Failed to call '${plugin.constructor.name}' '${method}'`);
                    }
                    throw error;
                }
            }
        }
    }
    async onDeviceStatusUpdate(deviceId, status) {
        if (!deviceId) return;

        this.log.debug(`onDeviceStatusUpdate: ${deviceId}: ${status}`);

        if (_pairingMode) return;
        
        try {
            let colorIeee = '#46a100ff';

            if (!status) {
                colorIeee = '#ff0400ff'; // dev is offline
            }

            if (!this.config.colorize) {
                colorIeee = null;
            }

            await this.extendObjectAsync(deviceId, {
                common: {
                    color: colorIeee
                }
            });
        } catch (e) {
            this.log.error(e.toString());
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
            if (error) {
                this.log.error(`Unload error (${error.stack})`);
            }
            this.sendError(error, `Unload error`);
            callback();
        }
    }

    getZigbeeOptions() {
        // file path for db
        let dbDir = path.join(utils.getAbsoluteInstanceDataDir(this), '');
        dbDir = dbDir.replace('.', '_');

        if (this.systemConfig && !fs.existsSync(dbDir)) {
            try {
                fs.mkdirSync(dbDir);
            } catch (e) {
                this.log.error(`Cannot create directory ${dbDir}: ${e}`);
                this.sendError(`Cannot create directory ${dbDir}: ${e}`);
            }
        }
        const port = this.config.port;
        if (!port) {
            this.log.error('Serial port not selected! Go to settings page.');
            this.sendError('Serial port not selected! Go to settings page.');
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
            startWithInconsistent: this.config.startWithInconsistent || false,
        };
    }

    onPairing(message, data) {
        if (Number.isInteger(data)) {
            _pairingMode = true;
            this.setState('info.pairingCountdown', data, true);
        }
        if (data === 0) {
            // set pairing mode off
            _pairingMode = false;
            this.setState('info.pairingMode', false,true);
        }
        if (data) {
            this.logToPairing(`${message}: ${data.toString()}`);
        } else {
            this.logToPairing(`${message}`);
        }
    }

    logToPairing(message) {
        this.setState('info.pairingMessage', message, true);
    }

    expandFileName(fn) {
      return path.join(utils.getAbsoluteInstanceDataDir(this), fn);
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
                    this.sendError('Error: ' + msg + '. ' + data);
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
