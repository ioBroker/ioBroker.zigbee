'use strict';

const ZigbeeHerdsman = require('zigbee-herdsman');


/**
 *
 */
class Developer {
    /**
     *
     * @param adapter
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
        this.adapter.on('sendToZigbee', this.sendToZigbee.bind(this));
    }

    /**
     *
     * @param zbController
     * @param stController
     */
    start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
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
     *
     * @param msg
     */
    warn(msg) {
        this.adapter.log.warn(msg);
    }

    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'reset':
                    this.zbController.reset(obj.message.mode, err =>
                        this.adapter.sendTo(obj.from, obj.command, err, obj.callback));
                    break;
                case 'sendToZigbee':
                    this.sendToZigbee(obj);
                    break;
                case 'getLibData':
                    // e.g. zcl lists
                    this.getLibData(obj);
                    break;
            }
        }
    }

    /**
     *
     * @param obj
     */
    getLibData(obj) {
        const key = obj.message.key;
        const zcl = ZigbeeHerdsman.Zcl;
        const result = {};
        if (key === 'cidList') {
            result.list = zcl.Clusters;
        } else if (key === 'attrIdList') {
            const cid = obj.message.cid;
            result.list = zcl.Utils.getCluster(cid).attributes;
        } else if (key === 'cmdListFoundation') {
            result.list = zcl.Foundation;
        } else if (key === 'cmdListFunctional') {
            result.list = null;
            const cluster = zcl.Utils.getCluster(obj.message.cid);
            if (typeof cluster != 'undefined') {
                const extraCmd = cluster.commands;
                result.list = extraCmd;
            }
        } else if (key === 'respCodes') {
            result.list = zcl.Status;
        } else if (key === 'typeList') {
            result.list = zcl.DataType;
        } else {
            return;
        }
        result.key = key;
        this.adapter.sendTo(obj.from, obj.command, result, obj.callback);
    }

    /**
     *
     * @param obj
     */
    async sendToZigbee(obj) {
        if (this.zbController) {
            const zcl = ZigbeeHerdsman.Zcl;
            const idStr = obj.message.id || '0';
            const devId = idStr.startsWith('0x') ? idStr : `0x${idStr.replace(`${this.adapter.namespace}.`, '')}`;
            const ep = obj.message.ep ? obj.message.ep : null;
            const cid = obj.message.cid ?? 0;
            const cmdType = obj?.message?.cmdType ?? 'foundation';
            let cmd;
            const zclData = obj?.message?.zclData ?? {};
            if (cmdType === 'functional') {
                cmd = zcl.Utils.getCluster(cid).getCommand(obj.message.cmd);
            } else if (cmdType === 'functionalResp') {
                cmd = zcl.Utils.getCluster(cid).getCommandResponse(obj.message.cmd);
            } else if (cmdType === 'foundation') {
                cmd = zcl.Utils.getGlobalCommand((obj.message.cmd));
            } else {
                if (obj.callback) {
                    this.adapter.sendTo(obj.from, obj.command, {localErr: 'Invalid cmdType'}, obj.callback);
                }
                return;
            }
            const cfg = obj.message.hasOwnProperty('cfg') ? obj.message.cfg : null;
            let publishTarget;
            try {
                publishTarget = await this.zbController.getDevice(devId) ? devId : await this.zbController.getGroup(parseInt(devId));
                if (!publishTarget) {
                    if (obj.callback) {
                        this.adapter.sendTo(obj.from, obj.command, {localErr: `Device or group ${devId} not found!`}, obj.callback);
                    }
                    return;
                }
            } catch (error) {
                this.error(`SendToZigbee failed from publishTarget ${devId} (${error && error.message ? error.message : 'no details given'})`);
            }

            if (!cid || !cmd) {
                if (obj.callback) {
                    this.adapter.sendTo(obj.from, obj.command, {localErr: 'Incomplete data (cid or cmd)'}, obj.callback);
                }
                return;
            }
            this.debug(`Ready to send (ep: ${ep}, cid: ${cid}, cmd ${cmd.name}, zcl: ${JSON.stringify(zclData)})`);

            try {
                await this.zbController.publish(publishTarget, cid, cmd.name, zclData, cfg, ep, cmdType, (err, msg) => {
                    // map err and msg in one object for sendTo
                    const result = {};
                    result.msg = msg;
                    if (err) {
                        // err is an instance of Error class, it cannot be forwarded to sendTo, just get error code
                        result.error = err.code;
                    }
                    result.statusCode = 0;
                    if (obj.callback) {
                        this.adapter.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                }, obj.message.zclSeqNum);
            } catch (exception) {
                // report exceptions
                // happens for example if user tries to send write command but did not provide value/type
                // or unsupported attribute was addressed.
                const ZclStatusError = require('zigbee-herdsman/dist/zspec/zcl/zclStatusError').ZclStatusError;
                if (exception instanceof ZclStatusError) {
                    const result = {};
                    result.msg = `Zigbee error ${exception.code} received!`;
                    result.statusCode = exception.code;
                    if (obj.callback) {
                        this.adapter.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                } else {
                    this.error(`SendToZigbee failed! (${exception})`);
                    // exception (Error class) cannot be sent to adapter, send string message instead!
                    if (obj.callback) {
                        this.adapter.sendTo(obj.from, obj.command, {msg: exception.message}, obj.callback);
                    }
                }
            }
        } else {
            this.warn(`sendToZigbee called with ${obj?.message ? JSON.stringify(obj.message) : 'no message'}`);
        }
    }
}

module.exports = Developer;
