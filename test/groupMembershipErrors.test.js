'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Groups = require('../lib/groups');

function fixture() {
    const replies = [];
    const adapter = new EventEmitter();
    adapter.namespace = 'zigbee.0';
    adapter.log = { debug() {}, info() {}, warn() {}, error() {} };
    adapter.sendTo = (from, command, message) => replies.push(message);
    const groups = new Groups(adapter);
    groups.zbController = { addDevToGroup: async () => ({}), removeDevFromGroup: async () => ({}) };
    groups.stController = { getDefaultGroupIcon() {} };
    groups.syncGroups = async () => {};
    const update = memberships => groups.updateGroupMembership('probe', 'updateGroupMembership', {
        id: 'zigbee.0.00124b0000000001', groups: { '1': memberships },
    }, {});
    return { groups, replies, update };
}

test('returns addition errors instead of success', async () => {
    const f = fixture();
    f.groups.zbController.addDevToGroup = async () => ({ error: 'radio timeout' });
    await f.update([1]);
    assert.deepEqual(f.replies, [{ error: 'radio timeout' }]);
});

test('returns removal errors instead of success', async () => {
    const f = fixture();
    f.groups.zbController.removeDevFromGroup = async () => ({ error: 'remove failed' });
    await f.update([-1]);
    assert.deepEqual(f.replies, [{ error: 'remove failed' }]);
});

test('keeps partial successful changes synchronized and reports all failures', async () => {
    const f = fixture();
    const added = [];
    const synced = [];
    f.groups.zbController.addDevToGroup = async (device, id) => {
        added.push(id);
        return id === 2 ? {} : { error: `failed group ${id}` };
    };
    f.groups.syncGroups = async (changed, ids) => synced.push(...ids);
    await f.update([1, 2, 3]);
    assert.deepEqual(added, [1, 2, 3]);
    assert.deepEqual(synced, [1, 2, 3]);
    assert.deepEqual(f.replies, [{ error: 'failed group 1; failed group 3' }]);
});

test('does not report success before synchronization completes', async () => {
    const f = fixture();
    let release;
    f.groups.syncGroups = () => new Promise(resolve => { release = resolve; });
    const updating = f.update([1]);
    await new Promise(resolve => setImmediate(resolve));
    const earlyReplies = [...f.replies];
    release();
    await updating;
    assert.deepEqual(earlyReplies, []);
    assert.deepEqual(f.replies, [{}]);
});

test('returns asynchronous synchronization failures through the callback', async () => {
    const f = fixture();
    f.groups.syncGroups = async () => { throw new Error('sync failed'); };
    await f.update([1]);
    assert.deepEqual(f.replies, [{ error: 'sync failed' }]);
});

test('returns success once when all membership changes and synchronization succeed', async () => {
    const f = fixture();
    await f.update([1, -2]);
    assert.deepEqual(f.replies, [{}]);
});
