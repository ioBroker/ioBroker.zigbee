'use strict';

const BaseExtension = require('./zbBaseExtension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const utils = require('./utils');

// Some EndDevices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const forcedPingable = [
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'E11-G13'),
    zigbeeHerdsmanConverters.devices.find((d) => d.model === '53170161'),
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'V3-BTZB'),
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'SPZB0001'),
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'eTRV0100')
];

const toZigbeeCandidates = ['state', 'brightness', 'color', 'color_temp'];
const Hours25 = 1000 * 60 * 60 * 25;

/**
 * This extensions pings devices to check if they are online.
 */
class DeviceAvailability extends BaseExtension {
    constructor(zigbee, options) {
        super(zigbee, options);
        this.availability_timeout = 300; //  wait 5 min for live check
        this.timers = {};
        this.state = {};
        // force publish availability for new devices
        this.zigbee.on('new', (entity) => {
            // wait for 1s for creating device states
            setTimeout(() => {
                this.publishAvailability(entity.device, true, true);
            }, 1000);
        });
    }

    isPingable(device) {
        if (forcedPingable.find((d) => d && d.hasOwnProperty('zigbeeModel') && d.zigbeeModel.includes(device.modelID))) {
            return true;
        }

        const result = utils.isRouter(device) && !utils.isBatteryPowered(device);
        return result;
    }

    async getAllPingableDevices() {
        const clients = await this.zigbee.getClients();
        return clients.filter((d) => this.isPingable(d));
    }

    async onZigbeeStarted() {
        // As some devices are not checked for availability (e.g. battery powered devices)
        // we mark all device as online by default.
        const clients = await this.zigbee.getClients();

        for (const device of clients) {
            this.publishAvailability(device, true);

            if (this.isPingable(device)) {
                this.setTimerPingable(device);
            } else {
                this.timers[device.ieeeAddr] = setInterval(() => {
                    this.handleIntervalNotPingable(device);
                },utils.secondsToMilliseconds(this.availability_timeout));
            }
        }
    }

    async handleIntervalPingable(device) {
        const ieeeAddr = device.ieeeAddr;
        const resolvedEntity = await this.zigbee.resolveEntity(ieeeAddr);
        if (!resolvedEntity) {
            this.debug(`Stop pinging '${ieeeAddr}' ${device.modelID}, device is not known anymore`);
            return;
        }

        if (this.isPingable(device)) {
            try {
                await device.ping();
                this.publishAvailability(device, true);
                this.debug(`Successfully pinged ${ieeeAddr} ${device.modelID}`);
            } catch (error) {
                this.publishAvailability(device, false);
                this.debug(`Failed to ping ${ieeeAddr} ${device.modelID}`);
            } finally {
                this.setTimerPingable(device);
            }
        }
    }


    async handleIntervalNotPingable(device) {
        const entity = await this.zigbee.resolveEntity(device.ieeeAddr);
        if (!entity || !device.lastSeen) {
            return;
        }

        const ago = Date.now() - entity.device.lastSeen;
        this.debug(`Non-pingable device ${entity.device.ieeeAddr} ${entity.device.modelID} was last seen '${ago / 1000}' seconds ago.`);

        if (ago > Hours25) {
            this.publishAvailability(entity.device, false);
        }
    }

    setTimerPingable(device) {
        if (this.timers[device.ieeeAddr]) {
            clearTimeout(this.timers[device.ieeeAddr]);
        }

        this.timers[device.ieeeAddr] = setTimeout(async() => {
            await this.handleIntervalPingable(device);
        }, utils.secondsToMilliseconds(this.availability_timeout));
    }

    async stop() {
        for (const timer of Object.values(this.timers)) {
            clearTimeout(timer);
        }
        const clients = await this.zigbee.getClients();
        clients.forEach((device) => this.publishAvailability(device, false));
    }

    async onReconnect(device) {
        const entity = await this.zigbee.resolveEntity(device);
        if (entity && entity.mapped) {
            const used = [];
            try {
                for (const key of toZigbeeCandidates) {
                    const converter = entity.mapped.toZigbee.find((tz) => tz.key.includes(key));
                    if (converter && !used.includes(converter)) {
                        await converter.convertGet(device.endpoints[0], key, {});
                        used.push(converter);
                    }
                }
            } catch (error) {
                this.debug(`Failed to read state of '${entity.device.ieeeAddr}' after reconnect`);
            }
        }
    }

    async publishAvailability(device, available, force) {
        const entity = await this.zigbee.resolveEntity(device);
        if (entity && entity.mapped) {
            const ieeeAddr = device.ieeeAddr;
            if (this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] && available) {
                this.onReconnect(device);
            }

            if (this.state[ieeeAddr] !== available || force) {
                this.state[ieeeAddr] = available;
                const payload = {available: available};
                this.debug(`Publish available for ${ieeeAddr} = ${available}`);
                this.zigbee.emit('publish', ieeeAddr.substr(2), entity.mapped.model, payload);
            }
        }
    }

    onZigbeeEvent(data) {
        const device = data.device;
        if (!device) {
            return;
        }

        this.publishAvailability(device, true);

        if (this.isPingable(device)) {
            // When a zigbee message from a device is received we know the device is still alive.
            // => reset the timer.
            this.setTimerPingable(device);

            const online = this.state.hasOwnProperty(device.ieeeAddr) && this.state[device.ieeeAddr];
            if (online && data.type === 'deviceAnnounce' && !utils.isIkeaTradfriDevice(device)) {
                /**
                * In case the device is powered off AND on within the availability timeout,
                * zigbee2qmtt does not detect the device as offline (device is still marked online).
                * When a device is turned on again the state could be out of sync.
                * https://github.com/Koenkk/zigbee2mqtt/issues/1383#issuecomment-489412168
                * endDeviceAnnce is typically send when a device comes online.
                *
                * This isn't needed for TRADFRI devices as they already send the state themself.
                */
                this.onReconnect(device);
            }
        }
    }
}

module.exports = DeviceAvailability;
