'use strict';

const fs = require('node:fs');

class SerialList {
    constructor(adapter) {
        this.adapter = adapter;
        this.adapter.on('message', obj => this.onMessage(obj));
    }

    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'listUart':
                {
                    const candidates = [];
                    if (obj.callback) {
                        require('fs').readdir('/dev/serial/by-id', (err, files) => {
                            if (!err) {
                                for (const item of files)
                                    candidates.push({comName: `/dev/serial/by-id/${item}`});
                            }
                            const shortNames = [];
                            for (const candidate of candidates) {
                                fs.readlink(candidate.comName, (err, target) => {
                                    if (!err) {
                                        shortNames.push({comName: target})
                                    }
                                });
                            }
                            this.adapter.sendTo(obj.from, obj.command, candidates.reverse(), obj.callback);
                        })
                    }
                    break;
                }
            }
        }
    }
}

module.exports = SerialList;
