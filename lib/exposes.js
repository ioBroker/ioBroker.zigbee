'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const statesDefs = require(__dirname + '/states.js').states;
const rgb = require(__dirname + '/rgb.js');
const utils = require(__dirname + '/utils.js');
const colors = require(__dirname + '/colors.js');
const ea = zigbeeHerdsmanConverters.exposes.access;

function genState(expose, role, name, desc) {
    let state;
    console.log(`expose = ${JSON.stringify(expose)} role = ${JSON.stringify(role)} name =  ${JSON.stringify(name)}  desc =  ${JSON.stringify(desc)}`);
    // write if access.SET or access.STATE_SET or access.ALL
    //const write = [2, 3, 7].includes(expose.access);
    const readable = (expose.access & ea.STATE) > 0;
    const writable = (expose.access & ea.SET) > 0;
    const stateId = (name || expose.property).replace(/\*/g, '');
    const stateName = (desc || expose.description || expose.name);
    const propName = expose.property;
    switch (expose.type) {
        case 'binary':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: writable,
                read: readable,
                type: 'boolean',
            };
            if (readable) {
                state.getter = payload => (payload[propName] === (expose.value_on || 'ON'));
            }
            else {
                state.role = 'button';
            }
            if (writable) {
                state.setter = (value) => (value) ? (expose.value_on || 'ON') : ((expose.value_off != undefined) ? expose.value_off : 'OFF');
                state.setattr = expose.name;
            }
            if (expose.endpoint) {
                state.epname = expose.endpoint;
            }
            break;

        case 'numeric':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: writable,
                read: true,
                type: 'number',
                min: expose.value_min || 0,
                max: expose.value_max,
                unit: expose.unit,
            };
            if (expose.endpoint) {
                state.epname = expose.endpoint;
            }
            break;

        case 'enum':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: writable,
                read: true,
                type: 'string',
                states: expose.values.map((item) => `${item}:${item}`).join(';'),
            };
            if (expose.endpoint) {
                state.epname = expose.endpoint;
            }
            break;

        case 'text':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: writable,
                read: true,
                type: 'string',
            };
            if (expose.endpoint) {
                state.epname = expose.endpoint;
            }
            break;

        default:
            break;
    }
    console.log(`state = ${JSON.stringify(state)}`);

    return state;
}



