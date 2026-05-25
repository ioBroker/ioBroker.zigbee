'use strict';
//const modelDefinitions = require('./models');
const utils = require('./utils');

/**
 *
 */
class Exclude {
    /**
     *
     * @param adapter
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
    }

    /**
     *
     * @param zbController
     * @param stController
     */
    start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
        this.localConfig = stController.localConfig;
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
                case 'addExclude':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.addExclude(obj.from, obj.command, obj.message, err =>
                            this.adapter.sendTo(obj.from, obj.command, err, obj.callback));
                    }
                    break;

                case 'getExclude':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.getExclude(exclude =>
                            this.adapter.sendTo(obj.from, obj.command, exclude, obj.callback));
                    }
                    break;
                case 'getExcludable':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.getExcludable(exclude =>
                            this.adapter.sendTo(obj.from, obj.command, exclude, obj.callback));
                    }
                    break;
                case 'delExclude':
                    if (obj && obj.message) {
                        this.delExclude(obj.from, obj.command, obj.message, err =>
                            this.adapter.sendTo(obj.from, obj.command, err, obj.callback));
                    }
                    break;
            }
        }
    }

    /**
     *
     * @param exclude_target
     */
    getExcludeId(exclude_target) {
        return `${this.extractDeviceId(exclude_target)}`;
    }

    /**
     *
     * @param stateId
     */
    extractDeviceId(stateId) {
        if (stateId) {
            return stateId.replace(`${this.adapter.namespace}.`, '');
        }
        return '';
    }

    /**
     *
     * @param stateId
     */
    extractExcludeId(stateId) {
        return stateId.replace(`${this.adapter.namespace}.info.legacy.`, '');
    }

    /**
     *
     * @param devName
     * @param stateId
     */
    getExcludeName(devName, stateId) {
        return devName.replace(` ${stateId}`, '');
    }

    /**
     *
     * @param from
     * @param command
     * @param params
     * @param callback
     */
    async addExclude(from, command, params, callback) {
        try {
            this.debug(`addExclude message: ${JSON.stringify(params)}`);
            const exclude_mod = params.exclude_model.common.type;
            this.localConfig.updateLocalOverride(exclude_mod, exclude_mod, 'legacy', exclude_mod, true);
            callback({});
        } catch (error) {
            this.error(`Failed to addExclude ${error.stack}`);
            throw new Error(`Failed to addExclude ${error.stack}`);
        }
    }

    /**
     *
     * @param from
     * @param command
     * @param exclude_id
     * @param callback
     */
    async delExclude(from, command, exclude_id, callback) {
        try {
            this.debug(`delExclude message: ${JSON.stringify(exclude_id)}`);
            this.localConfig.updateLocalOverride(exclude_id, exclude_id, 'legacy', '', true);
            callback({});
        } catch (error) {
            this.error(`Failed to delExclude ${error.stack}`);
            throw new Error(`Failed to delExclude ${error.stack}`);
        }
    }

    /**
     *
     * @param callback
     */
    async getExclude(callback) {
        try {
            const exclude = this.localConfig.getOverridesWithKey('legacy', true)
            callback({legacy: exclude});
        } catch (error) {
            this.error(`Failed to getExclude ${error.stack}`);
            callback({error: 'unable to get excludes'});
        }
    }

    /**
     *
     * @param callback
     */
    async getExcludable(callback) {
        const devices = this.zbController.getClients();
        const excludables = [];
        for (const device of devices) {
            const obj = await this.adapter.getObjectAsync(utils.zbIdorIeeetoAdId(this.adapter, device.ieeeAddr, false));//device.ieeeAddr.substr(2));
            if (obj && obj.common && obj.common.type) {
                excludables.push(obj.common.tyoe);
            }
        }
        callback(devices.pairedLegacyDevices(excludables));
    }
}

module.exports = Exclude;
