/**
 *
 * Zigbee devices adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

//process.env.DEBUG = 'zigbee*,cc-znp*';

const safeJsonStringify = require('./lib/json');
// you have to require the utils module and call adapter function
const fs = require('fs');
const utils = require('@iobroker/adapter-core'); // Get common adapter utils

const SerialListPlugin = require('./lib/plugins/seriallist');
const CommandsPlugin = require('./lib/plugins/commands');
const ZigbeeController = require('./lib/zigbeecontroller');
const StatesController = require('./lib/statescontroller');


class Zigbee extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super(Object.assign({}, options, {
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
        ];
    }

    async onReady() {
        //if (this.log.level === 'debug') {
            // const oldStdOut = process.stdout.write.bind(process.stdout);
            // const oldErrOut = process.stderr.write.bind(process.stderr);
            // process.stdout.write = function (logs) {
            //     if (this.log && this.log.debug) {
            //         this.log.debug(logs.replace(/(\r\n\t|\n|\r\t)/gm, ""));
            //     }
            //     oldStdOut(logs);
            // };
            // process.stderr.write = function (logs) {
            //     if (this.log && this.log.debug) {
            //         this.log.debug(logs.replace(/(\r\n\t|\n|\r\t)/gm, ""));
            //     }
            //     oldErrOut(logs);
            // };
        //}
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
        };
    }

    onZigbeeAdapterDisconnected() {
        this.log.error('Adapter disconnected, stopping');
        this.setState('info.connection', false);
        this.callPluginMethod('stop');
    }

    onZigbeeAdapterReady() {
        this.log.info(`Zigbee started`);
        this.setState('info.connection', true);
        this.callPluginMethod('start', [this.zbController, this.stController]);
    }

    onZigbeeEvent(type, devId, message, data){
        this.log.debug(`Type ${type} device ${devId} incoming event: ${safeJsonStringify(message)}`);
    }

    publishFromState(deviceId, modelId, stateKey, state, options){

    }

    newDevice(entity) {
        //let dev = this.zbController.getDevice(id);
        const dev = entity.device;
        if (dev) {
            this.log.debug('new dev ' + dev.ieeeAddr + ' ' + dev.networkAddress + ' ' + dev.modelId);
            this.logToPairing(`New device joined '${dev.ieeeAddr}' model ${dev.modelId}`, true);
            this.updateDev(dev.ieeeAddr.substr(2), dev.modelId, dev.modelId, () => {
                this.syncDevStates(dev);
                this.scheduleDeviceConfig(dev);
            });
        }
    }
    
    leaveDevice(entity) {
        const dev = entity.device;
        if (dev) {
            const devId = id.substr(2);
            this.log.debug('Try delete dev ' + devId + ' from iobroker.');
            this.deleteDeviceStates(devId);
        }
    }

    callPluginMethod(method, parameters) {
        for (const plugin of this.plugins) {
            if (plugin[method]) {
                try {
                    plugin[method](...parameters);
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
    onUnload(callback) {
        try {
            this.log.info("cleaned everything up...");
            this.callPluginMethod('stop');
            if (this.zbControl) {
                this.zbControl.stop();
            }
            callback();
        } catch (e) {
            callback();
        }
    }

    getZigbeeOptions() {
        // file path for db
        const dbDir = utils.controllerDir + '/' + this.systemConfig.dataDir + this.namespace.replace('.', '_');
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
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
        //this.log.info('Start on port: ' + port + ' channel ' + channel);
        //this.log.info('Queue is: ' + !this.config.disableQueue);
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