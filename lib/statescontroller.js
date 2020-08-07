'use strict';

const EventEmitter = require('events').EventEmitter;
const statesMapping = require('./devices');
const getAdId = require('./utils').getAdId;
const getZbId = require('./utils').getZbId;


class StatesController extends EventEmitter {
    constructor(adapter) {
        super();
        this.adapter = adapter;
        this.adapter.on('stateChange', this.onStateChange.bind(this));
    }

    info(message, data) {
        this.emit('log', 'info', message, data);
    }

    error(message, data) {
        this.emit('log', 'error', message, data);
    }

    debug(message, data) {
        this.emit('log', 'debug', message, data);
    }

    onStateChange(id, state){
        if (state && !state.ack) {
            if (id.endsWith('pairingCountdown') || id.endsWith('pairingMessage') || id.endsWith('connection')) return;
            this.debug(`User stateChange ${id} ${JSON.stringify(state)}`);
            const devId = getAdId(this.adapter, id); // iobroker device id
            let deviceId = getZbId(id); // zigbee device id
            const stateKey = id.split('.')[3];
            this.adapter.getObject(devId, (err, obj) => {
                if (obj) {
                    const model = obj.common.type;
                    if (!model) return;
                    if (model === 'group') {
                        deviceId = parseInt(deviceId.replace('0xgroup_', ''));
                    }
                    this.collectOptions(id.split('.')[2], model, options => {
                        this.publishFromState(deviceId, model, stateKey, state, options);
                    });
                }
            });
        }
    }

    async collectOptions(devId, model, callback) {
        const result = {};
        // find model states for options and get it values
        const devStates = await this.getDevStates('0x'+devId, model);
        if (!devStates) {
            callback(result);
            return;
        }
        const states = devStates.states.filter((statedesc) => statedesc.isOption || statedesc.inOptions);
        if (!states) {
            callback(result);
            return;
        }
        let cnt = 0;
        const len = states.length;
        states.forEach(statedesc => {
            const id = this.adapter.namespace + '.' + devId + '.' + statedesc.id;
            this.adapter.getState(id, (err, state) => {
                cnt = cnt + 1;
                if (!err && state) {
                    result[statedesc.id] = state.val;
                }
                if (cnt === len) {
                    callback(result);
                }
            });
        });
        if (!len) callback(result);
    }

    async getDevStates(deviceId, model) {
        try {
            let states, stateModel;
            if (model === 'group') {
                states = statesMapping.groupStates;
            } else {
                stateModel = statesMapping.findModel(model);
                if (!stateModel) {
                    this.error('Device ' + deviceId + ' "' + model + '" not described in statesMapping.');
                    return;
                }
                states = stateModel.states;
                if (typeof states === 'function' && !states.prototype) {
                    const entity = await this.adapter.zbController.resolveEntity(deviceId);
                    states = states(entity);
                }
            }
            return {states: states, stateModel: stateModel};
        } catch (error) {
            this.log.error(`Error getDevStates for ${deviceId}. Error: ${error.stack}`);
        }
    }

    async publishFromState(deviceId, model, stateKey, state, options) {
        this.debug(`Change state '${stateKey}' at device ${deviceId} type '${model}'`);
        const devStates = await this.getDevStates(deviceId, model);
        if (!devStates) {
            return;
        }
        const stateDesc = devStates.states.find((statedesc) => stateKey === statedesc.id);
        const stateModel = devStates.stateModel;
        if (!stateDesc) {
            this.error(`No state available for '${model}' with key '${stateKey}'`);
            return;
        }

        const value = state.val;
        if (value === undefined || value === '')
            return;

        let stateList = [{stateDesc: stateDesc, value: value, index: 0, timeout: 0}];
        if (stateModel && stateModel.linkedStates) {
            stateModel.linkedStates.forEach((linkedFunct) => {
                const res = linkedFunct(stateDesc, value, options, this.adapter.config.disableQueue);
                if (res) {
                    stateList = stateList.concat(res);
                }
            });
            // sort by index
            stateList.sort((a, b) => {
                return a.index - b.index;
            });
        }

        // holds the states for for read after write requests
        let readAfterWriteStates = [];
        if (stateModel && stateModel.readAfterWriteStates) {
            stateModel.readAfterWriteStates.forEach((readAfterWriteStateDesc) => {
                readAfterWriteStates = readAfterWriteStates.concat(readAfterWriteStateDesc.id);
            });
        }

        this.emit('changed', deviceId, model, stateModel, stateList, options);
    }

    renameDevice(id, newName) {
        this.adapter.extendObject(id, {common: {name: newName}});
    }

    deleteDeviceStates(devId, callback) {
        this.adapter.getStatesOf(devId, (err, states) => {
            if (!err && states) {
                states.forEach((state) => {
                    this.adapter.deleteState(devId, null, state._id);
                });
            }
            this.adapter.deleteDevice(devId, () => {
                callback && callback();
            });
        });
    }

    updateStateWithTimeout(dev_id, name, value, common, timeout, outValue) {
        this.updateState(dev_id, name, value, common);
        setTimeout(() => this.updateState(dev_id, name, outValue, common), timeout);
    }

