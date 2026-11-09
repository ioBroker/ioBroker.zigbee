'use strict';

// Regression tests for the availability extension (lib/zbDeviceAvailability.js).
//
// - this.state holds { available, ts } per device. The reconnect check tested the object itself
//   (always truthy), so the state of a router which came back online was never read again.
// - registerDevicePing() is called again for every device after each reconnect of the coordinator.
//   The duplicate check inside forEach() did not work and the device counter only grew, which
//   stretched the ping interval towards its maximum.
//
// Runs the real extension against a fake zigbee controller; no hardware.
// Run:  node --test test/availability.test.js

const { EventEmitter } = require('node:events');
const { describe, it } = require('node:test');
const assert = require('node:assert');

const DeviceAvailability = require('../lib/zbDeviceAvailability');

function router(ieeeAddr) {
    return { ieeeAddr, type: 'Router', powerSource: 'Mains (single phase)', modelID: 'TS011F', interviewState: 'SUCCESSFUL', endpoints: [] };
}

function sensor(ieeeAddr) {
    return { ieeeAddr, type: 'EndDevice', powerSource: 'Battery', modelID: 'WSDCGQ11LM', interviewState: 'SUCCESSFUL', endpoints: [] };
}

function mkZigbee() {
    const zigbee = new EventEmitter();
    zigbee.published = [];
    zigbee.timeouts = [];
    zigbee.adapter = {
        namespace: 'zigbee.0',
        setTimeout: (cb, ms) => {
            const handle = { cb, ms };
            zigbee.timeouts.push(handle);
            return handle;
        },
        clearTimeout: (handle) => {
            zigbee.timeouts = zigbee.timeouts.filter((t) => t !== handle);
        },
    };
    zigbee.info = zigbee.debug = zigbee.warn = zigbee.error = () => {};
    zigbee.getClientIterator = () => [].values();
    zigbee.resolveEntity = async (device) => ({ device, mapped: { model: device.modelID, toZigbee: [] } });
    zigbee.on('publish', (id, model, payload) => zigbee.published.push(payload));
    return zigbee;
}

function mkAvailability(zigbee) {
    const ext = new DeviceAvailability(zigbee, {}, { pingCluster: 'c0a0', pingTimeout: 300 });
    ext.isStarted = true;
    ext.reconnects = [];
    ext.onReconnect = async (device) => {
        ext.reconnects.push(device.ieeeAddr);
    };
    return ext;
}

describe('publishAvailability', () => {
    it('reads the state of a router which comes back online', async () => {
        const ext = mkAvailability(mkZigbee());
        const device = router('0x0000000000000001');

        await ext.publishAvailability(device, true, true); // 'new' event at start publishes with force
        await ext.publishAvailability(device, false);
        await ext.publishAvailability(device, true);

        assert.deepStrictEqual(ext.reconnects, [device.ieeeAddr]);
    });

    it('does not read the state of a router which was online all the time', async () => {
        const ext = mkAvailability(mkZigbee());
        const device = router('0x0000000000000001');

        await ext.publishAvailability(device, true, true);
        await ext.publishAvailability(device, true);

        assert.deepStrictEqual(ext.reconnects, []);
    });

    it('does not try to read the state of a sleeping battery device', async () => {
        const ext = mkAvailability(mkZigbee());
        const device = sensor('0x0000000000000002');

        await ext.publishAvailability(device, true, true); // 'new' event at start publishes with force
        await ext.publishAvailability(device, false);
        await ext.publishAvailability(device, true);

        assert.deepStrictEqual(ext.reconnects, []);
    });
});

describe('registerDevicePing', () => {
    it('queues a device only once', async () => {
        const zigbee = mkZigbee();
        const ext = mkAvailability(zigbee);
        const device = router('0x0000000000000001');

        await ext.registerDevicePing(device, {});
        await ext.registerDevicePing(device, {});

        assert.strictEqual(ext.startDevicePingQueue.length, 1);
        assert.strictEqual(ext.number_of_registered_devices, 1);
    });

    it('counts a device only once after a reconnect of the coordinator', async () => {
        const zigbee = mkZigbee();
        const ext = mkAvailability(zigbee);
        const devices = [router('0x0000000000000001'), router('0x0000000000000002')];

        for (const device of devices) await ext.registerDevicePing(device, {});
        await ext.stop();
        ext.isStarted = true;
        for (const device of devices) await ext.registerDevicePing(device, {});

        assert.strictEqual(ext.number_of_registered_devices, 2);
        assert.strictEqual(ext.startDevicePingQueue.length, 2);
    });

    it('drops the pending ping start when stopped', async () => {
        const zigbee = mkZigbee();
        const ext = mkAvailability(zigbee);

        await ext.registerDevicePing(router('0x0000000000000001'), {});
        assert.strictEqual(zigbee.timeouts.length, 1);
        await ext.stop();

        assert.strictEqual(zigbee.timeouts.length, 0);
        assert.strictEqual(ext.startDevicePingTimeout, null);
    });
});
