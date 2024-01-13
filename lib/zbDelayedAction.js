'use strict';

const BaseExtension = require('./zbBaseExtension');

class DelayedAction extends BaseExtension {
    constructor(zigbee, options) {
        super(zigbee, options);

        this.actions = {};
        this.zigbee.delayAction = this.delayAction.bind(this);
        this.name = 'DelayedAction';
    }

    setOptions(options) {
        return typeof options === 'object';
    }


    shouldAction(device) {
        if (!device) {
            return false;
        }

        // if (device.meta.hasOwnProperty('configured') && device.meta.configured === mappedDevice.meta.configureKey) {
        //     return false;
        // }

        // if (!mappedDevice || !mappedDevice.configure) {
        //     return false;
        // }

        return device.interviewing !== true;
    }

    async onZigbeeStarted() {
        try {
            this.coordinatorEndpoint = await this.zigbee.getDevicesByType('Coordinator')[0].endpoints[0];
        } catch (error) {
            this.sendError(error);
            this.error(
                `Failed to DelayedAction.onZigbeeStarted (${error.stack})`,
            );
        }
    }

    onZigbeeEvent(data) {
        try {
            const device = data.device;
            // if (this.shouldAction(device, mappedDevice)) {
            this.doActions(device);
            // }
        } catch (error) {
            this.sendError(error);
            this.error(
                `Failed to DelayedAction.onZigbeeEvent (${error.stack})`,
            );
        }
    }

    delayAction(device, action) {
        try {
            if (!this.actions.hasOwnProperty(device.ieeeAddr)) {
                this.actions[device.ieeeAddr] = [];
            }
            this.actions[device.ieeeAddr].push({
                attempts: 0,
                action: action,
            });
            this.debug(`Succesfully delay action for ${device.ieeeAddr} ${device.modelID}`);
            this.doActions(device);
        } catch (error) {
            this.sendError(error);
            this.error(
                `Failed to DelayedAction.delayAction ${device.ieeeAddr} ${device.modelID} (${error.stack})`,
            );
        }
    }

    async doActions(device) {
        try {
            if (!this.actions.hasOwnProperty(device.ieeeAddr)) {
                return;
            }
            const foundDev = await this.zigbee.getDevice(device.ieeeAddr);
            if (!foundDev) {
                this.debug(`No found device ${device.ieeeAddr} ${device.modelID}, for doAction`);
                delete this.actions[device.ieeeAddr];
                return;
            }

            const deviceActions = this.actions[device.ieeeAddr];
            const toDelete = [];
            for (const actionDef of deviceActions) {
                if (actionDef.inAction) {
                    continue;
                }
                if (actionDef.attempts >= 3) {
                    toDelete.push(actionDef);
                    continue;
                }
                actionDef.inAction = true;
                this.info(`Do action on ${device.ieeeAddr} ${device.modelID}`);
                try {
                    // do action
                    await actionDef.action(device);
                    this.info(`Do action successfully ${device.ieeeAddr} ${device.modelID}`);
                    toDelete.push(actionDef);
                } catch (error) {
                    this.sendError(error);
                    this.error(
                        `Failed to do action ${device.ieeeAddr} ${device.modelID}, ` +
                        `attempt ${actionDef.attempts + 1} (${error.stack})`,
                    );
                    actionDef.attempts++;
                } finally {
                    actionDef.inAction = false;
                }
            }
            for (const actionDef of toDelete) {
                const ind = this.actions[device.ieeeAddr].indexOf(actionDef);
                this.actions[device.ieeeAddr].splice(ind, 1);
            }
            if (this.actions[device.ieeeAddr].length === 0) {
                delete this.actions[device.ieeeAddr];
            }
        } catch (error) {
            this.sendError(error);
            this.error(
                `Failed to DelayedAction.doAction ${device.ieeeAddr} ${device.modelID} (${error.stack})`,
            );
        }
    }
}

module.exports = DelayedAction;
