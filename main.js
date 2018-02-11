/**
 *
 * Zigbee for Xiaomi devices adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
var fs = require("fs");
var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var util = require("util");
var perfy = require('perfy');

var ZShepherd = require('zigbee-shepherd');
// need when error on remove
ZShepherd.prototype.forceRemove = function(ieeeAddr, callback) {
    var dev = this._findDevByAddr(ieeeAddr);
    return this._unregisterDev(dev, function(err, result) {
        return callback(err, result);
    });
};
var shepherd;
var adapter = utils.adapter({name: 'zigbee', systemConfig: true});


function processMessages(ignore) {
    adapter.getMessage(function (err, obj) {
        if (obj) {
            if (!ignore && obj && obj.command == 'send') processMessage(obj.message);
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
            return;
        }
    }
}


// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        shepherd = undefined;
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
    // Warning, state can be null if it was deleted
    //adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('User stateChange ' + id + ' ' + JSON.stringify(state));
        if (id.indexOf('onRight') > -1) {
            adapter.log.info('Send right turn on/off');
            var ep = shepherd.find('0x00158d0001f4d992', 3); // TODO: get real id
            if (!ep) {
                adapter.log.info('Not found ep');
            } else {
                //adapter.log.info('Found ep'+JSON.stringify(ep));
                ep.functional('genOnOff', 'toggle', {}, function (err, rsp) {  //toggle, on ,off
                    adapter.log.info(err);
                    adapter.log.info(rsp);
                    // if (!err)
                    //         adapter.log.info(rsp);
                    // This example receives a 'defaultRsp'
                    // {
                    //     cmdId: 2,
                    //     statusCode: 0
                    // }
                });
            }
        }
        if (id.indexOf('onLeft') > -1) {
            adapter.log.info('Send left turn on/off');
            var ep = shepherd.find('0x00158d0001f4d992', 2); // TODO: get real id
            if (!ep) {
                adapter.log.info('Not found ep');
            } else {
                //adapter.log.info('Found ep'+JSON.stringify(ep));
                ep.functional('genOnOff', 'toggle', {}, function (err, rsp) { //toggle, on ,off
                    adapter.log.info(err);
                    adapter.log.info(rsp);
                    // if (!err)
                    //         adapter.log.info(rsp);
                    // This example receives a 'defaultRsp'
                    // {
                    //     cmdId: 2,
                    //     statusCode: 0
                    // }
                });
            }
        }
    }
});


// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        switch (obj.command) {
            case 'send':
                // e.g. send email or pushover or whatever
                adapter.log.info('send command');
                // Send response in callback if required
                if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
                break;
            case 'letsPairing':
                if (obj && obj.message && typeof obj.message == 'object') {
                    letsPairing(obj.from, obj.command, obj.callback);
                }
                break;
            case 'getDevices':
                if (obj && obj.message && typeof obj.message == 'object') {
                    getDevices(obj.from, obj.command, obj.callback);
                }
                break;
            case 'renameDevice':
                if (obj && obj.message && typeof obj.message == 'object') {
                    renameDevice(obj.from, obj.command, obj.message, obj.callback);
                }
                break;
            case 'deleteDevice':
                if (obj && obj.message && typeof obj.message == 'object') {
                    deleteDevice(obj.from, obj.command, obj.message, obj.callback);
                }
                break;
            default:
                adapter.log.warn('Unknown message: ' + JSON.stringify(obj));
                break;
        }
    }
    processMessages();
});

function updateStateWithTimeout(dev_id, name, value, common, timeout, outValue) {
    updateState(dev_id, name, value, common);
    setTimeout(function () {
        updateState(dev_id, name, outValue, common);
    }, timeout);
}

function updateState(dev_id, name, value, common) {
    let id = dev_id + '.' + name;
    adapter.getObject(dev_id, function(err, obj) {
        if (obj) {
            let new_common = {
                name: name, 
                role: 'value',
                read: true,
                write: (common != undefined && common.write == undefined) ? false : true
            };
            if (common != undefined) {
                if (common.type != undefined) {
                    new_common.type = common.type;
                }
                if (common.unit != undefined) {
                    new_common.unit = common.unit;
                }
                if (common.states != undefined) {
                    new_common.states = common.states;
                }
            }
            adapter.extendObject(id, {type: 'state', common: new_common});
            adapter.setState(id, value, true);
        } else {
            adapter.log.info('no device '+dev_id);
        }
    });
}

function renameDevice(from, command, msg, callback) {
    if (shepherd) {
        var id = msg.id, newName = msg.name;
        adapter.extendObject(id, {common: {name: newName}});
        adapter.sendTo(from, command, {}, callback);
    } else {
        adapter.sendTo(from, command, {error: 'You need save and run adapter!'}, callback);
    }
}

function deleteDevice(from, command, msg, callback) {
    if (shepherd) {
        adapter.log.info('deleteDevice message: ' + JSON.stringify(msg));
        var id = msg.id, sysid = id.replace(adapter.namespace+'.', '0x'), 
            dev_id = id.replace(adapter.namespace+'.', '');
        adapter.log.info('deleteDevice sysid: ' + sysid);
        //adapter.extendObject(id, {common: {name: newName}});
        var dev = shepherd.find(sysid, 1);
        if (!dev) {
            adapter.log.info('Not found on shepherd!');
            adapter.log.info('Try delete dev '+dev_id+'from iobroker.');
            adapter.deleteDevice(dev_id, function(){
                adapter.sendTo(from, command, {}, callback);
            });
            return;
        } 
        // try make dev online
        dev.getDevice().update({status: 'online'});
        shepherd.remove(sysid, function (err) {
            if (!err) {
                adapter.log.info('Successfully removed from shepherd!');
                adapter.deleteDevice(dev_id, function(){
                    adapter.sendTo(from, command, {}, callback);
                });
            } else {
                adapter.log.info('Error on remove!');
                adapter.log.info('Try force remove!');
                shepherd.forceRemove(sysid, function (err) {
                    if (!err) {
                        adapter.log.info('Force removed from shepherd!');
                        adapter.log.info('Try delete dev '+dev_id+'from iobroker.');
                        adapter.deleteDevice(dev_id, function(){
                            adapter.sendTo(from, command, {}, callback);
                        });
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

function updateDev(dev_id, dev_name, dev_type) {
    let id = '' + dev_id;
    // create channel for dev
    adapter.setObjectNotExists(id, {
        type: 'device',
        common: {name: dev_name, type: dev_type}
    }, {});
    adapter.getObject(id, function(err, obj) {
        if (!err && obj) {
            // if repairing 
            adapter.extendObject(id, {
                type: 'device',
                common: {type: dev_type}
            });
        }
    });
}

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});


function onPermitJoining(joinTimeLeft, from, command, callback){
    adapter.log.info(joinTimeLeft);
    adapter.setObjectNotExists('info.pairingCountdown', {
        type: 'state',
        common: {name: 'Pairing countdown'}
    }, {});
    adapter.setState('info.pairingCountdown', joinTimeLeft);
    // repeat until 0
    if (joinTimeLeft == 0) {
        // set pairing mode off
        adapter.setObjectNotExists('info.pairingMode', {
            type: 'state',
            common: {name: 'Pairing mode'}
        }, {});
        adapter.setState('info.pairingMode', false);
    }
}

function letsPairing(from, command, callback){
    if (shepherd) {
        // allow devices to join the network within 60 secs
        shepherd.permitJoin(60, function(err) {
            if (err) {
                adapter.log.error(err);
            } else {
                // set pairing mode on
                adapter.setObjectNotExists('info.pairingMode', {
                    type: 'state',
                    common: {name: 'Pairing mode'}
                }, {});
                adapter.setState('info.pairingMode', true);
            }
        });
        adapter.sendTo(from, command, 'Start pairing!', callback);
    } else {
        adapter.sendTo(from, command, {error: 'You need save and run adapter before pairing!'}, callback);
    }
}

function getDevices(from, command, callback){
    if (shepherd) {
        var rooms;
        adapter.getEnums('enum.rooms', function (err, list) {
            if (!err){
                rooms = list['enum.rooms'];
            }
            adapter.getDevices((err, result) => {
                if (result) {
                    var devices = [], cnt = 0, len = result.length;
                    for (var item in result) {
                        if (result[item]._id) {
                            var id = result[item]._id.substr(adapter.namespace.length + 1);
                            let devInfo = result[item];
                            devInfo.rooms = [];
                            for (var room in rooms) {
                                if (!rooms[room] || !rooms[room].common || !rooms[room].common.members)
                                    continue;
                                if (rooms[room].common.members.indexOf(devInfo._id) !== -1) {
                                    devInfo.rooms.push(rooms[room].common.name);
                                }
                            }
                            adapter.getState(result[item]._id+'.paired', function(err, state){
                                cnt++;
                                if (state) {
                                    devInfo.paired = state.val;
                                }
                                devices.push(devInfo);
                                if (cnt==len) {
                                    adapter.log.info('getDevices result: ' + JSON.stringify(devices));
                                    adapter.sendTo(from, command, devices, callback);
                                }
                            });
                        }
                    }
                    if (len == 0) {
                        adapter.log.info('getDevices result: ' + JSON.stringify(devices));
                        adapter.sendTo(from, command, devices, callback);
                    }
                }
            });
        });
    } else {
        adapter.sendTo(from, command, {error: 'You need save and run adapter before pairing!'}, callback);
    }
}

function newDevice(id){
    var dev = shepherd.find(id,1);
    if (dev) {
        dev = dev.getDevice();
        adapter.log.info('new dev '+dev.ieeeAddr + ' ' + dev.nwkAddr + ' ' + dev.modelId);
        updateDev(dev.ieeeAddr.substr(2), dev.modelId, dev.modelId);
        updateState(dev.ieeeAddr.substr(2), 'paired', true, {type: 'boolean'});
    }
}

function markConnected(devices){
    var devInds = [];
    for (var dev in devices) {
        devInds.push(devices[dev].ieeeAddr.substr(2));
    }
    adapter.getDevices(function(err, result){
        if (result) {
            //adapter.log.info('getDevices result: ' + JSON.stringify(result));
            var devices = [];
            for (var item in result) {
                if (result[item]._id) {
                    var id = result[item]._id.substr(adapter.namespace.length + 1);
                    // if found on connected list
                    if (devInds.indexOf(id) >= 0) {
                        updateState(result[item]._id, 'paired', true, {type: 'boolean'});
                    } else {
                        updateState(result[item]._id, 'paired', false, {type: 'boolean'});
                    }
                }
            }
        }
    });
}

function onReady(){
    adapter.setState('info.connection', true);
    adapter.setObjectNotExists('info.pairingMode', {
        type: 'state',
        common: {name: 'Pairing mode'}
    }, {});
    adapter.setState('info.pairingMode', false);
    adapter.log.info('Server is ready. Current devices:');
    var itemsProcessed = 0,
        devices = [];
    shepherd.list().forEach(function(dev, index, array){
        if (dev.type === 'EndDevice')
            adapter.log.info(dev.ieeeAddr + ' ' + dev.nwkAddr + ' ' + dev.modelId);
        if (dev.manufId === 4151) // set all xiaomi devices to be online, so shepherd won't try to query info from devices (which would fail because they go tosleep)
            shepherd.find(dev.ieeeAddr,1).getDevice().update({ status: 'online', joinTime: Math.floor(Date.now()/1000) });
        devices.push(dev);
        itemsProcessed++;
        if(itemsProcessed === array.length) {
            markConnected(devices);
        }
    });
}

function main() {
    // file path for ZShepherd
    var dbDir = utils.controllerDir + '/' + adapter.systemConfig.dataDir + adapter.namespace.replace('.', '_');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
    var port = adapter.config.port;
    adapter.log.info('Start on port: ' + port);
    shepherd = new ZShepherd(port, {
        net: {
            panId: 0x1a62
        },
        dbPath: dbDir+'/shepherd.db'
    });

    shepherd.on('permitJoining', function(joinTimeLeft) {
        onPermitJoining(joinTimeLeft);
    });

    shepherd.on('ready', onReady);
    shepherd.on('ind', function(msg) {
        //adapter.log.info('msg: ' + util.inspect(msg, false, null));
        var pl = null;
        var topic;
        var dev, dev_id, devClassId, epId;

        switch (msg.type) {
            case 'devInterview':
                adapter.log.info('msg: ' + util.inspect(msg, false, null));
                break;
            case 'genAnalogInput':
                adapter.log.info('msg: ' + util.inspect(msg, false, null));
                break;
            case 'devIncoming':
                adapter.log.info('Device: ' + msg.data + ' joining the network!');
                newDevice(msg.data);
                break;
            case 'statusChange':
                dev = msg.endpoints[0].device;
                devClassId = msg.endpoints[0].devId;
                adapter.log.info('statusChange: ' + msg.endpoints[0].device.ieeeAddr + ' ' + msg.endpoints[0].devId + ' ' + msg.endpoints[0].epId + ' ' + util.inspect(msg.data, false, null));
                dev_id = msg.endpoints[0].device.ieeeAddr.substr(2);
                pl=1;
                switch (msg.data.cid) {
                    case 'ssIasZone':
                        // wet/gas detected
                        if (msg.data.zoneStatus == 1) {
                            updateState(dev_id, 'detected', true, {type: 'boolean'});
                        } else {
                            updateState(dev_id, 'detected', false, {type: 'boolean'});
                        }
                        break;
                }
                break;
            case 'attReport':
                dev = msg.endpoints[0].device;
                devClassId = msg.endpoints[0].devId;
                epId = msg.endpoints[0].epId;
                adapter.log.info('attreport: ' + msg.endpoints[0].device.ieeeAddr + ' ' + msg.endpoints[0].devId + ' ' + msg.endpoints[0].epId + ' ' + util.inspect(msg.data, false, null));

                // defaults, will be extended or overridden based on device and message
                //topic += msg.endpoints[0].device.ieeeAddr.substr(2);
                dev_id = msg.endpoints[0].device.ieeeAddr.substr(2);
                pl=1;

                switch (msg.data.cid) {
                    case 'genBasic':
                        if (msg.data.data['65281']) {
                            //var buf=msg.data.data['65281'];
                            //adapter.log.info('xiaomiStruct: '+buf.toString('hex'));
                            var batteryData = msg.data.data['65281']['1'];
                            if (batteryData) {
                                updateState(dev_id, 'voltage', batteryData / 1000, {type: 'number', unit: 'v'});  // voltage
                                updateState(dev_id, 'battery', (batteryData - 2700) / 5, {type: 'number', unit: '%'});  // percent
                            }
                        }
                        break;
                    case 'genOnOff':  // various switches
                        //topic += '/' + msg.endpoints[0].epId;
                        topic = 'click';
                        pl = msg.data.data['onOff'];
                        if (dev.modelId && dev.modelId.indexOf('lumi.sensor_switch') !== -1) {
                            pl = undefined;
                            if (msg.data.data['onOff'] == 1) {
                                updateStateWithTimeout(dev_id, 'click', true, {type: 'boolean'}, 300, false);
                            }
                        }
                        if (dev.modelId && dev.modelId.indexOf('lumi.sensor_magnet') >= 0) {
                            pl = undefined;
                            if (msg.data.data['onOff'] == 1) {
                                updateState(dev_id, 'contact', true, {type: 'boolean'});
                            } else {
                                updateState(dev_id, 'contact', false, {type: 'boolean'});
                            }
                        }
                        // WXKG02LM
                        if (dev.modelId == 'lumi.sensor_86sw2\u0000Un') {
                            pl = undefined;
                            if (devClassId === 24321) { // left
                                topic = 'left_click';                                
                            } else if (devClassId === 24322) { // right
                                topic = 'right_click';
                            } else if (devClassId === 24323) { // both
                                topic = 'both_click';
                            }
                            updateStateWithTimeout(dev_id, topic, true, {type: 'boolean'}, 300, false);
                        }
                        // QBKG03LM
                        if (dev.modelId == 'lumi.ctrl_neutral2') {
                            topic = null;
                            if (devClassId == 256 && (epId == 4 || epId == 2)) { // left
                                if (pl == 0) { // left press with state on
                                    updateState(dev_id, 'left_state', false, {type: 'boolean', write: true});
                                } else if (pl == 1) { // left press with state off
                                    updateState(dev_id, 'left_state', true, {type: 'boolean', write: true});
                                }
                            }
                            if (devClassId == 256 && (epId == 5 || epId == 3)) { // right
                                if (pl == 0) { // right press with state on
                                    updateState(dev_id, 'right_state', false, {type: 'boolean', write: true});
                                } else if (pl == 1) { // right press with state off
                                    updateState(dev_id, 'right_state', true, {type: 'boolean', write: true});
                                }
                            }
                            if (devClassId == 0 && epId == 4) { // left pressed
                                if (pl == 0) { // down
                                    updateState(dev_id, 'left_click', false, {type: 'boolean'});
                                } else if (pl == 1) { // up
                                    updateState(dev_id, 'left_click', true, {type: 'boolean'});
                                } else if (pl == 2) { // double 
                                    updateState(dev_id, 'left_double_click', true, {type: 'boolean'});
                                }
                            } else if (devClassId == 0 && epId == 5) { // right pressed
                                if (pl == 0) { // down
                                    updateState(dev_id, 'right_click', false, {type: 'boolean'});
                                } else if (pl == 1) { // up
                                    updateState(dev_id, 'right_click', true, {type: 'boolean'});
                                } else if (pl == 2) { // double 
                                    updateState(dev_id, 'right_double_click', true, {type: 'boolean'});
                                }
                            } else if (devClassId == 0 && epId == 6) { // both pressed
                                if (pl == 0) { // down
                                    updateState(dev_id, 'both_click', false, {type: 'boolean'});
                                } else if (pl == 1) { // up
                                    updateState(dev_id, 'both_click', true, {type: 'boolean'});
                                } else if (pl == 2) { // double 
                                    updateState(dev_id, 'both_double_click', true, {type: 'boolean'});
                                }
                            }
                        }
                        break;
                    case 'msTemperatureMeasurement':  // Aqara Temperature/Humidity
                        updateState(dev_id, "temperature", parseFloat(msg.data.data['measuredValue']) / 100.0, {type: 'number', unit: 'º'});
                        break;
                    case 'msRelativeHumidity':
                        topic = "humidity";
                        pl = parseFloat(msg.data.data['measuredValue']) / 100.0;
                        break;
                    case 'msPressureMeasurement':
                        topic = "pressure";
                        pl = parseFloat(msg.data.data['16']) / 10.0;
                        break;
                    case 'msOccupancySensing': // motion sensor
                        if (msg.data.data['occupancy'] == 1) {
                            updateStateWithTimeout(dev_id, "occupancy", true, {type: 'boolean'}, 300, false);
                        }
                        break;
                    case 'msIlluminanceMeasurement':
                        topic = "illuminance";
                        pl = msg.data.data['measuredValue'];
                        break;
                    case 'genMultistateInput':
                        /*
                            +---+
                            | 2 |
                        +---+---+---+
                        | 4 | 0 | 1 |
                        +---+---+---+
                            |M5I|
                            +---+
                            | 3 |
                            +---+
                        Side 5 is with the MI logo, side 3 contains the battery door.

                        presentValue = 0 = shake
                        presentValue = 2 = wakeup 
                        presentValue = 3 = fly/fall
                        presentValue = y + x * 8 + 64 = 90º Flip from side x on top to side y on top
                        presentValue = x + 128 = 180º flip to side x on top
                        presentValue = x + 256 = push/slide cube while side x is on top
                        presentValue = x + 512 = double tap while side x is on top
                        */
                        var v = msg.data.data['presentValue'];
                        switch (true) {
                            case (v == 0):
                                updateStateWithTimeout(dev_id, 'shake', true, {type: 'boolean'}, 300, false);
                                break;
                            case (v == 2):
                                updateStateWithTimeout(dev_id, 'wakeup', true, {type: 'boolean'}, 300, false);
                                break;
                            case (v == 3):
                                updateStateWithTimeout(dev_id, 'fall', true, {type: 'boolean'}, 300, false);
                                break;
                            case (v >= 512): // double tap
                                updateStateWithTimeout(dev_id, 'tap', true, {type: 'boolean'}, 300, false);
                                updateState(dev_id, 'tap_side', v-512, {type: 'number'});
                                break;
                            case (v >= 256): // slide
                                updateStateWithTimeout(dev_id, 'slide', true, {type: 'boolean'}, 300, false);
                                updateState(dev_id, 'slide_side', v-256, {type: 'number'});
                                break;
                            case (v >= 128): // 180 flip
                                updateStateWithTimeout(dev_id, 'flip180', true, {type: 'boolean'}, 300, false);
                                updateState(dev_id, 'flip180_side', v-128, {type: 'number'});
                                break;
                            case (v >= 64): // 90 flip
                                updateStateWithTimeout(dev_id, 'flip90', true, {type: 'boolean'}, 300, false);
                                updateState(dev_id, 'flip90_from', Math.floor((v-64) / 8), {type: 'number'});
                                updateState(dev_id, 'flip90_to', v % 8, {type: 'number'});
                                break;
                        }
                        break;
                    case 'genAnalogInput':
                        /*
                        xiaomiAttr: 500, presentValue = rotation angel left < 0, rigth > 0
                        xiaomiAttr: 360, presentValue = ? angel
                        xiaomiAttr: 110, presentValue = ? angel 
                        xiaomiAttr: 420, presentValue = ? angel 
                        xiaomiAttr: 320, presentValue = ? angel 
                        xiaomiAttr: 330, presentValue = ? angel 
                        */
                        if (msg.data.data['xiaomiAttr'] == 500) {
                            var v = msg.data.data['presentValue'];
                            updateStateWithTimeout(dev_id, 'rotate', true, {type: 'boolean'}, 300, false);
                            updateState(dev_id, 'rotate_angel', v, {type: 'number', unit: 'º'});
                            if (v < 0) {
                                updateState(dev_id, 'rotate_dir', 'left');
                                
                            } else {
                                updateState(dev_id, 'rotate_dir', 'right');
                            }
                        }
                        break;
                }

                switch (true) {
                    case (dev.modelId == 'lumi.sensor_switch.aq2'): // WXKG11LM switch
                    case ((msg.endpoints[0].devId == 260) && (dev.modelId && dev.modelId.indexOf('lumi.sensor_magnet') < 0)): // WXKG01LM switch
                        if (msg.data.data['onOff'] == 0) { // click down
                            perfy.start(msg.endpoints[0].device.ieeeAddr); // start timer
                            pl = null; // do not send mqtt message
                        } else if (msg.data.data['onOff'] == 1) { // click release
                            if (perfy.exists(msg.endpoints[0].device.ieeeAddr)) { // do we have timer running
                                var clicktime = perfy.end(msg.endpoints[0].device.ieeeAddr); // end timer
                                if (clicktime.seconds > 0 || clicktime.milliseconds > 240) { // seems like a long press so ..
                                    //topic = topic.slice(0,-1) + '2'; //change topic to 2
                                    updateStateWithTimeout(dev_id, 'long_click', true, {type: 'boolean'}, 300, false);
                                    topic = topic + '_elapsed';
                                    //pl = clicktime.seconds + Math.floor(clicktime.milliseconds) + ''; // and payload to elapsed seconds
                                    pl = clicktime.seconds;
                                }
                            }
                        } else if (msg.data.data['32768']) { // multiple clicks
                            if (msg.data.data['32768'] == 2) {
                                updateStateWithTimeout(dev_id, 'double_click', true, {type: 'boolean'}, 300, false);
                            }
                        }
                }

                break;
            default:
                console.log(util.inspect(msg, false, null));
                // Not deal with other msg.type in this example
                break;
        }

        if (pl != null && topic) { // only publish message if we have not set payload to null
            adapter.log.info("dev "+dev_id+" model " + dev.modelId + " to " + topic + " value " + pl);
            updateState(dev_id, topic, pl);
            //updateDev(dev_id, dev.modelId, dev.modelId);
            //updateState(dev_id + '.' + topic, topic, pl);
        }
    });

    // start the server
    shepherd.start(function(err) {
        if (err) {
            adapter.setState('info.connection', false);
            adapter.log.error(err);
        }
    });

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    processMessages(true);
}
