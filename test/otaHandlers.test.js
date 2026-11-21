'use strict';

// Regression test for the OTA plugin listening twice to the adapter.
//
// The constructor of Ota registered its message and stateChange handlers, and start() registered
// them again through registerHandler(). One write to info.ota then started two availability scans,
// and one write to info.ota_available started two updates per device (the second one failing with
// "OTA already in progress"). The constructor registrations were also never removed by stop().
//
// Runs the real plugin against a stubbed adapter; no hardware.
// Run:  node --test test/otaHandlers.test.js

const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { describe, it } = require('node:test');
const assert = require('node:assert');

// pluginOta.js imports zigbee-herdsman only for setOtaConfiguration(); stub it so the test needs
// neither the dependency tree nor a coordinator.
const originalLoad = Module._load;
let Ota;
try {
    Module._load = function (request, ...args) {
        if (request === 'zigbee-herdsman') return { setOtaConfiguration() {} };
        return originalLoad.call(this, request, ...args);
    };
    Ota = require('../lib/pluginOta');
} finally {
    Module._load = originalLoad;
}

function makeAdapter() {
    const adapter = new EventEmitter();
    adapter.namespace = 'zigbee.0';
    adapter.config = {};
    adapter.onLog = () => {};
    adapter.setStateAsync = async () => {};
    adapter.getDataFolder = () => '/tmp';
    return adapter;
}

describe('Ota plugin handlers', () => {
    it('listens once to stateChange and message after start()', () => {
        const adapter = makeAdapter();
        const plugin = new Ota(adapter);
        plugin.start({}, {});
        assert.strictEqual(adapter.listenerCount('stateChange'), 1);
        assert.strictEqual(adapter.listenerCount('message'), 1);
    });

    it('handles a single stateChange once', async () => {
        const adapter = makeAdapter();
        const plugin = new Ota(adapter);
        let calls = 0;
        adapter.getDevicesAsync = async () => [{ native: { id: '00158d0001a2b3c4' } }];
        plugin.multiCheckOtaAvail = async () => { calls++; };
        plugin.start({}, {});
        adapter.emit('stateChange', 'zigbee.0.info.ota', { val: true, ack: false });
        await new Promise((resolve) => setImmediate(resolve));
        assert.strictEqual(calls, 1, 'one write to info.ota must start one availability scan');
    });

    it('leaves no handler behind after stop()', () => {
        const adapter = makeAdapter();
        const plugin = new Ota(adapter);
        plugin.start({}, {});
        plugin.stop();
        assert.strictEqual(adapter.listenerCount('stateChange'), 0);
        assert.strictEqual(adapter.listenerCount('message'), 0);
    });
});
