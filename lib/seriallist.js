'use strict';

const serialPortUtils = require("zigbee-herdsman/dist/adapter/serialPortUtils").default;


class SerialList {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on("message", this.onMessage.bind(this));
    }
    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === "object" && obj.command) {
            switch (obj.command) {
                case 'listUart':
                    if (obj.callback) {
                        this.listSerial()
                            .then((ports) => {
                                this.adapter.log.debug('List of ports: ' + JSON.stringify(ports));
                                this.adapter.sendTo(obj.from, obj.command, ports, obj.callback);
                            });
                    }
                    break;
            }
        }
    }

    listSerial() {
        return serialPortUtils.find([{}]).then((ports) => {
            return ports.map((port) => {return {comName: port};});
        });
    }
}

module.exports = SerialList;
