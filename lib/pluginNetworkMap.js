'use strict';
const basePlugin = require ('./pluginBase');

class NetworkMap extends basePlugin {
    constructor(adapter) {
        super(adapter, 'NetworkMap');
    }

    start(zbController, stController) {
        super.start(zbController, stController)
        this.registerHandler(this.adapter,'message', this.onMessage.bind(this));
        this.mapdata = { hasMap:false, timestamp:0 };
        this.mapValidityTime = 30*60*1000;
        this.buildingMap = false;
    }

    stop() {
        delete this.zbController;
        delete this.stController;
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

    async getMap(from, command, message, callback) {
        if (this.
            mapdata.hasMap) {
            this.adapter.sendTo(from, command, this.mapdata, callback);
            this.mapdata.errors = {};
            // do not trigger map regeneration if the map is 'new' enuogh
            // Note to self - invalidate map when devices are added or removed !!
            if ((Date.now()- this.mapdata.timestamp < this.mapValidityTime) && !message.rebuild) return;
        }
        else this.adapter.sendTo(from, command, { hasMap: false });
        if (this.zbController && message.rebuild && !this.buildingMap) {
            this.buildingMap = true;
            this.mapdata = await this.zbController.getMap();
            this.buildingMap = false;
            this.mapdata.hasMap = true;
            this.mapdata.timestamp = Date.now();
            if (this.debugActive) this.debug(`getMap result: ${JSON.stringify(this.mapdata)}`);
            this.adapter.setState('info.pairingMessage', 'Map generation complete.', true);
        }
    }

}

module.exports = NetworkMap;
