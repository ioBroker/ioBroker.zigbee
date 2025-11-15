'use strict';

const BaseExtension = require('./zbBaseExtension');
const utils = require('./utils');

// Some EndDevices should be pinged
// e.g. E11-G13 https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
const forcedPingable = ['E11-G13','53170161','V3-BTZB','SPZB0001','014G2461'];

// asgothian: 29.12.2020: Removed color and color_temp from readable
// state candidates as most states do not provide a getter to ikea_transform
// the data from the herdsman back to the value needed, which
// will result in warnings "illegal state x,y" or "illegal state h,s" for color
// and possibly sudden changes in value due to the support for color_temp
// in mired and Kelvin.
const toZigbeeCandidates = ['local_temperature', 'state', 'brightness']; //, 'color', 'color_temp'];
const Hours25 = 1000 * 60 * 60 * 25;
const MinAvailabilityTimeout = 300; // ping every 5 minutes with few devices
const MaxAvailabilityTimeout = 1800; // ping every 30 minutes with many devices;
const AverageTimeBetweenPings = 45; // on average, plan for 30 seconds between pings.
const pingClusters = {
    c0a0: {id:'genBasic', attribute:'zclVersion'},
    c0a5: {id:'genBasic', attribute:'modelId'},
    c25a0: {id:'genOta', attribute:'upgradeServerId'},
};

/**
 * This extensions pings devices to check if they are online.
 */
class DeviceAvailability extends BaseExtension {
    constructor(zigbee, options, config) {
        super(zigbee, options);
        this.availability_timeout = 300; //  wait 5 min for live check
        this.timers = {};
        this.ping_counters = {};
        this.max_ping = 3;
        this.state = {};
        this.forcedNonPingable = {};
        this.number_of_registered_devices = 0;
        // force publish availability for new devices
        this.zigbee.on('new', (entity) => {
            // wait for 1s for creating device states
            setTimeout(() =>
                this.publishAvailability(entity.device, true, true), 1000);
        });
        this.startDevicePingQueue = []; // simple fifo array for starting device pings
        this.startDevicePingTimeout = null; // handle for the timeout which empties the queue
        this.startDevicePingDelay = 500; // 200 ms delay between starting the ping timeout
        this.startReadDelay = 0;
        this.name = 'DeviceAvailability';
        this.elevate_debug = false;
        this.isStarted = false;
        this.active_ping = config.pingCluster != 'off';
        this.max_ping = 5;
        this.availability_timeout = Math.max(60, typeof config.pingTimeout == 'number' ? config.pingTimeout : 300);
        this.startReadDelay = config.readAllAtStart ? Math.max(500, Math.min(10000, config.startReadDelay * 1000)) : 0;
        this.readAtAnnounce = config.readAtAnnounce;
        this.debugDevices = [];
        this.pingCluster = pingClusters[config.pingCluster] ? pingClusters[config.pingCluster] : {};
        this.availableTime = config.availableUpdateTime ? config.availableUpdateTime : Number.MAX_SAFE_INTEGER;
    }

    checkDebugDevice(dev) {
        if (typeof dev != 'string' || dev == '') return false;
        if (this.debugDevices === undefined) return false;
        else
        {
            for (const addressPart of this.debugDevices) {
                if (typeof dev === 'string' && dev.includes(addressPart)) {
                    return true;
                }
            }
        }
        return false;
    }

    setLocalVariable(name, value) {
        this[name] = value;
    }

    isPingable(device) {

        if (this.active_ping) {
            if (this.forced_ping && forcedPingable.find(d => d && d.hasOwnProperty('zigbeeModel') && d.zigbeeModel.includes(device.modelID))) {
                return true;
            }

            return utils.isRouter(device) && !utils.isBatteryPowered(device);
        }
        return false;
    }

    async getAllPingableDevices() {
        const clients = await this.zigbee.getClients();
        return clients.filter(d => this.isPingable(d));
    }

