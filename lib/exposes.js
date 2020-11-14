'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const statesDefs = require(__dirname + '/states.js').states;
const safeJsonStringify = require('./json');

const defaultIcon = 'img/exposed.png';
const lightIcon = 'img/exp_light.png';

function createFromExposes(model, def) {
    const states = [];
    //let icon = defaultIcon
    let icon = `https://www.zigbee2mqtt.io/images/devices/${model}.jpg`;
    for (const expose of def.exposes) {
        let stateName;
        let state;
        let prop;

        switch (expose.type) {
        case 'light':
            icon = lightIcon;
            prop = expose.features.find((e) => e.name === 'state');
            if (prop) {
                stateName = expose.endpoint ? `state_${expose.endpoint}` : 'state';
                states.push({
                    id: stateName,
                    name: `Switch state ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                    icon: undefined,
                    role: 'switch',
                    write: true,
                    read: true,
                    type: 'boolean',
                    getter: payload => (payload[stateName] === prop.value_on),
                    setter: (value) => (value) ? prop.value_on : prop.value_off,
                    epname: expose.endpoint,
                    setattr: 'state',
                });
            }
            prop = expose.features.find((e) => e.name === 'brightness');
            if (prop) {
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
                    epname: expose.endpoint,
                    setattr: 'brightness',
                });
            }
            prop = expose.features.find((e) => e.name === 'color_temp');
            if (prop) {
                stateName = expose.endpoint ? `colortemp_${expose.endpoint}` : 'colortemp';
                states.push({
                    id: stateName,
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
            }
            states.push(statesDefs.transition_time);
            break;

        case 'switch':
            prop = expose.features.find((e) => e.name === 'state');
            if (prop) {
                stateName = expose.endpoint ? `state_${expose.endpoint}` : 'state';
                state = {
                    id: stateName,
                    name: `Switch state ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                    icon: undefined,
                    role: 'switch',
                    write: true,
                    read: true,
                    type: 'boolean',
                    getter: payload => (payload[stateName] === prop.value_on),
                    setter: (value) => (value) ? prop.value_on : prop.value_off,
                    epname: expose.endpoint,
                    setattr: 'state',
                };
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
                state = {
                    id: expose.property,
                    prop: expose.property,
                    name: expose.name,
                    icon: undefined,
                    role: 'state',
                    write: [2, 3, 7].includes(expose.access),
                    read: true,
                    type: 'number',
                    min: expose.value_min || 0,
                    max: expose.value_max,
                    unit: expose.unit,
                    epname: expose.endpoint,
                }
                break;
            }
            if (state) states.push(state);
            break;

        case 'enum':
            switch (expose.name) {
            case 'action':
                for (const actionName of expose.values) {
                    state = {
                        id: actionName,
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
                    states.push(state);
                }
                state = null;
                break;

            default:
                state = {
                    id: expose.property,
                    prop: expose.property,
                    name: expose.name,
                    icon: undefined,
                    role: 'state',
                    write: [2, 3, 7].includes(expose.access),
                    read: true,
                    type: 'string',
                }
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
                state = {
                    id: expose.property,
                    prop: expose.property,
                    name: expose.name,
                    icon: undefined,
                    role: 'state',
                    read: true,
                    type: 'boolean',
                    getter: payload => (payload.state === expose.value_on),
                }
                break;
            }
            if (state) states.push(state);
            break;
        
        case 'text':
            state = {
                id: expose.property,
                prop: expose.property,
                name: expose.name,
                icon: undefined,
                role: 'state',
                write: [2, 3, 7].includes(expose.access),
                read: true,
                type: 'string',
            }
            states.push(state);
            break;
        
        default:
            console.log(`Unhandled expose type ${expose.type} for device ${model}`);
        }
    }
    const newDev = {
        models: [model],
        icon: icon,
        states: states,
    };
    console.log(`Created mapping for device ${model}: ${safeJsonStringify(newDev)}`);
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
            if (!existsMap) {
                mappedDevices.push(newDevice);
                byModel.set(strippedModel, newDevice);
            } else {
                existsMap.states = newDevice.states;
            }
        }
    }
}

module.exports = {
    applyExposes: applyExposes,
};