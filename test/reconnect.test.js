'use strict';

// Regression tests for the reconnect path (#3020).
//
// tryToReconnect() first runs testConnection(), which for a network coordinator opens a probe socket
// and closes it right away. Some network coordinators (XZG / cod.m CZC firmware) ignore a connection
// that arrives within a few ms after a closed one, so the following zigbee-herdsman connection was
// never served. The adapter now waits a short moment between the probe and doConnect().
// testConnection() also has to stop after a failed check instead of carrying on with the next step.
//
// Runs the real Zigbee class from main.js against a stubbed @iobroker/adapter-core; no hardware.
// Run:  node --test test/reconnect.test.js

const Module = require('node:module');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');

class FakeAdapterBase extends EventEmitter {
    constructor() {
        super();
        this.name = 'zigbee';
        this.namespace = 'zigbee.0';
        this.config = {};
        this.debugMessages = [];
        this.log = {
            debug: (msg) => this.debugMessages.push(msg),
            info() {},
            warn() {},
            error() {},
            level: 'info',
        };
    }
    expandFileName(f) {
        return '/nonexistent/' + f;
    }
    // run timer callbacks right away, the tests only care about the order of the steps
    setTimeout(cb) {
        cb();
        return 1;
    }
    clearTimeout() {}
    setInterval() {}
    clearInterval() {}
    getStateAsync() {
        return Promise.resolve(null);
    }
    subscribeStates() {}
}

const origLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === '@iobroker/adapter-core') return { Adapter: FakeAdapterBase };
    return origLoad.call(this, request, ...rest);
};

const factory = require('../main.js');

// Adapter whose reconnect steps are recorded in `steps` instead of being executed
function mkAdapter(port) {
    const adapter = factory({});
    adapter.config = { port };
    adapter.reconnectDelay = 0;
    adapter.reconnectCounter = 5;
    adapter.steps = [];
    adapter.testConnection = async () => {
        adapter.steps.push('probe');
        return {};
    };
    adapter.delay = async (ms) => {
        adapter.steps.push(`delay ${ms}`);
    };
    adapter.doConnect = async () => {
        adapter.steps.push('connect');
        return true;
    };
    return adapter;
}

// tryToReconnect() starts its work in a timer callback without returning the promise
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('tryToReconnect', () => {
    it('waits between the probe and the connection to a network coordinator', async () => {
        const adapter = mkAdapter('tcp://192.168.0.250:6638');

        await adapter.tryToReconnect();
        await settle();

        assert.deepStrictEqual(adapter.steps, ['probe', 'delay 500', 'connect']);
    });

    it('also waits when the address is written in upper case', async () => {
        const adapter = mkAdapter('TCP://192.168.0.250:6638');

        await adapter.tryToReconnect();
        await settle();

        assert.deepStrictEqual(adapter.steps, ['probe', 'delay 500', 'connect']);
    });

    it('does not wait for a serial coordinator', async () => {
        const adapter = mkAdapter('/dev/ttyUSB0');

        await adapter.tryToReconnect();
        await settle();

        assert.deepStrictEqual(adapter.steps, ['probe', 'connect']);
    });
});

describe('testConnection', () => {
    const origConnect = net.Socket.prototype.connect;
    afterEach(() => {
        net.Socket.prototype.connect = origConnect;
    });

    it('does not open a socket when the name cannot be resolved', async () => {
        let connects = 0;
        net.Socket.prototype.connect = function () {
            connects++;
            return this;
        };
        const adapter = factory({});

        const result = await adapter.testConnection('tcp://name-that-does-not-exist.invalid:6638');
        await settle();

        assert.match(result.error, /Unable to resolve name/);
        assert.strictEqual(connects, 0);
    });

    it('does not report access to a serial port it cannot access', async () => {
        const adapter = factory({});

        const result = await adapter.testConnection('/nonexistent/ttyUSB0');
        await settle();

        assert.match(result.error, /unable to access/);
        assert.ok(!adapter.debugMessages.some((m) => m.includes('read and write access available')));
    });
});
