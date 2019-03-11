'use strict';

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

exports.bytesArrayToWordArray = bytesArrayToWordArray;
exports.decimalToHex          = decimalToHex;
