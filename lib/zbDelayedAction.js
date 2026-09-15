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

        return device.interviewState !== 'IN_PROGRESS';
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
            if (data && data.device) {
                const device = data.device;
                this.doActions(device);
            }
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
            this.debug(`Succesfully delay action for '${this.devLabel(device.ieeeAddr)}'`);
            this.doActions(device);
        } catch (error) {
            this.sendError(error);
            this.error(
                `Failed to DelayedAction.delayAction '${this.devLabel(device.ieeeAddr)}' (${error.stack})`,
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
                this.debug(`No found device '${this.devLabel(device.ieeeAddr)}', for doAction`);
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
                this.debug(`Do action on '${this.devLabel(device.ieeeAddr)}'`);
                try {
                    // do action
                    await actionDef.action(device);
                    this.info(`Do action successfully '${this.devLabel(device.ieeeAddr)}'`);
                    toDelete.push(actionDef);
                } catch (error) {
                    this.sendError(error);
                    this.error(
                        `Failed to do action '${this.devLabel(device.ieeeAddr)}', ` +
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
                `Failed to DelayedAction.doAction '${this.devLabel(device.ieeeAddr)}' (${error.stack})`,
            );
        }
    }
}

module.exports = DelayedAction;
