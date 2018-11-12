/**
 *
 * Zigbee devices adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

process.env.DEBUG = 'zigbee*,cc-znp*';

const safeJsonStringify = require(__dirname + '/lib/json');
// you have to require the utils module and call adapter function
const fs = require('fs');
const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
const ZShepherd = require('zigbee-shepherd');
const ZigbeeController = require(__dirname + '/lib/zigbeecontroller');
const adapter = utils.Adapter({name: 'zigbee', systemConfig: true});
const deviceMapping = require('zigbee-shepherd-converters');
const statesMapping = require(__dirname + '/lib/devstates');
const SerialPort = require('serialport');

let zbControl;


function processMessages(ignore) {
    adapter.getMessage(function (err, obj) {
        if (obj) {
            if (!ignore && obj && obj.command === 'send') processMessage(obj.message);
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


// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.debug('cleaned everything up...');
        if (zbControl) {
            zbControl.stop();
            zbControl = undefined;
        }
        callback();
    } catch (e) {
        callback();
    }
});


// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    // adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});


// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.debug('User stateChange ' + id + ' ' + JSON.stringify(state));
        const devId = adapter.namespace + '.' + id.split('.')[2]; // iobroker device id
        const deviceId = '0x' + id.split('.')[2]; // zigbee device id
        const stateKey = id.split('.')[3];
        adapter.getObject(devId, function (err, obj) {
            if (obj) {
                const modelId = obj.common.type;
                if (!modelId) return;
                adapter.setState(id, state.val, true);
                collectOptions(id.split('.')[2], modelId, options => {
                    publishFromState(deviceId, modelId, stateKey, state, options);
                });
            }
        });
    }
});


// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', obj => {
    if (typeof obj === 'object' && obj.command) {
        switch (obj.command) {
            case 'send':
                // e.g. send email or pushover or whatever
                adapter.log.debug('send command');
                // Send response in callback if required
                if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
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
            case 'deleteDevice':
                if (obj && obj.message && typeof obj.message === 'object') {
                    deleteDevice(obj.from, obj.command, obj.message, obj.callback);
                }
                break;
            case 'listUart':
                if (obj.callback) {
                    listSerial()
                        .then((ports) => {
                            adapter.log.info('List of ports: ' + JSON.stringify(ports));
                            adapter.sendTo(obj.from, obj.command, ports, obj.callback);
                        });
                }
                break;
            default:
                adapter.log.warn('Unknown message: ' + JSON.stringify(obj));
                break;
        }
    }
    processMessages();
});


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
                if (stobj) {
                    // update state - not change name and role (user can it changed)
                    delete new_common.name;
                    delete new_common.role;
                }
                adapter.extendObject(id, {type: 'state', common: new_common}, () => {
                    if (value !== undefined) {
                        adapter.setState(id, value, true);
                    }
                });
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
            adapter.deleteDevice(devId, function () {
                adapter.sendTo(from, command, {}, callback);
            });
            return;
        }
        zbControl.remove(sysid, err => {
            if (!err) {
                adapter.log.debug('Successfully removed from shepherd!');
                adapter.deleteDevice(devId, () => adapter.sendTo(from, command, {}, callback));
            } else {
                adapter.log.debug('Error on remove! ' + err);
                adapter.log.debug('Try force remove!');
                zbControl.forceRemove(sysid, err => {
                    if (!err) {
                        adapter.log.debug('Force removed from shepherd!');
                        adapter.log.debug('Try delete dev ' + devId + ' from iobroker.');
                        adapter.deleteDevice(devId, () => adapter.sendTo(from, command, {}, callback));
                    } else {
                        adapter.sendTo(from, command, {error: err}, callback);
                    }
                });
            }
        });
    } else {
        adapter.sendTo(from, command, {error: 'You need save and run adapter!'}, callback);
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

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', () => main());

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
        logToPairing('Pairing started ' + devId);
        zbControl.permitJoin(60, devId, err => {
            if (!err) {
                // set pairing mode on
                adapter.setState('info.pairingMode', true);
            }
        });
        adapter.sendTo(from, command, 'Start pairing!', callback);
    } else {
        adapter.sendTo(from, command, {error: 'You need save and run adapter before pairing!'}, callback);
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
        let rooms;
        adapter.getEnums('enum.rooms', (err, list) => {
            if (!err) {
                rooms = list['enum.rooms'];
            }
            adapter.getDevices((err, result) => {
                if (result) {
                    const devices = [];
                    let cnt = 0;
                    const len = result.length;

                    result.forEach((devInfo) => {
                        if (devInfo._id) {
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
                            devices.push(devInfo);
                            cnt++;
                            if (cnt === len) {
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
                                adapter.log.debug('getDevices result: ' + JSON.stringify(devices));
                                adapter.sendTo(from, command, devices, callback);
                            }
                        }
                    });
                    if (!len) {
                        // append devices that paired but not created
                        pairedDevices.forEach(device => {
                            const exists = devices.find(dev => device.ieeeAddr === '0x' + dev._id.split('.')[2]);
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
                        adapter.log.debug('getDevices result: ' + JSON.stringify(devices));
                        adapter.sendTo(from, command, devices, callback);
                    }
                }
            });
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
        updateDev(dev.ieeeAddr.substr(2), dev.modelId, dev.modelId, () =>
            syncDevStates(dev.ieeeAddr.substr(2), dev.modelId));

    }
}

function leaveDevice(id, msg) {
    const devId = id.substr(2);
    adapter.log.debug('Try delete dev ' + devId + ' from iobroker.');
    adapter.deleteDevice(devId);
}

function onReady() {
    adapter.setState('info.connection', true);

    if (adapter.config.disableLed) {
        zbControl.disableLed();
    }

    // update pairing State
    adapter.setState('info.pairingMode', false);
    // get and list all registered devices (not in ioBroker)
    let activeDevices = zbControl.getAllClients();
    adapter.log.debug('Current active devices:');
    zbControl.getDevices().forEach(device => adapter.log.debug(safeJsonStringify(device)));
    activeDevices.forEach(device => {
        adapter.log.info(getDeviceStartupLogMessage(device));

        // update dev and states
        updateDev(device.ieeeAddr.substr(2), device.modelId, device.modelId, () =>
            syncDevStates(device.ieeeAddr.substr(2), device.modelId));

        configureDevice(device);
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

function configureDevice(device) {
    // Configure reporting for this device.
    const ieeeAddr = device.ieeeAddr;
    if (ieeeAddr && device.modelId) {
        const mappedModel = deviceMapping.findByZigbeeModel(device.modelId);

        if (mappedModel && mappedModel.configure) {
            mappedModel.configure(ieeeAddr, zbControl.shepherd, zbControl.getCoordinator(), (ok, msg) => {
                if (ok) {
                    adapter.log.info(`Succesfully configured ${ieeeAddr}`);
                } else {
                    adapter.log.error(`Failed to configure ${ieeeAddr} ` + device.modelId);
                }
            });
        }
    }
}

function onLog(level, msg, data) {
    if (msg) {
        let logger = adapter.log.info;
        switch (level) {
            case 'error':
                logger = adapter.log.error;
                if (data)
                    data = data.toString();
                logToPairing('Error: ' + msg + '. ' + data);
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
    const mappedModel = deviceMapping.findByZigbeeModel(modelId);
    if (!mappedModel) {
        adapter.log.error('Unknown device model ' + modelId);
        return;
    }
    const stateModel = statesMapping.findModel(modelId);
    if (!stateModel) {
        adapter.log.error('Device ' + deviceId + ' "' + modelId + '" not described in statesMapping.');
        return;
    }
    // find state for set
    const stateDesc = stateModel.states.find((statedesc) => stateKey === statedesc.id);
    if (!stateDesc) {
        adapter.log.error(
            `No state available for '${mappedModel.model}' with key '${stateKey}'`
        );
        return;
    }

    const value = state.val;

    if (value === undefined || value === '') 
        return;

    let stateList = [{stateDesc: stateDesc, value: value, index: 0}];

    if (stateModel.linkedStates) {
        stateModel.linkedStates.forEach((linkedFunct) => {
            const res = linkedFunct(stateDesc, value);
            if (res) {
                stateList = stateList.concat(res);
            }
        });
        // sort by index
        stateList.sort((a, b) => {
            return a.index - b.index;
        });
    }

    const published = [];

    stateList.forEach((changedState) => {
        const stateDesc = changedState.stateDesc;
        if (stateDesc.isOption) return;
        const value = changedState.value;
        const converter = mappedModel.toZigbee.find((c) => c.key === stateDesc.prop || c.key === stateDesc.setattr || c.key === stateDesc.id);
        if (!converter) {
            adapter.log.error(
                `No converter available for '${mappedModel.model}' with key '${stateKey}'`
            );
            return;
        }
        const preparedValue = (stateDesc.setter) ? stateDesc.setter(value, options) : value;
        const preparedOptions = (stateDesc.setterOpt) ? stateDesc.setterOpt(value, options) : {};
        
        const epName = stateDesc.epname !== undefined ? stateDesc.epname : (stateDesc.prop || stateDesc.id);
        const ep = mappedModel.ep && mappedModel.ep[epName] ? mappedModel.ep[epName] : null;
        const message = converter.convert(preparedValue, preparedOptions, 'set');
        if (!message) {
            return;
        }

        zbControl.publish(deviceId, message.cid, message.cmd, message.zclData, ep, message.cmdType);

        published.push({message: message, converter: converter, ep: ep});
    });
    
    // copy from https://github.com/Koenkk/zigbee2mqtt/issues/72
    /**
     * After publishing a command to a zigbee device we want to monitor the changed attribute(s) so that
     * everything stays in sync.
     */
    // published.forEach((p) => {
    //     let counter = 0;
    //     let secondsToMonitor = 1;

    //     // In case of a transition we need to monitor for the whole transition time.
    //     if (p.message.zclData.hasOwnProperty('transtime')) {
    //         // Note that: transtime 10 = 0.1 seconds, 100 = 1 seconds, etc.
    //         secondsToMonitor = (p.message.zclData.transtime / 10) + 1;
    //     }
    //     adapter.log.debug(`Waiting for '${secondsToMonitor}' sec`);

    //     const timer = setInterval(() => {
    //         counter++;
            
    //         // Doing a 'read' will result in the device sending a zigbee message with the current attribute value.
    //         // which will be handled by this.handleZigbeeMessage.
    //         p.converter.attr.forEach((attribute) => {
    //             zbControl.read(deviceId, p.message.cid, attribute, p.ep, () => null);
    //         });

    //         if (counter >= secondsToMonitor) {
    //             adapter.log.debug(`Finished waiting`);
    //             clearTimeout(timer);
    //         }
    //     }, 1000);
    // });
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

