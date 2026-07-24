const legacyDevices = require('./legacy/devices.js');
const legacyStates = require('./legacy/states').states;
const { getModelRegEx} = require('./utils.js')
const { applyHerdsmanModel } = require('./exposes.js');
const { findByDevice } = require('zigbee-herdsman-converters');

const herdsmanModelInfo = new Map();
const UUIDbyDevice = new Map();

const { ParseColor, complexColor, CC_DEFS } = require('./colors');
const { rgb_to_cie, cie_to_rgb } = require('./rgb');
const { decimalToHex, adapterLevelToBulbLevel, bulbLevelToAdapterLevel , toMired } = require('./utils');

const states = {
    // common states
    link_quality: {
        id: 'link_quality',
        prop: 'linkquality',
        name: 'Link quality',
        icon: undefined,
        role: 'value',
        write: false,
        read: true,
        type: 'number',
        min: 0,
        max: 255,
        isCommonState:true,
        category:'diagnostic',
    },
    available: {
        id: 'available',
        prop: 'available',
        name: 'Available',
        icon: undefined,
        role: 'indicator.reachable',
        write: false,
        read: true,
        type: 'boolean',
        isCommonState:true,
        isInternalState: true,
        category:'diagnostic',
    },
    device_query: { // button to trigger device read
        id: 'device_query',
        prop: 'device_query',
        name: 'Trigger device query',
        icon: undefined,
        role: 'button',
        write: true,
        read: false,
        type: 'boolean',
        isCommonState:true,
        isInternalState: true,
        category:'config',
    },
    from_zigbee: {
        id: 'msg_from_zigbee',
        name: 'Message from Zigbee',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'string',
        isCommonState:true,
        isInternalState: true,
        category:'diagnostic',
    },
    send_payload: {
        id: 'send_payload',
        name: 'Send to Device',
        icon: undefined,
        role: 'state',
        write: true,
        read: true,
        type: 'string',
        isCommonState:true,
        isInternalState: true,
        category:'diagnostic',
    },
    state: {
        id: 'state',
        name: 'Switch state',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: payload => (payload.state === 'ON'),
        setter: (value) => (value) ? 'ON' : 'OFF',
        setterOpt: (value, options) => {
            const stateValue = (value ? 'ON' : 'OFF');
            return {...options, state: stateValue};
        },
        inOptions: true,
    },
    // group states
    groupstateupdate: {
        id: 'stateupdate',
        name: 'Set group by member states',
        icon: undefined,
        role: 'state',
        write: true,
        read: true,
        type: 'string',
        states: {off:'off',max:'max',min:'min',avg:'avg',mat:'mat'},
        def:'off',
        isInternalState: true,
        category:'config',
    },
    groupmemberupdate: {
        id: 'memberupdate',
        name: 'Read member states',
        icon: undefined,
        role: 'state',
        write: true,
        read: true,
        type: 'boolean',
        isInternalState: true,
        category:'config',
    },
    brightness: {
        id: 'brightness',
        name: 'Brightness',
        icon: undefined,
        role: 'level.dimmer',
        write: true,
        read: true,
        type: 'number',
        unit: '',
        min: 0,
        max: 100,
        getter: payload => {
            return bulbLevelToAdapterLevel(payload.brightness);
        },
        setter: (value, options) => {
            return adapterLevelToBulbLevel(value);
        },
        setterOpt: (value, options) => {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time') && options.transition_time;
            const so = {...options};
            if (hasTransitionTime) so.transition = options.transition_time;
            delete so.transition_time;
            so.brightness = adapterLevelToBulbLevel(value);
            return so;
        },
        readResponse: (resp) => {
            const respObj = resp[0];
            if (respObj.status === 0 && respObj.attrData != undefined) {
                return bulbLevelToAdapterLevel(respObj.attrData);
            }
        },
    },
    brightness_step: {
        id: 'brightness_step',
        prop: 'brightness_step',
        name: 'Brightness stepping',
        icon: undefined,
        role: 'level',
        write: true,
        read: false,
        type: 'number',
        min: -50,
        max: 50,
        category:'dimming',
    },
    brightness_move: {
        id: 'brightness_move',
        prop: 'brightness_move',
        name: 'Dimming',
        icon: undefined,
        role: 'level',
        write: true,
        read: false,
        type: 'number',
        min: -50,
        max: 50,
        category:'dimming',
    },
    colortemp_move: {
        id: 'colortemp_move',
        prop: 'color_temp_move',
        name: 'Colortemp change',
        icon: undefined,
        role: 'level',
        write: true,
        read: false,
        type: 'number',
        min: -50,
        max: 50,
        category:'dimming',
    },
    hue_move: {
        id: 'hue_move',
        prop: 'hue_move',
        name: 'Hue change',
        icon: undefined,
        role: 'level',
        write: true,
        read: false,
        type: 'number',
        min: -50,
        max: 50,
        category:'dimming',
    },
    saturation_move: {
        id: 'saturation_move',
        prop: 'saturation_move',
        name: 'Saturation change',
        icon: undefined,
        role: 'level',
        write: true,
        read: false,
        type: 'number',
        min: -50,
        max: 50,
        category:'dimming',
    },
    transition_time: {
        id: 'transition_time',
        name: 'Transition time',
        icon: undefined,
        role: 'state',
        write: true,
        read: false,
        type: 'number',
        unit: 'sec',
        isOption: true,
        category:'config',
    },
    colortemp: {
        id: 'colortemp',
        prop: 'color_temp',
        name: 'Color temperature',
        icon: undefined,
        role: 'level.color.temperature',
        write: true,
        read: true,
        type: 'number',
        min: undefined,
        max: undefined,
        setter: (value) => {
            return toMired(value);
        },
        setterOpt: (value, options) => {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time') && options.transition_time;
            const so = {...options};
            if (hasTransitionTime) so.transition = options.transition_time;
            delete so.transition_time;
            return so;
        },
    },
    color: {
        id: 'color',
        prop: 'color',
        name: 'Color',
        icon: undefined,
        role: 'level.color',
        write: true,
        read: true,
        type: 'string',
        category: 'color',
        setter: (value) => {

            // convert RGB to XY for set
            const objColor = complexColor(value, true);
            if (objColor) return objColor;
            let xy = [0, 0];
            const rgbcolor = ParseColor(value);
            xy = rgb_to_cie(rgbcolor.r, rgbcolor.g, rgbcolor.b);
            return {
                x: xy[0],
                y: xy[1]
            };
        },
        setterOpt: (value, options) => {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time') && options.transition_time;
            const so = {...options};
            if (hasTransitionTime) so.transition = options.transition_time;
            delete so.transition_time;
            return so;
        },
        getter: payload => {
            const value = payload.color;
            if (value && typeof value === 'object') {
                return complexColor(value, false);
            }
            if (typeof value === 'string') return value;
            return undefined;
        },
    },
    color_hue: {
        id: `color_hs.hue`,
        prop:'color',
        name: `Hue`,
        icon: undefined,
        role: 'level.color.hue',
        write: true,
        read: true,
        type: 'number',
        min: 0,
        max: 360,
        compositeKey: 'color_hs',
        compositeTimeout: 500,
        compositeState: 'color',
        category: 'color',
        getter: (payload) => {
            if (typeof payload.color == 'object') {
                if (payload.color?.hue) {
                    return payload.color.hue;
                }
            }
        }
    },
    color_saturation: {
        id: `color_hs.saturation`,
        prop:'color',
        name: `Saturation`,
        icon: undefined,
        role: 'level.color.saturation',
        write: true,
        read: true,
        type: 'number',
        min: 0,
        max: 100,
        compositeKey: 'color_hs',
        compositeTimeout: 500,
        compositeState: 'color',
        category: 'color',
        getter: (payload) => {
            if (typeof payload.color == 'object') {
                if (payload.color?.saturation) {
                    return payload.color.saturation;
                }
            }
        }
    },
    color_red: {
        id: `color_rgb.r`,
        name: `Red`,
        icon: undefined,
        role: 'level.color.red',
        write: true,
        read: true,
        type: 'number',
        min: 0,
        max: 255,
        compositeKey: 'color_rgb',
        compositeTimeout: 500,
        compositeState: 'color',
        category: 'color',
    },
    color_green: {
        id: `color_rgb.g`,
        name: `Green`,
        icon: undefined,
        role: 'level.color.green',
        write: true,
        read: true,
        type: 'number',
        min: 0,
        max: 255,
        compositeKey: 'color_rgb',
        compositeTimeout: 500,
        compositeState: 'color',
        category: 'color',
    },
    color_blue: {
        id: `color_rgb.b`,
        name: `Blue`,
        icon: undefined,
        role: 'level.color.blue',
        write: true,
        read: true,
        type: 'number',
        min: 0,
        max: 255,
        compositeKey: 'color_rgb',
        compositeTimeout: 500,
        compositeState: 'color',
        category: 'color',
    },
    hex_color: {
        id:`hex_color`,
        name: `Hex Color`,
        icon: undefined,
        role: 'level.color.rgb',
        write: true,
        read: true,
        type: 'string',
        category: 'color',
        setter: value => {
            // hex color (no named allowed)
            const rgbcolor = ParseColor(value, true);
            return rgbcolor;
        },
        setterOpt: (value, options) => {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time') && options.transition_time;
            const so = {...options};
            if (hasTransitionTime) so.transition = options.transition_time;
            delete so.transition_time;
            return so;
        },

        getter: payload => {
            // Requires testing!

            try {
                // JSON
                const colorJSON = JSON.parse(payload.replaceAll("'",'"'));
                if (colorJSON.r != undefined && colorJSON.g != undefined && colorJSON.b != undefined) {
                    const hexstring = (colorJSON.r*65536 + colorJSON.g * 256 + colorJSON.b).toString(16).padStart(6);
                    return `#${hexstring.substring(2)}`;
                }
                return undefined;
            }
            catch {
                // intentionally empty;
            }
            if (payload.color.startsWith('#')) return payload.color;
            const p = payload.replace('0x', '');
            const m = p.match(/[0123456789abcdefABCDEF]+/);
            if (p.length < 7 && m && m[0].length == p.length) return `${'#000000'.substring(0, 7-p.length)}${p}`;
            return undefined;
        },
        setattr: 'color',

    },
}



