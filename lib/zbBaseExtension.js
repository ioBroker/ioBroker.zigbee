'use strict';

/*eslint no-unused-vars: ['off']*/

/**
 *
 */
class BaseExtension {
    /**
     *
     * @param zigbee
     * @param options
     */
    constructor(zigbee, options) {
        this.zigbee = zigbee;
        this.name = 'BaseExtension';
        this.elevate_debug = false;
    }

    /**
     *
     * @param message
     * @param data
     */
    info(message, data) {
        this.zigbee.info(message, data);
    }

    /**
     *
     * @param message
     * @param data
     */
    error(message, data) {
        this.zigbee.error(`${this.name}:${message}`, data);
    }

    /**
     *
     * @param message
     * @param data
     */
    warn(message, data) {
        this.zigbee.warn(`${this.name}:${message}`, data);
    }

    /**
     *
     * @param message
     * @param data
     */
    debug(message, data) {
        if (this.elevate_debug) {
            this.zigbee.warn(`DE ${this.name}:${message}`, data);
        } else {
            this.zigbee.debug(`${this.name}:${message}`, data);
        }
    }

    /**
     *
     * @param message
     */
    pairingMessage(message) {
        this.zigbee.emit('pairing', `${this.name}:${message}`)
    }

    /**
     *
     * @param error
     * @param message
     */
    sendError(error, message) {
        this.zigbee.sendError(error, message);
    }
}

module.exports = BaseExtension;
