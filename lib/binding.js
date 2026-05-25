'use strict';

const safeJsonStringify = require('./json');

// 5 - genScenes, 6 - genOnOff, 8 - genLevelCtrl, 768 - lightingColorCtrl
const allowClusters = [5, 6, 8, 768];
const allowClustersName = {5: 'genScenes', 6: 'genOnOff', 8: 'genLevelCtrl', 768: 'lightingColorCtrl'};

/**
 *
 */
class Binding {
    /**
     *
     * @param adapter
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
        this.bindingInfo = {};
    }

    /**
     *
     * @param zbController
     * @param stController
     */
    async start(zbController, stController) {
        this.zbController = zbController;
        this.stController = stController;
        this.updateBindingInfo();
        //this.MigrateBindingsFromObjects(this.bindingInfo);
    }

    /**
     *
     */
    stop() {
        delete this.zbController;
        delete this.stController;
    }

    /**
     *
     * @param msg
     */
    info(msg) {
        this.adapter.log.info(msg);
    }

    /**
     *
     * @param msg
     */
    error(msg) {
        this.adapter.log.error(msg);
    }

    /**
     *
     * @param msg
     */
    debug(msg) {
        this.adapter.log.debug(msg);
    }

    /**
     *
     * @param msg
     */
    warn(msg) {
        this.adapter.log.warn(msg);
    }

