/*global $, M, _, sendTo, systemLang, translateWord, translateAll, showMessage, socket, document, instance, vis, Option, noConfigDialog*/

/*
 * you must run 'iobroker upload zigbee' if you edited this file to make changes visible
 */
const Materialize = (typeof M !== 'undefined') ? M : Materialize,
    anime = (typeof M !== 'undefined') ? M.anime : anime,
    namespace = 'zigbee.' + instance,
    namespaceLen = namespace.length;
let devices = [],
    messages = [],
    map = {},
    mapEdges = null,
    network,
    networkEvents,
    responseCodes = false,
    groups = {},
    devGroups = {},
    binding = [],
    cidList;

const savedSettings = [
    'port', 'panID', 'channel', 'disableLed', 'countDown', 'groups', 'extPanID', 'precfgkey', 'transmitPower',
    'adapterType', 'debugHerdsman',
];

function getDeviceByID(ID) {
    return devices.find((devInfo) => {
        try {
            return devInfo._id == ID;
        }  catch (e) {
            //console.log("No dev with ieee " + ieeeAddr);
        }
    });
}

function getDevice(ieeeAddr) {
    return devices.find((devInfo) => {
        try {
            return devInfo.info.device._ieeeAddr == ieeeAddr;
        }  catch (e) {
            //console.log("No dev with ieee " + ieeeAddr);
        }
    });
}

