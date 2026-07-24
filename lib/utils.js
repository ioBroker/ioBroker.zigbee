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


/**
 * converts an array of bytes (length 2n) into an array of words (length n)
 * @param {ba} an array of bytes
 * @returns {an array of words, half the length of ba}
 */
function bytesArrayToWordArray(ba) {
    const wa = [];
    for (let i = 0; i < ba.length; i++) {
        wa[(i / 2) | 0] |= ba[i] << (8 * (i % 2));
    }
    return wa;
}

/**
 * converts an array of bytes (length 2n) into an array of words (length n)
 * @param {hexString} a string interpretation of a hex number
 * @param {reverse} reverse the returned array or not (bytewise reverse)
 * @returns {an array of bytes}
 */
function stringToByteArray (data, reverse) {
    if (typeof data != 'string') return [];
    const s = data.length % 2 ? `0${data}` : data;
    const bytes = [];
    for (let c = 0; c < s.length; c += 2) {
        const i = parseInt(s.slice(c,c+2), 16);
        bytes.push(Number.isNaN(i) ? 0 : i);
    }
    return reverse ? bytes.reverse() : bytes;
};

/**
 * converts an array of bytes (length 2n) into an array of words (length n)
 * @param {data} an array of bytes
 * @param {reverse} reverse the returned array or not (bytewise reverse)
 * @returns {an array of bytes}
 */
function byteArrayToString(data, reverse) {
    if (Array.isArray(data)) {
        const arr = data.map(function (x) {
            if (Number.isNaN(Number(x))) return '00';
            return (Number(x) & 0xff).toString(16).padStart(2, '0');
        })
        return reverse ? arr.reverse().join('') : arr.join('');
    }
    else return '';
}


/**
 * converts an array of bytes (length 2n) into an array of words (length n)
 * @param {data} an array of bytes
 * @param {reverse} reverse the returned array or not (bytewise reverse)
 * @returns {an array of bytes}
 */
function reverseByteString(data) {
    if (data && typeof data == 'string') {
        const rv = [];
        for (let i=0;i<data.length;i+=2)
            rv.push(data.slice(i,i+2))
        return rv.reverse().join('');
    }
    return '';
}

/**
 * converts Celvin to Mired (IF the value is a Kelvin value > 1000K)
 * @param {t} color temperature
 * @returns {the color temperature in Mired}
 */
function toMired(t) {
    function miredKelvinConversion(t) {
        return (1000000 / t).toFixed();
    }

    let miredValue = Number(t);
    if (Number.isNaN(miredValue)) return 150
    if (t > 1000) {
        miredValue = miredKelvinConversion(t);
    }
    return miredValue;
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

/**
 * compares a new object to see if there are properties which do not exist on the old object.
 * Will return true if the objects ar enot equal (on the first level only)
 * @param {newobj} the new object for comparison
 * @param {oldobj} the old object for comparison
 * @param {bothDirections} performs the comparison in both directions
 * @returns {true: new keys or changed values exist in newobj (or both in case of bothDirections)}
 */
function compareObjects (newobj, oldobj, bothDirections) {
    if (!oldobj) return true;
    if (!newobj) return false;
    for (const key of Object.keys (newobj)) {
        if (oldobj [key] != newobj [key])
            return true;
    }
    return bothDirections ? compareObjects(oldobj, newobj, false) : false;
}

/**
 * Converts a decimal number to a hex string with zero-padding
 * @param {number} decimal The number to convert
 * @param {number} padding The desired length of the hex string, padded with zeros
 * @returns {it is string}
 */
function getEntryArray(val) {
    if (typeof val != 'string') return [];
    try {
        const jsonObj = JSON.parse(val);
        return Array.isArray(jsonObj) ? jsonObj : [];
    }
    catch
    {
        try {
            const arr = val.split(/[;,]/);
            return arr.map((o) => o.trim()).filter((o) => o.length > 0)
        }
        catch (e) {
            return []
        }
    }
}



/**
 * compares two objects, including subobjects. NOTE: Will cause issues with circular references !!!
 * @param {a} Object 1
 * @param {n} Object 2
 * @returns {true: objects are equal}
 */
function deepEqual(a, b) {
    if (typeof a != typeof b) return false;
    if (typeof a == 'object') {
        if (Object.is(a, b)) return true; // handles NaN and -0 correctly

        const aKeys = Object.keys(a ?? {});
        const bKeys = Object.keys(b ?? {});

        if (aKeys.length !== bKeys.length) return false;

        for (const key of aKeys) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!deepEqual(a[key], b[key])) return false;
        }

        return true;
    }
    return a == b;
}

/**
 * retrieves obj.native.meta if available
 * @param {adapter} the Adapter object for access to adapter objects
 * @param {devId} the id of the object to get the meta of
 * @returns {obj.native.meta or {}}
 */
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

/**
 * updates obj.native.meta if needed.
 * @param {adapter} the Adapter object for access to adapter objects
 * @param {devId} the id of the object to get the meta of
 * @param {meta} the 'meta' object to be set
 * @param {metastates} an array of keys for meta.state
 * @returns nothing
 */
