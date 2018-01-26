/**
 *
 * Zigbee for Xiaomi devices adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
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

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.zont.0
var adapter = utils.adapter('zigbee');


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


function updateState(id, name, value, common) {
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
    //adapter.extendObject(id, {common: {name: dev_name}});
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
        adapter.getDevices((err, result) => {
            if (result) {
                adapter.log.info('getDevices result: ' + JSON.stringify(result));
                var devices = [];
                for (var item in result) {
                    var id = result[item]._id.substr(adapter.namespace.length + 1);
                    devices.push(result[item]);
                }
                adapter.sendTo(from, command, devices, callback);
              }
        });
    } else {
        adapter.sendTo(from, command, {error: 'You need save and run adapter before pairing!'}, callback);
    }
}


function newDevice(id){
    var dev = shepherd.find(id,1).getDevice();
    adapter.log.info('new dev '+dev.ieeeAddr + ' ' + dev.nwkAddr + ' ' + dev.modelId);
    updateDev(dev.ieeeAddr.substr(2), dev.modelId, dev.modelId);
}

function main() {
    var port = adapter.config.port || '/dev/ttyACM0';
    adapter.log.info('Start on port: ' + port);
    shepherd = new ZShepherd(port, {
        net: {
            panId: 0x1a62
        }
    });

    shepherd.on('permitJoining', function(joinTimeLeft) {
        onPermitJoining(joinTimeLeft);
    });

    shepherd.on('ready', function() {
        adapter.setState('info.connection', true);
        adapter.setObjectNotExists('info.pairingMode', {
            type: 'state',
            common: {name: 'Pairing mode'}
        }, {});
        adapter.setState('info.pairingMode', false);
        adapter.log.info('Server is ready. Current devices:');
        shepherd.list().forEach(function(dev){
            if (dev.type === 'EndDevice')
                adapter.log.info(dev.ieeeAddr + ' ' + dev.nwkAddr + ' ' + dev.modelId);
            if (dev.manufId === 4151) // set all xiaomi devices to be online, so shepherd won't try to query info from devices (which would fail because they go tosleep)
                shepherd.find(dev.ieeeAddr,1).getDevice().update({ status: 'online', joinTime: Math.floor(Date.now()/1000) });
        });
    });
    shepherd.on('ind', function(msg) {
        // debug('msg: ' + util.inspect(msg, false, null));
        var pl = null;
        var topic;
        var dev, dev_id;

        switch (msg.type) {
            case 'devIncoming':
                adapter.log.info('Device: ' + msg.data + ' joining the network!');
                newDevice(msg.data);
                break;
            case 'attReport':
                dev = msg.endpoints[0].device;
                adapter.log.info('attreport: ' + msg.endpoints[0].device.ieeeAddr + ' ' + msg.endpoints[0].devId + ' ' + msg.endpoints[0].epId + ' ' + util.inspect(msg.data, false, null));

                // defaults, will be extended or overridden based on device and message
                //topic += msg.endpoints[0].device.ieeeAddr.substr(2);
                dev_id = msg.endpoints[0].device.ieeeAddr.substr(2);
                pl=1;

                switch (msg.data.cid) {
                    case 'genBasic':
                        if (msg.data.data['65281']) {
                            var buf = new Buffer(msg.data.data['65281']);
                            adapter.log.info('65281: '+buf.toString('hex'));
                        }
                        break;
                    case 'genOnOff':  // various switches
                        //topic += '/' + msg.endpoints[0].epId;
                        topic = 'onOff';
                        pl = msg.data.data['onOff'];
                        break;
                    case 'msTemperatureMeasurement':  // Aqara Temperature/Humidity
                        topic = "temperature";
                        pl = parseFloat(msg.data.data['measuredValue']) / 100.0;
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
                        topic = "occupancy";
                        pl = msg.data.data['occupancy'];
                        break;
                    case 'msIlluminanceMeasurement':
                        topic = "illuminance";
                        pl = msg.data.data['measuredValue'];
                        break;
                }

                switch (true) {
                    case (dev.modelId == 'lumi.sensor_switch.aq2'): // WXKG11LM switch
                    case (msg.endpoints[0].devId == 260): // WXKG01LM switch
                        if (msg.data.data['onOff'] == 0) { // click down
                            perfy.start(msg.endpoints[0].device.ieeeAddr); // start timer
                            pl = null; // do not send mqtt message
                        } else if (msg.data.data['onOff'] == 1) { // click release
                            if (perfy.exists(msg.endpoints[0].device.ieeeAddr)) { // do we have timer running
                                var clicktime = perfy.end(msg.endpoints[0].device.ieeeAddr); // end timer
                                if (clicktime.seconds > 0 || clicktime.milliseconds > 240) { // seems like a long press so ..
                                    //topic = topic.slice(0,-1) + '2'; //change topic to 2
                                    topic = topic + '_elapsed';
                                    //pl = clicktime.seconds + Math.floor(clicktime.milliseconds) + ''; // and payload to elapsed seconds
                                    pl = clicktime.seconds;
                                }
                            }
                        } else if (msg.data.data['32768']) { // multiple clicks
                            pl = msg.data.data['32768'];
                        }
                }

                break;
            default:
                // console.log(util.inspect(msg, false, null));
                // Not deal with other msg.type in this example
                break;
        }

        if (pl != null && topic) { // only publish message if we have not set payload to null
            adapter.log.info("dev "+dev_id+" model " + dev.modelId + " to " + topic + " value " + pl);
            adapter.getObject(dev_id, function(err, obj) {
                if (obj) {
                    updateState(dev_id + '.' + topic, topic, pl);
                } else {
                    adapter.log.info('no device '+dev_id);
                }
            });
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
