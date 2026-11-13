'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZigbeeController = require('../lib/zigbeecontroller');
const Module = require('node:module');
const originalLoad = Module._load;
let LocalConfig;
try {
    // LocalConfig uses no adapter-core API here; avoid requiring a real controller sandbox.
    Module._load = function (request, ...args) {
        if (request === '@iobroker/adapter-core') return {};
        return originalLoad.call(this, request, ...args);
    };
    LocalConfig = require('../lib/localConfig');
} finally {
    Module._load = originalLoad;
}

function fixture() {
    const warnings = [];
    const adapter = {
        config: { restoreGroupsOnRejoin: true }, localConfig: {}, on() {}, sendError() {},
        log: { debug() {}, info() {}, warn(message) { warnings.push(message); }, error() {} },
        stController: { verifyDeviceName() { return 'Lamp'; }, checkDebugDevice() { return false; } },
    };
    adapter.localConfig = new LocalConfig(adapter);
    adapter.localConfig.localData.by_model.Lamp = { options: { restoreGroupsOnRejoin: true } };
    const controller = new ZigbeeController(adapter);
    controller.on('log', (level, message) => { if (level === 'warn') warnings.push(message); });
    controller.debugActive = false;
    controller.herdsmanStarted = true;
    controller.callExtensionMethod = () => {};
    const added = [];
    const queries = [];
    const present = new Set();
    const endpoint = {
        ID: 1, inputClusters: [4],
        async command(cluster, command, payload) {
            queries.push({ cluster, command, payload });
            return { capacity: 20, groupcount: present.size, grouplist: [...present] };
        },
        async addToGroup(group) { added.push(group.groupID); present.add(group.groupID); },
    };
    const device = { ieeeAddr: '0x00124b0000000001', interviewState: 'SUCCESSFUL', endpoints: [endpoint] };
    endpoint.getDevice = () => device;
    const group = { groupID: 1, members: [endpoint], hasMember(ep) { return ep === endpoint; } };
    const groups = [group];
    controller.herdsman = {
        getPermitJoin() { return false; },
        *getGroupsIterator() { yield* groups; },
        getGroupByID(id) { return groups.find(g => g.groupID === id); },
    };
    controller.resolveEntity = async () => ({ device, name: device.ieeeAddr, mapped: { model: 'Lamp' }, options: adapter.localConfig.getOptions(device.ieeeAddr, 'Lamp') });
    return { controller, device, endpoint, group, groups, present, queries, added, warnings };
}

test('ineligible devices cause no group queries', async () => {
    for (const scenario of ['no saved groups', 'incomplete interview', 'no groups input cluster']) {
        const f = fixture();
        if (scenario === 'no saved groups') f.groups.length = 0;
        if (scenario === 'incomplete interview') f.device.interviewState = 'IN_PROGRESS';
        if (scenario === 'no groups input cluster') f.endpoint.inputClusters = [];
        await f.controller.handleDeviceJoined({ device: f.device });
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(f.queries, [], scenario);
        assert.deepEqual(f.warnings, [], scenario);
    }
});

test('query and add failures preserve memberships and allow a later retry', async () => {
    for (const failure of [undefined, { grouplist: 'invalid' }, { grouplist: [NaN] }, new Error('timeout'), 'add failure']) {
        const f = fixture();
        const command = f.endpoint.command;
        const add = f.endpoint.addToGroup;
        if (failure === 'add failure') f.endpoint.addToGroup = async () => { throw new Error('ZCL failure'); };
        else f.endpoint.command = async () => { if (failure instanceof Error) throw failure; return failure; };
        await f.controller.restoreDeviceGroups(f.device);
        assert.deepEqual(f.added, []);
        assert.equal(f.warnings.length, 1);
        f.endpoint.command = command;
        f.endpoint.addToGroup = add;
        await f.controller.restoreDeviceGroups(f.device);
        assert.deepEqual(f.added, [1]);
    }
});

