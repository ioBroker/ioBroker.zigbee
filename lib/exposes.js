'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const statesDefs = require(__dirname + '/states.js').states;
const safeJsonStringify = require('./json');

const defaultIcon = 'img/exposed.png';
const lightIcon = 'img/exp_light.png';

function createFromExposes(model, def) {
    const states = [];
    let icon = defaultIcon;
    for (const expose of def.exposes) {
        let stateName;
        let state;
        switch (expose.type) {
        case 'light':
            icon = lightIcon;
            let prop = expose.features.find((e) => e.name === 'state');
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
            break;

        case 'numeric':
            switch (expose.name) {
                case 'linkquality':
                    state = undefined;
                    break;
                case 'battery':
                    state = statesDefs.battery;
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
                        epname: expose.endpoint,
                    }
                    break;
            }
            if (state) states.push(state);
            break;

        case 'enum':
            switch (expose.name) {
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
        if (deviceDef.hasOwnProperty('exposes')) {
            const newDevice = createFromExposes(strippedModel, deviceDef);
            if (!existsMap) {
                mappedDevices.push(newDevice);
                byModel.set(strippedModel, newDevice);
            } else {
                // check states exists
                if (!existsMap.hasOwnProperty('states')) {
                    existsMap.states = newDevice.states;
                }
            }
        }
    }
}

module.exports = {
    applyExposes: applyExposes,
};