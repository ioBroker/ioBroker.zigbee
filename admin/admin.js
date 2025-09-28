/*global $, M, _, sendTo, systemLang, translateWord, translateAll, showMessage, socket, document, instance, vis, Option*/
/*
 * you must run 'iobroker upload zigbee' if you edited this file to make changes visible
 */


const Materialize = (typeof M !== 'undefined') ? M : Materialize,
    anime = (typeof M !== 'undefined') ? M.anime : anime,
    namespace = 'zigbee.' + instance,
    namespaceLen = namespace.length;
let devices = [],
    debugDevices = [],
    messages = [],
    map = {},
    namedColors = [],
    mapEdges = null,
    network,
    networkEvents,
    responseCodes = false,
    groups = {},
    devGroups = {}, // eslint-disable-line prefer-const
    binding = [],
    excludes = [],
    coordinatorinfo = {
        installSource: 'IADefault_1',
        channel: '-1',
        port: 'Default_1',
        installedVersion: 'Default_1',
        type: 'Default_1',
        revision: 'Default_1',
        version: '9-9.9.9.9',
        herdsman: '4.0.0',
        converters: '24.0.0',
    },
    cidList,
    shuffleInstance,
    errorData = [],
    debugMessages = {},
    debugInLog = true,
    nvRamBackup = {},
    isHerdsmanRunning = false;
const dbgMsgfilter = new Set();
const dbgMsghide = new Set();
const updateCardInterval = setInterval(updateCardTimer, 6000);

const networkOptions = {
    autoResize: true,
    height: '100%',
    width: '100%',
    nodes: {
        shape: 'box'
    },
    layout: {
        improvedLayout: true,
    },
    physics: {
        enabled: true,
    }
};


const savedSettings = [
    'port', 'panID', 'channel', 'disableLed', 'countDown', 'groups', 'extPanID', 'precfgkey', 'transmitPower','useNewCompositeStates',
    'adapterType', 'debugHerdsman', 'disableBackup', 'external', 'startWithInconsistent','pingTimeout','listDevicesAtStart',
    'warnOnDeviceAnnouncement', 'baudRate', 'flowCTRL', 'autostart', 'readAtAnnounce', 'startReadDelay', 'readAllAtStart','pingCluster'
];
const lockout = {
    timeoutid:undefined,
    isActive:false,
};

const connectionStatus = {
    connected: false,
    lastcheck: Date.now(),
}


////
//
//. section Alive
//
////

function keepAlive(callback) {
    const responseTimeout = setTimeout(function() {
        UpdateAdapterAlive(false); }, 500);
    sendTo(namespace, 'aliveCheck', {}, function(msg) {
        clearTimeout(responseTimeout);
        UpdateAdapterAlive(true);
        if (callback) callback();
    });
}

function startKeepalive() {
    return setInterval(keepAlive, 10000);
}

function UpdateAdapterAlive(state) {
    if (connectionStatus.connected === state) return;
    connectionStatus.time = Date.now();
    if (state) {
        $('#adapterStopped_btn').addClass('hide');
        $('#code_pairing').removeClass('disabled');
        $('#touchlink_btn').removeClass('disabled');
        $('#add_grp_btn').removeClass('disabled');
        $('#fw_check_btn').removeClass('disabled');
        $('#ErrorNotificationBtn').removeClass('disabled');
        $('#show_errors_btn').removeClass('disabled');
        $('#download_icons_btn').removeClass('disabled');
        $('#pairing').removeClass('disabled');
    }
    else {
        $('#adapterStopped_btn').removeClass('hide');
        $('#code_pairing').addClass('disabled');
        $('#touchlink_btn').addClass('disabled');
        $('#add_grp_btn').addClass('disabled');
        $('#fw_check_btn').addClass('disabled');
        $('#ErrorNotificationBtn').addClass('disabled');
        $('#show_errors_btn').addClass('disabled');
        $('#pairing').addClass('disabled');
        $('#download_icons_btn').addClass('disabled');
    }
    connectionStatus.connected = state;
}


////
//
// Utility functions
//
////
function sendToWrapper(target,command,msg,callback) {
    if (connectionStatus.connected)
        sendTo(target,command,msg,callback);
    else if (callback) callback({error:'Cannot execute command - adapter is not running'});
}

function getDeviceByID(ID) {
    if (devices) return devices.find((devInfo) => {
        return (devInfo ? devInfo._id : '') == ID;
    });
}

function getDeviceByIEEE(ieeeAddr) {
    return devices.find((devInfo) => {
        try {
            return devInfo.info.device.ieee == ieeeAddr;
        } catch (e) {
            return false;
        }
    });
}


function getDeviceByNetwork(nwk) {
    return devices.find((devInfo) => {
        try {
            return devInfo.info.device.nwk == nwk;
        } catch (e) {
            return false;
        }
    });
}

function getBatteryCls(value) {
    if (value) {
        if (value < 50) return 'icon-red';
        if (value < 80) return 'icon-orange';
    }
    return '';
}

function getLQICls(value) {
    if (value) {
        if (value < 20) return 'icon-red';
        if (value < 50) return 'icon-orange';
    }
    return 'icon-green';
}

function sanitizeModelParameter(parameter) {
    const replaceByUnderscore = /[\s/]/g;
    return parameter.replace(replaceByUnderscore, '_');
}

/////
//
// Section Local Data
//
////

function getLocalData() {
    const localdata = {
        models: {
          Coordinator: {
            instances: ['0x00124b00258f182e'],
            options: []
          },
          Plug_01: {
            instances: ['0x7cb03eaa00a715a9', '0xdeadeaa00a715a9'],
            modelinfo: {
                description:'none',
                link:'http://blafasel',
                icon:'http://LinkToIcon',
                options: {
                    power_calibration: {
                        type:'numeric',
                        min:0,
                        max:100,
                        default:50,
                        description:'option desciption'
                    },
                    current_calibration: {
                        type:'numeric',
                        min:0,
                        max:100,
                        default:50,
                        description:'option desciption'
                    }
                },
            },
            options: [{ key:'power_calibration', value: 20},],
            overrides: [],
          },
          WXKG02LM_rev2: {
            Instances: ['0x00158d0003165f60'],
            modelinfo: {
                description:'none',
                link:'http://blafasel',
                icon:'http://LinkToIcon',
                options: {
                    idle_time: {
                        type:'numeric',
                        min:0,
                        max:100,
                        default:50,
                        description:'option desciption'
                    },
                    connected_mode: {
                        type:'numeric',
                        min:0,
                        max:100,
                        default:50,
                        description:'option desciption'
                    },
                    left_mode: {
                        type:'numeric',
                        min:0,
                        max:100,
                        default:50,
                        valueLimits:[0,10,20,30,40,50,60,70,80,90,100],
                        description:'option desciption'
                    },
                    right_mode: {
                        type:'string',
                        default:'isolated',
                        valueLimits:['isolated', 'dual', 'triple'],
                        description:'option desciption'
                    }
                },
            },
            options: [{ key:'idle_time', value: 20},],
            overrides: [],
          },
        },
        devices: {
            '0x00158d0003165f60': {
                name: 'mmm',
                model: 'WXKG02LM_rev2',
                legacy: false,
                options: [{ key:'idle_time', value: '30'},{ key:'right_mode', value: 'bla'},],
                overrides: [],

            },
            '0x7cb03eaa00a715a9': {
                name: 'nnnn',
                model: 'Plug_01',
                legacy: false,
                options: [{ key:'keyname', value: 'bla'},{ key:'keyname', value: 'bla'},],
                overrides: [{ key:'name', value: 'overridden'},],
            },
            '0xdead3eaa00a715a9': {
                name: 'nnnn',
                model: 'Plug_01',
                legacy: false,
                options: [{ key:'power_calibration', value: 100},{ key:'current_calibration', value: '0'},],
                overrides: [],
            }

        },
        options: [{ key:'keyname', value: 'bla'},{ key:'keyname', value: 'bla'},{ key:'keyname', value: 'bla'},]
    };
    return localdata;
}

function getModelData(data) {
    const Html = [];
    Html.push(`<ul class="collapsible">`);
    Html.push(`<li>`);
    Html.push(`<div class="collapsible-header"><img src="zigbee.png" alt="" class="circle" width="32" height="auto">Paired Models</div>`);
    Html.push(`<div class="collapsile-body"<span>Nothing</span></div>`);
    Html.push(`</li><li>`)
    Html.push(`<div class="collapsible-header"><img src="zigbee.png" alt="" class="circle" width="40" height="auto">Paired Models</div>`);
    Html.push(`<div class="collapsile-body"<span>Nothing</span></div>`);
    Html.push(`</li><li>`)
    Html.push(`<div class="collapsible-header"><img src="zigbee.png" alt="" class="circle" width="64" height="auto">Paired Models</div>`);
    Html.push(`<div class="collapsile-body"<span>Nothing</span></div>`);
    Html.push(`</li></ul>`);
    return Html.join('');
}
function getDeviceData(data, modelFilter) {
    return 'No Data Yet'
}
function getGlobalOptionData() {
    return 'No Data Yet'
}

function showLocalData() {
    const data = getLocalData();
    const Html = [];

    Html.push(`<ul class="collapsible">`);
    Html.push('<li>')
    Html.push (`<li class="active"><div class="collapsible-header">
                    Paired Models
                </div>`);
    Html.push (`<div class="collapsible-body">
                    <span>${getModelData(data)}</span>
                </div>`);
    Html.push ('</li><li>')
    Html.push (`<div class="collapsible-header">
                    Paired Devices
                </div>`);
    Html.push (`<div class="collapsible-body">
                    <span>${getDeviceData(data)}</span>
                </div>`);
    Html.push ('</li><li>')
    Html.push (`<div class="collapsible-header">
                   Global Options
                </div>`);
    Html.push (`<div class="collapsible-body">
                    <span>${getGlobalOptionData(data)}</span>
                </div>`);
    Html.push ('</li>')
    Html.push (`</ul>`);
    $('#tab-overrides').html(Html.join(''));
    $('.collapsible').collapsible();
}

/////
//
// Section Cards
//
////

function getCard(dev) {
    if (!dev._id) return '';
    const title = dev.common.name,
        id = (dev._id ? dev._id : ''),
        type = (dev.common.type ? dev.common.type : 'unknown'),
        type_url = (dev.common.type ? sanitizeModelParameter(dev.common.type) : 'unknown'),
        img_src = dev.common.icon || dev.icon,
        rooms = [],
        isActive = (dev.common.deactivated ? false : true),
        lang = systemLang || 'en',
        ieee = id.replace(namespace + '.', ''),
        isDebug = checkDebugDevice(ieee);
    for (const r in dev.rooms) {
        if (dev.rooms[r].hasOwnProperty(lang)) {
            rooms.push(dev.rooms[r][lang]);
        } else {
            rooms.push(dev.rooms[r]);
        }
    }
    const paired = (dev.paired) ? '' : '<i class="material-icons right">leak_remove</i>';
    const rid = id.split('.').join('_');
    const modelUrl = (!type) ? '' : `<a href="https://www.zigbee2mqtt.io/devices/${type_url}.html" target="_blank" rel="noopener noreferrer">${type}</a>`;
    const groupInfo = dev.groupNames ? `<li><span class="labelinfo">groups:</span><span>${dev.groupNames || ''}</span></li>` : '';
    const roomInfo = rooms.length ? `<li><span class="labelinfo">rooms:</span><span>${rooms.join(',') || ''}</span></li>` : '';
    const image = `<img src="${img_src}" width="80px" onerror="this.onerror=null;this.src='img/unavailable.png';">`,
        nwk = (dev.info && dev.info.device) ? dev.info.device.nwk : undefined,
        battery_cls = (isActive ? getBatteryCls(dev.battery) : ''),
        lqi_cls = getLQICls(dev.link_quality),
        battery = (dev.battery && isActive) ? `<div class="col tool"><i id="${rid}_battery_icon" class="material-icons ${battery_cls}">battery_std</i><div id="${rid}_battery" class="center" style="font-size:0.7em">${dev.battery}</div></div>` : '',
        lq = (dev.link_quality > 0)
            ? `<div class="col tool"><i id="${rid}_link_quality_icon" class="material-icons ${lqi_cls}">network_check</i><div id="${rid}_link_quality" class="center" style="font-size:0.7em">${dev.link_quality}</div></div>`
            : `<div class="col tool"><i class="material-icons icon-black">leak_remove</i></div>`,
        status = (isActive ? lq : `<div class="col tool"><i class="material-icons icon-red">cancel</i></div>`),
        info = `<div style="min-height:88px; font-size: 0.8em" class="truncate">
                    <ul>
                        <li><span class="labelinfo">ieee:</span><span>0x${ieee}</span></li>
                        <li><span class="labelinfo">nwk:</span><span>${(nwk) ? nwk.toString() + ' (0x' + nwk.toString(16) + ')' : ''}</span></li>
                        <li><span class="labelinfo">model:</span><span>${modelUrl}</span></li>
                        ${groupInfo}
                        ${roomInfo}
                    </ul>
                </div>`,
        deactBtn = `<button name="swapactive" class="right btn-flat btn-small tooltipped" title="${(isActive ? 'Deactivate' : 'Activate')}"><i class="material-icons ${(isActive ? 'icon-green' : 'icon-red')}">power_settings_new</i></button>`,
        debugBtn = `<button name="swapdebug" class="right btn-flat btn-small tooltipped" title="${(isDebug > -1 ? (isDebug > 0) ?'Automatic by '+debugDevices[isDebug-1]: 'Disable Debug' : 'Enable Debug')}"><i class="material-icons icon-${(isDebug > -1 ? (isDebug > 0 ? 'orange' : 'green') : 'gray')}">bug_report</i></button>`,
        infoBtn = (nwk) ? `<button name="info" class="left btn-flat btn-small"><i class="material-icons icon-blue">info</i></button>` : '';

    const dashCard = getDashCard(dev);
    const card = `<div id="${id}" class="device">
                  <div class="card hoverable flipable  ${isActive ? '' : 'bg_red'}">
                    <div class="front face">${dashCard}</div>
                    <div class="back face">
                        <div class="card-content zcard">
                            <div class="flip" style="cursor: pointer">
                            <span class="top right small" style="border-radius: 50%">
                                ${battery}
                                <!--${lq}-->
                                ${status}
                            </span>
                            <!--/a--!>
                            <span id="dName" class="card-title truncate">${title}</span><!--${paired}--!>
                            </div>
                            <i class="left">${image}</i>
                            ${info}
                            <div class="footer right-align"></div>
                        </div>
                        <div class="card-action">
                            <div class="card-reveal-buttons">
                                ${infoBtn}

                                <span class="left fw_info"></span>
                                <button name="delete" class="right btn-flat btn-small tooltipped" title="Delete">
                                    <i class="material-icons icon-red">delete</i>
                                </button>
                                <button name="edit" class="right btn-flat btn-small tooltipped" title="Edit">
                                    <i class="material-icons icon-black">edit</i>
                                </button>
                                <button name="swapimage" class="right btn-flat btn-small tooltipped" title="Select Image">
                                    <i class="material-icons icon-black">image</i>
                                </button>
                                <button name="reconfigure" class="right btn-flat btn-small tooltipped" title="Reconfigure">
                                    <i class="material-icons icon-red">sync</i>
                                </button>
                                ${deactBtn}
                                ${debugBtn}
                            </div>
                        </div>
                    </div>
                  </div>
                </div>`;
    return card;
}

function getCoordinatorCard(dev) {
    const title = 'Zigbee Coordinator',
        id = dev && dev._id ? dev._id : '0x00000000',
        img_src = 'zigbee.png',
        rid = id.split('.').join('_'),
        image = `<img src="${img_src}" width="80px">`,
        paired = '',
        status = coordinatorinfo.autostart ? (dev ? `<div class="col tool"><i class="material-icons icon-green">check_circle</i></div>` : `<div class="col tool"><i class="material-icons icon-red">remove_circle</i></div>`) :  `<div class="col tool"><i class="material-icons icon-orange">pause_circle_filled</i></div>`,
        //status = dev ? `<div class="col tool"><i class="material-icons icon-green">check_circle</i></div>` : `<div class="col tool"><i class="material-icons icon-red">remove_circle</i></div>`,
        lqi_cls = dev ? getLQICls(dev.link_quality) : -1,
        lq = (dev && dev.link_quality) ? `<div class="col tool"><i id="${rid}_link_quality_icon" class="material-icons ${lqi_cls}">network_check</i><div id="${rid}_link_quality" class="center" style="font-size:0.7em">${dev.link_quality}</div></div>` : '',
        info = `<div style="min-height:88px; font-size: 0.8em" class="truncate">
                    <ul>
                        <li><span class="label">type:</span><span>${coordinatorinfo.type}</span></li>
                        <li><span class="label">version:</span><span>${coordinatorinfo.version}</span></li>
                        <li><span class="label">revision:</span><span>${coordinatorinfo.revision}</span></li>
                        <li><span class="label">port:</span><span>${coordinatorinfo.port}</span></li>
                        <li><span class="label">channel:</span><span>${coordinatorinfo.channel}</span></li>
                        <li><span class="label">------------</span><span>Software versions </span></li>
                        <li><span class="label">adapter:</span><span>${coordinatorinfo.installedVersion}</span></li>
                        <li><span class="label">installed from:</span><span>${coordinatorinfo.installSource}</span></li>
                        <li><span class="label">ZHC / ZH:</span><span>${coordinatorinfo.converters} / ${coordinatorinfo.herdsman}</span></li>
                    </ul>
                </div>`,
        permitJoinBtn = '<div class="col tool"><button name="joinCard" class="waves-effect btn-small btn-flat right hoverable green"><i class="material-icons icon-green">leak_add</i></button></div>',
        //permitJoinBtn = `<div class="col tool"><button name="join" class="btn-floating-sml waves-effect waves-light right hoverable green><i class="material-icons">leak_add</i></button></div>`,
        card = `<div id="${id}" class="device">
                  <div class="card hoverable">
                    <div class="card-content zcard">
                        <span class="top right small" style="border-radius: 50%">
                            ${lq}
                            ${status}
                            ${permitJoinBtn}
                        </span>
                        <!--/a--!>
                        <span id="dName" class="card-title truncate">${title}</span><!--${paired}--!>
                        <i class="left">${image}</i>
                        ${info}
                        <div class="footer right-align"></div>
                    </div>
                  </div>
                </div>`;
    return card;
}

