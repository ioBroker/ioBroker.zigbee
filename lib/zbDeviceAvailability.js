const BaseExtension = require('./zbBaseExtension');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const utils = require('./utils');

// Some EndDevices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const forcedPingable = [
    zigbeeHerdsmanConverters.devices.find((d) => d.model === 'E11-G13'),
];

const toZigbeeCandidates = ['state', 'brightness', 'color', 'color_temp'];
const Hours25 = 1000 * 60 * 60 * 25;

/**
 * This extensions pings devices to check if they are online.
 */
class DeviceAvailability extends BaseExtension {
    constructor(zigbee, options) {
        super(zigbee, options);
        this.whitelist = [];
        this.blacklist = [];
        this.availability_timeout = 60; // 60 sec. wait for live check
        this.timers = {};
        this.state = {};
    }

    isPingable(device) {
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

    isAllowed(device) {
        // Whitelist is not empty and device is in it, enable availability
        if (this.whitelist !== undefined && this.whitelist.length > 0) {
            return this.whitelist.includes(device.ieeeAddr);
        }

        // Device is on blacklist, disable availability
        if (this.blacklist !== undefined && this.blacklist.includes(device.ieeeAddr)) {
            return false;
        }

        return true;
    }

    async onZigbeeStarted() {
        // As some devices are not checked for availability (e.g. battery powered devices)
        // we mark all device as online by default.
        const clients = await this.zigbee.getClients();

        for (const device of clients) {
            this.publishAvailability(device, true);

            if (this.isAllowed(device)) {
                if (this.isPingable(device)) {
                    this.setTimerPingable(device);
                } else {
                    this.timers[device.ieeeAddr] = setInterval(() => {
                            this.handleIntervalNotPingable(device);
                    },utils.secondsToMilliseconds(300));
                }
            }
        }
    }

    async handleIntervalPingable(device) {
        // When a device is already unavailable, log the ping failed on 'debug' instead of 'error'.
        const ieeeAddr = device.ieeeAddr;
        const level = this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] ? 'debug' : 'error';

        if (this.isPingable(device)) {
          try {
            await device.ping();
            this.publishAvailability(device, true);
            this.debug(`Successfully pinged ${ieeeAddr} ${device.modelID}`);
          } catch (error) {
            this.publishAvailability(device, false);
            //          this[level](`Failed to ping ${ieeeAddr} ${device.modelID} ${error.stack}`);
          } finally {
            this.setTimerPingable(device);
          }
        }
    }


    async handleIntervalNotPingable(device) {
        const ago = Date.now() - device.lastSeen;
        const entity = this.zigbee.resolveEntity(device.ieeeAddr);
        if (!entity || !device.lastSeen) {
            return;
        }

        this.debug(`Non-pingable device '${entity.name}' was last seen '${ago / 1000}' seconds ago.`);

        if (ago > Hours25) {
            this.publishAvailability(device, false);
        }
    }

    setTimerPingable(device) {
        if (this.timers[device.ieeeAddr]) {
            clearTimeout(this.timers[device.ieeeAddr]);
        }

        this.timers[device.ieeeAddr] = setTimeout(async() => {
                await this.handleIntervalPingable(device);
        },utils.secondsToMilliseconds(this.availability_timeout));
    }


    setTimer(device) {
        if (this.timers[device.ieeeAddr]) {
            clearTimeout(this.timers[device.ieeeAddr]);
        }

        this.timers[device.ieeeAddr] = setTimeout(async() => {
                await this.handleIntervalPingable(device);
        }, 1000 * this.availability_timeout);
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
                    this.debug(`Failed to read state of '${device.ieeeAddr}' after reconnect`);
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

      //    if (this.isPingable(device)) {
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

module.exports = DeviceAvailability;
