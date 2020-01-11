'use strict';

const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

function bytesArrayToWordArray(ba) {
    var wa = [],
		    i;
	  for (i = 0; i < ba.length; i++) {
		    wa[(i / 2) | 0] |= ba[i] << (8*(i % 2));
    }
    return wa;
}

/**
 * Converts a decimal number to a hex string with zero-padding
 * @param {number} decimal The number to convert
 * @param {number} padding The desired length of the hex string, padded with zeros
 * @returns {it is string}
 */
function decimalToHex(decimal, padding) {
    var hex = Number(decimal).toString(16);
    padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

    while (hex.length < padding) {
        hex = "0" + hex;
    }

    return hex;
}

function getZbId(adapterDevId) {
    return '0x' + adapterDevId.split('.')[2];
}

function getAdId(adapter, id) {
    return adapter.namespace + '.' + id.split('.')[2]; // iobroker device id
}

function flatten(arr) {
    return arr.reduce((flat, toFlatten) => {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
}

const forceEndDevice = flatten(
    ['QBKG03LM', 'QBKG04LM', 'ZNMS13LM', 'ZNMS12LM']
        .map((model) => zigbeeHerdsmanConverters.devices.find((d) => d.model === model))
        .map((mappedModel) => mappedModel.zigbeeModel));

// Xiaomi uses 4151 and 4447 (lumi.plug) as manufacturer ID.
const xiaomiManufacturerID = [4151, 4447];
const ikeaTradfriManufacturerID = [4476];

exports.secondsToMilliseconds = (seconds) => seconds * 1000;
exports.bytesArrayToWordArray = bytesArrayToWordArray;
exports.decimalToHex          = decimalToHex;
exports.getZbId               = getZbId;
exports.getAdId               = getAdId;
exports.isRouter              = (device) => device.type === 'Router' && !forceEndDevice.includes(device.modelID);
exports.isBatteryPowered      = (device) => device.powerSource && device.powerSource === 'Battery';
exports.isXiaomiDevice        = (device) => {
        return device.modelID !== 'lumi.router' && xiaomiManufacturerID.includes(device.manufacturerID) &&
            (!device.manufacturerName || !device.manufacturerName.startsWith('Trust'));
    };
exports.isIkeaTradfriDevice   = (device) => ikeaTradfriManufacturerID.includes(device.manufacturerID);