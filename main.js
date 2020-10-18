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

const createByteArray = function (hexString) {
    const bytes = [];
    for (let c = 0; c < hexString.length; c += 2) {
        bytes.push(parseInt(hexString.substr(c, 2), 16));
    }
    return bytes;
};

class Zigbee extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super(Object.assign(options || {}, {
            name: 'zigbee',
            systemConfig: true,
        }));
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));

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
            new OtaPlugin(this),
            new BackupPlugin(this),
        ];
    }

    debugLog (data) {
        this.log.debug(data.slice(data.indexOf('zigbee-herdsman')));
    }

    async onReady() {
        if (this.config.debugHerdsman) {
            debug.log = this.debugLog.bind(this);
            debug.enable('zigbee-herdsman*');
        }

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
        this.callPluginMethod('configure', [zigbeeOptions]);

        this.reconnectCounter = 1;
        this.doConnect();
    }

    async doConnect() {
        try {
            this.log.info(`Starting Zigbee...`);
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

    onZigbeeAdapterDisconnected() {
        this.reconnectCounter = 5;
        this.log.error('Adapter disconnected, stopping');
        this.setState('info.connection', false);
        this.callPluginMethod('stop');
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
            if (configExtPanId != networkExtPanId) {
                const adapterType = this.config.adapterType || 'zstack';
                if (adapterType === 'zstack') {
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
        const devices = await this.zbController.getClients(false);
        for (const device of devices) {
            const entity = await this.zbController.resolveEntity(device);
            if (entity) {
                const model = (entity.mapped) ? entity.mapped.model : entity.device.modelID;
                this.stController.updateDev(device.ieeeAddr.substr(2), model, model, () => {
                    this.stController.syncDevStates(device, model);
                });
            }
        }
        this.callPluginMethod('start', [this.zbController, this.stController]);
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

        let converters = mappedModel.fromZigbee.filter(c => c.cluster === cluster && (
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
                this.log.debug(`Publish ${safeJsonStringify(payload)}`);
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
        this.log.debug(`State changes. dev: ${deviceId} model: ${model} states: ${safeJsonStringify(stateList)} opt: ${safeJsonStringify(options)}`);
        if (model == 'group') {
            deviceId = parseInt(deviceId);
        }
        const entity = await this.zbController.resolveEntity(deviceId);
        this.log.debug(`entity: ${safeJsonStringify(entity)}`);
        const mappedModel = entity.mapped;

        stateList.forEach(async(changedState) => {
            const stateDesc = changedState.stateDesc;
            const value = changedState.value;

            if (stateDesc.isOption) {
                // acknowledge state with given value
                this.acknowledgeState(deviceId, model, stateDesc, value);
                // process sync state list
                //this.processSyncStatesList(deviceId, modelId, syncStateList);
                return;
            }

            const converter = mappedModel.toZigbee.find((c) => c.key.includes(stateDesc.prop) || c.key.includes(stateDesc.setattr) || c.key.includes(stateDesc.id));
            if (!converter) {
                this.log.error(`No converter available for '${model}' with key '${stateDesc.id}'`);
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

                this.acknowledgeState(deviceId, model, stateDesc, value);
                // process sync state list
                this.processSyncStatesList(deviceId, model, syncStateList);
            } catch(error) {
                this.log.error(`Error on send command to ${deviceId}. Error: ${error.stack}`);
            }
        });
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

    callPluginMethod(method, parameters) {
        for (const plugin of this.plugins) {
            if (plugin[method]) {
                try {
                    if (parameters !== undefined) {
                        plugin[method](...parameters);
                    } else {
                        plugin[method]();
                    }
                } catch (error) {
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
            this.callPluginMethod('stop');
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
