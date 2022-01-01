'use strict';

const statesMapping = require('./devices');


class Groups {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
    }

    start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
        this.adapter.getStateAsync('info.groups')
            .then((groupsState) => {
                const groups = (groupsState && groupsState.val) ? JSON.parse(groupsState.val) : {};
                this.syncGroups(groups);
            });
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

    async getGroupMembersFromController(id) {
        const members = [];
        try {
            const group = await this.zbController.getGroupByID(id);
            if (group) {
                const groupmembers = group.members;

                for (const member of groupmembers) {
                    const nwk = member.deviceNetworkAddress;
                    const device = this.zbController.getDeviceByNetworkAddress(nwk);
                    if (device && device.ieeeAddr) members.push( { device:device.ieeeAddr } );
                }
            }
            else {
                return undefined;
            }

        } catch (error) {
            if (error) this.error('getGroupMembersFromController: error is  ' + JSON.stringify(error) + ' ' + JSON.stringify(new Error().stack));
            else this.error('unidentifed error in getGroupMembersFromController');
        }
        return members;
    }

    async getGroups(obj) {
        const response = { groups: {} };
        try {
            const groupsState = await this.adapter.getStateAsync('info.groups');
            const herdsmanGroups = await this.zbController.getGroups();

            const groups = (groupsState && groupsState.val) ? JSON.parse(groupsState.val) : {};

            if (typeof herdsmanGroups === 'object') {
                for (const group of herdsmanGroups) {
                    const gid = group.groupID;
                    if (gid && groups[gid]=== undefined) {
                        groups[gid] = `Auto Group ${gid}`;
                    }
                }
            }
            this.debug('getGroups result: ' + JSON.stringify(groups));
            response.groups = groups;
        }
        catch (error) {
            response.error = `getGroups: caught error: ${error}`;
            this.error(`getGroups: caught error: ${error}`);
        }
        finally {
            if (obj)
                this.adapter.sendTo(obj.from, obj.command, response, obj.callback);

        }
        return response.groups;
    }

    async updateGroupMembership(from, command, message, callback) {
        try {
            const groups = (message && message.groups ? message.groups : []);
            const devId = (message && message.id ? message.id : undefined);
            if (devId === undefined) {
                this.adapter.sendTo(from, command, {error: 'No device specified'}, callback);
            }
            const sysid = devId.replace(this.adapter.namespace + '.', '0x');
            const id = `${devId}.groups`;

            this.adapter.setState(id, JSON.stringify(groups), true);
            let response = await this.zbController.removeDevFromAllGroups(sysid);
            if (response && response.error)
            {
                this.adapter.sendTo(from, command, response, callback);
                return;
            }
            for (const groupId of groups) {
                response = await this.zbController.addDevToGroup(sysid, parseInt(groupId));
                if (response && response.error)
                {
                    this.adapter.sendTo(from, command, response, callback);
                    return;
                }
            }

        } catch (e) {
            this.adapter.sendTo(from, command, {error: e}, callback);
            return;
        }
        this.adapter.sendTo(from, command, { }, callback);
    }


    async queryGroupMemberState(groupID, stateDesc) {
        const members = await this.getGroupMembersFromController(groupID);
        const result = {
            unsupported: [],
            unread: []
        };
        for (const member of members) {
            const entity = await this.zbController.resolveEntity(member.device);
            if (!entity) return false;
            this.debug(`entity: ${JSON.stringify(entity)}`);
            const mappedModel = entity.mapped;
            this.debug('Mapped Model: ' +  JSON.stringify(mappedModel));
            const converter = mappedModel.toZigbee.find((c) => c && (c.key.includes(stateDesc.prop) || c.key.includes(stateDesc.setattr) || c.key.includes(stateDesc.id)));
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
        if (result.unsupported.length>0) {
            // this.warn('unsupported ' + stateDesc.id + ' change for group members ' + JSON.stringify(result.unsupported));
            const error = {
                code: 134,
                message: `unsupported ${stateDesc.id} change for group members ${result.unsupported.join()}`
            };
            throw error;
        }
        if (result.unread.length>0) {
            this.warn('unread ' + stateDesc.id + ' change for group members ' + JSON.stringify(result.unread));
        }
    }

    async deleteGroup(from, command, message) {
        const members = await this.getGroupMembersFromController(parseInt(message));
        if (members && members.length) {
            for (const member of members) {
                const devName = member.device.substring(2);
                const groupEntry = this.adapter.getStateAsync(`${devName}.groups`);
                const memberarray = (groupEntry && groupEntry.val) ? JSON.parse(groupEntry.val) : [];
                const index = memberarray.indexOf(message.toString());
                if (index > -1) {
                    memberarray.splice(index, 1);
                }
                if (memberarray.length > 0) {
                    await this.adapter.setStateAsync(`${devName}.groups`, JSON.stringify(memberarray), true);
                }
                else {
                    await this.adapter.setStateAsync(`${devName}.groups`, '', true);
                }
            }
        }
        const groupsEntry = await this.adapter.getStateAsync('info.groups');
        const objGroups = (groupsEntry && groupsEntry.val ? JSON.parse(groupsEntry.val) : {});
        delete objGroups[message.toString()];
        await this.adapter.setStateAsync('info.groups', JSON.stringify(objGroups), true);
        await this.zbController.removeGroupById(message);
        this.stController.deleteDeviceStates(`group_${parseInt(message)}`);
    }

    async renameGroup(from, command, message) {
        const groupsEntry = await this.adapter.getStateAsync('info.groups');
        const objGroups = (groupsEntry && groupsEntry.val ? JSON.parse(groupsEntry.val) : {});
        const name = message.name;
        const id = `group_${message.id}`;
        objGroups[message.id.toString()] = message.name;
        await this.adapter.setStateAsync('info.groups', JSON.stringify(objGroups), true);

        const group = await this.adapter.getStateAsync(id);
        if (!group) {
            // assume we have to create the group
            this.adapter.setObjectNotExists(id, {
                type: 'device',
                common: {name: name, type: 'group'},
                native: {id: id}
            }, () => {
                this.adapter.extendObject(id , {common: {name: name, type: 'group'}});
                // create writable states for groups from their devices
                for (const stateInd in statesMapping.groupStates) {
                    if (!statesMapping.groupStates.hasOwnProperty(stateInd)) continue;
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
            });
        }
    }


    async syncGroups(adapterGroups) {
        const groups = await this.getGroups();
        const chain = [];
        const usedGroupsIds = [];
        for (const j in groups) {
            if (groups.hasOwnProperty(j)) {
                const id = `group_${j}`,
                    name = groups[j];
                chain.push(new Promise((resolve) => {
                    this.adapter.setObjectNotExists(id, {
                        type: 'device',
                        common: {name: name, type: 'group'},
                        native: {id: j}
                    }, () => {
                        this.adapter.extendObject(id, {common: {type: 'group'}});
                        // create writable states for groups from their devices
                        for (const stateInd in statesMapping.groupStates) {
                            if (!statesMapping.groupStates.hasOwnProperty(stateInd)) continue;
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
        chain.push(new Promise((resolve) => {
            // remove unused adpter groups
            this.adapter.getDevices((err, devices) => {
                if (!err) {
                    devices.forEach((dev) => {
                        if (dev.common.type === 'group') {
                            const groupid = parseInt(dev.native.id);
                            if (!usedGroupsIds.includes(groupid)) {
                                this.stController.deleteDeviceStates(`group_${groupid}`);
                            }
                        }
                    });
                }
                resolve();
            });
        }));
        Promise.all(chain);
    }

}

module.exports = Groups;
