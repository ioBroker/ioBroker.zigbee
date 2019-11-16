const BaseExtension = require('./zbBaseExtension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

class DeviceEvent extends BaseExtension {
    async onZigbeeStarted() {
        for (const device of this.zigbee.getClients()) {
            this.callOnEvent(device, 'start', {});
        }
    }

    onZigbeeEvent(data, mappedDevice) {
        if (data.device) {
            this.callOnEvent(data.device, data.type, data, mappedDevice);
        }
    }

    async stop() {
        if (this.zigbee.getClients() > 0) {
          for (const device of this.zigbee.getClients()) {
              this.callOnEvent(device, 'stop', {});
          }
        }
    }

    callOnEvent(device, type, data, mappedDevice) {
        if (!mappedDevice) {
            mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
        }

        if (mappedDevice && mappedDevice.onEvent) {
            mappedDevice.onEvent(type, data, device);
        }
    }
}

module.exports = DeviceEvent;