function getGroupCard(dev) {
    const id = (dev._id ? dev._id : ''),
        title = dev.common.name,
        lq = '<div class="col tool"><i class="material-icons icon-green">check_circle</i></div>',
        rooms = [],
        numid = parseInt(id.replace(namespace + '.group_', '')),
        lang = systemLang || 'en';
    for (const r in dev.rooms) {
        if (dev.rooms[r].hasOwnProperty(lang)) {
            rooms.push(dev.rooms[r][lang]);
        } else {
            rooms.push(dev.rooms[r]);
        }
    }
    devGroups[numid] = dev;
    const roomInfo = rooms.length ? `<li><span class="labelinfo">rooms:</span><span>${rooms.join(',') || ''}</span></li>` : '';
    const room = rooms.join(',') || '&nbsp';
    let memberCount = 0;
    let info = `<div style="min-height:88px; font-size: 0.8em; overflow-y: auto" class="truncate">
                <ul>`;
    info = info.concat(`<li><span class="labelinfo">Group ${numid}</span></li>`);
    if (dev.memberinfo === undefined) {
        info = info.concat(`<li><span class="labelinfo">No devices in group</span></li>`);
    } else {
        for (let m = 0; m < dev.memberinfo.length; m++) {
            info = info.concat(`<li><span align:"left">${dev.memberinfo[m].device}.${dev.memberinfo[m].epid}</span><span align:"right"> ...${dev.memberinfo[m].ieee.slice(-4)}</span></li>`);
        }
        memberCount = (dev.memberinfo.length < 8 ? dev.memberinfo.length : 7);
    }
    ;
    info = info.concat(`              ${roomInfo}</ul>
                </div>`);
    const image = `<img src="${dev.common.icon}" width="64px" onerror="this.onerror=null;this.src='img/unavailable.png';">`;
    const dashCard = getDashCard(dev, dev.common.icon, memberCount > 0);
    const card = `<div id="${id}" class="device group">
                  <div class="card hoverable flipable">
                    <div class="front face">${dashCard}</div>
                    <div class="back face">
                        <div class="card-content zcard">
                            <div class="flip" style="cursor: pointer">
                            <span class="top right small" style="border-radius: 50%">
                                ${lq}
                            </span>
                            <!--/a--!>
                            <span id="dName" class="card-title truncate">${title}</span><!----!>
                            </div>
                            <i class="left">${image}</i>
                            ${info}

                            <div class="footer right-align"></div>
                        </div>
                        <div class="card-action">
                            <div class="card-reveal-buttons">
                                <button name="deletegrp" class="right btn-flat btn-small">
                                    <i class="material-icons icon-black">delete</i>
                                </button>
                                <button name="editgrp" class="right btn-flat btn-small">
                                    <i class="material-icons icon-green">edit</i>
                                </button>
                                <button name="swapimage" class="right btn-flat btn-small tooltipped" title="Edit">
                                    <i class="material-icons icon-black">image</i>
                                </button>
                            </div>
                        </div>
                    </div>
                  </div>
                </div>`;
    return card;
}

function getDeviceCards() {
    return $('#devices .device').not('.group');
}

function getDeviceCard(devId) {
    if (devId.startsWith('0x')) {
        devId = devId.substr(2, devId.length);
    }
    return $('#devices').find(`div[id='${namespace}.${devId}']`);
}

function getDashCard(dev, groupImage, groupstatus) {
    const title = dev.common.name,
        id = dev._id,
        type = dev.common.type,
        img_src = (groupImage ? groupImage : dev.common.icon || dev.icon),
        isActive = !dev.common.deactivated,
        rooms = [],
        lang = systemLang || 'en';
    const paired = (dev.paired) ? '' : '<i class="material-icons right">leak_remove</i>';
    const permitJoinBtn = dev.battery || dev.common.type == 'group' ? '' : `<div class="col tool"><button name="joinCard" class="waves-effect btn-small btn-flat right hoverable green"><i class="material-icons icon-green">leak_add</i></button></div>`;
    const device_queryBtn = dev.battery || dev.common.type == 'group' ? '' : `<div class="col tool"><button name="deviceQuery" class="waves-effect btn-small btn-flat right hoverable green"><i class="material-icons icon-green">play_for_work</i></button></div>`;
    const rid = id.split('.').join('_');
    const modelUrl = (!type) ? '' : `<a href="https://www.zigbee2mqtt.io/devices/${type}.html" target="_blank" rel="noopener noreferrer">${type}</a>`;
    const image = `<img src="${img_src}" width="64px" onerror="this.onerror=null;this.src='img/unavailable.png';">`,
        nwk = (dev.info && dev.info.device) ? dev.info.device.nwk : undefined,
        battery_cls = getBatteryCls(dev.battery),
        lqi_cls = getLQICls(dev.link_quality),
        unconnected_icon = (groupImage ? (groupstatus ? '<div class="col tool"><i class="material-icons icon-green">check_circle</i></div>' : '<div class="col tool"><i class="material-icons icon-red">cancel</i></div>') :'<div class="col tool"><i class="material-icons icon-red">leak_remove</i></div>'),
        battery = (dev.battery && isActive) ? `<div class="col tool"><i id="${rid}_battery_icon" class="material-icons ${battery_cls}">battery_std</i><div id="${rid}_battery" class="center" style="font-size:0.7em">${dev.battery}</div></div>` : '',
        lq = (dev.link_quality > 0 && isActive) ? `<div class="col tool"><i id="${rid}_link_quality_icon" class="material-icons ${lqi_cls}">network_check</i><div id="${rid}_link_quality" class="center" style="font-size:0.7em">${dev.link_quality}</div></div>` : (isActive ? unconnected_icon : ''),
        //status = (dev.link_quality > 0 && isActive) ? `<div class="col tool"><i class="material-icons icon-green">check_circle</i></div>` : (groupImage || !isActive ? '' : `<div class="col tool"><i class="material-icons icon-black">leak_remove</i></div>`),
        //infoBtn = (nwk) ? `<button name="info" class="left btn-flat btn-small"><i class="material-icons icon-blue">info</i></button>` : '',
        idleTime = (dev.link_quality_lc > 0 && isActive) ? `<div class="col tool"><i id="${rid}_link_quality_lc_icon" class="material-icons idletime">access_time</i><div id="${rid}_link_quality_lc" class="center" style="font-size:0.7em">${getIdleTime(dev.link_quality_lc)}</div></div>` : '';
    const info = (dev.statesDef) ? dev.statesDef.map((stateDef) => {
        const id = stateDef.id;
        const sid = id.split('.').join('_');
        let val = stateDef.val || '';
        if (stateDef.role === 'switch' && stateDef.write) {
            val = `<span class="switch"><label><input type="checkbox" ${(val) ? 'checked' : ''}><span class="lever"></span></label></span>`;
        } else if (stateDef.role === 'level.dimmer' && stateDef.write) {
            val = `<span class="range-field dash"><input type="range" min="0" max="100" ${(val != undefined) ? `value="${val}"` : ''} /></span>`;
        } else if (stateDef.role === 'level.color.temperature' && stateDef.write) {
            val = `<span class="range-field dash"><input type="range" min="150" max="500" ${(val != undefined) ? `value="${val}"` : ''} /></span>`;
        } else if (stateDef.type === 'boolean') {
            const disabled = (stateDef.write) ? '' : 'disabled="disabled"';
            val = `<label class="dash"><input type="checkbox" ${(val == true) ? 'checked=\'checked\'' : ''} ${disabled}/><span></span></label>`;
        } else if (stateDef.role === 'level.color.rgb') {
            const options = []
            for (const key of namedColors) {
                options.push(`<option value="${key}" ${val===key ? 'selected' : ''}>${key}</option>`);
            }
            val = `<select class="browser-default enum" style="color : white; background-color: grey; height: 16px; padding: 0; width: auto; display: inline-block">${options.join('')}</select>`;
        } else if (stateDef.states && stateDef.write) {
            let options;
            if (typeof stateDef.states == 'string') {
                const sts = stateDef.states.split(';');
                if (sts.length < 2) return '';
                options = sts.map((item) => {
                    const v = item.split(':');
                    return `<option value="${v[0]}" ${(val == v[0]) ? 'selected' : ''}>${v[1]}</option>`;
                });
            } else {
                options = [];
                for (const [key, value] of Object.entries(stateDef.states)) {
                    options.push(`<option value="${key}" ${(val == key) ? 'selected' : ''}>${key}</option>`);
                }
            }
            if (options.length < 2) return '';
            val = `<select class="browser-default enum" style="color : white; background-color: grey; height: 16px; padding: 0; width: auto; display: inline-block">${options.join('')}</select>`;
        } else if (stateDef.write) {
            return;
            // val = `<span class="input-field dash value"><input class="dash value" id="${stateDef.name}" value="${val}"></input></span>`;
        }
        else {
            val = `<span class="dash value">${val ? val : '(null)'} ${(stateDef.unit) ? stateDef.unit : ''}</span>`;
        }
        return `<li><span class="label dash truncate">${stateDef.name}</span><span id=${sid} oid=${id} class="state">${val}</span></li>`;
    }).join('') : '';
    const dashCard = `
        <div class="card-content zcard ${isActive ? '' : 'bg_red'}">
            <div style="cursor: pointer">
            <span class="top right small" style="border-radius: 50%">
                ${device_queryBtn}
                ${permitJoinBtn}
            </span>
            <div  class="flip">
            <span class="top right small" style="border-radius: 50%">
                ${idleTime}
                ${battery}
                ${lq}
            </span>
             <span class="card-title truncate">${title}</span>
            </div>
            </div>
            <i class="left">${image}</i>
            <div style="min-height:88px; font-size: 0.8em; height: 130px; width: 220px; overflow-y: auto" class="truncate">
                <ul>
                    ${(isActive ? info : 'Device deactivated')}
                </ul>
            </div>
            <div class="footer right-align"></div>
        </div>`;

    return dashCard;
}

function setDashStates(id, state) {
    const devId = getDevId(id);
    const dev = getDeviceByID(devId);
    if (dev) {
        const stateDef = dev.statesDef.find((stateDef) => stateDef.id == id);
        if (stateDef) {
            const sid = id.split('.').join('_');
            if (stateDef.role === 'switch' && stateDef.write) {
                $(`#${sid}`).find('input[type=\'checkbox\']').prop('checked', state.val);
            } else if (stateDef.role === 'level.dimmer' && stateDef.write) {
                $(`#${sid}`).find('input[type=\'range\']').prop('value', state.val);
            } else if (stateDef.role === 'level.color.temperature' && stateDef.write) {
                $(`#${sid}`).find('input[type=\'range\']').prop('value', state.val);
            } else if (stateDef.states && stateDef.write) {
                $(`#${sid}`).find(`select option[value=${state.val}]`).prop('selected', true);
            } else if (stateDef.type === 'boolean') {
                $(`#${sid}`).find('input[type=\'checkbox\']').prop('checked', state.val);
            } else {
                $(`#${sid}`).find('.value').text(`${state.val} ${(stateDef.unit) ? stateDef.unit : ''}`);
            }
        }
    }
}

function hookControls() {
    $('input[type=\'checkbox\']').change(function (event) {
        const val = $(this).is(':checked');
        const id = $(this).parents('.state').attr('oid');
        sendToWrapper(namespace, 'setState', {id: id, val: val}, function (data) {
        });
    });
    $('input[type=\'range\']').change(function (event) {
        const val = $(this).val();
        const id = $(this).parents('.state').attr('oid');
        sendToWrapper(namespace, 'setState', {id: id, val: val}, function (data) {
        });
    });
    $('.state select').on('change', function () {
        const val = $(this).val();
        const id = $(this).parents('.state').attr('oid');
        sendToWrapper(namespace, 'setState', {id: id, val: val}, function (data) {
        });
    });
}

function getIdleTime(value) {
    return (value) ? moment(new Date(value)).fromNow(true) : '';
}

function updateCardTimer() {
    if (devices) {
        devices.forEach((dev) => {
            const id = dev._id;
            if (id) {
                const rid = id.split('.').join('_');
                $(`#${rid}_link_quality_lc`).text(getIdleTime(dev.link_quality_lc));
            }
        });
    }
}

/*
function openReval(e, id, name){
    const $card = $(e.target).closest('.card');
    if ($card.data('initialOverflow') === undefined) {
        $card.data(
            'initialOverflow',
            $card.css('overflow') === undefined ? '' : $card.css('overflow')
        );
    }
    const $revealName = e.target.parentNode.name; // click on <i>, get parent <a>
    const $cardReveal = $card.find('.card-reveal[name="'+$revealName+'"]');

    if ($revealName == 'edit') {
        $cardReveal.find('input').val(name);
        Materialize.updateTextFields();
    }

    $card.css('overflow', 'hidden');
    $cardReveal.css({ display: 'block'});
    anime({
        targets: $cardReveal[0],
        translateY: '-100%',
        duration: 300,
        easing: 'easeInOutQuad'
    });
}
*/
function closeReval(e, id) {
    const $cardReveal = $(e.target).closest('.card-reveal');
    const $revealName = $cardReveal[0].getAttribute('name');
    if ($revealName == 'edit' && id) {
        const newName = $cardReveal.find('input').val();
        renameDevice(id, newName);
    }
    const $card = $(e.target).closest('.card');
    if ($card.data('initialOverflow') === undefined) {
        $card.data(
            'initialOverflow',
            $card.css('overflow') === undefined ? '' : $card.css('overflow')
        );
    }
    anime({
        targets: $cardReveal[0],
        translateY: 0,
        duration: 225,
        easing: 'easeInOutQuad',
        complete: function (anim) {
            const el = anim.animatables[0].target;
            $(el).css({display: 'none'});
            $card.css('overflow', $card.data('initialOverflow'));
        }
    });
}

function showDevInfo(id) {
    const info = genDevInfo(getDeviceByID(id));
    $('#devinfo').html(info);
    $('#modaldevinfo').modal('open');
}

////
//
// section Confirmations
//
////
function deleteConfirmation(id, name) {
    const text = translateWord('Do you really want to delete device') + ' "' + name + '" (' + id + ')?';
    $('#modaldelete').find('p').text(text);
    $('#force').prop('checked', false);
    $('#forcediv').removeClass('hide');
    $('#modaldelete a.btn[name=\'yes\']').unbind('click');
    $('#modaldelete a.btn[name=\'yes\']').click(() => {
        const force = $('#force').prop('checked');
        deleteZigbeeDevice(id, force);
    });
    $('#modaldelete').modal('open');
    Materialize.updateTextFields();
}

function deleteNvBackupConfirmation() {
    const text = translateWord('Do you really want to the NV Backup data ?');
    $('#modaldelete').find('p').text(text);
    $('#force').prop('checked', false);
    $('#forcediv').addClass('hide');
    $('#modaldelete a.btn[name=\'yes\']').unbind('click');
    $('#modaldelete a.btn[name=\'yes\']').click(() => {
        //const force = $('#force').prop('checked');
        showWaitingDialog('Attempting to delete nvBackup.json', 60000);
        sendToWrapper(namespace, 'deleteNVBackup', {}, function (msg) {
            closeWaitingDialog();
            if (msg) {
                if (msg.error) {
                    if (msg.error.includes('ENOENT')) showMessage('No nvRam backup available for deletion.', _('Error'))
                    else showMessage(msg.error, _('Error'));
                } else {
                    getDevices();
                }
            }
        });
    });
    $('#modaldelete').modal('open');
    Materialize.updateTextFields();
}


function cleanConfirmation() {
    const text = translateWord('Do you really want to remove orphaned states?');
    $('#modalclean').find('p').text(text);
    $('#cforce').prop('checked', false);
    $('#cforce').removeClass('hide');
    $('#cforcediv').removeClass('hide');
    $('#modalclean a.btn[name=\'yes\']').unbind('click');
    $('#modalclean a.btn[name=\'yes\']').click(() => {
        const force = $('#cforce').prop('checked');
        cleanDeviceStates(force);
    });
    $('#modalclean').modal('open');
    Materialize.updateTextFields();
}

function EndPointIDfromEndPoint(ep) {
    if (ep && ep.deviceIeeeAddress && ep.ID)
        return `${ep.deviceIeeeAddress}:${ep.ID}`;
    return 'unidentified';
}



function editName(id, name) {

    function updateGroupables(groupables) {
        const html = [];
        if (groupables && groupables.length > 0)
        {
            for (const groupable of groupables) {
                const k = groupable.ep.ID || -1;
                const n = groupable.epid != `unidentified` ? groupable.epid : `Endpoint ${k}`;
                html.push(`<div class="input-field suffix col s12 m12 l12"><select id="gk_${k}" class="materialSelect" multiple><option value="1">select</option><select><label for="gk_${k}">Group membership for ${n}</label></div>`);
            }
            $('#modaledit').find('.endpoints_for_groups').html(html.join(''));
            for (const groupable of groupables) {
                list2select(`#gk_${groupable.ep.ID || -1}`, groups, groupable.memberOf || []);
            }
        }
        return html;
    }


    const dev = devices.find((d) => d._id == id);
    $('#modaledit').find('input[id=\'d_name\']').val(name);
    const groupables = [];
    if (dev && dev.info && dev.info.endpoints) {
        for (const ep of dev.info.endpoints) {
            if (ep.input_clusters.includes(4)) {
                groupables.push({epid: EndPointIDfromEndPoint(ep), ep: ep, memberOf: []});
            }
        }
    }
    const numEP = groupables.length;

    updateGroupables(groupables);
    $('#modaledit a.btn[name=\'save\']').unbind('click');
    $('#modaledit a.btn[name=\'save\']').click(() => {
        const newName = $('#modaledit').find('input[id=\'d_name\']').val();
        const groupsById = {};
        if (groupables.length > 0) {
            for (const groupable of groupables) {
                const k = groupable.ep.ID || -1;
                const ng = $('#gk_' + k).val();
                if (ng.toString() != groupable.memberOf.toString())
                    groupsById[k] = GenerateGroupChange(groupable.memberOf, ng);
            }
        }
        updateDev(id, newName, groupsById);
    });
    $('#modaledit').modal('open');
    Materialize.updateTextFields();
}