const lightStates = [states.state, states.brightness, states.brightness_move, states.transition_time, states.brightness_step],
    lightStatesWithColor=[...lightStates, states.color, states.hex_color, states.colortemp, states.colortemp_move,states.color_red, states.color_green, states.color_blue],
    onOffStates=[states.state],
    lightStatesWithColortemp = [...lightStates, states.colortemp, states.colortemp_move],
    lightStatesWithColor_hue= [...lightStatesWithColor, states.hue_move, states.transition_time, /*states.effect_type_hue,*/ states.color_hue, states.color_saturation],
    lightStatesWithColorNoTemp= [...lightStates, states.color, states.color_hue, states.color_saturation],
    commonStates=Object.values(states).filter((candidate) => candidate.isCommonState),
    commonGroupStates=[states.groupstateupdate, states.groupmemberupdate],
    groupStates=[states.groupstateupdate, states.groupmemberupdate, ...lightStatesWithColor_hue, ...onOffStates];

/**
 * Returns a model description, if one exists
 * @param {string} model the model name
 * @param {string} UUID a UUID for models with device specific model definitions
 * @param {boolean} legacy true: legacy devices only. false: exposed devices only. undefined: Exposed devices preferred, legacy devices else
 * @returns {object: adapterModelDefinition}
 */