    updateState(devId, name, value, common) {
        this.adapter.getObject(devId, (err, obj) => {
            if (obj) {
                const new_common = {name: name};
                const id = devId + '.' + name;
                const new_name = obj.common.name;
                if (common) {
                    if (common.name !== undefined) {
                        new_common.name = common.name;
                    }
                    if (common.type !== undefined) {
                        new_common.type = common.type;
                    }
                    if (common.unit !== undefined) {
                        new_common.unit = common.unit;
                    }
                    if (common.states !== undefined) {
                        new_common.states = common.states;
                    }
                    if (common.read !== undefined) {
                        new_common.read = common.read;
                    }
                    if (common.write !== undefined) {
                        new_common.write = common.write;
                    }
                    if (common.role !== undefined) {
                        new_common.role = common.role;
                    }
                    if (common.min !== undefined) {
                        new_common.min = common.min;
                    }
                    if (common.max !== undefined) {
                        new_common.max = common.max;
                    }
                    if (common.icon !== undefined) {
                        new_common.icon = common.icon;
                    }
                }
                // check if state exist
                this.adapter.getObject(id, (err, stobj) => {
                    let hasChanges = false;
                    if (stobj) {
                        // update state - not change name and role (user can it changed)
                        if (stobj.common.name)
                            delete new_common.name
                        else
                            new_common.name = new_name + ' ' + new_common.name;
                        delete new_common.role;

                        // check whether any common property is different
                        if (stobj.common) {
                            for (const property in new_common) {
                                if (stobj.common.hasOwnProperty(property)) {
                                    if (stobj.common[property] === new_common[property]) {
                                        delete new_common[property];
                                    } else {
                                        hasChanges = true;
                                    }
                                }
                            }
                        }
                    } else {
                        hasChanges = true;
                    }

                    // only change object when any common property has changed
                    if (hasChanges) {
                        this.adapter.extendObject(id, {type: 'state', common: new_common, native: {} }, () => {
                            value !== undefined && this.adapter.setState(id, value, true);
                        });
                    } else if (value !== undefined) {
                        this.adapter.setState(id, value, true);
                    }

                });
            } else {
                this.debug(`Wrong device ${devId} ${JSON.stringify(obj)}`);
            }
        });
    }

    updateDev(dev_id, dev_name, model, callback) {
        const id = '' + dev_id;
        const modelDesc = statesMapping.findModel(model);
        const icon = (modelDesc && modelDesc.icon) ? modelDesc.icon : 'img/unknown.png';
        this.adapter.setObjectNotExists(id, {
            type: 'device',
            // actually this is an error, so device.common has no attribute type. It must be in native part
            common: {name: dev_name, type: model, icon: icon},
            native: {id: dev_id}
        }, () => {
            // update type and icon
            this.adapter.extendObject(id, {common: {type: model, icon: icon}}, callback);
        });
    }

    async syncDevStates(dev, model) {
        const devId = dev.ieeeAddr.substr(2),
            hasGroups = dev.type === 'Router';
        // devId - iobroker device id
        const devStates = await this.getDevStates(dev.ieeeAddr, model);
        if (!devStates) {
            return;
        }
        const states = statesMapping.commonStates.concat(devStates.states)
            .concat((hasGroups) ? [statesMapping.groupsState] : []);

        for (const stateInd in states) {
            if (!states.hasOwnProperty(stateInd)) continue;

            const statedesc = states[stateInd];

            // Filter out non routers or devices that are battery driven for the availability flag
            if (statedesc.id === 'available')
                if (!(dev.type === 'Router') || dev.powerSource === 'Battery')
                    continue;
            // lazy states
            if (statedesc.lazy) continue;

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
                states: statedesc.states,
            };
            this.updateState(devId, statedesc.id, undefined, common);
        }
    }

    async publishToState(devId, model, payload) {
        const devStates = await this.getDevStates('0x'+devId, model);
        if (!devStates) {
            return;
        }
        // find states for payload
        const states = statesMapping.commonStates.concat(
            devStates.states.filter((statedesc) => payload.hasOwnProperty(statedesc.prop || statedesc.id))
        );
        for (const stateInd in states) {
            const statedesc = states[stateInd];
            let value;
            if (statedesc.getter) {
                value = statedesc.getter(payload);
            } else {
                value = payload[statedesc.prop || statedesc.id];
            }
            // checking value
            if (value === undefined) continue;

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
            // if need return value to back after timeout
            if (statedesc.isEvent) {
                this.updateStateWithTimeout(devId, statedesc.id, value, common, 300, !value);
            } else {
                if (statedesc.prepublish) {
                    this.collectOptions(devId, model, (options) => {
                        statedesc.prepublish(devId, value, (newvalue) => {
                            this.updateState(devId, statedesc.id, newvalue, common);
                        }, options);
                    });
                } else {
                    this.updateState(devId, statedesc.id, value, common);
                }
            }
        }
    }
}

module.exports = StatesController;