////
//
//. section GroupFunctions
//
////
function GenerateGroupChange(oldmembers, newmembers) {
    const grpchng = [];
    for (const oldg of oldmembers)
        if (!newmembers.includes(oldg)) grpchng.push('-' + oldg);
    for (const newg of newmembers)
        if (!oldmembers.includes(newg)) grpchng.push(newg);
    return grpchng;
}

function deleteZigbeeDevice(id, force) {
    sendToWrapper(namespace, 'deleteZigbeeDevice', {id: id, force: force}, function (msg) {
        closeWaitingDialog();
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            } else {
                getDevices();
            }
        }
    });
    showWaitingDialog('Device is being removed', 10);
}


function cleanDeviceStates(force) {
    sendToWrapper(namespace, 'cleanDeviceStates', {force: force}, function (msg) {
        closeWaitingDialog();
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            } else {
                if (msg.stateList) {
                    //showMessage(msg.stateList.join('<p>'), 'State cleanup results');
                }
                getDevices();
            }
        }
    });
    showWaitingDialog('Orphaned states are being removed', 10);
}

function renameDevice(id, name) {
    showMessage('rename device with ' + id + ' and ' + name, _('Error'));
    sendToWrapper(namespace, 'renameDevice', {id: id, name: name}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            } else {
                getDevices();
            }
        }
    });
}

function showDevices() {
    let html = '';
    let hasCoordinator = false;
    const lang = systemLang || 'en';
    // sort by rooms
    devices.sort((a, b) => {
        const roomsA = [], roomsB = [];
        for (const r in a.rooms) {
            if (a.rooms[r].hasOwnProperty(lang)) {
                roomsA.push(a.rooms[r][lang]);
            } else {
                roomsA.push(a.rooms[r]);
            }
        }
        const nameA = roomsA.join(',');
        for (const r in b.rooms) {
            if (b.rooms[r].hasOwnProperty(lang)) {
                roomsB.push(b.rooms[r][lang]);
            } else {
                roomsB.push(b.rooms[r]);
            }
        }
        const nameB = roomsB.join(',');

        if (nameB < nameB) {
            return -1;
        }
        if (nameA > nameB) {
            return 1;
        }
        return 0;
    });
    for (let i = 0; i < devices.length; i++) {
        const d = devices[i];
        if (d.common && d.common.type == 'group') {
            const card = getGroupCard(d);
            html += card;
            continue;
        };
        if (d.info && d.info.device && d.info.device.type == 'Coordinator') {
            hasCoordinator=true;
            const card = getCoordinatorCard(d);
            html += card;
        } else {
            //if (d.groups && d.info && d.info.device.type == "Router") {
            if (d.groups) {
                //devGroups[d._id] = d.groups;
                if (typeof d.groups.map == 'function') {
                    d.groupNames = d.groups.map(item => {
                        return groups[item] || '';
                    }).join(', ');
                } else {
                    d.groupNames = '..';
                }
            }
            const card = getCard(d);
            html += card;
        }
    }
    if (!hasCoordinator) html += getCoordinatorCard();

    $('#devices').html(html);
    hookControls();

    // update rooms filter
    const allRooms = new Set(devices.map((item) => item.rooms).flat().map((room) => {
        if (room && room.hasOwnProperty(lang)) {
            return room[lang];
        } else {
            return room;
        }
    }).filter((item) => item != undefined));
    const roomSelector = $('#room-filter');
    roomSelector.empty();
    roomSelector.append(`<li class="device-order-item" data-type="All" tabindex="0"><a class="translate" data-lang="All">All</a></li>`);
    Array.from(allRooms)
        .sort()
        .forEach((item) => {
            roomSelector.append(`<li class="device-order-item" data-type="${item}" tabindex="0"><a class="translate" data-lang="${item}">${item}</a></li>`);
        });
    $('#room-filter a').click(function () {
        $('#room-filter-btn').text($(this).text());
        doFilter();
    });
    $('.flip').click(function () {
        const card = $(this).parents('.card');
        card.toggleClass('flipped');
    });
    $('#rotate_btn').click(function () {
        $('.card.flipable').toggleClass('flipped');
    });

    shuffleInstance = devices && devices.length ? new Shuffle($('#devices'), {
        itemSelector: '.device',
        sizer: '.js-shuffle-sizer',
    }) : undefined;
    doFilter();

    const getDevName = function (dev_block) {
        return dev_block.find('#dName').text();
    };
    const getDevId = function (dev_block) {
        return dev_block.attr('id');
    };
    $('.card-reveal-buttons button[name=\'delete\']').click(function () {
        const dev_block = $(this).parents('div.device');
        deleteConfirmation(getDevId(dev_block), getDevName(dev_block));
    });
    $('.card-reveal-buttons button[name=\'deletegrp\']').click(function () {
        const dev_block = $(this).parents('div.device');
        const id = dev_block.attr('id').replace(namespace + '.group_', '');
        deleteGroupConfirmation(id, getDevName(dev_block));
    });
    $('.card-reveal-buttons button[name=\'edit\']').click(function () {
        const dev_block = $(this).parents('div.device');
        const id = getDevId(dev_block);
        const name = getDevName(dev_block);
        editName(id, name);
    });
    $('.card-reveal-buttons button[name=\'swapdebug\']').click(function () {
        const dev_block = $(this).parents('div.device');
        const id = getDevId(dev_block);
        const name = getDevName(dev_block);
        toggleDebugDevice(id, name);
    });

    $('.card-reveal-buttons button[name=\'swapimage\']').click(function () {
        const dev_block = $(this).parents('div.device');
        const id = getDevId(dev_block);
        selectImageOverride(id);
    });

    $('.card-reveal-buttons button[name=\'editgrp\']').click(function () {
        const dev_block = $(this).parents('div.device');
        const id = dev_block.attr('id').replace(namespace + '.group_', '');
        const name = getDevName(dev_block);
        editGroup(id, name, false);
    });
    $('button[name=\'joinCard\']').click(function () {
        const dev_block = $(this).parents('div.device');
        if (!$('#pairing').hasClass('pulse')) {
            joinProcess(getDevId(dev_block));
        }
        showPairingProcess();
    });
    $('button[name=\'deviceQuery\']').click(function () {
        const dev_block = $(this).parents('div.device');
        sendTo(namespace, 'setState', {id: `${getDevId(dev_block)}.device_query`, val: true}, function (data) {
            //console.log(data);
        });    });
    $('#modalpairing a.btn[name=\'extendpairing\']').click(function () {
        openNetwork();
    });
    $('#modalpairing a.btn[name=\'endpairing\']').click(function () {
        stopPairing();
    });
    $('.card-reveal-buttons button[name=\'info\']').click(function () {
        const dev_block = $(this).parents('div.device');
        showDevInfo(getDevId(dev_block));
    });
    $('a.btn[name=\'done\']').click((e) => {
        const dev_block = $(this).parents('div.device');
        closeReval(e, getDevId(dev_block), getDevName(dev_block));
    });
    $('a.btn-flat[name=\'close\']').click((e) => {
        closeReval(e);
    });
    $('.card-reveal-buttons button[name=\'reconfigure\']').click(function () {
        const dev_block = $(this).parents('div.device');
        reconfigureConfirmation(getDevId(dev_block));
    });
    $('.card-reveal-buttons button[name=\'swapactive\']').click(function () {
        const dev_block = $(this).parents('div.device');
        swapActive(getDevId(dev_block));
    });

    showNetworkMap(devices, map);
    translateAll();
}

function downloadIcons() {
    sendToWrapper(namespace, 'downloadIcons', {}, function (msg) {
        if (msg && msg.msg) {
            showMessage(msg.msg, _('Result'));
        }
    });
}

function checkFwUpdate() {
    const deviceCards = getDeviceCards();
    const getFwInfoNode = function (deviceCard) {
        return deviceCard.find('.fw_info');
    };
    const createBtn = function (icon, hint, disabled, color) {
        const disabledAttr = disabled ? '[disabled]="true"' : '';
        if (!color) {
            color = !disabled ? 'icon-green' : '';
        }
        return `<button name="fw_update" class="left btn-flat btn-small" title="${hint}" ${disabledAttr}>
            <i class="material-icons ${color}">${icon}</i></button>`;
    };
    const callback = function (msg) {
        if (msg) {
            const deviceCard = getDeviceCard(msg.device);
            const fwInfoNode = getFwInfoNode(deviceCard);
            if (msg.status == 'available') {
                const devId = getDevId(deviceCard.attr('id'));
                fwInfoNode.html(createBtn('system_update', 'Click to start firmware update', false));
                $(fwInfoNode).find('button[name=\'fw_update\']').click(() => {
                    fwInfoNode.html(createBtn('check_circle', 'Firmware update started, check progress in logs.', true, 'icon-blue'));
                    sendToWrapper(namespace, 'startOta', {devId: devId}, (msg) => {
                        fwInfoNode.html(createBtn('check_circle', 'Finished, see logs.', true));
                    });
                });
            } else if (msg.status == 'not_available') {
                fwInfoNode.html(createBtn('check_circle', 'Up-to-date', true));
            } else if (msg.status == 'fail') {
                fwInfoNode.html(createBtn('check_circle', 'Firmware check failed, ' + msg.msg, true, 'icon-red'));
            } else {
                fwInfoNode.html(createBtn('not_interested', 'No firmware update available', true));
            }
        }
    };
    for (let i = 0; i < deviceCards.length; i++) {
        const deviceCard = $(deviceCards[i]);
        const devIdAttr = deviceCard.attr('id');
        if (!devIdAttr) {
            continue;
        }
        const devId = getDevId(devIdAttr);
        getFwInfoNode(deviceCard).html('<span class="left" style="padding-top:8px">checking...</span>');
        sendToWrapper(namespace, 'checkOtaAvail', {devId: devId}, callback);
    }
}

function letsPairingWithCode(code) {
    messages = [];
    sendToWrapper(namespace, 'letsPairing', {code: code, stop:false}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
        else {
            showPairingProcess();
        }
    });
}

function openNetwork() {
    messages = [];
    sendToWrapper(namespace, 'letsPairing', {stop:false}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
        else showPairingProcess();
    });
}

function stopPairing() {
    messages = [];
    sendToWrapper(namespace, 'letsPairing', {stop:true}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
    });
}

function touchlinkReset() {
    messages = [];
    sendToWrapper(namespace, 'touchlinkReset', {}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
    });
}

function joinProcess(devId) {
    messages = [];
    sendToWrapper(namespace, 'letsPairing', {id: devId, stop:false}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
    });
}

function getCoordinatorInfo() {
    sendToWrapper(namespace, 'getCoordinatorInfo', {}, function (msg) {
        if (msg) {
            if (msg.error) {
                errorData.push(msg.error);
                delete msg.error;
                isHerdsmanRunning = false;
            } else {
                isHerdsmanRunning = true;
            }
            coordinatorinfo = msg;
            updateStartButton()
        }
    });
}

function checkDebugDevice(id) {
    // returns: -1: debug not set
    // 0: debug set explicitly
    // > 0: debug set by pattern.
    if (!debugDevices) return -1;
    if (debugDevices.indexOf(id) > -1) return 0 // debug set
    for (const addressPart of debugDevices) {
        if (typeof id === 'string' && id.includes(addressPart)) {
            return debugDevices.indexOf(addressPart)+1; // debug set by pattern (>0)
        }
    }
    return -1;
}

async function toggleDebugDevice(id) {
    sendToWrapper(namespace, 'setDeviceDebug', {id:id}, function (msg) {
        sendToWrapper(namespace, 'getDebugDevices', {}, function(msg) {
            if (msg && typeof (msg.debugDevices == 'array')) {
                debugDevices = msg.debugDevices;
            }
            else
                debugDevices = [];
            showDevices();
        });
    });
}

function updateLocalConfigItems(device, data, global) {
    sendToWrapper(namespace, 'updateLocalConfigItems', {target: device, data:data, global:global}, function(msg) {
        if (msg && msg.hasOwnProperty.error) {
            showMessage(msg.error, _('Error'));
        }
        getDevices();
    });
}

async function selectImageOverride(id) {

    // start local functions
    function removeOption(k) {
        if (k && device_options.hasOwnProperty(k)) {
            if (dev.info.mapped && dev.info.mapped.options && dev.info.mapped.options.includes(device_options[k].key))
                availableOptions.push(device_options[k].key)
            delete device_options[k];
        }
    }

    function addOption() {
        let idx=1;
        let key = '';
        const optionName = $('#option_Selector').val();
        do {
            key = `o${idx++}`;
        }
        while (device_options.hasOwnProperty(key));
        device_options[key] = { key:optionName, value:''};
        idx = availableOptions.indexOf(optionName);
        if (idx > -1) availableOptions.splice(idx, 1);
    }

    function updateOptions(candidates) {
        if (candidates.length > 0) {
            $('#chooseimage').find('.new_options_available').removeClass('hide');
            list2select('#option_Selector', candidates, [], (key, val) => { return val; }, (key, val) => { return val; })
        }
        else {
            $('#chooseimage').find('.new_options_available').addClass('hide');
        }
        const html_options=[];

        for (const k of Object.keys(device_options)) {
            html_options.push(`<div class="row">`);
            html_options.push(`<div class="input-field suffix col s5 m5 l5"><input disabled id="option_key_${k}" type="text" class="value" /><label for="option_key_${k}">Option</label></div>`)
            html_options.push(`<div class="input-field suffix col s5 m5 l5"><input id="option_value_${k}" type="text" class="value" /><label for="option_value_${k}">Value</label></div>`)
            html_options.push(`<div class="col"><a id="option_rem_${k}" class="btn-large round red" ><i class="material-icons icon-red">remove_circle</i></a></div>`);
            html_options.push(`</div>`)
        }
        $('#chooseimage').find('.options_grid').html(html_options.join(''));
        if (html_options.length > 0) {
            for (const k of Object.keys(device_options)) {
                $(`#option_key_${k}`).val(device_options[k].key);
                $(`#option_value_${k}`).val(device_options[k].value);
                $(`#option_rem_${k}`).unbind('click');
                $(`#option_rem_${k}`).click(() => { removeOption(k); updateOptions(availableOptions) });
            }
        }
    }

    function getOptionsFromUI(_do, _so) {
        const _no = {};
        let changed = false;
        for (const k of Object.keys(_do)) {
            const key =  $(`#option_key_${k}`).val();
            _do[k].key = key;
            const val = $(`#option_value_${k}`).val();
            try {
                _do[k].value = JSON.parse(val);
            }
            catch {
                _do[k].value = val;
            }
            if (device_options[k].key.length > 0) {
                _no[key] = device_options[k].value;
                changed |= _no[key] != _so[key];
            }
        }
        changed |= (Object.keys(_no).length != Object.keys(_so).length);
        console.warn(`${changed} : ${JSON.stringify(_do)} - ${JSON.stringify(_no)}`)
        if (changed) return _no;
        return undefined;
    }

    function updateImageSelection(dev, imagedata) {
        const default_icon = (dev.common.type === 'group' ? dev.common.modelIcon : `img/${dev.common.type.replace(/\//g, '-')}.png`);
        if (dev.legacyIcon) imagedata.unshift( { file:dev.legacyIcon, name:'legacy', data:dev.legacyIcon});
        imagedata.unshift( { file:'none', name:'default', data:default_icon});
        imagedata.unshift( { file:'current', name:'current', data:dev.common.icon || dev.icon});

        list2select('#images', imagedata, selectItems,
            function (key, image) {
                return image.name
            },
            function (key, image) {
                return image.file;
            },
            function (key, image) {
                if (image.isBase64) {
                    return `data-icon="data:image/png; base64, ${image.data}"`;
                } else {
                    return `data-icon="${image.data}"`;
                }
            },
        );

    }
    // end local functions
    const device_options = {};
    const received_options = {};

    const dev = devices.find((d) => d._id == id);
    const availableOptions = (dev.info.mapped ? dev.info.mapped.options.slice() || []:[]);
    const imghtml = `<img src="${dev.common.icon || dev.icon}" width="80px">`
    //console.error(imghtml)
    const selectItems= [''];
    $('#chooseimage').find('input[id=\'d_name\']').val(dev.common.name);
    $('#chooseimage').find('.currentIcon').html(imghtml);
    $('#option_add_1084').unbind('click');
    $('#option_add_1084').click(() => {
        getOptionsFromUI(device_options, received_options);
        addOption();
        updateOptions(availableOptions)
    });



    sendToWrapper(namespace, 'getLocalImages', {}, function(msg) {
        if (msg && msg.imageData) {
            updateImageSelection(dev, msg.imageData);

            $('#chooseimage a.btn[name=\'save\']').unbind('click');
            $('#chooseimage a.btn[name=\'save\']').click(() => {
                const image = $('#chooseimage').find('#images option:selected').val();
                const global = $('#chooseimage').find('#globaloverride').prop('checked');
                const name = $('#chooseimage').find('input[id=\'d_name\']').val();
                const data = {};
                if (image != 'current') data.icon= image;
                if (name != dev.common.name) data.name = name;
                data.options = getOptionsFromUI(device_options, received_options)

                updateLocalConfigItems(id, data, global);
            });
            sendToWrapper(namespace, 'getLocalConfigItems', { target:id, global:false, key:'options' }, function (msg) {
                if (msg) {
                    if (msg.error) showMessage(msg.error, '_Error');
                    Object.keys(device_options).forEach(key => delete device_options[key]);
                    Object.keys(received_options).forEach(key => delete received_options[key]);
                    if (typeof msg.options === 'object') {
                        let cnt = 1;
                        for (const key in msg.options)
                        {
                            const idx = availableOptions.indexOf(key);
                            console.warn(`key ${key} : index : ${idx}`);
                            if (idx > -1) availableOptions.splice(idx,1);
                            received_options[key]=msg.options[key];
                            device_options[`o${cnt}`] = { key:key, value:msg.options[key]}
                            cnt++;
                        }
                    }
                    updateOptions(availableOptions);
                } else showMessage('callback without message');
                $('#chooseimage').modal('open');
                Materialize.updateTextFields();
            });
        }
    });

}