function getDeviceByNetwork(nwk) {
    return devices.find((devInfo) => {
        try {
            return devInfo.info.device._networkAddress == nwk;
        }  catch (e) {
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
    return '';
}

function getCard(dev) {
    const title = dev.common.name,
        id = dev._id,
        type = dev.common.type,
        img_src = dev.icon || dev.common.icon,
        rooms = [],
        lang = systemLang  || 'en';
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
    const image = `<img src="${img_src}" width="80px">`,
        nwk = (dev.info && dev.info.device) ? dev.info.device._networkAddress : undefined,
        status = `<div class="col tool">${(nwk) ? '<i class="material-icons icon-green">check_circle</i>' : '<i class="material-icons icon-black">leak_remove</i>'}</div>`,
        battery_cls = getBatteryCls(dev.battery),
        lqi_cls = getLQICls(dev.link_quality),
        battery = (dev.battery) ? `<div class="col tool"><i id="${rid}_battery_icon" class="material-icons ${battery_cls}">battery_std</i><div id="${rid}_battery" class="center" style="font-size:0.7em">${dev.battery}</div></div>` : '',
        lq = (dev.link_quality) ? `<div class="col tool"><i id="${rid}_link_quality_icon" class="material-icons ${lqi_cls}">network_check</i><div id="${rid}_link_quality" class="center" style="font-size:0.7em">${dev.link_quality}</div></div>` : '',
        info = `<div style="min-height:88px; font-size: 0.8em" class="truncate">
                    <ul>
                        <li><span class="label">ieee:</span><span>0x${id.replace(namespace+'.', '')}</span></li>
                        <li><span class="label">nwk:</span><span>${(nwk) ? nwk.toString()+' (0x'+nwk.toString(16)+')' : ''}</span></li>
                        <li><span class="label">model:</span><span>${type}</span></li>                        
                        <li><span class="label">groups:</span><span>${dev.groupNames || ''}</span></li>
                    </ul>
                </div>`,
        permitJoinBtn = (dev.info && dev.info.device._type == 'Router') ? '<button name="join" class="btn-floating btn-small waves-effect waves-light right hoverable green"><i class="material-icons tiny">leak_add</i></button>' : '',
        infoBtn = (nwk) ? `<button name="info" class="left btn-flat btn-small"><i class="material-icons icon-blue">info</i></button>` : '';
    const card = `<div id="${id}" class="device col s12 m6 l4 xl3">
                  <div class="card hoverable">
                    <div class="card-content zcard">
                        <span class="top right small" style="border-radius: 50%">
                            ${battery}
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
                            ${infoBtn}
                            <span class="left" style="padding-top:8px">${room}</span>
                            <span class="left fw_info"></span>
                            <button name="delete" class="right btn-flat btn-small">
                                <i class="material-icons icon-black">delete</i>
                            </button>
                            <button name="edit" class="right btn-flat btn-small">
                                <i class="material-icons icon-green">edit</i>
                            </button>
                            ${permitJoinBtn}
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
function closeReval(e, id){
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
        complete: function(anim) {
            const el = anim.animatables[0].target;
            $(el).css({ display: 'none'});
            $card.css('overflow', $card.data('initialOverflow'));
        }
    });
}

function deleteConfirmation(id, name) {
    const text = translateWord('Do you really want to delete device') + ' "'+name+'" ('+id+')?';
    $('#modaldelete').find('p').text(text);
    $('#force').prop('checked', false);
    $('#forcediv').removeClass('hide');
    $("#modaldelete a.btn[name='yes']").unbind('click');
    $("#modaldelete a.btn[name='yes']").click(() => {
        const force = $('#force').prop('checked');
        deleteDevice(id, force);
    });
    $('#modaldelete').modal('open');
    Materialize.updateTextFields();
}

function editName(id, name) {
    const dev = devices.find((d) => d._id == id);
    $('#modaledit').find("input[id='d_name']").val(name);
    if (dev.info && dev.info.device._type == 'Router') {
        list2select('#d_groups', groups, devGroups[id] || []);
        $('#modaledit').find('.input-field.groups').removeClass('hide');
    } else {
        $('#modaledit').find('.input-field.groups').addClass('hide');
    }
    $("#modaledit a.btn[name='save']").unbind('click');
    $("#modaledit a.btn[name='save']").click(() => {
        const newName = $('#modaledit').find("input[id='d_name']").val(),
            newGroups = $('#d_groups').val();
        updateDev(id, newName, newGroups);
    });
    $('#modaledit').modal('open');
    Materialize.updateTextFields();
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

function renameDevice(id, name) {
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
    devices.sort((a, b)=>{
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
    devGroups = {};
    for (let i=0;i < devices.length; i++) {
        const d = devices[i];
        if (d.info && d.info.device._type == 'Coordinator') continue;
        //if (d.groups && d.info && d.info.device._type == "Router") {
        if (d.groups) {
            devGroups[d._id] = d.groups;
            d.groupNames = d.groups.map(item=>{
                return groups[item] || '';
            }).join(', ');
        }
        const card = getCard(d);
        html += card;
    }
    $('#devices').html(html);

    const getDevName = function(dev_block) {
        return dev_block.find('#dName').text();
    };
    const getDevId = function(dev_block) {
        return dev_block.attr('id');
    };
    $(".card-reveal-buttons button[name='delete']").click(function() {
        const dev_block = $(this).parents('div.device');
        deleteConfirmation(getDevId(dev_block), getDevName(dev_block));
    });
    $(".card-reveal-buttons button[name='edit']").click(function() {
        const dev_block = $(this).parents('div.device'),
            id = getDevId(dev_block),
            name = getDevName(dev_block);
        editName(id, name);
    });
    $("button.btn-floating[name='join']").click(function() {
        const dev_block = $(this).parents('div.device');
        if (!$('#pairing').hasClass('pulse'))
            joinProcess(getDevId(dev_block));
        showPairingProcess();
    });
    $(".card-reveal-buttons button[name='info']").click(function() {
        const dev_block = $(this).parents('div.device');
        showDevInfo(getDevId(dev_block));
    });
    $("a.btn[name='done']").click((e) => {
        const dev_block = $(this).parents('div.device');
        closeReval(e, getDevId(dev_block), getDevName(dev_block));
    });
    $("a.btn-flat[name='close']").click((e) => {
        closeReval(e);
    });

    showNetworkMap(devices, map);
    translateAll();
}

function checkFwUpdate() {
    const deviceCards = getDeviceCards();
    const getFwInfoNode = function(deviceCard) {
        return deviceCard.find('.fw_info');
    };
    const createBtn = function(icon, hint, disabled, color) {
        const disabledAttr = disabled ? '[disabled]="true"' : '';
        if (!color) {
            color = !disabled ? 'icon-green' : '';
        }
        return `<button name="fw_update" class="left btn-flat btn-small" title="${hint}" ${disabledAttr}>
            <i class="material-icons ${color}">${icon}</i></button>`;
    };
    const callback = function(msg) {
        if (msg) {
            const deviceCard = getDeviceCard(msg.device);
            const devId = getDevId(deviceCard.attr('id'));
            const fwInfoNode = getFwInfoNode(deviceCard);
            if (msg.status == 'available') {
                fwInfoNode.html(createBtn('system_update', 'Click to start firmware update', false));
                $(fwInfoNode).find("button[name='fw_update']").click(() => {
                    fwInfoNode.html(createBtn('check_circle', 'Firmware update started, check progress in logs.', true, 'icon-blue'));
                    sendTo(namespace, 'startOta', {devId: devId}, (msg) => {
                        fwInfoNode.html(createBtn('check_circle', 'Finished, see logs.', true));
                        console.log(msg);
                    });
                });
            } else if (msg.status == 'not_available') {
                fwInfoNode.html(createBtn('check_circle', 'Up-to-date', true));
            } else if (msg.status == 'fail') {
                fwInfoNode.html(createBtn('check_circle', 'Firmware check failed, '+msg.msg, true, 'icon-red'));
            } else {
                fwInfoNode.html(createBtn('not_interested', 'No firmware update available', true));
            }
        }
    };
    for (let i=0;i < deviceCards.length; i++) {
        const deviceCard = $(deviceCards[i]);
        const devId = getDevId(deviceCard.attr('id'));
        getFwInfoNode(deviceCard).html('<span class="left" style="padding-top:8px">checking...</span>');
        sendTo(namespace, 'checkOtaAvail', {devId: devId}, callback);
    }
}

function letsPairing() {
    messages = [];
    sendTo(namespace, 'letsPairing', {}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            }
        }
    });
}

function touchlinkReset() {
    messages = [];
    sendTo(namespace, 'touchlinkReset', {}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            }
        }
    });
}

function joinProcess(devId) {
    messages = [];
    sendTo(namespace, 'letsPairing', {id: devId}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            }
        }
    });
}


function getDevices() {
    sendTo(namespace, 'getDevices', {}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            } else {
                devices = msg;
                showDevices();
                getBinding();
            }
        }
    });
}

function getDeviceCards() {
    return $('#devices .device');
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
                showMessage(msg.error, _('Error'));
            } else {
                map = msg;
                showNetworkMap(devices, map);
            }
        }
    });
}

// the function loadSettings has to exist ...
// eslint-disable-next-line no-unused-vars
function load(settings, onChange) {
    if (settings.panID === undefined) settings.panID = 6754;
    if (settings.extPanID === undefined) settings.extPanID = 'DDDDDDDDDDDDDDDD';
    // fix for previous wrong value
    if (settings.extPanID === 'DDDDDDDDDDDDDDD') settings.extPanID = 'DDDDDDDDDDDDDDDD';
    if (settings.precfgkey === undefined) settings.precfgkey = '01030507090B0D0F00020406080A0C0D';
    if (settings.channel === undefined) settings.channel = 11;

    // example: select elements with id=key and class=value and insert value
    for (const key in settings) {
        if (savedSettings.indexOf(key) === -1) continue;
        // example: select elements with id=key and class=value and insert value
        const value = $('#' + key + '.value');
        if (value.attr('type') === 'checkbox') {
            value.prop('checked', settings[key]).change(function () {
                onChange();
            });
        } else {
            value.val(settings[key]).change(function () {
                onChange();
            }).keyup(function () {
                $(this).trigger('change');
            });
        }
    }

    getComPorts(onChange);

    //dialog = new MatDialog({EndingTop: '50%'});
    getDevices();
    getMap();
    //addCard();

    // Signal to admin, that no changes yet
    onChange(false);

    $('#fw_check_btn').click(function() {
        checkFwUpdate();
    });
    $('#touchlink_btn').click(function() {
        touchlinkReset();
        showPairingProcess();
    });
    $('#pairing').click(function() {
        if (!$('#pairing').hasClass('pulse'))
            letsPairing();
        showPairingProcess();
    });

    $('#refresh').click(function() {
        getMap();
    });

    $('#reset-btn').click(function() {
        resetConfirmation();
    });

    $('#viewconfig').click(function() {
        showViewConfig();
    });

    $('#scan').click(function() {
        showChannels();
    });

    sendTo(namespace, 'getGroups', {}, function (data) {
        groups = data;
        showGroups();
    });

    $('#add_group').click(function() {
        const maxind = parseInt(Object.getOwnPropertyNames(groups).reduce((a,b) => a>b ? a : b, 0));
        editGroupName(maxind+1, '');
    });

    $(document).ready(function() {
        $('.modal').modal({
            startingTop: '30%',
            endingTop: '10%',
        });
        $('.dropdown-trigger').dropdown({constrainWidth: false});
        Materialize.updateTextFields();
        $('.collapsible').collapsible();
        $('.tooltipped').tooltip();
        Materialize.Tabs.init($('.tabs'));
    });

    const text = $('#pairing').attr('data-tooltip');
    const transText = translateWord(text);
    if (transText) {
        $('#pairing').attr('data-tooltip', transText);
    }

    $('ul.tabs').on('click', 'a', function(e) {
        if ($(e.target).attr('id') == 'tabmap') {
            redrawMap();
        }
        if ($(e.target).attr('id') == 'develop') {
            loadDeveloperTab(onChange);
        }
    });

    $('#add_binding').click(function() {
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

// ... and the function save has to exist.
// you have to make sure the callback is called with the settings object as first param!
// eslint-disable-next-line no-unused-vars
function save(callback) {
    // example: select elements with class=value and build settings object
    const obj = {};
    $('.value').each(function () {
        const $this = $(this);
        if (savedSettings.indexOf($this.attr('id')) === -1) return;
        if ($this.hasClass('validate') && $this.hasClass('invalid')) {
            showMessage('Invalid input for ' +$this.attr('id'), _('Error'));
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
    return adapterDevId.split('.').slice(0,3).join('.');
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
                const percent = 100-100*state.val/($('#countDown').val() || 60);
                $('#progress_line').css('width', `${percent}%`);
            }
        } else if (id.match(/\.info\.pairingMessage$/)) {
            messages.push(state.val);
            showMessages();
        } else {
            const devId = getDevId(id);
            putEventToNode(devId);
            const rid = id.split('.').join('_');
            if (id.match(/\.link_quality$/)) {
                // update link_quality
                $(`#${rid}_icon`).removeClass('icon-red icon-orange').addClass(getLQICls(state.val));
                $(`#${rid}`).text(state.val);
            }
            if (id.match(/\.battery$/)) {
                // update battery
                $(`#${rid}_icon`).removeClass('icon-red icon-orange').addClass(getBatteryCls(state.val));
                $(`#${rid}`).text(state.val);
            }
        }
    }
});

