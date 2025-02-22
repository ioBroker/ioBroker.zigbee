'use strict';

const EventEmitter = require('events').EventEmitter;
const statesMapping = require('./devices');
const getAdId = require('./utils').getAdId;
const getZbId = require('./utils').getZbId;
const fs = require('fs');
const axios = require('axios');
const localConfig = require('./localConfig');
const { deviceAddCustomCluster } = require('zigbee-herdsman-converters/lib/modernExtend');
const { setDefaultAutoSelectFamilyAttemptTimeout } = require('net');


class StatesController extends EventEmitter {
    constructor(adapter) {
        super();
        this.adapter = adapter;
        this.adapter.on('stateChange', this.onStateChange.bind(this));
        this.query_device_block = [];
        this.debugDevices = undefined;
        this.retTimeoutHandle = null;
        this.localConfig = new localConfig(adapter);
        this.compositeData = {};
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

    warn(message, data) {
        this.emit('log', 'warn', message, data);
    }

    sendError(error, message) {
        this.adapter.sendError(error, message);
    }

    async getDebugDevices(callback) {
        if (this.debugDevices === undefined) {
            this.debugDevices = [];
            const state = await this.adapter.getStateAsync(`${this.adapter.namespace}.info.debugmessages`);
            if (state) {
                if (typeof state.val === 'string' && state.val.length > 2) {
                    this.debugDevices = state.val.split(';');
                }
                this.info(`debug devices set to ${JSON.stringify(this.debugDevices)}`);
                if (callback) callback(this.debugDevices);
            }
        } else {
            // this.info(`debug devices was already set to ${JSON.stringify(this.debugDevices)}`);
            callback(this.debugDevices)
        }
    }

    async toggleDeviceDebug(id) {
        const arr = /zigbee.[0-9].([^.]+)/gm.exec(id);
        if (arr[1] === undefined) {
            this.warn(`unable to extract id from state ${id}`);
            return [];
        }
        const stateKey = arr[1];
        if (this.debugDevices === undefined) this.debugDevices = await this.getDebugDevices()
        const idx = this.debugDevices.indexOf(stateKey);
        if (idx < 0) this.debugDevices.push(stateKey);
        else this.debugDevices.splice(idx, 1);
        await this.adapter.setStateAsync(`${this.adapter.namespace}.info.debugmessages`, this.debugDevices.join(';'), true);
        this.info('debug devices set to ' + JSON.stringify(this.debugDevices));
        return this.debugDevices;
    }

    checkDebugDevice(dev) {
        if (typeof dev != 'string' || dev == '') return false;
        if (this.debugDevices === undefined) {
            this.getDebugDevices();
        }
        else
        {
            for (const addressPart of this.debugDevices) {
                if (typeof dev === 'string' && dev.includes(addressPart)) {
                    return true;
                }
            }
        }
        return false;
    }

    onStateChange(id, state) {
        if (!this.adapter.zbController || !this.adapter.zbController.connected()) {
            return;
        }
        if (state && !state.ack) {
            if (id.endsWith('pairingCountdown') || id.endsWith('pairingMessage') || id.endsWith('connection')) {
                return;
            }
            if (id.endsWith('debugmessages')) {
                if (typeof state.val === 'string' && state.val.length > 2) {
                    this.debugDevices = state.val.split(';');
                } else {
                    this.debugDevices = [];
                }
                this.info('debug devices set to ' + JSON.stringify(this.debugDevices));
                return;
            }

            if (this.checkDebugDevice(id))
                this.warn(`ELEVATED O01: User state change of state ${id} with value ${state.val} (ack: ${state.ack}) from ${state.from}`);

            this.debug(`User stateChange ${id} ${JSON.stringify(state)}`);
            const devId = getAdId(this.adapter, id); // iobroker device id
            let deviceId = getZbId(id); // zigbee device id
            // const stateKey = id.split('.')[3];
            const arr = /zigbee.[0-9].[^.]+.(\S+)/gm.exec(id);
            if (arr[1] === undefined) {
                this.warn(`unable to extract id from state ${id}`);
                return;
            }
            const stateKey = arr[1];
            this.adapter.getObject(devId, (err, obj) => {
                if (obj) {
                    const model = obj.common.type;
                    if (!model) {
                        return;
                    }
                    if (obj.common.deactivated) {
                        this.debug('State Change detected on deactivated Device - ignored');
                        return;
                    }
                    if (model === 'group') {
                        const match = deviceId.match(/group_(\d+)/gm);
                        if (match) {
                            deviceId = parseInt(match[1]);
                            this.publishFromState(deviceId, model, stateKey, state, {});
                            return;
                        }

                    }
                    this.collectOptions(id.split('.')[2], model, options =>
                        this.publishFromState(deviceId, model, stateKey, state, options));
                }
            });
        }
    }

    async collectOptions(devId, model, callback) {
        const result = {};
        // find model states for options and get it values. No options for groups !!!
        const devStates = await this.getDevStates('0x' + devId, model);
        if (devStates == null || devStates == undefined || devStates.states == null || devStates.states == undefined) {
            callback(result);
            return;
        }

        const states = devStates.states.filter(statedesc => statedesc.isOption || statedesc.inOptions);
        if (states == null || states == undefined) {
            callback(result);
            return;
        }
        let cnt = 0;
        try {
            const len = states.length;
            states.forEach(statedesc => {
                const id = `${this.adapter.namespace}.${devId}.${statedesc.id}`;
                this.adapter.getState(id, (err, state) => {
                    cnt = cnt + 1;
                    if (!err && state) {
                        result[statedesc.id] = state.val;
                    }
                    if (cnt === len) {
                        callback(result);
                    }
                });
            });
            if (!len) {
                callback(result);
            }
        } catch (error) {
            this.sendError(error);
            this.error(`Error collectOptions for ${devId}. Error: ${error.stack}`);
        }
    }

    async getDevStates(deviceId, model) {
        try {
            let states;
            let stateModel;
            if (model === 'group') {
                states = statesMapping.groupStates;
            } else {
                stateModel = statesMapping.findModel(model);
                if (!stateModel) {
                    this.info(`Device ${deviceId} "${model}" not present in statesMapping - relying on exposes for device definition.`);
                    states = statesMapping.commonStates;
                } else {
                    states = stateModel.states;
                }
                if (typeof states === 'function' && !states.prototype) {
                    const entity = await this.adapter.zbController.resolveEntity(deviceId);
                    if (entity) {
                        states = states(entity);
                    }
                }
            }
            return {states, stateModel};
        } catch (error) {
            this.sendError(error);
            this.error(`Error getDevStates for ${deviceId}. Error: ${error.stack}`);
        }
    }

    async triggerComposite(_deviceId, model, stateDesc, interactive) {
        const deviceId = (_deviceId.replace('0x', ''));
        const idParts = stateDesc.id.split('.').slice(-2);
        const key = `${deviceId}.${idParts[0]}`;
        const handle = this.compositeData[key]
        const factor = (interactive ? 10 : 1);
        if (handle) this.adapter.clearTimeout(handle);
        this.compositeData[key] = this.adapter.setTimeout(async () => {
            delete this.compositeData[key];
            const parts = stateDesc.id.split('.');
            parts.pop();

            this.adapter.getStatesOf(deviceId, parts.join('.'),async (err,states) => {
                if (!err && states) {
                    const components = {};
                    for (const stateobj of states) {
                        const ckey = stateobj._id.split('.').pop();
                        const state = await this.adapter.getState(stateobj._id);
                        this.warn(`id is ${stateobj._id} ckey is ${ckey}, value is ${state.val}`);
                        components[ckey] = state.val;
                    }
                    this.adapter.setState(`${deviceId}.${stateDesc.compositeState}`, JSON.stringify(components));
                }
            })
        }, (stateDesc.compositeTimeout ? stateDesc.compositeTimeout : 100) * factor);
    }

    async publishFromState(deviceId, model, stateKey, state, options) {
        this.debug(`Change state '${stateKey}' at device ${deviceId} type '${model}'`);
        const elevated = this.checkDebugDevice(deviceId);

        if (elevated) this.warn(`ELEVATED O02: Change state '${stateKey}' at device ${deviceId} type '${model}'`);

        const devStates = await this.getDevStates(deviceId, model);
        if (!devStates) {
            if (elevated) this.error(`ELEVATED OE1: no device states for device ${deviceId} type '${model}'`);
            return;
        }
        const commonStates = statesMapping.commonStates.find(statedesc => stateKey === statedesc.id);
        const stateDesc = (commonStates === undefined ? devStates.states.find(statedesc => stateKey === statedesc.id) : commonStates);
        const stateModel = devStates.stateModel;
        if (!stateDesc) {
            this.error(`No state available for '${model}' with key '${stateKey}'`);
            return;
        }

        const value = state.val;
        if (value === undefined || value === '') {
            if (elevated)
                this.error(`ELEVATED OE2: no value for device ${deviceId} type '${model}'`);
            return;
        }
        let stateList = [{stateDesc: stateDesc, value: value, index: 0, timeout: 0, source:state.from}];
        if (stateModel && stateModel.linkedStates) {
            stateModel.linkedStates.forEach(linkedFunct => {
                try {
                    if (typeof linkedFunct === 'function') {
                        const res = linkedFunct(stateDesc, value, options, this.adapter.config.disableQueue);
                        if (res) {
                            stateList = stateList.concat(res);
                        }
                    } else {
                        this.warn(`publish from State - LinkedState is not a function ${JSON.stringify(linkedFunct)}`);
                    }
                } catch (e) {
                    this.sendError(e);
                    this.error('Exception caught in publishfromstate');
                }

            });
            // sort by index
            stateList.sort((a, b) => a.index - b.index);
        }

        // holds the states for read after write requests
        let readAfterWriteStates = [];
        if (stateModel && stateModel.readAfterWriteStates) {
            stateModel.readAfterWriteStates.forEach((readAfterWriteStateDesc) =>
                readAfterWriteStates = readAfterWriteStates.concat(readAfterWriteStateDesc.id));
        }

        this.emit('changed', deviceId, model, stateModel, stateList, options);
    }

    async renameDevice(id, newName) {
        const stateId = id.replace(`${this.adapter.namespace}.`, '')
        const obj = await this.adapter.getObjectAsync(id);
        if (newName == null || newName == undefined) newName = '';
        let objName = newName;
        if (newName.length < 1 || newName == obj.common.type) {
            objName = (obj.common.type == 'group' ? stateId.replace('_',' ') : obj.common.type);
        }
        this.localConfig.updateDeviceName(stateId, newName);
        this.debug('rename device: newname ~' + newName + '~ objName ~' + objName + '~')
        this.adapter.extendObject(id, {common: {name: objName}});
    }

    verifyDeviceName(id, model ,name) {
        const savedId = id.replace(`${this.adapter.namespace}.`, '');
        return this.localConfig.NameForId(id, model, name);
    }


    setDeviceActivated(id, active) {
        this.adapter.extendObject(id, {common: {deactivated: active}});
    }

    storeDeviceName(id, name) {
        return this.localConfig.updateDeviceName(id, name);
    }


    async deleteObj(devId) {
        const options = { recursive:true };
        try {
            this.adapter.delObject(devId,options), (err) => {
                this.adapter.log.info(`Cannot delete Object ${devId}: ${err}`);
            }

        } catch (error) {
            this.adapter.log.info(`Cannot delete Object ${devId}: ${error && error.message ? error.message : 'without error message'}`);
        }
    }

    async deleteOrphanedDeviceStates(ieeeAddr, model, force, callback, markOnly) {
        const devStates = await this.getDevStates(ieeeAddr, model);
        const commonStates = statesMapping.commonStates;
        const devId = ieeeAddr.substr(2);
        const messages = [];
        this.adapter.getStatesOf(devId, (err, states) => {
            if (!err && states) {
                states.forEach((state) => {
                    let statename = state._id;
                    const arr = /zigbee.[0-9].[^.]+.(\S+)/gm.exec(statename);
                    if (arr[1] === undefined) {
                        this.warn(`unable to extract id from state ${statename}`);
                        const idx = statename.lastIndexOf('.');
                        if (idx > -1) {
                            statename = statename.slice(idx + 1);
                        }
                    } else {
                        statename = arr[1];
                    }
                    if (commonStates.find(statedesc => statename === statedesc.id) === undefined &&
                        devStates.states.find(statedesc => statename === statedesc.id) === undefined
                    ) {
                        if (state.common.hasOwnProperty('custom') && !force && !markOnly) {
                            //messages.push(`keeping disconnected state ${JSON.stringify(statename)} of ${devId} `)
                            this.info(`keeping disconnected state ${JSON.stringify(statename)} of ${devId} `);
                        } else {
                            if (markOnly) {
                                this.adapter.extendObjectAsync(devId.concat('.',statename), {common: {color:'#E67E22'}})

                            }
                            else
                                {
                                try {
                                    this.info(`deleting disconnected state ${JSON.stringify(statename)} of ${devId} `);
                                    //messages.push(`deleting disconnected state ${JSON.stringify(statename)} of ${devId} `);
                                    this.deleteObj(devId.concat('.',statename));
                                }
                                catch (error) {
                                    //messages.push(`ERROR: failed to delete state ${JSON.stringify(statename)} of ${devId} `)
                                }
                            }
                        }
                    } else {
                        this.debug(`keeping connecte state ${JSON.stringify(statename)} of  ${devId} `);
                        //messages.push(`keeping connecte state ${JSON.stringify(statename)} of  ${devId} `);
                    }
                });
            }
            if (callback) callback(messages);
        });
    }

    updateStateWithTimeout(dev_id, name, value, common, timeout, outValue) {
        this.updateState(dev_id, name, value, common);
        setTimeout(() => this.updateState(dev_id, name, outValue, common), timeout);
    }

    async updateState(devId, name, value, common) {
        const obj = await this.adapter.getObjectAsync(devId)
        if (obj) {
            if (!obj.common.deactivated) {
                const new_common = {name: name, color:null};
                const stateId = devId + '.' + name;
                const new_name = obj.common.name;
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
                const stobj = await this.adapter.getObjectAsync(stateId);
                let hasChanges = false;
                if (stobj) {
                    // update state - not change name and role (user can it changed)
                    if (stobj.common.name) {
                        delete new_common.name;
                    } else {
                        new_common.name = `${new_name} ${new_common.name}`;
                    }
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
                    const matches = stateId.match((/\./g));
                    if (matches && matches.length>1) {
                        const channels = stateId.split('.');
                        const SubChannels = [channels.shift()];
                        channels.pop();
                        for (const channel of channels) {
                            SubChannels.push(channel);
                            const id = SubChannels.join('.');
                            await this.adapter.extendObjectAsync(id, {type: 'channel', common: { name:channel}, native:{}})
                        }
                    }
                    hasChanges = true;
                }

                // only change object when any common property has changed
                if (hasChanges) {
                    this.adapter.extendObject(stateId, {type: 'state', common: new_common, native: {}}, () =>
                        value !== undefined && this.setState_typed(stateId, value, true, stobj ? stobj.common.type : new_common.type));
                } else if (value !== undefined) {
                    this.setState_typed(stateId, value, true, stobj.common.type);
                }
            } else {
                this.debug(`UpdateState: Device is deactivated ${devId} ${JSON.stringify(obj)}`);
            }
        } else {
            this.debug(`UpdateState: missing device ${devId} ${JSON.stringify(obj)}`);
        }
    }

    setState_typed(id, value, ack, type, callback) {
        // never set a null or undefined value
        if (value === null || value === undefined) return;
        if (!type) {
            this.debug('SetState_typed called without type');
            // identify datatype, recursively call this function with set datatype
            this.adapter.getObject(id, (err, obj) => {
                if (obj && obj.common) {
                    this.setState_typed(id, value, ack, obj.common.type, callback);
                } else {
                    this.setState_typed(id, value, ack, 'noobj', callback);
                }
            });
            return;
        }
        if (typeof value !== type) {
            this.debug(`SetState_typed : converting ${JSON.stringify(value)} for ${id} from ${typeof value} to ${type}`);
            switch (type) {
                case 'number':
                    value = parseFloat(value);
                    if (isNaN(value)) {
                        value = 0;
                    }
                    break;
                case 'string':
                case 'text':
                    value = JSON.stringify(value);
                    break;
                case 'boolean': {
                    if (typeof value == 'number') {
                        value = value !== 0;
                        break;
                    }
                    const sval = JSON.stringify(value).toLowerCase().trim();
                    value = sval === 'true' || sval === 'yes' || sval === 'on';
                }
                    break;
            }
        }
        this.adapter.setState(id, value, ack, callback);
    }

    /*
    async applyOverridesToDevice(target) {
        try {
            const obj = (typeof target == 'string' ? await this.adapter.getObjectAsync(target) : target);
            if (!obj && obj.common) return {};
            const model = obj.common.type;
            obj.common.name = this.localstorage.NameForId(id, model, obj.common.name);
            obj.common.icon = this.localstorage.IconForId(id, model, obj.common.icon);
            await this.adapter.extendObjectAsync(id, obj);
            return {}
        }
        catch (error) {
            return {error: error};
        }
        // todo: apply overrides to all the states.
    }
    */

    async applyLegacyDevices() {
        const legacyModels = await this.localConfig.getLegacyModels();
        const modelarr1 = [];
        //this.warn('devices are' + modelarr1.join(','));
        statesMapping.devices.forEach(item => modelarr1.push(item.models));
        //this.warn('legacy models are ' + JSON.stringify(legacyModels));
        statesMapping.setLegacyDevices(legacyModels);
        const modelarr2 = [];
        statesMapping.devices.forEach(item => modelarr2.push(item.models));
        //this.warn('devices are' + modelarr2.join(','));
    }

    /*
    async applyOverrides(target, isGlobal)
    {
        try {
            if (!isGlobal) {
                return await this.applyOverridesToDevice(id);
            }
            const allDev = await this.adapter.getDevicesAsync();
            allDev.filter((dev) => dev.common.model == target).forEach(async targetdev => this.applyOverridesToDevice(target));
            return {};
        }
        catch (error) {
            return { error:error};
        }

    }
    */

    async getDefaultGroupIcon(id) {
        const regexResult = id.match(new RegExp(/group_(\d+)/));
        if (!regexResult) return '';
        const groupID = Number(regexResult[1]);
        const group = await this.adapter.zbController.getGroupMembersFromController(groupID)
        if (typeof group == 'object')
            return `img/group_${Math.max(Math.min(group.length, 7), 0)}.png`
        else
            return 'img/group_x.png'
    }

    async updateDev(dev_id, dev_name, model, callback) {

        const __dev_name = this.verifyDeviceName(dev_id, model, (dev_name ? dev_name : model));
        this.debug(`UpdateDev called with ${dev_id}, ${dev_name}, ${model}, ${__dev_name}`);
        const id = '' + dev_id;
        const modelDesc = statesMapping.findModel(model);
        const modelIcon = (model == 'group' ? await this.getDefaultGroupIcon(dev_id) : modelDesc && modelDesc.icon ? modelDesc.icon : 'img/unknown.png');
        let icon = this.localConfig.IconForId(dev_id, model, modelIcon);
        // this.warn('icon is ' + JSON.stringify(icon));

        // download icon if it external and not undef
        if (model === undefined) {
            this.warn(`download icon ${__dev_name} for undefined Device not available. Check your devices.`);
        } else {
            const model_modif = model.replace(/\//g, '-');
            const pathToIcon = `${this.adapter.adapterDir}/admin/img/${model_modif}.png`;

            if (icon.startsWith('http')) {
                try {
                    if (!fs.existsSync(pathToIcon)) {
                        this.info(`download icon from ${icon} saved into ${pathToIcon}`);
                        this.downloadIcon(icon, pathToIcon);
                    }
                    icon = `img/${model_modif}.png`;
                } catch (e) {
                    this.warn(`ERROR : icon not found at ${icon}`);
                }
            }
        }
        // this.warn('update dev: icon set to ' + icon);

        this.adapter.setObjectNotExists(id, {
            type: 'device',
            // actually this is an error, so device.common has no attribute type. It must be in native part
            common: {
                name: __dev_name,
                type: model,
                icon,
                modelIcon: modelIcon,
                color: null,
                statusStates: {onlineId: `${this.adapter.namespace}.${dev_id}.available`}
            },
            native: {id: dev_id}
        }, () => {
            // update type and icon
            this.adapter.extendObject(id, {
                common: {
                    name: __dev_name,
                    type: model,
                    icon,
                    modelIcon: modelIcon,
                    color: null,
                    statusStates: {onlineId: `${this.adapter.namespace}.${dev_id}.available`}
                }
            }, callback);
        });
    }

    async downloadIcon(url, image_path) {
        if (!fs.existsSync(image_path)) {
            return new Promise((resolve, reject) => {
                axios({
                    method: 'get',
                    url: url,
                    responseType: 'stream'  // Dies ist wichtig, um den Stream direkt zu erhalten
                }).then(response => {
                    const writer = fs.createWriteStream(image_path);
                    response.data.pipe(writer);
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                }).catch(err => {
                    // reject(err);
                    this.warn(`ERROR : icon path not found ${image_path}`);
                });
            });
        }
    }

    async syncDevStates(dev, model) {
        this.debug('synchronizing device states for ' + dev.ieeeAddr + ' (' + model + ')');
        const devId = dev.ieeeAddr.substr(2);
        // devId - iobroker device id
        const devStates = await this.getDevStates(dev.ieeeAddr, model);
        if (!devStates) {
            return;
        }
        const states = statesMapping.commonStates.concat(devStates.states);

        for (const stateInd in states) {
            if (!states.hasOwnProperty(stateInd)) {
                continue;
            }

            const statedesc = states[stateInd];
            if (statedesc === undefined) {
                this.error(`syncDevStates: Illegal state in ${JSON.stringify(dev)} -  ${JSON.stringify(stateInd)}`);
                return;
            }
            // Filter out non routers or devices that are battery driven for the availability flag
            if (statedesc.id === 'available') {
                if (!(dev.type === 'Router') || dev.powerSource === 'Battery') {
                    continue;
                }
            }
            // lazy states
            if (statedesc.lazy) {
                continue;
            }

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
            this.updateState(devId, statedesc.id, undefined, common);
        }
        this.deleteOrphanedDeviceStates(dev.ieeeAddr, model, false, undefined, true);
    }

    async getExposes() {
        await this.localConfig.init();
        await this.applyLegacyDevices();
        statesMapping.fillStatesWithExposes();
    }

    async elevatedMessage(device, message, isError) {
        if (isError) this.error(message); else this.warn(message);
        // emit data here for debug tab later

    }

    async elevatedDebugMessage(id, message, isError) {
        if (isError) this.error(message); else this.warn(message);
        this.emit('debugmessage', {id: id, message:message});
    }

    async publishToState(devId, model, payload) {
        const devStates = await this.getDevStates(`0x${devId}`, model);

        const has_elevated_debug = (this.checkDebugDevice(devId) && !payload.hasOwnProperty('msg_from_zigbee'));


        if (has_elevated_debug)
        {
            this.elevatedMessage(devId, `ELEVATED I01: message received '${JSON.stringify(payload)}' from device ${devId} type '${model}'`, false);
        }
        if (!devStates) {
            if (has_elevated_debug)
                this.elevatedMessage(devId, `ELEVATED IE02: no device states for device ${devId} type '${model}'`, true)
            return;
        }
        // find states for payload
        let has_published = false;

        if (devStates.states !== undefined) {
            try {
                const states = statesMapping.commonStates.concat(
                    devStates.states.filter(statedesc => payload.hasOwnProperty(statedesc.prop || statedesc.id))
                );

                for (const stateInd in states) {
                    const statedesc = states[stateInd];
                    let value;
                    if (statedesc.getter) {
                        value = statedesc.getter(payload);
                    } else {
                        value = payload[statedesc.prop || statedesc.id];
                    }
                    // checking value
                    if (value === undefined || value === null) {
                        continue;
                    }

                    let stateID = statedesc.id;

                    if (has_elevated_debug) {
                        this.elevatedMessage(devId, `ELEVATED I02: value generated '${JSON.stringify(value)}' from device ${devId} for '${statedesc.name}'`, false);
                    }

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

                    if (typeof value === 'object' && value.hasOwnProperty('stateid')) {
                        stateID = `${stateID}.${value.stateid}`;
                        if (value.hasOwnProperty('unit')) {
                            common.unit = value.unit;
                        }
                        common.name = value.name ? value.name : value.stateid;
                        common.role = value.role ? `value.${value.role}` : 'number';
                        value = value.value;
                    }

                    // if needs to return value to back after timeout
                    if (statedesc.isEvent) {
                        this.updateStateWithTimeout(devId, statedesc.id, value, common, 300, !value);
                    } else {
                        if (statedesc.prepublish) {
                            this.collectOptions(devId, model, options =>
                                statedesc.prepublish(devId, value, newvalue =>
                                    this.updateState(devId, stateID, newvalue, common), options)
                            );
                        } else {
                            this.updateState(devId, stateID, value, common);
                        }
                    }
                    has_published = true;
                }
            } catch (e) {
                this.debug(`No states in device ${devId} : payload ${JSON.stringify(payload)}`);
                if (has_elevated_debug)
                    this.elevatedMessage(devId, `ELEVATED IE03: error when enumerating states of ${devId} for payload ${JSON.stringify(payload)}, ${(e ? e.name : 'undefined')} (${(e ? e.message : '')}).`, true);
            }
            if (!has_published && has_elevated_debug) {
                this.elevatedMessage(devId, `ELEVATED IE04: No value published for device ${devId}`, true);

            }
        }
        else {
            if (has_elevated_debug)
                this.elevatedMessage(devId, `ELEVATED IE05: No states matching the payload ${JSON.stringify(payload)} for device ${devId}`, true);
        }
    }

}

module.exports = StatesController;
