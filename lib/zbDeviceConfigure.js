'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const BaseExtension = require('./zbBaseExtension');

const forcedConfigureOnEachStart = ['V3-BTZB','014G2461','SPZB0001','ZK03840'];

class DeviceConfigure extends BaseExtension {
    constructor(zigbee, options) {
        super(zigbee, options);

        this.delayedConfigure = {};

        this.configuring = new Set();
        this.configureOnMessage = new Set();
        this.configureOnMessageAttempts = {};
        this.name = 'DeviceConfigure';

        this.MessageStash = [];
        this.deviceConfigureQueue = [];
        this.configureIntervall = null;
    }

    setOptions(options) {
        return typeof options === 'object';
    }

    async handleConfigureQueue() {
        if (this.deviceConfigureQueue.length < 1) {
            this.info('Handled all devices Queued for configuration.')
            clearInterval(this.configureIntervall);
            this.configureIntervall == null;
            return;
        }
        const configureItem = this.deviceConfigureQueue.shift();
        this.info(`DeviceConfigureQueue configuring ${configureItem.dev.ieeeAddr} ${configureItem.dev.modelID}`)
        this.doConfigure(configureItem.dev, configureItem.mapped);
    }

    PushDeviceToQueue(device, mappedDevice) {
        const id = device.ieeeAddr;
        for (const candidate of this.deviceConfigureQueue) {
            if (candidate.id == id) {
                this.debug('no duplicate entry in queue');
                return;
            }
        }
        this.deviceConfigureQueue.push({ id: device.ieeeAddr, dev:device, mapped:mappedDevice });
        if (this.configureIntervall) return;
        this.configureIntervall = setInterval(async () => await this.handleConfigureQueue(), 5000);
    }

    shouldConfigure(device, mappedDevice) {
        if (!device || !mappedDevice) {
            return false;
        }
        if (!mappedDevice || !mappedDevice.configure) {
            return false;
        }
        // no configuration if we are interviewing or configuring
        if (this.configuring.has(device.ieeeAddr) || device.interviewing) return false;
        const t = Date.now();
        const cfgkey = zigbeeHerdsmanConverters.getConfigureKey(mappedDevice);
        const result = device.meta.hasOwnProperty('configured') && device.meta.configured !== cfgkey;
        this.debug(`should configure for device ${device.ieeeAddr} (${mappedDevice.model}: ${device.meta.hasOwnProperty('configured') ? device.meta.configured: 'none'} -  ${cfgkey} (query took ${Date.now()- t} ms)`);
        return result;
    }

    async onZigbeeStarted() {
        try {
            this.coordinatorEndpoint = await this.zigbee.getDevicesByType('Coordinator')[0].endpoints[0];

            for (const device of await this.zigbee.getClients()) {
                const mappedDevice = await zigbeeHerdsmanConverters.findByDevice(device);
                if (forcedConfigureOnEachStart.find((d) => d && d.hasOwnProperty('zigbeeModel') && d.zigbeeModel.includes(device.modelID))) {
                    this.debug(`DeviceConfigure ${device.ieeeAddr} ${mappedDevice ? mappedDevice.model : device.modelID} forced by adapter config`);
                    device.meta.configured = -1; // Force a reconfiguration for this device
                }
                if (this.shouldConfigure(device, mappedDevice)) {
                    this.info(`DeviceConfigure ${device.ieeeAddr} ${mappedDevice ? mappedDevice.model : device.modelID} needed - Device added to Configuration Queue`);
                    await this.PushDeviceToQueue(device, mappedDevice);
                } else {
                    this.debug(`DeviceConfigure ${device.ieeeAddr} ${mappedDevice ? mappedDevice.model : device.modelID} not needed`);
                }
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to DeviceConfigure.onZigbeeStarted (${error && error.message ? error.message : 'no error message'})`);
        }
    }

    onZigbeeEvent(data, mappedDevice) {
        try {
            const device = data.device;
            const com = this.configureOnMessageAttempts[device.ieeeAddr];
            if (com) {
                this.info(`checking configure on message :  next attempt in ${30000 - (Date.now() - com.timestamp)} seconds`);
                if (Date.now() - com.timestamp > 30000 && !this.configuring.has(device.ieeeAddr)) {
                    com.timestamp = Date.now();
                    this.info('Configure on Message for ' + device.ieeeAddr);
                    this.doConfigure(device, mappedDevice);
                }
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to DeviceConfigure.onZigbeeEvent (${error && error.message ? error.message : 'no error message'})`);
        }
    }


