'use strict';

// Run with: node --test lib/zigbeecontroller.publish.test.js
// Covers the foundation branch of ZigbeeController.publish(): every global command the
// developer tab can send has to reach the matching zigbee-herdsman Endpoint method.
// Most global command names equal the method name, but two do not:
//   configReport      -> endpoint.configureReporting()   (already mapped)
//   readReportConfig  -> endpoint.readReportingConfig()

const test = require('node:test');
const assert = require('node:assert');
const ZigbeeController = require('./zigbeecontroller.js');

// Mirrors the real Endpoint surface: it has readReportingConfig, it has NO readReportConfig.
function makeEndpoint() {
    const calls = [];
    const record = name => (...args) => {
        calls.push({ name, args });
        return { ok: name };
    };
    return {
        calls,
        read: record('read'),
        write: record('write'),
        report: record('report'),
        configureReporting: record('configureReporting'),
        readReportingConfig: record('readReportingConfig'),
        writeStructured: record('writeStructured'),
    };
}

function makeController(endpoint) {
    return {
        debugActive: false,
        debug() {},
        error(msg) {
            throw new Error(`unexpected error path: ${msg}`);
        },
        devLabel: id => id,
        resolveEntity: async () => ({ device: { ieeeAddr: '0x1' }, endpoint, mapped: { model: 'stub' } }),
    };
}

async function publish(cmd, zclData) {
    const endpoint = makeEndpoint();
    const ctrl = makeController(endpoint);
    let cbResult;
    await ZigbeeController.prototype.publish.call(
        ctrl, '0x1', 2820, cmd, zclData, null, 1, 'foundation',
        (err, result) => { cbResult = { err, result }; },
    );
    return { endpoint, cbResult };
}

test('readReportConfig maps to endpoint.readReportingConfig', async () => {
    const items = [{ attribute: 'activePower' }];
    const { endpoint, cbResult } = await publish('readReportConfig', items);

    assert.deepStrictEqual(
        endpoint.calls.map(c => c.name),
        ['readReportingConfig'],
        'must call readReportingConfig - endpoint has no method named readReportConfig',
    );
    assert.strictEqual(endpoint.calls[0].args[0], 2820);
    assert.deepStrictEqual(endpoint.calls[0].args[1], items, 'items are passed through untouched');
    assert.strictEqual(endpoint.calls[0].args[2].disableDefaultResponse, true);
    assert.deepStrictEqual(cbResult, { err: undefined, result: { ok: 'readReportingConfig' } });
});

test('configReport still maps to endpoint.configureReporting', async () => {
    const { endpoint } = await publish('configReport', [{ attribute: 'activePower', minimumReportInterval: 10 }]);
    assert.deepStrictEqual(endpoint.calls.map(c => c.name), ['configureReporting']);
});

test('read with an object payload is converted to an attribute name list', async () => {
    const { endpoint } = await publish('read', { acPowerDivisor: 0, acPowerMultiplier: 0 });
    assert.deepStrictEqual(endpoint.calls.map(c => c.name), ['read']);
    assert.deepStrictEqual(endpoint.calls[0].args[1], ['acPowerDivisor', 'acPowerMultiplier']);
});

test('read with an array payload is passed through', async () => {
    const { endpoint } = await publish('read', ['activePower']);
    assert.deepStrictEqual(endpoint.calls[0].args[1], ['activePower']);
});

test('commands whose name already matches the method are dispatched unchanged', async () => {
    for (const cmd of ['write', 'report', 'writeStructured']) {
        const { endpoint } = await publish(cmd, [{ attrId: 1291 }]);
        assert.deepStrictEqual(endpoint.calls.map(c => c.name), [cmd], `${cmd} must dispatch to endpoint.${cmd}`);
    }
});
