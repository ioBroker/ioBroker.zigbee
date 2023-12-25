const dmUtils = require('@iobroker/dm-utils');
const humanizeDuration = require('humanize-duration');

class dmZigbee extends dmUtils.DeviceManagement {

    async getInstanceInfo() {
        const data = {
            ...super.getInstanceInfo(),
            apiVersion: 'v1',
            actions: [
                {
                    id: 'newDevice',
                    icon: 'fas fa-plus',
                    title: '',
                    description: {
                        en: 'Add new device to Zigbee',
                        de: 'Neues Gerät zu Zigbee hinzufügen',
                        ru: 'Добавить новое устройство в Zigbee',
                        pt: 'Adicionar novo dispositivo ao Zigbee',
                        nl: 'Voeg nieuw apparaat toe aan Zigbee',
                        fr: 'Ajouter un nouvel appareil à Zigbee',
                        it: 'Aggiungi nuovo dispositivo a Zigbee',
                        es: 'Agregar nuevo dispositivo a Zigbee',
                        pl: 'Dodaj nowe urządzenie do Zigbee',

                        uk: 'Додати новий пристрій до Zigbee'
                    },
                    handler: this.handleNewDevice.bind(this)
                }
            ],
        };
        return data;
    }

    async handleRefresh(context) {
        this.adapter.log.info('handleRefresh');
        return { refresh: true };
    }

    async handleNewDevice(context) {
        this.adapter.log.info('handleNewDevice');

        const res = await this.adapter.zbController.permitJoin(permitTime);

        const permitTime = this.adapter.config.countDown;

        const progress = await context.openProgress('Searching...', { label: '0%' });
        await this.delay(500);
        for (let i = 1; i <= permitTime; i += 1) {
            await this.delay(300);
            this.log.info(`Progress at ${i}%`);
            await progress.update({ value: i, label: `${i}%` });
        }

        await this.delay(1000);
        await progress.close();

        return { refresh: true };
    }



    async listDevices() {
        const devices = await this.adapter.getDevicesAsync();
        const arrDevices = [];
        for (const i in devices) {
            const status = {};

            if (devices[i].common.type == 'group') continue;

            const available = await this.adapter.getStateAsync(`${devices[i]._id}.available`);
            if(available !== null && available !== undefined) {
                status.connection = available.val ? 'connected' : 'disconnected';
            }

            const link_quality = await this.adapter.getStateAsync(`${devices[i]._id}.link_quality`);
            if(link_quality) {
                status.rssi = link_quality.val;
            }

            const battery = await this.adapter.getStateAsync(`${devices[i]._id}.battery`);
            if(battery) {
                status.battery = battery.val;
            }

            let hastDetails = false;
            // Check if device has native.Sender_ID
            if(devices[i].native.id) {
                hastDetails = true;
            }

            const deviceInfo = await this.adapter.zbController.getDevice('0x'+devices[i].native.id);

            const res = {
                id: devices[i]._id,
                name: devices[i].common.name,
                icon: devices[i].common.icon ? '/adapter/zigbee/' + devices[i].common.icon : null,
                manufacturer: `${deviceInfo._manufacturerName}`  ,
                model: `${deviceInfo._modelID}`,
                status: status,
                hasDetails: hastDetails,
                actions: [
                    /*           {
                        id: 'delete',
                        icon: 'fa-solid fa-trash-can',
                        description: {
                            en: 'Delete this device',
                            de: 'Gerät löschen',
                            ru: 'Удалить это устройство',
                            pt: 'Excluir este dispositivo',
                            nl: 'Verwijder dit apparaat',
                            fr: 'Supprimer cet appareil',
                            it: 'Elimina questo dispositivo',
                            es: 'Eliminar este dispositivo',
                            pl: 'Usuń to urządzenie',
                            'zh-cn': '删除此设备',
                            uk: 'Видалити цей пристрій'
                        },
                        handler: this.handleDeleteDevice.bind(this)
                    },*/
                    {
                        id: 'rename',
                        icon: 'fa-solid fa-pen',
                        description: {
                            en: 'Rename this device',
                            de: 'Gerät umbenennen',
                            ru: 'Переименовать это устройство',
                            pt: 'Renomear este dispositivo',
                            nl: 'Hernoem dit apparaat',
                            fr: 'Renommer cet appareil',
                            it: 'Rinomina questo dispositivo',
                            es: 'Renombrar este dispositivo',
                            pl: 'Zmień nazwę tego urządzenia',
                            'zh-cn': '重命名此设备',
                            uk: 'Перейменуйте цей пристрій'
                        },
                        handler: this.handleRenameDevice.bind(this)
                    }
                ]
            };
            // if id contains gateway remove res.actions
            if(devices[i]._id.includes('gateway')) {
                res.actions = [];
            }
            arrDevices.push(res);
        }
        return arrDevices;
    }

