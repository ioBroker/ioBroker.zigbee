'use strict';

const getZbId = require('./utils').getZbId;
const safeJsonStringify = require('./json');
const statesMapping = require('./devstates');

const clusters = ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl'];


class Binding {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on("message", this.onMessage.bind(this));
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

    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === "object" && obj.command) {
            switch (obj.command) {
                case 'addBinding':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.addBinding(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'editBinding':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.editBinding(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
                case 'getBinding':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.getBinding((binding)=>{
                            this.adapter.sendTo(obj.from, obj.command, binding, obj.callback);
                        });
                    }
                    break;
                case 'delBinding':
                    if (obj && obj.message && typeof obj.message === 'object') {
                        this.delBinding(obj.from, obj.command, obj.message, obj.callback);
                    }
                    break;
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
        return stateId.replace(`${this.adapter.namespace}.`, '');
    }

    async doBindUnbind(type, bind_source, bind_source_ep, bind_target, bind_target_ep, callback) {
    	try {
            const id = this.getBindingId(bind_source, bind_source_ep, bind_target, bind_target_ep),
                  stateId = `info.${id}`;

            const source = await this.zbController.resolveEntity(`0x${this.extractDeviceId(bind_source)}`, parseInt(bind_source_ep));
            this.debug(`source: ${safeJsonStringify(source)}`);
            const target = await this.zbController.resolveEntity(`0x${this.extractDeviceId(bind_target)}`, parseInt(bind_target_ep));
            this.debug(`target: ${safeJsonStringify(target)}`);

            if (!source || !target) {
                this.error('Devices not found');
                if (callback) callback({error: 'Devices not found'});
                return;
            }
            const sourceName = source.name;
            const targetName = target.name;
            let found = false;
            // Find which clusters are supported by both the source and target.
            // Groups are assumed to support all clusters.
            for (const cluster of clusters) {
                const targetValid = target.type === 'group' ||
                    target.device.type === 'Coordinator' || target.endpoint.supportsInputCluster(cluster);

                if (source.endpoint.supportsOutputCluster(cluster) && targetValid) {
                    found = true;
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
                        if (callback) callback(undefined,id);
                    } catch (error) {
                        this.error(
                            `Failed to ${type} cluster '${cluster}' from '${sourceName}' to ` +
                            `'${targetName}' (${error})`,
                        );
                        if (callback) callback({error: `Failed to ${type} cluster '${cluster}' from '${sourceName}' to '${targetName}' (${error})`});
                    }
                }
            }
            if (!found) {
                this.debug(`No bind clusters`);
                if (callback) callback({error: `No bind clusters`});
            }
        } catch (error) {
            this.error(`Failed to doBindUnbind ${error.stack}`);
        }
    }

    async addBinding(from, command, params, callback) {
        try {
            this.debug('addBinding message: ' + JSON.stringify(params));
            const bind_source = params.bind_source,
                  bind_source_ep = params.bind_source_ep,
                  bind_target = params.bind_target,
                  bind_target_ep = params.bind_target_ep;
            this.doBindUnbind('unbind', bind_source, bind_source_ep, bind_target, bind_target_ep, (err, id) => {
            	this.doBindUnbind('bind', bind_source, bind_source_ep, bind_target, bind_target_ep, (err, id) => {
            		if (err) {
            			this.adapter.sendTo(from, command, err, callback);
	            	} else {
	            		const stateId = `info.${id}`;
	            		// now set state
	                    this.adapter.setObjectNotExists(stateId, {
	                        type: 'state',
	                        common: {name: id},
	                    }, () => {
	                        this.adapter.setState(stateId, JSON.stringify(params), true, () => {
	                            this.adapter.sendTo(from, command, {}, callback);
	                        });
	                    });
	            	}
	            });
            });
        } catch (error) {
            this.error(`Failed to addBinding ${error.stack}`);
        }
    }

    editBinding(from, command, params, callback) {
        try {
            this.debug('editBinding message: ' + JSON.stringify(params));
            const old_id = params.id,
                  bind_source = params.bind_source,
                  bind_source_ep = params.bind_source_ep,
                  bind_target = params.bind_target,
                  bind_target_ep = params.bind_target_ep,
                  id = this.getBindingId(bind_source, bind_source_ep, bind_target, bind_target_ep);
            if (old_id !== id) {
                this.adapter.deleteState(null, 'info', old_id, (err) => {
                    if (err) {
                        this.adapter.sendTo(from, command, {error: err}, callback);
                    } else {
                        this.addBinding(from, command, params, callback);
                    }
                });
            }
        } catch (error) {
            this.error(`Failed to editBinding ${error.stack}`);
        }
    }

    delBinding(from, command, bind_id, callback) {
        try {
            this.debug('delBinding message: ' + JSON.stringify(bind_id));
            // const source = zbControl.getEndpoint(`0x${extractDeviceId(bind_source)}`, parseInt(bind_source_ep)),
            //       target = zbControl.getEndpoint(`0x${extractDeviceId(bind_target)}`, parseInt(bind_target_ep));

            // if (!source || !target) {
            //     adapter.log.error('Devices not found');
            //     adapter.sendTo(from, command, {error: 'Devices not found'}, callback);
            //     return;
            // }
            // // Find which clusters are supported by both the source and target.
            // // Groups are assumed to support all clusters (as we don't know which devices are in)
            // const supported = target.getSimpleDesc().inClusterList.filter((cluster) => {
            //     return allowedClusters.includes(cluster);
            // });
            // const clusters = source.getSimpleDesc().outClusterList.filter((cluster) => {
            //     return supported.includes(cluster);
            // });
            // if (!clusters || !clusters.length) {
            //     adapter.log.debug(`No bind clusters`);
            //     adapter.sendTo(from, command, {error: `No bind clusters`}, callback);
            // }
            // // Bind
            // clusters.forEach((cluster) => {
            //     adapter.log.debug(`Unbiding cluster '${cluster}' from ${bind_source}' to '${bind_target}'`);

            //     zbControl.unbind(source, cluster, target, (error) => {
            //         if (error) {
            //             adapter.log.error(
            //                 `Failed to bind cluster '${cluster}' from ${bind_source}' to ` +
            //                 `'${bind_target}' (${error})`
            //             );
            //             adapter.sendTo(from, command, {error: `Failed to bind cluster '${cluster}' from ${bind_source}' to ` +
            //             `'${bind_target}' (${error})`}, callback);
            //         } else {
            //             adapter.log.info(
            //                 `Successfully bind cluster '${cluster}' from ` +
            //                 `${bind_source}' to '${bind_target}'`
            //             );
            //             // now del state
            //             adapter.deleteState(null, 'info', bind_id, (err) => {
            //                 if (err) {
            //                     adapter.sendTo(from, command, {error: err}, callback);
            //                 } else {
            //                     adapter.sendTo(from, command, {}, callback);
            //                 }
            //             });
            //         }
            //     });
            // });
            this.adapter.deleteState(null, 'info', bind_id, (err) => {
                if (err) {
                    this.adapter.sendTo(from, command, {error: err}, callback);
                } else {
                    this.adapter.sendTo(from, command, {}, callback);
                }
            });
        } catch (error) {
            this.error(`Failed to delBinding ${error.stack}`);
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
                                        const val = JSON.parse(stateV.val);
                                        val.id = this.extractBindId(state._id);
                                        binding.push(val);
                                        resolve();
                                    });
                            }));
                        }
                    });
                    return Promise.all(chain).then(() => {
                        this.debug('getBinding result: ' + JSON.stringify(binding));
                        callback(binding);
                    });
                } else {
                    this.debug('getBinding result: ' + JSON.stringify(binding));
                    callback(binding);
                }
            });
        } catch (error) {
            this.error(`Failed to getBinding ${error.stack}`);
        }
    }
}

module.exports = Binding;
