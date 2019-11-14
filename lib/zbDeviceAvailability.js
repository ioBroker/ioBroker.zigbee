const BaseExtension = require('./zbBaseExtension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const utils = require('./utils');

// Some EndDevices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const forcedPingable = [
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'E11-G13'),
];

const toZigbeeCandidates = ['state', 'brightness', 'color', 'color_temp'];

/**
 * This extensions pings devices to check if they are online.
 */
class DeviceAvailability extends BaseExtension {
    constructor(zigbee, options) {
        super(zigbee, options);
        this.availability_timeout = 60;
        this.timers = {};
        this.state = {};

        // // Initialize blacklist
        // this.blacklist = settings.get().advanced.availability_blacklist.map((e) => {
        //     return settings.getEntity(e).ID;
        // });
    }

    isPingable(device) {
        // if (this.blacklist.includes(device.ieeeAddr)) {
        //     return false;
        // }

        if (forcedPingable.find((d) => d.zigbeeModel.includes(device.modelID))) {
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
        clients.forEach((device) => this.publishAvailability(device, true));

        // Start timers for all devices
        (await this.getAllPingableDevices()).forEach((device) => this.setTimer(device));
    }

    async handleInterval(device) {
        // When a device is already unavailable, log the ping failed on 'debug' instead of 'error'.
        const ieeeAddr = device.ieeeAddr;
        const level = this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] ? 'debug' : 'error';
        const entity = this.zigbee.resolveEntity(device.ieeeAddr);
        try {
            await device.ping();
            this.publishAvailability(device, true);
            this.debug(`Successfully pinged ${ieeeAddr} ${device.modelID}`);
        } catch (error) {
            this.publishAvailability(device, false);
            this[level](`Failed to ping ${ieeeAddr} ${device.modelID} ${error.stack}`);
        } finally {
            this.setTimer(device);
        }
    }

    setTimer(device) {
        if (this.timers[device.ieeeAddr]) {
            clearTimeout(this.timers[device.ieeeAddr]);
        }

        this.timers[device.ieeeAddr] = setTimeout(async () => {
            await this.handleInterval(device);
        }, 1000*this.availability_timeout);
    }

    async stop() {
        for (const timer of Object.values(this.timers)) {
            clearTimeout(timer);
        }
        const clients = await this.zigbee.getClients();
        clients.forEach((device) => this.publishAvailability(device, false));
    }

    async onReconnect(device) {
        if (device && device.modelID) {
            const mappedDevice = zigbeeHerdsmanConverters.findByZigbeeModel(device.modelID);
            if (mappedDevice) {
                const used = [];
                for (const key of toZigbeeCandidates) {
                    const converter = mappedDevice.toZigbee.find((tz) => tz.key.includes(key));
                    if (converter && !used.includes(converter)) {
                        converter.convertGet(device.endpoints[0], key, {});
                        used.push(converter);
                        try {
                            for (const key of toZigbeeCandidates) {
                                const converter = mappedDevice.toZigbee.find((tz) => tz.key.includes(key));
                                if (converter && !used.includes(converter)) {
                                    await converter.convertGet(device.endpoints[0], key, {});
                                    used.push(converter);
                                }   
                            }
                        } catch (error) {
                            const entity = this.zigbee.resolveEntity(device.ieeeAddr);
                            logger.error(`Failed to read state of '${entity.name}' after reconnect`);
                        }
                    }
                }
            }          
        }
    }

    publishAvailability(device, available) {
        const ieeeAddr = device.ieeeAddr;
        if (this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] && available) {
            this.onReconnect(device);
        }
        if (this.state[ieeeAddr] !== available) {
            this.state[ieeeAddr] = available;
            const payload = {available: available};
            this.debug(`Publish available for ${ieeeAddr} = ${available}`)
            this.zigbee.emit('publish', ieeeAddr.substr(2), device.modelID, payload);
        }
    }

    onZigbeeEvent(data, mappedDevice) {
        const device = data.device;
        if (!device) {
            return;
        }

        if (this.isPingable(device)) {
            // When a zigbee message from a device is received we know the device is still alive.
            // => reset the timer.
            this.setTimer(device);

            const online = this.state.hasOwnProperty(device.ieeeAddr) && this.state[device.ieeeAddr];
            const offline = this.state.hasOwnProperty(device.ieeeAddr) && !this.state[device.ieeeAddr];

            if (!online && !offline) {
                // A new device has been connected
                this.publishAvailability(device, true);
            } else if (offline) {
                // When a message is received and the device is marked as offline, mark it online.
                this.publishAvailability(device, true);
            } else {
                /* istanbul ignore else */
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
}

module.exports = DeviceAvailability;
