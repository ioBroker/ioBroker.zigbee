'use strict';

const { getZbId, getNetAddress, reverseByteString, zbIdorIeeetoAdId, adIdtoZbIdorIeee } = require('./utils');
const fs = require('fs');
const modelDefinitions = require('./models.js');
const colors = require('./colors.js');
/* currently not needed, kept for referencce
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const dns = require('dns');
const net = require('net');
const access = fs.access;
const constants = fs.constants;
*/
const disallowedDashStates = [
    'link_quality', 'available', 'battery', 'groups', 'device_query',
    'hue_move', 'color_temp_move', 'satuation_move', 'brightness_move', 'brightness_step', 'hue_calibration',
    'msg_from_zigbee', 'send_payload',
];

class Commands {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', obj => this.onMessage(obj));
        this.devicesDeleting = new Set();
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
    async onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            if (obj) {
                switch (obj.command) {
                    case 'testConnect':
                        this.adapter.sendTo(obj.from, obj.command, await this.adapter.testConnect(obj.message), obj.callback);
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
                    case 'deleteZigbeeDevice':
                        if (obj.message && typeof obj.message === 'object') {
                            this.deleteZigbeeDevice(obj.from, obj.command, obj.message, obj.callback);
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
                    case 'modifyDeviceStates':
                        if (obj.message && typeof obj.message === 'object') {
                            if (obj.message.action == 'clean')
                                return this.cleanDeviceStates(obj.from, obj.command, obj.message.force, obj.callback);
                            if (obj.message.action == 'rebuild')
                                return this.rebuildDeviceStates(obj.from, obj.command, obj.message.force, obj.callback);
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
                            this.updateConfigItems(obj.from, obj.command, obj.message, obj.callback);
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
                        this.adapter.sendTo(obj.from, obj.command, {byId:this.adapter.deviceDebug.collectDebugData( obj.message.inlog, obj.message.del )},obj.callback);
                        break;
                    case 'testConnection':
                        this.testConnection(obj.from, obj.command, obj.message, obj.callback);
                        break;
                    case 'readNVRam':
                        this.readNvBackup(obj.from, obj.command, obj.message, obj.callback);
                        break;
                    case 'downloadIcons':
                        this.triggerIconDownload(obj);
                        break;
                    case 'aliveCheck':
                        this.adapter.sendTo(obj.from, obj.command, {msg:'success'}, obj.callback);
                        break;
                    case 'clearErrors':
                        this.adapter.sendTo(obj.from, obj.command, this.stController.clearStashedErrors(), obj.callback);
                        break;
                    default:
                        this.debug(`Commands: Command ${obj.command} is unknown`);
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
            //this.error(msg);
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
        if (this.zbController && this.zbController.herdsmanStarted) {
            let devId = '';
            if (message) {
                if (message.id && message.id != undefined) {
                    devId = getZbId(message.id);
                }
                if (typeof devId == 'number') {
                    this.adapter.sendTo(
                        from, command,
                        {error: 'Pairing on a group is not supported'},
                        callback
                    );
                    return;
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
            if (message.stop) cTimer = 0;

            if (await this.zbController.permitJoin(cTimer, devId)) {
                this.adapter.setState('info.pairingMode', cTimer > 0, true);
                if (cTimer != 0 && this.stController) {
                    this.stController.resetKnownUnknownModels();
                }
                //this.adapter.sendTo(from, command, cTimer ? 'Start pairing!':'Stop pairing!', callback);
            }
            else {
                this.adapter.sendTo(
                    from, command,
                    {error: 'Error opening the network'},
                    callback
                );
            }
        }
        else {
            this.adapter.sendTo(
                from, command,
                {error: 'No connection to zigbee Hardware!'},
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

    async handleGroupforInfo(group, groups) {
        group.icon = 'img/group_1.png';
        group.vendor = 'ioBroker';
        // get group members and store them
        const match = /zigbee.\d.group_([0-9]+)/.exec(group._id);
        if (match && match.length > 1) {
            const groupID = Number(match[1]);
            const groupmembers = await this.zbController.getGroupMembersFromController(groupID);
            this.debug(`group members for group ${groupID}: ${JSON.stringify(groupmembers)}`);
            if (groupmembers && groupmembers.length > 0) {
                const memberinfo = [];
                for (const member of groupmembers) {
                    if (member && typeof member.ieee === 'string') {
                        const memberId = zbIdorIeeetoAdId(this.adapter, member.ieee, false);
                        const device = await this.adapter.getObjectAsync(zbIdorIeeetoAdId(this.adapter, member.ieee, true));
                        const item = groups[memberId] || { groups:[], gep: { }};
                        const gep = item.gep[member.epid] || [];

                        if (!item.groups.includes(groupID)) item.groups.push(groupID);
                        if (!gep.includes(`${groupID}`)) gep.push(`${groupID}`);
                        item.gep[member.epid] = gep;
                        groups[memberId] = item;
                        memberinfo.push({
                            ieee:member.ieee,
                            epid:member.epid,
                            model:member.model,
                            device:device? device.common.name:'unknown'
                        });
                    }
                }
                group.memberinfo = memberinfo;
                this.debug(`memberinfo for ${match[1]}: ${JSON.stringify(group.memberinfo)}`);
            }
        }
    }

    async fillInfo(device, entity, device_stateDefs, all_states, models) {
        device.statesDef = (device_stateDefs || []).filter(stateDef => {
            const sid = stateDef._id.replace(this.adapter.namespace + '.', '');
            const names = sid.split('.');
            if (stateDef.common.color || names.length > 2) return false;
            return !disallowedDashStates.includes(names.pop());
        }).map(stateDef => {
            const name = stateDef.common.name;
            const devname = device.common.name;
            // replace state
            return {
                id: stateDef._id,
                name: typeof name === 'string' ? name.replace(devname, '') : name,
                type: stateDef.common.type,
                read: stateDef.common.read,
                write: stateDef.common.write,
                val: all_states[stateDef._id] ? all_states[stateDef._id].val : undefined,
                role: stateDef.common.role,
                unit: stateDef.common.unit,
                states: stateDef.common.states,
            };
        });


        device.info = this.buildDeviceInfo(entity);

        const UID = models.UIDbyModel[device.info?.mapped?.model || 'unknown'] || `m_${Object.keys(models.UIDbyModel).length}`;
        if (models.byUID.hasOwnProperty(UID)) {
            models.byUID[UID].devices.push(device);
        }
        else {
            models.byUID[UID] = {
                model:device.info.mapped,
                availableOptions : [...device.info?.mapped?.options || [], ...['use_legacy_model']],
                setOptions: this.adapter.stController.localConfig.getByModel(device.info?.mapped?.model || 'unknown') || [],
                devices: [device],
            };
            if (!models.byUID[UID].model.type)
                models.byUID[UID].model.type = 'Group';
            models.UIDbyModel[device.info?.mapped?.model || 'unknown'] = UID;
        }
        // check configuration
        try {
            if (device.info) {
                const result = await this.zbController.callExtensionMethod(
                    'shouldConfigure',
                    [device.info.device, device.info.mapped],
                );
                if (result.length > 0) device.isConfigured = !result[0];
                device.paired = true;
            } else device.paired = false;
        } catch (error) {
            this.warn('error calling shouldConfigure: ' + error && error.message ? error.message : 'no error message');
        }
    }

    buildDeviceInfo(entity) {
        function getKey(object, value) {
            try {
                for (const key of Object.keys(object)) {
                    if (object[key] == value) {
                        return key;
                    }
                }
            }
            catch {
                return undefined;
            }
            return undefined;

        }

        function haveBindableClusters(clusters) {
            const nonBindableClusters = [25,33, 4096]
            if (Array.isArray(clusters)) {
                return (clusters.filter((candidate) => !nonBindableClusters.includes(candidate)).length > 0);
            }
            return false;
        }
        const rv = {};
        try {
            rv.device = {
                modelZigbee:entity.device.modelID,
                type:entity.device.type,
                ieee:entity.device.ieeeAddr || entity.device.groupID,
                nwk:entity.device.networkAddress || 0,
                manuf_id:entity.device.maufacturerID,
                manuf_name:entity.device.manufacturerName,
                manufacturer:entity.mapped?.vendor,
                power:entity.device.powerSource,
                app_version:entity.device.applicationVersion,
                hard_version:entity.device.hardwareVersion,
                zcl_version:entity.device.zclVersion,
                stack_version:entity.device.stack_version,
                date_code:entity.device.dateCode,
                build:entity.device.softwareBuildID,
                interviewstate:entity.device.interviewState || 'UNKNOWN',
                BindSource: false,
                isGroupable: false,
            }
            rv.endpoints = [];
            let dBindSource = false;
            let disGroupable = false;
            for (const ep_idx in entity.endpoints) {
                const ep = entity.endpoints[ep_idx];
                const bindable = haveBindableClusters(ep.outputClusters);
                dBindSource |= bindable;
                rv.endpoints.push({
                    ID:ep.ID,
                    epName: entity.mapped?.endpoint ? getKey(entity.mapped?.endpoint(entity.device), ep.ID) : ep.ID,
                    profile:ep.profileID,
                    input_clusters:ep.inputClusters,
                    output_clusters:ep.outputClusters,
                    BindSource: Boolean(bindable),
                })
                disGroupable |= ep.inputClusters.includes(4);
            }
            rv.device.isGroupable = Boolean(disGroupable);
            rv.device.BindSource = Boolean(dBindSource);
            if (entity.mapped) {
                rv.mapped = {
                    model:entity.mapped.model,
                    type:entity.device.type,
                    description:entity.mapped.description,
                    hasLegacyDef:modelDefinitions.hasLegacyDevice(entity.mapped.model),
                    //fingerprint:JSON.stringify(device.mapped.fingerprint),
                    vendor:entity.mapped.vendor,
                    hasOnEvent:entity.mapped.onEvent != undefined,
                    hasConfigure:entity.mapped.configure != undefined,
                    icon:`img/${entity.mapped.model.replace(/\//g, '-')}.png`,
                    legacyIcon: modelDefinitions.getIconforLegacyModel(entity.mapped.model),
                    options:[],
                }
                if (entity.mapped.options && typeof (entity.mapped.options == 'object')) {
                    rv.mapped.optionExposes = entity.mapped.options;
                    for (const option of entity.mapped.options) {
                        if (option.name) {
                            rv.mapped.options.push(option.name);
                        }
                    }
                }
            }
            else {
                rv.mapped = {
                    model:entity.name,
                    type: entity.device.type,
                    description:entity.name,
                    vendor:'not set',
                    hasOnEvent: false,
                    hasConfigure: false,
                    options:[],
                }
            }
        }
        catch (error) {
            if (entity && entity.name === 'Coordinator') return rv;
            const dev = entity ? entity.device || {} : {}
            const msg = entity ? `device ${entity.name} (${dev.ieeeAddr}, NWK ${dev.networkAddres}, ID: ${dev.ID})` : 'undefined device';
            this.warn(`Error ${error && error.message ? error.message + ' ' : ''}building device info for ${msg}`);
        }
        return rv;
    }

    async appendDevicesWithoutObjects(devices, client) {
        const entity = await this.zbController.resolveEntity(client.ieeeAddr);
        if (!entity || !entity.device) {
            return;
        }
        const exists = devices.find((dev) => (dev._id && entity.device.ieeeAddr === getZbId(dev._id)));
        if (!exists) {
            const coordinatorData = {
                _id : `${this.adapter.namespace}.${entity.device.ieeeAddr.substring(2)}`,
                paired: true,
                info: this.buildDeviceInfo(entity),
                native: { id: entity.device.ieeeAddr.substring(2) },
                mapped : { model: client.modelID || client.type || 'NotSet' },
                statesDev: [],
            }
            if (entity.name === 'Coordinator') {
                coordinatorData.icon = 'zigbee.png';
                coordinatorData.common = { name: 'Coordinator', type: 'Coordinator'  };
            } else {
                coordinatorData.common = { name: entity.mapped?.model || 'unknown', type: entity.type  };
                coordinatorData.icon= 'img/unknown.png';
            }
            devices.push(coordinatorData);
        }
    }

    async getDevices(from, command, id, callback) {
        this.debug(`getDevices called from  ${from} with command ${JSON.stringify(command)}${id ? ' and id '+JSON.stringify(id) : ' without ID'}`);
        if (!(this.zbController && this.zbController.herdsmanStarted)) {
            this.adapter.sendTo(from, command, {error: 'No active connection to Zigbee Hardware!'}, callback);
            return;
        }
        const roomsEnum = await this.adapter.getEnumsAsync('enum.rooms') || {};
        const deviceObjects = (id ? [await this.adapter.getObjectAsync(id)] : await this.adapter.getDevicesAsync());
        const all_states = id ? await this.adapter.getStatesAsync(id + '.*') : await this.adapter.getStatesAsync('*');
        const all_stateDefs = id ? await this.adapter.getStatesOfAsync(id) : await this.adapter.getStatesOfAsync();

        const illegalDevices = [];
        const groups = {};
        const PromiseChain = [];
        const models = { byUID : {}, UIDbyModel: {} };
        for (const deviceObject of deviceObjects) {
            const id = getZbId(deviceObject._id);
            const entity = await this.zbController.resolveEntity(id);
            if (deviceObject._id.indexOf('group') > -1) {
                PromiseChain.push(this.handleGroupforInfo(deviceObject, groups));
            }
            else {
                const modelDesc = await modelDefinitions.findModel(deviceObject.common.type, entity?.device, deviceObject.common.UUID, entity?.mapped?.legacy);
                deviceObject.icon = (modelDesc?.icon) ? modelDesc.icon : 'img/unknown.png';
                if (modelDesc?.vendor) deviceObject.vendor = modelDesc.vendor;
                deviceObject.legacyIcon = modelDefinitions.getIconforLegacyModel(deviceObject.common.type);
                const lq_state = all_states[`${deviceObject._id}.link_quality`];
                deviceObject.link_quality = lq_state ? lq_state.val : -1;
                deviceObject.link_quality_lc = lq_state ? lq_state.lc : undefined;
                const battery_state = all_states[`${deviceObject._id}.battery`];
                deviceObject.battery = battery_state ? battery_state.val : undefined;

            }
            deviceObject.rooms = [];
            const rooms = roomsEnum['enum.rooms'] || {};
            for (const room of Object.keys(rooms)) {
                if (!rooms.hasOwnProperty(room) ||
                    !rooms[room] ||
                    !rooms[room].common ||
                    !rooms[room].common.members
                ) {
                    continue;
                }
                if (rooms[room].common.members.includes(deviceObject._id)) {
                    deviceObject.rooms.push(rooms[room].common.name);
                }
            }
            PromiseChain.push(this.fillInfo(deviceObject, entity, all_stateDefs.filter(item => item._id.startsWith(deviceObject._id)),all_states, models));
        }
        if (!id) {
            for (const client of this.zbController.getClientIterator(true)) {
                PromiseChain.push(this.appendDevicesWithoutObjects(deviceObjects,client))
            }
        }

        await Promise.all(PromiseChain);

        for (const groupmember in groups) {
            const device = deviceObjects.find(dev => (groupmember === dev.native.id));
            if (device) {
                device.groups = groups[groupmember].groups;
                device.groups_by_ep = groups[groupmember].gep;
            }
        }


        this.debug(`getDevices contains ${deviceObjects.length} Devices`);
        const rv = { devices:deviceObjects, inLog:this.adapter.deviceDebug.logStatus, }
        if (!id) {
            rv.deviceDebugData = this.adapter.deviceDebug.collectDebugData();
            rv.localOverrides = this.adapter.stController.localConfig.localData;
            rv.models = models.byUID;
        }

        if (this.stController) {
            rv.clean = this.stController.CleanupRequired();
            rv.errors = this.stController.getStashedErrors();
            rv.debugDevices = this.stController.debugDevices;
        }
        this.adapter.sendTo(from, command, rv, callback);

    }

    async getCoordinatorInfo(from, command, callback) {
        const coordinatorinfo = {
            installSource: 'IADefault_1',
            channel: '-1',
            port: 'Default_1',
            installedVersion: 'Default_1',
            type: 'Default_1',
            revision: 'unknown',
            version: 'unknown',
            herdsman: this.adapter.zhversion,
            converters: this.adapter.zhcversion,
        };

        const coordinatorVersion =  this.zbController && this.zbController.herdsmanStarted ? await this.adapter.zbController.herdsman.getCoordinatorVersion() : {};

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
                coordinatorinfo.type = obj.native.adapterType;
                coordinatorinfo.channel = obj.native.channel;
                coordinatorinfo.autostart = this.adapter.config.autostart;
                coordinatorinfo.installedVersion = obj.common.version;
                if (coordinatorVersion && coordinatorVersion.type && coordinatorVersion.meta) {
                    coordinatorinfo.type = coordinatorVersion.type;
                    const meta = coordinatorVersion.meta;
                    if (typeof meta == 'object') {
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
                    else {
                        coordinatorinfo.version = 'illegal data';
                        coordinatorinfo.revision = 'illegal data';
                    }
                }
                else {
                    coordinatorinfo.version = this.adapter.config.autostart ? 'not connected' : 'autostart not set';
                    coordinatorinfo.revision = this.adapter.config.autostart ? 'not connected' : 'autostart not set';

                }
            } catch {
                this.warn('exception raised in getCoordinatorInfo');
            }

            this.debug(`getCoordinatorInfo result: ${JSON.stringify(coordinatorinfo)}`);
            this.adapter.sendTo(from, command, coordinatorinfo, callback);
        });
    }


    renameDevice(from, command, msg, callback) {
        if (this.stController) {
            const id = msg.id;
            const newName = msg.name;
            this.stController.renameDevice(id, newName);
            this.adapter.sendTo(from, command, {}, callback);
        }
    }

    async deleteZigbeeDevice(from, command, msg, callback) {
        if (this.zbController && this.zbController.herdsmanStarted && this.stController) {
            this.debug(`deleteZigbeeDevice message: ${JSON.stringify(msg)}`);
            const id = msg.id;
            const force = msg.force;
            const sysid = id.startsWith(this.adapter.namespace) ?  id.replace(this.adapter.namespace + '.', '0x') : `0x${id}`;
            const devId = id.replace(this.adapter.namespace + '.', '');
            this.debug(`deleteZigbeeDevice sysid: ${sysid}`);
            const dev = this.zbController.getDevice(sysid);
            if (!dev) {

                this.info(`Attempted to delete device ${devId} - the device is not known to the zigbee controller.`);
                const err = await this.stController.deleteObj(devId);
                if (err != '') this.adapter.sendTo(from, command, {errror:err}, callback);
                else this.adapter.sendTo(from, command, {}, callback);
                return;
            }
            this.info(`${force ? 'Force removing' : 'Gracefully removing '} device ${devId} from the network.`);
            /*

            // if with force, remove device and object in parallel;
            const PromiseArr = [ this.zbController.remove(sysid, force) ]
            if (force) PromiseArr.push( this.stController.deleteObj(devId));

            const results = await Promise.all(PromiseArr);
            const msgs = [];
            for (const result of results) {
                if (!result.status) msgs.push(result.message ? result.message : 'failed without message');
            }
            if (msgs.length == 0 && !force) {
                const result = await this.stController.deleteObj(devId);
                if (!result.status) msgs.push(result.message ? result.message : 'failed without message');
            }

            const removeResult = this.zbController.remove(sysid, force);
            if (removeResult.status || force) {
                this.info('Device removed from the network, deleting objects.')

            }
            */
            this.zbController.remove(sysid, force, async (err) => {
                if (!err) {
                    this.info('Device removed from the network, deleting objects.')
                    if (!force) {
                        const err = await this.stController.deleteObj(devId);
                        if (err == '') this.adapter.sendTo(from, command, {}, callback);
                        else this.adapter.sendTo(from, command, {error:err}, callback);
                    }
                    this.adapter.sendTo(from, command, {}, callback);
                    if (msg.dev) this.adapter.stController.localConfig.removeLocalData(devId, msg.model);
                } else {
                    this.adapter.sendTo(from, command, {error: err}, callback);
                }
            });
            if (force) {
                const err = await this.stController.deleteObj(devId);
                if (err != '') this.adapter.sendTo(from, command, {errror:err}, callback);
                else this.adapter.sendTo(from, command, {}, callback);
            }
        } else {
            this.adapter.sendTo(from, command, {error: 'No active connection to Zigbee Hardware!'}, callback);
        }
    }

    async cleanDeviceStates(from, command, force, callback) {
        this.info(`State cleanup ${force ? 'including' : 'omitting'} states with custom configuration`);
        const devicesFromDB = await this.zbController.getClients(false);
        const messages = [];
        this.stController.CleanupRequired(false);

        for (const device of devicesFromDB) {
            const entity = await this.zbController.resolveEntity(device);

            if (entity) {
                const model = (entity.mapped) ? entity.mapped.model : entity.device.modelID;
                this.stController.deleteOrphanedDeviceStates(device.ieeeAddr, model, force, (msg)=> { messages.push(msg)});
            }
        }
        this.adapter.sendTo(from, command, {stateList: messages}, callback);
    }

    async rebuildDeviceStates(from, command, force, callback) {
        this.info(`State cleanup ${force ? 'with' : 'without'} overriding changed roles`);
        await this.adapter.syncAllDeviceStates(force);
        this.adapter.sendTo(from, command, {}, callback);
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
            this.zbController.setDeviceEnable(id, targetstate);
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

    async updateConfigItems(from, command, msg, callback) {
        if (this.stController) {
            this.debug(`updateConfigItems : ${JSON.stringify(msg)}`);
            if (msg == {}) {
                this.adapter.sendTo(from, command, {}, callback);
                return;
            }
            const target = msg.target ? msg.target.replace(`${this.adapter.namespace}.`, '') : '';
            const entity = await this.zbController.resolveEntity(target);
            if (msg.data);
            {
                for (const prop in msg.data) {
                    if (prop==='options') {
                        // we need to trigger the option change
                        // first: retrieve the global options.
                        const newOptions = {};
                        const globalOptions = this.stController.localConfig.getLocalOverride(target, entity?.mapped?.model || '', prop, true)?.options;
                        if (globalOptions) {
                            for (const key of Object.keys(entity.options)) {
                                if (globalOptions[key] != undefined)
                                    newOptions[key] = globalOptions[key];
                            }
                        }
                        for (const key of Object.keys(msg.data.options)) {
                            newOptions[key]= msg.data.options[key];
                        }
                        if (entity && entity.device) {
                            this.zbController.callExtensionMethod(
                                'onZigbeeEvent',
                                [{'device': entity.device, 'type': 'deviceOptionsChanged', from: entity.options, to:newOptions  || {}, }, entity.mapped]);
                        }
                    }
                    this.debug(`enumerating data: ${JSON.stringify(prop)}`);
                    let val = msg.data[prop];
                    if (typeof val === 'string') {
                        val = val.trim();
                        if (val.length < 1) val = '##REMOVE##';
                    }
                    await this.stController.localConfig.updateLocalOverride(target, target, prop, val, msg.global);
                }
                await this.stController.localConfig.retainData();
            }
            try {
                if (entity) {
                    this.debug('updateLocalConfigItems with Entity');
                    this.stController.updateDev(target, entity.mapped.model, entity.mapped.model, () => {this.adapter.sendTo(from, command, {}, callback)});
                }
                else {
                    // try to see if it is a model -> find the devices for that model
                    const devicesFromObjects = (await this.adapter.getDevicesAsync()).filter(item => item.common.type === target).map((item) => item.native.id);
                    for (const device of devicesFromObjects) {
                        await this.stController.updateDev(device, target, target);
                    }

                }
            }
            catch (error) {
                this.adapter.sendTo(from, command, {err: error.message}, callback);
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
                if (msg.getAllData) {
                    this.adapter.sendTo(from, command, this.stController.localConfig.localData, callback);
                }
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
        const result = await this.adapter.testConnection(msg.address, true);
        if (result.error) {
            this.error(result.error);
            this.adapter.logToPairing(`Error: ${result.error}`)
        }
        this.adapter.sendTo(from, command, result, callback);
    }

    async triggerIconDownload(obj) {
        if (!this.stController) {
            this.adapter.sendTo(obj.from, obj.command, {msg:'No States controller'}, obj.callback);
            return;
        }
        const clients = await this.adapter.getDevicesAsync();
        const Promises = [];
        for (const client of clients) {
            if (client.common.modelIcon && client.common.icon && client.common.modelIcon.startsWith('http')) {
                const filestatus = await this.adapter.fileExistsAsync(this.adapter.namespace, client.common.icon);
                if (!filestatus)
                    Promises.push(this.stController.downloadIconToAdmin(client.common.modelIcon, client.common.icon))
            }

        }
        const NumDownloads = Promises.length;
        if (NumDownloads) {
            this.adapter.sendTo(obj.from, obj.command, {msg:`${NumDownloads} downloads triggered.`}, obj.callback);
            Promise.all(Promises);
        }
        else {
            this.adapter.sendTo(obj.from, obj.command, {msg:'Nothing to download'}, obj.callback);
        }

    }
}

module.exports = Commands;
