'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const rgb = require('./rgb');
const utils = require('./utils');
const colors = require('./colors');
const ea = require('zigbee-herdsman-converters/lib/exposes').access;

//const LocalData = { options:{ newCompositeMethod: true } };
//const LocalData = { options:{  } };
const __logger = undefined;

function genState(expose, overrides) {
    const role = overrides?.role;
    const name = overrides?.name;
    const desc = overrides?.desc;
    let state;
    const readable = (expose.access & (ea.STATE_GET)) > 0;
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
                role: role || (readable ? 'state' : 'button'),
                write: writable,
                read: readable,
                type: `boolean`,
            };
            if (readable) {
                state.getter = payload => payload[propName] === (typeof expose.value_on == 'boolean' ? expose.value_on : expose.value_on || 'ON');
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
                min: expose.value_min,
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
            return state;
    }
    if (overrides?.fromComposite) {
        if (overrides?.channelID) {
            state.compositeKey = overrides.channelID;
            state.compositeTimeout = 250;
            state.compositeState = overrides.channelID;
        }
        else {
            state.inOptions = true;
            state.setterOpt = (value, options) => {
                const result = {};
                options[expose.property] = value;
                result[expose.property] = options;
                return result;
            };
            if (expose.access & ea.SET) {
                state.setter = (value, options) => {
                    const result = {};
                    options[expose.property] = value;
                    result[expose.property] = options;
                    return result;
                };
                state.setattr = expose.property;
            };
            if (expose.access & ea.STATE) {
                expose.getter = payload => {
                    if ((payload.hasOwnProperty(expose.property)) && (payload[expose.property] !== null) && payload[expose.property].hasOwnProperty(expose.property)) {
                        return !isNaN(payload[expose.property][expose.property]) ? payload[expose.property][expose.property] : undefined;
                    } else {
                        return undefined;
                    }
                };
            } else {
                expose.getter = payload => undefined;
            }
        }
    }


    return state;
}


