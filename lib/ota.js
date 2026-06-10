'use strict';

const { getZbId , zbIdorIeeetoAdId, adIdtoZbIdorIeee} = require('./utils');
const {setOtaConfiguration} = require('zigbee-herdsman');
const fs = require('fs');
const path = require('node:path');

class Ota {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
        this.adapter.on('stateChange', this.onStateChange.bind(this));
        this.inProgress = new Set();
        this.otaAvailable = new Set();
    }

    start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
        this.adapter.setStateAsync(`${this.adapter.namespace}.info.ota`, false, true);
        this.adapter.setStateAsync(`${this.adapter.namespace}.info.ota_available`, '[]', true);
        setOtaConfiguration(this.adapter.getDataFolder());
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
    async onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'checkOtaAvail':
                    this.checkOta(obj);
                    break;
                case 'startOta':
                    this.startOta(obj);
                    break;
            }
        }
    }

    async onStateChange(id, state) {
        if (!id.includes('.info.') || state?.ack) return;
        const key = id.split('.').pop();
        switch (key) {
            case 'ota':
                if (state.val) {
                    const devices = await this.adapter.getDevicesAsync();
                    const targets = devices.map((d) => d.native.id).filter((id) => id.length ==16);
                    await this.multiCheckOtaAvail(targets);
                }
                break;
            case 'ota_available':
                try {
                    const arr = JSON.parse(state.val);
                    for (const devId of arr) {
                        const device = await this.zbController.resolveEntity(devId);
                        if (device) this.startOtaForDevice(device);
                    }
                    await this.adapter.setStateAsync(`${this.adapter.namespace}.info.ota_available`, JSON.stringify(Array.from(this.otaAvailable).map((ieee) => ieee.replace('0x', ''))), true);
                } catch (error) {
                    this.warn(`value of info.ota_available does not parse (${error?.message ?? 'no message given'})`);
                }
                break;
        }
    }

    async deviceFromStateId(stateID) {
        try {
            return await this.zbController.resolveEntity(stateID.replace(`${this.adapter.namespace}.`, '').split('.')[0]);
        }
        catch {
            // intentionally empty
        }
    }

    async otafromState(devId, statedesc, command) {
        const device = await this.zbController.resolveEntity(devId);
        if (device) {
            switch (command) {
                case 'ota': {
                    const result = await this.checkOtaforDevice(device);
                    if (result.status == 'available')
                        this.startOtaForDevice(device);
                    break;
                }
                case 'checkota':
                case 'check_ota':
                    await this.checkOtaforDevice(device);
                    break;

                case 'startota':
                case 'start_ota':
                    this.startOtaForDevice(device)
                    break;
            }
            this.stController.emit('acknowledge_state', devId, '', statedesc, command);
        }
    }

    async multiCheckOtaAvail(param) {
        const targets = param ?? [];
        const deviceCount= targets.length;
        let checked= 0;
        let upToDate=0;
        let updatable=0;
        for (const target of targets) {
            const device = await this.zbController.resolveEntity(adIdtoZbIdorIeee(this.adapter, target));
            if (!(device?.type == 'device' && device?.device?.type != 'Coordinator')) continue;
            const result = await this.checkOtaforDevice(device);
            switch (result.status) {
                case 'available':
                    updatable++;
                    break;
                case 'not_available':
                    upToDate++;
                    break;
            }
            checked++;
        }
        this.info(`Checked OTA availability: ${checked} out of ${deviceCount} devices checked - ${upToDate} up to date, ${updatable} updatable, ${deviceCount - upToDate - updatable} unavailable`);
        this.adapter.setStateAsync(`${this.adapter.namespace}.info.ota`, false, true);
    }

    async startOtaForDevice(device) {
        const devIeee = device?.device?.ieeeAddr ?? '0x0';
        const objID = zbIdorIeeetoAdId(this.adapter, devIeee, false)
        if (!this.otaAvailable.has(devIeee)) {
            const result = {};
            result.status = 'fail';
            result.msg = `no firmware available for ${devIeee}`;
        }
        if (this.inProgress.has(devIeee)) {
            this.error(`Update or check already in progress for '${devIeee}', skipping...`);
            return;
        }
        // do not attempt update for a device which has been deactivated or is unavailable
        const stateObj = await this.adapter.getObjectAsync(objID);
        if (stateObj && stateObj.common && stateObj.common.deactivated) {
            this.info(`Device ${devIeee} is deactivated, skipping ota check`);
            return;
        }
        const availablestate = await this.adapter.getStateAsync(`${objID}.available`);
        const lqi = await this.adapter.getStateAsync(`${objID}.link_quality`);
        if ((availablestate && (!availablestate.val)) || (lqi && lqi.val < 1)) {
            this.info(`Device ${devIeee} is marked unavailable, skipping ota check`);
            return;
        }
        this.inProgress.add(device.device.ieeeAddr);
        try {
            this.info('Start firmware update for ' + device.name);

            const onProgress = (progress, remaining) => {
                let message = `Update of '${device.name}' at ${progress}%`;
                if (remaining) {
                    message += `, +- ${Math.round(remaining / 60)} minutes remaining`;
                }
                this.info(message);
            };

            // const from_ = await this.readSoftwareBuildIDAndDateCode(device.device, false);
            const otaSettings = {
                update_check_interval: 1440,
                disable_automatic_update_check: true,
                zigbee_ota_override_index_location: null,
            }
            const source = {downgrade : false };
            const dataSettings = {
                // fallbacks are only to satisfy typing, should always be defined from settings defaults
                requestTimeout: otaSettings.image_block_request_timeout ?? /* v8 ignore next */ 150000,
                responseDelay: otaSettings.image_block_response_delay ?? /* v8 ignore next */ 250,
                baseSize: otaSettings.default_maximum_data_size ?? /* v8 ignore next */ 50,
            };
            const endpoint = undefined // for future use ?

            const [from, to] = await device.device.updateOta(
                source,
                undefined, //Zcl.ClustersTypes.TClusterCommandPayload<"genOta", "queryNextImageRequest"> | undefined,
                undefined,
                typeof device.mapped.ota === 'object' ? device.mapped.ota : {},
                onProgress,
                dataSettings,
                endpoint
            )
            // const fileVersion = await zhc_ota.update(device.device, device.mapped.ota, false, onProgress)
            // const to = await this.readSoftwareBuildIDAndDateCode(device.device, true);
            const [fromS, toS] = [JSON.stringify(from), JSON.stringify(to)];
            result.status = 'success';
            result.msg = `Finished update of '${device.name}'${to ? `, from '${fromS}' to '${toS}'` : ``} - reinterviewing the device`;
            await device.device.interview(true);

            this.info(result.msg);
        } catch (error) {
            const message = `Update of '${device.name}' failed (${error.message})`;
            result.status = 'fail';
            result.msg = message;
            this.error(message);
        }
        this.inProgress.delete(device.device.ieeeAddr);
        this.otaAvailable.delete(device.device.ieeeAddr);
        await this.adapter.setStateAsync(`${this.adapter.namespace}.info.ota_available`, JSON.stringify(Array.from(this.otaAvailable).map((ieee) => ieee.replace('0x', ''))), true);
        return result;
    }


    writeFirmwareHexToDataDir(hex /*:string*/, fileName/*: string | undefined*/, deviceIeee/*: string*/)/*: string*/ {
        if (!fileName) {
            fileName = `${deviceIeee}_${Date.now()}`;
        }

        const baseDir = this.adapter.expandFileName('ota');

        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, {recursive: true});
        }

        const filePath = path.join(baseDir, fileName);

        fs.writeFileSync(filePath, Buffer.from(hex, 'hex'));

        return filePath;
    }

    async checkDeviceObjects(ieeeAddr) {
        const objID = zbIdorIeeetoAdId(this.adapter, ieeeAddr, false)
        const obj = await this.adapter.getObjectAsync(objID);
        if ((obj ?? true) && obj?.common?.deactivated) {
            this.info(`Device ${ieeeAddr} is deactivated, skipping ota check`);
            return 'deactivated';
        }
        const availablestate = await this.adapter.getStateAsync(`${objID}.available`);
        const lqi = await this.adapter.getStateAsync(`${objID}.link_quality`);
        if ((availablestate && (!availablestate.val)) || (lqi && lqi.val < 1)) {
            this.info(`Device ${ieeeAddr} is marked unavailable, skipping ota check`);
            return 'unavailable';
        };
        return '';
    }

    async checkOtaforDevice(device) {
        const ieeeAddr = device?.device?.ieeeAddr ?? `0x0`;
        const result = {status: 'unknown', device: ieeeAddr};
        const msg = await this.checkDeviceObjects(ieeeAddr);
        if (msg != '') {
            result.status=  'fail';
            result.msg= `Device is ${msg}`;
            return result;
        }
        this.inProgress.add(ieeeAddr);
        try {
            this.debug(`Checking if firmware update is available for ${device.name}`);

            if (device && device.mapped.ota) {
                const available = await device.device.checkOta({ downgrade:false }, undefined, typeof device.mapped.ota === 'object' ? device.mapped.ota : {}, undefined);
                result.status = available.available ? 'available' : 'not_available';
                if (available.currentFileVersion !== available.otaFileVersion) {
                    this.debug(`current Firmware for ${device.name} is ${available.currentFileVersion} new is ${available.otaFileVersion}`);
                }
            } else {
                result.status = 'not_supported';
            }
            this.debug(`Firmware update for ${ieeeAddr} is ${result.status}`);
        } catch (error) {
            const message = `Failed to check if update available for '${ieeeAddr}' ${error.message}`;
            result.status = 'fail';
            result.msg = message;
            if (!message.includes(`Device didn't respond to OTA request`)) this.warn(message);
        }
        this.inProgress.delete(ieeeAddr);
        const otaAvailableSize = this.otaAvailable.size;
        switch (result.status) {
            case 'available': this.otaAvailable.add(ieeeAddr); break;
            case 'not_available':
            case 'not_supported': this.otaAvailable.delete(ieeeAddr); break;
            default: break;
        }
        if (otaAvailableSize != this.otaAvailable.size) {
            await this.adapter.setStateAsync(`${this.adapter.namespace}.info.ota_available`, JSON.stringify(Array.from(this.otaAvailable).map((ieee) => ieee.replace('0x', ''))), true);
        }
        return result;
    }

    async checkOta(obj) {
        const device = await this.getDeviceForMessage(obj);
        let result = {
            status: 'fail',
            device: getZbId(obj.message.devId),
            msg: 'Device is unavailable'
        }
        if (device) {
            if (this.inProgress.has(device.device.ieeeAddr)) {
                this.info(`Update or check already in progress for '${device.name}', skipping...`);
                return false;
            }
            // do not attempt update for a device which has been deactivated or is unavailable
            result = await this.checkOtaforDevice(device);
        }
        this.adapter.sendTo(obj.from, obj.command, result, obj.callback);
    }

    async startOta(obj) {
        const device = await this.getDeviceForMessage(obj);
        let result = {
            status: 'fail',
            device: getZbId(obj.message.devId),
            msg: 'Device is unavailable'
        }
        if (device) {
            result = await this.startOtaForDevice(device)
        }
        else {
            this.debug(`Device ${obj.message.devId} is unavailable`);
        }
        this.adapter.sendTo(obj.from, obj.command, result, obj.callback)
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
