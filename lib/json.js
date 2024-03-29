'use strict';

const hasProp = Object.prototype.hasOwnProperty;

function throwsMessage(err) {
    return `[Throws: ${err ? err.message : '?'}]`;
}

function safeGetValueFromPropertyOnObject(obj, property) {
    if (hasProp.call(obj, property)) {
        try {
            return obj[property];
        } catch (err) {
            return throwsMessage(err);
        }
    }

    return obj[property];
}

function ensureProperties(obj) {
    const seen = []; // store references to objects we have seen before

    function visit(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (seen.includes(obj)) {
            return '[Circular]';
        }
        seen.push(obj);

        if (typeof obj.toJSON === 'function') {
            try {
                return visit(obj.toJSON());
            } catch (err) {
                return throwsMessage(err);
            }
        }

        if (Array.isArray(obj)) {
            return obj.map(visit);
        }

        return Object.keys(obj).reduce((result, prop) => {
            // prevent faulty defined getter properties
            result[prop] = visit(safeGetValueFromPropertyOnObject(obj, prop));
            return result;
        }, {});
    }

    return visit(obj);
}

module.exports = function (data, replacer, space) {
    return JSON.stringify(ensureProperties(data), replacer, space);
};

module.exports.ensureProperties = ensureProperties;