test('rejoin bursts serialize radio requests and coalesce duplicate events', async () => {
    const f = fixture();
    let release, started;
    let queries = 0;
    const querying = new Promise(resolve => { started = resolve; });
    f.endpoint.command = () => {
        queries++;
        started();
        return new Promise(resolve => { release = resolve; });
    };
    const other = { ...f.device, ieeeAddr: '0x002' };
    const endpoint = { ...f.endpoint, getDevice: () => other, command: async () => { queries++; return { grouplist: [1] }; } };
    other.endpoints = [endpoint];
    f.group.members.push(endpoint);
    f.group.hasMember = ep => f.group.members.includes(ep);
    const first = f.controller.restoreDeviceGroups(f.device);
    await querying;
    const duplicate = f.controller.restoreDeviceGroups(f.device);
    const second = f.controller.restoreDeviceGroups(other);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(queries, 1);
    release(undefined);
    await Promise.all([first, duplicate, second]);
    assert.equal(queries, 2);
    assert.equal(f.warnings.length, 1);
});

test('a group removed during the membership query is not resurrected', async () => {
    const f = fixture();
    f.endpoint.command = async () => { f.groups.length = 0; return { grouplist: [] }; };
    await f.controller.handleDeviceJoined({ device: f.device });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.added, []);
});

test('restores only saved groups and leaves additional device groups alone', async () => {
    const f = fixture();
    f.present.add(17);
    f.groups.push({ groupID: 2, members: [f.endpoint], hasMember(ep) { return ep === f.endpoint; } });
    f.groups.push({ groupID: 3, members: [], hasMember() { return false; } });
    await f.controller.handleDeviceJoined({ device: f.device });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.added, [1, 2]);
    assert.deepEqual([...f.present], [17, 1, 2]);
    assert.equal(f.queries.length, 1);
    await f.controller.handleDeviceJoined({ device: f.device });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.added, [1, 2], 'existing memberships are not added again');
});

test('restoration is opt-in, including configurations from older installations', async () => {
    for (const enabled of [false, undefined]) {
        const f = fixture();
        f.controller.adapter.config.restoreGroupsOnRejoin = enabled;
        let scans = 0;
        f.controller.herdsman.getGroupsIterator = function* () { scans++; yield* f.groups; };
        await f.controller.handleDeviceJoined({ device: f.device });
        await f.controller.handleDeviceInterview({ device: f.device, status: 'successful' });
        assert.equal(scans, 0);
        assert.deepEqual(f.queries, []);
        assert.deepEqual(f.warnings, []);
    }
});

test('event handlers finish while a membership query is still pending', async () => {
    for (const event of ['handleDeviceJoined', 'handleDeviceInterview']) {
        const f = fixture();
        let release, started;
        const querying = new Promise(resolve => { started = resolve; });
        f.endpoint.command = () => { started(); return new Promise(resolve => { release = resolve; }); };
        const handled = f.controller[event]({ device: f.device, status: 'successful' });
        const finished = await Promise.race([handled.then(() => true), new Promise(resolve => setImmediate(() => resolve(false)))]);
        await querying;
        release({ grouplist: [] });
        await handled;
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(finished, true, event);
        assert.deepEqual(f.added, [1]);
    }
});