    async registerDevicePing(device, entity) {
        if (!this.isStarted) return;
        this.debug(`register device Ping for ${JSON.stringify(device.ieeeAddr)}`);
        this.forcedNonPingable[device.ieeeAddr] = false;
        if (!this.isPingable(device)) {
            return;
        }
        // ensure we do not already have this device in the queue
        // TODO: Following does not work, may be `if (this.startDevicePingQueue.find(item => item && item.device === device)) { return; }`
        this.startDevicePingQueue.forEach(item => {
            if (item && item.device == device) {
                return;
            }
        });
        this.number_of_registered_devices++;
        this.debug(`registering device Ping (${this.number_of_registered_devices}) for ${device.ieeeAddr} (${device.modelID})`);
        this.availability_timeout = Math.max(Math.min(this.number_of_registered_devices * AverageTimeBetweenPings, MaxAvailabilityTimeout), MinAvailabilityTimeout);
        this.startDevicePingQueue.push({device, entity});
        if (this.startDevicePingTimeout == null) {
            this.startDevicePingTimeout = setTimeout(async () =>
                await this.startDevicePing(), this.startDevicePingDelay);
        }
    }

    async deregisterDevicePing(device) {
        this.debug(`deregister device Ping for deactivated device ${JSON.stringify(device.ieeeAddr)}`);
        this.forcedNonPingable[device.ieeeAddr] = true;
        if (this.timers[device.ieeeAddr]) {
            clearTimeout(this.timers[device.ieeeAddr]);
        }
    }

    async startDevicePing() {
        if (!this.isStarted) return;
        this.startDevicePingTimeout = null;
        const item = this.startDevicePingQueue.shift();
        if (this.startDevicePingQueue.length > 0) {
            this.startDevicePingTimeout = setTimeout(async () =>
                await this.startDevicePing(), this.startDevicePingDelay);
        }
        if (item && item.hasOwnProperty('device')) {
            this.handleIntervalPingable(item.device, item.entity);
        }
    }

    async startNotPingable(device) {
        this.publishAvailability(device, true);
        this.timers[device.ieeeAddr] = setInterval(() =>
            this.handleIntervalNotPingable(device), utils.secondsToMilliseconds(this.availability_timeout));
    }

    async onZigbeeStarted() {
        // As some devices are not checked for availability (e.g. battery powered devices)
        // we mark these device as online by default.
        // NOTE: The start of active pings for pingable devices is done separately,
        // triggered by the 'new device' event to ensure that they are handled
        // identically on reconnect, disconnect and new pair (as)
        const clients = await this.zigbee.getClientIterator();
        const readables = [];

        this.isStarted = true;
        this.debug('onZigbeeStarted called');

        for (const device of clients) {
            if (this.isPingable(device) && this.active_ping) {
                readables.push(device);
                //                this.setTimerPingable(device);
            } else {
                this.debug(`Setting '${device.ieeeAddr}'  as available - battery driven or no active availability check`);
                this.publishAvailability(device, true);
                this.timers[device.ieeeAddr] = setInterval(() =>
                    this.handleIntervalNotPingable(device), utils.secondsToMilliseconds(this.availability_timeout));
            }
        }
        if (this.startReadDelay > 0 && readables.length > 0) {
            this.debug(`Triggering device_query on ${readables.length} devices in ${this.startReadDelay / 1000} seconds.`)
            setTimeout(() => {
                readables.forEach(device => this.zigbee.doDeviceQuery(device, Date().now, false));
            }, this.startReadDelay)
        }
    }

    async onDeviceRemove(device) {
        if (this.timers[device.ieeeAddr]) {
            clearTimeout(this.timers[device.ieeeAddr]);
        }
        delete this.timers[device.ieeeAddr];
    }

