'use strict';

const fs = require('fs');
const path = require('path');

let controllerDir;
let appName;

/**
 * returns application name
 *
 * The name of the application can be different and this function finds it out.
 *
 * @returns {string}
 */
 function getAppName() {
    const parts = __dirname.replace(/\\/g, '/').split('/');
    return parts[parts.length - 2].split('.')[0];
}

/**
 * looks for js-controller home folder
 *
 * @param {boolean} isInstall
 * @returns {string}
 */
function getControllerDir(isInstall) {
    // Find the js-controller location
    const possibilities = [
        'iobroker.js-controller',
        'ioBroker.js-controller',
    ];
    /** @type {string} */
    let controllerPath;
    for (const pkg of possibilities) {
        try {
            const possiblePath = require.resolve(pkg);
            if (fs.existsSync(possiblePath)) {
                controllerPath = possiblePath;
                break;
            }
        } catch (e) { /* not found */ }
    }
    if (!controllerPath) {
        if (!isInstall) {
            console.log('Cannot find js-controller');
            process.exit(10);
        } else {
            process.exit();
        }
    }
    // we found the controller
    return path.dirname(controllerPath);
}

/**
 * reads controller base settings
 *
 * @alias getConfig
 * @returns {object}
 */
 function getConfig() {
    let configPath;
    if (fs.existsSync(
        configPath = path.join(controllerDir, 'conf', appName + '.json')
    )) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else if (fs.existsSync(
        configPath = path.join(controllerDir, 'conf', + appName.toLowerCase() + '.json')
    )) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
        throw new Error('Cannot find ' + controllerDir + '/conf/' + appName + '.json');
    }
}
appName       = getAppName();
controllerDir = getControllerDir(typeof process !== 'undefined' && process.argv && process.argv.indexOf('--install') !== -1);
const adapter = require(path.join(controllerDir, 'lib/adapter.js'));

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

exports.controllerDir         = controllerDir;
exports.getConfig             = getConfig;
exports.Adapter               = adapter;
exports.appName               = appName;
exports.bytesArrayToWordArray = bytesArrayToWordArray;
exports.decimalToHex          = decimalToHex;
