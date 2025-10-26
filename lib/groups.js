'use strict';

const json = require('./json');
const statesMapping = require('./devices');
const idRegExp = new RegExp(/group_(\d+)/);
const { getZbId , getAdId } = require('./utils');


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
                if (!id.includes('x')) {
                    const numericresult = Number(id);
                    if (numericresult) return numericresult;
                    const regexResult = id.match(idRegExp);
                    if (regexResult) return Number(regexResult[1]);
                }
                break;
            }
            default: return -1;
        }
        return -1;
    }

    static generateGroupID(gnum) {
        return `group_${gnum}`;
    };

    start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
        this.GroupData = { states:{} }; // field to store group members
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
        this.zbController.on('published', this.onGroupStatePublished.bind(this));
        this.stController.on('changed', this.onDeviceStateChanged.bind(this));
        this.syncGroups();
    }

    stop() {
        delete this.zbController;
        delete this.stController;
        delete this.GroupData;
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

    setMaxVal(target, values) {
        this.adapter.setState(target,values.sort()[values.length-1], true);
    }
    setMinVal(target, values) {
        this.adapter.setState(target,  values.sort()[0], true);
    }

    setAvgVal(target, values) {
        let sum = 0;
        let cnt = 0;
        let hasBooleanSrc = false;
        for (const v of values) {
            if (typeof v === 'boolean') {
                sum += v ? 1 : 0;
                hasBooleanSrc = true;
            }
            else if (typeof v === 'number') sum += v;
            else cnt--;
            cnt++;
        }
        if (cnt > 0) {
            if (hasBooleanSrc) this.adapter.setState(target, sum/cnt > 0.49999999, true);
            else this.adapter.setState(target, sum/cnt, true)
        }
    }

    async onGroupStatePublished(deviceId, model, stateModel, stateList, options, debugId) {
        if (Groups.extractGroupID(deviceId) >= 0) { // the states are group states
            for (const state of stateList) {
                const GroupDataKey =`group_${deviceId}`
                if (state.stateDesc.id === 'memberupdate')
                {
                    this.GroupData[GroupDataKey][state.stateDesc.id] = state.value;
                }
                if ( state.stateDesc.id === 'stateupdate') {
                    this.GroupData[GroupDataKey][state.stateDesc.id] = state.value;
                    this.anyGroupStateUpdate = false;
                    for (const item in this.GroupData) {
                        if (this.GroupData[item] && this.GroupData[item].hasOwnProperty('stateupdate')) {
                            if (this.GroupData[item].stateupdate && this.GroupData[item].stateupdate == 'off') continue;
                            this.anyGroupStateUpdate = true;
                            break;
                        }
                    }
                }
                if (state.stateDesc.isCommonState) continue;
                if (this.GroupData[GroupDataKey].memberupdate) this.readGroupMemberStatus(this, { id: deviceId, state:state.stateDesc.id} );
            }
        }
    }

    async onDeviceStateChanged(deviceId, model, stateModel, stateList, options, debugId) {
        if (Groups.extractGroupID(deviceId) < 0) { // the states are device states
            for (const state of stateList) {
                const GroupDataKey =`group_${deviceId}`
                const sd = state.stateDesc;
                const id = deviceId;
                if (sd.isCommonState || !this.anyGroupStateUpdate) continue // common states are never valid for groups
                const sid = `${this.adapter.namespace}.${deviceId.split('x')[1]}.${state.stateDesc.id}`;
                if (this.GroupData.states[sid]) this.GroupData.states[sid].val = state.value;

                const affectedStates = this.GroupData.states[sid];
                const targetsByGroup = []
                if (typeof affectedStates == 'object' && affectedStates.targets.length > 0) {
                    // find who feeds into these states
                    for (const s of affectedStates.targets)
                    {
                        if (!targetsByGroup.includes(s)) {
                            targetsByGroup.push(s);
                        }
                    }
                    for (const target of targetsByGroup) {
                        const gid = Groups.generateGroupID(getZbId(target));
                        const gData = this.GroupData[gid]
                        if (typeof gData == 'object' && gData.hasOwnProperty('stateupdate') && typeof this.GroupData.groupStates == 'object') {
                            const method = gData.stateupdate;
                            const sources = this.GroupData.groupStates[target]
                            const values = [];
                            if (typeof sources != 'object' || method === 'off') continue;
                            for (const s of sources) {
                                const v = await this.getGroupMemberValue(s);
                                if (v != undefined) {
                                    values.push(v);
                                }
                            }
                            if (values.length < 2) {
                                if (values.length > 0) this.adapter.setState(target, values[0], true)
                                continue;
                            }
                            switch (method) {
                                case 'min':
                                    this.setMinVal(target, values);
                                    break;
                                case 'max':
                                    this.setMaxVal(target, values);
                                    break;
                                case 'avg':
                                    this.setAvgVal(target, values);
                                    break;
                                case 'mat': if (values.filter(c => c == values[0]).length == values.length)
                                    this.adapter.setState(target, values[0], true);
                                    break;
                            }
                        }
                    }
                }
            }
        }
        else {
            for (const state of stateList) {
                const GroupDataKey =`group_${deviceId}`
                if (state.stateDesc.id === 'memberupdate')
                {
                    this.GroupData[GroupDataKey][state.stateDesc.id] = state.value;
                }
                if ( state.stateDesc.id === 'stateupdate') {
                    this.GroupData[GroupDataKey][state.stateDesc.id] = state.value;
                    this.anyGroupStateUpdate = false;
                    for (const item in this.GroupData) {
                        if (this.GroupData[item] && this.GroupData[item].hasOwnProperty('stateupdate')) {
                            if (this.GroupData[item].stateupdate && this.GroupData[item].stateupdate == 'off') continue;
                            this.anyGroupStateUpdate = true;
                            break;
                        }
                    }
                }
            }
        }
    }

    static readables = {
        state: { cluster:6, attributes:['onOff']},
        brightness: { cluster:8, attributes:['currentLevel']},
        colortemp: { cluster:768, attributes:['colorTemperature', 'colorMode']},
        color_temp: { cluster:768, attributes:['colorTemperature', 'colorMode']},
    }

    async readMemberStatus(member, item, toRead) {
        const entity = await this.zbController.resolveEntity(member.ieee, member.epid);
        if (!entity) return;
        const device = entity.device;
        const endpoint = entity.endpoint;
        const mappedModel = entity.mapped;
        if (!mappedModel) return;
        const obj = await this.adapter.getObjectAsync((member.ieee.includes('x') ? member.ieee.split('x')[1] : member.ieee));
        if (obj && obj.common.deactivated) {
            this.debug(`omitting reading member state for deactivated device ${member.ieee}`);
            return;
        }
        const converter = mappedModel.toZigbee.find(c => c && (c.key.includes(item.state)));
        const canReadViaConverter = converter && converter.hasOwnProperty('convertGet');
        if (canReadViaConverter) {
            try {
                await converter.convertGet(endpoint, item.state, {device:entity.device});
            } catch (error) {
                this.debug(`reading ${item.state} from ${member.id}${member.ieee ? '/' + member.epid : ''} via convertGet failed with ${error && error.message ? error.message : 'no reason given'}`);
                return {unread:member.device};
            }
            this.debug(`reading ${item.state} from ${member.ieee}${member.ep ? '/' + member.epid : ''} via convertGet succeeded` );
            return {read:member.device};
        }
        if (toRead.cluster) {
            if (device && endpoint) {
                if (entity.endpoint.inputClusters.includes(toRead.cluster)) {
                    try {
                        const result = await endpoint.read(toRead.cluster, toRead.attributes,{disableDefaultResponse : true });
                        this.debug(`readGroupMemberStatus for ${item.state} from ${member.ieee}${member.ep ? '/' + member.epid : ''} resulted in ${JSON.stringify(result)}`);
                    }
                    catch (error) {
                        this.debug(`reading ${item.state} from ${member.ieee}${member.ep ? '/' + member.epid : ''} via endpoint.read with ${toRead.cluster}, ${JSON.stringify(toRead.attributes)} resulted in ${error && error.message ? error.message : 'an unspecified error'}`);
                    }
                    this.debug(`reading ${item.state} from ${member.ieee}${member.ep ? '/' + member.epid : ''} via endpoint.read with ${toRead.cluster}, ${JSON.stringify(toRead.attributes)} succeeded`);
                }
                else this.debug(`omitting cluster ${toRead.cluster} - not supported`);
            }
            else {
                this.debug(`unable to read ${item.state} from ${member.id}${member.ep ? '/' + member.epid : ''} - unable to resolve the entity`);
            }
            return;
        }
    }

    async readGroupMemberStatus(obj, item) {
        const toRead = Groups.readables[item.state]
        if (toRead) {
            const members = await obj.zbController.getGroupMembersFromController(item.id);
            Promise.all(members.map((m) => this.readMemberStatus(m, item, toRead)))
        }
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
            const errors = [];
            const GroupsToSync = [];
            for (const epid in groups) {
                for (const gpid of groups[epid]) {
                    const gpidn = parseInt(gpid);
                    if (gpidn < 0) {
                        GroupsToSync.push(-gpidn);
                        this.debug(`calling removeDevFromGroup with ${sysid}, ${-gpidn}, ${epid}` );
                        const response = await this.zbController.removeDevFromGroup(sysid, (-gpidn), epid);
                        if (response && response.error) {
                            errors.push(response.error);
                            this.error(`remove dev from group Error: ${JSON.stringify(response.error)}`);
                        }
                        const icon = this.stController.getDefaultGroupIcon(-gpidn)
                    } else if (gpidn > 0) {
                        GroupsToSync.push(gpidn);
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
            this.syncGroups(GroupsToSync);
        } catch (e) {
            this.warn('caught error ' + JSON.stringify(e) + ' in updateGroupMembership');
            this.adapter.sendTo(from, command, {error: e}, callback);
            return;
        }
        //await this.renameGroup(from, command, { name: undefined, id: message.id});
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
        await this.removeGroupMemberStateList(parseInt(message));
    }

    async renameGroup(from, command, message) {
        this.debug(`rename group called with ${from}, ${command}, ${JSON.stringify(message)}`);
        const id = `group_${message.id}`;

        this.stController.localConfig.updateDeviceName(id, message.name);

        try {
            const group = await this.zbController.verifyGroupExists(message.id);
            if (message.remove) {
                for (const member of message.remove) {
                    const response = await this.zbController.removeDevFromGroup(member.id, id, member.ep);
                    this.debug('trying to remove ' + member.id + (member.ep ? '.'+member.ep : '') + ' ' + ' from group ' + message.id + ' response is '+JSON.stringify(response));
                }
            }
        } catch (e) {
            this.warn('renameGroup caught error ' + (e && e.message ? e.message : 'no message'));
            if (e && e.hasOwnProperty('code')) {
                this.warn(`renameGroup caught error ${JSON.stringify(e.code)}`);
            }
        }
        this.debug(`rename group name ${message.name}, id ${id}, remove ${JSON.stringify(message.removeMembers)}`);
        this.syncGroups([parseInt(message.id)]);
    }

    addMissingState(arr, states) {
        if (typeof arr != 'object') arr = [];
        for (const state of [...states]) {
            if (arr.find((candidate) => candidate == state.id)=== undefined) arr.push(state.id)
        }
        return arr;
    }

    async getGroupMemberCapabilities(members) {
        // const rv = [];
        const rv = this.addMissingState([],statesMapping.commonGroupStates);
        for (const member of members) {
            const entity = await this.zbController.resolveEntity(member.ieee, member.epid);
            if (!entity) continue;
            if (entity.endpoint.inputClusters.includes(6)) { // genOnOff
                this.addMissingState(rv,statesMapping.onOffStates);
            }
            if (entity.endpoint.inputClusters.includes(768)) { //genLightingColorCtrl
                this.addMissingState(rv, statesMapping.lightStatesWithColor);
            } else if (entity.endpoint.inputClusters.includes(8)) { // genLvlControl
                this.addMissingState(rv,statesMapping.lightStates);
            }
        }
        return rv;
    }

    async removeGroupMemberStateList(numericGroupID, allowedDevices) {
        const groupID = `group_${numericGroupID}`;
        const gd = this.GroupData;

        const devices = allowedDevices ? allowedDevices : undefined;

        const trackedStates = gd && gd.states ? gd.states : {};
        const t = this;
        if (!devices && this.GroupData.hasOwnProperty(groupID)) delete this.GroupData[groupID];

        // remove the ones which are no longer part of the group
        const keys = Object.keys(trackedStates);

        for (const key of keys) {
            const devId = key.split('.')[2]
            if (devices && devices.includes(getZbId(key))) continue;
            if (trackedStates[key] && typeof trackedStates[key].targets == 'object')
                trackedStates[key].targets = trackedStates[key].targets.filter((c) => !c.includes(groupID));
            else trackedStates[key].targets = [];
            if (trackedStates[key].targets.length < 1) delete trackedStates[key]
        };

    }

    async rebuildGroupMemberStateList(numericGroupID, memberInfo) {
        const groupID = `group_${numericGroupID}`;
        const gd = this.GroupData[groupID];
        const t = this;

        // remove the ones which are no longer part of the group
        const keys = Object.keys(this.GroupData.states);
        this.removeGroupMemberStateList(numericGroupID, memberInfo.members.map((m) => m.ieee));

        const UpdatableStates = [];
        for (const member of memberInfo.members) {
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
                    if (memberInfo.capabilities && memberInfo.capabilities.find(candidate => candidate == key)) {
                        if (member.epname && member.epname == state.epname) return;
                        UpdatableStates.push({id: `${t.adapter.namespace}.${devId}.${state.id}`, grpid: `${t.adapter.namespace}.${groupID}.${key}`})
                    }
                }
            })

        };
        UpdatableStates.forEach(entry => {
            const ged = this.GroupData.states[entry.id]
            if (ged) {
                if (!ged.targets.includes(entry.grpid))
                    ged.targets.push(entry.grpid);
            }
            else
            {
                this.GroupData.states[entry.id] = {val:undefined, targets:[entry.grpid]};
            }
        })
        const gsm = {};
        for (const s in this.GroupData.states) {
            const gds = this.GroupData.states[s]
            if (gds && typeof gds.targets && gds.targets.length > 0) {
                for (const t of gds.targets) {
                    if (!gsm.hasOwnProperty(t))
                        gsm[t] = [];
                    if (!gsm[t].includes(s)) gsm[t].push(s)
                }
            }
        }
        this.GroupData.groupStates = gsm;
    }

    async getGroupMemberValue(id) {
        if (!this.GroupData.states[id]) return undefined;
        const val = this.GroupData.states[id].val;
        if (val == null || val == undefined) {
            const ai = getAdId(this.adapter, id);
            const obj = await this.adapter.getObjectAsync(ai);
            if (obj && obj.common.deactivated) return undefined;
            const state = await this.adapter.getStateAsync(id);
            if (state) {
                this.GroupData.states[id].val = state.val;
                return state.val;
            }
            return undefined;
        }
        return val;
    }

    async syncGroups(group_id) {
        const numericGroupIdArray = [];
        if (group_id) group_id.forEach(gid => numericGroupIdArray.push(Groups.extractGroupID(gid)));
        // get all group id's from the database and the respective names from the local overrides (if present)
        const groups = await this.getGroups();
        const chain = [];
        const usedGroupsIds = numericGroupIdArray.length > 0 ? Object.keys(groups) : [];
        for (const j in groups) {
            if (numericGroupIdArray.length > 0 && !numericGroupIdArray.includes(Number(j))) continue; // skip groups we didnt ask for
            this.debug(`Analysing group_${JSON.stringify(j)}`);
            if (groups.hasOwnProperty(j)) {
                const id = `group_${j}`;
                const members = await this.zbController.getGroupMembersFromController(j);
                const memberInfo = { capabilities: [], members: [] };
                const storedGroupInfo = this.GroupData.hasOwnProperty(id) ? this.GroupData[id] : { capabilities: [], members: [] };
                let GroupMembersChanged = false;
                if (members) for (const member of members) {
                    const entity = await this.zbController.resolveEntity(member.ieee, member.epid);
                    let epname = undefined;
                    if (entity && entity.mapped && entity.mapped.endpoint) {
                        const epnames = entity.mapped.endpoint(entity);
                        for (const key in epnames) {
                            if (epnames[key] == member.epid) {
                                epname = key;
                                break;
                            }
                        }
                    }
                    GroupMembersChanged |= (storedGroupInfo.members.find((obj) => obj.ieee === member.ieee && obj.epid === member.epid) === undefined)
                    memberInfo.members.push({ ieee:member.ieee, epid:member.epid, epname: epname });
                    const key = `${member.ieee}/${member.epid}`;
                }
                GroupMembersChanged |= (memberInfo.members.length != storedGroupInfo.length);
                this.GroupData[id] = memberInfo;

                const mu = await this.adapter.getStateAsync(`${this.adapter.namespace}.group_${j}.memberupdate`);
                if (mu) this.GroupData[id].memberupdate = mu.val;
                else    this.GroupData[id].memberupdate = false;
                const su = await this.adapter.getStateAsync(`${this.adapter.namespace}.group_${j}.stateupdate`);
                if (su) this.GroupData[id].stateupdate = (typeof su.val == 'string' ? su.val : 'off') ;
                else    this.GroupData[id].stateupdate = 'off';
                if (this.GroupData[id].stateupdate != 'off') this.anyGroupStateUpdate = true;

                if (GroupMembersChanged) {
                    memberInfo.capabilities = await this.getGroupMemberCapabilities(memberInfo.members);
                    this.rebuildGroupMemberStateList(j, memberInfo);
                }

                const name = await this.stController.localConfig.NameForId(id, 'group', groups[j]);
                const icon = this.stController.localConfig.IconForId(id, 'group', await this.stController.getDefaultGroupIcon(id));
                chain.push(new Promise(resolve => {
                    const isActive = false;
                    this.adapter.setObjectNotExists(id, {
                        type: 'device',
                        common: {name: name, type: 'group', icon: icon },
                        native: {id: j}
                    }, () => {
                        this.adapter.extendObject(id, {common: {name: name, type: 'group', icon: icon}});
                        // create writable states for groups from their devices
                        for (const stateInd in statesMapping.groupStates) {
                            if (!statesMapping.groupStates.hasOwnProperty(stateInd)) {
                                continue;
                            }
                            const statedesc = statesMapping.groupStates[stateInd];
                            const common = {};
                            for (const prop in statedesc) common[prop] = statedesc[prop];
                            common.color= memberInfo.capabilities.find((candidate) => candidate == statedesc.id) ? null: '#888888';

                            this.stController.updateState(id, statedesc.id, undefined, common);
                        }
                        resolve();
                    });
                }));
                usedGroupsIds.push(j);
            }
        }
        chain.push(new Promise(resolve =>
            // remove unused adapter groups
            this.adapter.getDevices((err, devices) => {
                if (!err) {
                    devices.forEach((dev) => {
                        if (dev.common.type === 'group') {
                            if ( dev.native.id && !usedGroupsIds.includes(dev.native.id)) {
                                this.stController.deleteObj(`group_${dev.native.id}`);
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
