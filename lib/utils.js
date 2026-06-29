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


function getMetaStates(optionVal) {
    try {
        const jsonObj = JSON.parse(optionVal);
        return jsonObj;
    }
    catch
    {
        try {
            const arr = optionVal.split(/[;,]/);
            return arr.map((o) => o.trim()).filter((o) => o.length > 0)
        }
        catch (e) {
            return []
        }
    }
}

function recursiveObjectCompare(a, b) {
    if (typeof a != typeof b) return false;
    if (typeof a == 'object') {
        for (const key of Object.keys(a)) {
            if (recursiveObjectCompare(a[key], b[key])) continue;
            return false;
        }
        return true;
    }
    return a == b;
}



async function getMetaFromAdapter(adapter, devId) {
    try {
        const obj = await adapter.getObjectAsync(devId)
        return obj?.native?.meta ?? {};
    }
    catch (error) {
        adapter.log.error(`error getting meta for ${devId} - ${error?.message ?? 'no message given'}`);
    }
    return {};
}


async function updateMetaOnAdapter(adapter, devId, meta, metaStates) {
    try {
        const obj = await adapter.getObjectAsync(devId);
        const existingMeta = obj?.native?.meta ?? {};
        const writeMeta = { state: {} };
        for (const metastate of metaStates) {
            if (meta.state && typeof meta.state == 'object')
                writeMeta.state[metastate] = meta.state[metastate];
        }
        if (!recursiveObjectCompare(writeMeta, existingMeta)) {
            await adapter.extendObject(devId, {native: { meta: writeMeta }});
            adapter.log.debug(`Statescontroller updated meta for ${devId} from ${JSON.stringify(existingMeta)} to ${JSON.stringify(writeMeta)}`);
        }
    }
    catch (error) {
        adapter.log.warn(`Statescontroller error updating meta for ${devId} : ${error?.message ?? 'no error message given'}`);
    }

}


function getZbId(adapterDevId) {
    const pieces = adapterDevId.split('.');
    const piece = pieces.length > 2 ? pieces[2] : adapterDevId;
    const idx = piece.indexOf('group_');
    if (idx > -1) {
        return Number(piece.substr(idx + 6));
    }
    return `0x${piece}`;
}

function getAdId(adapter, id) {
    return `${adapter.namespace}.${id.split('.')[2]}`; // iobroker device id
}

function flatten(arr) {
    return arr.reduce((flat, toFlatten) =>
        flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten), []);
}

const forceEndDevice = ['QBKG03LM', 'QBKG04LM', 'ZNMS13LM', 'ZNMS12LM'];


function zbIdorIeeetoAdId(adapter, source, withNamespace) {
    const preface = withNamespace ? `${adapter.namespace}.` : '';
    const s = String(source);
    // 0xdeadbeefdeadbeef
    // deadbeefdeadbeef
    if (s.length > 15)
        return `${preface}${source.replace('0x','')}`;
    // 2
    if (Number(s))
        return `${preface}group_${source}`;
    // group_2
    return `${preface}${source}`;
}

function adIdtoZbIdorIeee(adapter, source) {
    const s = `${source}`.replace(`${adapter.namespace}.`, '');
    if (s.startsWith('group')) return Number(s.substring(6));
    if (s.startsWith('0x')) return s;
    if (s.length === 16 && Number(`0x${s}`)) return `0x${s}`;
    return 'illegal'
}
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
    let sanitized = parameter || 'illegalParameter';
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
    const stripModel = (model && typeof model == 'string') ? model.replace(/\0.*$/g, '').trim() : '';
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

function removeFromArray(arr, toRemove) {
    let removed = 0;
    if (Array.isArray(arr)) {
        const _remove = toRemove ? [...toRemove] : [undefined, null];
        let idx = 0;
        while (idx < arr.length) {
            if (_remove.includes(arr[idx])) {
                arr.splice(idx, 1);
                removed ++;
            }
            else
                idx++;
        }
    }
    return removed;
}
////
//
// section DataStructureReducers
//
////
function deviceData(d, detailed) {
    return {
        ID: d?.ID,
        ieeeAddr: d?.ieeeAddr,
        interviewed: d?.interviewState == 'SUCCESSFUL',
        isDeleted: d?.isDeleted,
        manufacturerName: d?.manufacturerName,
        modelName: d?.modelID,
        ota: {
            sheduled: (d?.sheduledOta ? true: false),
            inProgress: d?.otaInProgress,
        }
    }
}

function entityData(e, detailed) {

    const rv = {
        type: e?.type,
        name: e?.name,
        options: e?.options,
        model: e?.mapped?.model,
    }
    if (detailed) {
        rv.modelName = modelData(e?.mapped, detailed);
        rv.device = deviceData(e?.device, detailed);
        rv.endpoint = endpointData(e?.endpoint, detailed);
    }
    return rv;

}

function endpointData(e, detailed) {
    return {
        deviceID: e?.deviceID,
        deviceieeeAddr:e?.deviceIeeeAddress,
        ID: e?.ID
    }
}

function modelData(m, detailed) {
    const rv = {
        version : m?.version,
        zigbeeModel: m?.zigbeeModel,
        vendor: m?.vendor,
        description: m?.description,
        name: m?.name,
        ota: m?.ota,
    }
    if (detailed) {
        rv.options = [];
        for (const obj of m?.options ?? []) {
            if (obj.name) rv.options.push(obj.name);
        }
        rv.endpoint = endpointData(m?.endpoint);
    }
    return rv;

}

function groupData(g, detailed) {
    const rv= { groupID: g.groupID, databaseID: g.databaseID };
    if (detailed) {
        rv.membercount = g.members.length;
    }
    return rv;
}

function zigbeeMessageData(m, detailed) {
    const rv = { type: m?.type, groupID: m?.groupID, meta: m?.meta, cluster:m?.cluster }
    if (detailed) {
        rv.device = deviceData(m?.device, true);
        rv.endpoint = endpointData(m?.endpoint);
    }
    return rv;

}

exports.entityData              = entityData;
exports.endpointData            = endpointData;
exports.deviceData              = deviceData;
exports.modelData               = modelData;
exports.groupData               = groupData;
exports.zigbeeMessageData       = zigbeeMessageData;
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
exports.adIdtoZbIdorIeee        = adIdtoZbIdorIeee;
exports.zbIdorIeeetoAdId        = zbIdorIeeetoAdId;
exports.removeFromArray         = removeFromArray;
exports.getMetaStates           = getMetaStates;
exports.getMeta                 = getMetaFromAdapter;
exports.updateMeta              = updateMetaOnAdapter;
