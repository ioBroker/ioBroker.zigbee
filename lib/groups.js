'use strict';

const statesMapping = require('./devstates');


class Groups {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on("message", this.onMessage.bind(this));
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

    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === "object" && obj.command) {
            switch (obj.command) {
                case 'updateGroups':
                    this.updateGroups(obj);
                    break;
                case 'getGroups':
                    this.getGroups(obj);
                    break;
            }
        }
    }

    getGroups(obj) {
        this.adapter.getState('info.groups', (err, groupsState) => {
            const groups = (groupsState && groupsState.val) ? JSON.parse(groupsState.val) : {};
            this.debug('getGroups result: ' + JSON.stringify(groups));
            this.adapter.sendTo(obj.from, obj.command, groups, obj.callback);
        });
    }

    updateGroups(obj) {
        const groups = obj.message;
        this.adapter.setState('info.groups', JSON.stringify(groups), true);
        this.syncGroups(groups);
        this.adapter.sendTo(obj.from, obj.command, 'ok', obj.callback);
    }

    syncGroups(groups) {
        const chain = [];
        const usedGroupsIds = [];
        for (const j in groups) {
            if (groups.hasOwnProperty(j)) {
                const id = `group_${j}`,
                    name = groups[j];
                chain.push(new Promise((resolve, reject) => {
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
        chain.push(new Promise((resolve, reject) => {
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
