'use strict';

class Exclude {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
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

    warn(msg) {
        this.adapter.log.warn(msg);
    }


    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'addExclude':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.addExclude(obj.from, obj.command, obj.message, err =>
                            this.adapter.sendTo(obj.from, obj.command, err, obj.callback));
                    }
                    break;

                case 'getExclude':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.getExclude(exclude =>
                            this.adapter.sendTo(obj.from, obj.command, exclude, obj.callback));
                    }
                    break;
                case 'delExclude':
                    if (obj && obj.message) {
                        this.delExclude(obj.from, obj.command, obj.message, err =>
                            this.adapter.sendTo(obj.from, obj.command, err, obj.callback));
                    }
                    break;
            }
        }
    }

    getExcludeId(exclude_target) {
        return `${this.extractDeviceId(exclude_target)}`;
    }

    extractDeviceId(stateId) {
        if (stateId) {
            return stateId.replace(`${this.adapter.namespace}.`, '');
        }
        return '';
    }

    extractExcludeId(stateId) {
        return stateId.replace(`${this.adapter.namespace}.exclude.`, '');
    }

    getExcludeName(devName, stateId) {
        return devName.replace(` ${stateId}`, '');
    }

    async addExclude(from, command, params, callback) {
        try {
            this.debug('addExclude message: ' + JSON.stringify(params));
            const exclude_mod = params.exclude_model.common.type;
            const stateId = `exclude.${exclude_mod}`;

            this.adapter.setObjectNotExists(stateId,
                {
                    type: 'state',
                    common: {name: exclude_mod},
                },
                () => this.adapter.setState(stateId, exclude_mod, true, () =>
                    callback()),
            );
        } catch (error) {
            this.error(`Failed to addExclude ${error.stack}`);
            throw new Error(`Failed to addExclude ${error.stack}`);
        }
    }

    async delExclude(from, command, exclude_id, callback) {
        try {
            this.debug(`delExclude message: ${JSON.stringify(exclude_id)}`);
            const stateId = `exclude.${exclude_id}`;
            this.adapter.getStateAsync(stateId)
                .then(async (stateV) => {
                    this.debug(`found state: ${JSON.stringify(stateV)}`);
                    this.adapter.deleteState(null, 'exclude', exclude_id, async () =>
                        callback());
                });
        } catch (error) {
            this.error(`Failed to delExclude ${error.stack}`);
            throw new Error(`Failed to delExclude ${error.stack}`);
        }
    }

/*
    async moveExcludeStorage()
    {
        try {
            const states = await this.adapter.getStatesOf('exclude')
            for (const state of states) {
                this.adapter.setObjectNotExists( "info.exclude.".concat(state.id),
                {
                    type: 'state',
                    common: {name: exclude_mod},
                },
                () => this.adapter.setState(stateId, exclude_mod, true, () =>
                    callback()),
            );

            }

        }
        catch (error) {
            this.error(`Failed to getExclude ${error.stack}`)

        }
    }
*/
    getExclude(callback) {
        try {


            const exclude = [];
            this.adapter.getStatesOf('exclude', (err, states) => {
                if (!err && states) {
                    const exc = [];
                    states.forEach(state => {
                        if (state._id.startsWith(`${this.adapter.namespace}.exclude`)) {
                            exc.push(new Promise(resolve =>
                                this.adapter.getStateAsync(state._id)
                                    .then(stateVa => {
                                        if (stateVa !== null) {
                                            const val = {
                                                id: this.extractExcludeId(state._id),
                                                name: stateVa.val
                                            };
                                            if (this.extractExcludeId(state._id) !== 'all') {
                                                exclude.push(val);
                                            }
                                        }
                                        resolve();
                                    })));
                        }
                    });
                    return Promise.all(exc)
                        .then(() => {
                            const arrExclude = JSON.stringify(exclude);
                            this.debug(`getExclude result: ${arrExclude}`);
                            this.adapter.setState('exclude.all', arrExclude, true, () =>
                                callback(exclude));
                        });
                } else {
                    this.debug(`getExclude result: ${JSON.stringify(exclude)}`);
                    callback(exclude);
                }
            });
        } catch (error) {
            this.error(`Failed to getExclude ${error.stack}`);
        }
    }
}

module.exports = Exclude;
