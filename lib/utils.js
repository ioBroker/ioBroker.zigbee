'use strict';

/**
 * Converts a bulb level of range [0...254] to an adapter level of range [0...100]
 * @param {number} the bulb level of range [0...254]
 * @returns {the calculated adapter level}
 */
function bulbLevelToAdapterLevel(bulbLevel) {
    // Convert from bulb levels [0...254] to adapter levels [0...100]:
    // - Bulb level 0 is a forbidden value according to the ZigBee spec "ZigBee Cluster Library
    //   (for ZigBee 3.0) User Guide", but some bulbs (HUE) accept this value and interpret this
    //   value as "switch the bulb off".
    // - A bulb level of "1" is the "minimum possible level" which should mean "bulb off",
    //   but there are bulbs that do not switch off (they need "0", some IKEA bulbs are affected).
    // - No visible difference was seen between bulb level 1 and 2 on HUE LCT012 bulbs.
    //
    // Conclusion:
    // - We map adapter level "0" to the (forbidden) bulb level "0" that seems to switch all
    //   known bulbs.
    // - Bulb level "1" is not used, but if received nevertheless, it is converted to
    //   adapter level "0" (off).
    // - Bulb level range [2...254] is linearly mapped to adapter level range [1...100].
    if (bulbLevel >= 2) {
        // Perform linear mapping of range [2...254] to [1...100]
        return Math.round((bulbLevel - 2) * 99 / 252) + 1;
    } else {
        // The bulb is considered off. Even a bulb level of "1" is considered as off.
        return 0;
    } // else
}

/**
 * Converts an adapter level of range [0...100] to a bulb level of range [0...254]
 * @param {number} the adapter level of range [0...100]
 * @returns {the calculated bulb level}
 */
function adapterLevelToBulbLevel(adapterLevel) {
    // Convert from adapter levels [0...100] to bulb levels [0...254].
    // This is the inverse of function bulbLevelToAdapterLevel().
    // Please read the comments there regarding the rules applied here for mapping the values.
    if (adapterLevel) {
        // Perform linear mapping of range [1...100] to [2...254]
        return Math.round((adapterLevel - 1) * 252 / 99) + 2;
    } else {
        // Switch the bulb off. Some bulbs need "0" (IKEA), others "1" (HUE), and according to the
        // ZigBee docs "1" is the "minimum possible level"... we choose "0" here which seems to work.
        return 0;
    } // else
}

function bytesArrayToWordArray(ba) {
    const wa = [];
    for (let i = 0; i < ba.length; i++) {
        wa[(i / 2) | 0] |= ba[i] << (8 * (i % 2));
    }
    return wa;
}

// If the value is greater than 1000, kelvin is assumed.
// If smaller, it is assumed to be mired.
function toMired(t) {
    let miredValue = t;
    if (t > 1000) {
        miredValue = miredKelvinConversion(t);
    }
    return miredValue;
}

function miredKelvinConversion(t) {
    return (1000000 / t).toFixed();
}

/**
 * Converts a decimal number to a hex string with zero-padding
 * @param {number} decimal The number to convert
 * @param {number} padding The desired length of the hex string, padded with zeros
 * @returns {it is string}
 */
function decimalToHex(decimal, padding) {
    let hex = Number(decimal).toString(16);
    padding = typeof padding === 'undefined' || padding === null ? 2 : padding;

    while (hex.length < padding) {
        hex = '0' + hex;
    }

    return hex;
}

function getZbId(adapterDevId) {
    const idx = adapterDevId.indexOf('group');
    if (idx > 0) {
        return adapterDevId.substr(idx + 6);
    }
    return `0x${adapterDevId.split('.')[2]}`;
}

function getAdId(adapter, id) {
    return `${adapter.namespace}.${id.split('.')[2]}`; // iobroker device id
}

function flatten(arr) {
    return arr.reduce((flat, toFlatten) =>
        flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten), []);
}

