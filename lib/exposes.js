'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const statesDefs = require(__dirname + '/states.js').states;
const safeJsonStringify = require('./json');
const rgb = require(__dirname + '/rgb.js');
const utils = require(__dirname + '/utils.js');

function genState(expose, role, name, desc) {
    let state;
    // write if access.SET or access.STATE_SET or access.ALL
    const write = [2, 3, 7].includes(expose.access);
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
                write: write,
                read: true,
                type: 'boolean',
                getter: payload => (payload[propName] === (expose.value_on || 'ON')),
                setter: (value) => (value) ? (expose.value_on || 'ON') : (expose.value_off || 'OFF'),
                setattr: propName,
            }
            if (expose.endpoint) {
                state.endpoint = expose.endpoint;
            }
            break;

        case 'numeric':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: write,
                read: true,
                type: 'number',
                min: expose.value_min || 0,
                max: expose.value_max,
                unit: expose.unit,
            }
            if (expose.endpoint) {
                state.endpoint = expose.endpoint;
            }
            break;

        case 'enum':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: write,
                read: true,
                type: 'string',
                states: expose.values.map((item) => `${item}:${item}`).join(';'),
            }
            if (expose.endpoint) {
                state.endpoint = expose.endpoint;
            }
            break;
        
        case 'text':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: write,
                read: true,
                type: 'string',
            }
            if (expose.endpoint) {
                state.endpoint = expose.endpoint;
            }
            break;

        default:
            break;
    }

    return state;
}

function createFromExposes(model, def) {
    const states = [];
    let icon = `https://www.zigbee2mqtt.io/images/devices/${model}.jpg`;
    for (const expose of def.exposes) {
        let stateName;
        let state;

        switch (expose.type) {
        case 'light':
            for (const prop of expose.features) {
                switch (prop.name) {
                    case 'state':
                        stateName = expose.endpoint ? `state_${expose.endpoint}` : 'state';
                        states.push({
                            id: stateName,
                            name: `Switch state ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                            icon: undefined,
                            role: 'switch',
                            write: true,
                            read: true,
                            type: 'boolean',
                            getter: payload => (payload[stateName] === (prop.value_on || 'ON')),
                            setter: (value) => (value) ? prop.value_on || 'ON' : prop.value_off || 'OFF',
                            epname: expose.endpoint,
                            setattr: 'state',
                        });
                        break;

                    case 'brightness':
                        stateName = expose.endpoint ? `brightness_${expose.endpoint}` : 'brightness';
                        states.push({
                            id: stateName,
                            name: `Brightness ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                            icon: undefined,
                            role: 'level.dimmer',
                            write: true,
                            read: true,
                            type: 'number',
                            min: 0, // ignore expose.value_min
                            max: 100, // ignore expose.value_max
                            getter: payload => {
                                return utils.bulbLevelToAdapterLevel(payload[stateName]);
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
                        });
                        break;
                    
                    case 'color_temp':
                        stateName = expose.endpoint ? `colortemp_${expose.endpoint}` : 'colortemp';
                        states.push({
                            id: stateName,
                            prop: expose.endpoint ? `color_temp_${expose.endpoint}` : 'color_temp',
                            name: `Color temperature ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                            icon: undefined,
                            role: 'level.color.temperature',
                            write: true,
                            read: true,
                            type: 'number',
                            min: expose.value_min,
                            max: expose.value_max,
                            setterOpt: (value, options) => {
                                const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                return {...options, transition: transitionTime};
                            },
                            epname: expose.endpoint,
                            setattr: 'colortemp',
                        });
                        break;

                    case 'color_xy':
                        stateName = expose.endpoint ? `color_${expose.endpoint}` : 'color';
                        states.push({
                            id: stateName,
                            prop: expose.endpoint ? `color_${expose.endpoint}` : 'color',
                            name: `Color ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                            icon: undefined,
                            role: 'level.color.rgb',
                            write: true,
                            read: true,
                            type: 'string',
                            setter: (value) => {
                                // convert RGB to XY for set
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
                            },
                            setterOpt: (value, options) => {
                                const hasTransitionTime = options && options.hasOwnProperty('transition_time');
                                const transitionTime = hasTransitionTime ? options.transition_time : 0;
                                return {...options, transition: transitionTime};
                            },
                            epname: expose.endpoint,
                            setattr: 'color',
                        });
                        break;

                    default:
                        states.push(genState(prop));
                        break;
                }
            }
            states.push(statesDefs.transition_time);
            break;

        case 'switch':
            for (const prop of expose.features) {
                switch (prop.name) {
                    case 'state':
                        states.push(genState(prop, 'switch'));
                        break;
                    default:
                        states.push(genState(prop));
                        break;
                }
            }
            break;

        case 'numeric':
            switch (expose.name) {
            case 'linkquality':
                state = undefined;
                break;

            case 'battery':
                state = statesDefs.battery;
                break;

            case 'voltage':
                state = statesDefs.voltage;
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
            if (state) states.push(state);
            break;

        case 'enum':
            switch (expose.name) {
            case 'action':
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
                    states.push(state);
                }
                state = null;
                break;

            default:
                state = genState(expose);
                break;
            }
            if (state) states.push(state);
            break;

        case 'binary':
            switch (expose.name) {
            case 'contact':
                state = statesDefs.contact;
                states.push(statesDefs.opened);
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

            case 'occupancy':
                state = statesDefs.occupancy;
                break;
            
            default:
                state = genState(expose);
                break;
            }
            if (state) states.push(state);
            break;
        
        case 'text':
            state = genState(expose);
            states.push(state);
            break;

        case 'cover':
            for (const prop of expose.features) {
                switch (prop.name) {
                    case 'state':
                        states.push(genState(prop, 'switch'));
                        break;
                    default:
                        states.push(genState(prop));
                        break;
                }
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
    console.log(`Created mapping for device ${model}: ${safeJsonStringify(newDev, null, ' ')}`);
    return newDev;
}

function applyExposes(mappedDevices, byModel) {
    // create or update device from exposes
    for (const deviceDef of zigbeeHerdsmanConverters.definitions) {
        const strippedModel = (deviceDef.model) ? deviceDef.model.replace(/\0.*$/g, '').trim() : '';
        // check if device is mapped
        const existsMap = byModel.get(strippedModel);
        if (deviceDef.hasOwnProperty('exposes') && (!existsMap || !existsMap.hasOwnProperty('states'))) {
            const newDevice = createFromExposes(strippedModel, deviceDef);
            if (newDevice.states.length > 0) {
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
}

module.exports = {
    applyExposes: applyExposes,
};