function createFromExposes(model, def) {
    const states = [];
    states.push = function (state, access) {
        if (state === undefined) {
            return this.length;
        }
        state.readable = (access & ea.STATE) > 0;
        state.writable = (access & ea.SET) > 0;
        console.log('push state = ' + JSON.stringify(state) + ' access = ' + JSON.stringify(access));
        const stateExists = this.findIndex( (element, index, array) => (element.id === state.id ));
        console.log('push stateExists = ' + JSON.stringify(stateExists) + ' state = ' + JSON.stringify(this[stateExists]));
        if (stateExists < 0 ) {
            return Array.prototype.push.call(this, state);
        }
        else {
            if ( (state.readable) && (! this[stateExists].readable ) ) {
                if (this[stateExists].hasOwnProperty('isAction')) {
                    this[stateExists].isAction = false;
                }
                this[stateExists].read = state.read;
                if (this[stateExists].role === 'button') {
                    this[stateExists].role = state.role;
                }
                if ( state.hasOwnProperty('getter') ) {
                    this[stateExists].getter = state.getter;
                }
                this[stateExists].prop = state.prop;
                this[stateExists].readable = true;
            }
            if ( (state.writable) && (! this[stateExists].writable ) ) {
                this[stateExists].write = state.write;
                if ( state.hasOwnProperty('setter') ) {
                    this[stateExists].setter = state.setter;
                }
                if ( state.hasOwnProperty('prop') ) {
                    this[stateExists].prop = state.prop;
                }
                if ( state.hasOwnProperty('setattr') ) {
                    this[stateExists].setattr = state.setattr;
                }
                if ( state.hasOwnProperty('epname') ) {
                    this[stateExists].epname = state.epname;
                }
                this[stateExists].writable = true;
            }
            console.log('push newstate = ' + JSON.stringify(this[stateExists]));
            return this.length;
        }
    }
    const icon = `https://www.zigbee2mqtt.io/images/devices/${model.replace('/','-')}.jpg`;
    for (const expose of def.exposes) {
        let state;

        switch (expose.type) {
            case 'light':
                for (const prop of expose.features) {
                    switch (prop.name) {
                        case 'state': {
                            const stateNameS = expose.endpoint ? `state_${expose.endpoint}` : 'state';
                            states.push({
                                id: stateNameS,
                                name: `Switch state ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                icon: undefined,
                                role: 'switch',
                                write: true,
                                read: true,
                                type: 'boolean',
                                getter: (payload) => (payload[stateNameS] === (prop.value_on || 'ON')),
                                setter: (value) => (value) ? prop.value_on || 'ON' : ((prop.value_off != undefined) ? prop.value_off : 'OFF'),
                                epname: expose.endpoint,
                                setattr: 'state',
                            }, prop.access);
                            break;
                        }
                        case 'brightness': {
                            const stateNameB = expose.endpoint ? `brightness_${expose.endpoint}` : 'brightness';
                            states.push({
                                id: stateNameB,
                                name: `Brightness ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                icon: undefined,
                                role: 'level.dimmer',
                                write: true,
                                read: true,
                                type: 'number',
                                min: 0, // ignore expose.value_min
                                max: 100, // ignore expose.value_max
                                inOptions: true,
                                getter: payload => {
                                    return utils.bulbLevelToAdapterLevel(payload[stateNameB]);
                                },
                                setter: (value) => {
                                    return utils.adapterLevelToBulbLevel(value);
                                },
                                setterOpt: (value, options) => {
                                    const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                    const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                    const preparedOptions = {...options, transition: transitionTime};
                                    preparedOptions.brightness = utils.adapterLevelToBulbLevel(value);
                                    return preparedOptions;
                                },
                                readResponse: (resp) => {
                                    const respObj = resp[0];
                                    if (respObj.status === 0 && respObj.attrData != undefined) {
                                        return utils.bulbLevelToAdapterLevel(respObj.attrData);
                                    }
                                },
                                epname: expose.endpoint,
                                setattr: 'brightness',
                            }, prop.access);
                            states.push(statesDefs.brightness_move, prop.access);
                            break;
                        }
                        case 'color_temp': {
                            const stateNameT = expose.endpoint ? `colortemp_${expose.endpoint}` : 'colortemp';
                            states.push({
                                id: stateNameT,
                                prop: expose.endpoint ? `color_temp_${expose.endpoint}` : 'color_temp',
                                name: `Color temperature ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                icon: undefined,
                                role: 'level.color.temperature',
                                write: true,
                                read: true,
                                type: 'number',
                                min: expose.value_min,
                                max: expose.value_max,
                                setter: (value) => {
                                    return utils.toMired(value);
                                },
                                setterOpt: (value, options) => {
                                    const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                    const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                    return {...options, transition: transitionTime};
                                },
                                epname: expose.endpoint,
                            }, prop.access);
                            states.push(statesDefs.colortemp_move, prop.access);
                            break;
                        }
                        case 'color_xy': {
                            const stateNameC = expose.endpoint ? `color_${expose.endpoint}` : 'color';
                            states.push({
                                id: stateNameC,
                                prop: expose.endpoint ? `color_${expose.endpoint}` : 'color',
                                name: `Color ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                icon: undefined,
                                role: 'level.color.rgb',
                                write: true,
                                read: true,
                                type: 'string',
                                setter: (value) => {
                                // convert RGB to XY for set
                                    /*
                                    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
                                    let xy = [0, 0];
                                    if (result) {
                                        const r = parseInt(result[1], 16),
                                            g = parseInt(result[2], 16),
                                            b = parseInt(result[3], 16);
                                        xy = rgb.rgb_to_cie(r, g, b);
                                    }
                                    return {
                                        x: xy[0],
                                        y: xy[1]
                                    };
*/
                                    let xy = [0, 0];
                                    const rgbcolor = colors.ParseColor(value);

                                    xy = rgb.rgb_to_cie(rgbcolor.r, rgbcolor.g, rgbcolor.b);
                                    return {
                                        x: xy[0],
                                        y: xy[1]
                                    };

                                },
                                setterOpt: (value, options) => {
                                    const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                    const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                    return {...options, transition: transitionTime};
                                },
                                getter: payload => {
                                    if (payload.color && payload.color.hasOwnProperty('x') && payload.color.hasOwnProperty('y')) {
                                        const colorval = rgb.cie_to_rgb(payload.color.x, payload.color.y);
                                        return '#' + utils.decimalToHex(colorval[0]) + utils.decimalToHex(colorval[1]) + utils.decimalToHex(colorval[2]);
                                    } else {
                                        return undefined;
                                    }
                                },
                                epname: expose.endpoint,
                                setattr: 'color',
                            }, prop.access);
                            break;
                        }
                        case 'color_hs': {
                            const stateNameH = expose.endpoint ? `color_${expose.endpoint}` : 'color';
                            states.push({
                                id: stateNameH,
                                prop: expose.endpoint ? `color_${expose.endpoint}` : 'color',
                                name: `Color ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                icon: undefined,
                                role: 'level.color.rgb',
                                write: true,
                                read: true,
                                type: 'string',
                                setter: (value) => {
                                    const _rgb = colors.ParseColor(value);
                                    const hsv = rgb.rgbToHSV(_rgb.r, _rgb.g, _rgb.b, true);
                                    return {
                                        hue: Math.min(Math.max(hsv.h,1),359),
                                        saturation: hsv.s,
                                        //                                        brightness: Math.floor(hsv.v * 2.55),

                                    };
                                },
                                setterOpt: (value, options) => {
                                    const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                    const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                    return {...options, transition: transitionTime};
                                },
                                epname: expose.endpoint,
                                setattr: 'color',
                            }, prop.access);
                            states.push({
                                id: expose.endpoint ? `hue_${expose.endpoint}` : 'hue',
                                prop: expose.endpoint ? `color_${expose.endpoint}` : 'color',
                                name: `Hue ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                icon: undefined,
                                role: 'level.color.hue',
                                write: true,
                                read: false,
                                type: 'number',
                                min: 0,
                                max: 360,
                                inOptions: true,
                                setter: (value, options) => {
                                    return {
                                        hue: value,
                                        saturation: options.saturation,
                                    };
                                },
                                setterOpt: (value, options) => {
                                    const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                    const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                    const hasHueCalibrationTable = options && options.hasOwnProperty('hue_calibration');
                                    if (hasHueCalibrationTable)
                                        try {
                                            return {...options, transition: transitionTime, hue_correction: JSON.parse(options.hue_calibration)};
                                        }
                                        catch {
                                            const hue_correction_table = [];
                                            options.hue_calibration.split(',').forEach(element => {
                                                const match = /([0-9]+):([0-9]+)/.exec(element);
                                                if (match && match.length ==3)
                                                    hue_correction_table.push({ in: Number(match[1]), out: Number(match[2])});
                                            });
                                            if (hue_correction_table.length > 0)
                                                return {...options, transition: transitionTime, hue_correction: hue_correction_table};
                                        }
                                    return {...options, transition: transitionTime};
                                },

                            }, prop.access);
                            states.push({
                                id: expose.endpoint ? `saturation_${expose.endpoint}` : 'saturation',
                                prop: expose.endpoint ? `color_${expose.endpoint}` : 'color',
                                name: `Saturation ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                icon: undefined,
                                role: 'level.color.saturation',
                                write: true,
                                read: false,
                                type: 'number',
                                min: 0,
                                max: 100,
                                inOptions: true,
                                setter: (value, options) => {
                                    return {
                                        hue: options.hue,
                                        saturation: value,
                                    };
                                },
                                setterOpt: (value, options) => {
                                    const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                    const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                    const hasHueCalibrationTable = options && options.hasOwnProperty('hue_calibration');
                                    if (hasHueCalibrationTable)
                                        try {
                                            return {...options, transition: transitionTime, hue_correction: JSON.parse(options.hue_calibration)};
                                        }
                                        catch {
                                            const hue_correction_table = [];
                                            options.hue_calibration.split(',').forEach(element => {
                                                const match = /([0-9]+):([0-9]+)/.exec(element);
                                                if (match && match.length ==3)
                                                    hue_correction_table.push({ in: Number(match[1]), out: Number(match[2])});
                                            });
                                            if (hue_correction_table.length > 0)
                                                return {...options, transition: transitionTime, hue_correction: hue_correction_table};
                                        }
                                    return {...options, transition: transitionTime};
                                },

                            }, prop.access);
                            states.push(statesDefs.hue_move, prop.access);
                            states.push(statesDefs.saturation_move, prop.access);
                            states.push({
                                id: 'hue_calibration',
                                prop: 'color',
                                name: 'Hue color calibration table',
                                icon: undefined,
                                role: 'table',
                                write: true,
                                read: false,
                                type: 'string',
                                inOptions: true,
                                setter: (value, options) => {
                                    return {
                                        hue: options.hue,
                                        saturation: options.saturation,
                                    };
                                },
                                setterOpt: (value, options) => {
                                    const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                    const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                    const hasHueCalibrationTable = options && options.hasOwnProperty('hue_calibration');
                                    if (hasHueCalibrationTable)
                                        try {
                                            return {...options, transition: transitionTime, hue_correction: JSON.parse(options.hue_calibration)};
                                        }
                                        catch {
                                            const hue_correction_table = [];
                                            options.hue_calibration.split(',').forEach(element => {
                                                const match = /([0-9]+):([0-9]+)/.exec(element);
                                                if (match && match.length ==3)
                                                    hue_correction_table.push({ in: Number(match[1]), out: Number(match[2])});
                                            });
                                            if (hue_correction_table.length > 0)
                                                return {...options, transition: transitionTime, hue_correction: hue_correction_table};
                                        }
                                    return {...options, transition: transitionTime};
                                },

                            }, prop.access);
                            break;
                        }
                        default:
                            states.push(genState(prop), prop.access);
                            break;
                    }
                }
                states.push(statesDefs.transition_time, ea.STATE_SET);
                break;

            case 'switch':
                for (const prop of expose.features) {
                    switch (prop.name) {
                        case 'state':
                            states.push(genState(prop, 'switch'), prop.access);
                            break;
                        default:
                            states.push(genState(prop), prop.access);
                            break;
                    }
                }
                break;

            case 'numeric':
                if (expose.endpoint) {
                    state = genState(expose);
                } else {
                    switch (expose.name) {
                        case 'linkquality':
                            state = undefined;
                            break;

                        case 'battery':
                            state = statesDefs.battery;
                            break;

                        case 'voltage':
                            state = statesDefs.plug_voltage;
                            break;

                        case 'temperature':
                            state = statesDefs.temperature;
                            break;

                        case 'humidity':
                            state = statesDefs.humidity;
                            break;

                        case 'pressure':
                            state = statesDefs.pressure;
                            break;

                        case 'illuminance':
                            state = statesDefs.illuminance_raw;
                            break;

                        case 'illuminance_lux':
                            state = statesDefs.illuminance;
                            break;

                        case 'power':
                            state = statesDefs.load_power;
                            break;

                        default:
                            state = genState(expose);
                            break;
                    }
                }
                if (state) states.push(state, expose.access);
                break;

            case 'enum':
                switch (expose.name) {
                    case 'action': {
                        if (!Array.isArray(expose.values)) break;
                        const hasHold = expose.values.find((actionName) => actionName.includes('hold'));
                        const hasRelease = expose.values.find((actionName) => actionName.includes('release'));
                        for (const actionName of expose.values) {
                            // is release state ? - skip
                            if (hasHold && hasRelease && actionName.includes('release')) continue;
                            // is hold state ?
                            if (hasHold && hasRelease && actionName.includes('hold')) {
                                const releaseActionName = actionName.replace('hold', 'release');
                                state = {
                                    id: actionName.replace(/\*/g, ''),
                                    prop: 'action',
                                    name: actionName,
                                    icon: undefined,
                                    role: 'button',
                                    write: false,
                                    read: true,
                                    type: 'boolean',
                                    getter: payload => (payload.action === actionName) ? true : (payload.action === releaseActionName) ? false : undefined,
                                };
                            } else {
                                state = {
                                    id: actionName.replace(/\*/g, ''),
                                    prop: 'action',
                                    name: actionName,
                                    icon: undefined,
                                    role: 'button',
                                    write: false,
                                    read: true,
                                    type: 'boolean',
                                    getter: payload => (payload.action === actionName) ? true : undefined,
                                    isEvent: true,
                                };
                            }
                            states.push(state, expose.access);
                        }
                        state = null;
                        break;
                    }
                    default:
                        state = genState(expose);
                        break;
                }
                if (state) states.push(state, expose.access);
                break;

            case 'binary':
                if (expose.endpoint) {
                    state = genState(expose);
                } else {
                    switch (expose.name) {
                        case 'contact':
                            state = statesDefs.contact;
                            states.push(statesDefs.opened, ea.STATE);
                            break;

                        case 'battery_low':
                            state = statesDefs.heiman_batt_low;
                            break;

                        case 'tamper':
                            state = statesDefs.tamper;
                            break;

                        case 'water_leak':
                            state = statesDefs.water_detected;
                            break;

                        case 'lock':
                            state = statesDefs.child_lock;
                            break;

                        case 'occupancy':
                            state = statesDefs.occupancy;
                            break;

                        default:
                            state = genState(expose);
                            break;
                    }
                }
                if (state) states.push(state, expose.access);
                break;

            case 'text':
                state = genState(expose);
                states.push(state, expose.access);
                break;

            case 'lock':
            case 'fan':
            case 'cover':
                for (const prop of expose.features) {
                    switch (prop.name) {
                        case 'state':
                            states.push(genState(prop, 'switch'), prop.access);
                            break;
                        default:
                            states.push(genState(prop), prop.access);
                            break;
                    }
                }
                break;

            case 'climate':
                for (const prop of expose.features) {
                    switch (prop.name) {
                        case 'away_mode':
                            states.push(statesDefs.climate_away_mode, prop.access);
                            break;
                        case 'system_mode':
                            states.push(statesDefs.climate_system_mode, prop.access);
                            break;
                        case 'running_mode':
                            states.push(statesDefs.climate_running_mode, prop.access);
                            break;
                        default:
                            states.push(genState(prop), prop.access);
                            break;
                    }
                }
                break;

            case 'composite':
                for (const prop of expose.features) {
                    const st = genState(prop);
                    st.prop = expose.property;
                    st.inOptions = true;
                    st.setterOpt = (value, options) => {
                        const result = {};
                        options[prop.property] = value;
                        result[expose.property] = options;
                        console.log('setterOpt  for ' +  expose.property + ' ' +  prop.property +  '- composite - value ' + JSON.stringify(value) + ' options ' + JSON.stringify(options) + ' result ' + JSON.stringify(result) );
                        return result;
                    };
                    if (prop.access & ea.SET) {
                        st.setter = (value, options) => {
                            const result = {};
                            options[prop.property] = value;
                            result[expose.property] = options;
                            console.log('setter  for ' +  expose.property + ' ' +  prop.property +  '- composite - value ' + JSON.stringify(value) + ' options ' + JSON.stringify(options) + ' result ' + JSON.stringify(result) );
                            return result;
                        };
                        st.setattr = expose.property;
                    };
                    if (prop.access & ea.STATE) {
                        st.getter = payload => {
                            if ( (payload.hasOwnProperty(expose.property)) && (payload[expose.property]  !== null) && payload[expose.property].hasOwnProperty(prop.property)) {
                                console.log('getter for ' +  expose.property + ' ' +  prop.property +  ' - composite - payload ' + JSON.stringify(payload) );
                                return !isNaN(payload[expose.property][prop.property]) ? payload[expose.property][prop.property] : undefined
                            }
                            else {
                                return undefined;
                            }
                        };
                    }
                    else {
                        st.getter = payload =>{ return undefined };
                    }
                    ;
                    states.push(st, prop.access);
                }
                break;
            default:
                console.log(`Unhandled expose type ${expose.type} for device ${model}`);
        }
    }
    const newDev = {
        models: [model],
        icon: icon,
        states: states,
        exposed: true,
    };
    console.log(`Created mapping for device ${model}: ${JSON.stringify(newDev, function(key, value) {
  if (typeof value === 'function') {
    return value.toString();
  } else {
    return value;
  }
}, ' ')}`);
    return newDev;
}

function applyExposes(mappedDevices, byModel, allExcludesObj) {
    // for exlude search
    const allExcludesStr = JSON.stringify(allExcludesObj);
    // create or update device from exposes
    for (const deviceDef of zigbeeHerdsmanConverters.definitions) {
        const strippedModel = (deviceDef.model) ? deviceDef.model.replace(/\0.*$/g, '').trim() : '';
        // check if device is mapped
        const existsMap = byModel.get(strippedModel);

        if ((deviceDef.hasOwnProperty('exposes') && (!existsMap || !existsMap.hasOwnProperty('states'))) || allExcludesStr.indexOf(strippedModel) > 0) {
            const newDevice = createFromExposes(strippedModel, deviceDef);
            if (!existsMap) {
                mappedDevices.push(newDevice);
                byModel.set(strippedModel, newDevice);
            } else {
                existsMap.states = newDevice.states;
                existsMap.exposed = true;
            }
        }
    }
}

module.exports = {
    applyExposes: applyExposes,
};
