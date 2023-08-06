'use strict';

const getZbId = require('./utils').getZbId;
const statesMapping = require('./devices');
const disallowedDashStates = [
    'link_quality', 'available', 'battery', 'groups', 'device_query',
    'hue_move', 'color_temp_move', 'satuation_move', 'brightness_move', 'brightness_step', 'hue_calibration',
    'msg_from_zigbee', 'send_payload',
];

class Commands {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', obj => this.onMessage(obj));
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

    warn(msg) {
        this.adapter.log.warn(msg);
    }

    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'letsPairing':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.letsPairing(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'touchlinkReset':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.touchlinkReset(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'getDevices':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.getDevices(obj.from, obj.command, null, obj.callback);
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
                case 'getChannels':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.getChannels(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'getCoordinatorInfo':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.getCoordinatorInfo(obj.from, obj.command, obj.callback);
                    }
                    break;
                case 'cleanDeviceStates':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.cleanDeviceStates(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'setState':
                    if (obj && obj.message && typeof obj.message === 'object' && obj.message.id) {
                        //                        this.adapter.setState(obj.message.id, obj.message.val, false, obj.callback);
                        this.stController.setState_typed(obj.message.id, obj.message.val, false, undefined, obj.callback);
                    }
                    break;
                case 'getDevice':
                    if (obj && obj.message && typeof obj.message === 'object' && obj.message.id) {
                        this.getDevices(obj.from, obj.command, obj.message.id, obj.callback);
                    }
                    break;
                case 'reconfigure':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.reconfigure(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'setDeviceActivated':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.setDeviceActivated(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;

            }
        }
    }

    async letsPairing(from, command, message, callback) {
        if (this.zbController) {
            let devId = '';
            if (message) {
                if (message.id) devId = getZbId(message.id);
                if (message.code) {
                    try {
                        this.debug(`letsPairing called with code ${message.code}`);
                        const success = await this.zbController.addPairingCode(message.code);
                        if (!success) {
                            this.adapter.sendTo(
                                from, command,
                                {error: 'Pairing code rejected by Coordinator!'},
                                callback
                            );
                            return;
                        }
                    }
                    catch (e) {
                        this.error(JSON.stringify(e));
                        this.adapter.sendTo(
                            from, command,
                            {error: 'Exception when trying to add QR code'},
                            callback
                        );
                        return;

                    }
                }
            }
            // allow devices to join the network within 60 secs
            this.adapter.logToPairing('Pairing started ' + devId, true);

            let cTimer = Number(this.adapter.config.countDown);
            if (!this.adapter.config.countDown || !cTimer) {
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

    touchlinkReset(from, command, message, callback) {
        if (this.zbController) {
            // allow devices to join the network within 60 secs
            this.adapter.logToPairing('Touchlink reset started ', true);

            let cTimer = Number(this.adapter.config.countDown);
            if (!this.adapter.config.countDown || !cTimer) {
                cTimer = 60;
            }

            this.zbController.touchlinkReset(cTimer);
            this.adapter.sendTo(from, command, 'Start touchlink reset and pairing!', callback);
        } else {
            this.adapter.sendTo(
                from, command,
                {error: 'You need to setup serial port and start the adapter before pairing!'},
                callback
            );
        }
    }

    async getDevices(from, command, id, callback) {
        if (this.zbController) {
            const pairedDevices = await this.zbController.getClients(true);
            const groups = {};
            let rooms;
            this.adapter.getEnumsAsync('enum.rooms')
                .then(enums => {
                    // rooms
                    rooms = enums['enum.rooms'];
                })
                // get all adapter devices
                .then(() => this.adapter.getDevicesAsync())
                .then(async result => {
                    const alls = id ? await this.adapter.getStatesAsync(id + '.*') : await this.adapter.getStatesAsync('*');
                    const allst = id ? await this.adapter.getStatesOfAsync(id) : await this.adapter.getStatesOfAsync();
                    result = result.filter(item => !id || id === item._id);
                    // get device states and groups
                    result.forEach(async devInfo => {
                        if (devInfo._id) {
                            // groups
                            // const grState = alls[`${devInfo._id}.groups`];
                            // if (grState && grState.val) {
                            //     groups[devInfo._id] = JSON.parse(grState.val);
                            // }
                            // battery and link_quality
                            const lqState = alls[`${devInfo._id}.link_quality`];
                            devInfo.link_quality = lqState ? lqState.val : undefined;
                            devInfo.link_quality_lc = lqState ? lqState.lc : undefined;
                            const batState = alls[`${devInfo._id}.battery`];
                            devInfo.battery = batState ? batState.val : undefined;
                            // devInfo.states = states || {};

                            const states = allst.filter(item => item._id.startsWith(devInfo._id));

                            // put only allowed states
                            devInfo.statesDef = (states || []).filter(stateDef => {
                                const sid = stateDef._id;
                                const name = sid.split('.').pop();
                                return !disallowedDashStates.includes(name);

                            }).map(stateDef => {
                                const name = stateDef.common.name;
                                const devname = devInfo.common.name;
                                // replace state
                                return {
                                    id: stateDef._id,
                                    name: typeof name === 'string' ? name.replace(devname, '') : name,
                                    type: stateDef.common.type,
                                    read: stateDef.common.read,
                                    write: stateDef.common.write,
                                    val: alls[stateDef._id] ? alls[stateDef._id].val : undefined,
                                    role: stateDef.common.role,
                                    unit: stateDef.common.unit,
                                    states: stateDef.common.states,
                                };
                            });
                        }
                    });
                    return result;
                })
                .then(async result => {
                    // combine info
                    const devices = [];
                    for (const devInfo of result) {
                        if (devInfo._id.indexOf('group') > 0) {
                            devInfo.icon = 'img/group.png';
                            devInfo.vendor = 'ioBroker';
                            // get group members and store them
                            const match = /zigbee.\d.group_([0-9]+)/.exec(devInfo._id);
                            if (match && match.length > 1) {
                                const groupmembers = await this.zbController.getGroupMembersFromController(match[1]);
                                this.debug(`group members: ${JSON.stringify(groupmembers)}`);
                                if (groupmembers && groupmembers.length > 0) {
                                    const memberinfo = [];
                                    for (const member of groupmembers) {
                                        if (groups) {
                                            const grouparray = groups[member.ieee];
                                            if (grouparray) {
                                                if (!grouparray.includes(match[1])) {
                                                    groups[member.ieee].push(match[1]);
                                                }
                                            } else {
                                                groups[member.ieee] = [match[1]];
                                            }
                                        }
                                        const device = await this.adapter.getObjectAsync(`${this.adapter.namespace}.${member.ieee.substr(2)}`);
                                        if (device) {
                                            member.device = device.common.name;
                                        } else {
                                            member.device = 'unknown';
                                        }
                                        memberinfo.push(member);
                                    }
                                    devInfo.memberinfo = memberinfo;
                                    this.debug(`memberinfo for ${match[1]}: ${JSON.stringify(devInfo.memberinfo)}`);
                                }
                            }
                        } else {
                            const modelDesc = statesMapping.findModel(devInfo.common.type);
                            devInfo.icon = (modelDesc && modelDesc.icon) ? modelDesc.icon : 'img/unknown.png';
                            devInfo.vendor = modelDesc ? modelDesc.vendor : '';
                        }

                        const id = getZbId(devInfo._id);
                        devInfo.info = await this.zbController.resolveEntity(id);

                        devInfo.rooms = [];
                        for (const room in rooms) {
                            if (!rooms.hasOwnProperty(room) ||
                                !rooms[room] ||
                                !rooms[room].common ||
                                !rooms[room].common.members
                            ) {
                                continue;
                            }
                            if (rooms[room].common.members.includes(devInfo._id)) {
                                devInfo.rooms.push(rooms[room].common.name);
                            }
                        }
                        devInfo.paired = !!devInfo.info;
                        //                        devInfo.groups = groups[devInfo._id];
                        devices.push(devInfo);
                    }
                    return devices;
                })
                .then(async (devices) => {
                    // fill group info
                    for (const groupdev in groups) {
                        //this.debug(`GetDevices scanning group ${groupdev} ${JSON.stringify(groups[groupdev])}`);
                        const device = devices.find(dev => (groupdev === getZbId(dev._id)));
                        if (device) {
                            device.groups = groups[groupdev];
                            //this.debug(`adding group info to device ${groupdev}`);
                        }
                    }
                    // append devices that paired but not created
                    if (!id) {
                        for (const d of pairedDevices) {
                            const device = await this.zbController.resolveEntity(d.ieeeAddr);
                            if (!device) {
                                continue;
                            }
                            const exists = devices.find((dev) => (dev._id && device.device.ieeeAddr === getZbId(dev._id)));
                            if (!exists) {
                                devices.push({
                                    _id: device.device.ieeeAddr,
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
                        }
                    }
                    return devices;
                })
                .then(devices => {
                    this.debug(`getDevices result: ${JSON.stringify(devices)}`);
                    this.adapter.sendTo(from, command, devices, callback);
                })
                .catch(err => this.error(`getDevices error: ${err.stack}`));
        } else {
            this.adapter.sendTo(from, command, {error: 'You need save and run adapter before pairing!'}, callback);
        }
    }


    async getCoordinatorInfo(from, command, callback) {
        if (this.zbController) {
            const coordinatorinfo = {
                installSource: 'IADefault_1',
                channel: '-1',
                port: 'Default_1',
                installedVersion: 'Default_1',
                type: 'Default_1',
                revision: 'Default_1',
                version: '9-9.9.9.9'
            };

            const coordinatorVersion = await this.adapter.zbController.herdsman.getCoordinatorVersion();

            await this.adapter.getForeignObject(`system.adapter.${this.adapter.namespace}`, (err, obj) => {
                if (!err && obj) {
                    if (obj.common.installedFrom && obj.common.installedFrom.includes('://')) {
                        const instFrom = obj.common.installedFrom;
                        coordinatorinfo.installSource = instFrom.replace('tarball', 'commit');
                    } else {
                        coordinatorinfo.installSource = obj.common.installedFrom;
                    }
                }
                try {
                    coordinatorinfo.port = obj.native.port;
                    coordinatorinfo.channel = obj.native.channel;
                    coordinatorinfo.installedVersion = obj.native.version;
                    if (coordinatorVersion && coordinatorVersion.type && coordinatorVersion.meta) {
                        coordinatorinfo.type = coordinatorVersion.type;
                        const meta = coordinatorVersion.meta;
                        if (meta) {
                            if (meta.hasOwnProperty('revision')) {
                                coordinatorinfo.revision = meta.revision;
                            }
                            let vt = 'x-';
                            if (meta.hasOwnProperty('transportrev')) {
                                vt = meta.transportrev + '-';
                            }
                            if (meta.hasOwnProperty('product')) {
                                vt = vt + meta.product + '.';
                            } else {
                                vt = vt + 'x.';
                            }
                            if (meta.hasOwnProperty('majorrel')) {
                                vt = vt + meta.majorrel + '.';
                            } else {
                                vt = vt + 'x.';
                            }
                            if (meta.hasOwnProperty('minorrel')) {
                                vt = vt + meta.minorrel + '.';
                            } else {
                                vt = vt + 'x.';
                            }
                            if (meta.hasOwnProperty('maintrel')) {
                                vt = vt + meta.maintrel + '.';
                            } else {
                                vt = vt + 'x.';
                            }
                            coordinatorinfo.version = vt;
                        }
                    }
                } catch {
                    this.warn('exception raised in getCoordinatorInfo');
                }

                this.debug(`getCoordinatorInfo result: ${JSON.stringify(coordinatorinfo)}`);
                this.adapter.sendTo(from, command, coordinatorinfo, callback);
            });
        } else {
            this.adapter.sendTo(from, command, {error: 'You need save and run adapter before pairing!'}, callback);
        }
    }


    renameDevice(from, command, msg, callback) {
        if (this.stController) {
            const id = msg.id;
            const newName = msg.name;
            this.stController.renameDevice(id, newName);
            this.adapter.sendTo(from, command, {}, callback);
        }
    }

    deleteDevice(from, command, msg, callback) {
        if (this.zbController && this.stController) {
            this.debug(`deleteDevice message: ${JSON.stringify(msg)}`);
            const id = msg.id;
            const force = msg.force;
            const sysid = id.replace(this.adapter.namespace + '.', '0x');
            const devId = id.replace(this.adapter.namespace + '.', '');
            this.debug(`deleteDevice sysid: ${sysid}`);
            const dev = this.zbController.getDevice(sysid);
            if (!dev) {
                this.debug('Not found!');
                this.debug(`Try delete dev ${devId} from iobroker.`);
                this.stController.deleteDeviceStates(devId, () =>
                    this.adapter.sendTo(from, command, {}, callback));
                return;
            }
            this.zbController.remove(sysid, force, err => {
                if (!err) {
                    this.stController.deleteDeviceStates(devId, () =>
                        this.adapter.sendTo(from, command, {}, callback));
                } else {
                    this.debug(`Error on remove! ${err}`);
                    this.adapter.sendTo(from, command, {error: err}, callback);
                }
            });
        } else {
            this.adapter.sendTo(from, command, {error: 'You need to save and start the adapter!'}, callback);
        }
    }

    async cleanDeviceStates(from, command, msg, callback) {
        this.info(`State cleanup with ${JSON.stringify(msg)}`);
        const devicesFromDB = await this.zbController.getClients(false);
        for (const device of devicesFromDB) {
            const entity = await this.zbController.resolveEntity(device);
            if (entity) {
                const model = (entity.mapped) ? entity.mapped.model : entity.device.modelID;
                await this.stController.deleteOrphanedDeviceStates(device.ieeeAddr, model, msg.force);
            }
        }
        this.adapter.sendTo(from, command, {}, callback);
    }

    async getChannels(from, command, message, callback) {
        if (this.zbController) {
            const result = await this.zbController.getChannelsEnergy();
            this.debug(`getChannels result: ${JSON.stringify(result)}`);
            this.adapter.sendTo(from, command, result, callback);
        } else {
            this.adapter.sendTo(
                from, command,
                {error: 'You need to setup serial port and start the adapter before pairing!'},
                callback
            );
        }
    }

    async setDeviceActivated(from, command, msg, callback) {
        if (this.stController) {
            const id = msg.id;
            const targetstate = msg.deactivated;
            this.stController.setDeviceActivated(id, targetstate);
            this.adapter.sendTo(from, command, {}, callback);
        }
    }

    async reconfigure(from, command, msg, callback) {
        if (this.zbController) {
            const devid = getZbId(msg.id);
            this.debug(`Reconfigure ${devid}`);
            const entity = await this.zbController.resolveEntity(devid);
            if (entity) {
                try {
                    await this.zbController.callExtensionMethod(
                        'doConfigure',
                        [entity.device, entity.mapped],
                    );
                    this.adapter.sendTo(from, command, {}, callback);
                } catch (error) {
                    const errmsg = `Reconfigure failed ${entity.device.ieeeAddr} ${entity.device.modelID}, (${error.stack})`;
                    this.error(errmsg);
                    this.adapter.sendTo(from, command, {error: errmsg}, callback);
                }
            } else {
                this.adapter.sendTo(from, command, {error: 'No device'}, callback);
            }
        }
    }
}

module.exports = Commands;