    async getDeviceDetails(id, action, context) {
        this.adapter.log.info('getDeviceDetails');
        const devices = await this.adapter.getDevicesAsync();
        const device = devices.find(d => d._id === id);
        if(!device) {
            return {error: 'Device not found'};
        }
        if(!device.native.id) {
            return null;
        }

        const deviceInfo = await this.adapter.zbController.getDevice('0x'+ device.native.id);
        const lastSeen = await this.formatDate(deviceInfo._lastSeen);

        const items = {};

        for (const devInfo in deviceInfo._endpoints[0].inputClusters) {

            const val = deviceInfo._endpoints[0].inputClusters[devInfo];
            const valType = typeof val;

            if (valType != 'object') {
                const item = {
                    ['inputCluster'+devInfo]: {
                        type: 'staticText',
                        text: `inputCluster ${devInfo} : ${val}`,
                        newLine: true,
                    },
                };
                Object.assign(items,item);
            }

        }

        const data = {
            id: deviceInfo._ieeeAddr,
            schema: {
                type: 'tabs',
                items: {
                    _tab_Start: {
                        type: 'panel',
                        label: 'Main',

                        items: {
                            header_Start: {
                                type: 'header',
                                text: `${device.common.name} ${deviceInfo._ieeeAddr}`,
                                size: 3,
                            },
                            _link: {
                                label: `Manufacturer: ${deviceInfo._manufacturerName}`,
                                type: 'staticLink',
                                href: `https://www.zigbee2mqtt.io/supported-devices/#v=${deviceInfo._manufacturerName}`,
                                button: true,
                            },
                            _link2: {
                                label: `Model : ${device.common.type}`,
                                type: 'staticLink',
                                href: `https://www.zigbee2mqtt.io/devices/${device.common.type}.html`,
                                button: true,
                            },
                            _softwareBuildID: {
                                type: 'staticText',
                                text: `<b>Software Build Id:</b> ${deviceInfo._softwareBuildID}`,
                                style: {
                                    fontSize: 14
                                }
                            },

                            _divider2: {
                                type: 'divider',
                                color: 'primary',
                            },
                            _interviewCompleted: {
                                type: 'checkbox',
                                label: `Interview completed`,
                                checked: deviceInfo._interviewCompleted == 1 ?  'true' : 'false',
                                disabled: 'true',
                                newLine: true,
                            },
                            _configure: {
                                type: 'checkbox',
                                label: 'is Configured',
                                help: 'if it possible',
                                checked: deviceInfo.meta.configured == 1 ?  'true' : 'false',
                                disabled: 'true',
                            },
                            _lastSeen: {
                                type: 'staticText',
                                text: `<b>Last seen:</b> ${lastSeen}`,
                            },
                            _manufacturerID: {
                                type: 'staticText',
                                text: `<b>Manufacturer Id:</b> ${deviceInfo._manufacturerID}`,
                                newLine: true,
                            },
                            _network: {
                                type: 'staticText',
                                text: `<b>Network address:</b> 0x${deviceInfo._networkAddress}`,
                            },
                            _type: {
                                type: 'staticText',
                                text: `<b>Device Type:</b> ${deviceInfo._type}`,
                            },
                            _powered: {
                                type: 'staticText',
                                text: deviceInfo._powerSource ? `<b>Power:</b> ${deviceInfo._powerSource.toUpperCase()}` : ``,
                            },
                            _maxListeners: {
                                type: 'staticText',
                                text: `<b>max Listeners:</b> ${deviceInfo._maxListeners}`,
                            },
                        },
                    },
                    _tab_Details: {
                        type: 'panel',
                        label: 'Details',
                        items,
                    },
                },
            },
        };

        return data;
    }

