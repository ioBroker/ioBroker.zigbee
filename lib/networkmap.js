'use strict';

class NetworkMap {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
        this.mapdata = { hasMap:false, timestamp:0 };
        this.mapValidityTime = 30*60*1000;
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
        if (Date.now() - this.mapdata.timestamp > this.mapValidityTime)
            this.mapdata.hasMap = false;
        if (!message.forcebuild)  {
            if (this.mapdata.hasMap) {
                this.mapdata.errors = {};
                this.adapter.sendTo(from, command, this.mapdata, callback)
            }
            else this.adapter.sendTo(from, command, { hasMap: false });
            return;
        }
        if (this.zbController) {
            this.zbController.getMap(networkmap => {
                this.mapdata = networkmap;
                this.mapdata.hasMap = true;
                const t = this;
                this.mapdata.timestamp = Date.now();
                this.adapter.log.debug(`getMap result: ${JSON.stringify(networkmap)}`);
                if (t.mapTimeout) clearTimeout(t.mapTimeout);
                t.mapTimeout = setTimeout(() => {
                    t.adapter.setState('info.pairingMessage', 'Map invalidated.', true);
                    t.mapdata.hasMap = false;
                    t.mapTimeout = null;
                }, this.mapValidityTime);
                this.adapter.sendTo(from, command, networkmap, callback);
            });
        }
    }
}

module.exports = NetworkMap;
