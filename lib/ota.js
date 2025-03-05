'use strict';

const getZbId = require('./utils').getZbId;
const zhc_ota = require('zigbee-herdsman-converters').ota;

class Ota {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
        this.inProgress = new Set();
    }

    start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
    }

    stop() {
        delete this.zbController;
        delete this.stController;
    }

    info(msg) {
        this.adapter.log.info(msg);
    }

    warn(msg) {
        this.adapter.log.warn(msg);
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
                case 'checkOtaAvail':
                    this.checkOtaAvail(obj);
                    break;
                case 'startOta':
                    this.startOta(obj);
                    break;
            }
        }
    }

    async checkOtaAvail(obj) {
        const device = await this.getDeviceForMessage(obj);
        if (!device) {
            this.info(`Device ${obj.message.devId} is unavailable`);
            this.adapter.sendTo(obj.from, obj.command, {
                status: 'fail',
                device: getZbId(obj.message.devId),
                msg: 'Device is unavailable'
            }, obj.callback);
            return;
        }
        if (this.inProgress.has(device.device.ieeeAddr)) {
            this.info(`Update or check already in progress for '${device.name}', skipping...`);
            return;
        }
        // do not attempt update for a device which has been deactivated or is unavailable
        const stateObj = await this.adapter.getObjectAsync(obj.message.devId);
        if (stateObj && stateObj.common && stateObj.common.deactivated) {
            this.info(`Device ${obj.message.devId} is deactivated, skipping...`);
            this.adapter.sendTo(obj.from, obj.command, {
                status: 'fail',
                device: getZbId(obj.message.devId),
                msg: 'Device is deactivated'
            }, obj.callback);
            return;
        }
        const availablestate = await this.adapter.getStateAsync(`${obj.message.devId.replace(this.namespace + '.', '')}.available`);
        const lqi = await this.adapter.getStateAsync(`${obj.message.devId.replace(this.namespace + '.', '')}.link_quality`);
        if ((availablestate && (!availablestate.val)) || (lqi && lqi.val < 1)) {
            this.info(`Device ${obj.message.devId} is marked unavailable, skipping...`);
            this.adapter.sendTo(obj.from, obj.command, {
                status: 'fail',
                device: getZbId(obj.message.devId),
                msg: 'Device is marked unavailable'
            }, obj.callback);
            return;
        }
        this.inProgress.add(device.device.ieeeAddr);
        const result = {status: 'unknown', device: device ? device.name : null};
        try {
            this.debug(`Checking if firmware update is available for ${device.name}`);

            if (device && device.mapped.ota) {
                const available = await zhc_ota.isUpdateAvailable(device.device, device.mapped.ota, undefined, false);
                result.status = available.available ? 'available' : 'not_available';
                if (available.currentFileVersion !== available.otaFileVersion) {
                    this.debug(`current Firmware for ${device.name} is ${available.currentFileVersion} new is ${available.otaFileVersion}`);
                }
            } else {
                result.status = 'not_supported';
            }
            this.debug(`Firmware update for ${device.name} is ${result.status}`);
            this.adapter.sendTo(obj.from, obj.command, result, obj.callback);
        } catch (error) {
            const message = `Failed to check if update available for '${device.name}' ${error.message}`;
            result.status = 'fail';
            result.msg = message;
            this.warn(message);
            this.adapter.sendTo(obj.from, obj.command, result, obj.callback);
        }
        this.inProgress.delete(device.device.ieeeAddr);
    }

    async startOta(obj) {
        const device = await this.getDeviceForMessage(obj);
        if (!device) {
            this.debug(`Device ${obj.message.devId} is unavailable`);
            this.adapter.sendTo(obj.from, obj.command, {
                status: 'fail',
                device: getZbId(obj.message.devId),
                msg: 'Device is unavailable'
            }, obj.callback);
            return;
        }
        if (this.inProgress.has(device.device.ieeeAddr)) {
            this.error(`Update or check already in progress for '${device.name}', skipping...`);
            return;
        }
        // do not attempt update for a device which has been deactivated or is unavailable
        const stateObj = await this.adapter.getObjectAsync(obj.message.devId);
        if (stateObj && stateObj.common && stateObj.common.deactivated) {
            this.info(`Device ${obj.message.devId} is deactivated, skipping...`);
            return;
        }
        const availablestate = await this.adapter.getStateAsync(`${obj.message.devId.replace(this.namespace + '.', '')}.available`);
        const lqi = await this.adapter.getStateAsync(`${obj.message.devId.replace(this.namespace + '.', '')}.link_quality`);
        if ((availablestate && (!availablestate.val)) || (lqi && lqi.val < 1)) {
            this.info(`Device ${obj.message.devId} is marked unavailable, skipping...`);
            return;
        }
        this.inProgress.add(device.device.ieeeAddr);
        const result = {status: 'unknown', device: device ? device.name : null};
        try {
            this.info('Start firmware update for ' + device.name);

            const onProgress = (progress, remaining) => {
                let message = `Update of '${device.name}' at ${progress}%`;
                if (remaining) {
                    message += `, +- ${Math.round(remaining / 60)} minutes remaining`;
                }
                this.info(message);
            };

            const from_ = await this.readSoftwareBuildIDAndDateCode(device.device, false);
            const fileVersion = await zhc_ota.update(device.device, device.mapped.ota, false, onProgress)
            const to = await this.readSoftwareBuildIDAndDateCode(device.device, true);
            const [fromS, toS] = [JSON.stringify(from_), JSON.stringify(to)];
            result.status = 'success';
            result.msg = `Finished update of '${device.name}'${to ? `, from '${fromS}' to '${toS}'` : ``}`;
            this.info(result.msg);
            this.adapter.sendTo(obj.from, obj.command, result, obj.callback);
        } catch (error) {
            const message = `Update of '${device.name}' failed (${error.message})`;
            result.status = 'fail';
            result.msg = message;
            this.error(message);
            this.adapter.sendTo(obj.from, obj.command, result, obj.callback);
        }
        this.inProgress.delete(device.device.ieeeAddr);
    }

    async readSoftwareBuildIDAndDateCode(device, update) {
        try {
            const endpoint = device.endpoints.find((e) => e.supportsInputCluster('genBasic'));
            const result = await endpoint.read('genBasic', ['dateCode', 'swBuildId']);

            if (update) {
                device.softwareBuildID = result.swBuildId;
                device.dateCode = result.dateCode;
                device.save();
            }

            return {softwareBuildID: result.swBuildId, dateCode: result.dateCode};
        } catch (e) {
            return null;
        }
    }

    async getDeviceForMessage(obj) {
        const devId = getZbId(obj.message.devId);
        return this.zbController.resolveEntity(devId);
    }
}

module.exports = Ota;
