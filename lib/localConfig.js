'use strict';

/*eslint no-unused-vars: ['off']*/
const fs = require('fs');
const path = require('path');
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
// const { src } = require('gulp');

const EventEmitter = require('events').EventEmitter;

class localConfig extends EventEmitter {
    constructor(adapter, options) {
        super();
        this.adapter = adapter;
        this.name = 'localConfig';
        this.localData = { by_id:{}, by_model:{} };
        this.filename = undefined;
        this.basefolder = undefined;
        this.retTimeoutHanlde = undefined;
        this.adapter.on('ready', () => this.onReady());
    }


    async onReady()
    {
    }

    async onUnload(callback)
    {
        this.retainData();
        // No callback here -
        //callback();
    }

    info(message) {
        this.adapter.log.info(message);
        this.emit('log', 'info',message);
    }

    error(message, errobj) {
        this.adapter.log.error(`${this.name}:${message}`);
        this.emit('log', 'error',`${this.name}:${message}`, errobj);
    }

    warn(message) {
        this.adapter.log.warn(`${this.name}:${message}`);
        this.emit('log', 'warn',`${this.name}:${message}`);
    }

    debug(message) {
        this.adapter.log.debug(`${this.name}:${message}`);
        this.emit('log', 'debug',`${this.name}:${message}`);
    }

    async updateDeviceName(id, name) {
        this.debug('updateDev with ' + id + ' and .'+ name +'.');
        if (typeof id != 'string') {
            this.error(`update called with illegal device entry:${JSON.stringify(id)}`)
            return true;
        }
        if (typeof name != 'string' || name.trim().length < 1)
        {
            if (this.localData.hasOwnProperty(id))
                delete this.localData.by_id[id].name;
        }
        else {
            if (this.localData.by_id.hasOwnProperty(id))
                this.localData.by_id[id].name = name;
            else
                this.localData.by_id[id] = { name: name };
        }
        return true;
    }

    async updateLocalOverride(_target, model, key, data, global)
    {
        const target = (global ? model : _target);
        this.info(`updating local data: (${global ? 'global':'local'}) : ${target}:${key}:${JSON.stringify(data)}`);

        if (typeof target != 'string' || typeof key != 'string') {
            this.error(`update called with illegal id data:${JSON.stringify(target)}:${JSON.stringify(key)}:${JSON.stringify(data)}`)
            return false;
        }
        const base = global ? this.localData.by_model[target] || {} : this.localData.by_id[target] || {};
        if (data && Object.keys(data).length > 0 && data != 'none') {
            if (key == 'icon')
                base[key] = data.replace(this.basefolder, '.');
            else
                base[key] = data;
        }
        else
        {
            if (base.hasOwnProperty(key)) {
                delete base[key]
            }
        }
        if (global) {
            if (base == {}) delete this.localData.by_model[target];
            else this.localData.by_model[target] = base;
        }
        else {
            if (base == {}) delete this.localData.by_id[target];
            else this.localData.by_id[target] = base;
        }
        this.info(`Local Data for ${target} is ${JSON.stringify(base)} after update`);
        return true;
    }

    async getLocalOverride(_target, model, key, global)
    {
        const target = (global ? model : _target);
        this.info(`getting local data: (${global ? 'global':'local'}) : ${target}:${key}`);

        if (typeof target != 'string' || typeof key != 'string') {
            this.error(`update called with illegal id data:${JSON.stringify(target)}:${JSON.stringify(key)}`)
            return false;
        }
        const base = global ? this.localData.by_model[target] || {} : this.localData.by_id[target] || {};
        const rv = {};
        if (base.hasOwnProperty(key)) rv[key] = base[key];
        return rv;
    }

    NameForId(id, model, defaultName) {
        this.debug('name for id with ' + id + ' and ' + defaultName + ' from ' + JSON.stringify(this.localData));
        const localstorage = (this.localData.by_id[id] || this.localData.by_model[model]);
        if (localstorage && localstorage.hasOwnProperty['name']) return localstorage.name;
        return defaultName;
    }

    IconForId(id, model, defaultIcon) {
        let modeloverride = {};
        this.debug('Icon for id with ' + id + ', ' + model + ' and ' + defaultIcon);
        if (this.localData.by_id.hasOwnProperty(id))
        {
            modeloverride = this.localData.by_id[id]
        }
        if (!modeloverride.icon) {
            if (this.localData.by_model.hasOwnProperty(model))
                modeloverride = this.localData.by_model[model];
        }
        const iconPath = modeloverride.icon;
        this.debug('icon Path is  '+ JSON.stringify(iconPath));
        if (typeof iconPath != 'string') {
            this.debug('icon path is no string, returning ' + JSON.stringify(defaultIcon));
            return defaultIcon;
        }
        if (iconPath.startsWith('http')) return iconPath;
        const namespace = `${this.adapter.name}.admin`;
        const rv = `img/${path.basename(iconPath)}`;
        try {
            this.adapter.fileExists(namespace, rv, (err, result) => {
                if (result) return;
                const src = this.adapter.expandFileName(iconPath);
                fs.readFile(src, (err, data) => {
                    if (err) {
                        this.error('unable to read ' + src + ' : '+ (err && err.message? err.message:' no message given'))
                        return;
                    }
                    if (data) {
                        this.adapter.writeFile(namespace, rv, data, (err) => {
                            if (err) {
                                this.error('error writing file ' + path + JSON.stringify(err))
                                return;
                            }
                            this.info('Updated image file ' + rv)
                        })
                    }
                })

            })
        } catch (error) {
            this.error(`Error accessing target image: ${error && error.message ? error.message : 'no error message'}`);
        }
        return rv;
    }


