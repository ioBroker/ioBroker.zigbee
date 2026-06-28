'use strict';

const { getZbId, getNetAddress, reverseByteString, zbIdorIeeetoAdId, adIdtoZbIdorIeee } = require('./utils');
const fs = require('fs');
const localConfig = require('./localConfig.js');
const colors = require('./colors.js');
const path = require('node:path');
/* currently not needed, kept for referencce
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const dns = require('dns');
const net = require('net');
const access = fs.access;
const constants = fs.constants;
*/

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
                            this.adapter.sendTo(obj.from, obj.command, await this.adapter.getCoordinatorInfo(), obj.callback);
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
            const name = path.join(zo.dbDir, zo.backupPath);
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
                const name = path.join(zo.dbDir, zo.backupPath);
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

    async getDevices(from, command, id, callback) {
        //this.warn(`getDevices called from  ${from} with command ${JSON.stringify(command)}${id ? ' and id '+JSON.stringify(id) : ' without ID'}`);
        if (!(this.zbController && this.zbController.herdsmanStarted)) {
            this.adapter.sendTo(from, command, {error: 'No active connection to Zigbee Hardware!'}, callback);
            return;
        }
        const devInfo = await this.adapter.getDeviceInformation(id)
        const rv = { devices:devInfo.deviceObjects,
            inLog:this.adapter.deviceDebug.logStatus,
            adapterOptions:localConfig.AdapterOptions,
        }
        if (!id) {
            rv.deviceDebugData = this.adapter.deviceDebug.collectDebugData();
            rv.localOverrides = this.adapter.stController.localConfig.localData;
            rv.models = devInfo.models.byUID;
        }

        if (this.stController) {
            rv.clean = this.stController.CleanupRequired();
            rv.errors = this.stController.getStashedErrors();
            rv.debugDevices = this.stController.debugDevices;
        }
        this.adapter.sendTo(from, command, rv, callback);

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
                const objDelete = await this.stController.deleteObj(devId);
                if (!objDelete.status) this.adapter.sendTo(from, command, {error: objDelete.message}, callback);
                else this.adapter.sendTo(from, command, {}, callback);
                return;
            }
            this.info(`${force ? 'Force removing' : 'Gracefully removing '} device ${devId} from the network.`);

            const result = {};
            const devDelete = await this.zbController.remove(sysid, force);
            if (devDelete.status || force) {
                const objDelete = await this.stController.deleteObj(devId);
                if (!objDelete.status) {
                    result.error = objDelete.message;
                }
            }
            else {
                result.error = devDelete.error;
            }
            this.adapter.sendTo(from, command, result, callback);
        } else {
            this.adapter.sendTo(from, command, {error: 'No active connection to Zigbee Hardware!'}, callback);
        }
    }

    async cleanDeviceStates(from, command, force, callback) {
        this.info(`State cleanup ${force ? 'including' : 'omitting'} states with custom configuration`);
        const devicesFromDB = await this.zbController.getClientIterator(false);
        const groupsFromDb = await this.zbController.getGroups();
        const messages = [];
        this.stController.CleanupRequired(false);

        for (const device of devicesFromDB) {
            const entity = await this.zbController.resolveEntity(device);

            if (entity) {
                const model = (entity.mapped) ? entity.mapped.model : entity.device.modelID;
                this.stController.deleteOrphanedDeviceStates(device.ieeeAddr, model, force, (msg)=> { messages.push(msg)});
            }
        }
        try {
            for (const group of groupsFromDb) {
                this.stController.deleteOrphanedDeviceStates(group.id, 'group', force, (msg)=> { messages.push(msg)});
            }
        }
        catch (error) {
            this.error(`error checking groups for deletable states: ${error?.message}`);
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
            this.zbController.setDeviceDisabled(id, targetstate);
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
                    await this.stController.updateDev(target, entity.name, entity.mapped.model)
                }
                else {
                    await this.stController.updateDev(target, undefined, 'group');
                }
                this.adapter.sendTo(from, command, {imageData:result}, callback);
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
            if (msg.data)
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
                    await this.stController.updateDev(target, entity.name, entity.mapped.model);
                    this.adapter.sendTo(from, command, {}, callback);
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
            const result = await this.zbController.reconfigure(getZbId(msg.id))
            if (result.error) this.error(result.error);
            this.adapter.sendTo(from, command, result , callback);
            /*
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
            */
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
            if (client.native.modelIcon && client.common.icon && client.native.modelIcon.startsWith('http')) {
                const filestatus = await this.adapter.fileExistsAsync(this.adapter.namespace, client.common.icon);
                if (!filestatus)
                    Promises.push(this.stController.downloadIconToAdmin(client.native.modelIcon, client.common.icon));
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