const forceEndDevice = ['QBKG03LM', 'QBKG04LM', 'ZNMS13LM', 'ZNMS12LM'];

/*flatten(
    ['QBKG03LM', 'QBKG04LM', 'ZNMS13LM', 'ZNMS12LM']
        .map(model => zigbeeHerdsmanConverters.findByModel(model))
        .map(mappedModel => mappedModel.zigbeeModel));
*/
// Xiaomi uses 4151 and 4447 (lumi.plug) as manufacturer ID.
const xiaomiManufacturerID = [4151, 4447];
const ikeaTradfriManufacturerID = [4476];

function sanitizeImageParameter(parameter) {
    const replaceByDash = [/\?/g, /&/g, /[^a-z\d\-_./:]/gi, /[/]/gi];
    let sanitized = parameter;
    replaceByDash.forEach(r => sanitized = sanitized.replace(r, '-'));
    return sanitized;
}

function getDeviceIcon(definition) {
    const icon = definition.icon;
    if (icon) {
        return icon;
    }
    return `https://www.zigbee2mqtt.io/images/devices/${sanitizeImageParameter(definition.model)}.png`;
}

function getModelRegEx( model) {
    const stripModel = (model) ? model.replace(/\0.*$/g, '').trim() : '';
    return stripModel;
}

function getEntityInfo(entity) {
    if (entity) {
        return `Type: ${entity.type} Name: ${entity.name}`;
    }
    return `getEntityInfo: Illegal Entity ${JSON.stringify(entity)}`;
}


function byteArrayToString(data) {
    if (data) {
        return data.map(function (x) {
            x = x + 0x100;  // twos complement
            x = x.toString(16); // to hex
            x = ('00'+x).substr(-2); // zero-pad to 8-digits
            return x
        }).join('');
    }
    else return '';
}

function getNetAddress(address) {
    const TcpData = address.match(/[tT][cC][pP]:\/\/(.+)/);
    if (TcpData) {
        const hostarr = TcpData[1].split(':');
        return { strAddress :`tcp://${hostarr.length > 1 ? hostarr[0]+':'+hostarr[1] : hostarr[0]}`, host:hostarr[0], port:(hostarr.length > 1 ? hostarr[1] : undefined) };
    }
    return {};
}

function reverseByteString(source) {
    if (source && typeof source == 'string') {
        const rv = [];
        for (let i=0;i<source.length;i+=2)
            rv.push(source.slice(i,i+2))
        return rv.reverse().join('');
    }
    return '';
}



exports.secondsToMilliseconds   = seconds => seconds * 1000;
exports.bulbLevelToAdapterLevel = bulbLevelToAdapterLevel;
exports.adapterLevelToBulbLevel = adapterLevelToBulbLevel;
exports.bytesArrayToWordArray   = bytesArrayToWordArray;
exports.toMired                 = toMired;
exports.miredKelvinConversion   = miredKelvinConversion;
exports.decimalToHex            = decimalToHex;
exports.getZbId                 = getZbId;
exports.getAdId                 = getAdId;
exports.getModelRegEx           = getModelRegEx;
exports.isRouter                = device => (device.type === 'Router' || (typeof device.powerSource == 'string' && device.powerSource.startsWith('Mains'))) && !forceEndDevice.includes(device.modelID);
exports.isBatteryPowered        = device => device.powerSource && device.powerSource === 'Battery';
exports.isXiaomiDevice          = device =>
    device.modelID !== 'lumi.router' &&
    xiaomiManufacturerID.includes(device.manufacturerID) &&
    (!device.manufacturerName || !device.manufacturerName.startsWith('Trust'));
exports.isIkeaTradfriDevice     = device => ikeaTradfriManufacturerID.includes(device.manufacturerID);
exports.getDeviceIcon           = getDeviceIcon;
exports.getEntityInfo           = getEntityInfo;
exports.getNetAddress           = getNetAddress;
exports.byteArrayToString       = byteArrayToString;
exports.reverseByteString       = reverseByteString;