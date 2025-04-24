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
        type: 'd2',
        version: 'd2',
        revision: 'd2',
        port: 'd2',
        channel: 'd2'
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
    'port', 'panID', 'channel', 'disableLed', 'countDown', 'groups', 'extPanID', 'precfgkey', 'transmitPower',
    'adapterType', 'debugHerdsman', 'disableBackup', 'disablePing', 'external', 'startWithInconsistent',
    'warnOnDeviceAnnouncement', 'baudRate', 'flowCTRL', 'autostart'
];

function getDeviceByID(ID) {
    if (devices) return devices.find((devInfo) => {
        try {
            return devInfo._id == ID;
        } catch (e) {
            //console.log("No dev with ieee " + ieeeAddr);
        }
    });
}

function getDevice(ieeeAddr) {
    return devices.find((devInfo) => {
        try {
            return devInfo.info.device._ieeeAddr == ieeeAddr;
        } catch (e) {
            //console.log("No dev with ieee " + ieeeAddr);
        }
    });
}


function getDeviceByNetwork(nwk) {
    return devices.find((devInfo) => {
        try {
            return devInfo.info.device._networkAddress == nwk;
        } catch (e) {
            //console.log("No dev with nwkAddr " + nwk);
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


function getCoordinatorCard(dev) {
    const title = 'Zigbee Coordinator',
        id = dev._id,
        img_src = 'zigbee.png',
        rid = id.split('.').join('_'),
        image = `<img src="${img_src}" width="80px">`,
        paired = '',
        status = `<div class="col tool"><i class="material-icons icon-green">check_circle</i></div>`,
        lqi_cls = getLQICls(dev.link_quality),
        lq = (dev.link_quality) ? `<div class="col tool"><i id="${rid}_link_quality_icon" class="material-icons ${lqi_cls}">network_check</i><div id="${rid}_link_quality" class="center" style="font-size:0.7em">${dev.link_quality}</div></div>` : '',
        info = `<div style="min-height:88px; font-size: 0.8em" class="truncate">
                    <ul>
                        <li><span class="label">type:</span><span>${coordinatorinfo.type}</span></li>
                        <li><span class="label">version:</span><span>${coordinatorinfo.version}</span></li>
                        <li><span class="label">revision:</span><span>${coordinatorinfo.revision}</span></li>
                        <li><span class="label">port:</span><span>${coordinatorinfo.port}</span></li>
                        <li><span class="label">channel:</span><span>${coordinatorinfo.channel}</span></li>
                    </ul>
                </div>`,
        permitJoinBtn = (dev.info && dev.info.device._type == 'Router') ? '<button name="join" class="btn-floating btn-small waves-effect waves-light right hoverable green"><i class="material-icons tiny">leak_add</i></button>' : '',
        card = `<div id="${id}" class="device">
                  <div class="card hoverable">
                    <div class="card-content zcard">
                        <span class="top right small" style="border-radius: 50%">
                            ${lq}
                            ${status}
                        </span>
                        <!--/a--!>
                        <span id="dName" class="card-title truncate">${title}</span><!--${paired}--!>
                        <i class="left">${image}</i>
                        ${info}
                        <div class="footer right-align"></div>
                    </div>
                    <div class="card-action">
                        <div class="card-reveal-buttons">
                            ${permitJoinBtn}
                        </div>
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
    const room = rooms.join(',') || '&nbsp';
    let memberCount = 0;
    let info = `<div style="min-height:88px; font-size: 0.8em; height: 98px; overflow-y: auto" class="truncate">
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
    info = info.concat(`                    </ul>
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
                                <span class="left" style="padding-top:8px">${room}</span>
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

function sanitizeModelParameter(parameter) {
    const replaceByUnderscore = /[\s/]/g;
    return parameter.replace(replaceByUnderscore, '_');
}

function getCard(dev) {
    //console.warn(JSON.stringify(dev));
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
    const room = rooms.join(',') || '&nbsp';
    const paired = (dev.paired) ? '' : '<i class="material-icons right">leak_remove</i>';
    const rid = id.split('.').join('_');
    const modelUrl = (!type) ? '' : `<a href="https://www.zigbee2mqtt.io/devices/${type_url}.html" target="_blank" rel="noopener noreferrer">${type}</a>`;
    const image = `<img src="${img_src}" width="80px" onerror="this.onerror=null;this.src='img/unavailable.png';">`,
        nwk = (dev.info && dev.info.device) ? dev.info.device._networkAddress : undefined,
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
                        <li><span class="labelinfo">groups:</span><span>${dev.groupNames || ''}</span></li>
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
                                <span class="left" style="padding-top:8px">${room}</span>
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

function deleteConfirmation(id, name) {
    const text = translateWord('Do you really want to delete device') + ' "' + name + '" (' + id + ')?';
    $('#modaldelete').find('p').text(text);
    $('#force').prop('checked', false);
    $('#forcediv').removeClass('hide');
    $('#modaldelete a.btn[name=\'yes\']').unbind('click');
    $('#modaldelete a.btn[name=\'yes\']').click(() => {
        const force = $('#force').prop('checked');
        deleteDevice(id, force);
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
        sendTo(namespace, 'deleteNVBackup', {}, function (msg) {
            closeWaitingDialog();
            if (msg) {
                if (msg.error) {
                    showMessage(msg.error, _('Error'));
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

    const device_options = {};
    const received_options = {};

    function removeOption(k) {
        if (k && device_options.hasOwnProperty(k)) delete device_options[k];
    }

    function addOption() {
        let idx=1;
        let key = '';
        do {
            key = `o${idx++}`;
        }
        while (device_options.hasOwnProperty(key));
        device_options[key] = {key:`option_${idx++}`, value:''};
    }

    function updateOptions() {
        const html_options=[];

        console.warn(`device_options is ${JSON.stringify(device_options)}`)

        for (const k in device_options) {
            html_options.push(`<div class="row">`);
            html_options.push(`<div class="input-field suffix col s5 m5 l5"><input id="option_key_${k}" type="text" class="value" /><label for="option_key_${k}">Option</label></div>`)
            html_options.push(`<div class="input-field suffix col s5 m5 l5"><input id="option_value_${k}" type="text" class="value" /><label for="option_value_${k}">Value</label></div>`)
            html_options.push(`<div class="col"><a id="option_rem_${k}" class='btn' ><i class="material-icons">remove_circle</i></a></div>`);
            html_options.push(`</div>`)
        }
        console.warn(`html is ${$('#modaledit').find('.options_grid').html()}`)
        $('#modaledit').find('.options_grid').html(html_options.join(''));
        console.warn(`html is now ${$('#modaledit').find('.options_grid').html()}`)
        if (html_options.length > 0) {
            $('#modaledit').find('.options_available').removeClass('hide');
            for (const k of Object.keys(device_options)) {
                $(`#option_key_${k}`).val(device_options[k].key);
                $(`#option_value_${k}`).val(device_options[k].value);
                $(`#option_rem_${k}`).unbind('click');
                $(`#option_rem_${k}`).click(() => { removeOption(k); updateOptions() });
            }
        }
        else {
            $('#modaledit').find('.options_available').addClass('hide');
        }
    }

    function getOptionsFromUI(_do, _so) {
        const _no = {};
        let changed = false;
        for (const k in _do) {
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
        if (changed) return _no;
        return undefined;
    }



    console.warn('editName called with ' + id + ' and ' + name);
    const dev = devices.find((d) => d._id == id);
    $('#modaledit').find('input[id=\'d_name\']').val(name);
    const groupables = [];
    if (dev && dev.info && dev.info.endpoints) {
        for (const ep of dev.info.endpoints) {
            if (ep.inputClusters.includes(4)) {
                groupables.push({epid: EndPointIDfromEndPoint(ep), ep: ep, memberOf: []});
            }
        }
    }
    const numEP = groupables.length;

    if (numEP > 0) {
        $('#modaledit').find('.groups_available').removeClass('hide');
        $('#modaledit').find('.row.epid0').addClass('hide');
        $('#modaledit').find('.row.epid1').addClass('hide');
        $('#modaledit').find('.row.epid2').addClass('hide');
        $('#modaledit').find('.row.epid3').addClass('hide');
        $('#modaledit').find('.row.epid4').addClass('hide');
        $('#modaledit').find('.row.epid5').addClass('hide');
        $('#modaledit').find('.row.epid6').addClass('hide');
        // go through all the groups. Find the ones to list for each groupable
        if (numEP == 1) {
            $('#modaledit').find('.endpointid').addClass('hide');
        } else {
            $('#modaledit').find('.endpointid').removeClass('hide');
        }
        for (const d of devices) {
            if (d && d.common && d.common.type == 'group') {
                if (d.hasOwnProperty('memberinfo')) {
                    for (const member of d.memberinfo) {
                        const epid = EndPointIDfromEndPoint(member.ep);
                        for (let i = 0; i < groupables.length; i++) {
                            if (groupables[i].epid == epid) {
                                groupables[i].memberOf.push(d.native.id.replace('group_', ''));
                            }
                        }
                    }
                }
            }
        }
        console.log('groupables: ' + JSON.stringify(groupables));
        for (let i = 0; i < groupables.length; i++) {
            if (i > 1) {
                $('#modaledit').find('translate.device_with_endpoint').innerHtml = name + ' ' + groupables[i].epid;
            }
            $('#modaledit').find('.row.epid' + i).removeClass('hide');
            list2select('#d_groups_ep' + i, groups, groupables[i].memberOf || []);
        }
    }
    else
    {
        $('#modaledit').find('.groups_available').addClass('hide');
    }
    sendTo(namespace, 'getLocalConfigItems', { target:id, global:false, key:'options' }, function (msg) {
        if (msg) {
            if (msg.error) showMessage(msg.error, '_Error');
            console.warn(`return is ${msg}`)
            Object.keys(device_options).forEach(key => delete device_options[key]);
            Object.keys(received_options).forEach(key => delete received_options[key]);
            if (typeof msg.options === 'object') {

                let cnt = 1;
                for (const key in msg.options)
                {
                    received_options[key]=msg.options[key];
                    device_options[`o${cnt}`] = { key:key, value:msg.options[key]}
                    cnt++;
                }
            }
            updateOptions();

        } else showMessage('callback without message');
    });
    $('#modaledit a.btn[name=\'save\']').unbind('click');
    $('#modaledit a.btn[name=\'add_options\']').unbind('click');
    $('#modaledit a.btn[name=\'add_options\']').click(() => {
        getOptionsFromUI(device_options, received_options);
        addOption();
        updateOptions()
    });
    $('#modaledit a.btn[name=\'save\']').click(() => {
        const newName = $('#modaledit').find('input[id=\'d_name\']').val();
        const groupsbyid = {};
        if (groupables.length > 0) {
            for (let i = 0; i < groupables.length; i++) {
                const ng = $('#d_groups_ep' + i).val();
                if (ng.toString() != groupables[i].memberOf.toString())
                    groupsbyid[groupables[i].ep.ID] = GenerateGroupChange(groupables[i].memberOf, ng);
            }
        }
        // read device_options from UI
        const co = getOptionsFromUI(device_options, received_options)
        console.warn(`options have ${co ? 'changed' : 'not changed'} : ${JSON.stringify(co)} vs ${JSON.stringify(received_options)} , saving them`);
        if (co) {
            sendTo(namespace, 'updateLocalConfigItems', {
                target: id,
                global:false,
                data: { options:co }
            },
            function (msg) {
                if (msg && msg.error) showMessage(msg.error, '_Error');
            });
        }
        updateDev(id, newName, groupsbyid);

    });
    $('#modaledit').modal('open');
    Materialize.updateTextFields();
}

function GenerateGroupChange(oldmembers, newmembers) {
    const grpchng = [];
    for (const oldg of oldmembers)
        if (!newmembers.includes(oldg)) grpchng.push('-' + oldg);
    for (const newg of newmembers)
        if (!oldmembers.includes(newg)) grpchng.push(newg);
    return grpchng;
}

function deleteDevice(id, force) {
    sendTo(namespace, 'deleteDevice', {id: id, force: force}, function (msg) {
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
    sendTo(namespace, 'cleanDeviceStates', {force: force}, function (msg) {
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
    sendTo(namespace, 'renameDevice', {id: id, name: name}, function (msg) {
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
        if (!d.info) {
            if (d.common && d.common.type == 'group') {
                const card = getGroupCard(d);
                html += card;
                continue;
            }
        }
        ;
        if (d.info && d.info.device._type == 'Coordinator') {
            const card = getCoordinatorCard(d);
            html += card;
        } else {
            //if (d.groups && d.info && d.info.device._type == "Router") {
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

    shuffleInstance = new Shuffle($('#devices'), {
        itemSelector: '.device',
        sizer: '.js-shuffle-sizer',
    });
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
    $('button.btn-floating[name=\'join\']').click(function () {
        const dev_block = $(this).parents('div.device');
        if (!$('#pairing').hasClass('pulse')) {
            joinProcess(getDevId(dev_block));
        }
        showPairingProcess();
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
        reconfigureDlg(getDevId(dev_block));
    });
    $('.card-reveal-buttons button[name=\'swapactive\']').click(function () {
        const dev_block = $(this).parents('div.device');
        swapActive(getDevId(dev_block));
    });

    showNetworkMap(devices, map);
    translateAll();
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
                    sendTo(namespace, 'startOta', {devId: devId}, (msg) => {
                        fwInfoNode.html(createBtn('check_circle', 'Finished, see logs.', true));
                        console.log(msg);
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
        sendTo(namespace, 'checkOtaAvail', {devId: devId}, callback);
    }
}

function letsPairingWithCode(code) {
    messages = [];
    sendTo(namespace, 'letsPairing', {code: code}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
        else {
            showPairingProcess();
        }
    });
}

function letsPairing() {
    messages = [];
    sendTo(namespace, 'letsPairing', {}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
    });
}

function touchlinkReset() {
    messages = [];
    sendTo(namespace, 'touchlinkReset', {}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
    });
}

function joinProcess(devId) {
    messages = [];
    sendTo(namespace, 'letsPairing', {id: devId}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
    });
}

function getCoordinatorInfo() {
    sendTo(namespace, 'getCoordinatorInfo', {}, function (msg) {
        if (msg) {
            if (msg.error) {
                errorData.push(msg.error);
                isHerdsmanRunning = false;
                updateStartButton();
            } else {
                coordinatorinfo = msg;
                isHerdsmanRunning = true;
                updateStartButton()
            }
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
    sendTo(namespace, 'setDeviceDebug', {id:id}, function (msg) {
        sendTo(namespace, 'getDebugDevices', {}, function(msg) {
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
    sendTo(namespace, 'updateLocalConfigItems', {target: device, data:data, global:global}, function(msg) {
        if (msg && msg.hasOwnProperty.error) {
            showMessage(msg.error, _('Error'));
        }
        getDevices();
    });
}


async function selectImageOverride(id) {
    const dev = devices.find((d) => d._id == id);
    const imghtml = `<img src="${dev.common.icon || dev.icon}" width="80px">`
    //console.error(imghtml)
    const selectItems= [''];
    $('#chooseimage').find('input[id=\'d_name\']').val(dev.common.name);
    $('#chooseimage').find('.currentIcon').html(imghtml);

    sendTo(namespace, 'getLocalImages', {}, function(msg) {
        if (msg && msg.imageData) {
            const imagedata = msg.imageData;
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

            $('#chooseimage a.btn[name=\'save\']').unbind('click');
            $('#chooseimage a.btn[name=\'save\']').click(() => {
                const image = $('#chooseimage').find('#images option:selected').val();
                const global = $('#chooseimage').find('#globaloverride').prop('checked');
                const name = $('#chooseimage').find('input[id=\'d_name\']').val();
                const data = {};
                if (image != 'current') data.icon= image;
                if (name != dev.common.name) data.name = name;
                updateLocalConfigItems(id, data, global);
            });
            $('#chooseimage').modal('open');
            Materialize.updateTextFields();
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
                if (idx==0)
                    LHtml.push(`<td${rowspan}>${item.dataID.toString(16).slice(-4)}</td><td${rowspan}>${safestring(item.payload)}</td>`);
                LHtml.push(`<td></td><td${redText}>${safestring(state.payload)}</td><td${redText}>${state.id}</td><td${redText}>${state.value}</td><td${redText}>${fne(item)}</td></tr>`);
                IHtml.unshift(...LHtml)
            }
            if (filter)
                if (filterSet.has(fs)) continue; else filterSet.add(fs);
            Html.unshift(...IHtml);
            isodd=!isodd;
        }
    }
    const ifbutton = `<a id="i_${devID}" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Update debug messages"><i class="material-icons large">${dbgMsgfilter.has('i_'+devID) ? 'filter_list' : 'format_align_justify' }</i></a>`
    const ofbutton = `<a id="hi_${devID}" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Update debug messages"><i class="material-icons large">${dbgMsghide.has('i_'+devID) ? 'unfold_more' : 'unfold_less' }</i></a>`
    const dataHide = dbgMsgfilter.has('hi_'+devID) ? 'Data hidden' : '&nbsp;';
    return `<thead id="dbgtable"><tr><td>&nbsp</td><td>Incoming messages</td><td>&nbsp;</td><td>&nbsp;</td><td>${dataHide}</td><td>${ifbutton}</td><td>${ofbutton}</td></tr><tr><td>ID</td><td>Zigbee Payload</td><td>&nbsp;</td><td>State Payload</td><td>ID</td><td>value</td><td>Flags</td></tr></thead><tbody>${Html.join('')}</tbody>`;
}


function HtmlFromOutDebugMessages(messages, devID, filter) {
    const Html = [];
    const filterSet = new Set();
    let isodd=true;
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
                if (idx==0)
                    LHtml.push(`<td${rowspan}>${item.dataID.toString(16).slice(-4)}</td><td${rowspan}>${safestring(item.payload)}</td>`);
                LHtml.push(`<td${redText}>${state.ep ? state.ep : ''}</td><td${redText}>${state.id}</td><td${redText}>${safestring(state.value)}</td><td${redText}>${safestring(state.payload)}</td><td${redText}>${fne(item)}</td></tr>`);
                IHtml.unshift(...LHtml);

            }
            if (filter)
                if (filterSet.has(fs)) continue; else filterSet.add(fs);
            Html.unshift(...IHtml);
            isodd=!isodd;
        }
    }
    const ifbutton = `<a id="o_${devID}" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Update debug messages"><i class="material-icons large">${dbgMsgfilter.has('o_'+devID) ? 'filter_list' : 'format_align_justify' }</i></a>`
    const ofbutton = `<a id="ho_${devID}" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Update debug messages"><i class="material-icons large">${dbgMsghide.has('o_'+devID) ? 'unfold_more' : 'unfold_less'}</i></a>`
    const dataHide = dbgMsgfilter.has('ho_'+devID) ? 'Data hidden' : '&nbsp;';
    return `<thead id="dbgtable"><tr><td>&nbsp</td><td>Outgoing messages</td><td>&nbsp;</td><td>&nbsp;</td><td>${dataHide}</td><td>${ifbutton}</td><td>${ofbutton}</td></tr><tr><td>ID</td><td>Zigbee Payload</td><td>EP</td><td>ID</td><td>value</td><td>State Payload</td><td>Flags</td></tr></thead><tbody>${Html.join('')}</tbody>`;
}


function displayDebugMessages(msg) {
    const buttonNames = [];
    if (msg.byId) {
        const dbgData = msg.byId;
        const keys = Object.keys(dbgData);
        const keylength = keys.length;
        const Html = [];
        const button = `<a id="e_all" class="btn-floating waves-effect waves-light green tooltipped center-align hoverable translateT" title="Update debug messages"><i class="material-icons large">sync_problem</i></a>`;
        const fbutton = `<a id="f_all" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Update debug messages"><i class="material-icons large">${dbgMsgfilter.size != 0 ? 'filter_list' : 'format_align_justify' }</i></a>`;
        const hbutton = `<a id="h_all" class="btn-floating waves-effect waves-light blue tooltipped center-align hoverable translateT" title="Update debug messages"><i class="material-icons large">${dbgMsghide.size != 0 ? 'unfold_more' : 'unfold_less'}</i></a>`;
        const logbutton = `<a id="l_all" class="btn-floating waves-effect waves-light ${debugInLog ? 'green' : 'red'} tooltipped center-align hoverable translateT" title="Log messages"><i class="material-icons large">${debugInLog ? 'speaker_notes' : 'speaker_notes_off'}</i></a>`;
        Html.push(`<li><table><thead id="dbgtable"><tr><td>${logbutton}</td><td colspan="3">Debug information by device</td><td>${fbutton}</td><td>${hbutton}</td><td>${button}</td></tr></thead><tbody>`);
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
                buttonNames.push(devID);
                Html.push(`<li><table><thead id="dbgtable"><tr><td colspan="4">${devName} (ID: ${devID} Model: ${dev && dev.common ? dev.common.name : 'unknown'})</td><td>${modelUrl}</td><td>&nbsp;</td><td>${button}</td></tr></thead><tbody>`);
                if (dbgData[devID].IN.length > 0) {
                    Html.push(`${HtmlFromInDebugMessages(dbgData[devID].IN, devID, dbgMsgfilter.has('i_'+devID))}`);
                }
                if (dbgData[devID].OUT.length > 0) {
                    Html.push(`${HtmlFromOutDebugMessages(dbgData[devID].OUT, devID, dbgMsgfilter.has('o_'+devID))}`);
                }
                Html.push('</tbody></table></li>');
            }
            $('#dbg_data_list').html(Html.join(''));
        }
        $(`#e_all`).click(function () {
            getDebugMessages();
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
                getDebugMessages();
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
    }
}

function getDebugMessages() {
    sendTo(namespace, 'getDebugMessages', { inlog: debugInLog }, function(msg) {
        debugMessages = msg;
        if (msg) displayDebugMessages(debugMessages)
    })
}


function getDevices() {
    getCoordinatorInfo();
    sendTo(namespace, 'getDevices', {}, function (msg) {
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

            //check if debug messages are sent alongside
            if (msg && typeof (msg.debugDevices == 'array')) {
                debugDevices = msg.debugDevices;
                console.warn('debug devices is sent')
            }
            else
                debugDevices = [];
            if (debugMessages.byId) {
                debugMessages.byId = msg;
                if (msg) displayDebugMessages(debugMessages)
            }
            if (msg.error) {
                errorData.push(msg.error);
                isHerdsmanRunning = false;
                updateStartButton();
            } else {
                isHerdsmanRunning = true;
                updateStartButton();
                showDevices();
                getDebugMessages();
                getExclude();
                getBinding();
            }
        }
    });
}

function getNamedColors() {
    sendTo(namespace, 'getNamedColors', {}, function(msg) {
        if (msg && typeof msg.colors) {
            namedColors = msg.colors;
        }
    });
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

function getMap() {
    $('#refresh').addClass('disabled');
    sendTo(namespace, 'getMap', {}, function (msg) {
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



// the function loadSettings has to exist ...

function load(settings, onChange) {
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
    getDevices();
    getNamedColors();
    readNVRamBackup(false);
    //getDebugMessages();
    //getMap();
    //addCard();

    // Signal to admin, that no changes yet
    onChange(false);

    $('#test-btn').click(function () {
        console.warn(`isHerdsmanRunning: ${isHerdsmanRunning}`)
        if (!isHerdsmanRunning) {
            const port = $('#port.value').val();
            console.warn(`port is ${port}`)
            showWaitingDialog(`Trying to connect to ${port}`, 300);
            sendTo(namespace, 'testConnection', { address:port }, function(msg) {
                console.warn(`send to returned with ${JSON.stringify(msg)}`);
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
        console.warn(`isHerdsmanRunning: ${isHerdsmanRunning}`)
        doTestStart(!isHerdsmanRunning);
    });

    $('#state_cleanup_btn').click(function () {
        cleanConfirmation();
    });
    $('#show_errors_btn').click(function () {
        showMessage(errorData.join('<br>'), 'Stashed error messages');
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
            letsPairing();
        }
        showPairingProcess();
    });

    $('#refresh').click(function () {
        getMap();
    });

    $('#reset-btn').click(function () {
        resetConfirmation();
    });

    $('#deleteNVRam-btn').click(function () {
        deleteNvBackupConfirmation();
    });

    $('#viewconfig').click(function () {
        showViewConfig();
    });

    $('#scan').click(function () {
        showChannels();
    });
    $('#scan_t').click(function () {
        showChannels();
    });

    sendTo(namespace, 'getGroups', {}, function (data) {
        groups = data.groups;
        //showGroups();
    });

    $('#add_group').click(function () {
        const maxind = parseInt(Object.getOwnPropertyNames(groups).reduce((a, b) => a > b ? a : b, 0));
        addGroup(maxind + 1, 'Group ' + maxind + 1);
    });

    $('#add_grp_btn').click(function () {
        const maxind = parseInt(Object.getOwnPropertyNames(groups).reduce((a, b) => a > b ? a : b, 0));
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

    sendTo(namespace, 'getLibData', {key: 'cidList'}, function (data) {
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

function showPairingProcess() {
    $('#modalpairing').modal({
        startingTop: '4%',
        endingTop: '10%',
        dismissible: false
    });

    $('#modalpairing').modal('open');
    Materialize.updateTextFields();
}

function doTestStart(start) {
    updateStartButton(true);
    if (start) {
        const ovr = { extPanID:$('#extPanID.value').val(),
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
        sendTo(namespace, 'testConnect', { start:true, zigbeeOptions:ovr }, function(msg) {
            if (msg) {
                if (msg.status)
                    $('#testStartStop').removeClass('disabled');
                else
                    $('#testStartStart').removeClass('disabled');
            }
        })
    }
    else {
        //$('#testStartStop').addClass('disabled');
        sendTo(namespace, 'testConnect', { start:false }, function(msg) {
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
        $('#ErrorNotificationIcon').removeClass('icon-red')
        $('#ErrorNotificationIcon').addClass('icon-orange')
        return;
    }
    if (isHerdsmanRunning)
    {
        $('#ErrorNotificationBtn').addClass('hide')
        $('#ErrorNotificationBtn').removeClass('blinking');
        $('#show_test_run').removeClass('disabled');
        $('#deleteNVRam-btn').removeClass('disabled');
        $('#reset-btn').removeClass('disabled');
    }
    else {
        $('#ErrorNotificationIcon').addClass('icon-red')
        $('#ErrorNotificationIcon').removeClass('icon-orange')
        $('#ErrorNotificationBtn').removeClass('hide')
        $('#ErrorNotificationBtn').addClass('blinking');
        $('#show_test_run').removeClass('disabled');
        $('#deleteNVRam-btn').removeClass('disabled');
        $('#reset-btn').addClass('disabled');
    }
}
// subscribe to changes
socket.emit('subscribe', namespace + '.*');
socket.emit('subscribeObjects', namespace + '.*');

// react to changes
socket.on('stateChange', function (id, state) {
    // only watch our own states
    if (id.substring(0, namespaceLen) !== namespace) return;
    //console.log('stateChange', id, state);
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
    //console.log('objectChange', id, obj);
    if (obj && obj.type == 'device') { // && obj.common.type !== 'group') {
        updateDevice(id);
    }
    if (!obj) {
        // delete state or device
        const elems = id.split('.');
        //console.log('elems', elems);
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
        const node = {
            id: dev._id,
            label: (dev.link_quality > 0 ? dev.common.name : `${dev.common.name}\n(disconnected)`),
            title: dev._id.replace(namespace + '.', '') + extInfo,
            shape: 'circularImage',
            image: dev.common.icon || dev.icon,
            imagePadding: {top: 5, bottom: 5, left: 5, right: 5},
            color: {background: '#cccccc', highlight: {background: 'white'}},
            font: {color: '#00bb00'},
            borderWidth: 1,
            borderWidthSelected: 4,
        };
        if (dev.info && dev.info.device._type == 'Coordinator') {
            // node.shape = 'star';
            node.image = 'zigbee.png';
            node.label = 'Coordinator';
            // delete node.color;
        }
        return node;
    };

    if (map.lqis) {
        map.lqis.forEach((mapEntry) => {
            const dev = getDevice(mapEntry.ieeeAddr);
            if (!dev) {
                //console.log("No dev with ieee "+mapEntry.ieeeAddr);
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
                const parentDev = getDevice(mapEntry.parent);
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
                if (dev.info && dev.info.device._type == 'Coordinator') {
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
    sendTo(namespace, 'listUart', null, function (list) {
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
                if (device.info.device._type === 'Coordinator') {
                    return null;
                }
                return `${device.common.name} (${device.info.name})`;
            } else { // fallback if device in list but not paired
                return device.common.name + ' ' + device.native.id;
            }
        },
        function (key, device) {
            return device._id;
        });
    // add groups to device selector
    const groupList = [];
    for (const key in groups) {
        groupList.push({
            _id: namespace + '.' + key.toString(16).padStart(16, '0'),
            groupId: key,
            groupName: groups[key]
        });
    }
    updateSelect('#dev', groupList,
        function (key, device) {
            return 'Group ' + device.groupId + ': ' + device.groupName;
        },
        function (key, device) {
            return device._id;
        }, true);

    // fill cid, cmd, type selector
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
                return obj._id === this.value;
            });

            const epList = device ? device.info.device._endpoints : null;
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
                console.log('Reply from zigbee: ' + JSON.stringify(reply));
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
    sendTo(namespace, 'getLibData', {key: 'respCodes'}, function (data) {
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

    sendTo(namespace, 'sendToZigbee', data, function (reply) {
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
    sendTo(namespace, 'getLibData', {key: key, cid: cid}, function (data) {
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
    sendTo(namespace, 'renameGroup', {id: newId, name: newName, remove: remove}, function (msg) {
        if (msg && msg.error) {
            showMessage(msg.error, _('Error'));
        }
        getDevices();
    });
}

function deleteGroup(id) {
    delete groups[id];
    sendTo(namespace, 'deleteGroup', id, function (msg) {
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
        sendTo(namespace, 'updateGroupMembership', command, function (msg) {
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
        sendTo(namespace, 'renameDevice', command, function(msg) {
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
        sendTo(namespace, 'reset', {mode: e.target.id}, function (err) {
            if (err) {
                console.log(err);
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
                if (device.info.device._type === 'Coordinator') {
                    return null;
                }
                // check for output clusters
                let allow = false;
                for (const cluster of allowClusters) {
                    for (const ep of device.info.endpoints) {
                        if (ep.outputClusters.includes(cluster)) {
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
                if (device.info.device._type === 'Coordinator') {
                    return null;
                }
                // check for input clusters
                let allow = false;
                for (const cluster of allowClusters) {
                    for (const ep of device.info.endpoints) {
                        if (ep.inputClusters.includes(cluster)) {
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
            const clusters = ep.outputClusters.map((cl) => {
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
            const clusters = ep.inputClusters.map((cl) => {
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
    sendTo(namespace, 'addBinding', {
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
    sendTo(namespace, 'editBinding', {
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
    sendTo(namespace, 'getBinding', {}, function (msg) {
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
    sendTo(namespace, 'delBinding', id, (msg) => {
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
    //console.log(device);
    const dev = (device && device.info) ? device.info.device : undefined;
    const mapped = (device && device.info) ? device.info.mapped : undefined;
    if (!dev) return `<div class="truncate">No info</div>`;
    const genRow = function (name, value, refresh) {
        if (value === undefined) {
            return '';
        } else {
            return `<li><span class="label">${name}:</span><span>${value}</span></li>`;
        }
    };
    const genRowValues = function (name, value) {
        if (value === undefined) {
            return '';
        } else {
            let label = `${name}:`;
            return value.map((val) => {
                const row = `<li><span class="label">${label}</span><span>${val}</span></li>`;
                label = '';
                return row;
            }).join('');
        }
    };
    const modelUrl = (!mapped) ? '' : `<a href="https://www.zigbee2mqtt.io/devices/${sanitizeModelParameter(mapped.model)}.html" target="_blank" rel="noopener noreferrer">${mapped.model}</a>`;
    const mappedInfo = (!mapped) ? '' :
        `<div style="font-size: 0.9em">
            <ul>
                ${genRow('model', modelUrl)}
                ${genRow('description', mapped.description)}
                ${genRow('supports', mapped.supports)}
            </ul>
        </div>`;
    let epInfo = '';
    for (const epind in dev._endpoints) {
        const ep = dev._endpoints[epind];
        epInfo +=
            `<div style="font-size: 0.9em" class="truncate">
                <ul>
                    ${genRow('endpoint', ep.ID)}
                    ${genRow('profile', ep.profileID)}
                    ${genRowValues('input clusters', ep.inputClusters.map(findClName))}
                    ${genRowValues('output clusters', ep.outputClusters.map(findClName))}
                </ul>
            </div>`;
    }
    const imgSrc = device.icon || device.common.icon;
    const imgInfo = (imgSrc) ? `<img src=${imgSrc} width='150px' onerror="this.onerror=null;this.src='img/unavailable.png';"><div class="divider"></div>` : '';
    const info =
        `<div class="col s12 m6 l6 xl6">
            ${imgInfo}
            ${mappedInfo}
            <div class="divider"></div>
            <div style="font-size: 0.9em" class="truncate">
                <ul>
                    ${genRow('modelZigbee', dev._modelID)}
                    ${genRow('type', dev._type)}
                    ${genRow('ieee', dev.ieeeAddr)}
                    ${genRow('nwk', dev._networkAddress)}
                    ${genRow('manuf id', dev._manufacturerID)}
                    ${genRow('manufacturer', dev._manufacturerName)}
                    ${genRow('power', dev._powerSource)}
                    ${genRow('app version', dev._applicationVersion)}
                    ${genRow('hard version', dev._hardwareVersion)}
                    ${genRow('zcl version', dev._zclVersion)}
                    ${genRow('stack version', dev._stackVersion)}
                    ${genRow('date code', dev._dateCode)}
                    ${genRow('build', dev._softwareBuildID)}
                    ${genRow('interviewed', dev._interviewCompleted)}
                    ${genRow('configured', (device.isConfigured), true)}
                </ul>
            </div>
        </div>
        <div class="col s12 m6 l6 xl6">
        ${epInfo}
        </div>`;
    return info;
}

function showDevInfo(id) {
    const info = genDevInfo(getDeviceByID(id));
    $('#devinfo').html(info);
    $('#modaldevinfo').modal('open');
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
    sendTo(namespace, 'getChannels', {}, function (msg) {
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
                if (device.info.device._type == 'Coordinator') {
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
        sendTo(namespace, 'addExclude', { exclude_model: exclude_model }, function (msg) {
            closeWaitingDialog();
            if (msg) {
                if (msg.error) {
                    showMessage(msg.error, _('Error'));
                }
            }
            console.log('getting excludes ?');
            getExclude();
        });
    else closeWaitingDialog();
}

function getExclude() {
    sendTo(namespace, 'getExclude', {}, function (msg) {
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
    sendTo(namespace, 'delExclude', id, (msg) => {
        closeWaitingDialog();
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            }
        }
        console.log('getting excludes ?');
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

function getDashCard(dev, groupImage, groupstatus) {
    const title = dev.common.name,
        id = dev._id,
        type = dev.common.type,
        img_src = (groupImage ? groupImage : dev.common.icon || dev.icon),
        isActive = !dev.common.deactivated,
        rooms = [],
        lang = systemLang || 'en';
    const paired = (dev.paired) ? '' : '<i class="material-icons right">leak_remove</i>';
    const rid = id.split('.').join('_');
    const modelUrl = (!type) ? '' : `<a href="https://www.zigbee2mqtt.io/devices/${type}.html" target="_blank" rel="noopener noreferrer">${type}</a>`;
    const image = `<img src="${img_src}" width="64px" onerror="this.onerror=null;this.src='img/unavailable.png';">`,
        nwk = (dev.info && dev.info.device) ? dev.info.device._networkAddress : undefined,
        battery_cls = getBatteryCls(dev.battery),
        lqi_cls = getLQICls(dev.link_quality),
        unconnected_icon = (groupImage ? (groupstatus ? '<div class="col tool"><i class="material-icons icon-green">check_circle</i></div>' : '<div class="col tool"><i class="material-icons icon-red">cancel</i></div>') :'<div class="col tool"><i class="material-icons icon-red">leak_remove</i></div>'),
        battery = (dev.battery && isActive) ? `<div class="col tool"><i id="${rid}_battery_icon" class="material-icons ${battery_cls}">battery_std</i><div id="${rid}_battery" class="center" style="font-size:0.7em">${dev.battery}</div></div>` : '',
        lq = (dev.link_quality > 0 && isActive) ? `<div class="col tool"><i id="${rid}_link_quality_icon" class="material-icons ${lqi_cls}">network_check</i><div id="${rid}_link_quality" class="center" style="font-size:0.7em">${dev.link_quality}</div></div>` : (isActive ? unconnected_icon : ''),
        //status = (dev.link_quality > 0 && isActive) ? `<div class="col tool"><i class="material-icons icon-green">check_circle</i></div>` : (groupImage || !isActive ? '' : `<div class="col tool"><i class="material-icons icon-black">leak_remove</i></div>`),
        //permitJoinBtn = (isActive && dev.info && dev.info.device._type === 'Router') ? '<button name="join" class="btn-floating btn-small waves-effect waves-light right hoverable green"><i class="material-icons tiny">leak_add</i></button>' : '',
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
            <div class="flip" style="cursor: pointer">
            <span class="top right small" style="border-radius: 50%">
                ${idleTime}
                ${battery}
                ${lq}
            </span>
            <span class="card-title truncate">${title}</span>
            </div>
            <i class="left">${image}</i>
            <div style="min-height:88px; font-size: 0.8em; height: 130px; overflow-y: auto" class="truncate">
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
        sendTo(namespace, 'setState', {id: id, val: val}, function (data) {
            //console.log(data);
        });
    });
    $('input[type=\'range\']').change(function (event) {
        const val = $(this).val();
        const id = $(this).parents('.state').attr('oid');
        sendTo(namespace, 'setState', {id: id, val: val}, function (data) {
            //console.log(data);
        });
    });
    $('.state select').on('change', function () {
        const val = $(this).val();
        const id = $(this).parents('.state').attr('oid');
        sendTo(namespace, 'setState', {id: id, val: val}, function (data) {
            //console.log(data);
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

function updateDevice(id) {
    sendTo(namespace, 'getDevice', {id: id}, function (msg) {
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
        sendTo(namespace, 'setDeviceActivated', {id: id, deactivated: dev.common.deactivated}, function () {
            showDevices();
        });
    }
}

function reconfigureDlg(id) {
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
    sendTo(namespace, 'reconfigure', {id: id}, function (msg) {
        closeWaitingDialog();
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            }
        }
    });
    showWaitingDialog('Device is being reconfigure', 30);
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
            console.warn(`warning set for ${key} (${val})`)
            $(`#${key}_ALERT`).removeClass('hide')
        } else $(`#${key}_ALERT`).addClass('hide')
    }
    if (nvRamBackup[key]) {
        console.warn(`value of ${key} is ${val} (${nvRamBackup[key]})`);
        if ((typeof val == 'string' && typeof nvRamBackup[key] == 'string' && val.toLowerCase == nvRamBackup[key].toLowerCase) || val == nvRamBackup[key])
        {
            console.warn(`ok set for ${key} (${val})`)
            $(`#${key}_OK`).removeClass('hide')
            $(`#${key}_NOK`).addClass('hide')
        }
        else
        {
            console.warn(`nok set for ${key} (${val})`)
            $(`#${key}_OK`).addClass('hide')
            $(`#${key}_NOK`).removeClass('hide')
        }
    }
    else {
        console.warn(`noval set for ${key} (${val})`)
        $(`#${key}_OK`).addClass('hide')
        $(`#${key}_NOK`).addClass('hide')
    }
}

function validateNVRamBackup(update, src) {
    console.warn('validateNVRam');
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
    console.warn('read nvRam')
    sendTo(namespace, 'readNVRam', {}, function(msg) {
        if (msg) {
            if (msg.error && update) {
                showMessages(msg.error, _('Error'));
                delete msg.error;
            }
            nvRamBackup = msg;
            validateNVRamBackup(update)
        }
    });

}
