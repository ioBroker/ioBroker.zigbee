'use strict';

const SerialPort = require('serialport');


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

    async listSerial() {
        return SerialPort.list()
            .then(ports =>
                ports.map(port => {
                    return {comName: port.comName};
                })
            )
            .catch(err => {
                adapter.log.error(err);
                return [];
            });
    }
    
}

module.exports = SerialList;