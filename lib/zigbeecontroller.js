'use strict';

const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('zigbee:controller');
const Queue = require('queue');

function isFunction(functionToCheck) {
    return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

class ZigbeeController extends EventEmitter {
    /*
      events:

      log - log (level, msg, data)
      event - preparsed device events (type, dev, msg, data)
      new - new device connected to network (id, msg)
      leave - device leave the network (id, msg)
      join - join countdown (counter)
      ready - connection successfull ()
    */

    constructor(shepherd) {
        super();
        this.shepherd = shepherd;
        /**
         * Setup command queue.
         * The command queue ensures that only 1 command is executed at a time.
         * When executing multiple commands at the same time, some commands may fail.
         */
        this.queue = new Queue();
        this.queue.concurrency = 1;
        this.queue.autostart = true;

        this.handleReady = this.handleReady.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleJoining = this.handleJoining.bind(this);
        this.incMsgHandler = this.incMsgHandler.bind(this); 

        this.shepherd.on('ready', this.handleReady);
        this.shepherd.on('ind', this.handleMessage);
        this.shepherd.on('error', this.handleError);
        this.shepherd.on('permitJoining', this.handleJoining);
        this.shepherd.controller.on('ZCL:incomingMsg', this.incMsgHandler);
    }

    info (message, data) {
        debug('info', message, data);
        this.emit('log', 'info', message, data);
    }

    error (message, data) {
        debug('error', message, data);
        this.emit('log', 'error', message, data);
    }

    debug (message, data) {
        debug('debug', message, data);
        this.emit('log', 'debug', message, data);
    }

    event (type, dev, message, data) {
        debug('event', type, message, data);
        this.emit('event', type, dev, message, data);
    }

    getInfo() {
        return this.shepherd.info();
    }

    // Start controller
    start(callback) {
        // start the server
        this.shepherd.start((err) => {
            if (err) {
                this.debug('Error while starting zigbee-shepherd, attemping to fix... (takes 60 seconds)');
                this.shepherd.controller._znp.close((() => null));

                setTimeout(() => {
                    this.info(`Starting zigbee-shepherd`);
                    this.shepherd.start((error) => {
                        if (error) {
                            this.error('Error while starting zigbee-shepherd!', error);
                            if (callback) callback(error);
                        } else {
                            this.info('zigbee-shepherd started');
                            if (callback) callback();
                        }
                    });
                }, 60 * 1000);
            } else {
                this.info('zigbee-shepherd started!');
                if (callback) callback();
            }
        });
    }

    softReset(callback) {
        this.shepherd.reset('soft', callback);
    }

    handleReady() {
        // Set all Xiaomi devices (manufId === 4151) to be online, so shepherd won't try
        // to query info from devices (which would fail because they go tosleep).
        // Xiaomi lumi.plug has manufId === 4447 and can be in the sleep mode too
        const devices = this.getAllClients();
        devices.forEach((device) => {
            if ((device.manufId === 4151) || (device.manufId === 4447)) {
                this.shepherd.find(device.ieeeAddr, device.epList[0]).getDevice().update({
                     status: 'online',
                     joinTime: Math.floor(Date.now() / 1000),
                });
            }
        });
        const firmware = this.getInfo().firmware || {};
        this.info(`zigbee-shepherd ready. version: ${firmware.version} rev ${firmware.revision}`);
        this.emit('ready');
    }

    handleError(message) {
        // This event may appear if zigbee-shepherd cannot decode bad packets (invalid checksum).
        this.error(message);
    }

    handleJoining(joinTimeLeft) {
        this.debug('Join countdown', joinTimeLeft);
        this.emit('join', joinTimeLeft);
    }

    incMsgHandler(message){
        //this.debug('incoming msg', message);
        const device = this.shepherd._findDevByAddr(message.srcaddr);
        if (!device) {
            this.debug('Message without device!');
            return;
        }
        // We can't handle devices without modelId.
        if (!device.modelId) {
            this.debug('Message without modelId!');
            return;
        }
        this.event('msg', device.ieeeAddr, message, {
            modelId: device.modelId
        });
    }

    // Stop controller
    stop(callback) {
        this.queue.stop();
        this.shepherd.stop((error) => {
            this.info('zigbee-shepherd stopped');
            if (callback) callback(error);
        });
    }

    // Devices list
    getAllClients() {
        return this.shepherd.list().filter((device) => device.type !== 'Coordinator');
    }

    getDevices() {
        return this.shepherd.list();
    }

    getCoordinator() {
        const device = this.shepherd.list().find((d) => d.type === 'Coordinator');
        return this.shepherd.find(device.ieeeAddr, 1);
    }

    // Permit join
    permitJoin(permit, devid, failure) {
        let permitDev = 'all';
        if (isFunction(devid) && !isFunction(failure)) {
            failure = devid;
        } else {
            const dev = this.getDevice(devid);
            if (dev) {
                permitDev = dev.nwkAddr;
            }
        }

        if (permit) {
            this.info('Zigbee: allowing new devices to join.');
        } else {
            this.info('Zigbee: disabling joining new devices.');
        }

        this.shepherd.permitJoin(permit ? permit : 0, permitDev, (error) => {
            if (error) {
                this.error('Join failure.', error);
                if (failure) failure(error);
            }
        });
    }

    // Remove device
    remove(deviceID, callback) {
        this.shepherd.remove(deviceID, {}, (error) => {
            if (error) {
                this.error('Remove failure.', error);                
                if (callback) callback(error);
            } else {
                this.debug('Remove sucessful.');
                if (callback) callback();
            }
        });
    }

    forceRemove(deviceID, callback) {
        const device = this.shepherd._findDevByAddr(deviceID);
        // force
        return this.shepherd._unregisterDev(device, (err, result) => {
            return callback(err, result);
        });
    }

    // Zigbee events
    handleMessage(message) {
        this.debug('handleMessage', message);
        switch (message.type) {
            case 'devIncoming':
                this.newDevice(message);
                break;
            case 'devInterview':
                this.interviewDevice(message);
                break;
            case 'devLeaving':
                this.leavingDevice(message);
                break;
            default:
                // We dont handle messages without endpoints.
                if (!message.endpoints) {
                    this.debug('Message without endpoints!');
                    return;
                }
                const device = message.endpoints[0].device;
                if (!device) {
                    this.debug('Message without device!');
                    return;
                }
                // We can't handle devices without modelId.
                if (!device.modelId) {
                    this.debug('Message without modelId!');
                    return;
                }
                // After this point we cant handle message without cid anymore.
                if (message.data.cid === undefined) {
                    this.debug('Message without data cluster!');
                    return;
                }
                // send pre-parsed event
                this.event(message.type, device.ieeeAddr, message, {
                    cid: message.data.cid,
                    modelId: device.modelId,
                });
        }
    }

    newDevice(message) {
        this.debug('new device ' + message.data + ' joining the network!');
        this.emit('new', message.data, message);
    }

    leavingDevice(message) {
        this.debug('device ' + message.data + ' leaving the network!');
        this.emit('leave', message.data, message);
    }

    interviewDevice(message) {
        // calc progress
        let maxEp = message.status.endpoint.total,
            curEp = message.status.endpoint.current,
            maxCl = message.status.endpoint.cluster.total,
            curCl = message.status.endpoint.cluster.current,
            progress = Math.round(curCl * 100 / maxCl);

        this.event('interview', message.data, message, {
            totalEp: maxEp, currentEp: curEp, progress: progress
        });
    }

    // Zigbee commands
    
    checkOnline(deviceID) {
        const device = this.shepherd._findDevByAddr(deviceID);

        if (device) {
            // Note: checkOnline has the callback argument but does not call callback
            this.debug(`Check online ${deviceID}`, deviceID);
            this.shepherd.controller.checkOnline(device);
        }
    }

    enabled() {
        return this.shepherd.info().enabled;
    }

    getMap(callback) {
        if (!this.enabled()) {
            if (callback) callback([]);
        }
        this.shepherd.lqiScan().then((result)=>{
            this.debug('lqiScan result: ', result);
            if (callback) callback(result);
        });
    }
    
    configureReport(ieeeAddr, reports) {
        reports.forEach((r) => {
            const device = this.shepherd.find(ieeeAddr, r.ep);
            if (device) {
                device.report(r.cid, r.attr, r.minInt, r.maxInt, r.repChange, (error) => {
                    if (error) {
                        this.error(`Failed to configure reporting for ${ieeeAddr} ${r.cid} ${r.attr}`, error);
                    } else {
                        this.info(`Configured reporting for ${ieeeAddr} ${r.cid} ${r.attr}`);
                    }
                });
            } else {
                this.error(`Failed to configure reporting for ${ieeeAddr} ${r.cid} ${r.attr} (device not found)`);
            }
        });
    }

    getDevice(deviceID) {
        return this.shepherd.list().find((d) => d.ieeeAddr === deviceID);
    }

    publish(deviceID, cid, cmd, zclData, ep, type, callback) {
        // Find device in zigbee-shepherd
        let device = this.getDevice(deviceID);
        if (!device || !device.epList || !device.epList.length) {
            this.error(`Zigbee cannot determine endpoint for '${deviceID}'`);
            return;
        }

        ep = ep ? ep : device.epList[0];
        device = this.shepherd.find(deviceID, ep);

        if (!device) {
            this.error(
                `Zigbee cannot publish message to device because '${deviceID}' is not known by zigbee-shepherd`
            );
            return;
        }

        this.debug(`Zigbee publish to '${deviceID}', ${cid} - cmd ${cmd} - payload ${JSON.stringify(zclData)} - endpoint ${ep}`);
        
        const callbackRef = callback;
        // Add job to queue
        this.queue.push((queueCallback) => {
            const callback_ = (error, resp) => {
                if (error) {
                    this.error(
                        `Zigbee publish to '${deviceID}', ${cid} - ${cmd} - ${JSON.stringify(zclData)} - ${ep} ` +
                        `failed with error ${error}`);
                }
                if (callbackRef) callbackRef(error, resp);
            };
            if (type === 'functional') {
                device.functional(cid, cmd, zclData, callback_);
            } else if (type === 'foundation') {
                device.foundation(cid, cmd, zclData, callback_);
            } else {
                this.error(`Unknown zigbee publish type ${type}`);
            }
//            if (callback) callback();
            queueCallback();
        });
    }
    
    publishDisableQueue(deviceID, cid, cmd, zclData, ep, type, callback) {
        // Find device in zigbee-shepherd
        let device = this.getDevice(deviceID);
        if (!device || !device.epList || !device.epList.length) {
            this.error(`Zigbee cannot determine endpoint for '${deviceID}'`);
            return;
        }

        ep = ep ? ep : device.epList[0];
        device = this.shepherd.find(deviceID, ep);

        if (!device) {
            this.error(
                `Zigbee cannot publish message to device because '${deviceID}' is not known by zigbee-shepherd`
            );
            return;
        }

        this.debug(`Zigbee publish to '${deviceID}', ${cid} - cmd ${cmd} - payload ${JSON.stringify(zclData)} - endpoint ${ep}`);

        const callback_ = (error) => {
            if (error) {
                this.error(
                    `Zigbee publish to '${deviceID}', ${cid} - ${cmd} - ${JSON.stringify(zclData)} - ${ep} ` +
                    `failed with error ${error}`);
            }
            if (callback) callback(error);
        };
        if (type === 'functional') {
            device.functional(cid, cmd, zclData, callback_);
        } else if (type === 'foundation') {
            device.foundation(cid, cmd, [zclData], callback_);
        } else {
            this.error(`Unknown zigbee publish type ${type}`);
        }
    }

    disableLed() {
        this.shepherd.controller.request('UTIL', 'ledControl', {ledid: 3, mode: 0});
    }

    read(deviceID, cid, attr, ep, callback) {
        // Find device in zigbee-shepherd
        let device = this.getDevice(deviceID);
        if (!device || !device.epList || !device.epList.length) {
            this.error(`Zigbee cannot determine endpoint for '${deviceID}'`);
            return;
        }
        ep = ep ? ep : device.epList[0];
        device = this.shepherd.find(deviceID, ep);
        if (!device) {
            this.error(`Zigbee cannot read attribute from device because '${deviceID}' not known by zigbee-shepherd`);
            return;
        }

        device.read(cid, attr, callback);
    }    
}

module.exports = ZigbeeController;
