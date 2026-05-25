'use strict';

/**
 *
 */
class NetworkMap {
    /**
     *
     * @param adapter
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
        this.mapdata = { hasMap:false, timestamp:0 };
        this.mapValidityTime = 30*60*1000;
    }

    /**
     *
     * @param zbController
     * @param stController
     */
    start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
        return this.stop;
    }

    /**
     *
     */
    stop() {
        delete this.zbController;
        delete this.stController;
    }

    /**
     *
     * @param msg
     */
    info(msg) {
        this.adapter.log.info(msg);
    }

    /**
     *
     * @param msg
     */
    error(msg) {
        this.adapter.log.error(msg);
    }

    /**
     *
     * @param msg
     */
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

    /**
     *
     * @param from
     * @param command
     * @param message
     * @param callback
     */
    getMap(from, command, message, callback) {
        if (!message.forcebuild)  {
            if (this.mapdata.hasMap) {
                this.mapdata.errors = {};
                this.adapter.sendTo(from, command, this.mapdata, callback)
            } else {
this.adapter.sendTo(from, command, { hasMap: false });
}
            return;
        }
        if (this.zbController) {
            this.zbController.getMap(networkmap => {
                this.mapdata = networkmap;
                this.mapdata.hasMap = true;
                const t = this;
                this.mapdata.timestamp = Date.now();
                this.adapter.log.debug(`getMap result: ${JSON.stringify(networkmap)}`);
                if (t.mapTimeout) {
clearTimeout(t.mapTimeout);
}
                t.mapTimeout = setTimeout(() => {
                    t.adapter.setState('info.pairingMessage', 'Map invalidated.', true);
                }, this.mapValidityTime);
                this.adapter.sendTo(from, command, networkmap, callback);
            });
        }
    }
}

module.exports = NetworkMap;