    async copyDeviceImage(src) {
        const dst = `${this.adapter.adapterDir}/admin/img/${path.basename(src)}`;
        const _src = this.adapter.expandFileName(src);
        if (fs.existsSync(src)  && !fs.existsSync(dst))
        {
            try {
                this.log.info(`copying image from :${src} to ${dst}`)
                fs.copyFileSync(src, dst)
            }
            catch {
                this.log.debug(`failed to copy from :${src} to ${dst}`)
            }
        }
    }

    getOverrideData(target, isGlobal) {
        const base = (isGlobal ? this.localData.by_model : this.localData.by_id);
        if (base.hasOwnProperty(target)) return base[target];
        return {};
    }

    setOverrideData(target, isGlobal, data) {
        const base = (isGlobal ? this.localData.by_model : this.localData.by_id);
        if (typeof target != 'string') {
            this.error('illegal target for override data: '+JSON.stringify(target));
            return;
        }
        base[target]=data;
    };

    async getLegacyModels() {
        const legacyModels = [];
        for (const model in this.localData.by_model) {
            if (this.localData.by_model[model].hasOwnProperty('legacy') && this.localData.by_model[model].legacy)
                legacyModels.push(model);
        }
        return legacyModels;
    }

    getOverridesWithKey(key, isGlobal) {
        const base = (isGlobal ? this.localData.by_model : this.localData.by_id);
        const rv = [];
        for(const prop in base) {
            if (base[prop].hasOwnProperty(key)) {
                rv.push({key:prop, value:base[prop][key]});
            }
        }
        return rv;
    }

    getOverrideWithTargetAndKey(target, key, isGlobal) {
        const targetdata = this.getOverrideData(target, isGlobal);
        if (targetdata && targetdata.hasOwnProperty(key)) return targetdata[key];
        return undefined;
    }

    async updateFromDeviceNames() {
        const fn = this.adapter.expandFileName('dev_names.json');
        this.info('Initializing localConfig from dev_names.json')
        fs.readFile(fn, (err, content) => {
            if (!err) {
                let data_js = {};
                try {
                    data_js = JSON.parse(content);
                }
                catch (error) {
                    this.error(`unable to parse data read from ${fn} : ${error.message ? error.message : 'undefined error'}`)
                    return;
                }
                try {
                    for (const prop in data_js) {
                        if (data_js[prop] != 'undefined') {
                            this.info(`updating device name for ${prop} as ${data_js[prop]}`);
                            this.updateDeviceName(prop, data_js[prop]);
                        }
                    }
                }
                catch (error) {
                    this.error(`error in updateFromDeviceNames : ${error.message ? error.message : 'undefined error'}`)
                    return;

                }
                this.retainData();
            }
        });
    }

    async init() {
        this.info('init localConfig');
        const fn = this.adapter.expandFileName('LocalOverrides').replace('zigbee.','zigbee_').concat('.json');
        this.filename = fn;
        this.basefolder = path.dirname(fn);

        try {
            const content = fs.readFileSync(fn);
            try {
                const data_js = JSON.parse(content);
                this.localData = data_js;
            }
            catch (error) {
                this.error(`unable to parse data read from ${fn} : ${error.message ? error.message : 'undefined error'}`);
            }
        } catch(error) {
            await this.updateFromDeviceNames();
        }
    }

    async retainData() {
        //this.warn('retaining local config: ' + JSON.stringify(this.localData));
        try {
            fs.writeFileSync(this.filename, JSON.stringify(this.localData, null, 2))
            this.info('Saved local configuration data');
        }
        catch (error) {
            this.error(`error saving local config: ${error.message}`);
        }
    }

    enumerateImages(_path) {
        const rv = [];
        try
        {
            const files= fs.readdirSync(_path, {withFileTypes: true, recursive: true}).filter(item => (!item.isDirectory() && item.name.endsWith('.png')));
            files.forEach((item) => {
                const fn = path.join(item.parentPath, item.name);
                rv.push({file: fn, name: item.name, data: fs.readFileSync(path.join(item.parentPath, item.name), 'base64'), isBase64:true});
            });
            //this.warn('enumerateImages for  ' + _path + ' is ' + JSON.stringify(rv));
        }
        catch (error) {
            this.error(`error in enumerateImages : ${error.message ? error.message : 'undefined error'}`)
        }
        return rv;
    }

    getOptions(dev_id) {
        const ld = this.localData.by_id[dev_id];
        if (ld === undefined || ld.options === undefined) return {};
        this.debug(`getOptions for ${dev_id} : ${JSON.stringify(ld.options)}`);
        return ld.options;
    }

}

module.exports = localConfig;
