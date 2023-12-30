'use strict';

const EventEmitter = require('events').EventEmitter;
const statesMapping = require('./devices');
const getAdId = require('./utils').getAdId;
const getZbId = require('./utils').getZbId;
const fs = require('fs');
const request = require('request');

let savedDeviceNamesDB = {};
const knownUndefinedDevices = {};

class StatesController extends EventEmitter {
    constructor(adapter) {
        super();
        this.adapter = adapter;
        this.adapter.on('stateChange', this.onStateChange.bind(this));
        this.query_device_block = [];
        this.debugDevices = undefined;
        const fn = adapter.expandFileName('dev_names.json');
        this.dev_names_fn = fn.replace('.', '_');
        this.retTimeoutHandle = null;
        fs.readFile(this.dev_names_fn, (err, data) => {
            if (!err) {
                try {
                    savedDeviceNamesDB = JSON.parse(data);
                } catch {
                    savedDeviceNamesDB = {};
                }
            }
        });
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

    retainDeviceNames() {
        clearTimeout(this.retTimeoutHandle);
        this.retTimeoutHanlde = setTimeout(() => {
            fs.writeFile(this.dev_names_fn, JSON.stringify(savedDeviceNamesDB, null, 2), err => {
                if (err) {
                    this.error(`error saving device names: ${JSON.stringify(err)}`);
                } else {
                    this.debug('saved device names');
                }
            });
        }, 5000);
    }

    getDebugDevices() {
        this.debugDevices = [];
        this.adapter.getState(`${this.adapter.namespace}.info.debugmessages`, (err, state) => {
            if (state) {
                if (typeof state.val === 'string' && state.val.length > 2) {
                    this.debugDevices = state.val.split(';');
                }
                this.info(`debug devices set to ${JSON.stringify(this.debugDevices)}`);
            }
        });

        this.adapter.setStateAsync(`info.undefinedDevices`, JSON.stringify(knownUndefinedDevices), true);
    }

    onStateChange(id, state) {
        if (!this.adapter.zbController || !this.adapter.zbController.connected()) {
            return;
        }
        if (this.debugDevices === undefined) {
            this.getDebugDevices();
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
                return;
            }
            for (const addressPart of this.debugDevices) {
                if (typeof id === 'string' && id.includes(addressPart)) {
                    this.warn(`ELEVATED: User stateChange ${id} ${JSON.stringify(state)}`);
                    break;
                }
            }
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
                        deviceId = parseInt(deviceId.replace('0xgroup_', ''));
                    }
                    this.collectOptions(id.split('.')[2], model, options =>
                        this.publishFromState(deviceId, model, stateKey, state, options));
                }
            });
        }
    }

    async collectOptions(devId, model, callback) {
        const result = {};
        // find model states for options and get it values
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
                    if (knownUndefinedDevices[deviceId]) {
                        knownUndefinedDevices[deviceId]++;
                    } else {
                        knownUndefinedDevices[deviceId] = 1;
                        this.error(`Device ${deviceId} "${model}" not described in statesMapping.`);
                    }
                    this.adapter.setStateAsync(`info.undefinedDevices`, JSON.stringify(knownUndefinedDevices), true);
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

    async publishFromState(deviceId, model, stateKey, state, options) {
        if (this.debugDevices === undefined) this.getDebugDevices();
        this.debug(`Change state '${stateKey}' at device ${deviceId} type '${model}'`);
        for (const addressPart of this.debugDevices) {
            if (typeof deviceId === 'string' && deviceId.includes(addressPart)) {
                this.warn(`ELEVATED Change state '${stateKey}' at device ${deviceId} type '${model}'`);
                break;
            }
        }
        const devStates = await this.getDevStates(deviceId, model);
        if (!devStates) {
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
            return;
        }
        let stateList = [{stateDesc: stateDesc, value: value, index: 0, timeout: 0}];
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

    renameDevice(id, newName) {
        this.storeDeviceName(id, newName);
        this.adapter.extendObject(id, {common: {name: newName}});
    }

    setDeviceActivated(id, active) {
        this.adapter.extendObject(id, {common: {deactivated: active}});
    }

    async rebuildRetainDeviceNames() {
        savedDeviceNamesDB = {};
        const devList = await this.adapter.getAdapterObjectsAsync();

        for (const key in devList) {
            if (devList[key].type == 'device') {
                savedDeviceNamesDB[devList[key]._id.replace(`${this.adapter.namespace}.`, '')] = devList[key].common.name;
            }
        }
        this.retainDeviceNames();
    }

    storeDeviceName(id, name) {
        savedDeviceNamesDB[id.replace(`${this.adapter.namespace}.`, '')] = name;
        this.retainDeviceNames();
    }

    verifyDeviceName(id, name) {
        const savedId = id.replace(`${this.adapter.namespace}.`, '');
        if (!savedDeviceNamesDB.hasOwnProperty(savedId)) {
            savedDeviceNamesDB[savedId] = name;
            this.retainDeviceNames();
        }
        return savedDeviceNamesDB[savedId];
    }

    deleteDeviceStates(devId, callback) {
        this.adapter.getStatesOf(devId, (err, states) => {
            if (!err && states) {
                states.forEach(state =>
                    this.adapter.deleteState(devId, null, state._id));
            }
            this.adapter.deleteDevice(devId, () =>
                callback && callback());
        });
    }

    async deleteDeviceStatesAsync(devId) {
        const states = await this.adapter.getStatesOf(devId);
        if (states) {
            for (const state of states) {
                await this.adapter.deleteState(devId, null, state._id);
            }
        }
        await this.adapter.deleteDevice(devId);
    }

    // eslint-disable-next-line no-unused-vars
    async deleteOrphanedDeviceStates(ieeeAddr, model, force, callback) {
        const devStates = await this.getDevStates(ieeeAddr, model);
        const commonStates = statesMapping.commonStates;
        const devId = ieeeAddr.substr(2);
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
                        if (state.common.hasOwnProperty('custom') && !force) {
                            this.info(`keeping disconnected state ${JSON.stringify(statename)} of  ${devId} `);
                        } else {
                            this.info(`deleting disconnected state ${JSON.stringify(statename)} of  ${devId} `);
                            this.adapter.deleteState(devId, null, state._id);
                        }
                    } else {
                        this.debug(`keeping connecte state ${JSON.stringify(statename)} of  ${devId} `);
                    }
                });
            }
        });
    }

    updateStateWithTimeout(dev_id, name, value, common, timeout, outValue) {
        this.updateState(dev_id, name, value, common);
        setTimeout(() => this.updateState(dev_id, name, outValue, common), timeout);
    }

    updateState(devId, name, value, common) {
        this.adapter.getObject(devId, (err, obj) => {
            if (obj) {
                if (!obj.common.deactivated) {
                    const new_common = {name: name};
                    const id = devId + '.' + name;
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
                    this.adapter.getObject(id, (err, stobj) => {
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
                            hasChanges = true;
                        }

                        // only change object when any common property has changed
                        if (hasChanges) {
                            this.adapter.extendObject(id, {type: 'state', common: new_common, native: {}}, () =>
                                value !== undefined && this.setState_typed(id, value, true, stobj ? stobj.common.type : new_common.type));
                        } else if (value !== undefined) {
                            this.setState_typed(id, value, true, stobj.common.type);
                        }

                    });
                } else {
                    this.debug(`UpdateState: Device is deactivated ${devId} ${JSON.stringify(obj)}`);
                }
            } else {
                this.debug(`UpdateState: missing device ${devId} ${JSON.stringify(obj)}`);
            }
        });
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

    updateDev(dev_id, dev_name, model, callback) {
        const __dev_name = this.verifyDeviceName(dev_id, dev_name);
        const id = '' + dev_id;
        const modelDesc = statesMapping.findModel(model);
        let icon = (modelDesc && modelDesc.icon) ? modelDesc.icon : 'img/unknown.png';

        // download icon if it external and not undef
        if (model === undefined) {
            this.warn(`download icon ${__dev_name} for undefined Device not available. Check your devices.`);
        } else {
            const model_modif = model.replace(/\//g, '-');
            const pathToIcon = `${this.adapter.adapterDir}/admin/img/${model_modif}.png`;

            if (icon.startsWith('http')) {
                try {
                    if (!fs.existsSync(pathToIcon)) {
                        this.warn(`download icon from ${icon} saved into ${pathToIcon}`);
                        this.downloadIcon(icon, pathToIcon);
                    }
                    icon = `img/${model_modif}.png`;
                } catch (e) {
                    this.debug(`ERROR : icon not found from ${icon} saved into ${pathToIcon}`);
                }
            }
        }

        this.adapter.setObjectNotExists(id, {
            type: 'device',
            // actually this is an error, so device.common has no attribute type. It must be in native part
            common: {
                name: __dev_name,
                type: model,
                icon,
                color: null,
                statusStates: {onlineId: `${this.adapter.namespace}.${dev_id}.available`}
            },
            native: {id: dev_id}
        }, () => {
            // update type and icon
            this.adapter.extendObject(id, {
                common: {
                    type: model,
                    icon,
                    color: null,
                    statusStates: {onlineId: `${this.adapter.namespace}.${dev_id}.available`}
                }
            }, callback);
        });
    }

    async downloadIcon(url, image_path) {
        if (!fs.existsSync(image_path)) {
            return new Promise((resolve, reject) => {
                request.head(url, (err, res, body) => {
                    if (err) {
                        return reject(err + ' ' + res + ' ' + body);
                    }
                    const stream = request(url);
                    stream.pipe(
                        fs.createWriteStream(image_path)
                            .on('error', err => reject(err)))
                        .on('close', () => resolve());
                });
            });
        }
    }

    async syncDevStates(dev, model) {
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
    }

    async getExcludeExposes(allExcludesObj) {
        statesMapping.fillStatesWithExposes(allExcludesObj);
    }

    async publishToState(devId, model, payload) {
        const devStates = await this.getDevStates(`0x${devId}`, model);
        let has_debug = false;
        if (this.debugDevices === undefined) this.getDebugDevices();
        for (const addressPart of this.debugDevices) {
            if (typeof(devId) == 'string' && devId.indexOf(addressPart) > -1) {
                if (payload.hasOwnProperty('msg_from_zigbee')) {
                    break;
                }

                this.warn(`ELEVATED publishToState: message received '${JSON.stringify(payload)}' from device ${devId} type '${model}'`);
                has_debug = true;
                break;
            }
        }
        if (!devStates) {
            return;
        }
        // find states for payload
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

                    if (has_debug && statedesc.id !== 'msg_from_zigbee') {
                        this.warn(`ELEVATED publishToState: value generated '${JSON.stringify(value)}' from device ${devId} for '${statedesc.name}'`);
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
                }
            } catch (e) {
                this.debug(`No states in device ${devId} : payload ${JSON.stringify(payload)}`);
            }
        }
    }
}

module.exports = StatesController;
