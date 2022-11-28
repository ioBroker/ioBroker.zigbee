'use strict';

const serialPortUtils = require('zigbee-herdsman/dist/adapter/serialPortUtils').default;


class SerialList {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
    }
    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'listUart':
                    if (obj.callback) {
                        this.listSerial()
                            .then((ports) => {
                                this.adapter.log.debug(`List of ports: ${JSON.stringify(ports)}`);
                                this.adapter.sendTo(obj.from, obj.command, ports, obj.callback);
                            }).catch((err) => {
                                this.adapter.log.error(`List of ports error: ${err}`);
                                this.adapter.sendTo(obj.from, obj.command, [], obj.callback);
                            });
                    }
                    break;
            }
        }
    }

    listSerial() {
        return serialPortUtils.find([{}])
            .then(ports =>
                ports.map(port => ({comName: port})));
    }
}

module.exports = SerialList;
