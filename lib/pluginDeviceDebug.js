const basePlugin = require('./pluginBase');

class DeviceDebug extends basePlugin {
    constructor(adapter) {
        super(adapter, 'DeviceDebug');
        this.logStatus = true;

    }

    start(statescontroller, zigbeecontroller) {
        super.start(zigbeecontroller, statescontroller);
        this.dataByID = { };
        this.dataByDevice = { };
        this.debug('--- creating device debug ---');
        this.registerHandler(statescontroller,'device_debug', this.onDebugEvent.bind(this))
        this.registerHandler(this.adapter,'device_debug', this.onDebugEvent.bind(this))
        this.registerHandler(this.adapter,'message', this.onMessage.bind(this))
        this.registerHandler(zigbeecontroller,'device_debug', this.onDebugEvent.bind(this))
    }



    async onMessage(obj) {

        if (obj?.command) {
            if (obj?.command === 'getDebugMessages') {
                this.adapter.sendTo(obj.from, obj.command, {byId:this.collectDebugData( obj.message.inlog, obj.message.del )},obj.callback);
            }
        }
    }

    onDebugEvent(message) {
        if (typeof message === 'object' && message.hasOwnProperty('ID'))
        {
            let flag='NONE';
            if (message.hasOwnProperty('data')) {
                const dataId = message.ID;
                const item = this.dataByID[dataId] ? this.dataByID[dataId] : { dataID: dataId, deviceID:'unknown', states:[],flags:[], errors:[], IO:message.IO, messages:{} };
                this.dataByID[dataId] = item;
                const data = message.data;
                if (data.error && item.errors.indexOf(data.error)<0) item.errors.push(data.error);
                if (data.states) item.states.push(...data.states);
                if (data.flag && item.flags.indexOf(data.flag)<0) item.flags.push(data.flag);
                if (data.payload && !item.payload) item.payload = data.payload;
                item.IO = data.IO ? true : false;
                if (data.error) flag = data.error;
                else if (data.flag)
                    if (data.flag === 'SUCCESS') flag = data.flag;
                    else flag = item.IO ? 'I'+data.flag : 'O'+data.flag;
                else
                    flag = item.IO ? 'IN' : 'OUT';
                if (message.message) {
                    let msgIdx = 0;
                    while (item.messages.hasOwnProperty(`${flag}${msgIdx ? '-'+msgIdx : ''}`)) msgIdx++;
                    item.messages[`${flag}${msgIdx ? '-'+msgIdx : ''}`] = message.message;
                }
                if (data.ID && data.ID !== item.deviceID) {
                    item.deviceID = data.ID;
                    const DevData = this.dataByDevice[item.deviceID] ? this.dataByDevice[item.deviceID] : { IN:[], OUT:[] };
                    const target = (data.IO ? DevData.IN : DevData.OUT)
                    while (target.length > 20 || (target.length > 10 && dataId - target[0]>30000)) {
                        const pre = target.length;
                        const ditem = target.shift();
                        delete this.dataByID[ditem.dataID];
                        this.debug(`on Debug Message: removing item ${ditem.dataID} : pre ${pre} post ${target.length}`)
                    }
                    target.push(item);
                    this.dataByDevice[item.deviceID] = DevData;
                }
                if (message.hasOwnProperty('message') && this.logStatus) {
                    this.warn(`ELEVATED:${flag} (${dataId?.toString(16).slice(-4)}) ${message.message}`)
                }
            }
        }
    }

    deleteMessagesFor(item) {
        if (item == 'all') {
            this.dataByDevice = {};
            this.dataByID = {};
            return;
        }
        delete this.dataByDevice[item];
        const obsoleteIDs = [];
        for (const id in this.dataByID) {
            if (this.dataByID[id].deviceID === item) obsoleteIDs.push(id)
        }
        for (const id of obsoleteIDs) delete this.dataByID[id];
    }

    collectDebugData(logStatus, del) {
        if (logStatus != undefined)
            this.logStatus = logStatus;
        if (del) {
            this.deleteMessagesFor(del);
        }
        return this.dataByDevice;
    }
}

module.exports = DeviceDebug;