    onDeviceRemove(device) {
        try {
            if (this.configuring.has(device.ieeeAddr)) {
                this.configuring.delete(device.ieeeAddr);
            }

            if (this.configureOnMessageAttempts && this.configureOnMessageAttempts.hasOwnProperty(device.ieeeAddr)) {
                delete this.configureOnMessageAttempts[device.ieeeAddr];
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to DeviceConfigure.onDeviceRemove (${error && error.message ? error.message : 'no error message'})`);
        }
    }

    onDeviceLeave(data, entity) {
        if (entity) {
            this.onDeviceRemove(entity.device);
        } else {
            this.onDeviceRemove(data);
        }
    }

    async configure(device, mappedDevice) {
        try {
            if (mappedDevice !== undefined && device !== undefined) {

                try {
                    await this.doConfigure(device, mappedDevice)
                } catch (error) {
                    this.sendError(error);
                    this.warn(`DeviceConfigure failed ${device.ieeeAddr} ${mappedDevice.model}`);
                }
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to DeviceConfigure.configure ${device.ieeeAddr} ${mappedDevice.model}: ${error && error.message ? error.message : 'no error message'})`);
        }
    }

    async doConfigure(device, mappedDevice) {
        const coordinatorEndpoint = await this.zigbee.getDevicesByType('Coordinator')[0].endpoints[0];
        try {
            if (mappedDevice) {
                if (mappedDevice.configure === undefined) return `No configure available for ${device.ieeeAddr} ${mappedDevice.model}.`;
                this.info(`Configuring ${device.ieeeAddr} ${mappedDevice.model}`);
                this.configuring.add(device.ieeeAddr);
                if (typeof mappedDevice.configure === 'function') await mappedDevice.configure(device, coordinatorEndpoint, mappedDevice);
                else {
                    const promises = [];
                    promises.push(...mappedDevice.configure);
                    await Promise.all(promises.map(callback => callback(device, coordinatorEndpoint, mappedDevice)))
                }
                device.meta.configured = zigbeeHerdsmanConverters.getConfigureKey(mappedDevice);
                this.configuring.delete(device.ieeeAddr);
                delete this.configureOnMessageAttempts[device.ieeeAddr];
                device.save();
                this.info(`DeviceConfigure successful ${device.ieeeAddr} ${mappedDevice.model}`);
                return '';
            }
        } catch (error) {
            this.configuring.delete(device.ieeeAddr);
            // https://github.com/Koenkk/zigbee2mqtt/issues/14857
            if (error.stack.includes('UNSUPPORTED_ATTRIBUTE')) {
                this.debug(`Configuration attempt on ${device.ieeeAddr} ${mappedDevice.model} with unsupported Attribute(s) : ${error.message}`)
                // do nothing
            } else {
                if (error && error.message && error.message.match(/(\d+)ms/gm)) {
                    // timeout message - we do want to start the configure chain
                    if (this.configureOnMessageAttempts.hasOwnProperty(device.ieeeAddr)) {
                        const com = this.configureOnMessageAttempts[device.ieeeAddr];
                        com.count--;
                        com.attempts++;
                        com.timestamp = Date.now();
                        if ( com.count < 0) {
                            delete this.configureOnMessageAttempts[device.ieeeAddr];
                            this.info(`Configure on message abandoned for ${device.ieeeAddr} ${mappedDevice.model} after failing ${com.attempts} times.`)
                        }
                        else this.info(`Timeout trying to configure ${device.ieeeAddr} ${mappedDevice.model} (${com.count}).`)
                    }
                    else {
                        this.info(`Timeout trying to configure ${device.ieeeAddr} ${mappedDevice.model} (starting CoM).`)
                        this.configureOnMessageAttempts[device.ieeeAddr] = {
                            count: 5,
                            timestamp: 0,
                            attempts: 0,
                        };
                    }
                    return `Configuration timed out ${device.ieeeAddr} ${device.modelID}. The device did not repond in time to the configuration request. Another attempt will be made when the device is awake.`;
                } else {
                    this.sendError(error);
                    const msg = `${device.ieeeAddr} ${device.modelID} Failed to configure. --> ${error && error.message ? error.message : ' no error message given'}`
                    this.warn(msg);
                    return msg;
                }


            }
        }
        return 'no return value specified';


    }

    async stop() {
        clearInterval(this.configureIntervall);
        this.configureOnMessageAttempts = {};
    }
}

module.exports = DeviceConfigure;
