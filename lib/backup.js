'use strict';

const fs = require('fs');
const pathLib = require('path');

class Backup {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', this.onMessage.bind(this));
        this.inProgress = new Set();
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

    warn(msg) {
        this.adapter.log.info(msg);
    }

    error(msg) {
        this.adapter.log.error(msg);
    }

    debug(msg) {
        this.adapter.log.debug(msg);
    }

    onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'listbackups':
                    this.listbackups(obj);
                    break;
                case 'restore':
                    this.restore(obj);
                    break;
            }
        }
    }

    async configure (zigbeeOptions) {
        this.zigbeeOptions = zigbeeOptions;
        this.backup(zigbeeOptions);
    }

    backup(options) {
        // backup prior database and nv data before start adapter
        const files = [];
        if (fs.existsSync(pathLib.join(options.dbDir, options.backupPath))) files.push(options.backupPath);
        if (fs.existsSync(pathLib.join(options.dbDir, options.dbPath))) files.push(options.dbPath);
        if (files.length == 0) return;

        const d = new Date();
        const backup_name = `${d.getFullYear()}_${('0' + (d.getMonth() + 1)).slice(-2)}_${('0' + d.getDate()).slice(-2)}-`+
                `${('0' + d.getHours()).slice(-2)}_${('0' + d.getMinutes()).slice(-2)}_${('0' + d.getSeconds()).slice(-2)}`;
        const tar = require('tar');
        const name = pathLib.join(options.dbDir, `backup_${backup_name}.tar.gz`);
        const f = fs.createWriteStream(name);
        f.on('finish', () => {
            this.debug(`Backup ${name} success`);
        });
        f.on('error', err => {
            this.error(`Cannot pack backup ${name}: ` + err);
        });
        try {
            tar.create({gzip: true, p: false, cwd: options.dbDir}, files).pipe(f);
        } catch (err) {
            this.error(`Cannot pack backup ${name}: ` + err);
        }
    }

    listBackupsFiles() {
        const dir = this.zigbeeOptions.dbDir;
        const result = [];
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            for (let i = 0; i < files.length; i++) {
                if (files[i].match(/\.tar\.gz$/i)) {
                    result.push(files[i]);
                }
            }
            return result;
        } else {
            return result;
        }
    }

    async listbackups(obj) {
        
    }

    async restore(options, name) {
        if (fs.existsSync(pathLib.join(options.dbDir, name))) {
            try {
                this.log.info('Stop herdsman');
                if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                this.callPluginMethod('stop');
                if (this.zbController) {
                    await this.zbController.stop();
                }
                const tar = require('tar');
                try {
                    tar.extract({file: name, cwd: options.dbDir}, err => {
                        if (err) {
                            this.log.error(`Cannot extract from file ${name}: ${err}`);
                        } else {
                            this.log.info(`Extract from file ${name} success`);
                        }
                        this.doConnect();
                    });
                } catch (err) {
                    this.log.error(`Cannot extrack backup ${name}: ${err}`);
                }
            } catch (error) {
                this.log.error(`Stop herdsman error (${error.stack})`);
            }
        }
    }
}

module.exports = Backup;