async function updateMetaOnAdapter(adapter, devId, meta, metaStates) {
    try {
        const obj = await adapter.getObjectAsync(devId);
        if (!obj) return;
        const existingMeta = obj?.native?.meta ?? {};
        const writeMeta = { state: {} };
        for (const metastate of metaStates) {
            if (meta.state && typeof meta.state == 'object')
                writeMeta.state[metastate] = meta.state[metastate];
        }
        if (!deepEqual(writeMeta, existingMeta)) {
            await adapter.extendObject(devId, {native: { meta: writeMeta }});
            adapter.log.debug(`Statescontroller updated meta for ${devId} from ${JSON.stringify(existingMeta)} to ${JSON.stringify(writeMeta)}`);
        }
    }
    catch (error) {
        adapter.log.warn(`Statescontroller error updating meta for ${devId} : ${error?.message ?? 'no error message given'}`);
    }

}

/**
 * get the zigbee Id from the adapter id
 * @param {adapterDevId} the id of the object (zigbee.x.<id>)
 * @returns {the id as 8 byte hex address (0x0123456789ABCDEF) or number (for groups)}
 */
function getZbId(adapterDevId) {
    const pieces = adapterDevId.split('.');
    const piece = pieces.length > 2 ? pieces[2] : adapterDevId;
    const idx = piece.indexOf('group_');
    if (idx > -1) {
        return Number(piece.substr(idx + 6));
    }
    return `0x${piece}`;
}

/**
 * get the zigbee Id from the adapter id
 * @param {adapter} the Adapter object for access to adapter objects
 * @param {id} the id (either zigbee.0.<id>.state or just <id> - NOT 0x0123456789abcdef 1,2,3)
 * @returns {the id in the form "zigbee.x.<ID>}
 */
function getAdId(adapter, id) {
    return `${adapter.namespace}.${id.split('.')[2]}`; // iobroker device id
}

function flatten(arr) {
    return arr.reduce((flat, toFlatten) =>
        flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten), []);
}

const forceEndDevice = ['QBKG03LM', 'QBKG04LM', 'ZNMS13LM', 'ZNMS12LM'];

/**
 * get the adapter Id from the yigbee id
 * @param {adapter} the Adapter object for access to adapter objects
 * @param {source} the id of the object (either IEEE or number (for gruops))
 * @param {withNamespace} if to prepend "zigbee.x" to the adapter id)
 * @returns {0123456789abcdef or group_x, either with or without zigbee.i}
 */
function zbIdorIeeetoAdId(adapter, source, withNamespace) {
    const preface = withNamespace ? `${adapter.namespace}.` : '';
    const s = String(source);
    if (s.length > 15)
        return `${preface}${source.replace('0x','')}`;
    // 2
    if (Number(s))
        return `${preface}group_${source}`;
    // group_2
    return `${preface}${source}`;
}

/**
 * get the zigbee Id from the adapter id
 * @param {adapter} the Adapter object for access to adapter objects
 * @param {source} the id of the object (either IEEE or number (for gruops))
 * @returns {0x0123456789abcdef or a number for groups}
 */
function adIdtoZbIdorIeee(adapter, source) {
    const s = `${source}`.replace(`${adapter.namespace}.`, '');
    if (s.startsWith('group')) return Number(s.slice(6));
    if (s.startsWith('0x')) return s;
    if (s.length === 16 && Number(`0x${s}`)) return `0x${s}`;
    return 'illegal'
}

/**
 * Pure formatter for a device log label: the user-assigned name plus the id/address, which always
 * stays for unique identification (the IEEE is the only truly unique and unchangeable info). The id
 * may be a string (IEEE) or a number (a group id, after ZH/ZHC changes). A device without a valid
 * id should not exist, so that path yields "unknown device"; a valid id without a name yields
 * "unnamed (id)". Never throws.
 * @param {string|number} idOrIeee the device id / IEEE address / group id (always shown)
 * @param {string|undefined|null} givenName the resolved name, or nullish when unknown
 * @returns {string} e.g. "Living room lamp (0x00158d0001abcd)", "unnamed (5)" or "unknown device"
 */
function deviceDisplayName(idOrIeee, givenName) {
    if (typeof idOrIeee !== 'string' && typeof idOrIeee !== 'number') {
        return 'unknown device';
    }
    const name = typeof givenName === 'string' ? givenName.trim() : '';
    return name ? `${name} (${idOrIeee})` : `unnamed (${idOrIeee})`;
}

/*flatten(
    ['QBKG03LM', 'QBKG04LM', 'ZNMS13LM', 'ZNMS12LM']
        .map(model => zigbeeHerdsmanConverters.findByModel(model))
        .map(mappedModel => mappedModel.zigbeeModel));
*/
// Xiaomi uses 4151 and 4447 (lumi.plug) as manufacturer ID.
const xiaomiManufacturerID = [4151, 4447];
const ikeaTradfriManufacturerID = [4476];



/**
 * sanitize the image name
 * @param {parameter} the unfiltered image name
 * @returns {the sanitized image name}
 */
