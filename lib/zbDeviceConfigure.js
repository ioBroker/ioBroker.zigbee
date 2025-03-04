'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const BaseExtension = require('./zbBaseExtension');
const DeviceEvent = require('iobroker.zigbee/lib/zbDeviceEvent');

const forcedConfigureOnEachStart = ['V3-BTZB','014G2461','SPZB0001','ZK03840'];

class DeviceConfigure extends BaseExtension {
    constructor(zigbee, options) {
        super(zigbee, options);

        this.delayedConfigure = {};

        this.configuring = new Set();
        this.attempts = {};
        this.name = 'DeviceConfigure';

        this.configureKeys = {};
    }

    setOptions(options) {
        return typeof options === 'object';
    }

    shouldConfigure(device, mappedDevice) {
        if (!device || !mappedDevice) {
            return false;
        }
        if (!mappedDevice || !mappedDevice.configure) {
            return false;
        }
        const delayedAttempts = this.checkDelayedConfigure(device, 0);
        if (!this.configureKeys.hasOwnProperty(device.ieeeAddr)) this.configureKeys[device.ieeeAddr] = zigbeeHerdsmanConverters.getConfigureKey(mappedDevice);
        if (delayedAttempts > 0 && !device.interviewing) return true;
        if (device.meta.hasOwnProperty('configured') && device.meta.configured !== this.configureKeys[device.ieeeAddr]) return true;
        return (device.interviewing !== true && this.checkDelayedConfigure(device)>0);
    }

    checkDelayedConfigure(device, num) {
        if (!this.delayedConfigure.hasOwnProperty(device.ieeeAddr)) {
            if (num && num > 0) {
                // this.warn('adding dev ' + device.ieeeAddr + ' to delayedConfigure with ' + num + ' attempts');
                this.delayedConfigure[device.ieeeAddr] = { maxAttempts:num };
                return num;
            }
            return 0;
        }
        const dc = this.delayedConfigure[device.ieeeAddr];
        // this.warn('checkDelayedConfigure for ' + device.ieeeAddr + ' with ' + JSON.stringify(dc));
        dc.maxAttempts--;
        if (dc.maxAttempts > 0) return dc.maxAttempts;
        if (num && num > 0) {
            dc.maxAttempts = num;
            return num;
        }
        return 0;
    }

    delayedConfigureAttempt(device, status) {
        if (status) {
            delete this.delayedConfigure[device.ieeeAddr];
            return 0;
        }
        return this.checkDelayedConfigure(device, 10);
    }


    async onZigbeeStarted() {
        try {
            this.coordinatorEndpoint = await this.zigbee.getDevicesByType('Coordinator')[0].endpoints[0];

            for (const device of await this.zigbee.getClients()) {
                const mappedDevice = await zigbeeHerdsmanConverters.findByDevice(device);

                if (forcedConfigureOnEachStart.find((d) => d && d.hasOwnProperty('zigbeeModel') && d.zigbeeModel.includes(device.modelID))) {
                    this.debug(`DeviceConfigure ${device.ieeeAddr} ${device.modelID} forced by adapter config`);
                    device.meta.configured = -1; // Force a reconfiguration for this device
                }
                if (this.shouldConfigure(device, mappedDevice)) {
                    this.debug(`DeviceConfigure ${device.ieeeAddr} ${device.modelID} needed`);
                    await this.configure(device, mappedDevice);
                } else {
                    this.debug(`DeviceConfigure ${device.ieeeAddr} ${device.modelID} not needed`);
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
            if (this.shouldConfigure(device, mappedDevice)) {
                this.debug('ShouldConfigure ' + device.ieeeAddr);
                this.configure(device, mappedDevice);
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

            if (this.attempts.hasOwnProperty(device.ieeeAddr)) {
                delete this.attempts[device.ieeeAddr];
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
                    this.warn(`DeviceConfigure failed ${device.ieeeAddr} ${device.modelID}`);
                }
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Failed to DeviceConfigure.configure ${device.ieeeAddr} ${device.modelID} stack: (${error.stack})`);
        }
    }

    async doConfigure(device, mappedDevice) {
        const coordinatorEndpoint = await this.zigbee.getDevicesByType('Coordinator')[0].endpoints[0];
        try {
            if (mappedDevice) {
                if (mappedDevice.configure === undefined) return `No configure available for ${device.ieeeAddr} ${device.modelID}.`;
                this.info(`Configuring ${device.ieeeAddr} ${device.modelID}`);
                if (typeof mappedDevice.configure === 'function') await mappedDevice.configure(device, coordinatorEndpoint, this);
                else {
                    const promises = [];
                    promises.push(...mappedDevice.configure);
                    await Promise.all(promises.map(callback => callback(device, coordinatorEndpoint, mappedDevice)))
                }
                device.meta.configured = zigbeeHerdsmanConverters.getConfigureKey(mappedDevice);
                this.configureKeys[device.ieeeAddr] = device.meta.configured;
                device.save();
                this.info(`DeviceConfigure successful ${device.ieeeAddr} ${device.modelID}`);
                this.delayedConfigureAttempt(device, true);
                return '';
            }
        } catch (error) {
            // https://github.com/Koenkk/zigbee2mqtt/issues/14857
            if (error.stack.includes('UNSUPPORTED_ATTRIBUTE')) {
                // do nothing
            } else {
                if (error && error.message && error.message.match(/(\d+)ms/gm)) {
                    // timeout message - we do want to start the configure chain
                    const num = this.delayedConfigureAttempt(device, false);
                    this.warn(`Timeout trying to configure ${device.ieeeAddr} ${device.modelID}:  ${num} attempts remaining`)
                    return `Configuration timed out ${device.ieeeAddr} ${device.modelID}. The device did not repond in time to the configuration request. Another attempt will be made when the device is awake.`;
                } else {
                    this.sendError(error);
                    this.warn(`${device.ieeeAddr} ${device.modelID} Failed to configure. --> ${error && error.message ? error.message : ' no error message given'} `);
                    return `${device.ieeeAddr} ${device.modelID} Failed to configure. --> ${error && error.message ? error.message : ' no error message given'} `
                }


            }
        }
        return 'no return value specified';
    }
}

module.exports = DeviceConfigure;