    async handleDeleteDevice(id, context) {
        const devId = id.replace(/zigbee\.\d\./, '');
        const deviceInfo = await this.adapter.zbController.getDevice('0x'+  devId);


        const response = await context.showConfirmation({
            en: `Do you really want to delete the device ${deviceInfo._ieeeAddr}?`,
            de: `Möchten Sie das Gerät ${deviceInfo._ieeeAddr} wirklich löschen?`,
            ru: `Вы действительно хотите удалить устройство ${deviceInfo._ieeeAddr}?`,
            pt: `Você realmente deseja excluir o dispositivo ${deviceInfo._ieeeAddr}?`,
            nl: `Weet u zeker dat u het apparaat ${deviceInfo._ieeeAddr} wilt verwijderen?`,
            fr: `Voulez-vous vraiment supprimer l'appareil ${deviceInfo._ieeeAddr} ?`,
            it: `Vuoi davvero eliminare il dispositivo ${deviceInfo._ieeeAddr}?`,
            es: `¿Realmente desea eliminar el dispositivo ${deviceInfo._ieeeAddr}?`,
            pl: `Czy na pewno chcesz usunąć urządzenie ${deviceInfo._ieeeAddr}?`,
            'zh-cn': `您真的要删除设备 ${deviceInfo._ieeeAddr} 吗？`,
            uk: `Ви дійсно бажаєте видалити пристрій ${deviceInfo._ieeeAddr}?`
        });


        // delete device
        if(response === false) {
            return {refresh: false};
        }
        const res = await this.adapter.leaveDevice('0x'+  devId);

        if (res !== null) {
            this.adapter.log.info(`${devId} deleted`);
            return {refresh: true};
        } else {
            this.adapter.log.error(`Can not delete device ${devId}: ${JSON.stringify(res)}`);
            return {refresh: false};
        }
    }

    async handleRenameDevice(id, context) {
        const result = await context.showForm({
            type : 'panel',
            items: {
                newName: {
                    type: 'text',
                    trim: false,
                    placeholder: '',
                }
            }}, {
            data: {
                newName: ''
            },
            title: {
                en: 'Enter new name',
                de: 'Neuen Namen eingeben',
                ru: 'Введите новое имя',
                pt: 'Digite um novo nome',
                nl: 'Voer een nieuwe naam in',
                fr: 'Entrez un nouveau nom',
                it: 'Inserisci un nuovo nome',
                es: 'Ingrese un nuevo nombre',
                pl: 'Wpisz nowe imię',
                'zh-cn': '输入新名称',
                uk: 'Введіть нове ім\'я'
            }
        });
        if (result == undefined || result.newName == '') {
            return {refresh: false};
        }

        const obj = {
            common: {
                name: result.newName
            }
        };
        const res = await this.adapter.extendObjectAsync(id, obj);
        this.adapter.log.info(JSON.stringify(res));
        if (res === null) {
            this.adapter.log.warn(`Can not rename device ${context.id}: ${JSON.stringify(res)}`);

        }

        return {refresh: true};
    }

    async formatDate(time, type) {   //'ISO_8601' | 'ISO_8601_local' | 'epoch' | 'relative'
        if (type === 'ISO_8601') return new Date(time).toISOString();
        else if (type === 'ISO_8601_local') return this.toLocalISOString(new Date(time));
        else if (type === 'epoch') return time;
        else { // relative
            const ago = humanizeDuration(Date.now() - time, {language: 'en', largest: 2, round: true}) + ' ago';
            return ago;
        }
    }

    toLocalISOString(d) {
        const off = d.getTimezoneOffset();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes() - off, d.getSeconds(), d.getMilliseconds()).toISOString();
    }

}

module.exports = dmZigbee;