function findModel(model, deviceId, legacy) {
    const UUID = deviceId ? UUIDbyDevice.get(deviceId) : undefined;
    if (legacy) return legacyDevices.findModel(model, true);
    const m = UUID ? herdsmanModelInfo.get(UUID) : herdsmanModelInfo.get(getModelRegEx(model));
    if (m) return m;
    if (legacy === undefined)
        return legacyDevices.findModel(model, true)
}


/**
 * Returns a 16 digit hex hash
 * @param {string} hashMe the item to hash
 * @returns {string} the hash.
 */
function toHash(hashMe) {
    const hashStr = JSON.stringify(hashMe);
    let hash = 0;
    if (hashStr.length == 0) return hash;
    for (let  i = 0; i < hashStr.length; i++) {
        const char = hashStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    if (hash < 0) hash+= Number.MAX_SAFE_INTEGER;
    return `00000000000000${hash.toString(16)}`.slice(-13);
}

/**
 * Returns a 16 digit hex hash
 * @param {string} hashMe the item to hash
 * @returns {string} the hash.
 */
async function addExposeToDevices(device, model, options, logger) {

    // grab the model definition from herdsman
    //
    const hM = await findByDevice(device);

    if (hM) {
        const adapterModelDefinition = { model:model, device:device, key: getModelRegEx(model), icon:hM.icon }

        adapterModelDefinition.herdsmanModel = hM
        if (typeof hM.exposes == 'function') {
            adapterModelDefinition.exposes = hM.exposes(device);
            const endpoints = typeof hM.endpoints == 'function' ? hM.endpoints(device) || {} : {};
            adapterModelDefinition.UUID = toHash(`${adapterModelDefinition.exposes.map((expose) => JSON.stringify(expose)).join('.')}.${Object.keys(endpoints).join('.')}`);
            UUIDbyDevice.set(device.ieeeAddr,adapterModelDefinition.UUID);
        }
        else adapterModelDefinition.exposes = (typeof hM.exposes == 'object') ? hM.exposes : {};
        adapterModelDefinition.states = commonStates;
        const adapterModel = await findModel(model, device.ieeeAddr, false);
        if (adapterModel) return adapterModel;
        const { newModel, message, error } = await applyHerdsmanModel(adapterModelDefinition, options, logger);
        if (error) {
            if (logger) logger.warn(`${message} : ${error?.message}`);
        }
        else {
            herdsmanModelInfo.set(adapterModelDefinition.UUID || adapterModelDefinition.key, newModel);
            // default to legacy device if exposes are empty ?
            // currently: not.
            //
            if (adapterModelDefinition.UUID) newModel.UUID = adapterModelDefinition.UUID;
            return newModel;
        }
    }
    return {};
}

async function clearModelDefinitions() {
    UUIDbyDevice.clear();
    herdsmanModelInfo.clear();
}

function getStateDefinition(name, type, prop) {
    if (typeof name != 'string') return getStateDefinition('ilstate', type, prop);
    if (states.hasOwnProperty(name)) return states[name];
    if (legacyStates.hasOwnProperty(name)) return legacyStates[name];
    return {
        id: name,
        prop: prop || name,
        name: name.replace('_',' '),
        icon: undefined,
        role: 'state',
        write: true,
        read: true,
        type: type || 'string',
    }
}

function hasStateExpose(model) {
    return true;
}

module.exports = {
    addExposeToDevices,
    findModel,
    getStateDefinition,
    clearModelDefinitions,
    getIconforLegacyModel:legacyDevices.getIconforLegacyModel,
    hasLegacyDevice:legacyDevices.hasLegacyDevice,
    hasStateExpose,
    lightStates,
    lightStatesWithColor,
    states,
    commonStates,
    commonGroupStates,
    groupStates,
    lightStatesWithColortemp,
    lightStatesWithColor_hue,
    lightStatesWithColorNoTemp,
    onOffStates,
}
// this stores the Herdsman model info for each device. Note that each model also stores
// which devices use this model as reference
