'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZigbeeController = require('../lib/zigbeecontroller');

function fixture() {
    const warnings = [];
    const adapter = {
        config: {}, localConfig: {},
        log: { debug() {}, info() {}, warn(message) { warnings.push(message); }, error() {} },
        stController: { verifyDeviceName() { return 'Lamp'; }, checkDebugDevice() { return false; } },
    };
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
    const group = { groupID: 1, hasMember(ep) { return ep === endpoint; } };
    const groups = [group];
    controller.herdsman = {
        getPermitJoin() { return false; },
        *getGroupsIterator() { yield* groups; },
        getGroupByID(id) { return groups.find(g => g.groupID === id); },
    };
    controller.resolveEntity = async () => ({ device, name: device.ieeeAddr, mapped: { model: 'Lamp' }, options: {} });
    return { controller, device, endpoint, group, groups, present, queries, added, warnings };
}

test('announce repairs missing lamp-side membership while retaining the existing group', async () => {
    const f = fixture();
    await f.controller.handleDeviceAnnounce({ device: f.device });
    assert.deepEqual(f.added, [1]);
    assert.deepEqual(f.queries, [{ cluster: 'genGroups', command: 'getMembership', payload: { groupcount: 0, grouplist: [] } }]);
    assert.strictEqual(f.groups[0], f.group);
    await f.controller.handleDeviceAnnounce({ device: f.device });
    assert.deepEqual(f.added, [1], 'existing lamp membership is not added twice');
});

test('existing device join restores groups without requiring a new interview', async () => {
    const f = fixture();
    await f.controller.handleDeviceJoined({ device: f.device });
    assert.deepEqual(f.added, [1]);
});

test('successful interview restores groups too', async () => {
    const f = fixture();
    await f.controller.handleDeviceInterview({ device: f.device, status: 'successful' });
    assert.deepEqual(f.added, [1]);
});

test('devices without saved groups produce no group commands', async () => {
    const f = fixture();
    f.groups.length = 0;
    await f.controller.handleDeviceAnnounce({ device: f.device });
    assert.deepEqual(f.queries, []);
    assert.deepEqual(f.added, []);
});

test('incomplete interview does not trigger restoration', async () => {
    const f = fixture();
    f.device.interviewState = 'IN_PROGRESS';
    await f.controller.handleDeviceJoined({ device: f.device });
    assert.deepEqual(f.queries, []);
});

test('membership query failures and malformed replies do not guess or delete memberships', async () => {
    for (const reply of [undefined, { grouplist: 'invalid' }, { grouplist: [NaN] }, new Error('timeout')]) {
        const f = fixture();
        f.endpoint.command = async () => { if (reply instanceof Error) throw reply; return reply; };
        await f.controller.handleDeviceAnnounce({ device: f.device });
        assert.deepEqual(f.added, []);
        assert.equal(f.groups.length, 1);
        assert.equal(f.warnings.length, 1);
    }
});

test('overlapping announcements share one reconciliation and can retry after failure', async () => {
    const f = fixture();
    let release;
    f.endpoint.command = () => new Promise(resolve => { release = resolve; });
    const first = f.controller.handleDeviceAnnounce({ device: f.device });
    await new Promise(resolve => setImmediate(resolve));
    await f.controller.handleDeviceAnnounce({ device: f.device });
    release(undefined);
    await first;
    f.endpoint.command = async () => ({ grouplist: [] });
    await f.controller.handleDeviceAnnounce({ device: f.device });
    assert.deepEqual(f.added, [1]);
});

test('a group removed during the membership query is not resurrected', async () => {
    const f = fixture();
    f.endpoint.command = async () => { f.groups.length = 0; return { grouplist: [] }; };
    await f.controller.handleDeviceAnnounce({ device: f.device });
    assert.deepEqual(f.added, []);
});

test('shutdown during the membership query prevents further radio writes', async () => {
    const f = fixture();
    f.endpoint.command = async () => { f.controller.herdsmanStarted = false; return { grouplist: [] }; };
    await f.controller.handleDeviceAnnounce({ device: f.device });
    assert.deepEqual(f.added, []);
});


test('restores only saved groups and leaves additional device groups alone', async () => {
    const f = fixture();
    f.present.add(17);
    f.groups.push({ groupID: 2, hasMember(ep) { return ep === f.endpoint; } });
    f.groups.push({ groupID: 3, hasMember() { return false; } });
    await f.controller.handleDeviceAnnounce({ device: f.device });
    assert.deepEqual(f.added, [1, 2]);
    assert.deepEqual([...f.present], [17, 1, 2]);
    assert.equal(f.queries.length, 1);
});

test('failed addition is reported and retried on a later announce', async () => {
    const f = fixture();
    const add = f.endpoint.addToGroup;
    f.endpoint.addToGroup = async () => { throw new Error('ZCL failure'); };
    await f.controller.handleDeviceAnnounce({ device: f.device });
    assert.equal(f.warnings.length, 1);
    assert.deepEqual(f.added, []);
    f.endpoint.addToGroup = add;
    await f.controller.handleDeviceAnnounce({ device: f.device });
    assert.deepEqual(f.added, [1]);
});