function safestring(val) {
    const t = typeof val;
    if (t==='object') return JSON.stringify(val).replaceAll(',',', ');
    if (t==='string') return val.replaceAll(',',', ');
    if (t==='function') return 'function';
    return val;
}

////
//
//. section DebugUI
//
////
function fne(item) {
    const rv = [];
    if (item.flags) {
        if (item.flags.includes('SUCCESS')) rv.push('SUCCESS');
        else rv.push(...item.flags);
    }
    if (item.errors && item.errors.length > 0) {
        if (item.errors.length > 1) rv.push('errors: '+item.errors.join(','));
        else rv.push('error: '+item.errors[0]);
    }
    return rv.join(', ');
}

function HtmlFromInDebugMessages(messages, devID, filter) {
    const Html = [];
    const filterSet = new Set();
    let isodd = true;
    const buttonList = [];
    if (dbgMsghide.has('i_'+devID)) {
        console.warn('in all filtered out')
        Html.push('&nbsp;')
    } else for (const item of messages) {
        if (item.states.length > 0) {
            const rowspan = item.states.length > 1 ? ` rowspan="${item.states.length}"` : '';
            let idx = item.states.length;
            const IHtml = [];
            let fs = '';
            for (const state of item.states) {
                fs = fs+state.id+'.'+fne(item);
                const redText = (item.errors && item.errors.length > 0 ? ' id="dbgred"' : '');
                idx--;
                const LHtml = [(`<tr id="${isodd ? 'dbgrowodd' : 'dbgroweven'}">`)];
                if (idx==0) {
                    const msgbutton = `<a id="lx_${item.dataID}" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Messages from ${new Date(item.dataID).toLocaleTimeString()}"><i class="material-icons large">speaker_notes</i></a>`
                    buttonList.push(item.dataID)
                    LHtml.push(`<td${rowspan}>${msgbutton}</td><td${rowspan}>${safestring(item.payload)}</td>`);
                }
                LHtml.push(`<td></td><td${redText}>${safestring(state.payload)}</td><td${redText}>${state.id}</td><td${redText}>${state.value}</td><td${redText}>${fne(item)}</td></tr>`);
                IHtml.unshift(...LHtml)
            }
            if (filter)
                if (filterSet.has(fs)) continue; else filterSet.add(fs);
            Html.unshift(...IHtml);
            isodd=!isodd;
        }
    }
    const ifbutton = `<a id="i_${devID}" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Filter debug messages"><i class="material-icons large">${dbgMsgfilter.has('i_'+devID) ? 'filter_list' : 'format_align_justify' }</i></a>`
    const ofbutton = `<a id="hi_${devID}" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Hide debug messages"><i class="material-icons large">${dbgMsghide.has('i_'+devID) ? 'unfold_more' : 'unfold_less' }</i></a>`
    const dataHide = dbgMsgfilter.has('hi_'+devID) ? 'Data hidden' : '&nbsp;';
    return {html:`<thead id="dbgtable"><tr><td>&nbsp</td><td>Incoming messages</td><td>&nbsp;</td><td>&nbsp;</td><td>${dataHide}</td><td>${ifbutton}</td><td>${ofbutton}</td></tr><tr><td>ID</td><td>Zigbee Payload</td><td>&nbsp;</td><td>State Payload</td><td>ID</td><td>value</td><td>Flags</td></tr></thead><tbody>${Html.join('')}</tbody>`, buttonList };
}

function HtmlFromOutDebugMessages(messages, devID, filter) {
    const Html = [];
    const filterSet = new Set();
    let isodd=true;
    const buttonList = [];
    if (dbgMsghide.has('o_'+devID)) {
        console.warn('out all filtered out')
        Html.push('&nbsp;')
    }
    else for (const item of messages) {
        if (item.states.length > 0) {
            const rowspan = item.states.length > 1 ? ` rowspan="${item.states.length}"` : '';
            let idx = item.states.length;
            let fs = '';
            const IHtml = [];
            for (const state of item.states) {
                fs = fs+state.id+'.'+fne(item);
                const redText = (item.errors && item.errors.length > 0 ? ' id="dbgred"' : '');
                const LHtml = [(`<tr id="${isodd ? 'dbgrowodd' : 'dbgroweven'}">`)];
                idx--;
                if (idx==0) {
                    const msgbutton = `<a id="lx_${item.dataID}" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Messages from ${new Date(item.dataID).toLocaleTimeString()}"><i class="material-icons large">speaker_notes</i></a>`
                    LHtml.push(`<td${rowspan}>${msgbutton}</td><td${rowspan}>${safestring(item.payload)}</td>`);
                    buttonList.push(item.dataID)
                }
                LHtml.push(`<td${redText}>${state.ep ? state.ep : ''}</td><td${redText}>${state.id}</td><td${redText}>${safestring(state.value)}</td><td${redText}>${safestring(state.payload)}</td><td${redText}>${fne(item)}</td></tr>`);
                IHtml.unshift(...LHtml);

            }
            if (filter)
                if (filterSet.has(fs)) continue; else filterSet.add(fs);
            Html.unshift(...IHtml);
            isodd=!isodd;
        }
    }
    const ifbutton = `<a id="o_${devID}" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Filter debug messages"><i class="material-icons large">${dbgMsgfilter.has('o_'+devID) ? 'filter_list' : 'format_align_justify' }</i></a>`
    const ofbutton = `<a id="ho_${devID}" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Hide debug messages"><i class="material-icons large">${dbgMsghide.has('o_'+devID) ? 'unfold_more' : 'unfold_less'}</i></a>`
    const dataHide = dbgMsgfilter.has('ho_'+devID) ? 'Data hidden' : '&nbsp;';
    return { html:`<thead id="dbgtable"><tr><td>&nbsp</td><td>Outgoing messages</td><td>&nbsp;</td><td>&nbsp;</td><td>${dataHide}</td><td>${ifbutton}</td><td>${ofbutton}</td></tr><tr><td>ID</td><td>Zigbee Payload</td><td>EP</td><td>ID</td><td>value</td><td>State Payload</td><td>Flags</td></tr></thead><tbody>${Html.join('')}</tbody>`, buttonList};
}

function displayDebugMessages(msg) {
    const buttonNames = [];
    const idButtons = [];
    if (msg.byId) {
        const dbgData = msg.byId;
        const keys = Object.keys(dbgData);
        const keylength = keys.length;
        const Html = [];
        const button = `<a id="e_all" class="btn-floating waves-effect waves-light green tooltipped center-align hoverable translateT" title="Update debug messages"><i class="material-icons large">sync_problem</i></a>`;
        const dbutton = `<a id="d_all" class="btn-floating waves-effect waves-light red tooltipped center-align hoverable translateT" title="Delete debug messages"><i class="material-icons icon-yellowlarge">delete_forever</i></a>`;
        const fbutton = `<a id="f_all" class="btn-floating waves-effect waves-light green tooltipped center-align hoverable translateT" title="Filter debug messages"><i class="material-icons large">${dbgMsgfilter.size != 0 ? 'filter_list' : 'format_align_justify' }</i></a>`;
        const hbutton = `<a id="h_all" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Hide debug messages"><i class="material-icons large">${dbgMsghide.size != 0 ? 'unfold_more' : 'unfold_less'}</i></a>`;
        const logbutton = `<a id="l_all" class="btn-floating waves-effect waves-light ${debugInLog ? 'green' : 'red'} tooltipped center-align hoverable translateT" title="Log messages"><i class="material-icons large">${debugInLog ? 'speaker_notes' : 'speaker_notes_off'}</i></a>`;
        Html.push(`<li><table><thead id="dbgtable"><tr><td>${logbutton}</td><td colspan="3">Debug information by device</td><td>${fbutton}</td><td>${hbutton}</td><td>${button}</td><td>${dbutton}</td></tr></thead><tbody>`);
        if (!keylength) {
            Html.push('<tr><td></td><td>No debug data loaded - press reload to refresh</td><td></td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table></li>')
            $('#dbg_data_list').html(Html.join(''));
        }
        else {
            Html.push('</tbody></table></li>')
            for (const devID of Object.keys(dbgData)) {
                const dev = devices.find((d) => d._id.endsWith(devID.slice(-16)));
                if (!dev) continue;
                const type_url = (dev && dev.common && dev.common.type ? sanitizeModelParameter(dev.common.type) : 'unknown');
                const image = `<img src="${dev.common.icon || dev.icon}" width="40px" onerror="this.onerror=null;this.src='img/unavailable.png';">`
                const modelUrl = (type_url === 'unknown') ? 'unknown' : `<a href="https://www.zigbee2mqtt.io/devices/${type_url}.html" target="_blank" rel="noopener noreferrer">${image}</a>`;
                const devName = (dev && dev.common && dev.common.name) ? dev.common.name : 'unnamed';
                const button = `<a id="e_${devID}" class="btn-floating waves-effect waves-light green tooltipped center-align hoverable translateT" title="Update debug messages"><i class="material-icons large">sync_problem</i></a>`
                const dbutton = `<a id="d_${devID}" class="btn-floating waves-effect waves-light red tooltipped center-align hoverable translateT" title="Update debug messages"><i class="material-icons icon-yellow large">delete_forever</i></a>`;
                buttonNames.push(devID);
                Html.push(`<li><table><thead id="dbgtable"><tr><td colspan="4">${devName} (ID: ${devID} Model: ${dev && dev.common ? dev.common.name : 'unknown'})</td><td>${modelUrl}</td><td>${button}</td><td>${dbutton}</td></tr></thead><tbody>`);
                if (dbgData[devID].IN.length > 0) {
                    const indata = HtmlFromInDebugMessages(dbgData[devID].IN, devID, dbgMsgfilter.has('i_'+devID));
                    Html.push(`${indata.html}`);
                    idButtons.push(...indata.buttonList)
                }
                if (dbgData[devID].OUT.length > 0) {
                    const outdata = HtmlFromOutDebugMessages(dbgData[devID].OUT, devID, dbgMsgfilter.has('o_'+devID));
                    Html.push(`${outdata.html}`);
                    idButtons.push(...outdata.buttonList)
                }
                Html.push('</tbody></table></li>');
            }
            $('#dbg_data_list').html(Html.join(''));
        }
        $(`#e_all`).click(function () {
            getDebugMessages(false);
        });
        $(`#d_all`).click(function () {
            getDebugMessages(true, 'all');
        });
        $(`#l_all`).click(function () {
            debugInLog = !debugInLog;
            getDebugMessages();
        });
        $(`#f_all`).click(function () {
            if (dbgMsgfilter.size > 0) {
                dbgMsgfilter.clear();
            }
            else {
                for (const item of Object.keys(msg.byId)) {
                    dbgMsgfilter.add(`o_${item}`)
                    dbgMsgfilter.add(`i_${item}`)
                }
            }
            displayDebugMessages(debugMessages);
        });
        $(`#h_all`).click(function () {
            if (dbgMsghide.size > 0) {
                dbgMsghide.clear();
            }
            else {
                for (const item of Object.keys(msg.byId)) {
                    dbgMsghide.add(`o_${item}`)
                    dbgMsghide.add(`i_${item}`)
                }
            }
            displayDebugMessages(debugMessages);
        });
        for (const b of buttonNames) {
            $(`#e_${b}`).click(function () {
                getDebugMessages(false);
            });
            $(`#d_${b}`).click(function () {
                getDebugMessages(true, b);
            });
            $(`#o_${b}`).click(function () {
                if (dbgMsgfilter.has(`o_${b}`)) dbgMsgfilter.delete(`o_${b}`); else dbgMsgfilter.add(`o_${b}`);
                displayDebugMessages(debugMessages);
            });
            $(`#i_${b}`).click(function () {
                if (dbgMsgfilter.has(`i_${b}`)) dbgMsgfilter.delete(`i_${b}`); else dbgMsgfilter.add(`i_${b}`);
                displayDebugMessages(debugMessages);
            });
            $(`#ho_${b}`).click(function () {
                if (dbgMsghide.has(`o_${b}`)) dbgMsghide.delete(`o_${b}`); else dbgMsghide.add(`o_${b}`);
                displayDebugMessages(debugMessages);
            });
            $(`#hi_${b}`).click(function () {
                if (dbgMsghide.has(`i_${b}`)) dbgMsghide.delete(`i_${b}`); else dbgMsghide.add(`i_${b}`);
                displayDebugMessages(debugMessages);
            });
        }
        for (const b of idButtons) {
            $(`#lx_${b}`).click(function() { showMessageList(b)});
        }
    }
}

function showNamedMessages(messages, title, icon, timestamp) {
    // noinspection JSJQueryEfficiency
    let $dialogMessage = $('#dialog-message');
    if (!$dialogMessage.length) {
        $('body').append(
            '<div class="m"><div id="dialog-message" class="modal modal-fixed-footer">' +
            '    <div class="modal-content">' +
            '        <h6 class="dialog-title title"></h6>' +
            '        <p><i class="large material-icons dialog-icon"></i><span class="dialog-text"></span></p>' +
            '    </div>' +
            '    <div class="modal-footer">' +
            '        <a class="modal-action modal-close waves-effect waves-green btn-flat translate">Ok</a>' +
            '    </div>' +
            '</div></div>');
        $dialogMessage = $('#dialog-message');
    }
    if (icon) {
        $dialogMessage.find('.dialog-icon')
            .show()
            .html(icon);
    } else {
        $dialogMessage.find('.dialog-icon').hide();
    }
    if (title) {
        $dialogMessage.find('.dialog-title').html(title).show();
    } else {
        $dialogMessage.find('.dialog-title').hide();
    }
    const lihtml = ['```<br><ul>'];
    for (const key of Object.keys(messages)) {
        lihtml.push(`<li>${key}: ${messages[key]}</li>`)
    }
    lihtml.push('</ul><br>```')
    $dialogMessage.find('.dialog-text').html(lihtml);
    $dialogMessage.modal().modal('open');

}

function showMessageList(msgId) {
    for (const devId of Object.keys(debugMessages.byId)) {
        for (const id of debugMessages.byId[devId].IN) {
            if (id.dataID == msgId) {
                showNamedMessages(id.messages, `Messages from ${new Date(msgId).toLocaleTimeString()} for device ${devId}`);
                return;
            }
        }
        for (const id of debugMessages.byId[devId].OUT) {
            if (id.dataID == msgId) {
                showNamedMessages(id.messages, `Messages from ${new Date(msgId).toLocaleTimeString()} for device ${devId}`);
                return;
            }
        }
    }
}

function getDebugMessages(deleteBeforeRead, deleteSelected) {
    sendToWrapper(namespace, 'getDebugMessages', { inlog: debugInLog, del:deleteBeforeRead ? deleteSelected : '' }, function(msg) {
        debugMessages = msg;
        if (msg) displayDebugMessages(debugMessages)
    })
}

////
//
//. section getDataFromAdapter
//
////
function getDevices() {
    function sendForData() {
        sendToWrapper(namespace, 'getCoordinatorInfo', {}, function (msg) {
            if (msg) {
                if (msg.error) {
                    errorData.push(msg.error);
                    delete msg.error;
                    isHerdsmanRunning = false;
                } else {
                    isHerdsmanRunning = true;
                }
                coordinatorinfo = msg;
                updateStartButton()
            }
            sendToWrapper(namespace, 'getDevices', {}, function (msg) {
                if (msg) {
                    devices = msg.devices ? msg.devices : [];
                    // check if stashed error messages are sent alongside
                    if (msg.clean)
                        $('#state_cleanup_btn').removeClass('hide');
                    else
                        $('#state_cleanup_btn').addClass('hide');
                    if (msg.errors && msg.errors.length > 0) {
                        $('#show_errors_btn').removeClass('hide');
                        errorData = msg.errors;
                    }
                    else {
                        $('#show_errors_btn').addClass('hide');
                    }
                    let newDebugMessages = false;

                    //check if debug messages are sent alongside
                    if (msg && typeof (msg.debugDevices == 'array')) {
                        debugDevices = msg.debugDevices;
                    }
                    else
                        debugDevices = [];
                    if (debugMessages.byId) {
                        newDebugMessages = true;
                        debugMessages.byId = msg;
                        if (msg) displayDebugMessages(debugMessages)
                    }
                    lockout.isActive = false;
                    if (msg.error) {
                        errorData.push(msg.error);
                        isHerdsmanRunning = false;
                        updateStartButton();
                        showDevices();
                    } else {
                        isHerdsmanRunning = true;
                        updateStartButton();
                        showDevices();
                        if (!newDebugMessages) {
                            getDebugMessages();
                        }
                        //getExclude();
                        getBinding();
                    }
                    UpdateAdapterAlive(true)
                }
            });
        });
    }

    if (lockout.timeoutid) {
        clearTimeout(lockout.timeoutid);
    }

    setTimeout(() => {
        lockout.isActive = true;
        lockout.timeoutid = undefined;
        sendForData();
    }, 100);

}

