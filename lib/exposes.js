'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const statesDefs = require('./states.js').states;
const rgb = require('./rgb.js');
const utils = require('./utils.js');
const colors = require('./colors.js');
const ea = require('zigbee-herdsman-converters/lib/exposes.js').access;

function genState(expose, role, name, desc) {
    let state;
    const readable = (expose.access & ea.STATE) > 0;
    const writable = (expose.access & ea.SET) > 0;
    const stname = (name || expose.property);
    if (typeof stname !== 'string') return;
    const stateId = stname.replace(/\*/g, '');
    const stateName = (desc || expose.description || expose.name);
    const propName = expose.property;
    // 'switch' | 'lock' | 'binary' | 'list' | 'numeric' | 'enum' | 'text' | 'composite' | 'light' | 'cover' | 'fan' | 'climate';
    switch (expose.type) {
        case 'binary':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: writable,
                read: true,
                type: 'boolean',
            };
            if (readable) {
                state.getter = payload => payload[propName] === (expose.value_on || 'ON');
            } else {
                state.getter = payload => undefined;
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
                states: {},
            };

            for (const val of expose.values) {
                // if a definition of a enum states
                if (val == '') {
                    state.states[propName] = propName;
                } else {
                    state.states[val] = val;
                }
                state.type = typeof (val);
            }

            switch (state.type) {
                case 'boolean':
                    state.def = false;
                    break;
                case 'number':
                    state.def = 0;
                    break;
                case 'object':
                    state.def = {};
                    break;
                case 'string':
                    state.def = '';
                    break;
            }

            // if a definition of a special button
            if (state.states == ':') {
                state.states = propName + ':' + propName;
                state.type = 'object';
            }
            if (expose.endpoint) {
                state.epname = expose.endpoint;
                state.setattr = expose.name;
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

    return state;
}

function createFromExposes(model, def) {
    const states = [];
    // make the different (set and get) part of state is updatable if different exposes is used for get and set
    // as example:
    //  ...
    //  exposes.binary('some_option', ea.STATE, true, false).withDescription('Some Option'),
    //  exposes.composite('options', 'options')
    //      .withDescription('Some composite Options')
    //      .withFeature(exposes.binary('some_option', ea.SET, true, false).withDescription('Some Option'))
    //in this case one state - `some_option` has two different exposes for set an get, we have to combine it ...
    //

    function pushToStates(state, access) {
        if (state === undefined) {
            return 0;
        }
        if (access === undefined) {
            access = ea.ALL;
        }
        state.readable = (access & ea.STATE) > 0;
        state.writable = (access & ea.SET) > 0;
        const stateExists = states.findIndex((element, index, array) => element.id === state.id);
        if (stateExists < 0) {
            state.write = state.writable;
            if (!state.writable) {
                if (state.hasOwnProperty('setter')) {
                    delete state.setter;
                }
                if (state.hasOwnProperty('setattr')) {
                    delete state.setattr;
                }
            }
            if (!state.readable) {
                if (state.hasOwnProperty('getter')) {
                    // to awoid some warnings on unprocessed data
                    state.getter = payload => undefined;
                }
            }
            return states.push(state);
        } else {
            if ((state.readable) && (!states[stateExists].readable)) {
                states[stateExists].read = state.read;
                // as state is readable, it can't be button or event
                if (states[stateExists].role === 'button') {
                    states[stateExists].role = state.role;
                }
                if (states[stateExists].hasOwnProperty('isEvent')) {
                    delete states[stateExists].isEvent;
                }
                // we have to use the getter from "new" state
                if (state.hasOwnProperty('getter')) {
                    states[stateExists].getter = state.getter;
                }
                // trying to remove the `prop` property, as main key for get and set,
                // as it can be different in new and old states, and leave only:
                // setattr for old and id for new
                if ((state.hasOwnProperty('prop')) && (state.prop === state.id)) {
                    if (states[stateExists].hasOwnProperty('prop')) {
                        if (states[stateExists].prop !== states[stateExists].id) {
                            if (!states[stateExists].hasOwnProperty('setattr')) {
                                states[stateExists].setattr = states[stateExists].prop;
                            }
                        }
                        delete states[stateExists].prop;
                    }
                } else if (state.hasOwnProperty('prop')) {
                    states[stateExists].prop = state.prop;
                }
                states[stateExists].readable = true;
            }
            if ((state.writable) && (!states[stateExists].writable)) {
                states[stateExists].write = state.writable;
                // use new state `setter`
                if (state.hasOwnProperty('setter')) {
                    states[stateExists].setter = state.setter;
                }
                // use new state `setterOpt`
                if (state.hasOwnProperty('setterOpt')) {
                    states[stateExists].setterOpt = state.setterOpt;
                }
                // use new state `inOptions`
                if (state.hasOwnProperty('inOptions')) {
                    states[stateExists].inOptions = state.inOptions;
                }
                // as we have new state, responsible for set, we have to use new `isOption`
                // or remove it
                if (((!state.hasOwnProperty('isOption')) || (state.isOptions === false))
                    && (states[stateExists].hasOwnProperty('isOption'))) {
                    delete states[stateExists].isOption;
                } else {
                    states[stateExists].isOption = state.isOption;
                }

                // use new `setattr` or `prop` as `setattr`
                if (state.hasOwnProperty('setattr')) {
                    states[stateExists].setattr = state.setattr;
                } else if (state.hasOwnProperty('prop')) {
                    states[stateExists].setattr = state.prop;
                }

                // remove `prop` equal to if, due to prop is uses as key in set and get
                if (states[stateExists].prop === states[stateExists].id) {
                    delete states[stateExists].prop;
                }
                if (state.hasOwnProperty('epname')) {
                    states[stateExists].epname = state.epname;
                }

                states[stateExists].writable = true;
            }
            return states.length;
        }
    }

    const icon = utils.getDeviceIcon(def);

    if (typeof def.exposes == 'object') {
        for (const expose of def.exposes) {
            genStateFromExpose(expose);


        }
    }

    // maybee here check manufacturerName for tuya devices
    if (typeof def.exposes == 'function') {
        const expFunction = def.exposes(def, {});   // maybee here check manufacturerName for tuya devices

        for (const expose of expFunction) {
            genStateFromExpose(expose);
        }
    }

    const newDev = {
        models: [model],
        icon,
        states,
        exposed: true,
    };

    return newDev;



    function genStateFromExpose(expose) {
        let state;
        switch (expose.type) {
            case 'light':
                for (const prop of expose.features) {
                    switch (prop.name) {
                        case 'state': {
                            const stateNameS = expose.endpoint ? `state_${expose.endpoint}` : 'state';
                            pushToStates({
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
                            pushToStates({
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
                                getter: payload => utils.bulbLevelToAdapterLevel(payload[stateNameB]),
                                setter: value => utils.adapterLevelToBulbLevel(value),
                                setterOpt: (value, options) => {
                                    const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                    const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                    const preparedOptions = {...options, transition: transitionTime};
                                    preparedOptions.brightness = utils.adapterLevelToBulbLevel(value);
                                    return preparedOptions;
                                },
                                readResponse: resp => {
                                    const respObj = resp[0];
                                    if (respObj.status === 0 && respObj.attrData != undefined) {
                                        return utils.bulbLevelToAdapterLevel(respObj.attrData);
                                    }
                                },
                                epname: expose.endpoint,
                                setattr: 'brightness',
                            }, prop.access);
                            pushToStates(statesDefs.brightness_move, prop.access);
                            break;
                        }
                        case 'color_temp': {
                            const stateNameT = expose.endpoint ? `colortemp_${expose.endpoint}` : 'colortemp';
                            pushToStates(
                                {
                                    id: stateNameT,
                                    prop: expose.endpoint ? `color_temp_${expose.endpoint}` : 'color_temp',
                                    name: `Color temperature ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                    icon: undefined,
                                    role: 'level.color.temperature',
                                    write: true,
                                    read: true,
                                    type: 'number',
                                    // Ignore min and max value, so setting mireds and Kelvin with conversion to mireds works.
                                    // https://github.com/ioBroker/ioBroker.zigbee/pull/1433#issuecomment-1113837035
                                    min: undefined,
                                    max: undefined,
                                    setter: value => utils.toMired(value),
                                    setterOpt: (value, options) => {
                                        const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                        const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                        return {...options, transition: transitionTime};
                                    },
                                    epname: expose.endpoint,
                                    setattr: 'color_temp',
                                },
                                prop.access);
                            pushToStates(statesDefs.colortemp_move, prop.access);
                            break;
                        }
                        case 'color_xy': {
                            const stateNameC = expose.endpoint ? `color_${expose.endpoint}` : 'color';
                            pushToStates({
                                id: stateNameC,
                                prop: expose.endpoint ? `color_${expose.endpoint}` : 'color',
                                name: `Color ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                icon: undefined,
                                role: 'level.color.rgb',
                                write: true,
                                read: true,
                                type: 'string',
                                setter: value => {
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
                                        y: xy[1],
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
                                        return `#${utils.decimalToHex(colorval[0])}${utils.decimalToHex(colorval[1])}${utils.decimalToHex(colorval[2])}`;
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
                            pushToStates({
                                id: stateNameH,
                                prop: expose.endpoint ? `color_${expose.endpoint}` : 'color',
                                name: `Color ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                icon: undefined,
                                role: 'level.color.rgb',
                                write: true,
                                read: true,
                                type: 'string',
                                setter: value => {
                                    const _rgb = colors.ParseColor(value);
                                    const hsv = rgb.rgbToHSV(_rgb.r, _rgb.g, _rgb.b, true);
                                    return {
                                        hue: Math.min(Math.max(hsv.h, 1), 359),
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
                            pushToStates({
                                id: expose.endpoint ? `hue_${expose.endpoint}` : 'hue',
                                prop: expose.endpoint ? `color_${expose.endpoint}` : 'color',
                                name: `Hue ${expose.endpoint || ''}`.trim(),
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
                                            return {
                                                ...options,
                                                transition: transitionTime,
                                                hue_correction: JSON.parse(options.hue_calibration)
                                            };
                                        } catch {
                                            const hue_correction_table = [];
                                            options.hue_calibration.split(',').forEach(element => {
                                                const match = /([0-9]+):([0-9]+)/.exec(element);
                                                if (match && match.length === 3)
                                                    hue_correction_table.push({
                                                        in: Number(match[1]),
                                                        out: Number(match[2])
                                                    });
                                            });
                                            if (hue_correction_table.length > 0) {
                                                return {
                                                    ...options,
                                                    transition: transitionTime,
                                                    hue_correction: hue_correction_table
                                                };
                                            }
                                        }
                                    return {...options, transition: transitionTime};
                                },

                            }, prop.access);
                            pushToStates({
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
                                setter: (value, options) => ({
                                    hue: options.hue,
                                    saturation: value,
                                }),
                                setterOpt: (value, options) => {
                                    const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                    const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                    const hasHueCalibrationTable = options && options.hasOwnProperty('hue_calibration');
                                    if (hasHueCalibrationTable)
                                        try {
                                            return {
                                                ...options,
                                                transition: transitionTime,
                                                hue_correction: JSON.parse(options.hue_calibration)
                                            };
                                        } catch {
                                            const hue_correction_table = [];
                                            options.hue_calibration.split(',').forEach(element => {
                                                const match = /([0-9]+):([0-9]+)/.exec(element);
                                                if (match && match.length === 3)
                                                    hue_correction_table.push({
                                                        in: Number(match[1]),
                                                        out: Number(match[2])
                                                    });
                                            });
                                            if (hue_correction_table.length > 0) {
                                                return {
                                                    ...options,
                                                    transition: transitionTime,
                                                    hue_correction: hue_correction_table
                                                };
                                            }
                                        }
                                    return {...options, transition: transitionTime};
                                },

                            }, prop.access);
                            pushToStates(statesDefs.hue_move, prop.access);
                            pushToStates(statesDefs.saturation_move, prop.access);
                            pushToStates({
                                id: 'hue_calibration',
                                prop: 'color',
                                name: 'Hue color calibration table',
                                icon: undefined,
                                role: 'table',
                                write: true,
                                read: false,
                                type: 'string',
                                inOptions: true,
                                setter: (value, options) => ({
                                    hue: options.hue,
                                    saturation: options.saturation,
                                }),
                                setterOpt: (value, options) => {
                                    const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                    const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                    const hasHueCalibrationTable = options && options.hasOwnProperty('hue_calibration');
                                    if (hasHueCalibrationTable)
                                        try {
                                            return {
                                                ...options,
                                                transition: transitionTime,
                                                hue_correction: JSON.parse(options.hue_calibration)
                                            };
                                        } catch {
                                            const hue_correction_table = [];
                                            options.hue_calibration.split(',').forEach(element => {
                                                const match = /([0-9]+):([0-9]+)/.exec(element);
                                                if (match && match.length === 3) {
                                                    hue_correction_table.push({
                                                        in: Number(match[1]),
                                                        out: Number(match[2])
                                                    });
                                                }
                                            });
                                            if (hue_correction_table.length > 0) {
                                                return {
                                                    ...options,
                                                    transition: transitionTime,
                                                    hue_correction: hue_correction_table
                                                };
                                            }
                                        }
                                    return {...options, transition: transitionTime};
                                },
                            }, prop.access);
                            break;
                        }
                        default:
                            pushToStates(genState(prop), prop.access);
                            break;
                    }
                }
                pushToStates(statesDefs.transition_time, ea.STATE_SET);
                break;

            case 'switch':
                for (const prop of expose.features) {
                    switch (prop.name) {
                        case 'state':
                            pushToStates(genState(prop, 'switch'), prop.access);
                            break;
                        default:
                            pushToStates(genState(prop), prop.access);
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
                if (state) {
                    pushToStates(state, expose.access);
                }
                break;

            case 'enum':
                switch (expose.name) {

                    case 'action': {
                        // Ansatz:

                        // Action aufspalten in 2 Blöcke:
                        // Action (bekommt text ausser hold und release, auto reset nach 250 ms)
                        // Hold: wird gesetzt bei hold, gelöscht bei passendem Release

                        if (!Array.isArray(expose.values)) break;
                        const hasHold = expose.values.find((actionName) => actionName.includes('hold'));
                        const hasRelease = expose.values.find((actionName) => actionName.includes('release'));
                        const hasPress = expose.values.find((actionName) => actionName.includes('press'));
                        const hasPressRelease = expose.values.find((actionName) => actionName.includes('press_release'));
                        for (const actionName of expose.values) {
                            // is release state ? - skip
                            if (hasHold && hasRelease && actionName.includes('release')) continue;
                            // is hold state ?
                            if (hasHold && hasRelease && actionName.includes('hold')) {
                                const releaseActionName = actionName.replace('hold', 'release');
                                const releaseActionName2 = actionName.concat('_release');
                                state = {
                                    id: actionName.replace(/\*/g, ''),
                                    prop: 'action',
                                    name: actionName,
                                    icon: undefined,
                                    role: 'button',
                                    write: false,
                                    read: true,
                                    type: 'boolean',
                                    getter: payload => payload.action === actionName ? true : (payload.action === releaseActionName || payload.action === releaseActionName2 ? false : undefined),
                                };
                            } else if (hasPress && hasPressRelease && actionName.includes('press')) {
                                let getterKey = actionName.concat('_release');
                                if (expose.values.indexOf(getterKey) < 0) getterKey = actionName;
                                state = {
                                    id: actionName.replace(/\*/g, ''),
                                    prop: 'action',
                                    name: actionName,
                                    icon: undefined,
                                    role: 'button',
                                    write: false,
                                    read: true,
                                    type: 'boolean',
                                    getter: payload => payload.action === getterKey ? true : undefined,
                                    isEvent: true,
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
                                    getter: payload => payload.action === actionName ? true : undefined,
                                    isEvent: true,
                                };
                            };
                            pushToStates(state, expose.access);
                        }
                        state = null;
                        break;
                    }
                    default:
                        state = genState(expose);
                        break;
                }
                if (state) pushToStates(state, expose.access);
                break;

            case 'binary':
                if (expose.endpoint) {
                    state = genState(expose);
                } else {
                    switch (expose.name) {
                        case 'contact':
                            state = statesDefs.contact;
                            pushToStates(statesDefs.opened, ea.STATE);
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
                if (state) {
                    pushToStates(state, expose.access);
                }
                break;

            case 'text':
                state = genState(expose);
                pushToStates(state, expose.access);
                break;

            case 'lock':
            case 'fan':
            case 'cover':
                for (const prop of expose.features) {
                    switch (prop.name) {
                        case 'state':
                            pushToStates(genState(prop, 'switch'), prop.access);
                            break;
                        default:
                            pushToStates(genState(prop), prop.access);
                            break;
                    }
                }
                break;

            case 'climate':
                for (const prop of expose.features) {
                    switch (prop.name) {
                        case 'away_mode':
                            pushToStates(statesDefs.climate_away_mode, prop.access);
                            break;
                        case 'system_mode':
                            pushToStates(statesDefs.climate_system_mode, prop.access);
                            break;
                        case 'running_mode':
                            pushToStates(statesDefs.climate_running_mode, prop.access);
                            break;
                        default:
                            pushToStates(genState(prop), prop.access);
                            break;
                    }
                }
                break;

            case 'composite':
                for (const prop of expose.features) {
                    if (prop.type == 'numeric') {
                        const st = genState(prop);
                        st.prop = expose.property;
                        st.inOptions = true;
                        // I'm not fully sure, as it really needed, but
                        st.setterOpt = (value, options) => {
                            const result = {};
                            options[prop.property] = value;
                            result[expose.property] = options;
                            return result;
                        };
                        // if we have a composite expose, the value have to be an object {expose.property : {prop.property: value}}
                        if (prop.access & ea.SET) {
                            st.setter = (value, options) => {
                                const result = {};
                                options[prop.property] = value;
                                result[expose.property] = options;
                                return result;
                            };
                            st.setattr = expose.property;
                        }
                        // if we have a composite expose, the payload will be an object {expose.property : {prop.property: value}}
                        if (prop.access & ea.STATE) {
                            st.getter = payload => {
                                if ((payload.hasOwnProperty(expose.property)) && (payload[expose.property] !== null) && payload[expose.property].hasOwnProperty(prop.property)) {
                                    return !isNaN(payload[expose.property][prop.property]) ? payload[expose.property][prop.property] : undefined;
                                } else {
                                    return undefined;
                                }
                            };
                        } else {
                            st.getter = payload => undefined;
                        }
                        pushToStates(st, prop.access);
                    }

                    if (prop.type == 'list') {
                        for (const propList of prop.item_type.features) {
                            const st = genState(propList);
                            st.prop = expose.property;
                            st.inOptions = true;
                            st.setterOpt = (value, options) => {
                                const result = {};
                                options[propList.property] = value;
                                result[expose.property] = options;
                                return result;
                            };
                            if (propList.access & ea.SET) {
                                st.setter = (value, options) => {
                                    const result = {};
                                    options[propList.property] = value;
                                    result[expose.property] = options;
                                    return result;
                                };
                                st.setattr = expose.property;
                            }
                            if (propList.access & ea.STATE) {
                                st.getter = payload => {
                                    if ((payload.hasOwnProperty(expose.property)) && (payload[expose.property] !== null) && payload[expose.property].hasOwnProperty(propList.property)) {
                                        return !isNaN(payload[expose.property][propList.property]) ? payload[expose.property][propList.property] : undefined;
                                    } else {
                                        return undefined;
                                    }
                                };
                            } else {
                                st.getter = payload => undefined;
                            }

                            st.id = st.prop + '_' + st.id;
                            pushToStates(st, propList.access);
                        }
                    }
                }
                break;
            case 'list':
                // is not mapped
                //     for (const prop of expose) {
                //        let nam = prop.name;

                //    }
                break;
            default:
                console.log(`Unhandled expose type ${expose.type} for device ${model}`);

        }
    }

}
function applyExposes(mappedDevices, byModel) {
    // create or device from exposes
    for (const deviceDef of zigbeeHerdsmanConverters.definitions) {
        applyDeviceDef(mappedDevices, byModel, deviceDef);

        if (deviceDef.hasOwnProperty('whiteLabel')) {
            for (const deviceWhiteLabel of deviceDef.whiteLabel) {
                applyDeviceDef(mappedDevices, byModel, {
                    ...deviceDef,
                    model: deviceWhiteLabel.model,
                    vendor: deviceWhiteLabel.vendor,
                    description: deviceWhiteLabel.description || deviceDef.description,
                });
            }
        }
    }
}

function applyDeviceDef(mappedDevices, byModel, deviceDef) {
    const stripModel = utils.getModelRegEx(deviceDef.model);
    const existsMap = byModel.get(stripModel);

    if (deviceDef.hasOwnProperty('exposes') && (!existsMap || !existsMap.hasOwnProperty('states'))) {
        try {
            const newDevice = createFromExposes(stripModel, deviceDef);
                mappedDevices.push(newDevice);
                byModel.set(stripModel, newDevice);

        } catch (e) {
            console.log(`Wrong expose device definition ${deviceDef.vendor} ${stripModel}`);
        }
    }
}

module.exports = {
    applyExposes: applyExposes,
};