function sanitizeImageParameter(parameter) {
    const replaceByDash = [/[^a-z\d\-_.()+:]/gi];
    let sanitized = parameter || 'illegalParameter';
    replaceByDash.forEach(r => sanitized = sanitized.replace(r, '-'));
    return sanitized;
}

/**
 * get the link to the device icon
 * @param {definition} the device definition object
 * @returns {the (sanitized) link to the icon}
 */
function getDeviceIcon(definition) {
    const icon = definition.icon;
    if (icon) {
        return icon;
    }
    return `https://www.zigbee2mqtt.io/images/devices/${sanitizeImageParameter(definition.model)}.png`;
}

/**
 * sanitize the model name
 * @param {model} the raw model name
 * @returns {the sanitized model name}
 */
function getModelRegEx( model) {
    const stripModel = (model && typeof model == 'string') ? model.replace(/\0.*$/g, '').trim() : '';
    return stripModel;
}

/**
 * Obtain entity information for logging
 * @param {entity} the entity to provide info
 * @returns {a string with entity information}
 */
function getEntityInfo(entity) {
    if (entity) {
        return `Type: ${entity.type} Name: ${entity.name}`;
    }
    return `getEntityInfo: Illegal Entity ${JSON.stringify(entity)}`;
}

/**
 * Extract a net address structure from the provided address string of type 'tcp://<ip or hostname>:<port>
 * @param {address} the entity to provide info
 * @returns {the network address structure}
 */
function getNetAddress(address) {
    const TcpData = address.match(/[tT][cC][pP]:\/\/(.+)/);
    if (TcpData) {
        const hostarr = TcpData[1].split(':');
        return { strAddress :`tcp://${hostarr.length > 1 ? hostarr[0]+':'+hostarr[1] : hostarr[0]}`, host:hostarr[0], port:(hostarr.length > 1 ? hostarr[1] : undefined) };
    }
    return {};
}


/**
 * remove multiple entries from an array
 * @param {arr} the array to remove entries from
 * @param {toRemove} an array of entries to remove
 * @returns {the reduced array}
 */
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

/**
 * obtain a reduced object with device information
 * @param {d} the device object
 * @param {detailed} an object defining which properties should be detailed
 * @returns {the reduced object}
 */
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

/**
 * obtain a reduced object with entity information
 * @param {e} the entity object
 * @param {detailed} an object defining which properties of e should be detailed
 * @returns {the reduced object}
 */
function entityData(e, detailed) {

    const rv = {
        type: e?.type,
        name: e?.name,
        options: e?.options,
        model: e?.mapped?.model,
    }
    if (detailed?.entity) {
        rv.modelName = modelData(e?.mapped, detailed);
        rv.device = deviceData(e?.device, detailed);
        rv.endpoint = endpointData(e?.endpoint, detailed);
    }
    return rv;

}

/**
 * obtain a reduced object with device information
 * @param {e} the endpoint object
 * @param {detailed} an object defining which properties of e should be detailed
 * @returns {the reduced object}
 */
function endpointData(e, detailed) {
    return {
        deviceID: e?.deviceID,
        deviceieeeAddr:e?.deviceIeeeAddress,
        ID: e?.ID
    }
}

/**
 * obtain a reduced object with model information
 * @param {m} the model object
 * @param {detailed} an object defining which properties of m should be detailed
 * @returns {the reduced object}
 */
function modelData(m, detailed) {
    const rv = {
        version : m?.version,
        zigbeeModel: m?.zigbeeModel,
        vendor: m?.vendor,
        description: m?.description,
        name: m?.name,
        ota: m?.ota,
    }
    if (detailed?.model) {
        rv.options = [];
        for (const obj of m?.options ?? []) {
            if (obj.name) rv.options.push(obj.name);
        }
        rv.endpoint = endpointData(m?.endpoint, detailed?.enpdoint);
    }
    return rv;

}

/**
 * obtain a reduced object with group information
 * @param {g} the group object
 * @param {detailed} an object defining which properties of g should be detailed
 * @returns {the reduced object}
 */
function groupData(g, detailed) {
    const rv= { groupID: g.groupID, databaseID: g.databaseID };
    if (detailed?.group) {
        rv.membercount = g.members.length;
    }
    return rv;
}

/**
 * obtain a reduced object with zigbee-message information
 * @param {m} the message object
 * @param {detailed} an object defining which properties of g should be detailed
 * @returns {the reduced object}
 */
function zigbeeMessageData(m, detailed) {
    const rv = { type: m?.type, groupID: m?.groupID, meta: m?.meta, cluster:m?.cluster }
    if (detailed?.message) {
        rv.device = deviceData(m?.device, detailed);
        rv.endpoint = endpointData(m?.endpoint, detailed);
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
exports.deviceDisplayName       = deviceDisplayName;
exports.removeFromArray         = removeFromArray;
exports.getEntryArray           = getEntryArray;
exports.getMeta                 = getMetaFromAdapter;
exports.updateMeta              = updateMetaOnAdapter;
exports.compareObjects          = compareObjects;
exports.stringToByteArray       = stringToByteArray;
exports.deepEqual               = deepEqual;