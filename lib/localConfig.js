'use strict';

/*eslint no-unused-vars: ['off']*/
const fs = require('fs');
const path = require('path');
const utils = require('@iobroker/adapter-core'); // Get common adapter utils

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
        this.adapter.on('unload', callback => this.onUnload(callback));
    }


    async onReady()
    {
    }

    async onUnload(callback)
    {
        this.info('local config saved');
        this.retainData();
        callback();
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
    //
    // device specific data
    //
    /*
    {
        image: 'images/mypic.png', // relative to zigbee_x
        name: 'newDeviceName',
    }

    async updateDeviceSpecificData(id, data) {
        if (typeof id != 'string') {
            this.error(`update called with illegal device entry:${JSON.stringify(id)}`)
            return false;
        }
        if (data === undefined || data === null)  {
            if (this.localData.by_id.hasOwnProperty(id))
            {
                delete this.localData.by_id[device];
                this.retainData();
            }
            return true;
        }
        const currentobject = (this.localData.hasOwnProperty(device) ? this.localData.by_id[id] : {});
        for (const prop in data) {
            currentobject[prop] = data[prop];
        }
        this.localData.by_id[id] = currentobject;
        this.retainData();
        return true;
    }
    */

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
        //this.retainData();
        return true;
    }

    async updateDeviceImage(id, image, global) {
        if (typeof id != 'string' || typeof image != 'string') {
            this.error(`update called with illegal id or image entry:${JSON.stringify(id)}`)
            return false;
        }
        const base = global ? this.localData.by_model[id] || {} : this.localData.by_id[id] || {};


        if (image.length < 1 && base.hasOwnProperty('icon')) {
            delete base.icon;
        }
        base.icon = image.replace(this.basefolder, '.');

        if (global)
            this.localData.by_model[id] = base;
        else
            this.localData.by_id[id] = base;
        //this.retainData();
        return true;
    }

    async updateLocalOverride(_target, key, data, global)
    {
        const target = _target;
        this.warn(`updateLocalOverride (1) : ${target}:${key}:${data}`)

        if (typeof target != 'string' || typeof key != 'string') {
            this.error(`update called with illegal id data:${JSON.stringify(target)}:${JSON.stringify(key)}:${JSON.stringify(data)}`)
            return false;
        }
        const base = global ? this.localData.by_model[target] || {} : this.localData.by_id[target] || {};
        if (data && data.length > 0 && data != 'none') {
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
            this.warn(`updateLocalOverride (2) : ${JSON.stringify(base)}:${JSON.stringify(this.localData)}`)
        //this.retainData();
        return true;
    }


    NameForId(id, model, defaultName) {
        this.debug('name for id with ' + id + ' and ' + defaultName + ' from ' + JSON.stringify(this.localData));
        const localstorage = (this.localData.by_id[id] || this.localData.by_model[model]);
        if (localstorage && localstorage.hasOwnProperty['name']) return localstorage.name;
        return defaultName;
        /*

        if (!this.localData.by_id.hasOwnProperty(id))  return defaultName;
        if (this.localData.by_id[id].hasOwnProperty['name']) return this.localData.by_id[id].name;
        return defaultName;
        */
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
        if (typeof iconPath != 'string')
            {
                this.warn('icon path is no string, returning ' + JSON.stringify(defaultIcon));
                return defaultIcon;
            }
        if (iconPath.startsWith('http')) return iconPath;
        const dst = `${this.adapter.adapterDir}/admin/img/${path.basename(iconPath)}`
        const rv = `img/${path.basename(iconPath)}`;
        try {
            this.warn('testing if ' + dst +  ' exists')
            if (!fs.existsSync(dst)) {
                const src = this.adapter.expandFileName(iconPath).replace('.','_');
                this.warn('trying to copy' + src +  ' to ' + dst)
                fs.copyFileSync(src, dst);
            }
        } catch (error) {
            this.error(`Error accessing target image: ${JSON.stringify(error)}`)
        }
//        this.warn('returning ' + JSON.stringify(rv));
        return rv;
    }


    async copyDeviceImage(src) {
        const dst = `${this.adapter.adapterDir}/admin/img/${path.basename(src)}`;
        const _src = this.adapter.expandFileName(src);
        if (fs.existsSync(src)  && !fs.existsSync(dst))
        try {
            this.log.warn(`copying from :${src} to ${dst}`)
            fs.copyFileSync(src, dst)
        }
        catch {}
    }

    //
    // model specific data
    //
    /*
    {
        image: 'images/mypic.png', // relative to zigbee_x
        name:  '' // default device name
        states: {
            'id1': {
                    id: 'new stateid',
                    min: -1,
                    write: false,
                    name: 'newstatename',
                    role: 'overridden.rule',
                    ...
                  },
            'id2': {
                    id: 'new stateid',
                    min: -1,
                    write: false,
                    name: 'newstatename',
                    role: 'overridden.rule',
                    ...
                  },
            ...
        }
    }
    */
    updateModelSpecificData(model, data, rebuild) {
    }

    getOverrideData(target, isGlobal) {
        const base = (isGlobal ? this.localData.by_model : this.localData.by_Id);
        if (base.hasOwnProperty(target)) return base.target;
        return {};
    }

    async updateDeviceImage(target, isGlobal, image) {
        const base = getOverrideData(target, isGlobal);
        if (image == 'none' || !image) {
            if (base.hasOwnProperty('image')) delete base.image;
        }
        base.image = image.replace(this.basefolder, '.');
        this.setOverrideData(target, isGlobal, base);
    }

    setOverrideData(target, isGlobal, data) {
        const base = (isGlobal ? this.localData.by_model : this.localData.byId);
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
        const base = (isGlobal ? this.localData.by_model : this.localData.by_Id);
        const rv = [];
        for(var prop in base) {
            if (base[prop].hasOwnProperty(key)) {
                rv.push({key:prop, value:base[prop][key]});
            }
            // propertyName is what you want
            // you can get the value like this: myObject[propertyName]
        }
        return rv;
    }

    async updateFromDeviceNames() {
        this.warn('updateFromDeviceNames');
        const fn = this.adapter.expandFileName('dev_names').replace('.', '_').concat('.json');
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
                    for (var prop in data_js) {
                        if (data_js[prop] != 'undefined')
                            this.addDeviceSpecificData(prop, { name: data_js[prop] });
                    }
                }
                catch (error) {
                    this.error(`error in updateFromDeviceNames : ${error.message ? error.message : 'undefined error'}`)
                    return;

                }
            }
        });
    }

    async init() {
        this.info('init localConfig');
        const fn = this.adapter.expandFileName('LocalOverrides').replace('.','_').concat('.json');
        this.filename = fn;
        this.basefolder = path.dirname(fn);

        try {
            const content = fs.readFileSync(fn);
            try {
                const data_js = JSON.parse(content);
                this.localData = data_js;
                this.warn('loaded data ' + JSON.stringify(this.localData));

            }
            catch (error) {
                this.error(`unable to parse data read from ${fn} : ${error.message ? error.message : 'undefined error'}`);
            }
        } catch(error) {
            await this.updateFromDeviceNames();
        }

/*
        fs.readFile(fn, async (err, content) => {
            if (!err) {
                try {
                    const data_js = JSON.parse(content);
                    this.localData = data_js;
                    this.warn('loaded data ' + JSON.stringify(this.localData));

                }
                catch (error) {
                    this.error(`unable to parse data read from ${fn} : ${error.message ? error.message : 'undefined error'}`);
                }
            }
            else {
                await this.updateFromDeviceNames();
                //this.retainData();
            }
        });
*/
    }

    async retainData() {
        this.warn('retaining local config: ' + JSON.stringify(this.localData));
        try {
            fs.writeFileSync(this.filename, JSON.stringify(this.localData, null, 2))
            this.warn('Saved local configuration overrides ');
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
                rv.push({file: fn, name: item.name, data: fs.readFileSync(path.join(item.parentPath, item.name), 'base64')})
            });
            //this.warn('enumerateImages for  ' + _path + ' is ' + JSON.stringify(rv));
        }
        catch (error) {
            this.error(`error in enumerateImages : ${error.message ? error.message : 'undefined error'}`)
        }
        return rv;
    }

}





module.exports = localConfig;