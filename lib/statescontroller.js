'use strict';

const EventEmitter = require('events').EventEmitter;
const statesMapping = require('./devstates');
const getAdId = require('./utils').getAdId;
const getZbId = require('./utils').getZbId;


class StatesController extends EventEmitter {
    constructor(adapter) {
        super();
        this.adapter = adapter;
        this.adapter.on("stateChange", this.onStateChange.bind(this));
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
            this.debug(`User stateChange ${id} ${JSON.stringify(state)}`);
            // start = new Date();
            const devId = getAdId(this.adapter, id); // iobroker device id
            let deviceId = getZbId(id); // zigbee device id
            const stateKey = id.split('.')[3];
            // adapter.log.info(`change ${id} to ${state.val} time: ${new Date() - start}`);
            this.adapter.getObject(devId, (err, obj) => {
                if (obj) {
                    const modelId = obj.common.type;
                    if (!modelId) return;
                    if (modelId === 'group') {
                        deviceId = parseInt(deviceId.replace('0xgroup_', ''));
                    }
                    this.collectOptions(id.split('.')[2], modelId, options => {
                        this.publishFromState(deviceId, modelId, stateKey, state, options);
                    });
                }
            });
        }
    }

    collectOptions(devId, modelId, callback) {
        let states;
        let result = {};
        // find model states for options and get it values
        if (modelId === 'group') {
            states = statesMapping.groupStates.filter((statedesc) => statedesc.isOption || statedesc.inOptions);
        } else {
            // const mappedModel = deviceMapping.findByZigbeeModel(modelId);
            // if (!mappedModel) {
            //     adapter.log.error('Unknown device model ' + modelId);
            //     callback(result);
            //     return;
            // }
            const stateModel = statesMapping.findModel(modelId);
            if (!stateModel) {
                this.error('Device ' + devId + ' "' + modelId + '" not described in statesMapping.');
                callback(result);
                return;
            }
            states = stateModel.states.filter(statedesc => statedesc.isOption || statedesc.inOptions);
        }
        if (!states) {
            callback(result);
            return;
        }
        let cnt = 0, len = states.length;
        states.forEach(statedesc => {
            const id = this.adapter.namespace + '.' + devId + '.' + statedesc.id;
            adapter.getState(id, (err, state) => {
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

    publishFromState(deviceId, modelId, stateKey, state, options) {
        let stateDesc;
        if (modelId === 'group') {
            // find state for set
            stateDesc = statesMapping.groupStates.find((statedesc) => stateKey === statedesc.id);
        } else {
            stateModel = statesMapping.findModel(modelId);
            if (!stateModel) {
                this.error('Device ' + deviceId + ' "' + modelId + '" not described in statesMapping.');
                return;
            }
            // find state for set
            stateDesc = stateModel.states.find(statedesc => stateKey === statedesc.id);
        }
        if (!stateDesc) {
            this.error(`No state available for '${model}' with key '${stateKey}'`);
            return;
        }
    
        const value = state.val;
        if (value === undefined || value === '')
            return;

        this.emit('changed', deviceId, modelId, stateDesc, value, options);
    
        // let stateList = [{stateDesc: stateDesc, value: value, index: 0, timeout: 0}];
        // if (stateModel.linkedStates) {
        //     stateModel.linkedStates.forEach((linkedFunct) => {
        //         const res = linkedFunct(stateDesc, value, options, adapter.config.disableQueue);
        //         if (res) {
        //             stateList = stateList.concat(res);
        //         }
        //     });
        //     // sort by index
        //     stateList.sort((a, b) => {
        //         return a.index - b.index;
        //     });
        // }
    
        // // holds the states for for read after write requests
        // let readAfterWriteStates = [];
        // if (stateModel.readAfterWriteStates) {
        //     stateModel.readAfterWriteStates.forEach((readAfterWriteStateDesc) => {
        //         readAfterWriteStates = readAfterWriteStates.concat(readAfterWriteStateDesc.id);
        //     });
        // }
    
        // const devEp = mappedModel.hasOwnProperty('ep') ? mappedModel.ep(device) : null;
        // if (modelId !== 'group') {
        //     device = deviceId;
        // }
    
        // stateList.forEach((changedState) => {
        //     const stateDesc = changedState.stateDesc;
        //     const value = changedState.value;
    
        //     if (stateDesc.isOption) {
        //         // acknowledge state with given value
        //         acknowledgeState(deviceId, modelId, stateDesc, value);
        //         return;
        //     }
    
        //     const converter = mappedModel.toZigbee.find((c) => c.key.includes(stateDesc.prop) || c.key.includes(stateDesc.setattr) || c.key.includes(stateDesc.id));
        //     if (!converter) {
        //         adapter.log.error(`No converter available for '${mappedModel.model}' with key '${stateKey}'`);
        //         return;
        //     }
    
        //     const preparedValue = (stateDesc.setter) ? stateDesc.setter(value, options) : value;
        //     const preparedOptions = (stateDesc.setterOpt) ? stateDesc.setterOpt(value, options) : {};
    
        //     let syncStateList = [];
        //     if (stateModel.syncStates) {
        //         stateModel.syncStates.forEach((syncFunct) => {
        //             const res = syncFunct(stateDesc, value, options);
        //             if (res) {
        //                 syncStateList = syncStateList.concat(res);
        //             }
        //         });
        //     }
    
        //     const epName = stateDesc.epname !== undefined ? stateDesc.epname : (stateDesc.prop || stateDesc.id);
        //     const ep = devEp ? devEp[epName] : null;
        //     const key = stateDesc.setattr || stateDesc.prop || stateDesc.id;
        //     const postfix = '';
        //     const messages = converter.convert(key, preparedValue, preparedOptions, 'set', postfix, mappedModel.options || {});
        //     if (!messages) {
        //         // acknowledge state with given value
        //         acknowledgeState(deviceId, modelId, stateDesc, value);
        //         return;
        //     }
        //     messages.forEach((message) => {
        //         adapter.log.debug(`publishFromState: deviceId=${deviceId}, message=${safeJsonStringify(message)}`);
    
        //         if (adapter.config.disableQueue) {
        //             zbControl.publishDisableQueue(deviceId, message.cid, message.cmd, message.zclData, message.cfg, ep, message.cmdType, (err) => {
        //                 if (err) {
        //                     // nothing to do in error case
        //                 } else {
        //                     // acknowledge state with given value
        //                     acknowledgeState(deviceId, modelId, stateDesc, value);
        //                     // process sync state list
        //                     processSyncStatesList(deviceId, modelId, syncStateList);
        //                 }
        //             });
        //         } else {
        //             // wait a timeout for write
        //             setTimeout(() => {
        //                 zbControl.publish(device, message.cid, message.cmd, message.zclData, message.cfg, ep, message.cmdType, (err) => {
        //                     if (err) {
        //                         // nothing to do in error case
        //                     } else if (modelId === 'group') {
        //                         // acknowledge state with given value
        //                         acknowledgeState(deviceId, modelId, stateDesc, value);
        //                     } else if (readAfterWriteStates.includes(key)) {
        //                         // wait a timeout for read state value after write
        //                         adapter.log.debug(`Read timeout for cmd '${message.cmd}' is ${message.readAfterWriteTime}`);
        //                         setTimeout(() => {
        //                             const readMessages = converter.convert(stateKey, preparedValue, preparedOptions, 'get', postfix, mappedModel.options || {});
        //                             if (readMessages) {
        //                                 readMessages.forEach((readMessage) => {
        //                                     adapter.log.debug('read message: ' + safeJsonStringify(readMessage));
        //                                     zbControl.publish(device, readMessage.cid, readMessage.cmd, readMessage.zclData, readMessage.cfg, ep, readMessage.cmdType, (err, resp) => {
        //                                         if (err) {
        //                                             // nothing to do in error case
        //                                         } else {
        //                                             // read value from response
        //                                             let readValue = readValueFromResponse(stateDesc, resp);
        //                                             if (readValue !== undefined && readValue !== null) {
        //                                                 // acknowledge state with read value
        //                                                 acknowledgeState(deviceId, modelId, stateDesc, readValue);
        //                                                 // process sync state list
        //                                                 processSyncStatesList(deviceId, modelId, syncStateList);
        //                                             }
        //                                         }
        //                                     });
        //                                 });
        //                             } else {
        //                                 // acknowledge state with given value
        //                                 acknowledgeState(deviceId, modelId, stateDesc, value);
        //                                 // process sync state list
        //                                 processSyncStatesList(deviceId, modelId, syncStateList);
        //                             }
        //                         }, (message.readAfterWriteTime || 10)); // a slight offset between write and read is needed
        //                     } else {
        //                         // acknowledge state with given value
        //                         acknowledgeState(deviceId, modelId, stateDesc, value);
        //                         // process sync state list
        //                         processSyncStatesList(deviceId, modelId, syncStateList);
        //                     }
        //                 });
        //             }, changedState.timeout);
        //         }
        //     });
        // });
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
            this.adapter.deleteDevice(devId, (err) => {
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
                let new_common = {name: name};
                let id = devId + '.' + name;
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
                        delete new_common.name;
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
                        this.adapter.extendObject(id, {type: 'state', common: new_common}, () => {
                            value !== undefined && adapter.setState(id, value, true);
                        });
                    } else if (value !== undefined) {
                        this.adapter.setState(id, value, true);
                    }
    
                });
            } else {
                this.debug(`Wrong device ${devId}`);
            }
        });
    }    
}

module.exports = StatesController;