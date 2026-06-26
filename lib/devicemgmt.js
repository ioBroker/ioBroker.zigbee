const dmUtils = require('@iobroker/dm-utils');
const humanizeDuration = require('humanize-duration');
const ZbUtils = require('./utils');
const dmInfo = {
    devices:[],
    ts:-1,
    deviceDetails:{},
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
            id: device.native.id,
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
                            trueText: '\u{24DB}', falseText: '\u{24DE}',
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
                            trueText:  '\u{2714}',
                            falseText: '\u{2717}',
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

            const dmInfoData = { scheduleItems, detailItems }

            dmInfo[device.native.id] = dmInfoData;

            //device._scheduleItems = scheduleItems;
            //device._detailItems   = detailItems;

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

        const device = (dmInfo?.devices ?? []).find((d) => d?.native?.id == id);

        let ieee = (device?.native?.id ?? '0');
        if (ieee.length >3) ieee = `0x${device.native.id}`;

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

        const displayName   = device.common.name;
        const scheduleItems = dmInfo[device?.native?.id]?.sheduleItems  ?? {};
        const hasSchedule   = Object.keys(scheduleItems).length > 0;
        const detailItems   = dmInfo[device?.native?.id]?.detailItems   ?? {};
        const hasDetails    = Object.keys(detailItems).length > 0;

        const data = {};

        // ── Tab 1: Gerät ─────────────────────────────────────────────────────
        const infoItems = {};
        if (device.common.type == 'group') {
            infoItems['_h1']    = { type: 'header',     text: 'Group Members', newLine: true};
            infoItems['_d1']    = { type: 'divider',    color: 'primary' };
            let cnt = 0;
            for (const member of device.memberinfo) {
                infoItems[`m${cnt++}`] = { size:16, type: 'staticInfo', label:`Member ${cnt}`, data:`${member.ieee} EP ${member.epid}`, addColon: true, newLine: true }
            }
        } else if (device.info.device.type != 'Coordinator') {
            infoItems['ieee']   = { size:16, type: 'staticInfo',  label: 'IEEE Address',   data: ieee,                                     addColon: true, newLine: true };
            infoItems['fname']  = { size:16, type: 'staticInfo',  label: 'Friendly Name',  data: device.common.name,                       addColon: true, newLine: true };
            infoItems['mfr']    = { size:16, type: 'staticInfo',  label: 'Manufacturer',   data: device.info.device.manuf_name  ?? '—',    addColon: true, newLine: true };
            infoItems['model']  = { size:16, type: 'staticInfo',  label: 'Model',          data: device.info.mapped.model   ?? '—',        addColon: true, newLine: true };
            infoItems['descr']  = { size:16, type: 'staticInfo',  label: 'Description',    data: device.info.mapped.description   ?? '—',  addColon: true, newLine: true };
            infoItems['pwr']    = { size:16, type: 'staticInfo',  label: 'Power Source',   data: device.info.device.power   ?? '—',        addColon: true, newLine: true };
            infoItems['kind']   = { size:16, type: 'staticInfo',  label: 'Device Type',    data: device.mapped?.type   ?? '—',             addColon: true, newLine: true };
        } else {

            const encColor = this.adapter.config.precfgkey == '01030507090b0d0f00020406080a0c0d' ? '\u{26A0} ' : '';
            //const panColor = this.adapter.config.extPanID == 'DDDDDDDDDDDDDDDD' ? '\u{26A0} ' : '';
            const CHANNELS = [11,15,20,25]
            const channel = `${CHANNELS.includes(Number(this.adapter.config.channel)) ? 'Zigbee Light Link' : 'Zigbee'} ${this.adapter.config.channel}`;
            const pwr = (this.adapter?.config?.port ?? '').toLowerCase().startsWith('tcp') ? 'external' : 'USB';
            const hiddenExtPan = `0x${this.adapter.config.extPanID.slice(0,4)}....${this.adapter.config.extPanID.slice(12)}`
            const panid = `0x${this.adapter.config.panID} / ${this.adapter.config.extPanID == 'DDDDDDDDDDDDDDDD' ? '\u{26A0} 0xDDDD....DDDD' : hiddenExtPan}`
            const enc = `${encColor} 0x${this.adapter.config.precfgkey.slice(0,4)}......${this.adapter.config.precfgkey.slice(14,18)}......${this.adapter.config.precfgkey.slice(28,32)}`;

            infoItems['ieee']     = { size:16, type: 'staticInfo',  label: 'IEEE Address',   data: ieee,                                     addColon: true, newLine: true };
            infoItems['channel']  = { size:16, type: 'staticInfo',  label: 'Channel',        data:channel, addColon: true, newLine: true };
            infoItems['panid']    = { size:16, type: 'staticInfo',  label: 'Pan / ExtPan',   data:panid, color:panColor,    addColon: true, newLine: true };
            infoItems['enc']      = { size:16, type: 'staticInfo',  label: 'Encryption key', data:enc, color:encColor,       addColon: true, newLine: true };
            infoItems['pwr']      = { size:16, type: 'staticInfo',  label: 'Power Source',   data:pwr, addColon: true, newLine: true };
            infoItems['kind']     = { size:16, type: 'staticInfo',  label: 'Device Type',    data: this.adapter.config.adapterType   ?? '—',             addColon: true, newLine: true };


        }

        // ── Tab 2: Verbindung ─────────────────────────────────────────────────
        const connItems = {};
        connItems['_h1']    = { type: 'header',      text:  'Zigbee Connection',   newLine: true };
        connItems['_d1']    = { type: 'divider',     color: 'primary' };
        connItems['avail']  = { size:16, type: 'staticInfo',  label: 'Status',           data: availableText,     addColon: true, newLine: true };
        connItems['lq']     = { size:16, type: 'staticInfo',  label: 'Link Quality',     data: linkQualityText,   addColon: true, newLine: true };
        connItems['ls']     = { size:16, type: 'staticInfo',  label: 'Last seen',        data: lastSeenText,      addColon: true, newLine: true };
        if (batteryText !== '—') {
            connItems['batt'] = { size:16, type: 'staticInfo', label: 'Battery',         data: batteryText,       addColon: true, newLine: true };
        }

        // ── Tab 3: Technisch ──────────────────────────────────────────────────
        const techItems = {};
        if (device.info.device.type != 'Coordinator') {
            techItems['_h1']    = { size:16, type: 'header',    text: 'Zigbee Status',       newLine: true };
            techItems['_d1']    = { type: 'divider',    color: 'primary' };
            techItems['interviewCompleted'] = { size:16, type: 'checkbox', label: 'Interview completed', readOnly: true, newLine: true };
            techItems['supported']          = { size:16, type: 'checkbox', label: 'Supported by Z2M',    readOnly: true, newLine: true };
            techItems['disabled']           = { size:16, type: 'checkbox', label: 'Disabled',            readOnly: true, newLine: true };
            techItems['groupable']          = { size:16, type: 'checkbox', label: 'Groupable as member', readOnly: true, newLine: true };
            techItems['bindsource']         = { size:16, type: 'checkbox', label: 'Bindable as source',  readOnly: true, newLine: true };
        }
        else {
            techItems['_h1']       = { size:16, type: 'header',    text: 'Coordinator options ',       newLine: true };
            techItems['_d1']       = { type: 'divider',    color: 'primary' };

            techItems['type']      = { size:16, type: 'staticInfo',  label: 'Adapter Hardware',       data: `${device.info.coordinatorData.type} ${device.info.coordinatorData.version} ${device.info.coordinatorData.revision}`,  newLine: true };
            techItems['sw']        = { size:16, type: 'staticInfo',  label: 'Adapter software',       data: device.info.coordinatorData.installedVersion,  addColon: true, newLine: true };
            techItems['libs']      = { size:16, type: 'staticInfo',  label: 'Herdsman / Converters',  data: `${device.info.coordinatorData.herdsman} / ${device.info.coordinatorData.converters}`, newLine: true };
            techItems['ieee']      = { size:16, type: 'staticInfo',  label: 'Adapter IEEE',           data: `${device.info.device.ieee}`,  addColon: true, newLine: true };
            techItems['autostart'] = { size:16, type: 'checkbox',    label: 'Network autostart',  readOnly: true, newLine: true };
        }

        data.interviewCompleted = ((device.info.device.interviewstate ?? '') == 'SUCCESSFUL');
        data.supported          = Boolean(device.info.mapped.model);
        data.disabled           = Boolean(device.common.deactivated);
        data.groupable          = device.info.device.isGroupable;
        data.bindsource         = device.info.device.BindSource;
        data.autostart          = this.adapter.config.autostart;


        // ── Tabs zusammenbauen ────────────────────────────────────────────────
        const tabs = {
            _tab_info: { type: 'panel', label: 'Device',     items: infoItems },
            _tab_tech: { type: 'panel', label: 'Technical',  items: techItems },
        };

        if (device.type == 'device' && device.common.type != 'group') {
            tabs._tab_conn = { type: 'panel', label: 'Connection', items: connItems }
        }

        // Values-Tab: States mit langen Labels
        if (hasDetails) {
            const sortedDetailItems = Object.keys(detailItems)
                .sort((a, b) => a.localeCompare(b))
                .reduce((acc, key) => { acc[key] = detailItems[key]; return acc; }, {});
            tabs._tab_values = {
                type:  'panel',
                label: 'Values',
                items: {
                    _h1: { size:16, type: 'header', text: 'Additional Values', size: 4, newLine: true },
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
                    _h1: { size:16, type: 'header',  text: 'Weekly Schedule', size: 4, newLine: true },
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