    async handleIntervalPingable(device, entity) {
        if (!this.isStarted) return;
        if (!this.active_ping) {
            return await this.handleIntervalnonPingable();
        }
        const has_elevated_debug = this.checkDebugDevice(device.ieeeAddr)

        const ieeeAddr = device.ieeeAddr;
        const resolvedEntity = entity ? entity : await this.zigbee.resolveEntity(ieeeAddr);
        if (!resolvedEntity) {
            const msg = `Stop pinging '${ieeeAddr}' ${device.modelID}, device is not known anymore`
            if (has_elevated_debug) this.warn(`ELEVADED: ${msg}`);
            else this.info(msg);
            return;
        }
        if (this.isPingable(device)) {
            const debugID = Date.now();
            let pingCount = this.ping_counters[device.ieeeAddr];
            if (pingCount === undefined) {
                this.ping_counters[device.ieeeAddr] = {failed: 0, reported: 0};
                pingCount = {failed: 0, reported: 0};
            }
            try {
                if (!this.pingCluster || !this.pingCluster.hasOwnProperty('id')) {
                    const message = `Pinging '${ieeeAddr}' (${device.modelID}) via ZH Ping`
                    if (has_elevated_debug) {
                        this.zigbee.emit('device_debug', { ID:debugID, data: { ID: device.ieeeAddr, flag:'PI', IO:false, states:[{ id:'ping', value: 'zh_default', payload: { method:'default'}}]}, message:message});
                    }
                    else this.debug(message)
                    await device.ping();
                }
                else {
                    const zclData = {};
                    zclData[this.pingCluster.attribute] = {};
                    const message = `Pinging '${ieeeAddr}' (${device.modelID}) via ZCL Read with ${this.pingCluster.id}:${this.pingCluster.attribute}`
                    if (has_elevated_debug) {
                        this.zigbee.emit('device_debug', { ID:debugID, data: { ID: device.ieeeAddr, flag:'PI', states:[{id:'ping', value:'cluster/id', payload: { method: 'custom', cluster:this.pingCluster.id, command:'read', zcl:zclData}}], IO:false}, message:message});
                    }
                    else this.debug(message)
                    await this.zigbee.publish(device, this.pingCluster.id, 'read', zclData, null, undefined, 'foundation');
                }
                this.publishAvailability(device, true, false, has_elevated_debug ? debugID : undefined);
                if (has_elevated_debug) {
                    const message = `Successfully pinged ${ieeeAddr} (${device.modelID}) in ${Date.now()-debugID} ms`
                    this.zigbee.emit('device_debug', { ID:debugID, data: {ID: device.ieeeAddr, flag:'SUCCESS', IO:false}, message:message});
                }
                this.setTimerPingable(device, 1);
                this.ping_counters[device.ieeeAddr].failed = 0;
            } catch (error) {
                if (error && error.message && error.message.includes('UNSUPPORTED_ATTRIBUTE')) {
                    // this error is acceptable, as it is raised off an answer of the device.
                    this.publishAvailability(device, true);
                    if (has_elevated_debug)
                        this.zigbee.emit('device_debug', {  ID:debugID, data: {ID: device.ieeeAddr, flag:'SUCCESS', IO:false}, message:`Successfully pinged ${ieeeAddr} (${device.modelID}) in ${Date.now()-debugID} ms`});
                    this.setTimerPingable(device, 1);
                    this.ping_counters[device.ieeeAddr].failed = 0;
                    return;
                }
                if (has_elevated_debug)
                    this.zigbee.emit('device_debug',{ ID:debugID, data: {ID: device.ieeeAddr, error:'PIFAIL', IO:false}, message:`Failed to ping ${ieeeAddr} (${device.modelID}) after ${Date.now()-debugID} ms${error && error.message ? ' - '+error.message : ''}`});
                this.publishAvailability(device, false, false, has_elevated_debug ? debugID : undefined);
                if (pingCount.failed++ <= this.max_ping) {
                    const message = `Failed to ping ${ieeeAddr} ${device.modelID} for ${JSON.stringify(pingCount)} attempts`
                    if (pingCount.failed < 2 && pingCount.reported < this.max_ping) {
                        if (!has_elevated_debug)
                            this.info(message);
                        pingCount.reported++;
                    } else {
                        this.debug(message);
                    }
                    this.setTimerPingable(device, pingCount.failed);
                    this.ping_counters[device.ieeeAddr] = pingCount;
                } else {
                    const msg = `Stopping to ping ${ieeeAddr} ${device.modelID} after ${pingCount.failed} ping attempts`;
                    if (has_elevated_debug)
                        this.zigbee.emit('device_debug',{ ID:debugID, data: {ID: device.ieeeAddr, error:'PISTOP', IO:false}, message:msg});
                    else
                        this.info(msg);
                }
            }
        }
    }

