'use strict';

/*eslint no-unused-vars: ['off']*/

class BaseExtension {
    constructor(zigbee, options) {
        this.zigbee = zigbee;
    }

    info(message, data) {
        this.zigbee.info(message, data);
    }

    error(message, data) {
        this.zigbee.error(message, data);
    }

    warn(message, data) {
        this.zigbee.warn(message, data);
    }

    debug(message, data) {
        this.zigbee.debug(message, data);
    }

    sendError(error, message) {
        this.zigbee.sendError(error, message);
    }
}

module.exports = BaseExtension;
