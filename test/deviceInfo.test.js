'use strict';

// Regression test for getDeviceInformation() when an object has no device in the zigbee database.
//
// getDeviceInformation() builds its list from the ioBroker OBJECTS. leaveDevice() deletes the object
// of a device which left the network without awaiting it, while the device is already gone from the
// herdsman database, so a call which started just before still sees the object and resolveEntity()
// returns undefined for it. Such an object must not be reported - the device is not part of the
// network - and reporting it used to take the adapter down: buildDeviceInfo() returned {} and
// fillInfo() dereferenced models.byUID[UID].model.type on it.
//
// Runs the real Zigbee class from main.js against a stubbed @iobroker/adapter-core; no hardware.
// Run:  node --test test/deviceInfo.test.js

const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { describe, it } = require('node:test');
const assert = require('node:assert');

// main.js and the lib modules import @iobroker/adapter-core; stub it so require() does not pull in
// js-controller. The Adapter base class only has to provide what the constructor chain touches.
class FakeAdapterBase extends EventEmitter {
    constructor() {
        super();
        this.name = 'zigbee';
        this.namespace = 'zigbee.0';
        this.config = {};
        this.log = { debug() {}, info() {}, warn() {}, error() {}, level: 'info' };
    }
    expandFileName(f) {
        return '/nonexistent/' + f;
    }
    setTimeout() {}
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

const LIVE_IEEE = '0xa085e3fffeb62fac';
const LIVE_ADID = 'a085e3fffeb62fac';
const GONE_ADID = '08b95ffffed911c9';

function deviceObject(adId, name, type) {
    return { _id: `zigbee.0.${adId}`, common: { name, type }, native: { id: adId } };
}

function liveEntity() {
    return {
        device: {
            modelID: 'TS0011',
            type: 'Router',
            ieeeAddr: LIVE_IEEE,
            networkAddress: 4711,
            interviewState: 'SUCCESSFUL',
            powerSource: 'Mains (single phase)',
        },
        endpoints: [{ ID: 1, profileID: 260, inputClusters: [0, 4, 6], outputClusters: [25] }],
        mapped: { model: 'TS0011', description: 'Switch', vendor: 'Tuya', options: [], exposes: [] },
        name: 'TS0011',
    };
}

function groupEntity(groupID) {
    return { type: 'group', mapped: { model: 'group' }, device: { groupID }, name: `Group ${groupID}` };
}

// Adapter with the data access it uses in getDeviceInformation stubbed out. `entities` maps the key
// resolveEntity() is called with (0x<ieee> for devices, the number for groups) to the entity.
function mkAdapter(objects, entities) {
    const adapter = factory({});
    adapter.stController.localConfig.localData = { by_id: {}, by_model: {} };
    adapter.getEnumsAsync = () => Promise.resolve({});
    adapter.getDevicesAsync = () => Promise.resolve(objects);
    adapter.getObjectAsync = () => Promise.resolve(null);
    adapter.getStatesAsync = () => Promise.resolve({});
    adapter.getStatesOfAsync = () => Promise.resolve([]);
    adapter.zbController = {
        resolveEntity: (key) => Promise.resolve(entities[key]),
        getClientIterator: () => [].values(),
        getGroupMembersFromController: () => Promise.resolve([]),
        callExtensionMethod: () => Promise.resolve([]),
    };
    return adapter;
}

const listedIds = (result) => result.deviceObjects.map((d) => d._id);

describe('getDeviceInformation with an object whose device left the network', () => {
    it('does not throw while a device is leaving', async () => {
        const adapter = mkAdapter(
            [deviceObject(GONE_ADID, 'Flur - Sensor', 'TS0011')],
            {}, // herdsman no longer knows the device
        );

        await adapter.getDeviceInformation();
    });

    it('does not report the device - it is not part of the network any more', async () => {
        const adapter = mkAdapter([deviceObject(GONE_ADID, 'Flur - Sensor', 'TS0011')], {});

        const result = await adapter.getDeviceInformation();

        assert.deepStrictEqual(listedIds(result), []);
    });

    it('reports the devices which are still in the network', async () => {
        const adapter = mkAdapter(
            [deviceObject(LIVE_ADID, 'Klo - Lüfter', 'TS0011'), deviceObject(GONE_ADID, 'Flur - Sensor', 'TS0011')],
            { [LIVE_IEEE]: liveEntity() },
        );

        const result = await adapter.getDeviceInformation();

        assert.deepStrictEqual(listedIds(result), [`zigbee.0.${LIVE_ADID}`]);
    });

    it('builds the full info block for a device which is still there', async () => {
        const adapter = mkAdapter([deviceObject(LIVE_ADID, 'Klo - Lüfter', 'TS0011')], { [LIVE_IEEE]: liveEntity() });

        const result = await adapter.getDeviceInformation();

        const info = result.deviceObjects[0].info;
        assert.strictEqual(info.device.ieee, LIVE_IEEE);
        assert.strictEqual(info.device.type, 'Router');
        assert.strictEqual(info.mapped.model, 'TS0011');
        assert.strictEqual(info.endpoints.length, 1);
    });

    it('keeps groups - they resolve through the controller and are not devices', async () => {
        const adapter = mkAdapter([{ _id: 'zigbee.0.group_5', common: { name: 'Küche', type: 'group' }, native: { id: 5 } }], {
            5: groupEntity(5),
        });

        const result = await adapter.getDeviceInformation();

        assert.deepStrictEqual(listedIds(result), ['zigbee.0.group_5']);
    });

    it('asking for the single device which just left returns nothing instead of failing', async () => {
        const adapter = mkAdapter([], {});
        adapter.getObjectAsync = () => Promise.resolve(deviceObject(GONE_ADID, 'Flur - Sensor', 'TS0011'));

        const result = await adapter.getDeviceInformation(`zigbee.0.${GONE_ADID}`);

        assert.deepStrictEqual(listedIds(result), []);
    });

    it('asking for a device whose object is already deleted returns nothing instead of failing', async () => {
        // same race from the other side: the object is gone before the admin asks for it, so
        // getObjectAsync answers null
        const adapter = mkAdapter([], {});
        adapter.getObjectAsync = () => Promise.resolve(null);

        const result = await adapter.getDeviceInformation(`zigbee.0.${GONE_ADID}`);

        assert.deepStrictEqual(listedIds(result), []);
    });
});