function generateCompositeStates(expose, _channelID, options)
{
    const states = [];
    const stname = `${_channelID}${expose.property}`;
    const stateId = stname.replace(/\*/g, '');
    const stateName = (expose.description || expose.name);
    const channelID = options.newCompositeMethod ? `c_${stateId}.` : '';
    if (options.newCompositeMethod) {

        if (typeof stname !== 'string') return undefined;;
        states.push({
            id: stateId,
            name: stateName,
            icon: undefined,
            role: 'state',
            write: Boolean (expose.access & ea.SET),
            read: Boolean(expose.access & ea.GET),
            type: 'string',
            getter: (value) => { return (typeof value === 'object' ? JSON.stringify(value) : value) },
            setter: (value) => {
                try {
                    return JSON.parse(value);
                }
                catch (error) {
                    return { error: error.message }
                }
            }
        })

    }
    for (const prop of expose.features) {
        if (prop.type === 'composite' || prop.type === 'list') {
            states.push(...generateCompositeStates(prop, channelID, options))
        }
        else
            states.push(genState(prop, options.newCompositeMethod ? { fromComposite: true, name: `${channelID}${prop.name}` , channelID: stateId }: { fromComposite: true }))
        /*
        switch (prop.type) {
            case 'numeric':
            case 'text':
            case 'binary':
            {
                const st = genState(prop, 'state', `${channelID}${prop.name}`);
                st.prop = expose.property;
                st.inOptions = !LocalData.options.newCompositeMethod;
                if (LocalData.options.newCompositeMethod) {
                    st.compositeKey = stateId;
                    st.compositeTimeout = 250;
                    st.compositeState = stateId;
                } else
                {
                    // if we have a composite expose, the value have to be an object {expose.property : {prop.property: value}}
                // I'm not fully sure, as it really needed, but
                    st.setterOpt = (value, options) => {
                        const result = {};
                        options[prop.property] = value;
                        result[expose.property] = options;
                        return result;
                    };
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
                }
                pushToStates(st, prop.access);
                break;
            }
            case 'list': {
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
                    break;
                }
            }

        }
            */
    }

    return states;

}
function createFromExposes(model, def, device, options, log) {
    const { getStateDefinition } = require('./models');
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

    function modifyState(state, properties, clone) {
        const rv = clone ? {} : state;
        if (clone) for (const prop of Object.keys(state))
            rv[prop] = state[prop];
        for (const prop of Object.keys(properties)) {
            if (properties[prop] != undefined)
                rv[prop] = properties[prop];
        }
        return rv;
    }

    if (typeof def.exposes == 'object') {
        for (const expose of def.exposes) {
            genStateFromExpose(expose, def);
        }
    }

    // maybee here check manufacturerName for tuya devices
    if (typeof def.exposes == 'function') {
        const expFunction = def.exposes((device === undefined || device === null) ? {isDummyDevice: true} : device, {});   // maybee here check manufacturerName for tuya devices
        for (const expose of expFunction) {
            genStateFromExpose(expose, def);
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
        const l = (len ? len: Object.keys(obj).length);
        if (l != prop.length) return false;
        for (const key of prop) {
            if (!obj.hasOwnProperty(key)) return false;
        }
        return true;
    };

    function definitionHasTZHandler(definition, id) {
        const tz = definition?.herdsmanModel?.toZigbee;
        for (const converter of tz) {
            if (converter?.key?.includes(id))
                return true;
        }
        return false;
    }

    function genStateFromExpose(expose, deviceDefinition) {
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
                            pushToStates(modifyState( getStateDefinition('state'), {
                                id:stateNameS,
                                name: `Switch state ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                getter: (payload) => (payload[stateNameS] === (prop.value_on || 'ON')),
                                epname: expose.endpoint,
                                setterOpt: undefined,
                                setattr:'state',
                            }, true), prop.access);
                            /*
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
                            }, prop.access);*/
                            break;
                        }

                        case 'brightness': {
                            const stateNameB = expose.endpoint ? `brightness_${expose.endpoint}` : 'brightness';
                            pushToStates(modifyState(getStateDefinition('brightness'), {
                                id: stateNameB,
                                name: `Brightness ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                getter: payload => utils.bulbLevelToAdapterLevel(payload[stateNameB]),
                                epname: expose.endpoint,
                                setattr: 'brightness',
                            }, true), prop.access);
                            /*pushToStates({
                                id: expose.endpoint ? `brightness_${expose.endpoint}` : 'brightness',
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
                            */
                            if (definitionHasTZHandler(deviceDefinition, 'brightness_move')) {
                                const setattr = definitionHasTZHandler(deviceDefinition, 'brightness_move_onoff') ? 'brightness_move_onoff':'brightness_move';
                                pushToStates(modifyState(getStateDefinition('brightness_move'), {
                                    id: expose.endpoint ? `brightness_move_${expose.endpoint}` : 'brightness_move',
                                    name: `Dimming ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                    write: true,
                                    read: false,
                                    epname: expose.endpoint,
                                    setattr: setattr,
                                }, true), prop.access);
                            }
                            break;
                        }
                        case 'color_temp': {
                            const stateNameT = expose.endpoint ? `colortemp_${expose.endpoint}` : 'colortemp';
                            pushToStates(modifyState(getStateDefinition('colortemp'), {
                                id: expose.endpoint ? `colortemp_${expose.endpoint}` : 'colortemp',
                                prop: expose.endpoint ? `color_temp_${expose.endpoint}` : 'color_temp',
                                name: `Color temperature ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                epname: expose.endpoint,
                                getter: payload => payload[stateNameT] || payload[expose.endpoint ? `color_temp_${expose.endpoint}` : 'color_temp'],
                                setattr: 'color_temp',
                            }, true), prop.access);
                            /*pushToStates(
                                {
                                    id: expose.endpoint ? `colortemp_${expose.endpoint}` : 'colortemp',
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
                                prop.access);*/
                            if (definitionHasTZHandler(deviceDefinition, 'colortemp_move'))
                                pushToStates(modifyState(getStateDefinition('colortemp_move'), {
                                    id: expose.endpoint ? `colortemp_move_${expose.endpoint}` : 'colortemp_move',
                                    prop: expose.endpoint ? `colortemp_move_${expose.endpoint}` : 'colortemp_move',
                                    name: `Shift color temperature ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                    setattr: 'colortemp_move',
                                    epname: expose.endpoint,
                                }, true), prop.access);
                            break;
                        }
                        case 'color_xy':
                            colorXYprop = prop;
                            hasColorXY = true; break;
                        case 'color_hs': {
                            colorHSprop = prop;
                            hasColorHS = true;
                            if (definitionHasTZHandler(deviceDefinition, 'hue_move'))
                                pushToStates(modifyState(getStateDefinition('hue_move'), {
                                    id: expose.endpoint ? `hue_move_${expose.endpoint}` : 'hue_move',
                                    prop: expose.endpoint ? `hue_move_${expose.endpoint}`:'hue_move',
                                    name: `Hue shift ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                    epname: expose.endpoint,
                                    setattr: 'hue_move'
                                },true), prop.access);
                            if (definitionHasTZHandler(deviceDefinition, 'saturation_move'))
                                pushToStates(modifyState(getStateDefinition('saturation_move'), {
                                    id: expose.endpoint ? `saturation_move${expose.endpoint}` : 'saturation_move',
                                    prop: expose.endpoint ? `saturation_move${expose.endpoint}`:'saturation_move',
                                    name: `Saturation shift ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                    epname: expose.endpoint,
                                    setattr: 'saturation_move'
                                },true), prop.access);
                            break;
                        }
                        default:
                            pushToStates(genState(prop), prop.access);
                            break;
                    }
                }
                if (hasColorXY || hasColorHS) {
                    const nameWithEp = expose.endpoint ? `color_${expose.endpoint}` : 'color';
                    if (hasColorXY) pushToStates({
                        id:`hex_${nameWithEp}`,
                        name: `Hex Color ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                        icon: undefined,
                        role: 'level.color.rgb',
                        write: true,
                        read: true,
                        type: 'string',
                        setter: value => {
                            // hex color (no named allowed)
                            const rgbcolor = colors.ParseColor(value, true);
                            return rgbcolor;
                        },
                        setterOpt: (value, options) => {
                            const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                            const transitionTime = hasTransitionTime ? options.transition_time : 0;
                            return {...options, transition: transitionTime};
                        },
                        getter: payload => {
                            // Requires testing!

                            try {
                                // JSON
                                const colorJSON = JSON.parse(payload.replaceAll("'",'"'));
                                const numProp = Object.keys(colorJSON).length;
                                if (hasMultipleProperties(colorJSON, ['r', 'g', 'b'], numProp)) {
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
                            if (p.length < 7 && m && m[0].length == p.length) return '#000000'.substring(0, 7-p.length) + p;
                            return undefined;
                        },
                        epname: expose.endpoint,
                        setattr: 'color',
                    }, (colorHSprop ? colorHSprop.access : colorXYprop.access));
                    pushToStates({
                        id: nameWithEp,
                        name: `Mutable Color ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                        icon: undefined,
                        role: 'state',
                        write: true,
                        read: true,
                        type: 'string',
                        setter: value => {
                            const rv = colors.complexColor(value, true);
                            if (rv) return rv;
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
                            return colors.complexColor(payload, false);
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
                            prop:'color',
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
                            compositeState: 'color',
                            getter: (payload) => {
                                if (typeof payload.color == 'object') {
                                    if (payload.color?.hue) {
                                        return payload.color.hue;
                                    }
                                }
                            }
                        }, colorHSprop.access);
                        pushToStates({
                            id: `${channelWithEp}.saturation`,
                            prop:'color',
                            name: `Saturation`,
                            icon: undefined,
                            role: 'level.color.saturation',
                            write: true,
                            read: true,
                            type: 'number',
                            min: 0,
                            max: 100,
                            compositeKey: channelWithEp,
                            compositeTimeout: 500,
                            compositeState: 'color',
                            getter: (payload) => {
                                if (typeof payload.color == 'object') {
                                    if (payload.color?.saturation) {
                                        return payload.color.saturation;
                                    }
                                }
                            }
                        }, colorHSprop.access);

                    }
                }

                pushToStates(getStateDefinition('transition_time'), ea.STATE_SET);
                break;
            }
            case 'switch':
                for (const prop of expose.features) {
                    switch (prop.name) {
                        case 'state':
                            pushToStates(genState(prop, { role:'switch' }), prop.access);
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
                            state = modifyState(genState(expose, {role:'value.battery'}), {
                                icon:'img/battery_p.png',
                            });
                            //state = getStateDefinition('battery');
                            break;

                        case 'voltage':
                            state = genState(expose, {role:'level.voltage'});
                            // state = getStateDefinition('voltage')
                            break;

                        case 'temperature':
                            state = genState(expose, {role:'value.temperature'});
                            //state = getStateDefinition('temperature');
                            break;

                        case 'humidity':
                            state = genState(expose, {role:'value.humidity'});
                            //state = getStateDefinition('humidity');
                            break;

                        case 'pressure':
                            state = genState(expose, {role:'value.pressure'});
                            //state = getStateDefinition('pressure');
                            break;

                        case 'illuminance':
                            state = genState(expose, {role:'value.brightness', name: 'illuminance_raw'} )
                            //state = getStateDefinition('illuminance_raw');
                            break;

                        case 'illuminance_lux':
                            state = genState(expose, {role:'value.brightness', name:'illuminance'});
                            //state = getStateDefinition('illuminance');
                            break;

                        case 'power':
                            state = genState(expose, {role:'value.power', name:'load_power'});
                            //state = getStateDefinition('load_power');
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
                        case 'contact': {
                            state = modifyState(genState(expose, {role:'sensor'}), { getter: payload => payload.contact });
                            // state = getStateDefinition('contact');
                            pushToStates(modifyState(genState(expose,{role: 'sensor'}), {
                                id:'opened',
                                name:'Is open',
                                role:'sensor.contact',
                                getter: payload => !payload.contact,
                            }), ea.STATE);
                            //pushToStates(getStateDefinition('opened'), ea.STATE);
                            break;
                        }
                        case 'battery_low':
                            state = genState(expose, {role:'indicator.lowbat', name:expose.name, desc:'Battery Status Low'});
                            break;

                        case 'tamper':
                            state = modifyState(genState(expose, {role: 'indicator',name: 'tampered'}), {
                                prop:'tamper',
                                name:'Is tampered'
                            });
                            break;

                        case 'water_leak':
                            state = modifyState(genState(expose, {role:'indicator', name:'detected'}), {
                                prop:'water_leak',
                                name:'Water leak detected'
                            })
                            // state = getStateDefinition('water_detected');
                            break;

                        case 'lock':
                            state = modifyState(genState(expose, {role:'switch.lock'}), {
                                prop: 'child_lock',
                                name: 'Locked',
                                getter: payload => (payload.child_lock === 'LOCKED'),
                                setter: (value) => (value) ? 'LOCK': 'UNLOCK',
                            });
                            // state = getStateDefinition('child_lock');
                            break;

                        case 'occupancy':
                            state = genState(expose, {role:'sensor.motion'});
                            //state = getStateDefinition('occupancy');
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
                            pushToStates(genState(prop, {role:'switch'}), prop.access);
                            break;
                        default:
                            pushToStates(genState(prop), prop.access);
                            break;
                    }
                }
                break;

            case 'climate':
                for (const prop of expose.features) {
                    pushToStates(genState(prop), prop.access);
                }
                break;

            case 'composite':
            {
                const cStates = generateCompositeStates(expose, '', options)
                for (const state of cStates)
                    pushToStates(state, expose.access);
                break;
            }
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

async function applyHerdsmanModel(modelDesc, options) {
    try {
        const newModel = createFromExposes(modelDesc.key, modelDesc, modelDesc.device, options)
        if (newModel) {
            if (modelDesc.UUID) newModel.UUID = modelDesc.UUID;
        }
        return { newModel:newModel, message:'', error:'' };
    }
    catch (error) {
        return { model:undefined, message:'Error in applyHerdsmanModel', error:error};
    }
}

module.exports = {
    applyHerdsmanModel: applyHerdsmanModel,
};