test('repeated events and ungrouped devices do not rescan the network groups', async () => {
    const f = fixture();
    let scans = 0;
    f.controller.herdsman.getGroupsIterator = function* () { scans++; yield* f.groups; };
    for (const device of [f.device, f.device, { ...f.device, ieeeAddr: '0x002' }]) {
        await f.controller.handleDeviceJoined({ device });
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(scans, 1);
    assert.equal(f.queries.length, 2);
});

test('adding a membership after the index was built makes it eligible for restoration', async () => {
    const f = fixture();
    await f.controller.restoreDeviceGroups(f.device);
    const group = { groupID: 2, members: [], hasMember(ep) { return this.members.includes(ep); } };
    f.groups.push(group);
    f.controller.getGroupMembersFromController = async () => [];
    f.controller.resolveEntity = async id => id === 2 ? { mapped: group } : { device: f.device, endpoint: f.endpoint, options: { restoreGroupsOnRejoin: true } };
    const add = f.endpoint.addToGroup;
    f.endpoint.addToGroup = async group => { await add(group); if (!group.hasMember(f.endpoint)) group.members.push(f.endpoint); };
    f.controller.herdsman.getGroupsIterator = () => { assert.fail('membership edit rescanned network groups'); };
    assert.deepEqual(await f.controller.addDevToGroup(f.device.ieeeAddr, 2), {});
    f.present.clear();
    f.added.length = 0;
    await f.controller.restoreDeviceGroups(f.device);
    assert.deepEqual(f.added, [1, 2]);
});

test('shutdown stops queries for the remaining endpoints', async () => {
    const f = fixture();
    const second = { ...f.endpoint, ID: 2, command() { assert.fail('query after shutdown'); } };
    f.device.endpoints.push(second);
    f.group.members.push(second);
    f.group.hasMember = ep => f.group.members.includes(ep);
    f.endpoint.command = async () => { f.controller.herdsmanStarted = false; return { grouplist: [] }; };
    await f.controller.restoreDeviceGroups(f.device);
    assert.deepEqual(f.added, []);
    assert.deepEqual(f.warnings, []);
});

test('announcements retain normal state reads without querying or restoring groups', async () => {
    const f = fixture();
    f.controller.readAtAnnounce = true;
    let reads = 0;
    f.controller.doDeviceQuery = async () => { reads++; };
    await f.controller.handleDeviceAnnounce({ device: f.device });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 1);
    assert.deepEqual(f.queries, []);
    assert.deepEqual(f.added, []);
});

test('device and model options gate restoration before any group scan', async () => {
    for (const [model, device, enabled] of [
        [undefined, undefined, false], [true, undefined, true],
        [true, false, false], [false, true, true], [undefined, true, true],
    ]) {
        const f = fixture();
        f.controller.localConfig.localData.by_model.Lamp.options = { restoreGroupsOnRejoin: model };
        f.controller.localConfig.localData.by_id[f.device.ieeeAddr.slice(2)] = { options: { restoreGroupsOnRejoin: device } };
        // Missing values must be absent, as in saved user options.
        if (device === undefined) delete f.controller.localConfig.localData.by_id[f.device.ieeeAddr.slice(2)].options.restoreGroupsOnRejoin;
        let scans = 0;
        f.controller.herdsman.getGroupsIterator = function* () { scans++; yield* f.groups; };
        await f.controller.restoreDeviceGroups(f.device);
        assert.equal(scans, enabled ? 1 : 0);
        assert.equal(f.queries.length, enabled ? 1 : 0);
        assert.deepEqual(f.warnings, []);
    }
});

test('listing groups and removing unrelated devices preserve the existing index', async () => {
    const f = fixture();
    await f.controller.restoreDeviceGroups(f.device);
    const index = f.controller.deviceGroups;
    const endpoints = index.get(f.device.ieeeAddr);
    f.controller.getGroupMembersFromController = async () => [];
    await f.controller.getGroups();
    f.controller.herdsman.getDeviceByIeeeAddr = () => undefined;
    await f.controller.remove('0x002', false);
    await f.controller.handleDeviceLeave({ ieeeAddr: '0x003' });
    assert.equal(f.controller.deviceGroups, index);
    assert.equal(index.get(f.device.ieeeAddr), endpoints);
    f.controller.herdsman.getGroupsIterator = () => { assert.fail('unnecessary index rebuild'); };
    await f.controller.restoreDeviceGroups(f.device);
    assert.equal(f.queries.length, 2);
});

test('removing a grouped device deletes only its cached memberships', async () => {
    const f = fixture();
    await f.controller.restoreDeviceGroups(f.device);
    const index = f.controller.deviceGroups;
    const other = new Map();
    index.set('0x002', other);
    let removed = false;
    f.device.removeFromNetwork = async () => {};
    f.device.removeFromDatabase = () => { removed = true; };
    f.controller.herdsman.getDeviceByIeeeAddr = () => removed ? undefined : f.device;
    await f.controller.remove(f.device.ieeeAddr, false);
    assert.equal(removed, true);
    assert.equal(index.has(f.device.ieeeAddr), false);
    assert.equal(index.get('0x002'), other);
    assert.equal(f.controller.deviceGroups, index);
    index.set(f.device.ieeeAddr, new Map());
    await f.controller.handleDeviceLeave({ ieeeAddr: f.device.ieeeAddr });
    assert.equal(index.has(f.device.ieeeAddr), false);
    assert.equal(index.get('0x002'), other);
});

