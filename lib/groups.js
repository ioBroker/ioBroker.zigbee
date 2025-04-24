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

    async syncGroups() {
        const groups = await this.getGroups();
        this.debug('sync Groups called: groups is '+ JSON.stringify(groups))
        const chain = [];
        const usedGroupsIds = [];
        let GroupCount = 0;
        for (const j in groups) {
            GroupCount++;
            this.debug(`group ${GroupCount} is ${JSON.stringify(j)}`);
            if (groups.hasOwnProperty(j)) {
                const id = `group_${j}`;
                const name = groups[j];
                const icon = this.stController.localConfig.IconForId(id, 'group', await this.stController.getDefaultGroupIcon(id));
                chain.push(new Promise(resolve => {
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
