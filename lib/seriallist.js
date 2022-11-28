'use strict';

const serialPortUtils = require('zigbee-herdsman/dist/adapter/serialPortUtils').default;
let SerialPort = null;

class SerialList {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', obj => this.onMessage(obj));
    }
    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'listUart':
                    if (obj.callback) {
                        SerialPort = SerialPort || require('serialport').SerialPort;
                        if (SerialPort) {
                            // read all found serial ports
                            SerialPort.list()
                                .then(ports => {
                                    this.adapter.log.info(`List of port: ${JSON.stringify(ports)}`);
                                    this.adapter.sendTo(obj.from, obj.command, ports.map(item => ({label: item.friendlyName, comName: item.path})), obj.callback);
                                })
                                .catch(e => {
                                    this.adapter.sendTo(obj.from, obj.command, [], obj.callback);
                                    this.adapter.log.error(e);
                                });
                        } else {
                            this.adapter.log.warn('Module serialport is not available');
                            this.adapter.sendTo(obj.from, obj.command, [{label: 'Not available', value: ''}], obj.callback);
                        }
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