test('group deletion prunes only removed groups and retains failed removals', async () => {
    for (const fail of [false, true]) {
        const f = fixture();
        const second = { ...f.endpoint, ID: 2 };
        f.device.endpoints.push(second);
        f.group.members.push(second);
        f.group.hasMember = ep => f.group.members.includes(ep);
        const retained = { groupID: 2, members: [f.endpoint], hasMember: ep => ep === f.endpoint };
        f.groups.push(retained);
        await f.controller.restoreDeviceGroups(f.device);
        const index = f.controller.deviceGroups;
        index.values = () => { assert.fail('group deletion scanned unrelated devices'); };
        f.endpoint.removeFromGroup = async () => { f.group.members.splice(f.group.members.indexOf(f.endpoint), 1); };
        second.removeFromGroup = async () => {
            if (fail) throw new Error('timeout');
            f.group.members.splice(f.group.members.indexOf(second), 1);
        };
        f.group.removeFromDatabase = () => { f.groups.splice(0, 1); };
        await f.controller.removeGroupById(1);
        assert.equal(f.controller.deviceGroups, index);
        assert.deepEqual(f.group.members, fail ? [second] : []);
        assert.deepEqual(index.get(f.device.ieeeAddr).get(1), fail ? [f.group, retained] : [retained]);
        assert.deepEqual(f.warnings, []);
    }
});

test('membership removal refreshes only the affected device', async () => {
    const f = fixture();
    await f.controller.restoreDeviceGroups(f.device);
    const index = f.controller.deviceGroups;
    const other = new Map();
    index.set('0x002', other);
    f.group.hasMember = ep => f.group.members.includes(ep);
    f.endpoint.removeFromGroup = async () => { f.group.members.length = 0; };
    f.controller.resolveEntity = async id => id === 1 ? { mapped: f.group } : { device: f.device, endpoint: f.endpoint };
    f.controller.herdsman.getGroupsIterator = () => { assert.fail('membership edit rescanned network groups'); };
    assert.deepEqual(await f.controller.removeDevFromGroup('zigbee.0.' + f.device.ieeeAddr.slice(2), 1), {});
    assert.equal(f.controller.deviceGroups, index);
    assert.equal(index.get('0x002'), other);
    assert.equal(index.get(f.device.ieeeAddr).size, 0);
});

test('manual removals win over an in-flight restoration add', async () => {
    for (const operation of ['removeDevFromGroup', 'removeDevFromAllGroups', 'removeGroupById']) {
        const f = fixture();
        let release, started;
        const adding = new Promise(resolve => { started = resolve; });
        f.group.hasMember = ep => f.group.members.includes(ep);
        f.endpoint.addToGroup = async () => {
            started();
            await new Promise(resolve => { release = resolve; });
            if (!f.group.hasMember(f.endpoint)) f.group.members.push(f.endpoint);
            f.present.add(1);
        };
        f.endpoint.removeFromGroup = async () => {
            f.group.members.length = 0;
            f.present.delete(1);
        };
        f.endpoint.removeFromAllGroups = f.endpoint.removeFromGroup;
        f.group.removeFromDatabase = () => { f.groups.length = 0; };
        f.controller.resolveEntity = async id => id === 1 ? { mapped: f.group } : {
            device: f.device, endpoint: f.endpoint, endpoints: [f.endpoint], options: { restoreGroupsOnRejoin: true },
        };
        const restoration = f.controller.restoreDeviceGroups(f.device);
        await adding;
        const removal = operation === 'removeGroupById'
            ? f.controller.removeGroupById(1)
            : f.controller[operation](f.device.ieeeAddr, 1);
        await new Promise(resolve => setImmediate(resolve));
        release();
        await restoration;
        assert.equal((await removal)?.error, undefined);
        assert.equal(f.group.hasMember(f.endpoint), false);
        assert.equal(f.present.has(1), false);
        await f.controller.restoreDeviceGroups(f.device);
        assert.equal(f.present.has(1), false);
    }
});
