'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const states = require(__dirname + '/states.js').states;
const safeJsonStringify = require('./json');

const defaultIcon = 'img/exposed.png';
const lightIcon = 'img/exposed.png';

function createFromExposes(model, def) {
    const states = [];
    let icon = defaultIcon;
    for (const expose of def.exposes) {
        let stateName;
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
        if (!existsMap && deviceDef.hasOwnProperty('exposes')) {
            const newDevice = createFromExposes(strippedModel, deviceDef);
            mappedDevices.push(newDevice);
            byModel.set(strippedModel, newDevice);
        }
    }
}

module.exports = {
    applyExposes: applyExposes,
};