function syncDevStates(devId, modelId) {
    // devId - iobroker device id
    const stateModel = statesMapping.findModel(modelId);
    if (!stateModel) {
        adapter.log.debug('Device ' + devId + ' "' + modelId + '" not described in statesMapping.');
        return;
    }
    const states = statesMapping.commonStates.concat(stateModel.states);
    for (const stateInd in states) {
        if (!states.hasOwnProperty(stateInd)) continue;

        const statedesc = states[stateInd];
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
        updateState(devId, statedesc.id, undefined, common);
    }
}

function collectOptions(devId, modelId, callback) {
    // find model states for options and get it values
    const mappedModel = deviceMapping.findByZigbeeModel(modelId);
    if (!mappedModel) {
        adapter.log.error('Unknown device model ' + modelId);
        callback();
        return;
    }
    const stateModel = statesMapping.findModel(modelId);
    if (!stateModel) {
        adapter.log.error('Device ' + devId + ' "' + modelId + '" not described in statesMapping.');
        callback();
        return;
    }
    const states = stateModel.states.filter((statedesc) => statedesc.isOption);
    if (!states) {
        callback();
        return;
    }
    let result = {};
    let cnt = 0, len = states.length;
    states.forEach((statedesc) => {
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
    if (!len) callback();
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
            const payload = {linkquality: message.linkquality};
            adapter.log.debug('Publish ' + safeJsonStringify(payload));
            publishToState(devId.substr(2), data.modelId, mModel, payload);
            break;

        default:
            adapter.log.debug('Device ' + devId + ' emit event ' + type + ' with data:' + safeJsonStringify(message.data));
            // Map Zigbee modelID to vendor modelID.
            const modelID = data.modelId;
            const mappedModel = deviceMapping.findByZigbeeModel(modelID);
            // Find a conveter for this message.
            const cid = data.cid;
            if (!mappedModel) {
                adapter.log.error('Unknown device model ' + modelID + ' emit event ' + type + ' with data:' + safeJsonStringify(message.data));
                return;
            }
            const converters = mappedModel.fromZigbee.filter(c => c.cid === cid && c.type === type);
            if (!converters.length) {
                adapter.log.error(
                    `No converter available for '${mappedModel.model}' with cid '${cid}' and type '${type}'`
                );
                return;
            }
            converters.forEach((converter) => {
                const publish = (payload) => {
                    // Don't cache messages with click and action.
                    const cache = !payload.hasOwnProperty('click') && !payload.hasOwnProperty('action');
                    adapter.log.debug('Publish ' + safeJsonStringify(payload));
                    publishToState(devId.substr(2), modelID, mappedModel, payload);
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
    // file path for ZShepherd
    const dbDir = utils.controllerDir + '/' + adapter.systemConfig.dataDir + adapter.namespace.replace('.', '_');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
    const port = adapter.config.port;
    const panID = parseInt(adapter.config.panID ? adapter.config.panID : 0x1a62);
    const channel = parseInt(adapter.config.channel ? adapter.config.channel : 11);
    if (!port) {
        adapter.log.error('Serial port not selected! Go to settings page.');
        return;
    }
    adapter.log.info('Start on port: ' + port + ' with panID ' + panID + ' channel ' + channel);
    let shepherd = new ZShepherd(port, {
        net: {panId: panID, channelList: [channel]},
        sp: {baudRate: 115200, rtscts: false},
        dbPath: dbDir + '/shepherd.db'
    });
    // create controller and handlers
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
                adapter.log.debug(logs.replace(/(\r\n\t|\n|\r\t)/gm,""));
            }
            oldStdOut(logs);
        };
        process.stderr.write = function (logs) {
            if (adapter && adapter.log && adapter.log.debug) {
                adapter.log.debug(logs.replace(/(\r\n\t|\n|\r\t)/gm,""));
            }
            oldErrOut(logs);
        };
    }

    // start the server
    zbControl.start(err => err && adapter.setState('info.connection', false));

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    processMessages(true);
}
