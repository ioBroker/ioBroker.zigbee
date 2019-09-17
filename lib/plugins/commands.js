'use strict';

const getZbId = require('../utils').getZbId;
const statesMapping = require('../devstates');


class Commands {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on("message", this.onMessage.bind(this));
    }

    start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
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
                case 'letsPairing':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.letsPairing(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'getDevices':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.getDevices(obj.from, obj.command, obj.callback);
                    }
                    break;
                case 'getMap':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.getMap(obj.from, obj.command, obj.callback);
                    }
                    break;
                case 'renameDevice':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.renameDevice(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'deleteDevice':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.deleteDevice(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
            }
        }
    }

    letsPairing(from, command, message, callback) {
        if (this.zbController) {
            let devId = 'all';
            if (message && message.id) {
                devId = getZbId(message.id);
            }
            // allow devices to join the network within 60 secs
            this.adapter.logToPairing('Pairing started ' + devId, true);
            
            let cTimer = Number(this.adapter.config.countDown);
            if (!this.adapter.config.countDown || cTimer == 0) {
                cTimer = 60;
            }
    
            this.zbController.permitJoin(cTimer, devId, err => {
                if (!err) {
                    // set pairing mode on
                    this.adapter.setState('info.pairingMode', true);
                }
            });
            this.adapter.sendTo(from, command, 'Start pairing!', callback);
        } else {
            this.adapter.sendTo(
                from, command, 
                {error: 'You need to setup serial port and start the adapter before pairing!'}, 
                callback
            );
        }
    }

    getMap(from, command, callback) {
        if (this.zbController) {
            this.zbController.getMap((networkmap) => {
                this.adapter.log.debug('getMap result: ' + JSON.stringify(networkmap));
                this.adapter.sendTo(from, command, networkmap, callback);
            });
        }
    }
    
    async getDevices(from, command, callback) {
        if (this.zbController) {
            const pairedDevices = await this.zbController.getClients();
            const groups = {};
            let rooms;
            this.adapter.getEnumsAsync('enum.rooms')
                .then(enums => {
                    // rooms
                    rooms = enums['enum.rooms'];
                })
                .then(() => {
                    // get all adapter devices
                    return this.adapter.getDevicesAsync()
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
                                return this.adapter.getStateAsync(`${devInfo._id}.groups`)
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
                        const id = getZbId(devInfo._id);
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
                        devInfo.info = this.zbController.getDevice(id);
                        devInfo.paired = !!devInfo.info;
                        devInfo.groups = groups[devInfo._id];
                        devices.push(devInfo);
                    });
                    return devices;
                })
                .then(devices => {
                    // append devices that paired but not created
                    pairedDevices.forEach((device) => {
                        const exists = devices.find((dev) => device.ieeeAddr === getZbId(dev._id));
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
                    this.debug('getDevices result: ' + JSON.stringify(devices));
                    this.adapter.sendTo(from, command, devices, callback);
                })
                .catch(err => {
                    this.error('getDevices error: ' + err.stack);
                });
        } else {
            this.adapter.sendTo(from, command, {error: 'You need save and run adapter before pairing!'}, callback);
        }
    }
    
    renameDevice(from, command, msg, callback) {
        if (this.stController) {
            const id = msg.id, newName = msg.name;
            this.stController.renameDevice(id, newName);
            this.adapter.sendTo(from, command, {}, callback);
        }
    }

    deleteDevice(from, command, msg, callback) {
        if (this.zbController && this.stController) {
            this.debug('deleteDevice message: ' + JSON.stringify(msg));
            const id = msg.id, sysid = id.replace(this.adapter.namespace + '.', '0x'),
                devId = id.replace(this.adapter.namespace + '.', '');
            this.debug('deleteDevice sysid: ' + sysid);
            const dev = this.zbController.getDevice(sysid);
            if (!dev) {
                this.debug('Not found on shepherd!');
                this.debug('Try delete dev ' + devId + ' from iobroker.');
                this.stController.deleteDeviceStates(devId, () => {
                    this.adapter.sendTo(from, command, {}, callback);
                });
                return;
            }
            this.zbController.remove(sysid, err => {
                if (!err) {
                    this.debug('Successfully removed from shepherd!');
                    this.stController.deleteDeviceStates(devId, () => {
                        this.adapter.sendTo(from, command, {}, callback);
                    });
                } else {
                    this.debug('Error on remove! ' + err);
                    this.debug('Try force remove!');
                    this.zbController.forceRemove(sysid, err => {
                        if (!err) {
                            this.debug('Force removed from shepherd!');
                            this.debug('Try delete dev ' + devId + ' from iobroker.');
                            this.stController.deleteDeviceStates(devId, () => this.adapter.sendTo(from, command, {}, callback));
                        } else {
                            this.adapter.sendTo(from, command, {error: err}, callback);
                        }
                    });
                }
            });
        } else {
            this.adapter.sendTo(from, command, {error: 'You need to save and start the adapter!'}, callback);
        }
    }
}

module.exports = Commands;