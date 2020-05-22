'use strict';

const ZigbeeHerdsman = require('zigbee-herdsman');
const getZbId = require('./utils').getZbId;

class Ota {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on("message", this.onMessage.bind(this));
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
        if (typeof obj === "object" && obj.command) {
            switch (obj.command) {
                case 'checkOtaAvail':
                    this.checkOtaAvail(obj)
                    break;
                case 'startOta':
                    this.startOta(obj)
                    break;
            }
        }
    }
    
    async checkOtaAvail(obj) {
        const device = await this.getDeviceForMessage(obj);
        if (this.inProgress.has(device.device.ieeeAddr)) {
            this.error(`Update or check already in progress for '${device.name}', skipping...`);
            return;
        }
        this.inProgress.add(device.device.ieeeAddr);
        const result = {status: 'unknown', device: device ? device.name : null};
        try {
            this.debug(`Checking if firmware update is available for ${device.name}`);

            if (device && device.mapped.ota) {
                const available = await device.mapped.ota.isUpdateAvailable(device.device, this);
                result.status = available ? 'available' : 'not_available';
            } else {
                result.status = 'not_supported';
            }
            this.debug(`Firmware update for ${device.name} is ${result.status}`);
            this.adapter.sendTo(obj.from, obj.command, result, obj.callback);
        } catch (error) {
            const message = `Failed to check if update available for '${device.name}' (${error.message})`;
            result.status = 'fail';
            result.msg = message;
            this.error(message);
            this.adapter.sendTo(obj.from, obj.command, result, obj.callback);
        }
        this.inProgress.delete(device.device.ieeeAddr);
    }

    async startOta(obj) {
        const device = await this.getDeviceForMessage(obj);
        if (this.inProgress.has(device.device.ieeeAddr)) {
            this.error(`Update or check already in progress for '${device.name}', skipping...`);
            return;
        }
        this.inProgress.add(device.device.ieeeAddr);
        const result = {status: 'unknown', device: device ? device.name : null};
        try {
            this.info('Start firmware update for '+device.name);

            const onProgress = (progress, remaining) => {
                let message = `Update of '${device.name}' at ${progress}%`;
                if (remaining) {
                    message += `, +- ${Math.round(remaining / 60)} minutes remaining`;
                }
                this.info(message);
            };

            const from_ = await this.readSoftwareBuildIDAndDateCode(device.device, false);
            await device.mapped.ota.updateToLatest(device.device, this, onProgress);
            const to = await this.readSoftwareBuildIDAndDateCode(device.device, true);
            const [fromS, toS] = [JSON.stringify(from_), JSON.stringify(to)];
            result.status = 'success';
            result.msg = `Finished update of '${device.name}'` + (to ? `, from '${fromS}' to '${toS}'` : ``);
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