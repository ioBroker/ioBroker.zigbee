'use strict';

const json = require('iobroker.zigbee/lib/json');
const statesMapping = require('./devices');
const idRegExp = new RegExp(/group_(\d+)/);



class Groups {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
        this.log = this.adapter.log;
        this.idRegex = new RegExp(/group_(\d+)/)
    }

    static extractGroupID(id) {
        switch (typeof id) {
            case 'number': return id;
            case 'string': {
                const regexResult = id.match(idRegExp);
                if (regexResult) return Number(regexResult[1]);
                break;
            }
            default: return -1;
        }
    }

    static generateGroupID(gnum) {
        return `group_${gnum}`;
    };

    start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
        this.GroupData = {}; // field to store group members
        /*
        {
            groupid: { info:
                [
                    ieee:
                    ep:
                    epname:
                ], capabilties: [], stateupdate:true, memberupdate:'off'
            }
            groupid: members
            }
            states { 0xabcdef01234567890/1 : {
                id:
                epid:
                groups:[]
                states:[]
              }, states: [state, brightness, ...];
            ]
        }
        */
        this.anyGroupStateUpdate = false;
        this.GroupUpdateIntervalHandle = null;
        this.GroupUpdateQueue = []
        this.stController.on('changed', this.onStateChanged.bind(this));
        this.syncGroups();
    }

    stop() {
        delete this.zbController;
        delete this.stController;
    }

    info(msg) {
        this.adapter.log.info(msg);
    }

    error(msg) {
        this.adapter.log.error(msg);
    }

    debug(msg) {
        this.adapter.log.debug(msg);
    }

    warn(msg) {
        this.adapter.log.warn(msg);
    }

    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'getGroups':
                    this.getGroups(obj);
                    break;
                case 'renameGroup':
                    // used for renaming AND creating groups
                    this.renameGroup(obj.from, obj.command, obj.message, obj.callback);
                    break;
                case 'deleteGroup':
                    this.deleteGroup(obj.from, obj.command, obj.message, obj.callback);
                    break;
                case 'updateGroupMembership':
                    this.updateGroupMembership(obj.from, obj.command, obj.message, obj.callback);
                    break;
            }
        }
    }

    onStateChanged(deviceId, model, stateModel, stateList, options, debugId) {
        this.warn(`group on statechanged for ${deviceId}`);
        if (Groups.extractGroupID(deviceId)) {
            for (const state of stateList) {
                const GroupDataKey =`group_${deviceId}`
                if (state.stateDesc.id === 'memberupdate' || state.stateDesc.id === 'stateupdate') {
                    this.GroupData[GroupDataKey][state.stateDesc.id] = state.value;
                }
                if (state.stateDesc.isCommonState) continue;
                this.warn(`we have group state ${JSON.stringify(state)} changed.`);
                if (this.GroupData[GroupDataKey].memberupdate) this.readGroupMemberStatus(this, { id: deviceId, state:state.stateDesc.id} );
            }
        }
        else {
            for (const state of stateList) {
                const GroupDataKey =`group_${deviceId}`
                const sd = state.stateDesc;
                const id = deviceId;
                if (sd.isCommonState || !this.anyGroupStateUpdate) continue // common states are never valid for groups
                statesMapping.groupStates.forEach((gs) => {
                    if (gs.id === (sd.setattr || sd.prop || sd.id)) {
                        const epname = state.stateDesc.epname;
                        this.warn(`we have a possible group state in ${JSON.stringify(state)}.`);
                        for (const [key, value] of Object.entries(this.GroupData)) {
                            if (value.info.find((obj) => obj.ieee === id && obj.epname === sd.epname)) {
                                this.queuedGroupUpdate(key, gs.id, this.checkGroupMemberStatus);
                            }
                        }
                    }
                });

            }
        }
    }

    async queuedGroupUpdate(grpId, state, func) {
        if (grpId) {
            if (!this.GroupUpdateQueue.find((obj) => obj.id == grpId && obj.state == state))
                this.GroupUpdateQueue.push({id: grpId, state:state, func:func});
        }
        if (!this.GroupUpdateIntervalHandle && this.GroupUpdateQueue.length > 0) {
            this.GroupUpdateIntervalHandle = setInterval(async () =>
                await this.QueuedGroupUpdate(), this.GroupUpdateDelay ? this.GroupUpdateDelay : 500)
        }
        const item = this.GroupUpdateQueue.shift();
        if (this.GroupUpdateQueue.length < 1) clearInterval(this.GroupUpdateIntervalHandle);
        if (item) { // add option check. default for now
            await item.func(this, item);
        }
    }

    async checkGroupMemberStatus(obj, item) {
        obj.warn(`cgms with ${JSON.stringify(item)}`);
        // check options for rule. possible values:
        // none / not set = we do nothing
        // max -> val = min;
        // min -> val = max;
        // avg -> status = average status (bool: on = 1, off = 0, 0.5 = on)

        // check state for each member
        // calculate val by option
        // update group state with value
    }

    static readables = {
        state: { cluster:6, attributes:['onOff']},
        brightness: { cluster:8, attributes:['currentLevel']},
        colortemp: { cluster:768, attributes:['colorTemperature', 'colorMode']},
        color_temp: { cluster:768, attributes:['colorTemperature', 'colorMode']},
    }

    async readGroupMemberStatus(obj, item) {
        obj.warn(`rgms with ${JSON.stringify(item)}`);

        const toRead = Groups.readables[item.state]
        if (toRead) {
            const members = await obj.zbController.getGroupMembersFromController(item.id);
            const result = {
                unsupported: [],
                unread: []
            };
            for (const member of members) {
                // attempt to read via converter

                // read via zigbee read
                const entity = await obj.zbController.resolveEntity(member.ieee, member.epid);
                if (!entity) continue;
                const device = entity.device;
                const endpoint = entity.endpoint;
                const mappedModel = entity.mapped;
                if (!mappedModel) continue;
                const converter = mappedModel.toZigbee.find(c => c && (c.key.includes(item.state)));
                const canReadViaConverter = converter && converter.hasOwnProperty('convertGet');
                if (canReadViaConverter) {
                    try {
                        await converter.convertGet(endpoint, item.state, {device:entity.device});
                    } catch (error) {
                        result.unread.push(member.device);
                    }
                    continue;
                }
                if (toRead.cluster) {
                    if (device && endpoint) {
                        if (entity.endpoint.inputClusters.includes(toRead.cluster)) {
                            try {
                                const result = await endpoint.read(toRead.cluster, toRead.attributes,{disableDefaultResponse : true });
                                obj.warn(`readGroupMemberStatus for ${item.state} from ${member.id}${member.ep ? '/' + member.epid : ''} resulted in ${JSON.stringify(result)}`);
                            }
                            catch (error) {
                                obj.warn(`readGroupMemberStatus for ${item.state} from ${member.id}${member.ep ? '/' + member.epid : ''} resulted in ${error && error.message ? error.message : 'an unspecified error'}`);
                            }
                        }
                        else obj.warn(`omitting cluster ${toRead.cluster} - not supported`);
                    }
                    else {
                        obj.warn(`unable to read ${item.state} from ${member.id}${member.ep ? '/' + member.epid : ''} - unable to resolve the entity`);
                    }
                    continue;
                }
            }
        }
        // for each member in group, try to read the status (with ep)
    }


    buildGroupID(id, withInstance) {
        const parts = [];
        if (withInstance) parts.push(this.adapter.namespace);
        if (Number(id) > 0)
            parts.push(Groups.generateGroupID(id));
        else {
            if (Groups.extractGroupID(id) > 0) parts.push(id);
        }
        return parts.join('.');
    }

    async getGroupMembersFromController(id) {
        const members = [];
        try {
            const group = await this.zbController.getGroupByID(Number(id));
            if (group) {
                const groupmembers = group.members;

                for (const member of groupmembers) {
                    const nwk = member.deviceNetworkAddress;
                    const device = this.zbController.getDeviceByNetworkAddress(nwk);
                    if (device && device.ieeeAddr) {
                        members.push({device: device.ieeeAddr});
                    }
                }
            } else {
                return undefined;
            }

        } catch (error) {
            if (error) this.error(`getGroupMembersFromController: error is  ${JSON.stringify(error)} ${JSON.stringify(new Error().stack)}`);
            else this.error('unidentifed error in getGroupMembersFromController');
        }
        return members;
    }

    async getGroups(obj) {
        this.debug('get groupes called with ' + JSON.stringify(obj));
        const response = {groups: {}};

        const isEnable = await this.adapter.getStateAsync('info.connection');
        this.debug('get groupes called with ' + (obj ? JSON.stringify(obj) : 'no object') + ' ' + (isEnable.val ? 'connected' : 'disconnected'));
        if (isEnable.val) {
            try {
                const herdsmanGroups = await this.zbController.getGroups();
                const groups = {};
                if (typeof herdsmanGroups === 'object') {
                    for (const group of herdsmanGroups) {
                        const gid = group.id;
                        if (gid) {
                            const name = this.stController.verifyDeviceName(`group_${gid}`, `Group`, `Group ${gid}`);
                            groups[gid] = name;
                        }
                    }
                }
                this.debug(`getGroups result: ${JSON.stringify(groups)} ( ${JSON.stringify(herdsmanGroups)})`);
                response.groups = groups;
            } catch (error) {
                response.error = `res getGroups: caught error: ${error}`;
                this.error(`getGroups: caught error: ${error}`);
            } finally {
                obj && this.adapter.sendTo(obj.from, obj.command, response, obj.callback);
            }
        }
        return response.groups;
    }

    async updateGroupMembership(from, command, message, callback) {
        try {
            const groups = message && message.groups ? message.groups : {};
            const devId = message && message.id ? message.id : undefined;
            this.debug('updateGroupMembership called with ' + JSON.stringify(devId));
            if (devId === undefined) {
                this.adapter.sendTo(from, command, {error: 'No device specified'}, callback);
            }
            const sysid = devId.replace(this.adapter.namespace + '.', '0x');
            // Keeping this for reference. State update or state removal needs to be decided upon
            //const id = `${devId}.groups`;
            // this.adapter.setState(id, JSON.stringify(groups), true);

            //const current = await this.zbController.getGroupMembersFromController(sysid);
            const errors = [];
            for (const epid in groups) {
                for (const gpid of groups[epid]) {
                    const gpidn = parseInt(gpid);
                    if (gpidn < 0) {
                        this.debug(`calling removeDevFromGroup with ${sysid}, ${-gpidn}, ${epid}` );
                        const response = await this.zbController.removeDevFromGroup(sysid, (-gpidn), epid);
                        if (response && response.error) {
                            errors.push(response.error);
                            this.error(`remove dev from group Error: ${JSON.stringify(response.error)}`);
                        }
                        const icon = this.stController.getDefaultGroupIcon(-gpidn)
                    } else if (gpidn > 0) {
                        this.debug(`calling addDevToGroup with ${sysid}, ${gpidn}, ${epid}` );
                        const response = await this.zbController.addDevToGroup(sysid, (gpidn), epid);
                        if (response && response.error) {
                            errors.push(response.error);
                            this.error(`add dev to group Error: ${JSON.stringify(response.error)}`);
                        }
                    } else {
                        this.error('illegal group id 0');
                    }
                }
            }
        } catch (e) {
            this.warn('caught error ' + JSON.stringify(e) + ' in updateGroupMembership');
            this.adapter.sendTo(from, command, {error: e}, callback);
            return;
        }
        //await this.renameGroup(from, command, { name: undefined, id: message.id});
        this.syncGroups();
        this.adapter.sendTo(from, command, {}, callback);
    }


    async queryGroupMemberState(groupID, stateDesc) {
        const members = await this.getGroupMembersFromController(groupID);
        const result = {
            unsupported: [],
            unread: []
        };
        for (const member of members) {
            const entity = await this.zbController.resolveEntity(member.device);
            if (!entity) {
                return false;
            }
            this.debug(`entity: ${JSON.stringify(entity)}`);
            const mappedModel = entity.mapped;
            this.debug(`Mapped Model: ${JSON.stringify(mappedModel)}`);
            const converter = mappedModel.toZigbee.find(c => c && (c.key.includes(stateDesc.prop) || c.key.includes(stateDesc.setattr) || c.key.includes(stateDesc.id)));
            if (!converter) {
                result.unsupported.push(member.device);
                continue;
            }
            if (converter.hasOwnProperty('convertGet')) {
                try {
                    await converter.convertGet(entity.device.endpoints[0], stateDesc.id, {});
                } catch (error) {
                    result.unread.push(member.device);
                }
            }
        }
        if (result.unsupported.length > 0) {
            const error = {
                code: 134,
                message: `unsupported ${stateDesc.id} change for group members ${result.unsupported.join()}`
            };
            throw error;
        }
        if (result.unread.length > 0) {
            this.debug(`unread ${stateDesc.id} change for group members ${JSON.stringify(result.unread)}`);
        }
    }

    async deleteGroup(from, command, message) {
        await this.zbController.removeGroupById(message);
        await this.stController.deleteObj(`group_${parseInt(message)}`);
    }

    async renameGroup(from, command, message) {
        this.debug(`rename group called with ${from}, ${command}, ${JSON.stringify(message)}`);
        // const groupsEntry = await this.adapter.getStateAsync('info.groups');
        // const objGroups = (groupsEntry && groupsEntry.val ? JSON.parse(groupsEntry.val) : {});
        const name = message.name;
        const id = `group_${message.id}`;
        let icon = this.stController.localConfig.IconForId(id, 'group', await this.stController.getDefaultGroupIcon(id));
        try {
            const group = await this.zbController.verifyGroupExists(message.id);
            if (message.remove) {
                for (const member of message.remove) {
                    const response = await this.zbController.removeDevFromGroup(member.id, id, member.ep);
                    this.debug('trying to remove ' + member.id + (member.ep ? '.'+member.ep : '') + ' ' + ' from group ' + message.id + ' response is '+JSON.stringify(response));
                }
            }
            if (icon.match(/img\/group_\d+\.png/g)) {
                icon = await this.zbController.rebuildGroupIcon(group);
            }
        } catch (e) {
            this.warn('renameGroup caught error ' + (e && e.message ? e.message : 'no message'));
            if (e && e.hasOwnProperty('code')) {
                this.warn(`renameGroup caught error ${JSON.stringify(e.code)}`);
            }
        }
        this.debug(`rename group name ${name}, id ${id}, icon ${icon} remove ${JSON.stringify(message.removeMembers)}`);
        const group = await this.adapter.getObjectAsync(id);
        if (!group) {
            this.debug('group object doesnt exist ')
            // assume we have to create the group
            this.adapter.setObjectNotExists(id, {
                type: 'device',
                common: {name: (name ? name : `Group ${message.id}` ), type: 'group', icon: icon},
                native: {id}
            }, () => {
                this.adapter.extendObject(id, {common: {name, type: 'group', icon: icon}});
                // create writable states for groups from their devices
                for (const stateInd in statesMapping.groupStates) {
                    if (!statesMapping.groupStates.hasOwnProperty(stateInd)) {
                        continue;
                    }
                    const statedesc = statesMapping.groupStates[stateInd];
                    const common = {
                        name: statedesc.name,
                        type: statedesc.type,
                        unit: statedesc.unit,
                        read: statedesc.read,
                        write: statedesc.write,
                        icon: statedesc.icon,
                        role: statedesc.role,
                        min: statedesc.min,
                        max: statedesc.max,
                    };
                    this.stController.updateState(id, statedesc.id, undefined, common);
                }
                this.stController.storeDeviceName(id, name);
            });
        }
        else {
            this.debug('group object exists');
            this.adapter.extendObject(id, {common: {name, type: 'group', icon: icon}});
        }
    }

    addMissingState(arr, state) {
        if (arr.find((candidate) => candidate.id == state.id)=== undefined) arr.push(state);
    }

    async getGroupMemberCapabilities(members) {
        const rv = statesMapping.commonGroupStates;
        for (const member of members) {
            const entity = await this.zbController.resolveEntity(member.ieee, member.epid);
            if (!entity) continue;
            if (entity.endpoint.inputClusters.includes(6)) { // on/off
                this.addMissingState(rv,statesMapping.onOffStates);
            }
            if (entity.endpoint.inputClusters.includes(768)) {
                for (const state of statesMapping.lightStatesWithColor) {
                    this.addMissingState(rv, state);
                }
            } else if (entity.endpoint.inputClusters.includes(8)) { // genLvlControl
                for (const state of statesMapping.lightStates) {
                    this.addMissingState(rv, state);
                }
            }
        }
        return rv;
    }


    async rebuildGroupMemberStateList(numericGroupID, members) {
//        const groupID = Groups.buildGroupID(numericGroupID);
        const groupID = `group_${numericGroupID}`;
        const gd = this.GroupData[groupID];
        const trackedStates = gd && gd.states ? gd.states : {};
        const t = this;

        // remove the ones which are no longer part of the group
        const keys = Object.keys(trackedStates);

        keys.forEach(key => {
            members.info.forEach(member => {
                const mp = member.ieee.split('x');
                if (!key.includes(mp.length > 1 ? mp[1] : mp[0])) {
                    const remain = trackedStates[key].filter(grp => !(grp.includes(groupID)));
                    trackedStates[key] = remain;
                }
            })
        })

        const UpdatableStates = [];
        members.info.forEach(async (member) => {
            const entity = await t.zbController.resolveEntity(member.ieee, member.epid);
            if (!entity) return;
            const device = entity.device;
            const endpoint = entity.endpoint;
            const mappedModel = entity.mapped;
            if (!mappedModel) return;
            const ieeeParts = member.ieee.split('x');
            const devId = ieeeParts.length > 1 ? ieeeParts[1]:ieeeParts[0]
            const devStates = await t.stController.getDevStates(devId, mappedModel.model);
            devStates.states.forEach(state => {
                const key = state.setattr || state.prop || state.id;
                if (key) {
                    if (members.capabilities && members.capabilities.find(candidate => candidate.id == key)) {
                        t.warn(`updatablestates: was ${JSON.stringify(UpdatableStates)}, adding ${devId}.${state.id}`);
                        UpdatableStates.push({id: `${t.adapter.namespace}.${devId}.${state.id}`, grpid: `${t.adapter.namespace}.${groupID}.${key}`})
                    }
                }
            })

        });
        t.warn(`updatablestates are ${JSON.stringify(UpdatableStates)}`);
        UpdatableStates.forEach(entry => {
            if (trackedStates[entry.id]) {
                if (!trackedStates[entry.id].includes(entry.grpid))
                    trackedStates.push(entry.grpid);
            }
            else
            {
                trackedStates[entry.id] = [entry.grpid];
            }
        })
        gd.states = trackedStates;


    }

    async syncGroups() {
        // get all group id's from the database and the respective names from the local overrides (if present)
        const groups = await this.getGroups();
        const chain = [];
        const currentMembers = {};
        const usedGroupsIds = [];
        let GroupCount = 0;
        for (const j in groups) {
            GroupCount++;
            this.debug(`group ${GroupCount} is ${JSON.stringify(j)}`);
            if (groups.hasOwnProperty(j)) {
                const id = `group_${j}`;
                const members = await this.zbController.getGroupMembersFromController(j);
                const memberInfo = { capabilities: [], info: [] };
                const storedGroupInfo = this.GroupData.hasOwnProperty(id) ? this.GroupData[id] : { capabilities: [], info: [] };
                let GroupMembersChanged = false;
                if (members) for (const member of members) {
                    const entity = await this.zbController.resolveEntity(member.ieee, member.epid);
                    let epname = undefined;
                    if (entity && entity.mapped && entity.mapped.endpoint) {
                        const epnames = entity.mapped.endpoint();
                        for (const key in epnames) {
                            if (epnames[key] == member.epid) {
                                epname = key;
                                break;
                            }
                        }
                    }
                    GroupMembersChanged |= (storedGroupInfo.info.find((obj) => obj.ieee === member.ieee && obj.epid === member.epid) === undefined)
                    memberInfo.info.push({ ieee:member.ieee, epid:member.epid, epname: epname });
                    const key = `${member.ieee}/${member.epid}`;
                    if (currentMembers.hasOwnProperty(key)) {
                        if (!currentMembers[key].includes(id)) currentMembers[key].push(id);
                    } else currentMembers[key] = [id];
                }
                GroupMembersChanged |= (memberInfo.info.length != storedGroupInfo.length);
                this.GroupData[id] = memberInfo;

                if (GroupMembersChanged) {
                    memberInfo.capabilities = await this.getGroupMemberCapabilities(memberInfo.info);
                    this.rebuildGroupMemberStateList(j, memberInfo);
                }
                this.adapter.getState(`${this.adapter.namespace}.group_${j}.memberupdate`, (err, state) => {
                    if (state) this.GroupData[id].memberupdate = state.val;
                })
                this.adapter.getState(`${this.adapter.namespace}.group_${j}.stateupdate`, (err,state) => {
                    if (state) this.GroupData[id].stateupdate = state.val ? state.value : 'off';
                })

                const name = groups[j];
                const icon = this.stController.localConfig.IconForId(id, 'group', await this.stController.getDefaultGroupIcon(id));
                chain.push(new Promise(resolve => {
                    const isActive = false;
                    this.adapter.setObjectNotExists(id, {
                        type: 'device',
                        common: {name: name, type: 'group', icon: icon },
                        native: {id: j}
                    }, () => {
                        this.adapter.extendObject(id, {common: {type: 'group', icon: icon}});
                        // create writable states for groups from their devices
                        for (const stateInd in statesMapping.groupStates) {
                            if (!statesMapping.groupStates.hasOwnProperty(stateInd)) {
                                continue;
                            }
                            const statedesc = statesMapping.groupStates[stateInd];
                            const common = {
                                name: statedesc.name,
                                type: statedesc.type,
                                unit: statedesc.unit,
                                read: statedesc.read,
                                write: statedesc.write,
                                icon: statedesc.icon,
                                role: statedesc.role,
                                min: statedesc.min,
                                max: statedesc.max,
                                color: memberInfo.capabilities.find((candidate) => candidate.id == statedesc.id) ? null: '#888888',
                            };
                            this.stController.updateState(id, statedesc.id, undefined, common);
                        }
                        resolve();
                    });
                }));
                usedGroupsIds.push(parseInt(j));
            }
        }
        chain.push(new Promise(resolve =>
            // remove unused adapter groups
            this.adapter.getDevices((err, devices) => {
                if (!err) {
                    devices.forEach((dev) => {
                        if (dev.common.type === 'group') {
                            const groupid = parseInt(dev.native.id);
                            if (!usedGroupsIds.includes(groupid)) {
                                this.stController.deleteObj(`group_${groupid}`);
                            }
                        }
                    });
                }
                resolve();
            })));

        await Promise.all(chain);
    }
}

module.exports = Groups ;
