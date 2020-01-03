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

    debug(message, data) {
        this.zigbee.debug(message, data);
    }
}

module.exports = BaseExtension;