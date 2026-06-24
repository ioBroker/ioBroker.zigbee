const dmUtils = require('@iobroker/dm-utils');
const humanizeDuration = require('humanize-duration');
const ZbUtils = require('./utils');
const dmInfo = {
    devices:[],
    ts:-1,
}


class dmZigbee extends dmUtils.DeviceManagement {


    async getInstanceInfo() {
        const data = {
            ...super.getInstanceInfo(),
            //apiVersion: 'v3',
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
        const getDevicesResult = await this.adapter.getDeviceInformation();
        if (getDevicesResult) {
            dmInfo.devices = getDevicesResult.deviceObjects;
            dmInfo.ts = Date.now();
        }
        return { refresh: true };
    }

    async handleNewDevice(context) {
        this.adapter.log.info('handleNewDevice');

        const permitTime = this.adapter.config.countDown;
        const res = await this.adapter.zbController.permitJoin(permitTime);
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

    async createDeviceInfo(device) {
        const SKIP_STATES = new Set([
            'available', 'transition', 'brightness_move', 'brightness_step',
            'state_toggle', 'effect', 'color_temp_move',
        ]);

        const SKIP_READ_STATES = new Set([
            'link_quality', 'simulated_brightness', 'last_seen',
            'trigger_count', 'trigger_indicator',
        ]);

        const SKIP_NAME_PREFIXES = [
            'Indicates how many',
            'Indicates whether',
        ];

        const WRITE_FRONT_PAGE_ROLE = [
            'switch',
            'level',
        ];
        const status = {};

        switch (device?.common?.type) {
            case 'device':
                try {
                    const availState = await this.adapter.getStateAsync(`${device.native.id}.available`);
                    status.connection = availState && availState.val === true ? 'connected' : 'disconnected';
                } catch (_e) {
                    status.connection = 'disconnected';
                }
                break;
            case `group`:
                if ((device?.memberinfo ?? []).length)
                    status.connection = 'connected';
                else
                    status.connection = 'disconnected';
                break;
            case 'Coordinator':
                status.connection = 'connected';
                break;
            default:
                if (device?.type == 'device')
                    try {
                        const availState = await this.adapter.getStateAsync(`${device.native.id}.available`);
                        status.connection = availState && availState.val === true ? 'connected' : 'disconnected';
                    } catch (_e) {
                        status.connection = 'disconnected';
                    }
                else status.connection = 'disconnected';
        }

        try {
            const battState = await this.adapter.getStateAsync(`${device.native.id}.battery`);
            if (battState && battState.val != null) {
                status.battery = battState.val;
            }
        } catch (_e) { /* kein Batterie-State */ }

        const displayName = device.common.name;
        const info = device?.info ?? {};

        const res = {
            id: device.common.type === 'group' ? `group_${device.native.id}` : device.native.id,
            name: displayName,
            icon: device.common?.icon ? `/adapter/zigbee/${device.common.icon}` : null,
            manufacturer: info.device?.manufacturer ?? '',
            model: `${info.device?.modelZigbee ?? ''}`.trim(),
            status,
            hasDetails: true,
            actions: [],
        };

        if (Array.isArray(device.statesDef)) {
            const customItems   = {};   // kurze Labels → Kachel
            const detailItems   = {};   // lange Labels  → Detail-Tab
            const writeItems    = {};
            const scheduleItems = {};

            // Maximale Label-Länge für die Kachel ("Sum of produced energy" = 22 Zeichen)
            const MAX_CARD_LABEL_LEN = 30;

            for (const state of device.statesDef) {
                if (!state || !state.id) { continue; }
                if (SKIP_STATES.has(state.id)) { continue; }
                if (state.isEvent === true) { continue; }
                if (state.isAction) { continue; }

                const stateId = state.id;
                const label   = state.name || state.id.split('.').pop();
                const unit    = state.unit || undefined;

                const isSchedule = state.id.toLowerCase().includes('schedule') ||
                                    (state.name || '').toLowerCase().includes('schedule');

                if (state.write) {
                    let target = customItems;
                    if (label.length < MAX_CARD_LABEL_LEN) {
                        if (!(WRITE_FRONT_PAGE_ROLE.includes((state?.role ?? '_._').split('.')[0])))
                            target = writeItems;
                    } else target = writeItems
                    if (isSchedule) {
                        scheduleItems[state.id] = {
                            type: 'state', oid: stateId, foreign: true,
                            label, newLine: true, minRows: 3, maxRows: 20,
                        };
                    } else if (state.type === 'boolean') {
                        target[state.id] = {
                            type: 'state', oid: stateId, foreign: true,
                            label, control: 'switch',
                            trueText: 'ON', falseText: 'OFF',
                            newLine: true,
                        };
                    } else if (state.type === 'number' && state.min != null && state.max != null) {
                        target[state.id] = {
                            type: 'state', oid: stateId, foreign: true,
                            label, unit, control: 'slider',
                            min: state.min, max: state.max, newLine: true,
                        };
                    } else if (state.states) {
                        target[state.id] = {
                            type: 'state', oid: stateId, foreign: true,
                            label, unit, control: 'select',
                            states: state.states, newLine: true,
                        };
                    } else {
                        target[state.id] = {
                            type: 'state', oid: stateId, foreign: true,
                            label, unit, newLine: true,
                        };
                    }
                } else if (state.read) {
                    if (SKIP_READ_STATES.has(state.id)) { continue; }
                    if (isSchedule) { continue; }
                    const stateName = state.name || '';
                    if (SKIP_NAME_PREFIXES.some(p => stateName.startsWith(p))) { continue; }

                    // Duplikat vermeiden: State bereits über write-Zweig erfasst → überspringen
                    if (detailItems[state.id] || customItems[state.id]) { continue; }

                    // LoRaWAN-Muster: oid + foreign:true, Framework liest Live-Wert direkt
                    const item = {
                        type: 'state',
                        oid: stateId,
                        foreign: true,
                        label,
                        unit: unit ?? undefined,
                        ...(state.type === 'boolean' ? {
                            trueText:  '✔',
                            falseText: '✘',
                        } : {}),
                    };

                    if (label.length > MAX_CARD_LABEL_LEN) {
                        detailItems[state.id] = item;
                    } else {
                        customItems[state.id] = item;
                    }
                }
            }

            // Items alphabetisch sortieren (wie LoRaWAN)
            if (Object.keys(customItems).length > 0) {
                const sortedItems = Object.keys(customItems)
                    .sort((a, b) => a.localeCompare(b))
                    .reduce((acc, key) => { acc[key] = customItems[key]; return acc; }, {});

                res.customInfo = {
                    id: device.ieee_address,
                    schema: { type: 'panel', items: sortedItems },
                };
            }

            device._scheduleItems = scheduleItems;
            device._detailItems   = detailItems;

            if (Object.keys(writeItems).length > 0) {
                res.actions.push({
                    id: 'control',
                    icon: 'settings',
                    description: 'Control device',
                    handler: async (_id, ctx) => {
                        await ctx.showForm(
                            { type: 'panel', label: displayName, items: writeItems },
                            { title: `Control – ${displayName}` },
                        );
                        return { refresh: false };
                    },
                });
            }
        }
        return res;

    }

    /**
     * Lädt alle Zigbee2MQTT-Geräte und Gruppen und meldet sie an den Device-Manager.
     * Wird vom dm-utils-Framework bei 'dm:loadDevices' aufgerufen.
     *
     * @param {object} context - Der DeviceLoadContext (addDevice / setTotalDevices / complete).
     */
    async loadDevices(context) {
        const now = Date.now();
        if (now - dmInfo.ts > (60*60*1000) ) {
            dmInfo.devices = (await this.adapter.getDeviceInformation())?.deviceObjects ?? {};
            dmInfo.ts = Date.now();
        }
        let devCnt = 0;
        for (const device of dmInfo.devices) {
            const deviceInfo = await this.createDeviceInfo(device);
            if (deviceInfo) {
                context.addDevice(deviceInfo);
                devCnt++;
            }
        }
        context.setTotalDevices(devCnt)
        context.complete();
    }





    /**
     * Gibt Schema und Daten für die Detailansicht eines einzelnen Geräts zurück.
     *
     * @param {string} id        Die IEEE-Adresse des Geräts
     * @param {object} _action   Das Action-Objekt vom dm-utils-Framework
     * @param {object} _context  Der Device-Management-Kontext
     */
    async getDeviceDetails(id, _action, _context) {
        this.adapter.log.debug(`getDeviceDetails: ${id}`);

        const adapterDevice = await this.adapter.getObjectAsync(id);
        const zigbeeDevice = await this.adapter.zbController.getDevice(ZbUtils.adIdtoZbIdorIeee(this.adapter, id))
        const entity = zigbeeDevice ? await this.adapter.zbController.resolveEntity(zigbeeDevice) : undefined;
        if (!adapterDevice || !zigbeeDevice) {
            this.adapter.log.warn(`unable to display details for ${id}: ${adapterDevice ? '' : 'object missing '}${zigbeeDevice ? '' : 'device missing'}`);
            return null;
        }

        // Zeitstempel formatieren (wie LoRaWAN)
        const formatTs = (val) => {
            if (!val) { return '—'; }
            const ts = isNaN(Number(val)) ? new Date(val) : new Date(Number(val));
            if (isNaN(ts.getTime())) { return String(val); }
            return ts.toLocaleString('de-DE', {
                weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
        };

        // Live-States lesen
        let lastSeenText    = '—';
        let linkQualityText = '—';
        let batteryText     = '—';
        let availableText   = '—';

        try {
            const s = await this.adapter.getStateAsync(`${id}.msg_from_zigbee`);
            if (s && s.ts != null && s.ts !== '') { lastSeenText = formatTs(s.ts); }
        } catch (_e) { /* ignorieren */ }

        try {
            const s = await this.adapter.getStateAsync(`${id}.link_quality`);
            if (s && s.val != null) { linkQualityText = `${s.val} / 255`; }
        } catch (_e) { /* ignorieren */ }

        try {
            const s = await this.adapter.getStateAsync(`${id}.battery`);
            if (s && s.val != null) { batteryText = `${s.val} %`; }
        } catch (_e) { /* ignorieren */ }

        try {
            const s = await this.adapter.getStateAsync(`${id}.available`);
            if (s) { availableText = s.val === true ? '✔  Online' : '✘  Offline'; }
        } catch (_e) { /* ignorieren */ }

        const displayName   = adapterDevice.common.name;
        const scheduleItems = adapterDevice._scheduleItems || {};
        const hasSchedule   = Object.keys(scheduleItems).length > 0;
        const detailItems   = adapterDevice._detailItems   || {};
        const hasDetails    = Object.keys(detailItems).length > 0;

        const data = {};

        // ── Tab 1: Gerät ─────────────────────────────────────────────────────
        const infoItems = {};
        infoItems['_h1']    = { type: 'header',     text: 'Device Identity',  size: 4, newLine: true };
        infoItems['_d1']    = { type: 'divider',     color: 'primary' };
        infoItems['ieee']   = { type: 'staticInfo',  label: 'IEEE Address',   data: zigbeeDevice.ieeeAddr ?? `0x${id}`,    size: 16, addColon: true, newLine: true };
        infoItems['fname']  = { type: 'staticInfo',  label: 'Friendly Name',  data: adapterDevice.common.name,             size: 16, addColon: true, newLine: true };
        infoItems['mfr']    = { type: 'staticInfo',  label: 'Manufacturer',   data: zigbeeDevice.manufacturerName  ?? '—', size: 16, addColon: true, newLine: true };
        infoItems['model']  = { type: 'staticInfo',  label: 'Model',          data: entity?.mapped?.model   ?? '—',        size: 16, addColon: true, newLine: true };
        infoItems['descr']  = { type: 'staticInfo',  label: 'Description',    data: entity?.mapped?.description   ?? '—',  size: 16, addColon: true, newLine: true };
        infoItems['pwr']    = { type: 'staticInfo',  label: 'Power Source',   data: zigbeeDevice.powerSource   ?? '—',     size: 16, addColon: true, newLine: true };

        // ── Tab 2: Verbindung ─────────────────────────────────────────────────
        const connItems = {};
        connItems['_h1']    = { type: 'header',     text: 'Zigbee Connection',  size: 4, newLine: true };
        connItems['_d1']    = { type: 'divider',     color: 'primary' };
        connItems['avail']  = { type: 'staticInfo',  label: 'Status',           data: availableText,    size: 16, addColon: true, newLine: true };
        connItems['lq']     = { type: 'staticInfo',  label: 'Link Quality',     data: linkQualityText,  size: 16, addColon: true, newLine: true };
        connItems['ls']     = { type: 'staticInfo',  label: 'Last seen',        data: lastSeenText,     size: 16, addColon: true, newLine: true };
        if (batteryText !== '—') {
            connItems['batt'] = { type: 'staticInfo', label: 'Battery',         data: batteryText,      size: 16, addColon: true, newLine: true };
        }

        // ── Tab 3: Technisch ──────────────────────────────────────────────────
        const techItems = {};
        techItems['_h1']    = { type: 'header',    text: 'Zigbee Status',       size: 4, newLine: true };
        techItems['_d1']    = { type: 'divider',    color: 'primary' };
        techItems['interviewCompleted'] = { type: 'checkbox', label: 'Interview completed', readOnly: true, newLine: true };
        techItems['supported']          = { type: 'checkbox', label: 'Supported by Z2M',    readOnly: true, newLine: true };
        techItems['disabled']           = { type: 'checkbox', label: 'Disabled',            readOnly: true, newLine: true };
        techItems['groupable']          = { type: 'checkbox', label: 'Groupable as member', readOnly: true, newLine: true };
        techItems['bindsource']         = { type: 'checkbox', label: 'Bindable as source',  readOnly: true, newLine: true };

        data.interviewCompleted = ((zigbeeDevice.interviewState ?? '') == 'SUCCESSFUL');
        data.supported          = Boolean(entity);
        data.disabled           = Boolean(adapterDevice.common.deactivated);
        data.groupable          = false;
        data.bindsource         = false;

        // ── Tabs zusammenbauen ────────────────────────────────────────────────
        const tabs = {
            _tab_info: { type: 'panel', label: 'Device',     items: infoItems },
            _tab_conn: { type: 'panel', label: 'Connection', items: connItems },
            _tab_tech: { type: 'panel', label: 'Technical',  items: techItems },
        };

        // Values-Tab: States mit langen Labels
        if (hasDetails) {
            const sortedDetailItems = Object.keys(detailItems)
                .sort((a, b) => a.localeCompare(b))
                .reduce((acc, key) => { acc[key] = detailItems[key]; return acc; }, {});
            tabs._tab_values = {
                type: 'panel',
                label: 'Values',
                items: {
                    _h1: { type: 'header', text: 'Additional Values', size: 4, newLine: true },
                    _d1: { type: 'divider', color: 'primary' },
                    ...sortedDetailItems,
                },
            };
        }

        // Schedule-Tab: nur für Thermostate
        if (hasSchedule) {
            tabs._tab_schedule = {
                type: 'panel',
                label: 'Schedule',
                items: {
                    _h1: { type: 'header',  text: 'Weekly Schedule', size: 4, newLine: true },
                    _d1: { type: 'divider', color: 'primary' },
                    ...scheduleItems,
                },
            };
        }

        return {
            id: id,
            schema: { type: 'tabs', items: tabs },
            data,
        };
    }


    /*async getDeviceDetails(id, action, context) {
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
    }*/

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
        const res = await this.adapter.stController.leaveDevice('0x'+  devId);

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
