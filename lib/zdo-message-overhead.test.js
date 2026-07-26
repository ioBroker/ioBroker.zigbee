'use strict';

// Run with: node --test lib/zdo-message-overhead.test.js
//
// Zdo.Buffalo.buildRequest() takes hasZdoMessageOverhead as its first argument. The flag
// decides whether a leading byte is reserved for the transaction sequence number, and it is
// coordinator specific: false on zstack/zigate/zboss, true on ember/ezsp/deconz.
//
// Adapters that need the byte write the message tag into payload[0] before sending. If the
// byte was not reserved, that write lands on the first byte of the channel mask instead.

const test = require('node:test');
const assert = require('node:assert');
const ZDO = require('zigbee-herdsman/dist/zspec/zdo');
const ZigbeeController = require('./zigbeecontroller.js');

const CHANNELS_11_TO_26_MASK = 0x07fff800;
const MESSAGE_TAG = 0x42;

// Captures the payload getChannelsEnergy() hands to the adapter.
function makeController(hasZdoMessageOverhead) {
    const stub = Object.create(ZigbeeController.prototype);
    stub.debugActive = false;
    stub.debug = () => {};
    stub.error = () => {};
    stub.sendError = () => {};
    stub.sent = null;
    stub.herdsman = {
        adapter: {
            hasZdoMessageOverhead,
            sendZdo: async (_ieee, _nwk, _cluster, payload) => {
                stub.sent = Buffer.from(payload);
                return [{}, { entryList: [] }];
            },
        },
    };
    return stub;
}

// What ember/ezsp do to the payload right before sending it.
function applyMessageTag(payload) {
    const copy = Buffer.from(payload);
    copy[0] = MESSAGE_TAG;
    return copy;
}

test('the overhead flag is taken from the adapter, not hardcoded', async () => {
    const ember = makeController(true);
    await ember.getChannelsEnergy();
    const zstack = makeController(false);
    await zstack.getChannelsEnergy();

    assert.strictEqual(
        ember.sent.length,
        zstack.sent.length + 1,
        'a coordinator requiring the overhead has to get one byte more',
    );
});

test('on a coordinator with overhead the channel mask survives the message tag', async () => {
    const controller = makeController(true);
    await controller.getChannelsEnergy();

    const maskOffset = 1; // the reserved byte comes first
    assert.strictEqual(controller.sent.readUInt32LE(maskOffset), CHANNELS_11_TO_26_MASK);
    assert.strictEqual(
        applyMessageTag(controller.sent).readUInt32LE(maskOffset),
        CHANNELS_11_TO_26_MASK,
        'the tag must not reach the channel mask',
    );
});

test('on a coordinator without overhead the payload is unchanged', async () => {
    const controller = makeController(false);
    await controller.getChannelsEnergy();

    const expected = ZDO.Buffalo.buildRequest(
        false,
        ZDO.ClusterId.NWK_UPDATE_REQUEST,
        [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
        0x05,
        1,
        0,
        undefined,
    );
    assert.deepStrictEqual(controller.sent, Buffer.from(expected), 'zstack/zigate/zboss keep the current payload');
    assert.strictEqual(controller.sent.readUInt32LE(0), CHANNELS_11_TO_26_MASK);
});
