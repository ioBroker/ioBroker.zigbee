'use strict';

// The device manager serves its device list from a 10 second cache. A device which leaves the
// network loses its object right away, so without dropping that cache its tile outlives the device
// by up to ten seconds. invalidateDeviceCache() is what the leave event calls.
//
// Runs the real dmZigbee class against a stubbed @iobroker/adapter-core; no hardware.
// Run:  node --test test/deviceManagerCache.test.js

const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { describe, it } = require('node:test');
const assert = require('node:assert');

const origLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === '@iobroker/adapter-core') return { Adapter: EventEmitter };
    return origLoad.call(this, request, ...rest);
};

const dmZigbee = require('../lib/devicemgmt.js');

class FakeAdapter extends EventEmitter {
    constructor() {
        super();
        this.name = 'zigbee';
        this.namespace = 'zigbee.0';
        this.log = { debug() {}, info() {}, warn() {}, error() {} };
        this.loads = 0;
        this.devices = [];
    }
    async getDeviceInformation() {
        this.loads++;
        return { deviceObjects: this.devices };
    }
}

const noopContext = { addDevice() {}, setTotalDevices() {}, complete() {} };

// the cache lives in the module, not in the instance, so each test starts by dropping it
function mkManager() {
    const adapter = new FakeAdapter();
    const dm = new dmZigbee(adapter);
    dm.invalidateDeviceCache();
    return { adapter, dm };
}

describe('device manager list cache', () => {
    it('serves a second load from the cache', async () => {
        const { adapter, dm } = mkManager();

        await dm.loadDevices(noopContext);
        await dm.loadDevices(noopContext);

        assert.strictEqual(adapter.loads, 1);
    });

    it('would keep the tile of a departed device while the cache stands', async () => {
        const { adapter, dm } = mkManager();
        adapter.devices = [{ _id: 'zigbee.0.a085e3fffeb62fac', common: { name: 'Klo - Lüfter', type: 'device' }, native: { id: 'a085e3fffeb62fac' } }];

        await dm.loadDevices(noopContext);
        adapter.devices = []; // the device left the network, its object is gone
        const listed = [];
        await dm.loadDevices({ addDevice: (d) => listed.push(d), setTotalDevices() {}, complete() {} });

        assert.strictEqual(listed.length, 1, 'this is the bug: the tile is still drawn from the cache');
    });

    it('reloads after the cache was dropped, so a departed device loses its tile', async () => {
        const { adapter, dm } = mkManager();
        adapter.devices = [{ _id: 'zigbee.0.a085e3fffeb62fac', common: { name: 'Klo - Lüfter', type: 'device' }, native: { id: 'a085e3fffeb62fac' } }];

        await dm.loadDevices(noopContext);
        adapter.devices = []; // the device left the network, its object is gone
        dm.invalidateDeviceCache();
        const listed = [];
        await dm.loadDevices({ addDevice: (d) => listed.push(d), setTotalDevices() {}, complete() {} });

        assert.strictEqual(adapter.loads, 2, 'the list was fetched again');
        assert.deepStrictEqual(listed, [], 'the departed device has no tile any more');
    });
});
