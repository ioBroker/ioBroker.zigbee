/**
 *
 * Zigbee devices adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

//process.env.DEBUG = 'zigbee*,cc-znp*';

const safeJsonStringify = require('./lib/json');
// you have to require the utils module and call adapter function
const fs = require('fs');
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const ZShepherd = require('zigbee-shepherd');
const ZigbeeController = require('./lib/zigbeecontroller');
const deviceMapping = require('zigbee-shepherd-converters');
const statesMapping = require('./lib/devstates');
const SerialPort = require('serialport');

const groupConverters = [
    deviceMapping.toZigbeeConverters.on_off,
    deviceMapping.toZigbeeConverters.light_onoff_brightness,
    deviceMapping.toZigbeeConverters.light_colortemp,
    deviceMapping.toZigbeeConverters.light_color,
];

let devNum = 0;

let zbControl;
let adapter;

let pendingDevConfigRun = null;
let pendingDevConfigs = [];

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: 'zigbee',
        systemConfig: true,
        // is called when adapter shuts down - callback has to be called under any circumstances!
        unload: callback => {
            try {
                adapter.log.debug('cleaned everything up...');
                if (zbControl) {
                    zbControl.stop();
                    zbControl = undefined;
                }
                if (pendingDevConfigRun != null) {
                    clearTimeout(pendingDevConfigRun);
                }
                callback();
            } catch (e) {
                callback();
            }
        },

        stateChange: (id, state) => setDevChange(id, state)
    });

    adapter = new utils.Adapter(options);

    // Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
    adapter.on('message', obj => {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'send':
                    // e.g. send email or pushover or whatever
                    adapter.log.debug('send command');
                    // Send response in callback if required
                    obj.callback && adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
                    break;
                case 'letsPairing':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        letsPairing(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'getDevices':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        getDevices(obj.from, obj.command, obj.callback);
                    }
                    break;
                case 'getMap':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        getMap(obj.from, obj.command, obj.callback);
                    }
                    break;
                case 'renameDevice':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        renameDevice(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'groupDevices':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        groupDevices(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'deleteDevice':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        deleteDevice(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'listUart':
                    if (obj.callback) {
                        listSerial()
                            .then((ports) => {
                                adapter.log.debug('List of ports: ' + JSON.stringify(ports));
                                adapter.sendTo(obj.from, obj.command, ports, obj.callback);
                            });
                    }
                    break;
                case 'sendToZigbee':
                    sendToZigbee(obj);
                    break;
                case 'getLibData':
                    // e.g. zcl lists
                    if (obj && obj.message && typeof obj.message === 'object') {
                        getLibData(obj);
                    }
                    break;
                case 'updateGroups':
                    updateGroups(obj);
                    break;
                case 'getGroups':
                    getGroups(obj);
                    break;
                case 'reset':
                    zbControl.reset(obj.message.mode, function (err, data) {
                        adapter.sendTo(obj.from, obj.command, err, obj.callback);
                    });
                    break;
                default:
                    adapter.log.warn('Unknown message: ' + JSON.stringify(obj));
                    break;
            }
        }
        processMessages();
    });

    // is called when databases are connected and adapter received configuration.
    adapter.on('ready', () => main());

    return adapter;
}

function processMessages(ignore) {
    adapter.getMessage(function (err, obj) {
        if (obj) {
            !ignore && obj && obj.command === 'send' && processMessage(obj.message);
            processMessages();
        }
    });
}


// Because the only one port is occupied by first instance, the changes to other devices will be send with messages
function processMessage(message) {
    if (typeof message === 'string') {
        try {
            message = JSON.parse(message);
        } catch (err) {
            adapter.log.error('Cannot parse: ' + message);
        }
    }
}

// is called if a subscribed state changes
function setDevChange(id, state) {
    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.debug('User stateChange ' + id + ' ' + JSON.stringify(state));
        // start = new Date();
        const devId = adapter.namespace + '.' + id.split('.')[2]; // iobroker device id
        let deviceId = '0x' + id.split('.')[2]; // zigbee device id
        const stateKey = id.split('.')[3];
        // adapter.log.info(`change ${id} to ${state.val} time: ${new Date() - start}`);
        adapter.getObject(devId, (err, obj) => {
            if (obj) {
                const modelId = obj.common.type;
                if (!modelId) return;
                if (modelId === 'group') {
                    deviceId = parseInt(deviceId.replace('0xgroup_', ''));
                }
                collectOptions(id.split('.')[2], modelId, options => {
                    publishFromState(deviceId, modelId, stateKey, state, options);
                });
            }
        });
    }
}

function listSerial() {
    return SerialPort.list()
        .then(ports =>
            ports.map(port => {
                return {comName: port.comName};
            })
        )
        .catch(err => {
            adapter.log.error(err);
            return [];
        });
}

function updateStateWithTimeout(dev_id, name, value, common, timeout, outValue) {
    updateState(dev_id, name, value, common);
    setTimeout(() => updateState(dev_id, name, outValue, common), timeout);
}

function updateState(devId, name, value, common) {
    adapter.getObject(devId, (err, obj) => {
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
            adapter.getObject(id, (err, stobj) => {
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
                    adapter.extendObject(id, {type: 'state', common: new_common}, () => {
                        value !== undefined && adapter.setState(id, value, true);
                    });
                } else if (value !== undefined) {
                    adapter.setState(id, value, true);
                }

            });
        } else {
            adapter.log.debug('Wrong device ' + devId);
        }
    });
}

function renameDevice(from, command, msg, callback) {
    const id = msg.id, newName = msg.name;
    adapter.extendObject(id, {common: {name: newName}});
    adapter.sendTo(from, command, {}, callback);
}

function groupDevices(from, command, devGroups, callback) {
    for (const j in devGroups) {
        if (devGroups.hasOwnProperty(j)) {
            const id = `${j}.groups`;
            const groups = devGroups[j];

            adapter.setState(id, JSON.stringify(groups), true);
            const sysid = j.replace(adapter.namespace + '.', '0x');
            zbControl.removeDevFromAllGroups(sysid, () => {
                groups.forEach(groupId => {
                    zbControl.addDevToGroup(sysid, groupId);
                });
            });
        }
    }
    adapter.sendTo(from, command, {}, callback);
}

function deleteDeviceStates(devId, callback) {
    adapter.getStatesOf(devId, (err, states) => {
        if (!err && states) {
            states.forEach((state) => {
                adapter.deleteState(devId, null, state._id);
            });
        }
        adapter.deleteDevice(devId, (err) => {
            callback && callback();
        });
    });
}

function deleteDevice(from, command, msg, callback) {
    if (zbControl) {
        adapter.log.debug('deleteDevice message: ' + JSON.stringify(msg));
        const id = msg.id, sysid = id.replace(adapter.namespace + '.', '0x'),
            devId = id.replace(adapter.namespace + '.', '');
        adapter.log.debug('deleteDevice sysid: ' + sysid);
        //adapter.extendObject(id, {common: {name: newName}});
        const dev = zbControl.getDevice(sysid);
        if (!dev) {
            adapter.log.debug('Not found on shepherd!');
            adapter.log.debug('Try delete dev ' + devId + ' from iobroker.');
            deleteDeviceStates(devId, () => {
                adapter.sendTo(from, command, {}, callback);
            });
            return;
        }
        zbControl.remove(sysid, err => {
            if (!err) {
                adapter.log.debug('Successfully removed from shepherd!');
                deleteDeviceStates(devId, () => {
                    adapter.sendTo(from, command, {}, callback);
                });
            } else {
                adapter.log.debug('Error on remove! ' + err);
                adapter.log.debug('Try force remove!');
                zbControl.forceRemove(sysid, err => {
                    if (!err) {
                        adapter.log.debug('Force removed from shepherd!');
                        adapter.log.debug('Try delete dev ' + devId + ' from iobroker.');
                        deleteDeviceStates(devId, () => adapter.sendTo(from, command, {}, callback));
                    } else {
                        adapter.sendTo(from, command, {error: err}, callback);
                    }
                });
            }
        });
    } else {
        adapter.sendTo(from, command, {error: 'You need to save and start the adapter!'}, callback);
    }
}

function updateDev(dev_id, dev_name, model, callback) {
    const id = '' + dev_id;
    const modelDesc = statesMapping.findModel(model);
    const icon = (modelDesc && modelDesc.icon) ? modelDesc.icon : 'img/unknown.png';
    adapter.setObjectNotExists(id, {
        type: 'device',
        // actually this is an error, so device.common has no attribute type. It must be in native part
        common: {name: dev_name, type: model, icon: icon},
        native: {id: dev_id}
    }, () => {
        // update type and icon
        adapter.extendObject(id, {common: {type: model, icon: icon}}, callback);
    });
}

function onPermitJoining(joinTimeLeft) {
    adapter.setState('info.pairingCountdown', joinTimeLeft);
    // repeat until 0
    if (!joinTimeLeft) {
        // set pairing mode off
        adapter.setState('info.pairingMode', false);
    }
    logToPairing('Time left: ' + joinTimeLeft, true);
}

function letsPairing(from, command, message, callback) {
    if (zbControl) {
        let devId = 'all';
        if (message && message.id) {
            devId = getZBid(message.id);
        }
        // allow devices to join the network within 60 secs
        logToPairing('Pairing started ' + devId, true);
        
        let cTimer = Number(adapter.config.countDown);
        
        if (!adapter.config.countDown
        ||   cTimer == 0) {
          cTimer = 60;
        }

        zbControl.permitJoin(cTimer, devId, err => {
            if (!err) {
                // set pairing mode on
                adapter.setState('info.pairingMode', true);
            }
        });
        adapter.sendTo(from, command, 'Start pairing!', callback);
    } else {
        adapter.sendTo(from, command, {error: 'You need to save and start the adapter before pairing!'}, callback);
    }
}

function getZBid(adapterDevId) {
    return '0x' + adapterDevId.split('.')[2];
}

function getMap(from, command, callback) {
    if (zbControl && zbControl.enabled()) {
        zbControl.getMap((networkmap) => {
            adapter.log.debug('getMap result: ' + JSON.stringify(networkmap));
            adapter.sendTo(from, command, networkmap, callback);
        });
    }
}

function getDevices(from, command, callback) {
    if (zbControl && zbControl.enabled()) {
        const pairedDevices = zbControl.getDevices();
        const groups = {};
        let rooms;
        adapter.getEnumsAsync('enum.rooms')
            .then(enums => {
                // rooms
                rooms = enums['enum.rooms'];
            })
            .then(() => {
                // get all adapter devices
                return adapter.getDevicesAsync()
            })
            .then(result => {
                // not groups
                return result.filter(devInfo => devInfo.common.type !== 'group')
            })
            .then(result => {
                // get device groups
                const chain = [];
                result.forEach(devInfo => {
                    if (devInfo._id) {
                        chain.push((res) => {
                            return adapter.getStateAsync(`${devInfo._id}.groups`)
                                .then(devGroups => {
                                    // fill groups info
                                    if (devGroups) {
                                        groups[devInfo._id] = JSON.parse(devGroups.val);
                                    }
                                    return res;
                                });
                        });
                    }
                });

                return chain.reduce((promiseChain, currentTask) =>
                    promiseChain.then(currentTask),
                    new Promise((resolve, reject) => resolve(result)));
            })
            .then(result => {
                // combine info
                const devices = [];
                result.forEach(devInfo => {
                    const id = getZBid(devInfo._id);
                    const modelDesc = statesMapping.findModel(devInfo.common.type);
                    devInfo.icon = (modelDesc && modelDesc.icon) ? modelDesc.icon : 'img/unknown.png';
                    devInfo.rooms = [];
                    for (const room in rooms) {
                        if (!rooms.hasOwnProperty(room) ||
                            !rooms[room] ||
                            !rooms[room].common ||
                            !rooms[room].common.members) {
                            continue;
                        }
                        if (rooms[room].common.members.indexOf(devInfo._id) !== -1) {
                            devInfo.rooms.push(rooms[room].common.name);
                        }
                    }
                    devInfo.info = zbControl.getDevice(id);
                    devInfo.paired = !!devInfo.info;
                    devInfo.groups = groups[devInfo._id];
                    devices.push(devInfo);
                });
                return devices;
            })
            .then(devices => {
                // append devices that paired but not created
                pairedDevices.forEach((device) => {
                    const exists = devices.find((dev) => device.ieeeAddr === getZBid(dev._id));
                    if (!exists) {
                        devices.push({
                            _id: device.ieeeAddr,
                            icon: 'img/unknown.png',
                            paired: true,
                            info: device,
                            common: {
                                name: undefined,
                                type: undefined,
                            },
                            native: {}
                        });
                    }
                });
                return devices;
            })
            .then(devices => {
                adapter.log.debug('getDevices result: ' + JSON.stringify(devices));
                adapter.sendTo(from, command, devices, callback);
            })
            .catch(err => {
                adapter.log.error('getDevices error: ' + JSON.stringify(err));
            });
    } else {
        adapter.sendTo(from, command, {error: 'You need save and run adapter before pairing!'}, callback);
    }
}

function newDevice(id, msg) {
    let dev = zbControl.getDevice(id);
    if (dev) {
        adapter.log.info('new dev ' + dev.ieeeAddr + ' ' + dev.nwkAddr + ' ' + dev.modelId);
        logToPairing('New device joined ' + dev.ieeeAddr + ' model ' + dev.modelId, true);
        updateDev(dev.ieeeAddr.substr(2), dev.modelId, dev.modelId, () => {
            syncDevStates(dev);
            scheduleDeviceConfig(dev);
        });
    }
}

function leaveDevice(id, msg) {
    const devId = id.substr(2);
    adapter.log.debug('Try delete dev ' + devId + ' from iobroker.');
    deleteDeviceStates(devId);
}

function getLibData(obj) {
    const key = obj.message.key;
    const zclId = require('zcl-id');
    const result = {};
    if (key === 'cidList') {
        result.list = zclId._common.clusterId;
    } else if (key === 'attrIdList') {
        const cid = obj.message.cid;
        const attrList = zclId.attrList(cid);
        for (let i = 0; i < attrList.length; i++) {
            attrList[i].attrName = zclId.attr(cid, attrList[i].attrId).key;
        }
        result.list = attrList;
    } else if (key === 'cmdListFoundation') {
        result.list = zclId._common.foundation;
    } else if (key === 'cmdListFunctional') {
        const cid = zclId.cluster(obj.message.cid).key;
        result.list = null;
        const cluster = zclId._getCluster(cid);
        if (typeof cluster != 'undefined') {
            const extraCmd = cluster.cmd;
            result.list = extraCmd !== null ? extraCmd._enumMap : null;
        }
    } else if (key === 'respCodes') {
        result.list = zclId._common.status;
    } else if (key === 'typeList') {
        result.list = zclId._common.dataType;
    } else {
        return;
    }
    result.key = key;
    adapter.sendTo(obj.from, obj.command, result, obj.callback);
}

function sendToZigbee(obj) {
    const zclId = require('zcl-id');
    const devId = '0x' + obj.message.id.replace(adapter.namespace + '.', '');
    const ep = obj.message.ep ? parseInt(obj.message.ep) : null;
    const cid = obj.message.cid;
    const cmdType = obj.message.cmdType;
    let cmd;
    let zclData = obj.message.zclData;
    if (cmdType === 'functional') {
        cmd = (typeof obj.message.cmd === 'number') ? obj.message.cmd : zclId.functional(cid, obj.message.cmd).value;
    } else if (cmdType === 'foundation') {
        cmd = (typeof obj.message.cmd === 'number') ? obj.message.cmd : zclId.foundation(obj.message.cmd).value;
        if (!Array.isArray(zclData)) {
            // wrap object in array
            zclData = [zclData];
        }
    } else {
        adapter.sendTo(obj.from, obj.command, {localErr: 'Invalid cmdType'}, obj.callback);
        return;
    }

    const cfg = obj.message.hasOwnProperty('cfg') ? obj.message.cfg : null;

    for (let i = 0; i < zclData.length; i++) {
        const zclItem = zclData[i];
        // convert string items to number if needed
        if (typeof zclItem.attrId == 'string') {
            const intId = parseInt(zclItem.attrId);
            zclData[i].attrId = !isNaN(intId) ? intId : zclId.attr(cid, zclItem.attrId).value;
        }
        if (typeof zclItem.dataType == 'string') {
            const intType = parseInt(zclItem.dataType);
            zclData[i].dataType = !isNaN(intType) ? intType : zclId.attr(cid, zclItem.dataType).value;
        }
    }
    const publishTarget = zbControl.getDevice(devId) ? devId : zbControl.getGroup(parseInt(devId));
    if (!publishTarget) {
        adapter.sendTo(obj.from, obj.command, {localErr: 'Device or group ' + devId + ' not found!'}, obj.callback);
        return;
    }
    if (!cid || typeof cmd !== 'number') {
        adapter.sendTo(obj.from, obj.command, {localErr: 'Incomplete data (cid or cmd)'}, obj.callback);
        return;
    }
    adapter.log.debug('Ready to send (ep: ' + ep + ', cid: ' + cid + ' cmd, ' + cmd + ' zcl: ' + JSON.stringify(zclData) + ')');

    try {
        zbControl.publish(publishTarget, cid, cmd, zclData, cfg, ep, cmdType, (err, msg) => {
            // map err and msg in one object for sendTo
            const result = {};
            result.msg = msg;
            if (err) {
                // err is an instance of Error class, it cannot be forwarded to sendTo, just get message (string)
                result.err = err.message;
            }
            adapter.sendTo(obj.from, obj.command, result, obj.callback);
        });
    } catch (exception) {
        // report exceptions
        // happens for example if user tries to send write command but did not provide value/type
        // we dont want to check this errors ourselfs before publish, but let shepherd handle this
        adapter.log.error('SendToZigbee failed! (' + exception + ')');
        adapter.sendTo(obj.from, obj.command, {err: exception}, obj.callback);

        // Note: zcl-packet/lib/foundation.js throws correctly
        // 'Error: Payload of commnad: write must have dataType property.',
        // but only at first time. If user sends same again no exception anymore
        // not sure if bug in zigbee-shepherd or zcl-packet
    }
}

function updateGroups(obj) {
    const groups = obj.message;
    adapter.setState('info.groups', JSON.stringify(groups), true);
    syncGroups(groups);
    adapter.sendTo(obj.from, obj.command, 'ok', obj.callback);
}

function getGroups(obj) {
    adapter.getState('info.groups', (err, groupsState) => {
        const groups = (groupsState && groupsState.val) ? JSON.parse(groupsState.val) : {};
        adapter.log.debug('getGroups result: ' + JSON.stringify(groups));
        adapter.sendTo(obj.from, obj.command, groups, obj.callback);
    });
}

function syncGroups(groups) {
    const chain = [];
    // recreate groups
    //zbControl.removeAllGroup();
    //zbControl.getGroups();
    const usedGroupsIds = [];
    for (const j in groups) {
        if (groups.hasOwnProperty(j)) {
            const id = `group_${j}`,
                name = groups[j];
            chain.push(new Promise((resolve, reject) => {
                adapter.setObjectNotExists(id, {
                    type: 'device',
                    common: {name: name, type: 'group'},
                    native: {id: j}
                }, () => {
                    adapter.extendObject(id, {common: {type: 'group'}});
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
                        updateState(id, statedesc.id, undefined, common);
                    }
                    resolve();
                });
            }));
            usedGroupsIds.push(parseInt(j));
        }
    }
    // chain.push(new Promise((resolve, reject) => {
    //     zbControl.removeUnusedGroups(usedGroupsIds, () => {
    //         usedGroupsIds.forEach(j => {
    //             const id = `group_${j}`;
    //             zbControl.addGroup(j, id);
    //         });
    //         resolve();
    //     });
    // }));
    chain.push(new Promise((resolve, reject) => {
        // remove unused adpter groups
        adapter.getDevices((err, devices) => {
            if (!err) {
                devices.forEach((dev) => {
                    if (dev.common.type === 'group') {
                        const groupid = parseInt(dev.native.id);
                        if (!usedGroupsIds.includes(groupid)) {
                            deleteDeviceStates(`group_${groupid}`);
                        }
                    }
                });
            }
            resolve();
        });
    }));
    Promise.all(chain);
}

function onReady() {
    adapter.log.info('Shepherd ready. '+JSON.stringify(zbControl.getInfo().net));
    return new Promise(function (resolve, reject) {
        resolve();
    }).then(() => {
        adapter.setState('info.connection', true);

        if (adapter.config.disableLed) {
            zbControl.disableLed();
        }

        // update pairing State
        adapter.setState('info.pairingMode', false);
    }).then(() => {
        return adapter.getStateAsync('info.groups')
            .then((groupsState) => {
                const groups = (groupsState && groupsState.val) ? JSON.parse(groupsState.val) : {};
                syncGroups(groups);
            });
    }).then(() => {
        const chain = [];
        // get and list all registered devices (not in ioBroker)
        let activeDevices = zbControl.getAllClients();
        adapter.log.debug('Current active devices:');
        zbControl.getDevices().forEach(device => adapter.log.debug(safeJsonStringify(device)));
        activeDevices.forEach(device => {
            devNum = devNum + 1;
            adapter.log.info(devNum + ' ' + getDeviceStartupLogMessage(device));

            // update dev and states
            chain.push(new Promise((resolve, reject) => {
                updateDev(device.ieeeAddr.substr(2), device.modelId, device.modelId, () => {
                    syncDevStates(device);
                    resolve();
                });
            }));
            scheduleDeviceConfig(device, 30 * 1000); // grant net bit time to settle first
        });
        Promise.all(chain);
    });
}

function getDeviceStartupLogMessage(device) {
    let type = 'unknown';
    let friendlyDevice = {model: 'unkown', description: 'unknown'};
    const mappedModel = deviceMapping.findByZigbeeModel(device.modelId);
    if (mappedModel) {
        friendlyDevice = mappedModel;
    }

    if (device.type) {
        type = device.type;
    }

    return `(${device.ieeeAddr}): ${friendlyDevice.model} - ` +
        `${friendlyDevice.vendor} ${friendlyDevice.description} (${type})`;
}

function scheduleDeviceConfig(device, delay) {
    const ieeeAddr = device.ieeeAddr;
    
    if (pendingDevConfigs.indexOf(ieeeAddr) !== -1) { // device is already scheduled
        return;
    }
    adapter.log.debug(`Schedule device config for ${ieeeAddr} ${device.modelId}`);
    pendingDevConfigs.unshift(ieeeAddr); // add as first in list
    if (!delay || pendingDevConfigRun == null) {
        const configCall = () => {
            adapter.log.debug(`Pending device configs: `+JSON.stringify(pendingDevConfigs));
            if (pendingDevConfigs && pendingDevConfigs.length > 0) {
                pendingDevConfigs.forEach((ieeeAddr) => {
                    const devToConfig = zbControl.getDevice(ieeeAddr);
                    configureDevice(devToConfig, (ok, msg) => {
                        if (ok) {
                            if (msg !== false) { // false = no config needed
                                adapter.log.info(`Successfully configured ${ieeeAddr} ${devToConfig.modelId}`);
                            }
                            var index = pendingDevConfigs.indexOf(ieeeAddr);
                            if (index > -1) {
                                pendingDevConfigs.splice(index, 1);
                            }
                        } else {
                            adapter.log.warn(`Dev ${ieeeAddr} ${devToConfig.modelId} not configured yet, will try again in latest 300 sec`);
                            scheduleDeviceConfig(devToConfig, 300 * 1000);
                        }
                    });
                });
            }
            if (pendingDevConfigs.length == 0) {
                pendingDevConfigRun = null;
            } else {
                pendingDevConfigRun = setTimeout(configCall, 300 * 1000);
            }
        };
        if (!delay) { // run immediately
            clearTimeout(pendingDevConfigRun);
            configCall();
        } else {
            pendingDevConfigRun = setTimeout(configCall, delay);
        }
    }
}

function configureDevice(device, callback) {
    // Configure reporting for this device.
    if (device && device.ieeeAddr && device.modelId) {
        const ieeeAddr = device.ieeeAddr;
        const mappedModel = deviceMapping.findByZigbeeModel(device.modelId);

        if (mappedModel && mappedModel.configure) {
            mappedModel.configure(ieeeAddr, zbControl.shepherd, zbControl.getCoordinator(), callback);
            return;
        }
    }
    callback(true, false); // device does not require configuration
}

function onLog(level, msg, data) {
    if (msg) {
        let logger = adapter.log.info;
        switch (level) {
            case 'error':
                logger = adapter.log.error;
                if (data)
                    data = data.toString();
                logToPairing('Error: ' + msg + '. ' + data, true);
                break;
            case 'debug':
                logger = adapter.log.debug;
                break;
            case 'info':
                logger = adapter.log.info;
                break;
        }
        if (data) {
            if (typeof data === 'string') {
                logger(msg + '. ' + data);
            } else {
                logger(msg + '. ' + safeJsonStringify(data));
            }
        } else {
            logger(msg);
        }
    }
}

function logToPairing(message, ignoreJoin) {
    if (zbControl) {
        const info = zbControl.getInfo();
        if (ignoreJoin || info.joinTimeLeft > 0) {
            adapter.setState('info.pairingMessage', message);
        }
    }
}

function publishFromState(deviceId, modelId, stateKey, state, options) {
    let stateDesc, model, mappedModel = {}, stateModel = {}, device;
    if (modelId === 'group') {
        model = 'group';
        mappedModel.toZigbee = groupConverters;
        // find state for set
        stateDesc = statesMapping.groupStates.find((statedesc) => stateKey === statedesc.id);
        device = zbControl.getGroup(deviceId);
    } else {
        mappedModel = deviceMapping.findByZigbeeModel(modelId);
        if (!mappedModel) {
            adapter.log.error('Unknown device model ' + modelId);
            return;
        }
        model = mappedModel.model;
        stateModel = statesMapping.findModel(modelId);
        if (!stateModel) {
            adapter.log.error('Device ' + deviceId + ' "' + modelId + '" not described in statesMapping.');
            return;
        }
        // find state for set
        stateDesc = stateModel.states.find(statedesc => stateKey === statedesc.id);
        device = zbControl.getDevice(deviceId);
    }
    if (!stateDesc) {
        adapter.log.error(`No state available for '${model}' with key '${stateKey}'`);
        return;
    }

    const value = state.val;
    if (value === undefined || value === '')
        return;

    let stateList = [{stateDesc: stateDesc, value: value, index: 0, timeout: 0}];
    if (stateModel.linkedStates) {
        stateModel.linkedStates.forEach((linkedFunct) => {
            const res = linkedFunct(stateDesc, value, options, adapter.config.disableQueue);
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
    if (stateModel.readAfterWriteStates) {
        stateModel.readAfterWriteStates.forEach((readAfterWriteStateDesc) => {
            readAfterWriteStates = readAfterWriteStates.concat(readAfterWriteStateDesc.id);
        });
    }

    const devEp = mappedModel.hasOwnProperty('ep') ? mappedModel.ep(device) : null;
    if (modelId !== 'group') {
        device = deviceId;
    }

    stateList.forEach((changedState) => {
        const stateDesc = changedState.stateDesc;
        const value = changedState.value;

        if (stateDesc.isOption) {
            // acknowledge state with given value
            acknowledgeState(deviceId, modelId, stateDesc, value);
            return;
        }

        const converter = mappedModel.toZigbee.find((c) => c.key.includes(stateDesc.prop) || c.key.includes(stateDesc.setattr) || c.key.includes(stateDesc.id));
        if (!converter) {
            adapter.log.error(`No converter available for '${mappedModel.model}' with key '${stateKey}'`);
            return;
        }

        const preparedValue = (stateDesc.setter) ? stateDesc.setter(value, options) : value;
        const preparedOptions = (stateDesc.setterOpt) ? stateDesc.setterOpt(value, options) : {};

        let syncStateList = [];
        if (stateModel.syncStates) {
            stateModel.syncStates.forEach((syncFunct) => {
                const res = syncFunct(stateDesc, value, options);
                if (res) {
                    syncStateList = syncStateList.concat(res);
                }
            });
        }

        const epName = stateDesc.epname !== undefined ? stateDesc.epname : (stateDesc.prop || stateDesc.id);
        const ep = devEp ? devEp[epName] : null;
        const key = stateDesc.setattr || stateDesc.prop || stateDesc.id;
        const postfix = '';
        const messages = converter.convert(key, preparedValue, preparedOptions, 'set', postfix, mappedModel.options || {});
        if (!messages) {
            // acknowledge state with given value
            acknowledgeState(deviceId, modelId, stateDesc, value);
            return;
        }
        messages.forEach((message) => {
            adapter.log.debug(`publishFromState: deviceId=${deviceId}, message=${safeJsonStringify(message)}`);

            if (adapter.config.disableQueue) {
                zbControl.publishDisableQueue(deviceId, message.cid, message.cmd, message.zclData, message.cfg, ep, message.cmdType, (err) => {
                    if (err) {
                        // nothing to do in error case
                    } else {
                        // acknowledge state with given value
                        acknowledgeState(deviceId, modelId, stateDesc, value);
                        // process sync state list
                        processSyncStatesList(deviceId, modelId, syncStateList);
                    }
                });
            } else {
                // wait a timeout for write
                setTimeout(() => {
                    zbControl.publish(device, message.cid, message.cmd, message.zclData, message.cfg, ep, message.cmdType, (err) => {
                        if (err) {
                            // nothing to do in error case
                        } else if (modelId === 'group') {
                            // acknowledge state with given value
                            acknowledgeState(deviceId, modelId, stateDesc, value);
                        } else if (readAfterWriteStates.includes(key)) {
                            // wait a timeout for read state value after write
                            adapter.log.debug(`Read timeout for cmd '${message.cmd}' is ${message.readAfterWriteTime}`);
                            setTimeout(() => {
                                const readMessages = converter.convert(stateKey, preparedValue, preparedOptions, 'get', postfix, mappedModel.options || {});
                                if (readMessages) {
                                    readMessages.forEach((readMessage) => {
                                        adapter.log.debug('read message: ' + safeJsonStringify(readMessage));
                                        zbControl.publish(device, readMessage.cid, readMessage.cmd, readMessage.zclData, readMessage.cfg, ep, readMessage.cmdType, (err, resp) => {
                                            if (err) {
                                                // nothing to do in error case
                                            } else {
                                                // read value from response
                                                let readValue = readValueFromResponse(stateDesc, resp);
                                                if (readValue !== undefined && readValue !== null) {
                                                    // acknowledge state with read value
                                                    acknowledgeState(deviceId, modelId, stateDesc, readValue);
                                                    // process sync state list
                                                    processSyncStatesList(deviceId, modelId, syncStateList);
                                                }
                                            }
                                        });
                                    });
                                } else {
                                    // acknowledge state with given value
                                    acknowledgeState(deviceId, modelId, stateDesc, value);
                                    // process sync state list
                                    processSyncStatesList(deviceId, modelId, syncStateList);
                                }
                            }, (message.readAfterWriteTime || 10)); // a slight offset between write and read is needed
                        } else {
                            // acknowledge state with given value
                            acknowledgeState(deviceId, modelId, stateDesc, value);
                            // process sync state list
                            processSyncStatesList(deviceId, modelId, syncStateList);
                        }
                    });
                }, changedState.timeout);
            }
        });
    });
}

function acknowledgeState(deviceId, modelId, stateDesc, value) {
    if (modelId === 'group') {
        let stateId = adapter.namespace + '.group_' + deviceId + '.' + stateDesc.id;
        adapter.setState(stateId, value, true);
    } else {
        let stateId = adapter.namespace + '.' + deviceId.replace('0x', '') + '.' + stateDesc.id;
        adapter.setState(stateId, value, true);
    }
}

function processSyncStatesList(deviceId, modelId, syncStateList) {
    syncStateList.forEach((syncState) => {
        acknowledgeState(deviceId, modelId, syncState.stateDesc, syncState.value);
    });
}

function readValueFromResponse(stateDesc, resp) {
    adapter.log.debug('read response: ' + safeJsonStringify(resp));
    // check if response is an array with at least one element
    if (resp && Array.isArray(resp) && resp.length > 0) {
        if (stateDesc.readResponse) {
            // use readResponse function from state to get object value
            return stateDesc.readResponse(resp);
        } else if (resp.length === 1) {
            // simple default implementation for response with just one response object
            let respObj = resp[0];
            if (respObj.status === 0 && respObj.attrData !== undefined && respObj.attrData !== null) {
                if (stateDesc.type === 'number') {
                    // return number from attrData
                    return respObj.attrData;
                } else if (stateDesc.type === 'boolean') {
                    // return attrData converted into boolean
                    return (respObj.attrData === 1);
                }
            }
        }
    }
}

function publishToState(devId, modelID, model, payload) {
    const stateModel = statesMapping.findModel(modelID);
    if (!stateModel) {
        adapter.log.debug('Device ' + devId + ' "' + modelID + '" not described in statesMapping.');
        return;
    }
    // find states for payload
    const states = statesMapping.commonStates.concat(
        stateModel.states.filter((statedesc) => payload.hasOwnProperty(statedesc.prop || statedesc.id))
    );
    for (const stateInd in states) {
        const statedesc = states[stateInd];
        let value;
        if (statedesc.getter) {
            value = statedesc.getter(payload);
        } else {
            value = payload[statedesc.prop || statedesc.id]
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
            updateStateWithTimeout(devId, statedesc.id, value, common, 300, !value);
        } else {
            if (statedesc.prepublish) {
                collectOptions(devId, modelID, (options) => {
                    statedesc.prepublish(devId, value, (newvalue) => {
                        updateState(devId, statedesc.id, newvalue, common);
                    }, options);
                });
            } else {
                updateState(devId, statedesc.id, value, common);
            }
        }
    }
}

function syncDevStates(dev) {
    const devId = dev.ieeeAddr.substr(2),
        modelId = dev.modelId,
        hasGroups = dev.type === 'Router';
    // devId - iobroker device id
    const stateModel = statesMapping.findModel(modelId);
    if (!stateModel) {
        adapter.log.debug('Device ' + devId + ' "' + modelId + '" not described in statesMapping.');
        return;
    }
    const states = statesMapping.commonStates.concat(stateModel.states)
        .concat((hasGroups) ? [statesMapping.groupsState] : []);

    for (const stateInd in states) {
        if (!states.hasOwnProperty(stateInd)) continue;

        const statedesc = states[stateInd];

        // Filter out non routers or devices that are battery driven for the availability flag
        if (statedesc.id === 'available')
            if (!(dev.type === 'Router') || dev.powerSource === 'Battery')
                continue;

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
        updateState(devId, statedesc.id, undefined, common);
    }
}

function collectOptions(devId, modelId, callback) {
    let states;
    let result = {};
    // find model states for options and get it values
    if (modelId === 'group') {
        states = statesMapping.groupStates.filter((statedesc) => statedesc.isOption || statedesc.inOptions);
    } else {
        const mappedModel = deviceMapping.findByZigbeeModel(modelId);
        if (!mappedModel) {
            adapter.log.error('Unknown device model ' + modelId);
            callback(result);
            return;
        }
        const stateModel = statesMapping.findModel(modelId);
        if (!stateModel) {
            adapter.log.error('Device ' + devId + ' "' + modelId + '" not described in statesMapping.');
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
        const id = adapter.namespace + '.' + devId + '.' + statedesc.id;
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

function onDevEvent(type, devId, message, data) {
    switch (type) {
        case 'interview':
            adapter.log.debug('Device ' + devId + ' try to connect ' + safeJsonStringify(data));
            logToPairing('Interview state: step ' + data.currentEp + '/' + data.totalEp + '. progress: ' + data.progress + '%', true);
            break;
        case 'msg':
            adapter.log.debug('Device ' + devId + ' incoming event:' + safeJsonStringify(message));
            // Map Zigbee modelID to vendor modelID.
            const mModel = deviceMapping.findByZigbeeModel(data.modelId);


            let payload = {};
            if (message.hasOwnProperty('linkquality')) {
                payload.linkquality = message.linkquality;
            }

            if (message.hasOwnProperty('available')) {
                payload.available = message.available;
            }

            adapter.log.debug('Publish ' + safeJsonStringify(payload));
            publishToState(devId.substr(2), data.modelId, mModel, payload);
            break;

        default:
            adapter.log.debug('Device ' + devId + ' emit event ' + type + ' with data:' + safeJsonStringify(message.data));

            // ignore if remaining time is set in event, cause that's just an intermediate value
            if (message.data.data && message.data.data.remainingTime) {
                adapter.log.debug('Found remaining time ' + message.data.data.remainingTime + ', so skip event');
                return;
            }

            // Map Zigbee modelID to vendor modelID.
            const modelID = data.modelId;
            const mappedModel = deviceMapping.findByZigbeeModel(modelID);
            // Find a conveter for this message.
            const cid = data.cid;
            if (!mappedModel) {
                adapter.log.error('Unknown device model ' + modelID + ' emit event ' + type + ' with data:' + safeJsonStringify(message.data));
                return;
            }
            let converters = mappedModel.fromZigbee.filter(c => c.cid === cid && (
                (c.type instanceof Array) ? c.type.includes(type) : c.type === type));
            if (!converters.length && type === 'readRsp') {
                converters = mappedModel.fromZigbee.filter(c => c.cid === cid && (
                    (c.type instanceof Array) ? c.type.includes('attReport') : c.type === 'attReport'));
            }
            if (!converters.length) {
                adapter.log.debug(
                    `No converter available for '${mappedModel.model}' with cid '${cid}' and type '${type}'`
                );
                return;
            }
            converters.forEach((converter) => {
                const publish = (payload) => {
                    // Don't cache messages with click and action.
                    const cache = !payload.hasOwnProperty('click') && !payload.hasOwnProperty('action');
                    adapter.log.debug('Publish ' + safeJsonStringify(payload));
                    if (payload) {
                      publishToState(devId.substr(2), modelID, mappedModel, payload);
                    }
                };

                collectOptions(devId.substr(2), modelID, (options) => {
                    const payload = converter.convert(mappedModel, message, publish, options);
                    if (payload) {
                            // Add device linkquality.
                            if (message.linkquality) {
                                payload.linkquality = message.linkquality;
                            }
                            publish(payload);
                    }
                });
            });
            break;
    }
}


function main() {
	if (!adapter.systemConfig) return;
    // file path for ZShepherd
    const dbDir = utils.controllerDir + '/' + adapter.systemConfig.dataDir + adapter.namespace.replace('.', '_');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
    const port = adapter.config.port;
    if (!port) {
        adapter.log.error('Serial port not selected! Go to settings page.');
        return;
    }
    const createByteArray = function (hexString) {
        for (var bytes = [], c = 0; c < hexString.length; c += 2) {
            bytes.push(parseInt(hexString.substr(c, 2), 16));
        }
        return bytes;
    }
    const panID = parseInt(adapter.config.panID ? adapter.config.panID : 0x1a62);
    const channel = parseInt(adapter.config.channel ? adapter.config.channel : 11);
    const precfgkey = createByteArray(adapter.config.precfgkey ? adapter.config.precfgkey : '01030507090B0D0F00020406080A0C0D');
    const extPanId = createByteArray(adapter.config.extPanID ? adapter.config.extPanID : 'DDDDDDDDDDDDDDDD').reverse();
    adapter.log.info('Start on port: ' + port + ' channel ' + channel);
    adapter.log.info('Queue is: ' + !adapter.config.disableQueue);
    adapter.getState('info.groups', (err, groupsState) => {
        if (!groupsState) {
            adapter.extendObject('info.groups', {
                type: 'state',
                common: {name: 'Groups', type: 'string', read: true, write: false}
            }, () =>
                adapter.setState('info.groups', JSON.stringify(adapter.config.groups || {}), true));
        }
    });

    let shepherd = new ZShepherd(port, {
        net: {panId: panID, channelList: [channel], precfgkey: precfgkey, extPanId: extPanId},
        sp: {baudRate: 115200, rtscts: false},
        dbPath: dbDir + '/shepherd.db'
    });
    // create controller and handlers. Note: panId may be changed automatically in case of conflicts
    zbControl = new ZigbeeController(shepherd);
    zbControl.on('log', onLog);
    zbControl.on('ready', onReady);
    zbControl.on('new', newDevice);
    zbControl.on('leave', leaveDevice);
    zbControl.on('join', onPermitJoining);
    zbControl.on('event', onDevEvent);

    if (adapter.log.level === 'debug') {
        const oldStdOut = process.stdout.write.bind(process.stdout);
        const oldErrOut = process.stderr.write.bind(process.stderr);
        process.stdout.write = function (logs) {
            if (adapter && adapter.log && adapter.log.debug) {
                adapter.log.debug(logs.replace(/(\r\n\t|\n|\r\t)/gm, ""));
            }
            oldStdOut(logs);
        };
        process.stderr.write = function (logs) {
            if (adapter && adapter.log && adapter.log.debug) {
                adapter.log.debug(logs.replace(/(\r\n\t|\n|\r\t)/gm, ""));
            }
            oldErrOut(logs);
        };
        adapter.log.info(`Lib-Versions: ZShepherd ${require('zigbee-shepherd/package.json').version}, ZSConverters ${require('zigbee-shepherd-converters/package.json').version}`);
    }
    // before start reset coordinator
    zbControl.reset('soft', (err, data) =>
        adapter.log.info('Reset coordinator'));

    // start the server
    zbControl.start(err => err && adapter.setState('info.connection', false));

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    processMessages(true);
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}