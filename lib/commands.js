'use strict';

const getZbId = require('./utils').getZbId;
const getNetAddress = require('./utils').getNetAddress;
const reverseByteString = require('./utils').reverseByteString;
const fs = require('fs');
const statesMapping = require('./devices');
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const colors = require('./colors.js');
const dns = require('dns');
const net = require('net');
const { access, constants } =require('fs');

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
            if (obj) {
                switch (obj.command) {
                    case 'testConnect':
                        this.adapter.testConnect(obj.from, obj.command, obj.message, obj.callback);
                        break;
                    case 'deleteNVBackup':
                        this.delNvBackup(obj.from, obj.command, {}, obj.callback);
                        break;
                    case 'letsPairing':
                        if (obj.message && typeof obj.message === 'object') {
                            this.letsPairing(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'touchlinkReset':
                        if (obj.message && typeof obj.message === 'object') {
                            this.touchlinkReset(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'getDevices':
                        if (obj.message && typeof obj.message === 'object') {
                            this.getDevices(obj.from, obj.command, null, obj.callback);
                        }
                        break;
                    case 'renameDevice':
                        if (obj.message && typeof obj.message === 'object') {
                            this.renameDevice(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'deleteDevice':
                        if (obj.message && typeof obj.message === 'object') {
                            this.deleteDevice(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'getChannels':
                        if (obj.message && typeof obj.message === 'object') {
                            this.getChannels(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'getCoordinatorInfo':
                        if (obj.message && typeof obj.message === 'object') {
                            this.getCoordinatorInfo(obj.from, obj.command, obj.callback);
                        }
                        break;
                    case 'cleanDeviceStates':
                        if (obj.message && typeof obj.message === 'object') {
                            this.cleanDeviceStates(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'setState':
                        if (obj.message && typeof obj.message === 'object' && obj.message.id) {
                            this.stController.setState_typed(obj.message.id, obj.message.val, false, undefined, obj.callback);
                        }
                        break;
                    case 'getDevice':
                        if (obj.message && typeof obj.message === 'object' && obj.message.id) {
                            this.getDevices(obj.from, obj.command, obj.message.id, obj.callback);
                        }
                        break;
                    case 'reconfigure':
                        if (obj.message && typeof obj.message === 'object') {
                            this.reconfigure(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'setDeviceActivated':
                        if (obj.message && typeof obj.message === 'object') {
                            this.setDeviceActivated(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'setDeviceDebug':
                        if (obj.message && typeof obj.message === 'object') {
                            this.toggleDeviceDebug(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'getDebugDevices':
                        if (obj.message && typeof obj.message === 'object') {
                            this.getDebugDevices(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'getNamedColors':
                        if (obj.message && typeof obj.message === 'object') {
                            const val = colors.getColorNames();
                            this.adapter.sendTo(obj.from, obj.command, {colors: val}, obj.callback);
                        }
                        break;

                    case 'getLocalImages':
                        if (obj.message && typeof obj.message === 'object') {
                            this.getLocalImages(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'updateDeviceImage':
                        if (obj.message && typeof obj.message === 'object') {
                            this.updateDeviceImage(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'updateLocalConfigItems':
                        if (obj.message && typeof obj.message === 'object') {
                            this.updateLocalConfigItems(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'getLocalConfigItems':
                        if (obj.message && typeof obj.message === 'object') {
                            this.getLocalConfigItems(obj.from, obj.command, obj.message, obj.callback);
                        }
                        break;
                    case 'getDeviceCleanupRequired':
                        if (this.stController) this.adapter.sendTo(obj.from, obj.command, {clean:this.stController.CleanupRequired(), errors:this.stController.getStashedErrors()}, obj.callback);
                        // NO Break - returning the debug-data as well is intentional
                    case 'getDebugMessages':
                        this.adapter.sendTo(obj.from, obj.command, {byId:this.adapter.deviceDebug.collectDebugData( obj.message.inlog)},obj.callback);
                        break;
                    case 'testConnection':
                        this.testConnection(obj.from, obj.command, obj.message, obj.callback);
                        break;
                    case 'readNVRam':
                        this.readNvBackup(obj.from, obj.command, obj.message, obj.callback);
                    default:
                        //this.warn(`Commands: Command ${obj.command} is unknown`);
                        //this.adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
                        break;
                }
            }
        }
    }

    async readNvBackup(from, command, msg, callback) {
        this.debug('readNvBackup called')
        try {
            const zo = this.adapter.getZigbeeOptions();
            const name = require('path').join(zo.dbDir, zo.backupPath);
            const nvbackup = fs.readFileSync(name, {encoding: 'utf8'}).toString();
            const nvBackupJson = JSON.parse(nvbackup);
            const rv = {};
            rv.channel = nvBackupJson.channel;
            rv.precfgkey = (nvBackupJson.network_key ? nvBackupJson.network_key.key : undefined);
            rv.extPanID = nvBackupJson.extended_pan_id ? reverseByteString(nvBackupJson.extended_pan_id) : undefined;
            rv.panID = parseInt('0x'+nvBackupJson.pan_id);
            this.debug('readNvBackup returns ' + JSON.stringify(rv))
            this.adapter.sendTo(from, command, rv, callback)
        }
        catch (error) {
            const msg = `Unable to read nvBackup ${error && error.message ? error.message : 'no message given'}`;
            this.error(msg);
            this.adapter.sendTo(from, command, {error:msg}, callback)
        }
    }

    async delNvBackup(from, command, msg, callback) {
        try {
            if (this.zbController)
            {
                // stop the herdsman if needed
                const wasRunning = this.zbController.herdsmanStarted;
                if (wasRunning) await this.zbController.stop();
                const name = this.zbController.herdsman.adapter.backupPath;
                fs.unlink(name, async (err) => {
                    const rv={};
                    if (err) {
                        this.error(`Unable to remove ${name}: ${err}`);
                        rv.error = `Unable to remove ${name}: ${err}`;
                    }
                    // start the herdsman again if it  was stopped before
                    if (wasRunning) await this.zbController.start();
                    this.adapter.sendTo(from, command, rv, callback)
                });
            }
            else {
                const zo = this.adapter.getZigbeeOptions();
                const name = require('path').join(zo.dbDir, zo.backupPath);
                fs.unlink(name, async (err) => {
                    const rv={};
                    if (err) {
                        this.error(`Unable to remove ${name}: ${err}`);
                        rv.error = `Unable to remove ${name}: ${err}`;
                    }
                    // start the herdsman again if it  was stopped before
                    this.adapter.sendTo(from, command, rv, callback)
                });
            }
        } catch (error) {
            this.adapter.sendTo(from, command, {error: error.message}, callback)
            this.error(error);
        }
    }

    async letsPairing(from, command, message, callback) {
        if (this.zbController) {
            let devId = '';
            if (message) {
                if (message.id && message.id != undefined) {
                    devId = getZbId(message.id);
                }
                if (message.code && message.code != undefined) {
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
            // this.adapter.logToPairing('Pairing started ' + devId, true);

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
        if (this.zbController && this.zbController.herdsmanStarted) {
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
                {error: 'No active connection to Zigbee Hardware!'},
                callback
            );
        }
    }

    async getDevices(from, command, id, callback) {
        if (this.zbController && this.zbController.herdsmanStarted) {
            this.debug(`getDevices called from  ${from} with command ${JSON.stringify(command)} and id ${JSON.stringify(id)}`);
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
                                const sid = stateDef._id.replace(this.adapter.namespace + '.', '');
                                const names = sid.split('.');
                                if (stateDef.common.color || names.length > 2) return false;
                                return !disallowedDashStates.includes(names.pop());

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
                                const groupID = Number(match[1]);
                                const groupmembers = await this.zbController.getGroupMembersFromController(groupID);
                                this.debug(`group members for group ${groupID}: ${JSON.stringify(groupmembers)}`);
                                if (groupmembers && groupmembers.length > 0) {
                                    const memberinfo = [];
                                    for (const member of groupmembers) {
                                        if (groups) {
                                            const grouparray = groups[member.ieee];
                                            if (grouparray) {
                                                if (!grouparray.includes(groupID)) {
                                                    groups[member.ieee].push(groupID);
                                                }
                                            } else {
                                                groups[member.ieee] = [groupID];
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
                            const legacyDesc = statesMapping.findModel(devInfo.common.type, true);
                            devInfo.legacyIcon = (legacyDesc && legacyDesc.icon) ? legacyDesc.icon : undefined;
                        }

                        const id = getZbId(devInfo._id);
                        devInfo.info = await this.zbController.resolveEntity(id);
                        // check configuration
                        try {
                            if (devInfo.info) {
                                const result = await this.zbController.callExtensionMethod(
                                    'shouldConfigure',
                                    [devInfo.info.device, devInfo.info.mapped],
                                );
                                if (result.length > 0) devInfo.isConfigured = !result[0];
                            }
                        } catch (error) {
                            this.warn('error calling shouldConfigure: ' + error && error.message ? error.message : 'no error message');
                        }

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
                        devices.push(devInfo);
                    }
                    return devices;
                })
                .then(async (devices) => {
                    // fill group info
                    for (const groupdev in groups) {
                        const device = devices.find(dev => (groupdev === getZbId(dev._id)));
                        if (device) {
                            device.groups = groups[groupdev];
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
                    this.debug(`getDevices contains ${devices.length} Devices`);
                    const rv = { devices:devices, inLog:this.adapter.deviceDebug.logStatus, byId:this.adapter.deviceDebug.collectDebugData() }
                    if (this.stController) {
                        rv.clean = this.stController.CleanupRequired();
                        rv.errors = this.stController.getStashedErrors();
                        rv.debugDevices = this.stController.debugDevices;
                    }
                    this.adapter.sendTo(from, command, rv, callback);
                })
                .catch(err => {
                    this.error(`getDevices error: ${err.stack}`);
                    this.adapter.sendTo(from, command, {error: `Error enumerating devices : ${err && err.message ? err.message : ''}`}, callback);
                });
        } else {
            this.adapter.sendTo(from, command, {error: 'No active connection to Zigbee Hardware!'}, callback);
        }
    }


    async getCoordinatorInfo(from, command, callback) {
        if (this.zbController && this.zbController.herdsmanStarted) {
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
            this.adapter.sendTo(from, command, {error: 'No active connection to Zigbee Hardware!'}, callback);
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
        if (this.zbController && this.zbController.herdsmanStarted && this.stController) {
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
                this.stController.deleteObj(devId, () =>
                    this.adapter.sendTo(from, command, {}, callback));
                return;
            }
            this.zbController.remove(sysid, force, err => {
                if (!err) {
                    this.stController.deleteObj(devId, () =>
                        this.adapter.sendTo(from, command, {}, callback));
                } else {
                    this.debug(`Error on remove! ${err}`);
                    this.adapter.sendTo(from, command, {error: err}, callback);
                }
            });
        } else {
            this.adapter.sendTo(from, command, {error: 'No active connection to Zigbee Hardware!'}, callback);
        }
    }

    async cleanDeviceStates(from, command, msg, callback) {
        this.info(`State cleanup with ${JSON.stringify(msg)}`);
        const devicesFromDB = await this.zbController.getClients(false);
        const messages = [];
        this.stController.CleanupRequired(false);

        for (const device of devicesFromDB) {
            const entity = await this.zbController.resolveEntity(device);

            if (entity) {
                const model = (entity.mapped) ? entity.mapped.model : entity.device.modelID;
                this.stController.deleteOrphanedDeviceStates(device.ieeeAddr, model, msg.force, (msg)=> { messages.push(msg)});
            }
        }
        // rebuild retainDeviceNamesDB
        //this.stController.rebuildRetainDeviceNames();
        this.adapter.sendTo(from, command, {stateList: messages}, callback);
    }

    async getChannels(from, command, message, callback) {
        if (this.zbController && this.zbController.herdsmanStarted) {
            const result = await this.zbController.getChannelsEnergy();
            this.debug(`getChannels result: ${JSON.stringify(result)}`);
            this.adapter.sendTo(from, command, result, callback);
        } else {
            this.adapter.sendTo(
                from, command,
                {error: 'No active connection to Zigbee Hardware!'},
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

    async toggleDeviceDebug(from, command, msg, callback) {
        if (this.stController) {
            const id = msg.id;
            const result = await this.stController.toggleDeviceDebug(id);
            this.adapter.sendTo(from, command, {debugDevices:result}, callback)
        }
    }

    async getDebugDevices(from, command, msg, callback) {
        if (this.stController) {
            this.stController.getDebugDevices((debugDevices) => this.adapter.sendTo(from, command, {debugDevices:debugDevices}, callback));
        }
    }


    async getLocalImages(from, command, msg, callback) {
        if (this.stController) {
            const id = msg.id;
            const result = await this.stController.localConfig.enumerateImages(this.adapter.getDataFolder());
            this.adapter.sendTo(from, command, {imageData:result}, callback)
        }
    }

    async updateDeviceImage(from, command, msg, callback) {
        if (this.stController) {
            this.debug(`UpdateDeviceImage : ${JSON.stringify(msg)}`)
            const target = msg.global ? msg.target : msg.target.replace(`${this.adapter.namespace}.`, '')
            const result = await this.stController.localConfig.updateLocalOverride(target, 'icon', msg.image, msg.global);
            if (msg.name) {
                this.stController.localConfig.updateLocalOverride(target, 'name', msg.name, msg.global);
            }
            if (!msg.global) {
                const entity = await this.zbController.resolveEntity(`0x${target}`);
                if (entity) {
                    this.stController.updateDev(target, entity.mapped.model, entity.mapped.model, () => {this.adapter.sendTo(from, command, {imageData:result}, callback)});
                }
                else {
                    this.stController.updateDev(target, undefined, 'group',() => {this.adapter.sendTo(from, command, {imageData:result}, callback)});
                }
            }
            else {
                //this.error(JSON.stringify(result));
                this.adapter.sendTo(from, command, {imageData:result}, callback);
            }
        }
    }

    async updateLocalConfigItems(from, command, msg, callback) {
        if (this.stController) {
            this.debug(`updateLocalConfigItems : ${JSON.stringify(msg)}`);
            const target = msg.global ? msg.target : msg.target.replace(`${this.adapter.namespace}.`, '');
            const entity = await this.zbController.resolveEntity(target);
            //this.warn('entity for ' + target + ' is '+ JSON.stringify(entity))
            if (entity && !entity.mapped) {
                this.warn('unable to set local Override for device whithout mapped model');
                return;
            }
            if (msg.data)
            {
                for (const prop in msg.data) {
                    this.debug('enumerating data: ' + prop);
                    await this.stController.localConfig.updateLocalOverride(target, (entity ? entity.mapped.model : 'group'), prop, msg.data[prop], msg.global);
                }
            }
            if (entity) {
                this.debug('updateLocalConfigItems with Entity');
                this.stController.updateDev(target, entity.mapped.model, entity.mapped.model, () => {this.adapter.sendTo(from, command, {}, callback)});
            }
            else {
                this.debug('updateLocalConfigItems without Entity');
                this.stController.updateDev(target, undefined, 'group',() => {this.adapter.sendTo(from, command, {}, callback)});
            }
        }
    }

    async getLocalConfigItems(from, command, msg, callback)
    {
        const rv = {};
        if (this.stController) {
            this.debug(`getLocalConfigItems : ${JSON.stringify(msg)}`)

            if (msg.hasOwnProperty('global') && msg.hasOwnProperty('target') && (msg.hasOwnProperty('keys') || msg.hasOwnProperty('key')))
            {
                const target = msg.global ? msg.target : msg.target.replace(`${this.adapter.namespace}.`, '');
                const keys = msg.hasOwnProperty('keys') ? msg.keys : [msg.key];
                for (const key of keys) {
                    const ld = this.stController.localConfig.getOverrideWithTargetAndKey(target, key, msg.global);
                    if (ld != undefined) rv[key] = ld;
                }

                //const targetId = msg.id ? msg.id.replace(`${this.adapter.namespace}.`, '') : '';
                //const targetModel = msg.model ? msg.model : '';
            }
            else {
                rv.error = `missing data in message ${JSON.stringify(msg)}`;
            }
        }
        else rv.error = 'stController not initialized - no Data sent'

        this.adapter.sendTo(from, command, rv, callback);
    }

    async reconfigure(from, command, msg, callback) {
        if (this.zbController && this.zbController.herdsmanStarted) {
            const devid = getZbId(msg.id);
            this.debug(`Reconfigure ${devid}`);
            const entity = await this.zbController.resolveEntity(devid);
            if (entity) {
                try {
                    const result = await this.zbController.callExtensionMethod(
                        'doConfigure',
                        [entity.device, entity.mapped],
                    );
                    const msg = result.join(',');
                    if (msg.length > 5)
                        this.adapter.sendTo(from, command, {error: msg}, callback);
                    else
                        this.adapter.sendTo(from, command, {}, callback);

                } catch (error) {
                    const errmsg = `Reconfigure failed ${entity.device.ieeeAddr} ${entity.device.modelID}, (${error.message})`;
                    this.error(errmsg);
                    this.adapter.sendTo(from, command, {error: errmsg}, callback);
                }
            } else {
                this.adapter.sendTo(from, command, {error: 'No device'}, callback);
            }
        }
        else {
            this.adapter.sendTo(from, command, {error: 'No active connection to Zigbee Hardware!'}, callback);
        }
    }

    async testConnection(from, command, msg, callback) {
        this.debug(`TestConnection with ${JSON.stringify(msg)}`);
        if (msg && msg.address) {
            const netAddress = getNetAddress(msg.address);
            if (netAddress && netAddress.host) {
                this.adapter.logToPairing(`attempting dns lookup for ${netAddress.host}`);
                this.debug(`attempting dns lookup for ${netAddress.host}`);
                dns.lookup(netAddress.host, (err, ip, _) => {
                    if (err) {
                        const msg = `Unable to resolve name: ${err && err.message ? err.message : 'no message'}`;
                        this.error(msg);
                        this.adapter.logToPairing(`Error: ${msg}`);
                        this.adapter.sendTo(from, command, {error:msg}, callback);
                        return;
                    }
                    this.debug(`dns lookup for ${msg.address} produced ${ip}`);
                    this.adapter.logToPairing(`dns lookup for ${msg.address} produced ${ip}`);
                    const client = new net.Socket();
                    this.debug(`attempting to connect to ${ip} port ${netAddress.port ? netAddress.port : 80}`);
                    client.connect(netAddress.port, ip, () => {
                        client.destroy()
                        this.adapter.logToPairing(`connected successfully to connect to ${ip} port ${netAddress.port ? netAddress.port : 80}`);
                        this.debug(`connected successfully to connect to ${ip} port ${netAddress.port ? netAddress.port : 80}`);
                        this.adapter.sendTo(from, command, {}, callback)
                    })
                    client.on('error', (error) => {
                        const msg = `unable to connect to ${ip} port ${netAddress.port ? netAddress.port : 80} : ${error && error.message ? error.message : 'no message given'}`
                        this.error(msg);
                        this.adapter.logToPairing(`Error: ${msg}`);
                        this.adapter.sendTo(from, command, {error:msg}, callback);
                    });
                })
            }
            else
            {
                try {
                    const port = msg.address.trim();
                    this.adapter.logToPairing(`reading access rights for ${port}`);
                    access(port, constants.R_OK | constants.W_OK, (error) => {
                        if (error) {
                            const msg = `unable to access ${port} : ${error && error.message ? error.message : 'no message given'}`;
                            this.error(msg);
                            this.adapter.logToPairing(`Error: ${msg}`);
                            this.adapter.sendTo(from, command, {error:msg}, callback);
                            return;
                        }
                        this.adapter.logToPairing(`read and write access available for ${port}`);
                        this.adapter.sendTo(from, command, {}, callback);
                    });
                }
                catch (error) {
                    const msg = `File access error: ${error && error.message ? error.message : 'no message given'}`;
                    this.error(msg);
                    this.adapter.logToPairing(`Error: ${msg}`);
                    this.adapter.sendTo(from, command, {error:msg}, callback);
                }
            }
        }
    }
}

module.exports = Commands;
