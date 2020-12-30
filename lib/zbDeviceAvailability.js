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
    zigbeeHerdsmanConverters.devices.find((d) => d.model === '014G2461')
];

// asgothian: 29.12.2020: Removed color and color_temp from readable
// state candidates as most states do not provide a getter to ikea_transform
// the data from the herdsman back to the value needed, which
// will result in warnings "illegal state x,y" or "illegal state h,s" for color
// and possibly sudden changes in value due to the support for color_temp
// in mired and Kelvin.
const toZigbeeCandidates = ['state', 'brightness']; //, 'color', 'color_temp'];
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
        this.startDevicePingQueue = []; // simple fifo array for starting device pings
        this.startDevicePingTimeout = null; // handle for the timeout which empties the queue
        this.startDevicePingDelay = 200; // 200 ms delay between starting the ping timeout
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

    async registerDevicePing(device, entity) {
        //        this.warn(`Called registerDevicePing for '${device}' of '${entity}'`);
        if (!this.isPingable(device)) return;
        // ensure we do not already have this device in the queue
        this.startDevicePingQueue.forEach(item => {
            if (item && item.device == device)
                return;
        });
        this.startDevicePingQueue.push({device:device, entity:entity});
        if (this.startDevicePingTimeout == null)
            this.startDevicePingTimeout = setTimeout(async() => {
                await this.startDevicePing();
            }, this.startDevicePingDelay);
    }

    async startDevicePing() {
        //        this.warn(JSON.stringify(this));
        this.startDevicePingTimeout = null;
        const item = this.startDevicePingQueue.shift();
        if (this.startDevicePingQueue.length >0) {
            this.startDevicePingTimeout = setTimeout(async() => {
                await this.startDevicePing();
            }, this.startDevicePingDelay);
        }
        if (item && item.hasOwnProperty('device')) {
            this.handleIntervalPingable(item.device, item.entity);
        }
    }
    async onZigbeeStarted() {
        // As some devices are not checked for availability (e.g. battery powered devices)
        // we mark these device as online by default.
        // NOTE: The start of active pings for pingable devices is done separately,
        // triggered by the 'new device' event to ensure that they are handled
        // identically on reconnect, disconnect and new pair (as)
        const clients = await this.zigbee.getClients();
        //        this.warn('onZigbeeStarted called');
        for (const device of clients) {

            if (this.isPingable(device)) {
                //                this.setTimerPingable(device);
            } else {
                //                this.warn(`Setting '${device.ieeeAddr}'  as available - battery driven`);
                this.publishAvailability(device, true);
                this.timers[device.ieeeAddr] = setInterval(() => {
                    this.handleIntervalNotPingable(device);
                },utils.secondsToMilliseconds(this.availability_timeout));
            }
        }
    }

    async handleIntervalPingable(device, entity) {
        const ieeeAddr = device.ieeeAddr;
        const resolvedEntity = (entity ? entity: await this.zigbee.resolveEntity(ieeeAddr));
        if (!resolvedEntity) {
            this.debug(`Stop pinging '${ieeeAddr}' ${device.modelID}, device is not known anymore`);
            return;
        }

        if (this.isPingable(device)) {
            // first see if we can "ping" the device by reading a Status
            try {
                for (const key of toZigbeeCandidates) {
                    //                    this.warn(`searching if state  '${key}' of '${entity.device.ieeeAddr}' is readable after reconnect`);
                    const converter = entity.mapped.toZigbee.find((tz) => tz.key.includes(key));
                    if (converter) {
                        await converter.convertGet(device.endpoints[0], key, {});
                        this.debug(`Successful read state '${key}' of '${device.ieeeAddr}' in stead of pinging`);
                        this.setTimerPingable(device);
                        return;
                    }
                }
            }
            catch (error) {
                // intentionally empty: Just present to ensure we cause no harm
                // when reading the state fails. => fall back on standard Ping function
            }

            try {
                await device.ping();
                this.publishAvailability(device, true);
                this.debug(`Successfully pinged ${ieeeAddr} ${device.modelID}`);
            } catch (error) {
                this.publishAvailability(device, false);
                this.warn(`Failed to ping ${ieeeAddr} ${device.modelID}`);
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
                this.debug(`Publish LQ for ${ieeeAddr} = ${(available ? 10: 0)}`);
                this.zigbee.emit('publish', ieeeAddr.substr(2), entity.mapped.model, { linkquality: (available ? 10: 0) });
            }
        //    if (!available) {
        //        this.debug(`Publish LQ for ${ieeeAddr} = 0`);
        //        this.zigbee.emit('publish', ieeeAddr.substr(2), entity.mapped.model, { linkquality: 0 });
        //    }
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
