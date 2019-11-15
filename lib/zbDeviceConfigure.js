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

        if (device.meta.hasOwnProperty('configured') && device.meta.configured === mappedDevice.meta.configureKey) {
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
        this.coordinatorEndpoint = this.zigbee.getDevicesByType('Coordinator')[0].endpoints[0];

        for (const device of this.zigbee.getClients()) {
            const mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
            if (this.shouldConfigure(device, mappedDevice)) {
                await this.configure(device, mappedDevice);
            }
        }
    }

    onZigbeeEvent(data, mappedDevice) {
        const device = data.device;
        if (this.shouldConfigure(device, mappedDevice)) {
            this.configure(device, mappedDevice);
        }
    }

    async configure(device, mappedDevice) {
        if (this.configuring.has(device.ieeeAddr) || this.attempts[device.ieeeAddr] >= 3) {
            return false;
        }

        this.configuring.add(device.ieeeAddr);

        if (!this.attempts.hasOwnProperty(device.ieeeAddr)) {
            this.attempts[device.ieeeAddr] = 0;
        }

        this.info(`Configuring ${device.ieeeAddr} ${device.modelID}`);
        try {
            await mappedDevice.configure(device, this.coordinatorEndpoint);
            this.info(`Succesfully configured ${device.ieeeAddr} ${device.modelID}`);
            // eslint-disable-next-line
            device.meta.configured = mappedDevice.meta.configureKey;
            device.save();
        } catch (error) {
            this.error(
                `Failed to configure ${device.ieeeAddr} ${device.modelID}, ` +
                `attempt ${this.attempts[device.ieeeAddr] + 1} (${error.stack})`,
            );
            this.attempts[device.ieeeAddr]++;
        }

        this.configuring.delete(device.ieeeAddr);
    }
}

module.exports = DeviceConfigure;
