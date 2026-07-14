'use strict';

// Regression test for #2915: custom clusters must be registered when a device is paired for the
// first time, not only after an adapter restart. Runs the real DeviceEvent extension against a real
// zigbee-herdsman-converters definition that uses deviceAddCustomCluster (Develco AQSZB-110), with a
// mocked device object - no Zigbee hardware required.
//
// Run with:  node --test lib/zbDeviceEvent.test.js
// (uses Node's built-in test runner + assert, so it needs no test framework)

const { describe, it } = require('node:test');
const assert = require('node:assert');
const DeviceEvent = require('./zbDeviceEvent');

// Minimal stub of the `zigbee` object - only the surface BaseExtension/DeviceEvent actually touch.
function mkZigbee() {
    return {
        adapter: { name: 'zigbee', namespace: 'zigbee.0', log: { debug() {}, info() {}, warn() {}, error() {} } },
        info() {}, warn() {}, error() {}, debug() {}, sendError() {},
        getClientIterator: () => [],
        resolveEntity: async () => null,
    };
}

// A fresh Develco AQSZB-110. Its definition adds the custom clusters genBasic (manufacturer-specific)
// and manuSpecificDevelcoAirQuality via deviceAddCustomCluster - exactly the class of device in #2915.
function mkDevice(modelID = 'AQSZB-110') {
    const ep = {
        ID: 38, deviceIeeeAddress: '0x0015bc0000000001',
        getClusterAttributeValue: () => undefined, supportsInputCluster: () => true, supportsOutputCluster: () => true,
        getInputClusters: () => [], getOutputClusters: () => [], saveClusterAttributeKeyValue: () => {},
        read: async () => ({}), write: async () => ({}), bind: async () => ({}), configureReporting: async () => ({}), clusters: {},
    };
    return {
        modelID, manufacturerName: 'Develco', manufacturerID: 4117, type: 'EndDevice',
        ieeeAddr: '0x0015bc0000000001', endpoints: [ep], getEndpoint: () => ep, options: {},
        customClusters: {}, addCustomCluster(name, def) { this.customClusters[name] = def; }, save() {}, meta: {},
    };
}

describe('DeviceEvent: custom-cluster registration on first pairing (#2915)', () => {
    it('registers custom clusters on a fresh pairing (deviceInterview, no prior start)', async () => {
        const dev = mkDevice();
        const ext = new DeviceEvent(mkZigbee(), {});
        // Simulate the pairing path: interview completes, 'start' was never fired for this device.
        await ext.callOnEvent(dev, 'deviceInterview', { device: dev, status: 'successful' });
        // Without the synthetic-start guard these stay empty and the next incoming frame on the
        // custom cluster throws UNSUPPORTED_CLUSTER.
        const keys = Object.keys(dev.customClusters);
        assert.ok(keys.includes('genBasic'), `expected genBasic, got: ${keys.join(', ') || '(none)'}`);
        assert.ok(keys.includes('manuSpecificDevelcoAirQuality'), `expected manuSpecificDevelcoAirQuality, got: ${keys.join(', ') || '(none)'}`);
    });

    it('does not synthesise a second start once a device has been started', async () => {
        const dev = mkDevice();
        const ext = new DeviceEvent(mkZigbee(), {});
        await ext.callOnEvent(dev, 'start', { device: dev });
        let addsAfterStart = 0;
        const orig = dev.addCustomCluster.bind(dev);
        dev.addCustomCluster = (n, d) => { addsAfterStart++; return orig(n, d); };
        await ext.callOnEvent(dev, 'deviceAnnounce', { device: dev });
        assert.strictEqual(addsAfterStart, 0);
    });

    it('is a no-op (no throw) while the model is unresolved, and retries once it resolves', async () => {
        const dev = mkDevice('TOTALLY-UNKNOWN-XYZ'); // findByDevice -> undefined early during join
        dev.manufacturerName = 'NoSuchVendor';
        dev.manufacturerID = 0;
        const ext = new DeviceEvent(mkZigbee(), {});
        await ext.callOnEvent(dev, 'deviceJoined', { device: dev }); // must not throw
        assert.strictEqual(Object.keys(dev.customClusters).length, 0);
        // model becomes resolvable on a later event -> start is synthesised then
        dev.modelID = 'AQSZB-110';
        dev.manufacturerName = 'Develco';
        dev.manufacturerID = 4117;
        await ext.callOnEvent(dev, 'deviceInterview', { device: dev, status: 'successful' });
        assert.ok(Object.keys(dev.customClusters).includes('manuSpecificDevelcoAirQuality'));
    });

    it('re-arms the synthetic start after a device stops (so a re-join registers again)', async () => {
        const dev = mkDevice();
        const ext = new DeviceEvent(mkZigbee(), {});
        await ext.callOnEvent(dev, 'start', { device: dev });
        await ext.callOnEvent(dev, 'stop', { device: dev, ieeeAddr: dev.ieeeAddr });
        dev.customClusters = {};
        await ext.callOnEvent(dev, 'deviceInterview', { device: dev, status: 'successful' });
        assert.ok(Object.keys(dev.customClusters).includes('genBasic'));
    });
});