    /**
     * @param {ioBroker.Message} obj
     */
    async onMessage(obj) {
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
                    case 'delHerdsmanBinding':
                        if (obj.message) {
                            this.delBinding(obj.from, obj.command, obj.message, err =>
                                this.adapter.sendTo(obj.from, obj.command, err, obj.callback));
                        }
                        break;
                    case 'getHerdsmanBindings':
                        if (obj.message) {
                            await this.updateBindingInfo();
                            this.adapter.sendTo(obj.from, obj.command, this.bindingInfo, obj.callback);
                        }
                        break;
                }
            }
        }
    }

    /**
     *
     */
    async updateBindingInfo() {
        this.bindingInfo = await this.zbController.getBindings();
        this.stController.updateBindingInfo(this.bindingInfo);
    }

    /**
     *
     * @param stateId
     */
    extractBindId(stateId) {
        return stateId.replace(`${this.adapter.namespace}.info.`, '');
    }

    /**
     *
     * @param bind_source
     * @param bind_source_ep
     * @param bind_target
     * @param bind_target_ep
     */
    getBindingId(bind_source, bind_source_ep, bind_target, bind_target_ep) {
        return `bind_${this.extractDeviceId(bind_source)}_${bind_source_ep}_${this.extractDeviceId(bind_target)}_${bind_target_ep}`;
    }

    /**
     *
     * @param stateId
     */
    extractDeviceId(stateId) {
        if (stateId) {
            return stateId.replace(`${this.adapter.namespace}.`, '');
        }
        return '';
    }

    /**
     *
     * @param ep
     */
    getBindEp(ep) {
        if (ep) {
            return parseInt(ep.split('_')[0]);
        }

        this.warn(`getBindEp called with illegal ep: ${safeJsonStringify(ep)}`);
        return 0;
    }

    /**
     *
     * @param ep
     */
    getBindCl(ep) {
        return ep.indexOf('_') > 0 ? ep.split('_')[1] : null;
    }

    /* ae: future rewrite, if unbinding needs to be limited to bound things
    async bind(source, target, clusters) {
        const errors = [];
        for (const clID of clusters) {
            const cluster = Number(clID)
            const targetValid =
                (!isNaN(cluster)) &&
                (target.type === 'group' ||
                (target.device.type === 'Coordinator' && source.endpoint.supportsInputCluster(cluster)) ||
                (target.endpoint.supportsInputCluster(cluster) && source.endpoint.supportsOutputCluster(cluster)));

            if (targetValid) {
                const msgpart = `cluster '${cluster}' from '${source.name}' to '${target.name}'`
                this.warn(`binding ${msgpart}`);
                try {
                    await source.bind(cluster, target);
                    this.info(
                        `Successfully bound ${msgpart}'`
                    );
                } catch (error) {
                    this.error(
                        `Failed to bind ${msgpart}' (${error})`,
                    );
                    errors.push(`Failed to bind ${msgpart}' (${error})`)
                }
            }
        }
        return errors;
    }

    async unbind(source, target, clusters) {
        const errors = [];
        const knownBinding = this.bindingInfo[`${source.address}.${source.ID}`]
        for (const clID of clusters) {
            const cluster = Number(clID)
            const targetValid = (!isNaN(cluster)) && knownBinding.clusters.includes(cluster);
            //(target.type === 'group' ||
            //(target.device.type === 'Coordinator' && source.endpoint.supportsInputCluster(cluster)) ||
            //(target.endpoint.supportsInputCluster(cluster) && source.endpoint.supportsOutputCluster(cluster)));

            if (targetValid) {
                const msgpart = `cluster '${cluster}' from '${source.name}' to '${target.name}'`
                this.warn(`binding ${msgpart}`);
                try {
                    await source.bind(cluster, target);
                    this.info(
                        `Successfully bound ${msgpart}'`
                    );
                } catch (error) {
                    this.error(
                        `Failed to bind ${msgpart}' (${error})`,
                    );
                    errors.push(`Failed to bind ${msgpart}' (${error})`)
                }
            }
        }
        return errors;
    }
    */


    /**
     *
     * @param type
     * @param s_address
     * @param s_ep
     * @param s_clusters
     * @param b_address
     * @param b_ep
     * @param allowAllClusters
     * @param callback
     */
    async doBindUnbind(type, s_address, s_ep, s_clusters, b_address, b_ep, allowAllClusters, callback) {
        try {
            const source = await this.zbController.resolveEntity(s_address, s_ep);
            this.debug(`source: ${safeJsonStringify(source)}`);
            let target = await this.zbController.resolveEntity(b_address, b_ep);
            this.debug(`target: ${safeJsonStringify(target)}`);
            if (!target) {
                if (b_address === 'coordinator') {
                    target = await this.zbController.resolveEntity(b_address);
                    this.debug(`Coordinator target: ${safeJsonStringify(target)}`);
                } else {
                    target = await this.zbController.resolveEntity(parseInt(b_address));
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
            const clusters = [];
            if (allowAllClusters) {
                clusters.push(...s_clusters);
            } else {
                if (s_clusters.includes('all')) {
                    clusters.push(...allowClusters);
                } else {
                    clusters.push(...s_clusters)
                }
            }

            // Find which clusters are supported by both the source and target.
            // Groups are assumed to support all clusters.
            for (const clID of clusters) {
                const cluster = Number(clID);
                if (isNaN(cluster)) {
                    continue;
                }
                const targetValid = target.type === 'group' ||
                    target.device.type === 'Coordinator' || target.endpoint.supportsInputCluster(cluster);

                if (source.endpoint.supportsOutputCluster(cluster) && targetValid) {
                    found = true;
                }
            }
            if (!found && type != 'unbind') {
                this.debug(`No bind clusters`);
                return callback && callback(`No bind clusters`);
            }
            let ok = true;
            for (const clID of clusters) {
                const cluster = Number(clID)
                const targetValid =
                    (!isNaN(cluster)) &&
                    (target.type === 'group' ||
                        (target.device.type === 'Coordinator' && source.endpoint.supportsInputCluster(cluster)) ||
                        (target.endpoint.supportsInputCluster(cluster) && source.endpoint.supportsOutputCluster(cluster)));

                if (targetValid) {
                    this.debug(`${type}ing cluster '${cluster}' from '${sourceName}' to '${targetName}'`);
                    try {
                        const bindTarget = target.type === 'group' ? target.device : target.endpoint;
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
            await this.updateBindingInfo();
            ok && callback && callback(undefined);

        } catch (error) {
            this.error(`Failed to doBindUnbind ${error.stack}`);
            callback && callback(`Failed to doBindUnbind ${error.stack}`);
        }
    }

    /**
     *
     * @param from
     * @param command
     * @param params
     * @param callback
     */
    async addBinding(from, command, params, callback) {
        try {
            if (params.unbind_from_coordinator) {
                await this.doBindUnbind('unbind', params.source, ['all'], params.source_ep, 'coordinator', '1', false);
            }

            await this.doBindUnbind('bind', params.s_address, params.s_ep, params.clusters.length > 0 ? params.clusters : ['all'], params.b_address, params.b_ep, params.allowAllClusters,
                (err) => {
                    if (callback) {
                        callback(err ? {error: err} : {});
                    }
                    //this.stController.addReadTrigger(params);
                });
        } catch (error) {
            this.error(`Failed to add Binding ${error.stack}`);
            throw new Error(`Failed to add Binding ${error.stack}`);
        }
    }

    /**
     *
     * @param from
     * @param command
     * @param params
     * @param callback
     */
    async delBinding(from, command, params, callback) {
        try {
            this.debug(`delBinding message: ${JSON.stringify(params)}`);
            await this.doBindUnbind('unbind', params.s_address, params.s_ep, ['all'], params.b_address, params.b_ep, params.allowAllClusters,
                (err) => {
                    if (callback) {
                        callback(err ? {error: err} : {})
                    }
                    //this.stController.removeReadTrigger(params);
                });
        } catch (error) {
            this.error(`Failed to delete Binding ${error.stack}`);
            throw new Error(`Failed to delete Binding ${error.stack}`);
        }
    }

}

module.exports = Binding;
