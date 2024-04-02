'use strict';

const safeJsonStringify = require('./json');

// 5 - genScenes, 6 - genOnOff, 8 - genLevelCtrl, 768 - lightingColorCtrl
const allowClusters = [5, 6, 8, 768];
const allowClustersName = {5: 'genScenes', 6: 'genOnOff', 8: 'genLevelCtrl', 768: 'lightingColorCtrl'};


class Binding {
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
        if (obj) {
            if (typeof obj === 'object' && obj.command) {
                switch (obj.command) {
                    case 'addBinding':
                        if (obj.message && typeof obj.message === 'object') {
                            this.addBinding(obj.from, obj.command, obj.message, err =>
                                this.adapter.sendTo(obj.from, obj.command, err, obj.callback));
                        }
                        break;
                    case 'editBinding':
                        if (obj.message && typeof obj.message === 'object') {
                            this.editBinding(obj.from, obj.command, obj.message, err =>
                                this.adapter.sendTo(obj.from, obj.command, err, obj.callback));
                        }
                        break;
                    case 'getBinding':
                        if (obj.message && typeof obj.message === 'object') {
                            this.getBinding(binding =>
                                this.adapter.sendTo(obj.from, obj.command, binding, obj.callback));
                        }
                        break;
                    case 'delBinding':
                        if (obj.message) {
                            this.delBinding(obj.from, obj.command, obj.message, err =>
                                this.adapter.sendTo(obj.from, obj.command, err, obj.callback));
                        }
                        break;
                }
            }
        }
    }

    extractBindId(stateId) {
        return stateId.replace(`${this.adapter.namespace}.info.`, '');
    }

    getBindingId(bind_source, bind_source_ep, bind_target, bind_target_ep) {
        return `bind_${this.extractDeviceId(bind_source)}_${bind_source_ep}_${this.extractDeviceId(bind_target)}_${bind_target_ep}`;
    }

    extractDeviceId(stateId) {
        if (stateId) {
            return stateId.replace(`${this.adapter.namespace}.`, '');
        }
        return '';
    }

    getBindEp(ep) {
        if (ep) {
            return parseInt(ep.split('_')[0]);
        }

        this.warn(`getBindEp called with illegal ep: ${safeJsonStringify(ep)}`);
        return 0;
    }

    getBindCl(ep) {
        return ep.indexOf('_') > 0 ? ep.split('_')[1] : null;
    }

    async doBindUnbind(type, bind_source, bind_source_ep, bind_target, bind_target_ep, callback) {
        try {
            const id = this.getBindingId(bind_source, bind_source_ep, bind_target, bind_target_ep);
            const source = await this.zbController.resolveEntity(`0x${this.extractDeviceId(bind_source)}`, this.getBindEp(bind_source_ep));
            this.debug(`source: ${safeJsonStringify(source)}`);
            let target = await this.zbController.resolveEntity(`0x${this.extractDeviceId(bind_target)}`, this.getBindEp(bind_target_ep));
            this.debug(`target: ${safeJsonStringify(target)}`);
            if (!target) {
                if (bind_target === 'coordinator') {
                    target = await this.zbController.resolveEntity(bind_target);
                    this.debug(`Coordinator target: ${safeJsonStringify(target)}`);
                } else {
                    target = await this.zbController.resolveEntity(parseInt(bind_target));
                    this.debug(`Group target: ${safeJsonStringify(target)}`);
                }
            }

            if (!source || !target) {
                this.error('Devices not found');
                return callback && callback('Devices not found');
            }
            const sourceName = source.name;
            const targetName = target.name;
            let found = false;
            const bindCluster = this.getBindCl(bind_source_ep);
            const clusters = bindCluster ? [bindCluster] : allowClusters;
            // Find which clusters are supported by both the source and target.
            // Groups are assumed to support all clusters.
            for (const clID of clusters) {
                const cluster = allowClustersName[clID];
                const targetValid = target.type === 'group' ||
                    target.device.type === 'Coordinator' || target.endpoint.supportsInputCluster(cluster);

                if (source.endpoint.supportsOutputCluster(cluster) && targetValid) {
                    found = true;
                }
            }
            if (!found) {
                this.debug(`No bind clusters`);
                return callback && callback(`No bind clusters`);
            } else {
                let ok = true;
                for (const clID of clusters) {
                    const cluster = allowClustersName[clID];
                    const targetValid = target.type === 'group' ||
                        target.device.type === 'Coordinator' || target.endpoint.supportsInputCluster(cluster);

                    if (source.endpoint.supportsOutputCluster(cluster) && targetValid) {
                        this.debug(`${type}ing cluster '${cluster}' from '${sourceName}' to '${targetName}'`);
                        try {
                            const bindTarget = target.type === 'group' ? target.group : target.endpoint;
                            if (type === 'bind') {
                                await source.endpoint.bind(cluster, bindTarget);
                            } else {
                                await source.endpoint.unbind(cluster, bindTarget);
                            }
                            this.info(
                                `Successfully ${type === 'bind' ? 'bound' : 'unbound'} cluster '${cluster}' from ` +
                                `'${sourceName}' to '${targetName}'`,
                            );
                        } catch (error) {
                            this.error(
                                `Failed to ${type} cluster '${cluster}' from '${sourceName}' to ` +
                                `'${targetName}' (${error})`,
                            );
                            callback && callback(`Failed to ${type} cluster '${cluster}' from '${sourceName}' to '${targetName}' (${error})`);
                            ok = false;
                            break;
                        }
                    }
                }
                ok && callback && callback(undefined, id);
            }
        } catch (error) {
            this.error(`Failed to doBindUnbind ${error.stack}`);
            callback && callback(`Failed to doBindUnbind ${error.stack}`);
        }
    }

    async addBinding(from, command, params, callback) {
        try {
            this.debug(`addBinding message: ${JSON.stringify(params)}`);
            const bind_source = params.bind_source,
                bind_source_ep = params.bind_source_ep,
                bind_target = params.bind_target,
                bind_target_ep = params.bind_target_ep;

            if (params.unbind_from_coordinator) {
                await this.doBindUnbind('unbind', bind_source, bind_source_ep, 'coordinator', '1');
            }

            await this.doBindUnbind('bind', bind_source, bind_source_ep, bind_target, bind_target_ep, (err, id) => {
                if (err) {
                    callback({error: err});
                } else {
                    const stateId = `info.${id}`;
                    // now set state
                    this.adapter.setObjectNotExists(stateId, {
                        type: 'state',
                        common: {name: id},
                    }, () => {
                        this.adapter.setState(stateId, JSON.stringify(params), true, () =>
                            callback());
                    });
                }
            });
        } catch (error) {
            this.error(`Failed to addBinding ${error.stack}`);
            throw new Error(`Failed to addBinding ${error.stack}`);
        }
    }

    async editBinding(from, command, params, callback) {
        try {
            this.debug(`editBinding message: ${JSON.stringify(params)}`);
            const old_id = params.id,
                bind_source = params.bind_source,
                bind_source_ep = params.bind_source_ep,
                bind_target = params.bind_target,
                bind_target_ep = params.bind_target_ep,
                id = this.getBindingId(bind_source, bind_source_ep, bind_target, bind_target_ep);
            if (old_id !== id) {
                await this.delBinding(from, command, old_id, async err => {
                    if (err) {
                        callback(err);
                    } else {
                        await this.addBinding(from, command, params, callback);
                    }
                });
            } else {
                const type = params.unbind_from_coordinator ? 'unbind' : 'bind';
                try {
                    await this.doBindUnbind(type, bind_source, bind_source_ep, 'coordinator', '1');
                    this.debug('Successfully ' + (type === 'bind' ? 'bound' : 'unbound') + ' Coordinator from ' + bind_source);
                } catch (e) {
                    this.error(`Could not ${type} Coordinator from ${bind_source}: ${JSON.stringify(e)}`);
                }
            }
        } catch (error) {
            this.error(`Failed to editBinding ${error.stack}`);
        }
    }

    async delBinding(from, command, bind_id, callback) {
        try {
            this.debug(`delBinding message: ${JSON.stringify(bind_id)}`);
            const stateId = `info.${bind_id}`;
            this.adapter.getStateAsync(stateId)
                .then(async stateV => {
                    this.debug(`found state: ${JSON.stringify(stateV)}`);
                    const params = JSON.parse(stateV.val);
                    const bind_source = params.bind_source,
                        bind_source_ep = params.bind_source_ep,
                        bind_target = params.bind_target,
                        bind_target_ep = params.bind_target_ep;
                    await this.doBindUnbind('unbind', bind_source, bind_source_ep, bind_target, bind_target_ep, async err => {
                        if (err) {
                            callback({error: err});
                        } else {
                            this.adapter.deleteState(null, 'info', bind_id, async () => {
                                // if (err) {
                                //     callback({error: err});
                                // } else {
                                if (params.unbind_from_coordinator) {
                                    await this.doBindUnbind('bind', bind_source, bind_source_ep, 'coordinator', '1', callback);
                                } else {
                                    callback();
                                }
                                //}
                            });
                        }
                    });
                });
        } catch (error) {
            this.error(`Failed to delBinding ${error.stack}`);
            throw new Error(`Failed to delBinding ${error.stack}`);
        }
    }

    getBinding(callback) {
        try {
            const binding = [];
            this.adapter.getStatesOf('info', (err, states) => {
                if (!err && states) {
                    const chain = [];
                    states.forEach(state => {
                        if (state._id.startsWith(`${this.adapter.namespace}.info.bind_`)) {
                            chain.push(new Promise(resolve => {
                                return this.adapter.getStateAsync(state._id)
                                    .then(stateV => {
                                        if (stateV !== null) {
                                            const val = JSON.parse(stateV.val);
                                            val.id = this.extractBindId(state._id);
                                            binding.push(val);
                                        }
                                        resolve();
                                    });
                            }));
                        }
                    });
                    return Promise.all(chain).then(() => {
                        this.debug(`getBinding result: ${JSON.stringify(binding)}`);
                        callback(binding);
                    });
                } else {
                    this.debug(`getBinding result: ${JSON.stringify(binding)}`);
                    callback(binding);
                }
            });
        } catch (error) {
            this.error(`Failed to getBinding ${error.stack}`);
        }
    }
}

module.exports = Binding;
