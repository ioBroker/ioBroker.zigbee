'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const BaseExtension = require('./zbBaseExtension');

class DeviceConfigure extends BaseExtension {
    constructor(zigbee, options) {
        super(zigbee, options);

        this.configuring = new Set();
        this.attempts = {};
    }

    shouldConfigure(device, mappedDevice) {
        if (!device) {
            return false;
        }

        if (device.meta.hasOwnProperty('configured') && mappedDevice.meta && device.meta.configured === mappedDevice.meta.configureKey) {
            return false;
        }

        if (!mappedDevice || !mappedDevice.configure) {
            return false;
        }

        if (device.interviewing === true) {
            return false;
        }

        return true;
    }

    async onZigbeeStarted() {
        try {
            this.coordinatorEndpoint = await this.zigbee.getDevicesByType('Coordinator')[0].endpoints[0];

            for (const device of await this.zigbee.getClients()) {
                const mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
                if (this.shouldConfigure(device, mappedDevice)) {
                    this.debug(`DeviceConfigure ${device.ieeeAddr} ${device.modelID} needed`);
                    await this.configure(device, mappedDevice);
                } else {
                    this.debug(`DeviceConfigure ${device.ieeeAddr} ${device.modelID} not needed`);
                }
            }
        } catch (error) {
            this.error(
                `Failed to DeviceConfigure.onZigbeeStarted (${error.stack})`,
            );
        }
    }

    onZigbeeEvent(data, mappedDevice) {
        try {
            const device = data.device;
            if (this.shouldConfigure(device, mappedDevice)) {
                this.configure(device, mappedDevice);
            }
        } catch (error) {
            this.error(
                `Failed to DeviceConfigure.onZigbeeEvent (${error.stack})`,
            );
        }
    }

    onDeviceRemove(device){
        try {
            if (this.configuring.has(device.ieeeAddr)) {
                this.configuring.delete(device.ieeeAddr);
            }

            if (this.attempts.hasOwnProperty(device.ieeeAddr)) {
                delete this.attempts[device.ieeeAddr];
            }
        } catch (error) {
            this.error(
                `Failed to DeviceConfigure.onDeviceRemove (${error.stack})`,
            );
        }
    }

    onDeviceLeave(data, entity){
        if (entity) {
            this.onDeviceRemove(entity.device);
        } else {
            this.onDeviceRemove(data);
        }
    }

    async configure(device, mappedDevice) {
        try {
            if (this.configuring.has(device.ieeeAddr) || this.attempts[device.ieeeAddr] >= 5) {
                return false;
            }

            this.configuring.add(device.ieeeAddr);

            if (!this.attempts.hasOwnProperty(device.ieeeAddr)) {
                this.attempts[device.ieeeAddr] = 0;
            }

            this.info(`Configuring ${device.ieeeAddr} ${device.modelID}`);
            try {
                await mappedDevice.configure(device, this.coordinatorEndpoint);
                this.info(`DeviceConfigure successful ${device.ieeeAddr} ${device.modelID}`);
                // eslint-disable-next-line
                device.meta.configured = mappedDevice.meta.configureKey;
                device.save();
            } catch (error) {
                this.error(
                    `DeviceConfigure failed ${device.ieeeAddr} ${device.modelID}, ` +
                    `attempt ${this.attempts[device.ieeeAddr] + 1} (${error.stack})`,
                );
                this.attempts[device.ieeeAddr]++;
            }

            this.configuring.delete(device.ieeeAddr);
        } catch (error) {
            this.error(
                `Failed to DeviceConfigure.configure ${device.ieeeAddr} ${device.modelID} (${error.stack})`,
            );
        }
    }
}

module.exports = DeviceConfigure;