function getNamedColors() {
    sendToWrapper(namespace, 'getNamedColors', {}, function(msg) {
        if (msg && typeof msg.colors) {
            namedColors = msg.colors;
        }
    });
}


function getMap(rebuild) {
    $('#refresh').addClass('disabled');
    if (isHerdsmanRunning) {
        sendToWrapper(namespace, 'getMap', { forcebuild:rebuild}, function (msg) {
            $('#refresh').removeClass('disabled');
            if (msg) {
                if (msg.error) {
                    errorData.push(msg.error);
                    isHerdsmanRunning = false;
                    updateStartButton();
                } else {
                    isHerdsmanRunning = true;
                    updateStartButton();
                    if (msg.errors.length > 0 && $('#errorCollectionOn').is(':checked')) {
                        showMessage(msg.errors.join('<p>'), 'Map generation messages');
                    }
                    map = msg;
                    showNetworkMap(devices, map);
                }
            }
        });
    }
    else showMessage('Unable to generate map, the zigbee subsystem is inactive', 'Map generation error');
}




// the function loadSettings has to exist ...

function load(settings, onChange) {
    function getRandomExtPanID()
    {
        const bytes = [];
        for (let i = 0;i<16;i++) {
            bytes.push(Math.floor(Math.random() * 16).toString(16));
        }
        return bytes.join('');
    }

    function getRandomChannel()
    {
        const channels = [11,15,20,25]
        return channels[Math.floor(Math.random() * 4)];
    }

    if (settings.extPanID === undefined || settings.extPanID == '') {
        settings.channel = getRandomChannel();
    }
    if (settings.panID === undefined || settings.panID == 0) {
        settings.panID = Math.floor(Math.random() * 10000);
    }
    if (settings.extPanID === undefined || settings.extPanID == '') {
        settings.extPanID = getRandomExtPanID();
    }
    // fix for previous wrong value
    if (settings.extPanID === 'DDDDDDDDDDDDDDD') {
        settings.extPanID = 'DDDDDDDDDDDDDDDD';
    }

    if (settings.precfgkey === undefined) {
        settings.precfgkey = '01030507090B0D0F00020406080A0C0D';
    }
    if (settings.disablePing === undefined) {
        settings.disablePing = false;
    }
    if (settings.warnOnDeviceAnnouncement === undefined) {
        settings.warnOnDeviceAnnouncement = true;
    }
    if (settings.baudRate === undefined) {
        settings.baudRate = 115200;
    }
    if (settings.autostart === undefined) settings.autostart = false;
    if (typeof settings.pingCluster != 'string') settings.pingCluster = settings.disablePing ? 'off' : 'default';

    // example: select elements with id=key and class=value and insert value
    for (const key in settings) {
        if (savedSettings.indexOf(key) === -1) {
            continue;
        }
        // example: select elements with id=key and class=value and insert value
        const value = $('#' + key + '.value');
        if (value.attr('type') === 'checkbox') {
            value.prop('checked', settings[key]).change(function () {
                onChange();
                validateNVRamBackup(false, key)
            });
        } else {
            value.val(settings[key]).change(function () {
                onChange();
                validateNVRamBackup(false, key)
            }).keyup(function () {
                $(this).trigger('change');
            });
        }
    }

    getComPorts(onChange);

    //dialog = new MatDialog({EndingTop: '50%'});
    const keepAliveHandle = startKeepalive();
    keepAlive(() => {
        getDevices();
        getNamedColors();
        readNVRamBackup(false);
        sendToWrapper(namespace, 'getGroups', {}, function (data) {
            groups = data.groups || {};
        //showGroups();
    });
        showLocalData();
    })

    //getDebugMessages();
    //getMap();
    //addCard();

    // Signal to admin, that no changes yet
    onChange(false);

    $('#test-btn').click(function () {
        if (!isHerdsmanRunning) {
            const port = $('#port.value').val();
            showWaitingDialog(`Trying to connect to ${port}`, 300);
            sendToWrapper(namespace, 'testConnection', { address:port }, function(msg) {
                closeWaitingDialog();
                if (msg) {
                    if (msg.error) {
                        showMessage(msg.error, _('Error'));
                    }
                }
            })
        }
        else {
            showMessage('function unavailable while herdsman is running', _('Error'))
        }
    });

    $('#readNVRam-btn').click(function() {
        readNVRamBackup(true);
    })
    // test start commands
    $('#show_test_run').click(function () {
        doTestStart(!isHerdsmanRunning);
    });

    $('#state_cleanup_btn').click(function () {
        cleanConfirmation();
    });
    $('#show_errors_btn').click(function () {
        showMessage(errorData.join('<br>'), 'Stashed error messages');
    });
    $('#download_icons_btn').click(function () {
        showMessage(downloadIcons());
    });
    $('#fw_check_btn').click(function () {
        checkFwUpdate();
    });
    $('#touchlink_btn').click(function () {
        touchlinkReset();
        showPairingProcess();
    });
    $('#pairing').click(function () {
        if (!$('#pairing').hasClass('pulse')) {
            openNetwork();
        } else showPairingProcess();
    });

    $('#refresh').click(function () {
        getMap(false);
    });
    $('#regenerate').click(function () {
        getMap(true);
        $('#modalviewconfig').modal('close');
    });

    $('#reset-btn').click(function () {
        resetConfirmation();
    });

    $('#deleteNVRam-btn').click(function () {
        deleteNvBackupConfirmation();
    });

    $('#ErrorNotificationBtn').click(function () {
        if (!isHerdsmanRunning) {
            doTestStart(!isHerdsmanRunning, true);
        }
    })

    $('#viewconfig').click(function () {
        showViewConfig();
    });

    $('#scan').click(function () {
        showChannels();
    });
    $('#scan_t').click(function () {
        showChannels();
    });


    $('#add_group').click(function () {
        const maxind = parseInt(Object.getOwnPropertyNames(groups || {}).reduce((a, b) => a > b ? a : b, 0));
        addGroup(maxind + 1, 'Group ' + maxind + 1);
    });

    $('#add_grp_btn').click(function () {
        const maxind = parseInt(Object.getOwnPropertyNames(groups || {}).reduce((a, b) => a > b ? a : b, 0));
        addGroup(maxind + 1, 'Group ' + maxind + 1);
    });

    $('#code_pairing').click(function () {
        if (!$('#pairing').hasClass('pulse')) {
            $('#codeentry a.btn[name=\'pair\']').click(() => {
                const code = $('#codeentry').find('input[id=\'qr_code\']').val();
                letsPairingWithCode(code)
            });
            $('#codeentry').modal('open');
        }
    });

    $('#hardware').click(function() {
        validateNVRamBackup(false);
    });

    $(document).ready(function () {
        $('.modal').modal({
            startingTop: '30%',
            endingTop: '10%',
        });
        $('.dropdown-trigger').dropdown({constrainWidth: false});
        Materialize.updateTextFields();
        $('.collapsible').collapsible();

        Materialize.Tabs.init($('.tabs'));
        $('#device-search').keyup(function (event) {
            doFilter(event.target.value.toLowerCase());
        });
        $('#device-order a').click(function () {
            $('#device-order-btn').text($(this).text());
            doSort();
        });
        $('#device-filter a').click(function () {
            $('#device-filter-btn').text($(this).text());
            doFilter();
        });
    });

    const text = $('#pairing').attr('data-tooltip');
    const transText = translateWord(text);
    if (transText) {
        $('#pairing').attr('data-tooltip', transText);
    }

    $('ul.tabs').on('click', 'a', function (e) {
        if ($(e.target).attr('id') == 'tabmap') {
            redrawMap();
        }
        if ($(e.target).attr('id') == 'develop') {
            loadDeveloperTab(onChange);
        }
    });

    $('#add_exclude').click(function () {
        addExcludeDialog();
    });

    $('#add_binding').click(function () {
        addBindingDialog();
    });

    sendToWrapper(namespace, 'getLibData', {key: 'cidList'}, function (data) {
        cidList = data.list;
    });
}

function showMessages() {
    let data = '';
    for (const ind in messages) {
        const mess = messages[ind];
        data = mess + '\n' + data;
    }
    $('#stdout').text(data);
    $('#stdout_t').text(messages.join('\n'));
}

function showPairingProcess(noextrabuttons) {
    if (isHerdsmanRunning) $('#modalpairing').modal({
        startingTop: '4%',
        endingTop: '10%',
        dismissible: false
    });

    if (noextrabuttons) {
        $('#modalpairing').find('.endpairing').addClass('hide');
        $('#modalpairing').find('.extendpairing').addClass('hide');
    }
    else {
        $('#modalpairing').find('.endpairing').removeClass('hide');
        $('#modalpairing').find('.extendpairing').removeClass('hide');
    }

    $('#modalpairing').modal('open');
    Materialize.updateTextFields();
}

function doTestStart(start, interactive) {
    updateStartButton(true);
    if (start) {
        const ovr = interactive ? {} : { extPanID:$('#extPanID.value').val(),
            panID: $('#PanID.value').val(),
            channel: $('#channel.value').val(),
            port: $('#port.value').val(),
            adapterType: $('#adapterType.value').val(),
            baudRate: $('#baudRate.value').val(),
            precfgkey: $('#precfgkey.value').val(),
            flowCTRL: $('#flowCTRL.value').prop('checked')
        };
        // $('#testStartStart').addClass('disabled');
        messages = [];
        if (interactive) showPairingProcess(true)

        //    showWaitingDialog('Trying to start the zigbee subsystem manually', 120);
        sendToWrapper(namespace, 'testConnect', { start:true, zigbeeOptions:ovr }, function(msg) {
            if (msg) {
                closeWaitingDialog();
                updateStartButton(false);
                if (msg.status)
                    $('#testStartStop').removeClass('disabled');
                else {
                    //showMessage(`The zigbee subsystem is not running. Please ensure that the configuration is correct. ${msg.error ? 'Error on start-Attempt ' + msg.error.message : ''}`);
                    $('#testStartStart').removeClass('disabled');
                }
            }
        })
    }
    else {
        //$('#testStartStop').addClass('disabled');
        sendToWrapper(namespace, 'testConnect', { start:false }, function(msg) {
            if (msg) {
                if (msg.status) $('#testStartStart').removeClass('disabled');
                else $('#testStartStop').removeClass('disabled');
            }
        })

    }
}

// ... and the function save has to exist.
// you have to make sure the callback is called with the settings object as first param!

function save(callback) {
    const obj = {};
    $('.value').each(function () {
        const $this = $(this);
        if (savedSettings.indexOf($this.attr('id')) === -1) return;
        if ($this.hasClass('validate') && $this.hasClass('invalid')) {
            showMessage('Invalid input for ' + $this.attr('id'), _('Error'));
            return;
        }
        if ($this.attr('type') === 'checkbox') {
            obj[$this.attr('id')] = $this.prop('checked');
        } else {
            obj[$this.attr('id')] = $this.val();
        }
    });
    callback(obj);
}


function getDevId(adapterDevId) {
    return adapterDevId.split('.').slice(0, 3).join('.');
}


function updateStartButton(block) {
    if (block) {
        $('#show_test_run').addClass('disabled');
        $('#reset-btn').addClass('disabled');
        $('#deleteNVRam-btn').addClass('disabled');
        $('#ErrorNotificationBtn').removeClass('hide')
        $('#ErrorNotificationBtn').removeClass('blinking')
        $('#ErrorNotificationBtn').removeClass('red')
        $('#ErrorNotificationBtn').addClass('orange')
        return;
    }
    if (isHerdsmanRunning)
    {
        $('#ErrorNotificationBtn').addClass('hide')
        $('#ErrorNotificationBtn').removeClass('blinking');
        $('#show_test_run').removeClass('disabled');
        $('#deleteNVRam-btn').removeClass('disabled');
        $('#reset-btn').removeClass('disabled');
        $('#fw_check_btn').removeClass('hide');
        $('#add_grp_btn').removeClass('hide');
        $('#touchlink_btn').removeClass('hide');
        $('#code_pairing').removeClass('hide');
        //$('#pairing').removeClass('hide');
    }
    else {
        $('#ErrorNotificationBtn').addClass('red')
        $('#ErrorNotificationBtn').removeClass('orange')
        $('#ErrorNotificationBtn').removeClass('hide')
        $('#ErrorNotificationBtn').addClass('blinking');
        $('#show_test_run').removeClass('disabled');
        $('#deleteNVRam-btn').removeClass('disabled');
        $('#reset-btn').addClass('disabled');
        $('#fw_check_btn').addClass('hide');
        $('#add_grp_btn').addClass('hide');
        $('#touchlink_btn').addClass('hide');
        $('#code_pairing').addClass('hide');
        //$('#pairing').addClass('hide');
    }
}
// subscribe to changes
socket.emit('subscribe', namespace + '.*');
socket.emit('subscribeObjects', namespace + '.*');

// react to changes
socket.on('stateChange', function (id, state) {
    // only watch our own states
    if (id.substring(0, namespaceLen) !== namespace) return;
    if (state) {
        if (id.match(/\.info\.pairingMode$/)) {
            if (state.val) {
                $('#pairing').addClass('pulse');
            } else {
                $('#pairing').removeClass('pulse');
            }
        } else if (id.match(/\.info\.pairingCountdown$/)) {
            const blank_btn = '<i class="material-icons">leak_add</i>';
            if (state.val == 0) {
                $('#pairing').html(blank_btn);
                $('#progress_line').css('width', `0%`);
            } else {
                $('#pairing').addClass('pulse');
                $('#pairing').html(state.val);
                const percent = 100 - 100 * state.val / ($('#countDown').val() || 60);
                $('#progress_line').css('width', `${percent}%`);
            }
        } else if (id.match(/\.info\.pairingMessage$/)) {
            if (state.val == 'NewDebugMessage') {
                getDebugMessages();
            }
            else {
                messages.push(state.val);
                showMessages();
                if (state.val.startsWith('Zigbee-Herdsman started successfully')) {
                    isHerdsmanRunning = true;
                    updateStartButton();
                }
                if (state.val.startsWith('herdsman stopped') || state.val.startsWith('Error herdsman')) {
                    isHerdsmanRunning = false;
                    updateStartButton();
                }
            }
        } else {
            const devId = getDevId(id);
            putEventToNode(devId);
            const rid = id.split('.').join('_');
            if (id.match(/\.link_quality$/)) {
                // update link_quality
                $(`#${rid}_icon`).removeClass('icon-red icon-orange').addClass(getLQICls(state.val));
                $(`#${rid}`).text(state.val);
                const dev = getDeviceByID(devId);
                if (dev) {
                    dev.link_quality_lc = state.lc;
                }
            }
            if (id.match(/\.battery$/)) {
                // update battery
                $(`#${rid}_icon`).removeClass('icon-red icon-orange').addClass(getBatteryCls(state.val));
                $(`#${rid}`).text(state.val);
            }
            // set other states
            setDashStates(id, state);
        }
    }
});


socket.on('objectChange', function (id, obj) {
    if (id.substring(0, namespaceLen) !== namespace) return;
    if (obj && obj.type == 'device') { // && obj.common.type !== 'group') {
        updateDevice(id);
    }
    if (!obj) {
        // delete state or device
        const elems = id.split('.');
        if (elems.length === 3) {
            removeDevice(id);
            showDevices();
        }
    }
});

/*
socket.emit('getObject', 'system.config', function (err, res) {
    if (!err && res && res.common) {
        systemLang = res.common.language || systemLang;
        systemConfig = res;
    }
});
*/

function putEventToNode(devId) {
    if (network) {
        const nodesArray = Object.values(network.body.data.nodes._data);
        const node = nodesArray.find((node) => {
            return node.id == devId;
        });
        if (node) {
            const exists = networkEvents.find((event) => {
                return event.node == node.id;
            });
            if (!exists) {
                networkEvents.push({node: node.id, radius: 0, forward: true});
                // } else {
                //     exists.radius = 0;
                //     exists.forward = true;
            }
        }
    }
}

