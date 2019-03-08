'use strict';

function bytesArrayToWordArray(ba) {
	var wa = [],
		i;
	for (i = 0; i < ba.length; i++) {
		wa[(i / 2) | 0] |= ba[i] << (8*(i % 2));
    }
    return wa;
}

exports.bytesArrayToWordArray = bytesArrayToWordArray;