    async handleIntervalNotPingable(device) {
        if (!this.isStarted) return;
        const entity = await this.zigbee.resolveEntity(device.ieeeAddr);
        if (!entity || !device.lastSeen) {
            return;
        }

        const ago = Date.now() - entity.device.lastSeen;

        if (ago > Hours25) {
            this.publishAvailability(entity.device, false);
            const msg = `Non-pingable device ${entity.device.ieeeAddr} ${entity.device.modelID} was last seen over 25 hrs ago - setting it offline.`
            if (this.checkDebugDevice(device.ieeeAddr)) this.warn(`ELEVATED: ${msg}`); else this.debug(msg);
            return;
        }
        const msg = `Non-pingable device ${entity.device.ieeeAddr} ${entity.device.modelID} was last seen '${ago / 1000}' seconds ago.`
        if (this.checkDebugDevice(device.ieeeAddr)) this.warn(`ELEVATED: ${msg}`); else this.debug(msg);
    }

    setTimerPingable(device, factor) {
        if (!this.isStarted) return;
        if (factor === undefined || factor < 1) {
            factor = 1;
        }
        if (this.timers[device.ieeeAddr]) {
            clearTimeout(this.timers[device.ieeeAddr]);
        }
        this.timers[device.ieeeAddr] = setTimeout(async () =>
            await this.handleIntervalPingable(device), utils.secondsToMilliseconds(this.availability_timeout * factor));
    }

    async stop() {
        this.isStarted = false;
        for (const timer of Object.values(this.timers)) {
            clearTimeout(timer);
        }
        const clients = await this.zigbee.getClients();
        clients.forEach(device => this.publishAvailability(device, false));
    }

    async onReconnect(device) {
        const entity = await this.zigbee.resolveEntity(device);
        if (entity && entity.mapped) {
            const used = [];
            try {
                for (const key of toZigbeeCandidates) {
                    const converter = entity.mapped.toZigbee.find((tz) => tz.key.includes(key));
                    if (converter && !used.includes(converter)) {
                        await converter.convertGet(device.endpoints[0], key, {device:entity.device});
                        used.push(converter);
                    }
                }
            } catch (error) {
                this.sendError(error);
                this.debug(`Failed to read state of '${entity.device.ieeeAddr}' after reconnect`);
            }
        }
    }

    async publishAvailability(device, available, force) {
        // no device availability until the interview is done.
        if (device?.interviewState == 'IN_PROGRESS')
            return;
        const entity = await this.zigbee.resolveEntity(device);
        if (entity && entity.mapped) {
            const ieeeAddr = device.ieeeAddr;
            if (this.state.hasOwnProperty(ieeeAddr) && !this.state[ieeeAddr] && available) {
                this.onReconnect(device);
            }

            const astate = this.state[ieeeAddr] || { available, ts:0 };
            const now = Math.round(Date.now()/1000);

            if (force || (astate.available !== available) || (now - astate.ts > this.availableTime)) {
                this.state[ieeeAddr] = {
                    ts: now,
                    available
                }
                const payload = {available: available};
                this.debug(`Publish available for ${ieeeAddr} = ${available}`);
                this.zigbee.emit('publish', utils.zbIdorIeeetoAdId(this.adapter, ieeeAddr, false), entity.mapped.model, payload);
                if (force || (astate.available !== available)) {
                    this.debug(`Publish LQ for ${ieeeAddr} = ${(available ? 10 : 0)}`);
                    this.zigbee.emit('publish', utils.zbIdorIeeetoAdId(this.adapter, ieeeAddr, false), entity.mapped.model, {linkquality: (available ? 10 : 0)});
                }
            }
        }
    }

    async onZigbeeEvent(data, mappedDevice) {
        const device = data.device;
        if (!device || this.forcedNonPingable[device.ieeeAddr]) {
            return;
        }

        this.publishAvailability(device, true);

        if (this.isPingable(device)) {
            // When a zigbee message from a device is received we know the device is still alive.
            // => reset the timer.
            this.setTimerPingable(device, 1);
            const pc = this.ping_counters[device.ieeeAddr];
            if (pc == undefined) {
                this.ping_counters[device.ieeeAddr] = {failed: 0, reported: 0};
            } else {
                this.ping_counters[device.ieeeAddr].failed++;
            }

            const online = this.state.hasOwnProperty(device.ieeeAddr) && this.state[device.ieeeAddr];
            if (online && data.type === 'deviceAnnounce' && !utils.isIkeaTradfriDevice(device)) {
                // We only try to read the states if readAtAnnounce and resend_states is not active
                if (mappedDevice && !this.readAtAnnounce && !device.options?.resend_states) {
                    this.onReconnect(device);
                }
            }
        }
    }
}

module.exports = DeviceAvailability;
