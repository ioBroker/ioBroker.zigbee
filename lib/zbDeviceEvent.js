'use strict';

const BaseExtension = require('./zbBaseExtension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

class DeviceEvent extends BaseExtension {
    constructor(zigbee, options) {
        super(zigbee, options);
        this.name = 'DeviceEvent';
    }

    async onZigbeeStarted() {
        for (const device of await this.zigbee.getClients()) {
            await this.callOnEvent(device, 'start', {});
        }
    }

    setOptions(options) {
        return typeof options === 'object';

    }

    async onZigbeeEvent(data, mappedDevice) {
        if (data.device) {
            this.callOnEvent(data.device, data.type, data, mappedDevice);
        }
    }

    async stop() {
        if (this.zigbee.getClients() > 0) {
            for (const device of await this.zigbee.getClients()) {
                await this.callOnEvent(device, 'stop', {});
            }
        }
    }

    async callOnEvent(device, type, data, mappedDevice) {
        if (!mappedDevice) {
            mappedDevice = await zigbeeHerdsmanConverters.findByDevice(device);
        }

        if (mappedDevice && mappedDevice.onEvent) {
            mappedDevice.onEvent(type, data, device,mappedDevice.options,'{}');
        }
    }
}

module.exports = DeviceEvent;
