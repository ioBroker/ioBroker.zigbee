/**
 *
 * Zigbee devices adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

//const debug = require("debug");
//debug.enable('zigbee*');

const safeJsonStringify = require('./lib/json');
const fs = require('fs');
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const SerialListPlugin = require('./lib/seriallist');
const CommandsPlugin = require('./lib/commands');
const GroupsPlugin = require('./lib/groups');
const NetworkMapPlugin = require('./lib/networkmap');
const DeveloperPlugin = require('./lib/developer');
const BindingPlugin = require('./lib/binding');
const OtaPlugin = require('./lib/ota');
const ZigbeeController = require('./lib/zigbeecontroller');
const StatesController = require('./lib/statescontroller');

class Zigbee extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super(Object.assign(options || {}, {
            name: "zigbee",
            systemConfig: true,
        }));
        this.on("ready", this.onReady.bind(this));
        this.on("unload", this.onUnload.bind(this));

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
        ];
    }

    async onReady() {
        this.subscribeStates('*');
        // set connection false before connect to zigbee
        this.setState('info.connection', false);
        const zigbeeOptions = this.getZigbeeOptions();
        this.zbController = new ZigbeeController(zigbeeOptions);
        this.zbController.on('log', this.onLog.bind(this));
        this.zbController.on('ready', this.onZigbeeAdapterReady.bind(this));
        this.zbController.on('disconnect', this.onZigbeeAdapterDisconnected.bind(this));
        this.zbController.on('new', this.newDevice.bind(this));
        this.zbController.on('leave', this.leaveDevice.bind(this));
        this.zbController.on('pairing', this.onPairing.bind(this));
        this.zbController.on('event', this.onZigbeeEvent.bind(this));
        this.zbController.on('msg', this.onZigbeeEvent.bind(this));
        this.zbController.on('publish', this.publishToState.bind(this));

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
        };
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
            this.log.info(`Try to reconnect. ${this.reconnectCounter} attempts left`);
            this.reconnectCounter -= 1;
            this.doConnect();
        }, 10*1000); // every 10 seconds
    }

    async onZigbeeAdapterReady() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.log.info(`Zigbee started`);
        this.setState('info.connection', true);
        const devices = await this.zbController.getClients(false);
        for (const device of devices) {
            this.stController.updateDev(device.ieeeAddr.substr(2), device.modelID, device.modelID, () => {
                  this.stController.syncDevStates(device);
            });
        }
        this.callPluginMethod('start', [this.zbController, this.stController]);
    }

    onZigbeeEvent(type, entity, message){
        this.log.debug(`Type ${type} device ${safeJsonStringify(entity)} incoming event: ${safeJsonStringify(message)}`);
        const device = entity.device,
              mappedModel = entity.mapped,
              modelID = device.modelID,
              cluster = message.cluster,
              devId = device.ieeeAddr.substr(2),
              meta = {device: device};
        if (!mappedModel) {
            return;
        }
        // always publish link_quality
        if (message.linkquality) {
            this.publishToState(devId, modelID, {linkquality: message.linkquality});
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
                // Don't cache messages with click and action.
                const cache = !payload.hasOwnProperty('click') && !payload.hasOwnProperty('action');
                this.log.debug(`Publish ${safeJsonStringify(payload)}`);
                if (payload) {
                    this.publishToState(devId, modelID, payload);
                }
            };

            this.stController.collectOptions(devId, modelID, (options) => {
                const payload = converter.convert(mappedModel, message, publish, options, meta);
                if (payload) {
                    // Add device linkquality.
                    publish(payload);
                }
            });
        });
    }

    publishToState(devId, modelID, payload) {
    	this.stController.publishToState(devId, modelID, payload);
    }

    acknowledgeState(deviceId, modelId, stateDesc, value) {
        if (modelId === 'group') {
            let stateId = this.namespace + '.group_' + deviceId + '.' + stateDesc.id;
            this.setState(stateId, value, true);
        } else {
            let stateId = this.namespace + '.' + deviceId.replace('0x', '') + '.' + stateDesc.id;
            this.setState(stateId, value, true);
        }
    }

    processSyncStatesList(deviceId, modelId, syncStateList) {
        syncStateList.forEach((syncState) => {
            this.acknowledgeState(deviceId, modelId, syncState.stateDesc, syncState.value);
        });
    }

    async publishFromState(deviceId, modelId, stateModel, stateList, options){
        this.log.debug(`State changes. dev: ${deviceId} model: ${modelId} states: ${safeJsonStringify(stateList)} opt: ${safeJsonStringify(options)}`);
        if (modelId == 'group') {
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
                this.acknowledgeState(deviceId, modelId, stateDesc, value);
                // process sync state list
                this.processSyncStatesList(deviceId, modelId, syncStateList);
                return;
            }

            const converter = mappedModel.toZigbee.find((c) => c.key.includes(stateDesc.prop) || c.key.includes(stateDesc.setattr) || c.key.includes(stateDesc.id));
            if (!converter) {
                this.log.error(`No converter available for '${mappedModel.model}' with key '${stateKey}'`);
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
            if (modelId === 'group') {
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
                mapped: mappedModel,
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

                this.acknowledgeState(deviceId, modelId, stateDesc, value);
                // process sync state list
                this.processSyncStatesList(deviceId, modelId, syncStateList);
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
            if (obj) {
            } else {
              this.log.debug('new device ' + dev.ieeeAddr + ' ' + dev.networkAddress + ' ' + dev.modelID);
              this.logToPairing(`New device joined '${dev.ieeeAddr}' model ${dev.modelID}`, true);
              this.stController.updateDev(dev.ieeeAddr.substr(2), dev.modelID, dev.modelID, () => {
                  this.stController.syncDevStates(dev);
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
            this.log.info("cleaned everything up...");
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
        const dbDir = utils.controllerDir + '/' + dataDir + this.namespace.replace('.', '_');
        if (this.systemConfig && !fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
        const port = this.config.port;
        if (!port) {
            this.log.error('Serial port not selected! Go to settings page.');
        }
        const createByteArray = function (hexString) {
            for (var bytes = [], c = 0; c < hexString.length; c += 2) {
                bytes.push(parseInt(hexString.substr(c, 2), 16));
            }
            return bytes;
        }
        const panID = parseInt(this.config.panID ? this.config.panID : 0x1a62);
        const channel = parseInt(this.config.channel ? this.config.channel : 11);
        const precfgkey = createByteArray(this.config.precfgkey ? this.config.precfgkey : '01030507090B0D0F00020406080A0C0D');
        const extPanId = createByteArray(this.config.extPanID ? this.config.extPanID : 'DDDDDDDDDDDDDDDD').reverse();
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
                rtscts: false
            },
            dbPath: dbDir + '/shepherd.db',
            backupPath: dbDir + '/backup.json',
            disableLed: this.config.disableLed,
            transmitPower: this.config.transmitPower,
        };
    }

    onPairing(message, data) {
        if (data != this.undefined) {
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
