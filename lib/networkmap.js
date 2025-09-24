'use strict';

class NetworkMap {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
        this.mapdata = undefined;
    }

    start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
        return this.stop;
    }

    stop() {
        delete this.zbController;
        delete this.stController;
    }

    info(msg) {
        this.adapter.log.info(msg);
    }

    error(msg) {
        this.adapter.log.error(msg);
    }

    debug(msg) {
        this.adapter.log.debug(msg);
    }

    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'getMap':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.getMap(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
            }
        }
    }

    getMap(from, command, message, callback) {
        if (message.forcebuild) this.mapdata = undefined;
        if (this.mapdata) {
            this.mapdata.errors = {};
            this.adapter.sendTo(from, command, this.mapdata, callback)
            return;
        }
        if (this.zbController) {
            this.zbController.getMap(networkmap => {
                this.mapdata = networkmap;
                this.adapter.log.debug(`getMap result: ${JSON.stringify(networkmap)}`);
                this.adapter.sendTo(from, command, networkmap, callback);
            });
        }
    }
}

module.exports = NetworkMap;
