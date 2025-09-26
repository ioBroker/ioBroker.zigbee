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

            await this.callOnEvent(device, 'start', {device, options:entity.options || {}});
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

    async callOnEvent(device, type, data, mappedDevice) {
        if (!mappedDevice) {
            mappedDevice = await zigbeeHerdsmanConverters.findByDevice(device);
        }
        const baseData = {device, deviceExposeChanged: function() { return; }, options: data.options || {}, state: data.state || {}}
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
                eventData.data = { ieeeAddr:device.ieeeAddr };
                break;
            case 'deviceInterview':
                eventData.data = {...baseData,status: data.status};
                break;
            case 'deviceOptionsChanged':
                // NOTE: This does not currently work. OptionsChange is not yet defined.
                eventData.data = {...baseData, from:data.from || {}, to:data.to || {}};
                break;
        }


        if (mappedDevice && mappedDevice.onEvent && eventData.data) {
            this.warn(`calling onEvent for ${eventData.type} on ${device.ieeeAddr}`);
            try {
                mappedDevice.onEvent(eventData);
            }
            catch (error) {
                this.warn(`Error in onEvent: ${error && error.message ? error.message : 'no message'}`);
            }
        }
    }
}

module.exports = DeviceEvent;