function showNetworkMap(devices, map) {
    // create an object with nodes
    const nodes = {};
    // create an array with edges
    const edges = [];

    if (map.lqis == undefined || map.lqis.length === 0) { // first init
        $('#filterParent, #filterSibl, #filterPrvChild, #filterMesh, #physicsOn').change(function () {
            updateMapFilter();
        });
    }

    const createNode = function (dev, mapEntry) {
        if (dev.common && (dev.common.type == 'group' || dev.common.deactivated)) return undefined;
        const extInfo = (mapEntry && mapEntry.networkAddress) ? `\n (nwkAddr: 0x${mapEntry.networkAddress.toString(16)} | ${mapEntry.networkAddress})` : '';
        const t = dev._id.replace(namespace + '.', '');
        const node = {
            id: dev._id,
            label: (dev.link_quality > 0 ? dev.common.name : `${dev.common.name}\n(disconnected)`),
            title: `${t} ${extInfo}`,
            shape: 'circularImage',
            image: dev.common.icon || dev.icon,
            imagePadding: {top: 5, bottom: 5, left: 5, right: 5},
            color: {background: '#cccccc', highlight: {background: 'white'}},
            font: {color: '#00bb00'},
            borderWidth: 1,
            borderWidthSelected: 4,
        };
        if (dev.common && dev.common.type === 'Coordinator') {
            // node.shape = 'star';
            node.image = 'zigbee.png';
            node.label = 'Coordinator';
            // delete node.color;
        }
        console.warn(`node for device ${JSON.stringify(node)}`)
        return node;
    };

    if (map.lqis) {
        map.lqis.forEach((mapEntry) => {
            const dev = getDeviceByIEEE(mapEntry.ieeeAddr);
            if (!dev) {
                return;
            }

            let node;
            if (!nodes.hasOwnProperty(mapEntry.ieeeAddr)) { // add node only once
                node = createNode(dev, mapEntry);
                if (node) {
                    nodes[mapEntry.ieeeAddr] = node;
                }
            } else {
                node = nodes[mapEntry.ieeeAddr];
            }
            if (node) {
                const parentDev = getDeviceByIEEE(mapEntry.parent);
                const to = parentDev ? parentDev._id : undefined;
                const from = dev._id;
                let label = mapEntry.lqi.toString();
                let linkColor = '#0000ff';
                let edge = edges.find((edge) => {
                    return (edge.to == to && edge.from == from);
                });
                const reverse = edges.find((edge) => {
                    return (edge.to == from && edge.from == to);
                });

                if (mapEntry.relationship === 0 || mapEntry.relationship === 1) { // 0 - parent, 1 - child
                    // // parent/child
                    if (mapEntry.status !== 'online') {
                        label = label + ' (off)';
                        linkColor = '#660000';
                    }
                    if (mapEntry.lqi < 10) {
                        linkColor = '#ff0000';
                    }
                } else if (mapEntry.relationship === 2) { // sibling
                    linkColor = '#00bb00';
                } else if (mapEntry.relationship === 3 && !reverse) { // unknown
                    linkColor = '#aaaaff';
                } else if (mapEntry.relationship === 4) { // previous child
                    linkColor = '#555555';
                }
                if (reverse) {
                    // update reverse edge
                    edge = reverse;
                    edge.label += '\n' + label;
                    edge.arrows.from = {enabled: false, scaleFactor: 0.5}; // start hidden if node is not selected
                    if (mapEntry.relationship == 1) { //
                        edge.color.color = linkColor;
                        edge.color.highlight = linkColor;
                    }
                } else if (!edge) {
                    edge = {
                        from: from,
                        to: to,
                        label: label,
                        font: {
                            align: 'middle',
                            size: 0, // start hidden
                            color: linkColor
                        },
                        arrows: {to: {enabled: false, scaleFactor: 0.5}},
                        //arrowStrikethrough: false,
                        color: {
                            color: linkColor,
                            opacity: 0, // start hidden
                            highlight: linkColor
                        },
                        chosen: {
                            edge: (values) => {
                                values.opacity = 1.0;
                                values.toArrow = true; // always existing
                                values.fromArrow = values.fromArrowScale != 1 ? true : false; // simplified, arrow existing if scale is not default value
                            },
                            label: () => {
                                // see onMapSelect workaround
                                //                        values.size = 10;
                            }
                        },
                        selectionWidth: 0,
                        physics: mapEntry.relationship === 1 ? true : false,
                        relationship: mapEntry.relationship
                    };
                    edges.push(edge);
                }
            }
        });
    }
    /*
    if (map.routing) {
        map.routing.forEach((route)=>{
            if (!route.nextHop) return;
            const routeSource = getDeviceByNetwork(route.nextHop);
            const routeDest = getDeviceByNetwork(route.destination);
            if (routeSource && routeDest) {
                const to = routeDest._id;
                const from = routeSource._id;
                const label = route.status;
                const linkColor = '#ff55ff';
                const edge = {
                    from: from,
                    to: to,
                    label: label,
                    font: {
                        align: 'middle',
                        size: 0, // start hidden
                        color: linkColor
                    },
                    arrows: { to: { enabled: false, scaleFactor: 0.5 }},
                    //arrowStrikethrough: false,
                    color: {
                        color: linkColor,
                        //opacity: 0, // start hidden
                        highlight: linkColor
                    },
                    dashes: true,
                    chosen: {
                        edge: (values) => {
                            values.opacity = 1.0;
                            values.toArrow = true; // always existing
                            values.fromArrow = values.fromArrowScale != 1 ? true : false; // simplified, arrow existing if scale is not default value
                        },
                        label: () => {
                        // see onMapSelect workaround
                            //                        values.size = 10;
                        }
                    },
                    selectionWidth: 0,
                    physics: false,
                };
                edges.push(edge);
            }
        });
    }
    */

    const nodesArray = Object.values(nodes);
    // add devices without network links to map
    devices.forEach((dev) => {
        const node = nodesArray.find((node) => {
            return node.id == dev._id;
        });
        if (!node) {
            const node = createNode(dev);

            if (node) {
                node.font = {color: '#ff0000'};
                if (dev.info && dev.info.device && dev.info.device.type == 'Coordinator') {
                    node.font = {color: '#00ff00'};
                }
                nodesArray.push(node);
            }
        }
    });

    // create a network
    const container = document.getElementById('map');
    mapEdges = new vis.DataSet(edges);
    const data = {
        nodes: nodesArray,
        edges: mapEdges
    };

    network = new vis.Network(container, data, networkOptions);

    const onMapSelect = function (event) {
        // workaround for https://github.com/almende/vis/issues/4112
        // may be moved to edge.chosen.label if fixed
        function doSelection(select, edges, data) {
            edges.forEach((edgeId => {
                const id = (typeof edgeId === 'string') ? edgeId : edgeId.id;
                const options = data.edges._data.get(id);
                if (select) {
                    options.font.size = 15;
                } else {
                    options.font.size = 0;
                }
                network.clustering.updateEdge(id, options);
            }));
        }

        if (event.hasOwnProperty('previousSelection')) { // unselect previous selected
            doSelection(false, event.previousSelection.edges, this.body.data);
        }
        doSelection(true, event.edges, this.body.data);
        /*
        if (event.nodes) {
            event.nodes.forEach((node)=>{
                //const options = network.clustering.findNode[node];
                 network.clustering.updateClusteredNode(
                    node, {size: 50}
                );
            });
        }
        */
    };
    network.on('selectNode', onMapSelect);
    network.on('deselectNode', onMapSelect);
    redrawMap();
    updateMapFilter();


    // functions to animate:
    networkEvents = [];
    setInterval(updateFrameTimer, 60);

    function updateFrameTimer() {
        if (networkEvents.length > 0) {
            network.redraw();
            const toDelete = [];
            networkEvents.forEach((event, index) => {
                if (event.radius >= 1) {
                    toDelete.push(index);
                } else {
                    event.radius += 0.08;
                }
            });
            toDelete.forEach((index) => {
                networkEvents.splice(index, 1);
            });
        }
    }

    network.on('beforeDrawing', function (ctx) {
        if (networkEvents.length > 0) {
            networkEvents.forEach((event) => {
                const inode = event.node;
                const nodePosition = network.getPositions();
                event.radius = (event.radius > 1) ? 1 : event.radius;
                const cap = Math.cos(event.radius * Math.PI / 2);
                const colorCircle = `rgba(0, 255, 255, ${cap.toFixed(2)})`;
                const colorBorder = `rgba(0, 255, 255, ${cap.toFixed(2)})`;
                ctx.strokeStyle = colorCircle;
                ctx.fillStyle = colorBorder;
                const radius = Math.abs(100 * Math.sin(event.radius));
                ctx.circle(nodePosition[inode].x, nodePosition[inode].y, radius);
                ctx.fill();
                ctx.stroke();
            });
        }
    });
}

function redrawMap() {
    if (network != undefined && devices.length > 0) {
        const width = ($('.adapter-body').width() || $('#main').width()) - 20,
            height = ($('.adapter-body').height() || ($('#main').height())) - 120;
        network.setSize(width, height);
        network.redraw();
        network.fit();
        network.moveTo({offset: {x: 0.5 * width, y: 0.5 * height}});
    }
}

function updateMapFilter() {
    if (mapEdges == null) {
        return;
    }
    const showParent = $('#filterParent').is(':checked');
    const showSibl = $('#filterSibl').is(':checked');
    const showPrvChild = $('#filterPrvChild').is(':checked');
    const invisColor = $('#filterMesh').is(':checked') ? 0.2 : 0;
    networkOptions.physics.enabled = $('#physicsOn').is(':checked');
    network.setOptions(networkOptions);
    mapEdges.forEach((edge) => {
        if (((edge.relationship === 0 || edge.relationship === 1) && showParent)
            || (edge.relationship === 2 && showSibl)
            || (edge.relationship === 3 && showParent) // ignore relationship "unknown"
            || (edge.relationship === 4 && showPrvChild)) {
            edge.color.opacity = 1.0;
        } else {
            edge.color.opacity = invisColor;
        }
        mapEdges.update(edge);
    });
}

function getComPorts(onChange) {
    // timeout = setTimeout(function () {
    //     getComPorts(onChange);
    // }, 2000);
    sendToWrapper(namespace, 'listUart', null, function (list) {
        // if (timeout) {
        //     clearTimeout(timeout);
        //     timeout = null;
        // }
        // if (!list || !list.length) {
        //     setTimeout(function () {
        //         getComPorts(onChange);
        //     }, 1000);
        //     return;
        // }
        if (!list) {
            return;
        }
        const element = $('#ports');
        for (let j = 0; j < list.length; j++) {
            element.append('<li><a href="#!" data-value="' + list[j].comName + '">' + list[j].comName + (list[j].label ? (' [' + list[j].label + ']') : '') + '</a></li>');
        }
        $('#ports a').click(function () {
            $('#port').val($(this).data('value'));
            Materialize.updateTextFields();
            onChange();
        });
    });
}

function loadDeveloperTab() {
    // fill device selector
    updateSelect('#dev', devices,
        function (key, device) {
            if (device.hasOwnProperty('info')) {
                if (device.info.device && device.info.device.type === 'Coordinator') {
                    return null;
                }
                if (device.common.type === 'group') return null;
                return `${device.common.name} (${device.info.device.ieee})`;
            } else { // fallback if device in list but not paired
                return device.common.name + ' ' + device.native.id;
            }
        },
        function (key, device) {
            return device.native.id;
        });
    /*
        const groupList = [];
        for (const key in groups) {
            groupList.push({
                id: namespace + '.' + key.toString(16).padStart(16, '0'),
                groupId: key,
                groupName: groups[key]
            });
        }
        updateSelect('#dev', groupList,
            function (key, device) {
                return 'Group ' + device.groupId + ': ' + device.groupName;
            },
            function (key, device) {
                return device.id;
            }, true);

        // fill cid, cmd, type selector
    */
    populateSelector('#cid', 'cidList');
    populateSelector('#cmd', 'cmdListFoundation', this.value);
    populateSelector('#type', 'typeList', this.value);

    if (responseCodes == false) {
        const getValue = function () { // convert to number if needed
            let attrData = $('#value-input').val();
            if (attrData.startsWith('"') && attrData.endsWith('"')) {
                attrData = attrData.substr(1, attrData.length - 2);
            } else {
                const numValue = Number(attrData);
                attrData = !isNaN(numValue) ? numValue : attrData;
            }
            return attrData;
        };
        const prepareData = function () {
            const data = {
                devId: $('#dev-selector option:selected').val(),
                ep: $('#ep-selector option:selected').val(),
                cid: $('#cid-selector option:selected').val(),
                cmd: $('#cmd-selector option:selected').val(),
                cmdType: $('#cmd-type-selector').val(),
                zclData: {
                    [$('#attrid-selector').val()]: {},
                },
                cfg: null,
            };
            if ($('#value-needed').is(':checked')) {
                data.zclData[$('#attrid-selector').val()] = getValue();
            }
            return data;
        };

        const prepareExpertData = function () {
            try {
                return JSON.parse($('#expert-json').val());
            } catch (exception) {
                showDevRunInfo('JSON error', exception, 'yellow');
            }
        };
        const setExpertData = function (prop, value, removeIfEmpty = true) {
            if (!$('#expert-mode').is(':checked')) {
                return;
            }
            if (!removeIfEmpty && value == null) {
                value = '';
            }
            let data;
            if (prop) {
                data = prepareExpertData();
                // https://stackoverflow.com/a/6394168/6937282
                const assignVal = function index(obj, is, value) {
                    if (typeof is == 'string') {
                        return index(obj, is.split('.'), value);
                    } else if (is.length === 1 && value !== undefined) {
                        if (value == null) {
                            return delete obj[is[0]];
                        } else {
                            return obj[is[0]] = value;
                        }
                    } else if (!is.length) {
                        return obj;
                    } else {
                        return index(obj[is[0]], is.slice(1), value);
                    }
                };
                assignVal(data, prop, value);
            } else {
                data = prepareData();
            }
            $('#expert-json').val(JSON.stringify(data, null, 4));
        };

        // init event listener only at first load
        $('#dev-selector').change(function () {
            if (this.selectedIndex <= 0) {
                return;
            }

            const device = devices.find(obj => {
                return this.value ===obj.native.id;
            });

            const epList = device ? device.info.endpoints : null;
            updateSelect('#ep', epList,
                function (key, ep) {
                    return ep.ID;
                },
                function (key, ep) {
                    return ep.ID;
                });
            setExpertData('devId', this.value);
            setExpertData('ep', $('#ep-selector').val(), false);
        });

        $('#ep-selector').change(function () {
            setExpertData('ep', this.value);
        });

        $('#cid-selector').change(function () {
            populateSelector('#attrid', 'attrIdList', this.value);
            if ($('#cmd-type-selector').val() === 'functional') {
                const cid = $('#cid-selector option:selected').val();
                populateSelector('#cmd', 'cmdListFunctional', cid);
            }
            setExpertData('cid', this.value);
        });

        $('#cmd-type-selector').change(function () {
            if (this.value === 'foundation') {
                populateSelector('#cmd', 'cmdListFoundation');
            } else if (this.value === 'functional') {
                const cid = $('#cid-selector option:selected').val();
                populateSelector('#cmd', 'cmdListFunctional', cid);
            }
            setExpertData('cmdType', this.value);
        });

        $('#cmd-selector').change(function () {
            setExpertData('cmd', this.value);
        });
        $('#attrid-selector').change(function () {
            setExpertData('zclData', {[this.value]: {}});
        });

        // value selector checkbox
        $('#value-needed').change(function () {
            const attr = $('#attrid-selector').val();
            let attrData = null;
            if (this.checked === true) {
                $('#value-input').removeAttr('disabled');
                attrData = getValue();
            } else {
                $('#value-input').attr('disabled', 'disabled');
            }
            setExpertData('zclData.' + attr, attrData);
            $('#type-selector').select();
            Materialize.updateTextFields();
        });

        $('#value-input').keyup(function () {
            const attr = $('#attrid-selector').val();
            setExpertData('zclData.' + attr, getValue());
        });

        $('#expert-mode').change(function () {
            if (this.checked === true) {
                setExpertData();
                $('#expert-json-box').css('display', 'inline-block');
            } else {
                $('#expert-json-box').css('display', 'none');
            }
            $('#type-selector').select();
            Materialize.updateTextFields();
        });

        $('#dev-send-btn').click(function () {
            let data;
            if ($('#expert-mode').is(':checked')) {
                data = prepareExpertData();
            } else {
                data = prepareData();
            }
            sendToZigbee(data.devId, data.ep, data.cid, data.cmd, data.cmdType, data.zclData, data.cfg, function (reply) {
                console.log('Send to Zigbee replied with ' + JSON.stringify(reply));
                if (reply.hasOwnProperty('localErr')) {
                    showDevRunInfo(reply.localErr, reply.errMsg, 'yellow');
                } else if (reply.hasOwnProperty('localStatus')) {
                    showDevRunInfo(reply.localErr, reply.errMsg);
                } else {
                    addDevLog(reply);
                    showDevRunInfo('OK', 'Finished.');
                }
            });
        });
    }

    responseCodes = null;
    // load list of response codes
    sendToWrapper(namespace, 'getLibData', {key: 'respCodes'}, function (data) {
        responseCodes = data.list;
    });
}

/**
 * Sends data to zigbee device. May be used for read/write actions that do not
 * need to be implemented as state objects
 *
 * @param {string} id - like 'zigbee.0.001234567890'
 * @param ep
 * @param cid
 * @param cmd
 * @param {string}
 *            cmdType - 'foundation' or 'functional'
 * @param {Object}
 *            zclData - may contain zclData.attrId, ...
 * @param {?Object} cfg - e.g. { "manufCode": 0000, "manufSpec": 1} or null (default settings)
 * @param {Object}
 *            callback - called with argument 'reply'. If reply.localErr or localStatus exists,
 *            the reply was created on local frontend, not by adapter (e.g.
 *            timeout)
 * @returns
 */
function sendToZigbee(id, ep, cid, cmd, cmdType, zclData, cfg, callback) {
    if (!id) {
        if (callback) {
            callback({localErr: 'Incomplete', errMsg: 'Please select Device and Endpoint!'});
        }
        return;
    }
    if (!cid || !cmd || !cmdType) {
        if (callback) {
            callback({
                localErr: 'Incomplete',
                errMsg: 'Please choose ClusterId, Command, CommandType and AttributeId!'
            });
        }
        return;
    }
    const data = {id: id, ep: ep, cid: cid, cmd: cmd, cmdType: cmdType, zclData: zclData, cfg: cfg};
    if (callback) {
        callback({localStatus: 'Send', errMsg: 'Waiting for reply...'});
    }

    const sendTimeout = setTimeout(function () {
        if (callback) {
            callback({localErr: 'Timeout', errMsg: 'We did not receive any response.'});
        }
    }, 15000);

    console.log('Send to zigbee, id ' + id + ',ep ' + ep + ', cid ' + cid + ', cmd ' + cmd + ', cmdType ' + cmdType + ', zclData ' + JSON.stringify(zclData));

    sendToWrapper(namespace, 'sendToZigbee', data, function (reply) {
        clearTimeout(sendTimeout);
        if (callback) {
            callback(reply);
        }
    });
}

/**
 * Short feedback message next to run button
 */
