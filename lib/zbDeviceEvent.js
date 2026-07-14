'use strict';

const BaseExtension = require('./zbBaseExtension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
class DeviceEvent extends BaseExtension {
    constructor(zigbee, options) {
        super(zigbee, options);
        this.name = 'DeviceEvent';
        // Devices that already received a 'start' onEvent. A freshly paired device only gets
        // 'deviceJoined'/'deviceInterview', so we synthesise its 'start' on the first such event
        // (see callOnEvent, issue #2915).
        this.startCalled = new Set();
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
        for (const device of await this.zigbee.getClientIterator()) {
            await this.callOnEvent(device, 'stop', {ieeeAddr:device.ieeeAddr});
        }
    }

    async deviceExposeChanged(device, mapped) {
        this.warn(`deviceExposesChanged called with '${this.devLabel(device.ieeeAddr, mapped.model)}' / ${JSON.stringify(mapped.model)}`);
    }

    async callOnEvent(device, type, data, mappedDevice) {

        const md = mappedDevice ? mappedDevice : await zigbeeHerdsmanConverters.findByDevice(device);
        if (!device) return;

        const baseData = {device, deviceExposesChanged: function() { }, options: data.options || {}, state: data.state || {}}

        // #2915: a freshly paired device never receives a 'start' event - it only sees
        // 'deviceJoined'/'deviceInterview'. modernExtend onEvent handlers that key on 'start'
        // (e.g. deviceAddCustomCluster) therefore never register their custom clusters until the
        // next adapter restart, and incoming frames on those clusters throw UNSUPPORTED_CLUSTER.
        // Mirror zigbee2mqtt's onEvent extension: the first time a device is seen with any
        // non-start/non-stop event, run its 'start' handlers first. If the model is not resolvable
        // yet (md is null early during a join) this is a no-op and retried on the next event.
        if (type === 'start') {
            this.startCalled.add(device.ieeeAddr);
        } else if (type === 'stop') {
            this.startCalled.delete(device.ieeeAddr);
        } else if (md && md.onEvent && !this.startCalled.has(device.ieeeAddr)) {
            this.startCalled.add(device.ieeeAddr);
            try {
                await md.onEvent({type: 'start', data: baseData});
            } catch (error) {
                this.warn(`Error in start onEvent for '${this.devLabel(device.ieeeAddr, md.model)}': ${error && error.message ? error.message : 'no message'}`);
            }
        }

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
            //this.warn(`calling onEvent for device ${data.device.ieeeAddr} with Event ${type}`);
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
