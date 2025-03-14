const { EventEmitter } =  require('events');
const fs = require('fs');
class DeviceDebug extends EventEmitter {
    constructor(adapter) {
        super();
        this.adapter = adapter;
        this.dataByID = { };
        this.dataByDevice = { };
        this.logStatus = true;

    }

    info(message, data) {
        this.emit('log', 'info', message, data);
    }

    error(message, data) {
        this.emit('log', 'error', message, data);
    }

    debug(message, data) {
        this.emit('log', 'debug', message, data);
    }

    warn(message, data) {
        this.emit('log', 'warn', message, data);
    }

    start(statescontroller, zigbeecontroller) {
        this.info('--- creating device debug ---');
        statescontroller.on('device_debug', this.onDebugEvent.bind(this))
        this.adapter.on('device_debug', this.onDebugEvent.bind(this))
        zigbeecontroller.on('device_debug', this.onDebugEvent.bind(this))
    }

    onDebugEvent(message) {
        if (typeof message === 'object' && message.hasOwnProperty('ID'))
        {
            let flag='NONE';
            if (message.hasOwnProperty('data')) {
                const dataId = message.ID;
                const item = this.dataByID[dataId] ? this.dataByID[dataId] : { dataID: dataId, deviceID:'unknown', states:[],flags:[], errors:[], IO:message.IO };
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
                    this.warn(`ELEVATED:${flag} (${dataId.toString(16).slice(-4)}) ${message.message}`)
                }
            }
        }
    }

    collectDebugData(logStatus) {
        if (logStatus != undefined)
            this.logStatus = logStatus;
        return this.dataByDevice;
    }
}

module.exports = DeviceDebug;