function showDevRunInfo(result, text, level) {
    const card = $('#devActResult');
    if (level === 'yellow') {
        card.removeClass('white-text').addClass('yellow-text');
    } else {
        card.removeClass('yellow-text').addClass('white-text');
    }
    $('#devActResult').text(result);
    $('#devInfoMsg').text(text);
}

function addDevLog(reply) {
    const statusCode = reply.statusCode;
    let logHtml = '<span>' + JSON.stringify(reply.msg) + '</span><br>';
    if (responseCodes != undefined) {
        const status = Object.keys(responseCodes).find(key => responseCodes[key] === statusCode);
        if (statusCode == 0) {
            logHtml = '<span class="green-text">' + status + '</span>   ' + logHtml;
        } else {
            logHtml = '<span class="yellow-text">' + status + '</span>   ' + logHtml;
        }
    }
    const logView = $('#dev_result_log');
    logView.append(logHtml);
    logView.scrollTop(logView.prop('scrollHeight'));
}

/**
 * Query adapter and update select with result
 */
function populateSelector(selectId, key, cid) {
    $(selectId + '>option:enabled').remove(); // remove existing elements
    $(selectId).select();
    if (cid == '-2') {
        updateSelect(selectId, null);
        return;
    }
    sendToWrapper(namespace, 'getLibData', {key: key, cid: cid}, function (data) {
        const list = data.list;
        if (key === 'attrIdList') {
            updateSelect(selectId, list,
                (attrName, attr) => {
                    return attrName + ' (' + attr.ID + ', type ' + attr.type + ')';
                },
                (attrName) => {
                    return attrName;
                });
        } else if (key === 'typeList') {
            updateSelect(selectId, list,
                (name, val) => {
                    return name + ' (' + val + ')';
                },
                (name, val) => {
                    return val;
                });
        } else {
            updateSelect(selectId, list,
                (propName, propInfo) => {
                    return propName + ' (' + propInfo.ID + ')';
                },
                (propName) => {
                    return propName;
                });
        }
    });
}

function updateSelect(id, list, getText, getId, append = false) {
    const selectId = id + '-selector';
    const mySelect = $(selectId);
    if (!append) {
        $(selectId + '>:not(:first[disabled])').remove(); // remove existing elements, except first if disabled, (is 'Select...' info)
        mySelect.select();
    }
    if (list == null && !append) {
        const infoOption = new Option('Nothing available');
        infoOption.disabled = true;
        mySelect.append(infoOption);
    } else {
        const keys = Object.keys(list); // is index in case of array
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const item = list[key];
            const optionText = getText(key, item);
            if (optionText == null) {
                continue;
            }
            mySelect.append(new Option(optionText, getId(key, item)));
        }
    }

    if ($(id + '-c-input').length > 0) {
        mySelect.append(new Option('CUSTOM', -2));
    }
    // update select element (Materialize)
    mySelect.select();
}

function list2select(selector, list, selected, getText, getKey, getData) {
    const element = $(selector);
    element.empty();
    for (const j in list) {
        if (list.hasOwnProperty(j)) {
            const optionKey = (getKey) ? getKey(j, list[j]) : j;
            if (optionKey == null) continue;
            const cls = (selected.indexOf(optionKey) >= 0) ? ' selected' : '';
            const optionText = (getText) ? getText(j, list[j]) : list[j];
            if (optionText == null) continue;
            const optionData = (getData) ? getData(j, list[j]) : '';
            element.append(`<option value="${optionKey}"${cls} ${optionData}>${optionText}</option>`);
        }
    }
    element.select();
}

function editGroup(id, name) {
    const grp = devGroups[id];
    let info = '';
    if (grp && grp.memberinfo) {
        for (let m=0; m< grp.memberinfo.length; m++) {
            const mi = grp.memberinfo[m];
            if (mi)
                info = info.concat(`<li class="collection-item"><label><input id="member_${m}" type="checkbox" checked="checked"/><span for="member_${m}">${mi.device} Endpoint ${mi.epid} (${mi.ieee})</span></label></li>`);
        }
    }
    $('#groupedit').find('.collection').html(info);
    //var text = 'Enter new name for "'+name+'" ('+id+')?';
    $('#groupedit').find('.editgroup').removeClass('hide');
    $('#groupedit').find('input[id=\'g_index\']').val(id);
    $('#groupedit').find('input[id=\'g_name\']').val(name);
    $('#groupedit a.btn[name=\'save\']').unbind('click');
    $('#groupedit a.btn[name=\'save\']').click(() => {
        const newName = $('#groupedit').find('input[id=\'g_name\']').val();
        const Id = $('#groupedit').find('input[id=\'g_index\']').val();
        const grp = devGroups[Id];
        const removeMembers = [];
        if (grp && grp.memberinfo) {
            for (let m=0; m<grp.memberinfo.length;m++) {
                const member = grp.memberinfo[m];
                if (!$(`#member_${m}`).prop('checked'))
                    removeMembers.push({id:member.ieee.replace('0x',''), ep:member.epid})
            }
        }
        updateGroup(Id, newName, (removeMembers.length > 0 ? removeMembers: undefined));
        // showGroups();
        getDevices();
    });
    $('#groupedit').modal('open');
    Materialize.updateTextFields();
}

function addGroup(id, name) {
    //var text = 'Enter new name for "'+name+'" ('+id+')?';
    $('#groupadd').find('input[id=\'g_index\']').val(id);
    $('#groupadd').find('input[id=\'g_name\']').val(name);
    $('#groupadd a.btn[name=\'save\']').unbind('click');
    $('#groupadd a.btn[name=\'save\']').click(() => {
        const newId = $('#groupadd').find('input[id=\'g_index\']').val(),
            newName = $('#groupadd').find('input[id=\'g_name\']').val();
        updateGroup(newId, newName);
    });
    $('#groupadd').modal('open');
    Materialize.updateTextFields();
}

function deleteGroupConfirmation(id, name) {
    const text = translateWord('Do you really whant to delete group') + ' "' + name + '" (' + id + ')?';
    $('#modaldelete').find('p').text(text);
    $('#forcediv').addClass('hide');
    $('#modaldelete a.btn[name=\'yes\']').unbind('click');
    $('#modaldelete a.btn[name=\'yes\']').click(() => {
        deleteGroup(id);
        // showGroups();
        // getDevices();
    });
    $('#modaldelete').modal('open');
}

function updateGroup(newId, newName, remove) {
    groups[newId] = newName;
    sendToWrapper(namespace, 'renameGroup', {id: newId, name: newName, remove: remove}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
        getDevices();
    });
}

function deleteGroup(id) {
    delete groups[id];
    sendToWrapper(namespace, 'deleteGroup', id, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
        getDevices();
    });
}

function updateDev(id, newName, newGroups) {
    const dev = devices.find((d) => d._id === id);
    const command = {id: id, name: id};
    let needName = false;
    if (dev) {
        if (dev.common.name !== newName) {
            command.name = newName;
            needName = true;
        }
        else command.name = dev.common.name;
    }

    const keys = Object.keys(newGroups);
    if (keys && keys.length) {
        command.groups = newGroups
        sendToWrapper(namespace, 'updateGroupMembership', command, function (msg) {
            closeWaitingDialog();
            if (msg && msg.error) {
                showMessage(msg.error, _('Error'));
            } else {
                // save dev-groups on success
                getDevices();
            }
        });
        showWaitingDialog('Updating group memberships', 10);

    }
    else if (needName)
    {
        sendToWrapper(namespace, 'renameDevice', command, function(msg) {
            //closeWaitingDialog();
            if (msg && msg.error) {
                showMessage(msg.error, _('Error'));
            } else {
                // save dev-groups on success
                getDevices();
            }

        })

    }
}

function resetConfirmation() {
    $('#modalreset').modal('open');
    const btn = $('#modalreset .modal-content a.btn');
    btn.unbind('click');
    btn.click(function (e) {
        sendToWrapper(namespace, 'reset', {mode: e.target.id}, function (err) {
            if (err) {
                console.log(`reset attempt failed with ${err}`);
            } else {
                console.log('Reset done');
            }
        });
    });
}

function showViewConfig() {
    $('#modalviewconfig').modal('open');
}

function prepareBindingDialog(bindObj) {
    const binddevices = devices.slice();
    binddevices.unshift('');
    const bind_source = (bindObj) ? [bindObj.bind_source] : [''];
    const bind_target = (bindObj) ? [bindObj.bind_target] : [''];

    // 5 - genScenes, 6 - genOnOff, 8 - genLevelCtrl, 768 - lightingColorCtrl
    const allowClusters = [5, 6, 8, 768];
    const allowClustersName = {5: 'genScenes', 6: 'genOnOff', 8: 'genLevelCtrl', 768: 'lightingColorCtrl'};
    // fill device selector
    list2select('#bind_source', binddevices, bind_source,
        function (key, device) {
            if (device == '') {
                return 'Select source device';
            }
            if (device.hasOwnProperty('info')) {
                if (device.info.device && device.info.device.type === 'Coordinator') {
                    return null;
                }
                // check for output clusters
                let allow = false;
                for (const cluster of allowClusters) {
                    if (device.info.endpoints) for (const ep of device.info.endpoints) {
                        if (ep.output_clusters.includes(cluster)) {
                            allow = true;
                            break;
                        }
                    }
                    if (allow) {
                        break;
                    }
                }
                if (!allow) {
                    return null;
                }
                return device.common.name;
            } else { // fallback if device in list but not paired
                return device.common.name + ' ' + device.native.id;
            }
        },
        function (key, device) {
            if (device == '') {
                return '';
            } else {
                return device._id;
            }
        },
        function (key, device) {
            if (device == '') {
                return 'disabled';
            } else if (device.icon) {
                return `data-icon="${device.icon}"`;
            } else {
                return '';
            }
        },
    );
    const bindtargets = binddevices.slice();
    for (const key in groups) {
        bindtargets.push({'_id': key, 'groupId': key, 'groupName': groups[key]});
    }
    list2select('#bind_target', bindtargets, bind_target,
        function (key, device) {
            if (device == '') {
                return 'Select target device';
            }
            if (device.hasOwnProperty('info')) {
                if (device.info.device && device.info.device.type === 'Coordinator') {
                    return null;
                }
                // check for input clusters
                let allow = false;
                for (const cluster of allowClusters) {
                    if (device.info.endpoints) for (const ep of device.info.endpoints) {
                        if (ep.input_clusters.includes(cluster)) {
                            allow = true;
                            break;
                        }
                    }
                    if (allow) {
                        break;
                    }
                }
                if (!allow) {
                    return null;
                }
                return device.common.name;
            } else {
                if (device.hasOwnProperty('groupId')) {
                    return device.groupName;
                }
            }
        },
        function (key, device) {
            if (device == '') {
                return '';
            } else {
                return device._id;
            }
        },
        function (key, device) {
            if (device == '') {
                return 'disabled';
            } else if (device.icon) {
                return `data-icon="${device.icon}"`;
            } else {
                return '';
            }
        },
    );

    const configureSourceEp = function (devID, selected) {
        const device = devices.find(obj => {
            return obj._id === devID;
        });

        const epList = device ? device.info.endpoints : [];
        const sClusterList = epList.map((ep) => {
            const clusters = ep.output_clusters.map((cl) => {
                return allowClusters.includes(cl) ? {ID: ep.ID + '_' + cl, name: allowClustersName[cl]} : null;
            }).filter((i) => {
                return i != null;
            });
            return clusters.length == 0 ? null : [{ID: ep.ID, name: 'all'}, clusters];
        }).flat(2).filter((i) => {
            return i != null;
        });
        list2select('#bind_source_ep', sClusterList, (selected) ? [selected] : [],
            (key, ep) => {
                return ep.ID + ' ' + ep.name;
            },
            (key, ep) => {
                return ep.ID;
            }
        );
    };

    const configureTargetEp = function (devID, selected, sourceCl) {
        const device = devices.find(obj => {
            return obj._id === devID;
        });

        const epList = device ? device.info.endpoints : [];
        const tClusterList = epList.map((ep) => {
            const clusters = ep.input_clusters.map((cl) => {
                return (allowClusters.includes(cl) && (!sourceCl || sourceCl == cl)) ? {
                    ID: ep.ID + '_' + cl,
                    name: allowClustersName[cl]
                } : null;
            }).filter((i) => {
                return i != null;
            });
            return !clusters.length ? null : [{ID: ep.ID, name: 'all'}, clusters];
        }).flat(2).filter(i => {
            return i != null;
        });
        list2select('#bind_target_ep', tClusterList, (selected) ? [selected] : [],
            (key, ep) => {
                return ep.ID + ' ' + ep.name;
            },
            (key, ep) => {
                return ep.ID;
            }
        );
    };

    $('#bind_source').change(function () {
        if (this.selectedIndex <= 0) {
            return;
        }
        configureSourceEp(this.value);
    });
    if (bindObj) {
        configureSourceEp(bindObj.bind_source, bindObj.bind_source_ep);
    } else {
        configureSourceEp();
    }

    $('#bind_target').change(function () {
        if (this.selectedIndex <= 0) {
            return;
        }
        const bind_source_ep = $('#bindingmodaledit').find('#bind_source_ep option:selected').val();
        configureTargetEp(this.value, null, (bind_source_ep.indexOf('_') > 0) ? bind_source_ep.split('_')[1] : null);
    });
    if (bindObj) {
        configureTargetEp(bindObj.bind_target, bindObj.bind_target_ep);
    } else {
        configureTargetEp();
    }

    $('#bind_source_ep').change(function () {
        $('#bind_target').trigger('change');
    });

    const unbind_fom_coordinator = bindObj ? bindObj.unbind_from_coordinator : false;
    $('#unbind_from_coordinator').prop('checked', unbind_fom_coordinator);
}

function addBindingDialog() {
    $('#bindingmodaledit a.btn[name=\'save\']').unbind('click');
    $('#bindingmodaledit a.btn[name=\'save\']').click(() => {
        const //bind_id = $('#bindingmodaledit').find("input[id='bind_id']").val(),
            bind_source = $('#bindingmodaledit').find('#bind_source option:selected').val(),
            bind_source_ep = $('#bindingmodaledit').find('#bind_source_ep option:selected').val(),
            bind_target = $('#bindingmodaledit').find('#bind_target option:selected').val(),
            bind_target_ep = $('#bindingmodaledit').find('#bind_target_ep option:selected').val(),
            unbind_from_coordinator = $('#bindingmodaledit').find('#unbind_from_coordinator').prop('checked');
        addBinding(bind_source, bind_source_ep, bind_target, bind_target_ep, unbind_from_coordinator);
    });
    prepareBindingDialog();

    $('#bindingmodaledit').modal('open');
    Materialize.updateTextFields();
}

function addBinding(bind_source, bind_source_ep, bind_target, bind_target_ep, unbind_from_coordinator) {
    sendToWrapper(namespace, 'addBinding', {
        bind_source: bind_source,
        bind_source_ep: bind_source_ep,
        bind_target: bind_target,
        bind_target_ep: bind_target_ep,
        unbind_from_coordinator
    }, function (msg) {
        closeWaitingDialog();
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
        getBinding();
    });
    showWaitingDialog('Device binding is being added', 10);
}

function editBinding(bind_id, bind_source, bind_source_ep, bind_target, bind_target_ep, unbind_from_coordinator) {
    sendToWrapper(namespace, 'editBinding', {
        id: bind_id,
        bind_source: bind_source,
        bind_source_ep: bind_source_ep,
        bind_target: bind_target,
        bind_target_ep: bind_target_ep,
        unbind_from_coordinator
    }, function (msg) {
        closeWaitingDialog();
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
        getBinding();
    });
    showWaitingDialog('Device binding is being updated', 10);
}

function editBindingDialog(bindObj) {
    $('#bindingmodaledit a.btn[name=\'save\']').unbind('click');
    $('#bindingmodaledit a.btn[name=\'save\']').click(() => {
        const //bind_id = $('#bindingmodaledit').find("input[id='bind_id']").val(),
            bind_source = $('#bindingmodaledit').find('#bind_source option:selected').val(),
            bind_source_ep = $('#bindingmodaledit').find('#bind_source_ep option:selected').val(),
            bind_target = $('#bindingmodaledit').find('#bind_target option:selected').val(),
            bind_target_ep = $('#bindingmodaledit').find('#bind_target_ep option:selected').val(),
            unbind_from_coordinator = $('#bindingmodaledit').find('#unbind_from_coordinator').prop('checked');
        editBinding(bindObj.id, bind_source, bind_source_ep, bind_target, bind_target_ep, unbind_from_coordinator);
    });
    prepareBindingDialog(bindObj);
    $('#bindingmodaledit').modal('open');
    Materialize.updateTextFields();
}

function showBinding() {
    const element = $('#binding');
    element.find('.binding').remove();
    if (!binding || !binding.length) return;
    binding.forEach(b => {
        const bind_id = b.id,
            bind_source = b.bind_source,
            bind_source_ep = b.bind_source_ep,
            bind_target = b.bind_target,
            bind_target_ep = b.bind_target_ep;
        const source_dev = devices.find((d) => d._id == bind_source) || {common: {name: bind_source}},
            target_dev = devices.find((d) => d._id == bind_target) || {common: {name: bind_target}},
            target_icon = (target_dev.icon) ? `<img src="${target_dev.icon}" width="64px">` : '';
        const card = `
                    <div id="${bind_id}" class="binding col s12 m6 l4 xl3">
                        <div class="card hoverable">
                            <div class="card-content zcard">
                                <span class="card-title truncate">${source_dev.common.name}</span>
                                <i class="left"><img src="${source_dev.icon}" width="64px"></i>
                                <i class="right">${target_icon}</i>
                                <div style="min-height:72px; font-size: 0.8em" class="truncate">
                                    <ul>
                                        <li><span class="label">source:</span><span>0x${bind_source.replace(namespace + '.', '')}</span></li>
                                        <li><span class="label">endpoint:</span><span>${bind_source_ep}</span></li>
                                        <li><span class="label">target:</span><span>0x${bind_target.replace(namespace + '.', '')}</span></li>
                                        <li><span class="label">endpoint:</span><span>${bind_target_ep}</span></li>
                                    </ul>
                                </div>
                            </div>
                            <div class="card-action">
                                <div class="card-reveal-buttons zcard">
                                    <span class="card-title truncate">${target_dev.common.name}
                                        <button name="delete" class="right btn-flat btn-small">
                                            <i class="material-icons icon-black">delete</i>
                                        </button>
                                        <button name="edit" class="right btn-flat btn-small">
                                            <i class="material-icons icon-green">edit</i>
                                        </button>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>`;
        element.append(card);
    });

    $('#binding button[name=\'delete\']').click(function () {
        const bind_id = $(this).parents('.binding')[0].id;
        deleteBindingConfirmation(bind_id);
    });
    $('#binding button[name=\'edit\']').click(function () {
        const bind_id = $(this).parents('.binding')[0].id;
        const bindObj = binding.find((b) => b.id == bind_id);
        if (bindObj) {
            editBindingDialog(bindObj);
        }
    });
}

