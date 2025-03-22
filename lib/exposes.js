'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const statesDefs = require('./states').states;
const rgb = require('./rgb');
const utils = require('./utils');
const colors = require('./colors');
const ea = require('zigbee-herdsman-converters/lib/exposes').access;


const __logger = undefined;

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

function createFromExposes(model, def, device, log) {
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

    if (typeof def.exposes == 'object') {
        for (const expose of def.exposes) {
            genStateFromExpose(expose);
        }
    }

    // maybee here check manufacturerName for tuya devices
    if (typeof def.exposes == 'function') {
        const expFunction = def.exposes(device, {});   // maybee here check manufacturerName for tuya devices
        for (const expose of expFunction) {
            genStateFromExpose(expose);
        }
    }
    const icon = utils.getDeviceIcon(def);

    const newDev = {
        models: [model],
        states,
        icon,
        exposed: true,
    };

    return newDev;

    function hasMultipleProperties(obj, prop, len) {
        const l = (len ? len: Object.keys.length(obj));
        if (l != prop.length) return false;
        for (const key of prop) {
            if (!obj.hasOwnProperty(key)) return false;
        }
        return true;
    };

    function genStateFromExpose(expose) {
        let state;
        switch (expose.type) {
            case 'light': {
                let hasColorXY = false;
                let hasColorHS = false;
                let colorXYprop = undefined;
                let colorHSprop = undefined;

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
                        case 'color_xy':
                            colorXYprop = prop;
                            hasColorXY = true; break;
                        case 'color_hs': {
                            colorHSprop = prop;
                            hasColorHS = true;
                            pushToStates(statesDefs.hue_move, prop.access);
                            pushToStates(statesDefs.saturation_move, prop.access);
                            break;
                        }
                        default:
                            pushToStates(genState(prop), prop.access);
                            break;
                    }
                }
                if (hasColorXY || hasColorHS) {
                    const nameWithEp = expose.endpoint ? `color_${expose.endpoint}` : 'color';
                    pushToStates({
                        id: nameWithEp,
                        name: `Color ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                        icon: undefined,
                        role: 'level.color.rgb',
                        write: true,
                        read: true,
                        type: 'string',
                        setter: value => {
                            try {
                                // JSON
                                const colorJSON = JSON.parse(value.replaceAll("'",'"'));
                                const numProp = Object.keys(colorJSON).length;
                                if (hasMultipleProperties(colorJSON, ['hsb'], numProp)) return colorJSON;
                                if (hasMultipleProperties(colorJSON, ['hsl'], numProp)) return colorJSON;
                                if (hasMultipleProperties(colorJSON, ['hsv'], numProp)) return colorJSON;
                                if (hasMultipleProperties(colorJSON, ['h','s','b'], numProp)) return colorJSON;
                                if (hasMultipleProperties(colorJSON, ['h','s','v'], numProp)) return colorJSON;
                                if (hasMultipleProperties(colorJSON, ['h','s','l'], numProp)) return colorJSON;
                                if (hasMultipleProperties(colorJSON, ['hue', 'saturation'], numProp)) return colorJSON;
                                if (hasMultipleProperties(colorJSON, ['hex'], numProp)) return colorJSON;
                                if (hasMultipleProperties(colorJSON, ['rgb'], numProp)) return colorJSON;
                                if (hasMultipleProperties(colorJSON, ['x', 'y'], numProp)) return colorJSON;
                                if (hasMultipleProperties(colorJSON, ['r', 'g', 'b'], numProp)) return colorJSON;
                                //return { json:colorJSON, numProp:numProp, value:value };
                            }
                            catch (error) {
                                //return { error: error.message };
                            };
                            // hex or named color
                            const rgbcolor = colors.ParseColor(value);
                            return rgbcolor;
                        },
                        setterOpt: (value, options) => {
                            const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                            const transitionTime = hasTransitionTime ? options.transition_time : 0;
                            return {...options, transition: transitionTime};
                        },
                        getter: payload => {
                            if (typeof payload.color == 'object') {
                                const colorJSON = payload.color;
                                const color = JSON.stringify(colorJSON)
                                const numProp = Object.keys(colorJSON);
                                if (hasMultipleProperties(colorJSON, ['hsb'], numProp)) return color;
                                if (hasMultipleProperties(colorJSON, ['hsl'], numProp)) return color;
                                if (hasMultipleProperties(colorJSON, ['hsv'], numProp)) return color;
                                if (hasMultipleProperties(colorJSON, ['h','s','b'], numProp)) return color;
                                if (hasMultipleProperties(colorJSON, ['h','s','v'], numProp)) return color;
                                if (hasMultipleProperties(colorJSON, ['h','s','l'], numProp)) return color;
                                if (hasMultipleProperties(colorJSON, ['hue', 'saturation'], numProp)) return color;
                                if (hasMultipleProperties(colorJSON, ['hex'], numProp)) return color;
                                if (hasMultipleProperties(colorJSON, ['rgb'], numProp)) return color;
                                if (hasMultipleProperties(colorJSON, ['x', 'y'], numProp)) return color;
                                if (hasMultipleProperties(colorJSON, ['r', 'g', 'b'], numProp)) return color;
                            }
                            return undefined;
                        },
                        epname: expose.endpoint,
                        setattr: 'color',
                    }, (colorHSprop ? colorHSprop.access : colorXYprop.access));
                    if (hasColorXY) {
                        let channelWithEp = expose.endpoint ? `color_xy_${expose.endpoint}` : 'color_xy';
                        pushToStates({
                            id: `${channelWithEp}.x`,
                            name: `X`,
                            icon: undefined,
                            role: 'level.color',
                            write: true,
                            read: true,
                            type: 'number',
                            min: 0,
                            max: 1,
                            compositeKey: channelWithEp,
                            compositeTimeout: 500,
                            compositeState: 'color'
                        }, colorXYprop.access);
                        pushToStates({
                            id: `${channelWithEp}.y`,
                            name: `Y`,
                            icon: undefined,
                            role: 'level.color',
                            write: true,
                            read: true,
                            type: 'number',
                            min: 0,
                            max: 1,
                            compositeKey: channelWithEp,
                            compositeTimeout: 500,
                            compositeState: 'color'
                        }, colorXYprop.access);
                        channelWithEp = expose.endpoint ? `color_rgb_${expose.endpoint}` : 'color_rgb';
                        pushToStates({
                            id: `${channelWithEp}.r`,
                            name: `Red`,
                            icon: undefined,
                            role: 'level.color.red',
                            write: true,
                            read: true,
                            type: 'number',
                            min: 0,
                            max: 255,
                            compositeKey: channelWithEp,
                            compositeTimeout: 500,
                            compositeState: 'color',
                            composites: [`${channelWithEp}.r`,`${channelWithEp}.g`]
                        }, colorXYprop.access);
                        pushToStates({
                            id: `${channelWithEp}.g`,
                            name: `Green`,
                            icon: undefined,
                            role: 'level.color.green',
                            write: true,
                            read: true,
                            type: 'number',
                            min: 0,
                            max: 255,
                            compositeKey: channelWithEp,
                            compositeTimeout: 500,
                            compositeState: 'color',
                            composites: [`${channelWithEp}.x`,`${channelWithEp}.y`]
                        });
                        pushToStates({
                            id: `${channelWithEp}.b`,
                            name: `Blue`,
                            icon: undefined,
                            role: 'level.color.blue',
                            write: true,
                            read: true,
                            type: 'number',
                            min: 0,
                            max: 255,
                            compositeKey: channelWithEp,
                            compositeTimeout: 500,
                            compositeState: 'color'
                        }, colorXYprop.access);
                    }
                    if (hasColorHS) {
                        const channelWithEp = expose.endpoint ? `color_hs_${expose.endpoint}` : 'color_hs';
                        pushToStates({
                            id: `${channelWithEp}.hue`,
                            name: `Hue`,
                            icon: undefined,
                            role: 'level.color.hue',
                            write: true,
                            read: true,
                            type: 'number',
                            min: 0,
                            max: 360,
                            compositeKey: channelWithEp,
                            compositeTimeout: 500,
                            compositeState: 'color'
                        }, colorHSprop.access);
                        pushToStates({
                            id: `${channelWithEp}.saturation`,
                            name: `Saturation`,
                            icon: undefined,
                            role: 'level.color',
                            write: true,
                            read: true,
                            type: 'number',
                            min: 0,
                            max: 100,
                            compositeKey: channelWithEp,
                            compositeTimeout: 500,
                            compositeState: 'color'
                        }, colorHSprop.access);

                    }
                }

                pushToStates(statesDefs.transition_time, ea.STATE_SET);
                break;
            }
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
                            state = genState(expose);
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
                        //generate an 'action' state\
                        state = genState(expose);
                        state.isEvent = true;
                        pushToStates(state, expose.access);

                        if (!Array.isArray(expose.values)) break;
                        // identify hold/release pairs
                        // if pairs of (prefix)press(postfix) and (prefix)release(postfix) or
                        //              (prefix)hold(postfix) and (prefix)release(postfix)
                        // exist, the release action will not get its own state. Instead, the
                        // respective press or hold state will not be an event and be cleared at release time
                        //
                        const phr = {};
                        const phc = expose.values.filter((actionName) => actionName.match(/hold|press/gm));
                        for (const actionName of phc) {
                            const releasestr = actionName.replace(/hold|press/gm, 'release');
                            const release = expose.values.find((actionName) => actionName == releasestr);
                            phr[actionName]=release;
                            if (release) phr[release]= 'IGNORE';
                        }
                        for (const actionName of expose.values) {
                            const release = phr[actionName];
                            if (release === 'IGNORE') continue // a release message for which a press or hold exists.
                            if (release) { // a press or hold state with a matching release state
                                state = {
                                    id: actionName.replace(/\*/g, ''),
                                    prop: 'action',
                                    name: actionName,
                                    icon: undefined,
                                    role: 'button',
                                    write: false,
                                    read: true,
                                    type: 'boolean',
                                    getter: payload => payload.action === actionName ? true : (payload.action === release ? false : undefined),
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

async function applyExposeForDevice(mappedDevices, byModel, device) {
    const deviceDef = await zigbeeHerdsmanConverters.findByDevice(device);
    if (!deviceDef)  {
        return undefined;
    }
    return applyDeviceDef(mappedDevices, byModel, deviceDef, device);
}

function applyDeviceDef(mappedDevices, byModel, deviceDef, device) {
    const stripModel = utils.getModelRegEx(deviceDef.model);
    const existsMap = byModel.get(stripModel);
    if (deviceDef.hasOwnProperty('exposes') && (!existsMap || !existsMap.hasOwnProperty('states'))) {
        try {
            const newDevice = createFromExposes(stripModel, deviceDef, device);
            mappedDevices.push(newDevice);
            byModel.set(stripModel, newDevice);
            return newDevice;

        } catch (e) {
            return undefined;
        }
    }
    return existsMap;
}

module.exports = {
    applyExposeForDevice: applyExposeForDevice,
};
