'use strict';

const { devLabel } = require('./deviceLabel.js');

class basePlugin {
    constructor(adapter, name) {
        this.adapter = adapter;
        this.pluginName = name ?? 'Plugin';
        this.handlers = [];
        this.debugActive = false;
    }

    info (message, data) {
        this.adapter.onLog('info', message, data);
    }

    warn (message, data) {
        this.adapter.onLog('warn', `${this.pluginName}:${message}`, data);
    }
    debug (message, data) {
        this.adapter.onLog('debug', `${this.pluginName}:${message}`, data);
    }

    error (message, data) {
        this.adapter.onLog('error', `${this.pluginName}:${message}`, data);
    }

    sendTo (from, command, message, callback) {
        this.adapter.sendTo(from, command, message, callback);
    }

    start(zigbee, state) {
        this.isStarted = true;
        this.zbController = zigbee;
        this.stController = state;
    }

    stop() {
        for (const handler of this.handlers) {
            try {
                handler.obj.off(handler.cmd, handler.func);
            }
            catch (error) {
                this.error(`error unregistering Handler: ${error?.message ?? 'no message given'}`);
            }
        }
        this.handlers = [];
        delete this.zbController;
        delete this.stController;
        this.isStarted = false;
    }

    unregisterHandler(obj, cmd) {
        try {
            const handler = this.handlers.filter((candidate) => candidate.obj === obj && candidate.cmd === cmd);
            handler.obj.off(handler.cmd, handler.func);
        }
        catch (error) {
            this.error(`error unregistering Handler: ${error?.message ?? 'no message given'}`);
        }
    }

    registerHandler(obj, cmd, func, dontTrack) {
        try {
            if (!dontTrack) this.handlers.push({obj, cmd, func});
            obj.on(cmd, func);
        }
        catch (error) {
            this.error(`error unregistering Handler: ${error?.message ?? 'no message given'}`);
        }
    }

    enableDisableDebug(names) {
        if (Array.isArray(names)) {
            this.debugActive = (names.indexOf(this.pluginName) != -1)
        }
    }

    deviceLabel(id, model) {
        if (!model) return id;
        //return this.adapter.deviceLabel(id, model);
        return devLabel(this.adapter, id, model);
    }
}

module.exports = basePlugin;
