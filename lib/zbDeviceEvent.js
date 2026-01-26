'use strict';

const BaseExtension = require('./zbBaseExtension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
class DeviceEvent extends BaseExtension {
    constructor(zigbee, options) {
        super(zigbee, options);
        this.name = 'DeviceEvent';
    }

    async onZigbeeStarted() {
        for (const device of await this.zigbee.getClientIterator()) {
            const entity = await this.zigbee.resolveEntity(device);
            await this.callOnEvent(device, 'start', {device, options:entity?.options || {}});
        }
    }

    setOptions(options) {
        return typeof options === 'object';

    }

    async onZigbeeEvent(data, mappedDevice) {
        if (data && data.device && data.type) {
            this.callOnEvent(data.device, data.type, data, mappedDevice);
        }
    }

    async stop() {
        if (this.zigbee.getClients() > 0) {
            for (const device of await this.zigbee.getClients()) {
                await this.callOnEvent(device, 'stop', {ieeeAddr:device.ieeeAddr});
            }
        }
    }

    async deviceExposesChanged(device, mapped) {
        this.warn(`deviceExposesChanged called with ${JSON.stringify(device.ieeeAddr)} / ${JSON.stringify(mapped.model)}`);
    }

    async callOnEvent(device, type, data, mappedDevice) {

        const md = mappedDevice ? mappedDevice : await zigbeeHerdsmanConverters.findByDevice(device);
        if (!device) return;

        const baseData = {device, deviceExposesChanged: function() { this.deviceExposesChanged(data.device, md); }, options: data.options || {}, state: data.state || {}}
        const eventData = {
            type,
        }

        switch (type) {
            case 'start':
            case 'deviceNetworkAddressChanged':
            case 'deviceAnnounce':
            case `deviceJoined`:
            {
                eventData.data = baseData;
                break;
            }
            case 'stop':
                eventData.data = {ieeeAddr:device.ieeeAddr}
                break;
            case 'deviceInterview':
                eventData.data = baseData;
                eventData.data.status = data.status;
                break;
            case 'deviceOptionsChanged':
                // NOTE: This does not currently work. OptionsChange is not yet defined.
                eventData.data = baseData;
                eventData.data.from = data.from || {};
                eventData.data.to = data.to || {};
                eventData.data.options.to = data.to;
                break;
        }


        if (md && md.onEvent && eventData.data) {
            this.warn(`calling onEvent for device ${data.device.ieeeAddr} with Event ${type}`);
            try {
                md.onEvent(eventData);
            }
            catch (error) {
                this.warn(`Error in onEvent: ${error && error.message ? error.message : 'no message'}`);
            }
        }
    }
}

module.exports = DeviceEvent;
