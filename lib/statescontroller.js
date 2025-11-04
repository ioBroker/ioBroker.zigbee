'use strict';

const safeJsonStringify = require('./json');
const { EventEmitter } = require('events');
const statesMapping = require('./devices');
const fs = require('fs');
const localConfig = require('./localConfig');
const path = require('path');
const axios = require('axios');
const zigbeeHerdsmanConvertersUtils = require('zigbee-herdsman-converters/lib/utils');
const utils = require('./utils');

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
        this.cleanupRequired = false;
        this.timeoutHandleUpload = null;
        this.ImagesToDownload = [];
        this.debugMessages = { nodevice:{ in:[], out: []} };
        this.debugActive = true;
        this.deviceQueryBlock = [];
        this.clearStashedErrors();
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

    getStashedErrors() {
        return this.stashedErrors;
    }

    clearStashedErrors() {
        this.stashedErrors = {
            errors:{},
            unknownModels: {},
            hasData:false
        };
        return this.stashedErrors;
    }

    debugMessagesById() {
        return this.debugMessages;
    }

    async AddModelFromHerdsman(device, model) {
        const namespace = `${this.adapter.name}.admin`;

        if (this.localConfig.getOverrideWithTargetAndKey(model, 'legacy', true)) {
            this.debug('Applying legacy definition for ' + model);
            await this.addLegacyDevice(model);
        }
        else {
            this.debug('Generating states from exposes for ' + model);
            // download icon if it external and not undefined
            if (model === undefined) {
                const dev_name = this.verifyDeviceName(utils.zbIdorIeeetoAdId(this.adapter, device.ieeeAddr, false), model, device.modelID);
                this.warn(`icon ${dev_name} for undefined Device not available. Check your devices.`);
            } else {
                const modelDesc = await statesMapping.addExposeToDevices(device, this, model);
                const srcIcon = (modelDesc ? modelDesc.icon : '');
                const model_modif = model.replace(/\//g, '-');
                const pathToAdminIcon = `img/${model_modif}.png`;
                // source is a web address
                if (srcIcon.startsWith('http')) {
                    try {
                        //if (modelDesc) modelDesc.icon = pathToAdminIcon;
                        this.downloadIconToAdmin(srcIcon, pathToAdminIcon)
                    } catch (err) {
                        this.warn(`ERROR : unable to download ${srcIcon}: ${err && err.message ? err.message : 'no reason given'}`);
                    }
                    return;
                }
                // source is inline basee64F
                const base64Match = srcIcon.match(/data:image\/(.+);base64,/);
                if (base64Match) {
                    this.warn(`base 64 Icon matched, trying to save it to disk as ${pathToAdminIcon}`);
                    if (modelDesc) modelDesc.icon = pathToAdminIcon;
                    this.adapter.fileExists(namespace, pathToAdminIcon, async (err,result) => {
                        if (result) {
                            this.warn(`no need to save icon to ${pathToAdminIcon}`);
                            return;
                        }
                        const msg = `Saving base64 Data to ${pathToAdminIcon}`
                        try {
                            const buffer = Buffer.from(srcIcon.replace(base64Match[0],''), 'base64');
                            this.adapter.writeFile(namespace, pathToAdminIcon, buffer, (err) => {
                                if (err) {
                                    this.warn(`${msg} -- failed: ${err && err.message ? err.message : 'no reason given'}`);
                                    return;
                                }
                                this.debug(`${msg} -- success`);
                            });
                        }
                        catch (err) {
                            this.warn(`${msg} -- failed: ${err && err.message ? err.message : 'no reason given'}`)
                        }
                    });
                    return;
                }
                // path is absolute
                if (modelDesc) modelDesc.icon = pathToAdminIcon;
                this.adapter.fileExists(namespace, pathToAdminIcon, async(err, result) => {
                    if (result) {
                        this.debug(`icon ${modelDesc ? modelDesc.icon : 'unknown icon'} found - no copy needed`);
                        return;
                    }
                    // try 3 options for source file
                    let src = srcIcon; // as given
                    const locations=[];
                    if (!fs.existsSync(src)) {
                        src = path.normalize(this.adapter.expandFileName(src));
                        locations.push(src);
                    } // assumed relative to data folder
                    if (!fs.existsSync(src)) {
                        locations.push(src);
                        src = path.normalize(this.adapter.expandFileName(path.basename(src)));
                    } // filename relative to data folder
                    if (!fs.existsSync(src)) {
                        locations.push(src);
                        src = path.normalize(this.adapter.expandFileName(path.join('img',path.basename(src))));
                    } // img/<filename> relative to data folder
                    if (!fs.existsSync(src)) {
                        this.warn(`Unable to copy icon from device definition, looked at ${locations.join(', ')} and ${src}`)
                        return;
                    }
                    fs.readFile(src, (err, data) => {
                        if (err) {
                            this.warn(`unable to read ${src}: ${(err.message? err.message:' no message given')}`);
                            return;
                        }
                        if (data) {
                            this.adapter.writeFile(namespace, pathToAdminIcon, data, (err) => {
                                if (err) {
                                    this.error(`error writing file ${path}: ${err.message ? err.message : 'no reason given'}`);
                                    return;
                                }
                                this.debug('Updated image file ' + pathToAdminIcon);
                            });
                            return;
                        }
                        this.error(`fs.readFile failed - neither error nor data is returned!`);
                    });
                });
            }
        }
    }

    async updateDebugDevices(debugDevices) {
        if (debugDevices != undefined)
            this.debugDevices = debugDevices;
        this.adapter.zbController.callExtensionMethod('setLocalVariable', ['debugDevices', this.debugDevices]);

    }

    async getDebugDevices(callback) {
        if (this.debugDevices === undefined) {
            this.debugDevices = [];
            const state = await this.adapter.getStateAsync(`${this.adapter.namespace}.info.debugmessages`);
            if (state) {
                if (typeof state.val === 'string' && state.val.length > 2) {
                    this.updateDebugDevices(state.val.split(';'));
                }
                this.info(`debug devices set to ${JSON.stringify(this.debugDevices)}`);
                if (callback) callback(this.debugDevices);
            }
        } else {
            this.updateDebugDevices();
            // this.info(`debug devices was already set to ${JSON.stringify(this.debugDevices)}`);
            callback(this.debugDevices)
        }
    }

    async toggleDeviceDebug(id) {
        const arr = /zigbee.[0-9].([^.]+)/gm.exec(id);
        if (!arr) {
            this.warn(`unable to toggle debug for device ${id}: there was no matc (${JSON.stringify(arr)}) `);
            return this.debugDevices;
        }
        if (arr[1] === undefined) {
            this.warn(`unable to extract id from state ${id}`);
            return this.debugDevices;
        }
        const stateKey = arr[1];
        if (this.debugDevices === undefined) this.debugDevices = await this.getDebugDevices()
        const idx = this.debugDevices.indexOf(stateKey);
        if (idx < 0) this.debugDevices.push(stateKey);
        else this.debugDevices.splice(idx, 1);
        this.updateDebugDevices()
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
        if (id.includes('logLevel')) {
            if (state) this.adapter.updateDebugLevel(state.val);
        }
        const debugId = Date.now();
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
                this.updateDebugDevices();
                this.info('debug devices set to ' + JSON.stringify(this.debugDevices));
                return;
            }

            const devId = utils.getAdId(this.adapter, id); // iobroker device id
            const deviceId = utils.getZbId(id); // zigbee device id

            if (this.checkDebugDevice(id)) {
                const message = `User state change of state ${id} with value ${state.val} (ack: ${state.ack}) from ${state.from}`;
                this.emit('device_debug', { ID:debugId, data: { ID: deviceId, flag:'01' }, message:message});
            } else
                if (this.debugActive) this.debug(`User stateChange ${id} ${JSON.stringify(state)}`);
            const arr = /zigbee.[0-9].[^.]+.(\S+)/gm.exec(id);
            if (arr[1] === undefined) {
                this.debug(`unable to extract id from state ${id}`);
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
                        if (this.debugActive) this.debug('State Change detected on deactivated Device - ignored');
                        return;
                    }

                    if (model && model.id === 'device_query') {
                        if (this.query_device_block.indexOf(deviceId) > -1 && !state.source.includes('.admin.')) {
                            this.info(`Device query for '${deviceId}' blocked - device query timeout has not elapsed yet.`);
                            return;
                        }
                        this.emit('device_query', { deviceId, debugId });
                    }

                    this.collectOptions(id.split('.')[2], model, true,  options =>
                        this.publishFromState(deviceId, model, stateKey, state, options, debugId));
                }
            });
        }
    }

    async collectOptions(devId, model, getOptionStates, callback) {
        try {
            const result = this.localConfig.getOptions(devId);
            if (!getOptionStates) {
                callback(result);
                return;
            }
            // find model states for options and get it values.
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
                            this.debug(`collect options for ${devId}:  ${JSON.stringify(result)}`);
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
        catch (error) {
            this.error(`Error in collectOptions for ${devId} , ${model} : ${error && error.message ? error.message : 'no message given'}`);
            callback({});

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
                    // try to get the model from the exposes
                    this.stashUnknownModel(`getDevStates:${deviceId}`,`Model "${model}" not found for Device ${deviceId}`);
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

    stashErrors(key, msg, error) {
        try {
            if (!this.stashedErrors.errors.hasOwnProperty(key))
            {
                if (error) this.error(msg); else this.warn(msg);
                this.stashedErrors.errors[key] = { message:msg, ts:[Date.now()], error:error };
            }
            else this.stashedErrors.errors[key].ts.push(Date.now());
            this.stashedErrors.hasData = true;
            this.adapter.setState('info.lasterror', JSON.stringify({ error: key, data:this.stashedErrors.errors[key]}), true)
        }
        catch { /* */ }
    }

    stashUnknownModel(model, msg) {
        try {
            if (!this.stashedErrors.unknownModels.hasOwnProperty(model)) {
                this.stashedErrors.unknownModels[model] = { message:msg, ts:[Date.now()], error:true };
                this.error(`Unknown ${model}: ${msg}`)
            }
            else this.stashedErrors.unknownModels[model].ts.push(Date.now());
            this.stashedErrors.hasData = true;
            this.adapter.setState('info.lasterror', JSON.stringify({ model: model, data:this.stashedErrors.unknownModels[model]}), true)
        }
        catch { /* */ }
    }

    async triggerComposite(_deviceId, stateDesc, interactive) {
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
                        if (state && state.val != undefined) {
                            components[ckey] = state.val;
                        }
                    }
                    this.adapter.setState(`${deviceId}.${stateDesc.compositeState}`, JSON.stringify(components));
                }
            })
        }, (stateDesc.compositeTimeout ? stateDesc.compositeTimeout : 100) * factor);
    }


    handleLinkedFunctResult(lfArr, devId, state) {
        if (this.handleOption(devId, state.stateDesc)) return;
        lfArr.push(state);
    }

    parseOption(val) {
        if (val === undefined || val === null) return {};
        if (!Array.isArray(val)) {
            try {
                const valObj = JSON.parse(val);
                return valObj;
            }
            catch { /* */ }
            if (typeof val =='object') return val;
        }
        if (typeof val === 'string')
        {
            const keys = val.split(/[,;]/);
            const rv = {};
            for (const k of keys) {
                rv[k] = null;
            }
            return rv;
        }
        this.warn(`illegal option ${JSON.stringify(val)}`)
        return {};
    }

    async handleStateReset(entity, end_with_device_query) {
        const debugID = Date.now();
        const deviceId = entity.device.ieeeAddr;
        const model = entity.mapped?.model || '';
        const states = this.parseOption(entity.options.resend_states);
        if (end_with_device_query) states.end_with_device_query = true;
        await this.publishFromStates(deviceId, model, states, entity.options, debugID);
    }

    async publishFromStates(deviceId, model, stateIDs, options, debugID) {
        const adId = utils.zbIdorIeeetoAdId(this.adapter, deviceId, true);
        for (const stateID of Object.keys(stateIDs).sort((a,b) => {if (a=='device_query' || a=='state') return (b=='device_query' ? -1 : 1); else return a.localeCompare(b)})) {
            const state = await this.adapter.getStateAsync(`${adId}.${stateID}`);
            if (stateIDs[stateID]!= null) state.val = stateIDs[stateID];
            if (state && state.hasOwnProperty('val')) {
                await this.publishFromState(deviceId, model, stateID, state, options, debugID)
            }
        }

    }

    async publishFromState(deviceId, model, stateKey, state, options, debugID) {
        if (this.debugActive) this.debug(`Change state '${stateKey}' at device ${deviceId} type '${model}'`);
        const has_elevated_debug = this.checkDebugDevice(typeof deviceId == 'number' ? `group_${deviceId}` : deviceId);

        if (has_elevated_debug)  {
            const message = (`Change state '${stateKey}' at device ${deviceId} type '${model}'`);
            this.emit('device_debug', { ID:debugID, data: { ID: deviceId, model: model, flag:'02', IO:false }, message:message});
        }

        const devStates = await this.getDevStates(deviceId, model);
        if (!devStates) {
            if (has_elevated_debug) {
                const message = (`no device states for device ${deviceId} type '${model}'`);
                this.emit('device_debug', { ID:debugID, data: { error: 'NOSTATES' , IO:false }, message:message});
            }
            return;
        }
        const commonStates = statesMapping.commonStates.find(statedesc => stateKey === statedesc.id);
        const stateDesc = (commonStates === undefined ? devStates.states.find(statedesc => stateKey === statedesc.id) : commonStates);
        const stateModel = devStates.stateModel;
        if (!stateDesc) {
            const message = (`No state available for '${model}' with key '${stateKey}'`);
            if (has_elevated_debug) this.emit('device_debug', { ID:debugID, data: { states:[{id:state.ID, value:'unknown', payload:'unknown'}], error: 'NOSTKEY' , IO:false }, message:message});
            return;
        }

        const value = state.val;
        if (value === undefined || value === '') {
            if (has_elevated_debug) {
                const message = (`no value for device ${deviceId} type '${model}'`);
                this.emit('device_debug', { ID:debugID, data: { states:[{id:state.ID, value:'--', payload:'error', ep:stateDesc.epname}],error: 'NOVAL1' , IO:false }, message:message});
            }
            return;
        }

        // send_payload can never be a linked state !;
        if (stateDesc.id === 'send_payload') {
            try {
                const json_value = JSON.parse(value);
                const payload = {device: deviceId.replace('0x', ''), payload: json_value, model:model, stateModel:stateModel, acknowledge:true};
                if (has_elevated_debug) this.emit('device_debug', { ID:debugID, data: { flag: '04' ,payload:value ,states:[{id:stateDesc.id, value:json_value, payload:'none'}], IO:false }});

                this.emit('send_payload', payload, debugID, has_elevated_debug);
            } catch (error) {
                const message = `send_payload: ${value} does not parse as JSON Object : ${error.message}`;
                if (has_elevated_debug) this.emit('device_debug', { ID:debugID, data: { error: 'EXSEND' ,states:[{id:stateDesc.id, value:value, payload:error.message}], IO:false }, message:message});
                else this.error(message);
                return;
            }
            return;
        }

        if (stateDesc.id === 'device_query') {
            const interactive = (state.from.includes('.admin'));
            if (!interactive && this.deviceQueryBlock.includes(deviceId)) {
                this.warn(`device_query blocked due to excessive triggering - retrigger > 10 seconds after previous trigger has completed.`);
                return;
            }
            this.deviceQueryBlock.push[deviceId];
            const id = deviceId;
            this.emit('device_query', deviceId, debugID, has_elevated_debug, (devId) =>{
                setTimeout(() => { const idx = this.deviceQueryBlock.indexOf(id);
                    if (idx > -1) this.deviceQueryBlock.splice(idx);
                }, 10000)

            } )
            return;
        }

        // composite states can never be linked states;
        if (stateDesc.compositeState && stateDesc.compositeTimeout) {
            this.triggerComposite(deviceId, stateDesc, state.from.includes('.admin.'));
            return;
        }

        const stateList = [{stateDesc: stateDesc, value: value, index: 0, timeout: 0, source:state.from}];

        if (stateModel && stateModel.linkedStates) {
            stateModel.linkedStates.forEach(linkedFunct => {
                try {
                    if (typeof linkedFunct === 'function') {
                        const res = linkedFunct(stateDesc, value, options, this.adapter.config.disableQueue);
                        if (res) {
                            if (res.hasOwnProperty('stateDesc')) { // we got a single state back
                                if (! res.stateDesc.isOption) stateList.push(res);
                            }
                            else {
                                res.forEach((ls) => { if (!ls.stateDesc.isOption) stateList.push(ls)} );
                            }
                        }
                    } else {
                        this.warn(`publish from State - LinkedState is not a function ${JSON.stringify(linkedFunct)}`);
                    }
                } catch (e) {
                    this.sendError(e);
                    if (has_elevated_debug) this.emit('device_debug', { ID:debugID, data: { states:[{id:state.ID, value:state.val, payload:'unknown'}], error: 'EXLINK' , IO:false }});
                    this.error('Exception caught in publishfromstate: ' + (e && e.message ? e.message : 'no error message given'));
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

        if (stateList.length > 0)
            this.emit('changed', deviceId, model, stateModel, stateList, options, debugID, has_elevated_debug );
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
        if (this.debugActive) this.debug('rename device: newname ~' + newName + '~ objName ~' + objName + '~')
        this.adapter.extendObject(id, {common: {name: objName}});
    }

    verifyDeviceName(id, model ,name) {
        return this.localConfig.NameForId(id, model, name);
    }


    setDeviceActivated(id, inActive) {
        this.adapter.extendObject(id, {common: {deactivated: inActive, color:inActive ? '#888888' : null, statusStates: inActive ? null : {onlineId:`${id}.available`} }});
    }

    storeDeviceName(id, name) {
        return this.localConfig.updateDeviceName(id, name);
    }


    async deleteObj(devId) {
        const options = { recursive:true };
        try {
            await this.adapter.delObjectAsync(devId,options);
            return {status:true};
        } catch (error) {
            this.adapter.log.warn(`Cannot delete Object ${devId}: ${error && error.message ? error.message : 'without error message'}`);
            return { status:false, message: `Cannot delete Object ${devId}: ${error && error.message ? error.message : 'without error message'}`};
        }
    }

    async checkIfModelUpdate(entity) {
        const model = entity.mapped ? entity.mapped.model : entity.device.modelID;
        const device = entity.device;
        const devId = utils.zbIdorIeeetoAdId(this.adapter, device.ieeeAddr, false);

        const obj = await this.adapter.getObjectAsync(devId);
        if (obj && obj.common.type !== model) {
            await this.updateDev(devId, model, model);
            await this.syncDevStates(device, model);
            await this.deleteOrphanedDeviceStates(device.ieeeAddr, model,false, () => {}, true);
        }
    }


    async deleteOrphanedDeviceStates(ieeeAddr, model, force, callback, markOnly) {
        const devStates = await this.getDevStates(ieeeAddr, model);
        const commonStates = statesMapping.commonStates;
        const devId = utils.zbIdorIeeetoAdId(this.adapter, ieeeAddr, false);
        const messages = [];
        this.adapter.getStatesOf(devId, (err, states) => {
            if (!err && states) {
                states.forEach((state) => {
                    let statename = state._id;
                    const arr = /zigbee.[0-9].[^.]+.(\S+)/gm.exec(statename);
                    if (arr[1] === undefined) {
                        if (this.debugActive) this.debug(`unable to extract id from state ${statename}`);
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
                        this.cleanupRequired |= markOnly;
                        if (state.common.hasOwnProperty('custom') && !force && !markOnly) {
                            messages.push(`keeping disconnected state ${JSON.stringify(statename)} of ${devId} `)
                            this.info(`keeping disconnected state ${JSON.stringify(statename)} of ${devId} `);
                            this.cleanupRequired == true;
                        } else {
                            if (markOnly) {
                                this.adapter.extendObjectAsync(devId.concat('.',statename), {common: {color:'#E67E22'}})

                            }
                            else
                            {
                                try {
                                    this.info(`deleting disconnected state ${JSON.stringify(statename)} of ${devId} `);
                                    messages.push(`deleting disconnected state ${JSON.stringify(statename)} of ${devId} `);
                                    this.deleteObj(devId.concat('.',statename));
                                }
                                catch (error) {
                                    //messages.push(`ERROR: failed to delete state ${JSON.stringify(statename)} of ${devId} `)
                                }
                            }
                        }
                    } else {
                        if (!markOnly) {
                            if (this.debugActive) this.debug(`keeping connected state ${JSON.stringify(statename)} of  ${devId} `);
                            messages.push(`keeping connecte state ${JSON.stringify(statename)} of  ${devId} `);
                        }
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
                    for (const key in common) {
                        if (common[key] !== undefined) new_common[key] = common[key];
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
                    // force allow change of level.color roles.
                    if (name.includes('color')) {
                        console.warn(`allowing role change for ${name}`)
                    } else delete new_common.role;

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
                // first check value
                if (value !== undefined) {
                    const type = stobj ? stobj.common.type : new_common.type;
                    if (type === 'number') {
                        const minval = (stobj ? stobj.common.min : new_common.min);
                        const maxval = (stobj ? stobj.common.max : new_common.max);
                        let nval = (typeof value == 'number' ? value : parseFloat(value));
                        if (isNaN(nval)) {
                            if (minval !== undefined && typeof minval === 'number')
                                nval = minval;
                            else
                                nval = 0;
                        }
                        if (typeof minval == 'number' && nval < minval) {
                            hasChanges = true;
                            new_common.color = '#FF0000'
                            value = minval
                            this.stashErrors(`${stateId}.min`,`State value for ${stateId} has value "${nval}" less than min "${minval}".`, false );
                        }
                        if (typeof maxval == 'number' && nval > maxval) {
                            hasChanges = true;
                            hasChanges = true;
                            new_common.color = '#FF0000'
                            value = maxval;
                            this.stashErrors(`${stateId}.max`,`State value for ${stateId} has value "${nval}" greater than max "${maxval}".`, false );
                        }
                    }
                }
                //
                if (hasChanges) {
                    this.adapter.extendObject(stateId, {type: 'state', common: new_common, native: {}}, () =>
                        value !== undefined && this.setState_typed(stateId, value, true, stobj ? stobj.common.type : new_common.type));
                } else if (value !== undefined) {
                    this.setState_typed(stateId, value, true, stobj.common.type);
                }
            } else {
                if (this.debugActive) this.debug(`UpdateState: Device is deactivated ${devId} ${JSON.stringify(obj)}`);
            }
        } else {
            if (this.debugActive) this.debug(`UpdateState: missing device ${devId}`);
        }
    }

    setState_typed(id, value, ack, type, callback) {
        // never set a null or undefined value
        if (value === null || value === undefined) return;
        if (!type) {
            if (this.debugActive) this.debug('SetState_typed called without type');
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
            if (this.debugActive) this.debug(`SetState_typed : converting ${JSON.stringify(value)} for ${id} from ${typeof value} to ${type}`);
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
                case 'object' : break;
                default:
                    if (['array','file','json','mixed','multistate','number','object','string'].includes(type)) break;
                    this.stashErrors(`etype:${id}`,`set_state_typed: trying to set a value on a strangely typed object: ${type} for id ${id} : ${JSON.stringify(Error().stack)}`);
                    break;
            }
        }
        this.adapter.setState(id, value, ack, callback);
    }

    async applyLegacyDevices() {
        const legacyModels = await this.localConfig.getLegacyModels();
        const modelarr1 = [];
        statesMapping.devices.forEach(item => modelarr1.push(item.models));
        statesMapping.setLegacyDevices(legacyModels);
        const modelarr2 = [];
        statesMapping.devices.forEach(item => modelarr2.push(item.models));
    }

    async addLegacyDevice(model) {
        statesMapping.setLegacyDevices([model]);
        statesMapping.getByModel();
    }


    async getDefaultGroupIcon(id, members) {
        let groupID = Number(id);
        if (typeof id == 'string' && isNaN(groupID)) {
            const regexResult = id.match(new RegExp(/group_(\d+)/));
            if (!regexResult) return '';
            groupID = Number(regexResult[1]);
        } else if (typeof id == 'number') {
            groupID = id;
        }
        if (groupID <= 0 || groupID > 65535) return 'img/group_x.png';
        if (typeof members != 'number') {
            const group = await this.adapter.zbController.getGroupMembersFromController(groupID)
            if (typeof group == 'object')
                return `img/group_${Math.max(Math.min(group.length, 7), 0)}.png`
            else
                return 'img/group_x.png'
        }
        return `img/group_${Math.max(Math.min(members, 7), 0)}.png`
    }

    async updateDev(dev_id, dev_name, model, callback) {

        const __dev_name = this.verifyDeviceName(dev_id, model, (dev_name ? dev_name : model));
        if (this.debugActive) this.debug(`UpdateDev called with ${dev_id}, ${dev_name}, ${model}, ${__dev_name}`);
        const id = '' + dev_id;
        const modelDesc = statesMapping.findModel(model);
        const modelIcon = (model == 'group' ?
            await this.getDefaultGroupIcon(dev_id) :
            modelDesc && modelDesc.icon ? modelDesc.icon : 'img/unknown.png');
        let icon = this.localConfig.IconForId(dev_id, model, modelIcon);

        // download icon if it external and not undefined
        if (model === undefined) {
            this.warn(`download icon ${__dev_name} for undefined Device not available. Check your devices.`);
        } else {
            const model_modif = model.replace(/\//g, '-');
            const pathToAdminIcon = `img/${model_modif}.png`;


            if (icon.startsWith('http')) {
                try {
                    this.downloadIconToAdmin(icon, pathToAdminIcon)
                    icon = `img/${model_modif}.png`;
                } catch (e) {
                    this.warn(`ERROR : icon not found at ${icon}`);
                }
            }
        }
        const objId = model=='group' ? `group_${dev_id}` : dev_id;

        const obj = await this.adapter.getObjectAsync( objId);

        const myCommon = {
            name: __dev_name,
            type: model,
            icon,
            modelIcon: modelIcon,
            color: (obj && obj.common && obj.common.deactivated) ? `#888888` : null,
            statusStates: (obj && obj.common && obj.common.deactivated) ? null : {onlineId: `${this.adapter.namespace}.${dev_id}.available`}
        }
        if (obj) {
            this.adapter.extendObject(id, {
                common: myCommon
            }, callback);
        } else {
            this.adapter.setObjectNotExists(id, {
                type: 'device',
                // actually this is an error, so device.common has no attribute type. It must be in native part
                common: myCommon,
                native: {id: dev_id}
            }, callback);
        }
    }

    async streamToBufferFetch(readableStream) {
        const reader = readableStream.getReader();
        const chunks = [];
        let done, value;
        try {
            while (true) {
                const result = await reader.read();
                done = result.done;
                value = result.value;
                if (done) break;
                if (value) chunks.push(Buffer.from(value));
            }
            return Buffer.concat(chunks);
        } catch (err) {
            this.error(`error getting buffer from stream: ${err && err.message ? err.message : 'no reason given'}`);
            throw err;
        }
    }

    async fetchIcon(url, image_path) {
        const namespace = `${this.adapter.name}.admin`;
        try {
            return new Promise((resolve, reject) => {
                fetch(url)
                    .then(async response => {
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        const data = await this.streamToBufferFetch(response.body);
                        this.adapter.writeFile(namespace, image_path, data, (err) => {
                            if (err) {
                                this.error(`error writing ${image_path} to admin: ${err.message ? err.message : 'no message given'}`);
                                reject(err);
                                return;
                            }
                            this.info(`downloaded ${url} to ${image_path}.`);
                            resolve();
                        });
                    })
                    .catch(err => {
                        this.warn(`error downloading icon ${err && err.message ? err.message : 'no message given'}`);
                        reject(err);
                    })
                    .finally(() => {
                        const idx = this.ImagesToDownload.indexOf(url);
                        if (idx > -1) {
                            this.ImagesToDownload.splice(idx, 1);
                        }
                    });
            });
        }
        catch (error) {
            this.warn(`error fetching ${url} : ${error && error.message ? error.message : 'no reason given'}`)
        }
    }

    async streamToBuffer(readableStream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            readableStream.on('data', data => {
                if (typeof data === 'string') {
                    // Convert string to Buffer assuming UTF-8 encoding
                    chunks.push(Buffer.from(data, 'utf-8'));
                } else if (data instanceof Buffer) {
                    chunks.push(data);
                } else {
                    // Convert other data types to JSON and then to a Buffer
                    const jsonData = JSON.stringify(data);
                    chunks.push(Buffer.from(jsonData, 'utf-8'));
                }
            });
            readableStream.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
            readableStream.on('error', (err) => {
                this.error(`error getting buffer from stream: ${err && err.message ? err.message : 'no reason given'}`);
                reject;
            });
        });
    }

    async downloadIcon(url, image_path) {
        try {
            const namespace = `${this.adapter.name}.admin`;
            this.ImagesToDownload.push(url);
            return new Promise((resolve, reject) => {
                this.info(`downloading ${url} to ${image_path}`);
                axios({
                    method: 'get',
                    url: url,
                    responseType: 'stream'  // Dies ist wichtig, um den Stream direkt zu erhalten
                }).then(async response => {
                    const data = await this.streamToBuffer(response.data);
                    this.adapter.writeFile(namespace, image_path, data, (err) => {
                        if (err) {
                            this.error(`error writing ${image_path} to admin: ${err.message ? err.message : 'no message given'}`);
                            reject;
                        }
                        this.info(`downloaded ${url} to ${image_path}.`)
                        resolve;
                    });
                }).catch(err => {
                    this.warn(`error downloading icon ${err && err.message ? err.message : 'no message given'}`);
                }).finally(() => {
                    const idx = this.ImagesToDownload.indexOf(url);
                    if (idx > -1) {
                        this.ImagesToDownload.splice(idx, 1);
                    }
                });
            });
        }
        catch (error) {
            this.error('error in downloadIcon:  ', error && error.message ? error.message : 'no message given');
        }
    }

    async downloadIconToAdmin(url, target) {
        const namespace = `${this.adapter.name}.admin`;
        this.adapter.fileExists(namespace, target, async (err,result) => {
            if (result) return;
            if (this.ImagesToDownload.indexOf(url) ==-1) {
                await this.downloadIcon(url, target);
            }
        });
    }
    CleanupRequired(set) {
        try {
            if (typeof set === 'boolean') this.cleanupRequired = set;
            return this.cleanupRequired;
        }
        catch (error) {
            if (this.debugActive) this.debug(`Error setting cleanup required: ${error && error.message ? error.message : 'no message available'}`);
        }
    }

    async syncDevStates(dev, model) {
        if (this.debugActive) this.debug('synchronizing device states for ' + dev.ieeeAddr + ' (' + model + ')');
        const devId = utils.zbIdorIeeetoAdId(this.adapter, dev.ieeeAddr, false);
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
        try {
            statesMapping.fillStatesWithExposes(this);
        }
        catch (error) {
            this.error(`Error applying exposes: ${error && error.message ? error.message : 'no error message'} ${error && error.stack ? error.stack : ''}`);
        }
    }

    async elevatedMessage(device, message, isError) {
        if (isError) this.error(message); else this.warn(message);
        // emit data here for debug tab later

    }

    async elevatedDebugMessage(id, message, isError) {
        if (isError) this.error(message); else this.warn(message);
        this.emit('debugmessage', {id: id, message:message});
    }

    async publishToState(devId, model, payload, debugId) {
        try {
            if (!debugId) debugId = Date.now();
            const devStates = await this.getDevStates(`0x${devId}`, model);

            const has_elevated_debug = (this.checkDebugDevice(devId) && !payload.hasOwnProperty('msg_from_zigbee'));

            const message = `message received '${JSON.stringify(payload)}' from device ${devId} type '${model}'`;
            if (has_elevated_debug)
                this.emit('device_debug', { ID:debugId, data: { deviceID: devId, flag:'03', IO:true }, message:message});
            else
                if (this.debugActive) this.debug(message);
            if (!devStates) {
                const message = `no device states for device ${devId} type '${model}'`;
                if (has_elevated_debug)this.emit('device_debug', { ID:debugId, data: { error:'NOSTATE',states:[{ id:'--', value:'--', payload:payload}], IO:true }, message:message});
                else if (this.debugActive) this.debug(message);
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
                        const message = `value generated '${JSON.stringify(value)}' from device ${devId} for '${statedesc.name}'`;
                        if (has_elevated_debug) this.emit('device_debug', { ID:debugId, data: { states:[{id:stateID, value:value, payload:payload }],flag:'04', IO:true }, message});
                        else if (this.debugActive) this.debug(message);


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
                            this.updateStateWithTimeout(devId, statedesc.id, value, common, 300, (typeof value == typeof (!value) ? !value : ''));
                            if (has_elevated_debug) this.emit('device_debug', { ID:debugId, data: { flag:'SUCCESS', IO:true }});

                        } else {
                            if (statedesc.prepublish) {
                                this.collectOptions(devId, model, false, options =>
                                    statedesc.prepublish(devId, value, newvalue => {
                                        this.updateState(devId, stateID, newvalue, common) }, options)
                                );
                                if (has_elevated_debug) this.emit('device_debug', { ID:debugId, data: { flag:'SUCCESS', IO:true }});
                            } else {
                                this.updateState(devId, stateID, value, common, debugId);
                                if (has_elevated_debug) this.emit('device_debug', { ID:debugId, data: { flag:'SUCCESS', IO:true }});
                            }
                        }
                        has_published = true;
                    }
                } catch (e) {
                    const message = `unable to enumerate states of ${devId} for payload ${JSON.stringify(payload)}, ${(e ? e.name : 'undefined')} (${(e ? e.message : '')}).`;
                    if (has_elevated_debug) this.emit('device_debug', { ID:debugId, data:{ error:'ESTATE', IO:true }, message:message});
                    else if (this.debugActive) this.debug(message);
                }
                const message = `No value published for device ${devId}`;
                if (!has_published) {
                    if (has_elevated_debug) this.emit('device_debug', { ID:debugId, data:{ states:[{id:'no state', value:'no value', inError:true, payload:payload }], flag:'04', IO:true }, message:message});
                    else if (this.debugActive) this.debug(message);
                }
            }
            else {
                const message = `ELEVATED IE05 - NOSTATE: No states matching the payload ${JSON.stringify(payload)} for device ${devId}`;
                if (has_elevated_debug) this.emit('device_debug', { ID:debugId, data:{ error:'NOSTATE', IO:true }, message});
                else if (this.debugActive) this.debug(message);
            }
        }
        catch (error) {
            this.error('Something went horribly wrong: ' + (error && error.message ? error.message : 'no reason given'));
        }
    }

    postProcessConvertedFromZigbeeMessage(definition, payload, options, device) {
    // Apply calibration/precision options
        for (const [key, value] of Object.entries(payload)) {
            const definitionExposes = Array.isArray(definition.exposes) ? definition.exposes : definition.exposes(device, {});
            const expose = definitionExposes.find((e) => e.property === key);

            if (!expose) return;

            if (expose &&
            expose.name in zigbeeHerdsmanConvertersUtils.calibrateAndPrecisionRoundOptionsDefaultPrecision &&
            value !== '' &&
            typeof value === 'number') {
                try {
                    payload[key] = zigbeeHerdsmanConvertersUtils.calibrateAndPrecisionRoundOptions(value, options, expose.name);
                } catch (error) {
                    this.warn(`Failed to apply calibration to '${expose.name}': ${error && error.message ? error.message: 'no reason given'}`);
                }
            }
        }
    }

    async processConverters(converters, devId, model, mappedModel, message, meta, debugId, has_elevated_debug) {
        let cnt = 0;
        const publish = (payload, dID) => {
            if (typeof payload === 'object') {// && Object.keys(payload).length > 0) {
                this.publishToState(devId, model, payload,dID);
            }
            else if (has_elevated_debug)
                this.emit('device_debug', {ID:debugId,data: { error:`EPAYLD`, IO:true }, message:` payload ${JSON.stringify(payload)} is empty`})
        };
        const options = await new Promise((resolve, reject) => {
            this.collectOptions(devId, model, false, (options) => {
                resolve(options);
            });
        });

        const chain = [];
        for (const converter of converters) {
            const idx = cnt++;
            chain.push(new Promise((resolve) => {
                if (has_elevated_debug) this.emit('device_debug', {ID:debugId,data: { flag:`02.${cnt}a`, IO:true }, message:`converter ${cnt} : Cluster ${converter.cluster}`})
                try {
                    const payloadConv = converter.convert(mappedModel, message, publish, options, meta);
                    if (has_elevated_debug) {
                        const metapost = meta ? {
                            deviceIEEE: meta.device ? meta.device.ieeeAddr : 'no device',
                            deviceModelId: meta.device ? meta.device.ModelId : 'no device',
                            logger: meta.logger ? (meta.logger.constructor ? meta.logger.constructor.name : 'not a class') : 'undefined',
                            state : meta.state
                        } : 'undefined';
                        this.emit('device_debug', {ID:debugId,data: { flag:`02.${idx}b`, IO:true }, message:` data: ${safeJsonStringify(message.data)} options: ${safeJsonStringify(options)} meta:${safeJsonStringify(metapost)} result:${safeJsonStringify(payloadConv)}`})
                    }
                    if (typeof payloadConv === 'object') {
                        resolve(payloadConv);
                    }
                    else resolve({});
                }
                catch (error) {
                    const msg = `Error while processing converters DEVICE_ID: '${devId}' cluster '${converter.cluster}' type '${converter.type}' ${error && error.message ? ' message: ' + error.message : ''}`;
                    if (has_elevated_debug) this.emit('device_debug', { ID:debugId, data: { error:'EPROC', IO:true }, message: msg });
                    this.warn(msg);
                    resolve ({})
                }
            }));
        }
        const candidates = await Promise.all(chain);
        const payload = {};

        for (const candidate of candidates) {
            for (const key in candidate)
                payload[key] = candidate[key];
        }

        if (Object.keys(payload).length > 0 && Object.keys(options).length > 0) {
            const premsg = `candidates: ${JSON.stringify(candidates)} => payload ${JSON.stringify(payload)}`
            this.postProcessConvertedFromZigbeeMessage(mappedModel, payload, options, message.device);
            if (has_elevated_debug) this.emit('device_debug', {ID:debugId,data: { flag:`02.${cnt}d`, IO:true }, message:`${premsg} => processed payload : ${JSON.stringify(payload)}`})
        }
        else if (has_elevated_debug) this.emit('device_debug', {ID:debugId,data: { flag:`02.${cnt}c`, IO:true }, message:`candidates: ${JSON.stringify(candidates)} => payload ${JSON.stringify(payload)}`})

        publish(payload, debugId);
    }

    async onZigbeeEvent(type, entity, message) {
        if (this.debugActive) this.debug(`Type ${type} device ${safeJsonStringify(entity)} incoming event: ${safeJsonStringify(message)}`);

        const device = entity.device;
        const mappedModel = entity.mapped;
        const model = entity.mapped ? entity.mapped.model : entity.device.modelID;
        const cluster = message.cluster;
        const devId = utils.zbIdorIeeetoAdId(this.adapter, device.ieeeAddr, false);
        const meta = {device};

        const has_elevated_debug = this.checkDebugDevice(devId);
        const debugId = Date.now();
        if (entity.device.interviewing) {
            this.warn(`zigbee event for ${device.ieeeAddr} received during interview!`);
            return;
        }

        // raw message data for logging and msg_from_zigbee
        const msgForState = Object.assign({}, message);
        delete msgForState['device'];
        delete msgForState['endpoint'];
        msgForState['endpoint_id'] = message.endpoint.ID;

        if (has_elevated_debug) {
            const message = `Zigbee Event of Type ${type} from device ${device.ieeeAddr}, incoming event: ${safeJsonStringify(msgForState)}`;
            this.emit('device_debug', { ID:debugId, data: { ID: device.ieeeAddr, payload:safeJsonStringify(msgForState), flag:'01', IO:true }, message:message});

        }
        // this assigment give possibility to use iobroker logger in code of the converters, via meta.logger
        meta.logger = this;

        await this.checkIfModelUpdate(entity);

        let _voltage = 0;
        let _temperature = 0;
        let _humidity = 0;

        let isMessure = false;
        let isBattKey = false;

        if (mappedModel && mappedModel.meta && mappedModel.meta.battery) {
            const isVoltage = mappedModel.meta.battery.hasOwnProperty('voltageToPercentage');

            if (isVoltage) {
                const keys = Object.keys(message.data);

                for (const key of keys) {
                    const value = message.data[key];

                    if (value && value[1]) {
                        if (key == 65282 && value[1][1]) {
                            _voltage = value[1][1].elmVal;
                            isBattKey = true;
                            break;
                        }
                        if (key == 65281) {
                            _voltage = value[1];
                            isBattKey = true;
                            _temperature = value[100];
                            _temperature = _temperature /100;
                            _humidity = value[101];
                            _humidity = _humidity / 100;
                            isMessure = true;
                            break;
                        }
                    }
                }
            }
        }

        // always publish link_quality and battery
        if (message.linkquality) { // send battery with
            this.publishToState(devId, model, {linkquality: message.linkquality}, debugId);
            if (isBattKey) {
                this.publishToState(devId, model, {voltage: _voltage}, debugId);
                const  battProz = zigbeeHerdsmanConvertersUtils.batteryVoltageToPercentage(_voltage,entity.mapped.meta.battery.voltageToPercentage);
                this.publishToState(devId, model, {battery: battProz}, debugId);
            }
            if (isMessure) {
                this.publishToState(devId, model, {temperature: _temperature}, debugId);
                this.publishToState(devId, model, {humidity: _humidity}), debugId;
            }
        }

        this.publishToState(devId, model, {msg_from_zigbee: safeJsonStringify(msgForState)}, -1);

        if (!entity.mapped) {
            return;
        }

        let converters = [...(mappedModel?.fromZigbee || []),...(mappedModel?.toZigbee || [])].filter(c => c && c.cluster === cluster && (
            Array.isArray(c.type) ? c.type.includes(type) : c.type === type));


        if (!converters.length && type === 'readResponse') {
            converters = mappedModel.fromZigbee.filter(c => c.cluster === cluster && (
                Array.isArray(c.type) ? c.type.includes('attributeReport') : c.type === 'attributeReport'));
        }

        if (has_elevated_debug) {
            const message = `${converters.length} converter${converters.length > 1 ? 's' : ''} available for '${mappedModel.model}' '${devId}' with cluster '${cluster}' and type '${type}'`
            this.emit('device_debug', { ID:debugId, data: { flag:'02', IO:true }, message:message})
        }

        if (!converters.length) {
            if (type !== 'readResponse' && type !== 'commandQueryNextImageRequest') {
                const message = `No converter available for '${mappedModel.model}' '${devId}' with cluster '${cluster}' and type '${type}'`;
                if (has_elevated_debug) this.emit('device_debug', { ID:debugId, data: { error:'NOCONV', IO:true }, message:message});
                else if (this.debugActive) this.debug(message);
            }
            return;
        }

        meta.state = { state: '' };   // for tuya

        this.processConverters(converters, devId, model, mappedModel, message, meta, debugId, has_elevated_debug)
            .catch((error) => {
                //   'Error: Expected one of: 0, 1, got: 'undefined''
                if (cluster !== '64529') {
                    if (has_elevated_debug) this.emit('device_debug', { ID:debugId, data: { error:'EPROC', IO:true }});
                    this.error(`Error while processing converters DEVICE_ID: '${devId}' cluster '${cluster}' type '${type}'`);
                    this.error(`error message: ${error && error.message ? error.message : ''}`);
                }
            });
    }

    async stop() {
        this.localConfig.retainData();
    }
}

module.exports = StatesController;