function getBinding() {
    sendToWrapper(namespace, 'getBinding', {}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            } else {
                binding = msg;
                showBinding();
            }
        }
    });
}

function deleteBindingConfirmation(id) {
    const text = translateWord('Do you really want to delete binding?');
    $('#modaldelete').find('p').text(text);
    //$('#forcediv').removeClass('hide');
    $('#forcediv').addClass('hide');
    $('#modaldelete a.btn[name=\'yes\']').unbind('click');
    $('#modaldelete a.btn[name=\'yes\']').click(() => {
        deleteBinding(id);
    });
    $('#modaldelete').modal('open');
}

function deleteBinding(id) {
    sendToWrapper(namespace, 'delBinding', id, (msg) => {
        closeWaitingDialog();
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            }
        }
        getBinding();
    });
    showWaitingDialog('Device binding is being removed', 10);
}

function findClName(id) {
    for (const key in cidList) {
        if (cidList.hasOwnProperty(key) && cidList[key].ID == id) {
            return `${key} (${id})`;
        }
    }
    return id;
}

function genDevInfo(device) {
    const dev = (device && device.info) ? device.info.device : undefined;
    const mapped = (device && device.info) ? device.info.mapped : undefined;
    const endpoints = (device && device.info) ? device.info.endpoints : [];
    if (!dev) return `<div class="truncate">No info</div>`;
    const genRow = function (name, value, refresh) {
        if (value === undefined) {
            return '';
        } else {
            return `<li><span class="label">${name.replace('_',' ')}:</span><span>${value}</span></li>`;
        }
    };
    const genRowValues = function (name, value) {
        if (value === undefined) {
            return '';
        } else {
            let label = `${name}:`;
            try {
                return value.map((val) => {
                    const row = `<li><span class="label">${label}</span><span>${val}</span></li>`;
                    label = '';
                    return row;
                }).join('');
            }
            catch {
                return `<li><span class="label">${label}</span><span>${JSON.stringify(value)}</span></li>`
            }
        }
    };
    const modelUrl = (!mapped) ? '' : `<a href="https://www.zigbee2mqtt.io/devices/${sanitizeModelParameter(mapped.model)}.html" target="_blank" rel="noopener noreferrer">${mapped.model}</a>`;
    const mappedInfo = [];
    if (mapped) {
        mappedInfo.push(
            `<div style="font-size: 0.9em">
                <ul>`);
        for (const item in mapped) {
            if (item == 'model')
                mappedInfo.push(genRow(item,modelUrl));
            else
                mappedInfo.push(genRow(item,mapped[item]));
        }
        mappedInfo.push(
            `            </ul>
                    </div>`);
    }
    let epInfo = '';
    for (const epind in endpoints) {
        const ep = endpoints[epind];
        epInfo +=
            `<div style="font-size: 0.9em" class="truncate">
                <ul>
                    ${genRow('endpoint', ep.ID)}
                    ${genRow('profile', ep.profile)}
                    ${genRowValues('input clusters', ep.input_clusters ? ep.input_clusters.map(findClName) : 'none')}
                    ${genRowValues('output clusters', ep.output_clusters ? ep.output_clusters.map(findClName): 'none')}
                </ul>
            </div>`;
    }
    const imgSrc = device.icon || device.common.icon;
    const imgInfo = (imgSrc) ? `<img src=${imgSrc} width='150px' onerror="this.onerror=null;this.src='img/unavailable.png';"><div class="divider"></div>` : '';
    const info =[
        `<div class="col s12 m6 l6 xl6">
            ${imgInfo}
            ${mappedInfo.join('')}
            <div class="divider"></div>
            <div style="font-size: 0.9em" class="truncate">
                <ul>`];
    for (const item in dev) {
        info.push(genRow(item, dev[item]));
    }
    info.push(`                ${genRow('configured', (device.isConfigured), true)}
                </ul>
            </div>
        </div>
        <div class="col s12 m6 l6 xl6">
        ${epInfo}
        </div>`);
    return info.join('');
}

let waitingTimeout, waitingInt;

function showWaitingDialog(text, timeout) {
    let countDown = timeout;
    waitingInt = setInterval(function () {
        countDown -= 1;
        const percent = 100 - 100 * countDown / timeout;
        $('#waiting_progress_line').css('width', `${percent}%`);
    }, 1000);
    waitingTimeout = setTimeout(function () {
        $('#waiting_progress_line').css('width', `0%`);
        clearTimeout(waitingInt);
        clearTimeout(waitingTimeout);
        $('#modalWaiting').modal('close');
    }, timeout * 1000);
    $('#waiting_message').text(text);
    $('#modalWaiting').modal('open');
}

function closeWaitingDialog() {
    if (waitingInt) clearTimeout(waitingInt);
    if (waitingTimeout) clearTimeout(waitingTimeout);
    $('#modalWaiting').modal('close');
}


function showChannels() {
    sendToWrapper(namespace, 'getChannels', {}, function (msg) {
        closeWaitingDialog();
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            } else {
                $('#modalchannels').modal('open');
                let info = '';
                for (let ch = 11; ch < 27; ch++) {
                    const value = msg.energyvalues[ch - 11];
                    info +=
                        `<div style="padding-top: 10px">
                            <span class="">№ ${ch}: ${value}%</span>
                            <span class="progress" style="margin: -15px 0 0 80px; height: 15px; width: 80%">
                              <div class="determinate" style="width: ${value}%"></div>
                            </span>
                        </div>`;
                }

                $('#channelsinfo').html(info);
            }
        }
    });
    showWaitingDialog('Scanning channels', 10);
}

function onlyOne(devs) {

    let devTypes = [];
    const devOut = [];

    for (let i = 0; i < devs.length; i++) {
        const typ = devs[i];
        devTypes.push(typ.common.type);
    }

    devTypes = devTypes.filter(onlyUnique);

    for (const key in devTypes) {
        devOut.push(devs.find(x => x.common.type == devTypes[key]));
    }

    return devOut;
}

function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
}

function prepareExcludeDialog(excludeObj) {
    const exDevs = devices.slice();
    const excludetargets = [];
    const exclude_target = (excludeObj) ? [excludeObj.exclude_target] : [''];
    const arrExclude = JSON.stringify(excludes);

    for (const exTr of exDevs) {
        const typeEx = exTr.common.type;
        if (arrExclude.indexOf(typeEx) < 1) {
            excludetargets.push(exTr);
        }
    }

    const onlyOneTargets = onlyOne(excludetargets);
    onlyOneTargets.unshift('');

    list2select('#exclude_target', onlyOneTargets, exclude_target,

        function (key, device) {
            if (device == '') {
                return 'Select model';
            }
            if (device.hasOwnProperty('info')) {
                if (device.info.device && device.info.device.type == 'Coordinator') {
                    return null;
                }
                return device.common.type;
            } else {
                if (device.common.type == 'group') {
                    return null;
                }
                return device.common.type;
            }
        },
        function (key, device) {
            if (device == '') {
                return '';
            } else {
                return device._id;
            }
        },
        function (key, device) {
            if (device == '') {
                return 'disabled';
            } else if (device.icon) {
                return `data-icon="${device.icon}" onerror="this.onerror=null;this.src='img/unavailable.png';"`;
            } else {
                return '';
            }
        },
    );

}

function addExcludeDialog() {
    $('#excludemodaledit a.btn[name=\'save\']').unbind('click');
    $('#excludemodaledit a.btn[name=\'save\']').click(() => {
        const exclude_id = $('#excludemodaledit').find('#exclude_target option:selected').val();
        const ids = devices.map(el => el._id);
        const idx = ids.indexOf(exclude_id);
        const exclude_model = devices[idx];
        addExclude(exclude_model);
    });
    prepareExcludeDialog();
    $('#excludemodaledit').modal('open');
    Materialize.updateTextFields();
}

function addExclude(exclude_model) {
    if (typeof exclude_model == 'object' && exclude_model.hasOwnProperty('common'))
        sendToWrapper(namespace, 'addExclude', { exclude_model: exclude_model }, function (msg) {
            closeWaitingDialog();
            if (msg) {
                if (msg.error) {
                    showMessage(msg.error, _('Error'));
                }
            }
            getExclude();
        });
    else closeWaitingDialog();
}

function getExclude() {
    sendToWrapper(namespace, 'getExclude', {}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            } else {
                excludes = msg.legacy;
                showExclude();
            }
        }
    });
}

function showExclude() {
    const element = $('#exclude');
    element.find('.exclude').remove();

    if (!excludes || !excludes.length) {
        return;
    }

    excludes.forEach(id => {
        const exclude_id = id.key;
        const exclude_icon = id.value;
        const exclude_dev = devices.find((d) => d.common.type == exclude_id) || {common: {name: exclude_id}};
        const modelUrl = (!exclude_id) ? '' : `<a href="https://www.zigbee2mqtt.io/devices/${sanitizeModelParameter(exclude_id)}.html" target="_blank" rel="noopener noreferrer">${exclude_id}</a>`;
        const card = `
                    <div id="${exclude_id}" class="exclude col s12 m6 l4 xl3" style="height: 135px;padding-bottom: 10px;">
                        <div class="card hoverable">
                            <div class="card-content zcard">
                                <i class="left"><img src="${exclude_dev.icon}" width="64px" onerror="this.onerror=null;this.src='img/unavailable.png';"></i>
                                    <div style="min-height:72px; font-size: 0.8em" class="truncate">
                                        <ul>
                                            <li><span class="label">model:</span><span>${modelUrl}</span></li>
                                        </ul>
                                    </div>
                            </div>
                            <div class="card-action">
                                <div class="card-reveal-buttons zcard">
                                    <span class="card-title truncate">${exclude_id}
                                        <button name="delete" class="right btn-flat btn-small">
                                            <i class="material-icons icon-black">delete</i>
                                        </button>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>`;
        element.append(card);
    });

    $('#exclude button[name=\'delete\']').click(function () {
        const exclude_id = $(this).parents('.exclude')[0].id;
        deleteExcludeConfirmation(exclude_id);
        //deleteExclude(exclude_id);
    });
}


function deleteExcludeConfirmation(id) {
    const text = translateWord('Do you really want to delete exclude?');
    $('#modaldelete').find('p').text(text);
    //$('#forcediv').removeClass('hide');
    $('#forcediv').addClass('hide');
    $('#modaldelete a.btn[name=\'yes\']').unbind('click');
    $('#modaldelete a.btn[name=\'yes\']').click(() => {
        deleteExclude(id);
    });
    $('#modaldelete').modal('open');
}

function deleteExclude(id) {
    sendToWrapper(namespace, 'delExclude', id, (msg) => {
        closeWaitingDialog();
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            }
        }
        getExclude();
    });
}

function doFilter(inputText) {
    if (shuffleInstance) {
        const lang = systemLang || 'en';
        const searchText = inputText || $('#device-search').val();
        const roomFilter = $('#room-filter-btn').text().toLowerCase();
        const deviceFilter = $('#device-filter-btn').text().toLowerCase();
        if (searchText || roomFilter !== 'all' || deviceFilter != 'all') {
            shuffleInstance.filter(function (element, shuffle) {
                const devId = element.getAttribute('id');
                const dev = getDeviceByID(devId);
                let valid = true;
                if (searchText) {
                    const titleElement = element.querySelector('.card-title');
                    const titleText = titleElement.textContent.toLowerCase().trim();
                    valid = (titleText.indexOf(searchText) !== -1);
                }
                if (valid && dev && roomFilter !== 'all') {
                    if (dev.rooms) {
                        const rooms = dev.rooms.map((room) => {
                            if (room && room.hasOwnProperty(lang)) {
                                return room[lang];
                            } else {
                                return room;
                            }
                        }).filter((item) => item != undefined).map((item) => item.toLowerCase().trim());
                        valid = rooms.includes(roomFilter);
                    } else {
                        valid = false;
                    }
                }
                if (valid && dev && deviceFilter !== 'all') {
                    switch (deviceFilter) {
                        case 'connected':
                            valid = (dev.link_quality > 0) && !dev.common.deactivated;
                            break;
                        case 'disconnected':
                            valid = (dev.link_quality <= 0) && !dev.common.deactivated;
                            break;
                        case 'deactivated':
                            valid = dev.common.deactivated;
                            break;
                        case 'router':
                            valid = dev.battery == null;
                            break;
                        case 'enddevice':
                            valid = dev.battery && dev.battery>0;
                            break;
                        case 'group':
                            valid =  (dev.common.type == 'group');
                            break;
                        default: valid = true;
                    }
                }
                return valid;
            });
        } else {
            shuffleInstance.filter();
        }
    }
}

function doSort() {
    if (shuffleInstance) {
        const sortOrder = $('#device-order-btn').text().toLowerCase();
        if (sortOrder === 'default') {
            shuffleInstance.sort({});
        } else if (sortOrder === 'a-z') {
            shuffleInstance.sort({
                by: sortByTitle
            });
        }
    }
}

function sortByTitle(element) {
    return element.querySelector('.card-title').textContent.toLowerCase().trim();
}


function updateDevice(id) {
    sendToWrapper(namespace, 'getDevice', {id: id}, function (msg) {
        if (msg) {
            const devs = msg.devices;
            if (devs) {
                if (devs.error) {
                    showMessage(devs.error, _('Error'));
                } else {
                    removeDevice(id);
                    devs.forEach(dev => devices.push(dev));
                    showDevices();
                }
            }
        }
    });
}

function removeDevice(id) {
    const dev = getDeviceByID(id);
    if (dev) {
        const ind = devices.indexOf(dev);
        if (ind > -1) {
            devices.splice(ind, 1);
        }
    }
}

function swapActive(id) {
    const dev = getDeviceByID(id);
    if (dev && dev.common) {
        dev.common.deactivated = !(dev.common.deactivated);
        sendToWrapper(namespace, 'setDeviceActivated', {id: id, deactivated: dev.common.deactivated}, function () {
            showDevices();
        });
    }
}

function reconfigureConfirmation(id) {
    const text = translateWord(`Do you really want to reconfigure device?`);
    $('#modalreconfigure').find('p').text(text);
    $('#modalreconfigure a.btn[name=\'yes\']').unbind('click');
    $('#modalreconfigure a.btn[name=\'yes\']').click(() => {
        reconfigureDevice(id/*, force*/);
    });
    $('#modalreconfigure').modal('open');
    Materialize.updateTextFields();
}

function reconfigureDevice(id) {
    sendToWrapper(namespace, 'reconfigure', {id: id}, function (msg) {
        closeWaitingDialog();
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            }
        }
    });
    showWaitingDialog('Device is being reconfigured', 30);
}

const warnLevel = {
    extPanID : function(v) { return !(v && v.toLowerCase().trim()!='dddddddddddddddd')},
    channel: function(v) { const num = parseInt(v); return !(num==11 || num==15 || num==20 || num==25)},
}
const validatableKeys = ['channel', 'precfgkey', 'extPanID', 'panID'];

function validateConfigData(key, val) {
    if (validatableKeys.indexOf(key) < 0 || !val) return;
    if (warnLevel[key]) {
        if (warnLevel[key](val)) {
            $(`#${key}_ALERT`).removeClass('hide')
        } else $(`#${key}_ALERT`).addClass('hide')
    }
    if (nvRamBackup[key]) {
        if ((typeof val == 'string' && typeof nvRamBackup[key] == 'string' && val.toLowerCase == nvRamBackup[key].toLowerCase) || val == nvRamBackup[key])
        {
            $(`#${key}_OK`).removeClass('hide')
            $(`#${key}_NOK`).addClass('hide')
        }
        else
        {
            $(`#${key}_OK`).addClass('hide')
            $(`#${key}_NOK`).removeClass('hide')
        }
    }
    else {
        $(`#${key}_OK`).addClass('hide')
        $(`#${key}_NOK`).addClass('hide')
    }
}

function validateNVRamBackup(update, src) {
    const validatedKeys = src ? [src] : validatableKeys;
    const validator = {};
    for (const key of validatedKeys) {
        const value = $('#' + key + '.value');
        if (nvRamBackup[key] && update) {
            if (value.attr('type') === 'checkbox') {
                value.prop('checked', nvRamBackup[key]);
            } else {
                value.val(nvRamBackup[key])
            }
        }
        validateConfigData(key, value.val());
    }
}


function readNVRamBackup(update) {
    sendToWrapper(namespace, 'readNVRam', {}, function(msg) {
        if (msg) {
            if (msg.error && update) {
                if (msg.error.includes('ENOENT')) showMessage('Unable to read nvRam backup - no backup available.',_('Error'))
                else showMessage(msg.error, _('Error'));
                delete msg.error;
            }
            nvRamBackup = msg;
            validateNVRamBackup(update)
        }
    });

}