socket.on('objectChange', function (id, obj) {
    if (id.substring(0, namespaceLen) !== namespace) return;
    //console.log('objectChange', id, obj);
    if (obj && obj.type == 'device' && obj.common.type !== 'group') {
        getDevices();
    }
    if (!obj) {
        // delete state or device
        const elems = id.split('.');
        //console.log('elems', elems);
        if (elems.length === 3) {
            getDevices();
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
        const node = nodesArray.find((node) => { return node.id == devId; });
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

function showNetworkMap(devices, map){
    // create an object with nodes
    const nodes = {};
    // create an array with edges
    const edges = [];

    if (map.lqis == undefined || map.lqis.length === 0) { // first init
        $('#filterParent, #filterSibl, #filterPrvChild, #filterMesh').change(function() {
            updateMapFilter();
        });
    }

    const createNode = function(dev, mapEntry) {
        const extInfo = (mapEntry && mapEntry.networkAddress) ? `\n (nwkAddr: 0x${mapEntry.networkAddress.toString(16)} | ${mapEntry.networkAddress})` : '';
        const node = {
            id: dev._id,
            label: dev.common.name,
            title: dev._id.replace(namespace+'.', '') + extInfo,
            shape: 'image',
            image: dev.icon,
            font: {color:'#007700'},
        };
        if (dev.info && dev.info.device._type == 'Coordinator') {
            node.shape = 'star';
            node.label = 'Coordinator';
        }
        return node;
    };

    if (map.lqis) {
        map.lqis.forEach((mapEntry)=>{
            const dev = getDevice(mapEntry.ieeeAddr);
            if (!dev) {
                //console.log("No dev with ieee "+mapEntry.ieeeAddr);
                return;
            }

            let node;
            if (!nodes.hasOwnProperty(mapEntry.ieeeAddr)) { // add node only once
                node = createNode(dev, mapEntry);
                nodes[mapEntry.ieeeAddr] = node;
            }
            else {
                node = nodes[mapEntry.ieeeAddr];
            }

            if (dev.info) {
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
                    if (mapEntry.status !== 'online' ) {
                        label = label + ' (off)';
                        linkColor = '#ff0000';
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
                    edge.label += '\n'+label;
                    edge.arrows.from = { enabled: false, scaleFactor: 0.5 }; // start hidden if node is not selected
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
                        arrows: { to: { enabled: false, scaleFactor: 0.5 }},
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

    // routing
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
                const linkColor = '#ff00ff';
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
        const node = nodesArray.find((node) => { return node.id == dev._id; });
        if (!node) {
            const node = createNode(dev);
            node.font = {color:'#ff0000'};
            if (dev.info && dev.info.device._type == 'Coordinator') {
                node.font = {color:'#000000'};
            }
            nodesArray.push(node);
        }
    });

    // create a network
    const container = document.getElementById('map');
    mapEdges = new vis.DataSet(edges);
    const data = {
        nodes: nodesArray,
        edges: mapEdges
    };
    const options = {
        autoResize: true,
        height: '100%',
        width: '100%',
        nodes: {
            shape: 'box'
        },
        layout: {
            improvedLayout:true,
        }
    };

    network = new vis.Network(container, data, options);

    const onMapSelect = function (event) {
        // workaround for https://github.com/almende/vis/issues/4112
        // may be moved to edge.chosen.label if fixed
        function doSelection(select, edges, data) {
            edges.forEach((edgeId => {
                const options = data.edges._data[edgeId];
                if (select) {
                    options.font.size = 15;
                } else {
                    options.font.size = 0;
                }
                network.clustering.updateEdge(edgeId, options);
            }));
        }

        if (event.hasOwnProperty('previousSelection')) { // unselect previous selected
            doSelection(false, event.previousSelection.edges, this.body.data);
        }
        doSelection(true, event.edges, this.body.data);

        // if (event.nodes) {
        //     event.nodes.forEach((node)=>{
        //         //const options = network.clustering.findNode[node];
        //         network.clustering.updateClusteredNode(
        //             node, {size: 50}
        //         );
        //     });
        // }
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
            networkEvents.forEach((event, index)=>{
                if (event.radius >= 1) {
                    toDelete.push(index);
                } else {
                    event.radius += 0.08;
                }
            });
            toDelete.forEach((index)=>{
                networkEvents.splice(index, 1);
            });
        }
    }
    network.on('beforeDrawing', function(ctx) {
        if (networkEvents.length > 0) {
            networkEvents.forEach((event)=>{
                const inode = event.node;
                const nodePosition = network.getPositions();
                event.radius = (event.radius > 1) ? 1 : event.radius;
                const cap = Math.cos(event.radius*Math.PI/2);
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
        const width = $('.adapter-body').width() || $('#main').width(),
            height = ($('.adapter-body').height() || ($('#main').height()-45)) -128;
        network.setSize(width, height);
        network.redraw();
        network.fit();
        network.moveTo({offset:{x:0.5 * width, y:0.5 * height}});
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
        if (!list) return;
        const element = $('#ports');
        for (let j = 0; j < list.length; j++) {
            element.append('<li><a href="#!">' + list[j].comName +'</a></li>');
        }
        $('#ports a').click(function() {
            $('#port').val($(this).text());
            Materialize.updateTextFields();
            onChange();
        });
    });
}

function loadDeveloperTab() {
    // fill device selector
    updateSelect('#dev', devices,
        function(key, device) {
            if (device.hasOwnProperty('info')) {
                if (device.info.device._type == 'Coordinator') {
                    return null;
                }
                return `${device.common.name} (${device.info.name})`;
            } else { // fallback if device in list but not paired
                device.common.name + ' ' +device.native.id;
            }
        },
        function(key, device) {
            return device._id;
        });
    // add groups to device selector
    const groupList = [];
    for (const key in groups) {
        groupList.push({'_id': namespace+'.'+key.toString(16).padStart(16, '0'), 'groupId': key, 'groupName': groups[key]});
    }
    updateSelect('#dev', groupList,
        function(key, device) {
            return 'Group '+device.groupId+': '+device.groupName;
        },
        function(key, device) {
            return device._id;
        }, true);

    // fill cid, cmd, type selector
    populateSelector('#cid', 'cidList');
    populateSelector('#cmd', 'cmdListFoundation', this.value);
    populateSelector('#type', 'typeList', this.value);

    if (responseCodes == false) {
        const getValue = function() { // convert to number if needed
            let attrData = $('#value-input').val();
            if (attrData.startsWith('"') && attrData.endsWith('"')) {
                attrData = attrData.substr(1, attrData.length -2);
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

        const prepareExpertData = function() {
            try {
                return JSON.parse($('#expert-json').val());
            } catch (exception) {
                showDevRunInfo('JSON error', exception, 'yellow');
            }
        };
        const setExpertData = function(prop, value, removeIfEmpty = true) {
            if (!$('#expert-mode').is(':checked')) {
                return;
            }
            if (!removeIfEmpty && value == null) { value = ''; }
            let data;
            if (prop) {
                data = prepareExpertData();
                // https://stackoverflow.com/a/6394168/6937282
                const assignVal = function index(obj,is, value) {
                    if (typeof is == 'string') {
                        return index(obj,is.split('.'), value);
                    } else if (is.length==1 && value!==undefined) {
                        if (value == null) {
                            return delete obj[is[0]];
                        } else {
                            return obj[is[0]] = value;
                        }
                    } else if (is.length==0) {
                        return obj;
                    } else
                        return index(obj[is[0]],is.slice(1), value);
                };
                assignVal(data, prop, value);
            } else {
                data = prepareData();
            }
            $('#expert-json').val(JSON.stringify(data, null, 4));
        };

        // init event listener only at first load
        $('#dev-selector').change(function() {
            if (this.selectedIndex <= 0) {
                return;
            }

            const device = devices.find(obj => {
                return obj._id === this.value;
            });

            const epList = device ? device.info.device._endpoints : null;
            updateSelect('#ep', epList,
                function(key, ep) {
                    return ep.ID;
                },
                function(key, ep) {
                    return ep.ID;
                });
            setExpertData('devId', this.value);
            setExpertData('ep', $('#ep-selector').val(), false);
        });

        $('#ep-selector').change(function() {
            setExpertData('ep', this.value);
        });

        $('#cid-selector').change(function() {
            populateSelector('#attrid', 'attrIdList', this.value);
            if ($('#cmd-type-selector').val() == 'functional') {
                const cid = $('#cid-selector option:selected').val();
                populateSelector('#cmd', 'cmdListFunctional', cid);
            }
            setExpertData('cid', this.value);
        });

        $('#cmd-type-selector').change(function() {
            if (this.value == 'foundation') {
                populateSelector('#cmd', 'cmdListFoundation');
            } else if (this.value == 'functional') {
                const cid = $('#cid-selector option:selected').val();
                populateSelector('#cmd', 'cmdListFunctional', cid);
            }
            setExpertData('cmdType', this.value);
        });

        $('#cmd-selector').change(function() {
            setExpertData('cmd', this.value);
        });
        $('#attrid-selector').change(function() {
            setExpertData('zclData', {[this.value]:{}});
        });

        // value selector checkbox
        $('#value-needed').change(function() {
            const attr = $('#attrid-selector').val();
            let attrData = null;
            if (this.checked === true) {
                $('#value-input').removeAttr('disabled');
                attrData = getValue();
            } else {
                $('#value-input').attr('disabled', 'disabled');
            }
            setExpertData('zclData.'+attr, attrData);
            $('#type-selector').select();
            Materialize.updateTextFields();
        });

        $('#value-input').keyup(function() {
            const attr = $('#attrid-selector').val();
            setExpertData('zclData.'+attr, getValue());
        });

        $('#expert-mode').change(function() {
            if (this.checked === true) {
                setExpertData();
                $('#expert-json-box').css('display', 'inline-block');
            } else {
                $('#expert-json-box').css('display', 'none');
            }
            $('#type-selector').select();
            Materialize.updateTextFields();
        });

        $('#dev-send-btn').click(function() {
            let data;
            if ($('#expert-mode').is(':checked')) {
                data = prepareExpertData();
            } else {
                data = prepareData();
            }
            sendToZigbee(data.devId, data.ep, data.cid, data.cmd, data.cmdType, data.zclData, data.cfg, function (reply) {
                console.log('Reply from zigbee: '+ JSON.stringify(reply));
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
        if (callback) {callback({localErr: 'Incomplete', errMsg: 'Please select Device and Endpoint!'});}
        return;
    }
    if (!cid || !cmd || !cmdType) {
        if (callback) {callback({localErr: 'Incomplete', errMsg: 'Please choose ClusterId, Command, CommandType and AttributeId!'});}
        return;
    }
    const data = {id: id, ep: ep, cid: cid, cmd: cmd, cmdType: cmdType, zclData: zclData, cfg: cfg};
    if (callback) {callback({localStatus: 'Send', errMsg: 'Waiting for reply...'});}

    const sendTimeout = setTimeout(function() {
        if (callback) {
            callback({localErr: 'Timeout', errMsg: 'We did not receive any response.'});
        }
    }, 15000);

    console.log('Send to zigbee, id '+id+ ',ep '+ep+', cid '+cid+', cmd '+cmd+', cmdType '+cmdType+', zclData '+JSON.stringify(zclData));

    sendTo(namespace, 'sendToZigbee', data, function(reply) {
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
    if (level == 'yellow') {
        card.removeClass( 'white-text' ).addClass( 'yellow-text' );
    }
    else {
        card.removeClass( 'yellow-text' ).addClass( 'white-text' );
    }
    $('#devActResult').text(result);
    $('#devInfoMsg').text(text);
}

function addDevLog(reply) {
    const statusCode = reply.statusCode;
    let logHtml = '<span>'+JSON.stringify(reply.msg)+'</span><br>';
    if (responseCodes != undefined) {
        const status = Object.keys(responseCodes).find(key => responseCodes[key] === statusCode);
        if (statusCode == 0) {
            logHtml = '<span class="green-text">'+status+'</span>   '+logHtml;
        } else {
            logHtml = '<span class="yellow-text">'+status+'</span>   '+logHtml;
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
    $(selectId+'>option:enabled').remove(); // remove existing elements
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
                    return attrName + ' ('+attr.ID +', type '+attr.type+')';
                },
                (attrName) => {
                    return attrName;
                });
        } else if (key === 'typeList') {
            updateSelect(selectId, list,
                (name, val) => {
                    return name +' ('+val+')';
                },
                (name, val) => {
                    return val;
                });
        } else {
            updateSelect(selectId, list,
                (propName, propInfo) => {
                    return propName +' ('+propInfo.ID+')';
                },
                (propName) => {
                    return propName;
                });
        }
    });
}

function updateSelect(id, list, getText, getId, append = false) {
    const selectId = id+'-selector';
    const mySelect = $(selectId);
    if (!append) {
        $(selectId+'>:not(:first[disabled])').remove(); // remove existing elements, except first if disabled, (is 'Select...' info)
        mySelect.select();
    }
    if (list == null && !append) {
        const infoOption = new Option('Nothing available');
        infoOption.disabled = true;
        mySelect.append( infoOption);
    }
    else {
        const keys = Object.keys(list); // is index in case of array
        for (let i=0; i<keys.length; i++) {
            const key = keys[i];
            const item = list[key];
            const optionText = getText(key, item);
            if (optionText == null) {
                continue;
            }
            mySelect.append( new Option(optionText, getId(key, item)));
        }
    }

    if ($(id+'-c-input').length > 0) {
        mySelect.append( new Option('CUSTOM', -2));
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

function showGroups() {
    $('#groups_table').find('.group').remove();
    if (!groups) return;
    const element = $('#groups_table');
    for (const j in groups) {
        if (groups.hasOwnProperty(j)) {
            element.append(`<tr id="group_${j}" class="group"><td>${j}</td><td><div>${groups[j]}<span class="right">`+
            `<a id="${j}" name="groupedit" class="waves-effect green btn-floating"><i class="material-icons">edit</i></a>`+
            `<a id="${j}" name="groupdelete" class="waves-effect red btn-floating"><i class="material-icons">delete</i></a></span></div></td></tr>`);
        }
    }
    $("a.btn-floating[name='groupedit']").click(function() {
        const index = $(this).attr('id'),
            name = groups[index];
        editGroupName(index, name);
    });
    $("a.btn-floating[name='groupdelete']").click(function() {
        const index = $(this).attr('id'),
            name = groups[index];
        deleteGroupConfirmation(index, name);
    });
}

function editGroupName(id, name) {
    //var text = 'Enter new name for "'+name+'" ('+id+')?';
    $('#groupedit').find("input[id='g_index']").val(id);
    $('#groupedit').find("input[id='g_name']").val(name);
    $("#groupedit a.btn[name='save']").unbind('click');
    $("#groupedit a.btn[name='save']").click(() => {
        const newId = $('#groupedit').find("input[id='g_index']").val(),
            newName = $('#groupedit').find("input[id='g_name']").val();
        updateGroup(id, newId, newName);
        showGroups();
    });
    $('#groupedit').modal('open');
    Materialize.updateTextFields();
}

function deleteGroupConfirmation(id, name) {
    const text = translateWord('Do you really whant to delete group') + ' "'+name+'" ('+id+')?';
    $('#modaldelete').find('p').text(text);
    $('#forcediv').addClass('hide');
    $("#modaldelete a.btn[name='yes']").unbind('click');
    $("#modaldelete a.btn[name='yes']").click(() => {
        deleteGroup(id);
        showGroups();
    });
    $('#modaldelete').modal('open');
}

function updateGroup(id, newId, newName) {
    delete groups[id];
    groups[newId] = newName;
    sendTo(namespace, 'updateGroups', groups);
}

function deleteGroup(id) {
    delete groups[id];
    sendTo(namespace, 'updateGroups', groups);
}

function updateDev(id, newName, newGroups) {
    const dev = devices.find((d) => d._id == id);
    if (dev && dev.common.name != newName) {
        renameDevice(id, newName);
    }
    if (dev.info.device._type == 'Router') {
        const oldGroups = devGroups[id] || [];
        if (oldGroups.toString() != newGroups.toString()) {
            devGroups[id] = newGroups;
            dev.groups = newGroups;
            // save dev-groups
            sendTo(namespace, 'groupDevices', devGroups, function (msg) {
                if (msg) {
                    if (msg.error) {
                        showMessage(msg.error, _('Error'));
                    }
                }
            });
            showDevices();
        }
    }
}

function resetConfirmation() {
    $('#modalreset').modal('open');
    const btn = $('#modalreset .modal-content a.btn');
    btn.unbind('click');
    btn.click(function(e) {
        sendTo(namespace, 'reset', {mode: e.target.id}, function (err) {
            if (err) {
                console.log(err);
            }
            else {
                console.log('Reseted');
            }
        });
    });
}

function showViewConfig() {
    $('#modalviewconfig').modal('open');
}

function prepareBindingDialog(bindObj){
    const binddevices = devices.slice();
    binddevices.unshift('');
    const bind_source = (bindObj) ? [bindObj.bind_source] : [''];
    const bind_target = (bindObj) ? [bindObj.bind_target] : [''];
    
    // 5 - genScenes, 6 - genOnOff, 8 - genLevelCtrl, 768 - lightingColorCtrl
    const allowClusters = [5, 6, 8, 768];
    const allowClustersName = {5: 'genScenes', 6: 'genOnOff', 8: 'genLevelCtrl', 768: 'lightingColorCtrl'};
    // fill device selector
    list2select('#bind_source', binddevices, bind_source,
        function(key, device) {
            if (device == '') {
                return 'Select source device';
            }
            if (device.hasOwnProperty('info')) {
                if (device.info.device._type == 'Coordinator') {
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
            }
            else { // fallback if device in list but not paired
                device.common.name + ' ' +device.native.id;
            }
        },
        function(key, device) {
            if (device == '') {
                return '';
            } else {
                return device._id;
            }
        },
        function(key, device) {
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
        function(key, device) {
            if (device == '') {
                return 'Select target device';
            }
            if (device.hasOwnProperty('info')) {
                if (device.info.device._type == 'Coordinator') {
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
        function(key, device) {
            if (device == '') {
                return '';
            } else {
                return device._id;
            }
        },
        function(key, device) {
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
                return allowClusters.includes(cl) ? {ID: ep.ID+'_'+cl, name: allowClustersName[cl]} : null;
            }).filter((i) => {return i != null;});
            return clusters.length == 0 ? null: [{ID: ep.ID, name: 'all'}, clusters];
        }).flat(2).filter((i) => {return i != null;});
        list2select('#bind_source_ep', sClusterList, (selected) ? [selected] : [],
            (key, ep) => {
                return ep.ID+' '+ep.name;
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
                return (allowClusters.includes(cl) && (!sourceCl || sourceCl == cl)) ? {ID: ep.ID+'_'+cl, name: allowClustersName[cl]} : null;
            }).filter((i) => {return i != null;});
            return clusters.length == 0 ? null: [{ID: ep.ID, name: 'all'}, clusters];
        }).flat(2).filter((i) => {return i != null;});
        list2select('#bind_target_ep', tClusterList, (selected) ? [selected] : [],
            (key, ep) => {
                return ep.ID+' '+ep.name;
            },
            (key, ep) => {
                return ep.ID;
            }
        );
    };

    $('#bind_source').change(function() {
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

    $('#bind_target').change(function() {
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

    $('#bind_source_ep').change(function() {
        $('#bind_target').trigger('change');
    });

    const unbind_fom_coordinator = bindObj ? bindObj.unbind_from_coordinator : false;
    $('#unbind_from_coordinator').prop('checked', unbind_fom_coordinator);
}

function addBindingDialog() {
    $("#bindingmodaledit a.btn[name='save']").unbind('click');
    $("#bindingmodaledit a.btn[name='save']").click(() => {
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
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            }
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
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'));
            }
        }
        getBinding();
    });
    showWaitingDialog('Device binding is being updated', 10);
}

function editBindingDialog(bindObj) {
    $("#bindingmodaledit a.btn[name='save']").unbind('click');
    $("#bindingmodaledit a.btn[name='save']").click(() => {
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
                                        <li><span class="label">source:</span><span>0x${bind_source.replace(namespace+'.', '')}</span></li>
                                        <li><span class="label">endpoint:</span><span>${bind_source_ep}</span></li>
                                        <li><span class="label">target:</span><span>0x${bind_target.replace(namespace+'.', '')}</span></li>
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

    $("#binding button[name='delete']").click(function() {
        const bind_id = $(this).parents('.binding')[0].id;
        deleteBindingConfirmation(bind_id);
    });
    $("#binding button[name='edit']").click(function() {
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
    $("#modaldelete a.btn[name='yes']").unbind('click');
    $("#modaldelete a.btn[name='yes']").click(() => {
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
    const genRow = function(name, value) {
        if (value === undefined) {
            return '';
        } else {
            return `<li><span class="labelinfo">${name}:</span><span>${value}</span></li>`;
        }
    };
    const genRowValues = function(name, value) {
        if (value === undefined) {
            return '';
        } else {
            let label = `${name}:`;
            return value.map((val) => {
                const row = `<li><span class="labelinfo">${label}</span><span>${val}</span></li>`;
                label = '';
                return row;
            }).join('');
        }
    };
    const mappedInfo = (!mapped) ? '' :
        `<div style="font-size: 0.9em">
            <ul>
                ${genRow('model', mapped.model)}               
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
    const info =
        `<div class="col s12 m6 l6 xl6">
            ${mappedInfo}
            <div class="divider"></div>
            <div style="font-size: 0.9em" class="truncate">
                <ul>
                    ${genRow('model', dev._modelID)}
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
                    ${genRow('configured', (dev.meta.configured === 1))}
                </ul>
            </div>
        </div>
        <div class="col s12 m6 l6 xl6">
        ${epInfo}
        </div>`;
    return info;
}

function showDevInfo(id){
    const info = genDevInfo(getDeviceByID(id));
    $('#devinfo').html(info);
    $('#modaldevinfo').modal('open');
}


function showWaitingDialog(text, timeout){
    let countDown = timeout;
    const waitingInt = setInterval(function() {
        countDown -= 1;
        const percent = 100-100*countDown/timeout;
        $('#waiting_progress_line').css('width', `${percent}%`);
    }, 1000);
    setTimeout(function() {
        $('#waiting_progress_line').css('width', `0%`);
        clearTimeout(waitingInt);
        $('#modalWaiting').modal('close');
    }, timeout*1000);
    $('#waiting_message').text(text);
    $('#modalWaiting').modal('open');
}

function closeWaitingDialog(){
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
                    const value = msg.energyvalues[ch-11];
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