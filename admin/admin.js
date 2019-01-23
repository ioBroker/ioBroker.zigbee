/*
 * you must run 'iobroker upload zigbee' if you edited this file to make changes visible
 */
var Materialize = (typeof M !== 'undefined') ? M : Materialize,
    anime = (typeof M !== 'undefined') ? M.anime : anime,
    namespace = 'zigbee.' + instance,
    namespaceLen = namespace.length,
    devices = [],
    dialog,
    messages = [],
    map = [],
    network,
    responseCodes = false,
    groups = {},
    devGroups = {},
    onChangeEmitter;

function getCard(dev) {
    var title = dev.common.name,
        id = dev._id,
        type = dev.common.type,
        img_src = dev.icon || dev.common.icon,
        rooms = [], room,
        lang = systemLang  || 'en';
    for (var r in dev.rooms) {
        if (dev.rooms[r].hasOwnProperty(lang)) {
            rooms.push(dev.rooms[r][lang]);
        } else {
            rooms.push(dev.rooms[r]);
        }
    }
    room = rooms.join(',') || '&nbsp';
    let routeBtn = '';
    if (dev.info && dev.info.type == 'Router') {
        routeBtn = '<a name="join" class="btn-floating waves-effect waves-light right hoverable green"><i class="material-icons tiny">leak_add</i></a>';
    }

    var paired = (dev.paired) ? '' : '<i class="material-icons right">leak_remove</i>';
    var image = '<img src="' + img_src + '" width="96px">',
        info = `<p style="min-height:96px">${type}<br>${id.replace(namespace+'.', '')}<br>${dev.groupNames || ''}</p>`,
        buttons = '<a name="delete" class="btn-floating waves-effect waves-light right hoverable black">'+
            '<i class="material-icons tiny">delete</i></a>'+
            '<a name="edit" class="btn-floating waves-effect waves-light right hoverable blue small">'+
                '<i class="material-icons small">mode_edit</i></a>'+routeBtn,
        card = '<div id="' + id + '" class="device col s12 m6 l4 xl3">'+
                    '<div class="card hoverable">'+
                    '<div class="card-content">'+
                        '<a name="d-info" class="top right hoverable small" style="border-radius: 50%; cursor: pointer;">'+
                            '<i class="material-icons">info</i></a>'+
                        '<span id="dName" class="card-title truncate">'+title+'</span>'+paired+
                        
                        '<i class="left">'+image+'</i>'+
                        info+
                        buttons+
                    '</div>'+
                    '<div class="card-action">'+room+'</div>'+
                    '<div class="card-reveal" name="edit">'+
                        '<span class="card-title grey-text text-darken-4">Edit device name</span>'+
                        '<div class="input-field">'+
                            '<input id="dNameInput" type="text" class="value validate">'+
                            '<label for="dNameInput" class="translate">Enter new name</label>'+
                        '</div>'+
                        '<span class="right">'+
                            '<a name="done" class="waves-effect waves-green btn green">'+
                            '<i class="material-icons">done</i></a>'+
                            '<a name="close" class="waves-effect waves-red btn-flat">'+
                            '<i class="material-icons">close</i></a>'+
                        '</span>'+
                    '</div>'+
                    '<div class="card-reveal" name="d-info">'+
                        '<span class="right">'+
                            '<a name="close" class="waves-effect waves-red btn-flat top right">'+
                            '<i class="material-icons">close</i></a>'+
                        '</span>'+
                        '<span class="card-title grey-text text-darken-4 translate">Device details</span>'+
                        '<div id="d-infos">'+
                            'loading...'+
                        '</div>'+
                    '</div>'+
                    '</div>'+
                '</div>';
    return card;
}

function openReval(e, id, name){
    var $card = $(e.target).closest('.card');
    if ($card.data('initialOverflow') === undefined) {
        $card.data(
            'initialOverflow',
            $card.css('overflow') === undefined ? '' : $card.css('overflow')
        );
    }
    var $revealName = e.target.parentNode.name; // click on <i>, get parent <a>
    let $cardReveal = $card.find('.card-reveal[name="'+$revealName+'"]');

    if ($revealName == "edit") {
        $cardReveal.find("input").val(name);
        Materialize.updateTextFields();
    }
    else if ($revealName == "d-info") {
        pollDeviceInfo(id, $card);
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

function closeReval(e, id, name){
    let $cardReveal = $(e.target).closest('.card-reveal');
    var $revealName = $cardReveal[0].getAttribute("name");
    if ($revealName == "edit" && id) {
        var newName = $cardReveal.find("input").val();
        renameDevice(id, newName);
    }
    var $card = $(e.target).closest('.card');
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
        let el = anim.animatables[0].target;
        $(el).css({ display: 'none'});
        $card.css('overflow', $card.data('initialOverflow'));
        }
    });
}

function deleteConfirmation(id, name) {
    var text = translateWord('Do you really whant to delete device') + ' "'+name+'" ('+id+')?';
    $('#modaldelete').find("p").text(text);
    $("#modaldelete a.btn[name='yes']").unbind("click");
    $("#modaldelete a.btn[name='yes']").click(function(e) {
        deleteDevice(id);
    });
    $('#modaldelete').modal('open');
}

function editName(id, name) {
    const dev = devices.find((d) => d._id == id);
    $('#modaledit').find("input[id='d_name']").val(name);
    if (dev.info.type == "Router") {
        list2select('#d_groups', groups, devGroups[id] || []);
        $("#d_groups").parent().parent().removeClass('hide');
    } else {
        $("#d_groups").parent().parent().addClass('hide');
    }
    $("#modaledit a.btn[name='save']").unbind("click");
    $("#modaledit a.btn[name='save']").click(function(e) {
        var newName = $('#modaledit').find("input[id='d_name']").val(),
            newGroups = $('#d_groups').val();
        updateDev(id, newName, newGroups);
    });
    $('#modaledit').modal('open');
    Materialize.updateTextFields();
}

function deleteDevice(id) {
    sendTo(null, 'deleteDevice', {id: id}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error.code, _('Error'), 'alert');
            } else {
                getDevices();
            }
        }
    });
}

function renameDevice(id, name) {
    sendTo(null, 'renameDevice', {id: id, name: name}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'), 'alert');
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
        let roomsA = [], roomsB = [];
        for (var r in a.rooms) {
            if (a.rooms[r].hasOwnProperty(lang)) {
                roomsA.push(a.rooms[r][lang]);
            } else {
                roomsA.push(a.rooms[r]);
            }
        }
        var nameA = roomsA.join(',');
        for (var r in b.rooms) {
            if (b.rooms[r].hasOwnProperty(lang)) {
                roomsB.push(b.rooms[r][lang]);
            } else {
                roomsB.push(b.rooms[r]);
            }
        }
        var nameB = roomsB.join(',');

        if (nameB < nameB) {
            return -1;
          }
          if (nameA > nameB) {
            return 1;
          }
          return 0;
    });
    devGroups = {};
    for (var i=0;i < devices.length; i++) {
        var d = devices[i];
        if (d.info && d.info.type == "Coordinator") continue;
        if (d.groups && d.info && d.info.type == "Router") {
            devGroups[d._id] = d.groups;
            d.groupNames = d.groups.map(item=>{
                return groups[item] || '';
            }).join(', ');
        }
        var card = getCard(d);
        html += card;
    }
    $('#devices').html(html);

    const getDevName = function(dev_block) {
        return dev_block.find("#dName").text();
    };
    const getDevId = function(dev_block) {
        return dev_block.attr("id");
    };
    $("a.btn-floating[name='delete']").click(function() {
        var dev_block = $(this).parents("div.device");
        deleteConfirmation(getDevId(dev_block), getDevName(dev_block));
    });
    $("a.btn-floating[name='edit']").click(function(e) {
        var dev_block = $(this).parents("div.device"),
            id = getDevId(dev_block),
            name = getDevName(dev_block);
        editName(id, name);
    });
    $("a.btn-floating[name='join']").click(function() {
        var dev_block = $(this).parents("div.device");
        if (!$('#pairing').hasClass('pulse'))
            joinProcess(getDevId(dev_block));
        showPairingProcess();
    });
    $("a[name='d-info']").click(function(e) {
        var dev_block = $(this).parents("div.device");
        openReval(e, getDevId(dev_block), getDevName(dev_block));
    });
    $("a.btn[name='done']").click(function(e) {
        var dev_block = $(this).parents("div.device");
        closeReval(e, getDevId(dev_block), getDevName(dev_block));
    });
    $("a.btn-flat[name='close']").click(function(e) {
        closeReval(e);
    });

    showNetworkMap(devices, map);
    translateAll();
}

function letsPairing() {
    messages = [];
    sendTo(null, 'letsPairing', {}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'), 'alert');
            }
        }
    });
}

function joinProcess(devId) {
    messages = [];
    sendTo(null, 'letsPairing', {id: devId}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'), 'alert');
            }
        }
    });
}

function pollDeviceInfo(id, card) {
    sendToZigbee(id, null, 'genBasic', 'read', 'foundation', 
            [ {attrId: 'swBuildId'}, {attrId: 'hwVersion'}], 
            null, function (reply) {
        let infoNode = card.find('#d-infos');
        if (reply.hasOwnProperty('localErr')) {
            infoNode.html('No device details available<br><span class="blue-grey-text">(' +reply.localErr+ ')</span>');
            return;
        }
        if (reply.hasOwnProperty('localStatus')) {
            return;
        }
        
        let html = '<ul>';
        if (reply.msg) {
            for (var i=0; i<reply.msg.length; i++) {
                var attr = reply.msg[i];
                if (attr.status != '0') {
                    continue; // unsupAttr,...
                }
                if (attr.attrId == '16384') {//swBuildId
                    html += '<li>Firmware Version: '+attr.attrData+'</li>';
                }
                else if (attr.attrId == '3') {//hwVersion
                    html += '<li>Hardware Version: '+attr.attrData+'</li>';
                }
            }
        }
        html += '</ul>';
        infoNode.html(html);
    });
}

function getDevices() {
    sendTo(null, 'getDevices', {}, function (msg) {
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'), 'alert');
            } else {
                devices = msg;
                showDevices();
            }
        }
    });
}

function getMap() {
    $('#refresh').addClass('disabled');
    sendTo(null, 'getMap', {}, function (msg) {
        $('#refresh').removeClass('disabled');
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'), 'alert');
            } else {
                map = msg;
                showNetworkMap(devices, map);
            }
        }
    });
}

// the function loadSettings has to exist ...
function load(settings, onChange) {
    onChangeEmitter = onChange;
    if (settings.panID === undefined) settings.panID = 6754;
    if (settings.channel === undefined) settings.channel = 11;

    // example: select elements with id=key and class=value and insert value
    for (var key in settings) {
        // example: select elements with id=key and class=value and insert value
        var value = $('#' + key + '.value');
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

    $('#pairing').click(function() {
        if (!$('#pairing').hasClass('pulse'))
            letsPairing();
        showPairingProcess();
    });

    $('#refresh').click(function() {
        getMap();
    });

    sendTo(null, 'getGroups', {}, function (data) {
        groups = data;
        showGroups();
    });

    $('#add_group').click(function() {
        const maxind = parseInt(Object.getOwnPropertyNames(groups).reduce((a,b) => a>b ? a : b, 0));
        editGroupName(maxind+1, "");
    });

    $(document).ready(function() {
        $('.modal').modal({
            startingTop: '30%',
            endingTop: '10%',
        });
        $('.dropdown-trigger').dropdown({constrainWidth: false});
        Materialize.updateTextFields();
        $('.collapsible').collapsible();
    });

    var text = $('#pairing').attr('data-tooltip');
    var transText = translateWord(text);
    if (transText) {
        $('#pairing').attr('data-tooltip', transText);
    }

    $('ul.tabs').on('click', 'a', function(e) {
        if ($(e.target).attr("id") == 'tabmap') {
            redrawMap();
        }
        if ($(e.target).attr("id") == 'develop') {
        	loadDeveloperTab(onChange);
        }
    });
}

function showMessages() {
    var data = '';
    for (var ind in messages) {
        var mess = messages[ind];
        data = mess + '\n' + data;
    };
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
function save(callback) {
    // example: select elements with class=value and build settings object
    var obj = {};
    $('.value').each(function () {
        var $this = $(this);
        if ($this.attr('type') === 'checkbox') {
            obj[$this.attr('id')] = $this.prop('checked');
        } else {
            obj[$this.attr('id')] = $this.val();
        }
    });
    callback(obj);
}

// subscribe to changes
socket.emit('subscribe', namespace + '.info.*');
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
            var blank_btn = '<i class="material-icons">leak_add</i>';
            if (state.val == 0) {
                $('#pairing').html(blank_btn);
            } else {
                $('#pairing').addClass('pulse');
                $('#pairing').html(state.val);
            }
        } else if (id.match(/\.info\.pairingMessage$/)) {
            messages.push(state.val);
            showMessages();
        }
    }
});

socket.on('objectChange', function (id, obj) {
    if (id.substring(0, namespaceLen) !== namespace) return;
    if (obj && obj.type == "device" && obj.common.type !== 'group') {
        getDevices();
    }
});
socket.emit('getObject', 'system.config', function (err, res) {
    if (!err && res && res.common) {
        systemLang = res.common.language || systemLang;
        systemConfig = res;
    }
});


function getNetworkInfo(devId, networkmap){
    return networkmap.find((info) => info.ieeeAddr == devId);
}

function showNetworkMap(devices, map){

    // create an array with nodes
    var nodes = [];

    // create an array with edges
    var edges = [];

    
    const keys = {};
    devices.forEach((dev)=>{
        if (dev.info) {
            keys[dev.info.ieeeAddr] = dev;
        }
    });
    const links = {};

    devices.forEach((dev)=>{
        const node = {
            id: dev._id,
            label: dev.common.name,
            shape: 'image', 
            image: dev.icon,
        }
        if (dev.info && dev.info.type == 'Coordinator') {
            node.shape = 'star';
            node.label = 'Coordinator';
        }
        nodes.push(node);
        if (dev.info) {
            const networkInfo = getNetworkInfo(dev.info.ieeeAddr, map);
            if (networkInfo) {
                const to = keys[networkInfo.parent] ? keys[networkInfo.parent]._id : undefined;
                const from = dev._id;
                if (to && from && ((links[to] == from) || (links[from] == to))) return;
                const link = {
                    from: from,
                    to: to,
                    label: networkInfo.lqi.toString(),
                    font: {align: 'middle'},
                };
                edges.push(link);
                links[from] = to;
            }
        }
    });

    // create a network
    var container = document.getElementById('map');
    var data = {
        nodes: nodes,
        edges: edges
    };
    var options = {
        autoResize: true,
        height: '100%',
        width: '100%',
        nodes: {
            shape: 'box'
        },
    };
    network = new vis.Network(container, data, options);
    redrawMap();
}

function redrawMap() {
    if (network != undefined) {
        var width = $('.adapter-body').width(),
            height = $('.adapter-body').height()-128;
        network.setSize(width, height);
        network.redraw();
        network.fit();
        network.moveTo({offset:{x:0.5 * width, y:0.5 * height}});
    }
}

function getComPorts(onChange) {
    // timeout = setTimeout(function () {
    //     getComPorts(onChange);
    // }, 2000);
    sendTo(null, 'listUart', null, function (list) {
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
        var element = $('#ports');
        for (var j = 0; j < list.length; j++) {
            element.append('<li><a href="#!">' + list[j].comName +'</a></li>');
        }
        $("#ports a").click(function() {
            $("#port").val($(this).text());
            Materialize.updateTextFields();
            onChange();
        });
    });
}

function loadDeveloperTab(onChange) {
    // fill device selector
    updateSelect('#dev', devices,
            function(key, device) {
                if (device.info.type == 'Coordinator') {
                    return null;
                }
                return device.info.manufName +' '+ device.common.name;
            }, 
            function(key, device) {
                return device._id;
    }); 

    // fill cid, cmd, type selector
    populateSelector('#cid', 'cidList');
    populateSelector('#cmd', 'cmdListFoundation', this.value);
    populateSelector('#type', 'typeList', this.value);

    if (responseCodes == false) {
        const prepareData = function () {
            var data = {
                    devId: $('#dev-selector option:selected').val(),
                    ep: $('#ep-selector option:selected').val(),
                    cid: $('#cid-selector option:selected').val(),
                    cmd: $('#cmd-selector option:selected').val(),
                    cmdType: $('#cmd-type-selector').val(),
                    zclData: {attrId: $('#attrid-selector').val()},
                    cfg: null,
            };
            if ($("#value-needed").is(':checked')) {
                data.zclData.dataType = $('#type-selector option:selected').val();
                data.zclData.attrData = $('#value-input').val();
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
        const setExpertData = function(prop, value) {
            if (!$('#expert-mode').is(':checked')) {
                return;
            }
            var data;
            if (prop) {
                data = prepareExpertData();
                // https://stackoverflow.com/a/6394168/6937282
                const assignVal = function index(obj,is, value) {
                    if (typeof is == 'string')
                        return index(obj,is.split('.'), value);
                    else if (is.length==1 && value!==undefined) {
                        if (value == null) 
                            return delete obj[is[0]];
                        else
                            return obj[is[0]] = value;
                    }
                    else if (is.length==0)
                        return obj;
                    else
                        return index(obj[is[0]],is.slice(1), value);
                }
                assignVal(data, prop, value);
            }
            else {
                data = prepareData();
            }
            $('#expert-json').val(JSON.stringify(data, null, 4));
        };

        // init event listener only at first load
        $('#dev-selector').change(function() {
            if (this.selectedIndex <= 0) {
                return;
            }

            var device = devices.find(obj => {
                return obj._id === this.value;
            });

            updateSelect('#ep', device.info.epList,
                    function(key, ep) {
                        return ep;
                    }, 
                    function(key, ep) {
                        return ep;
            }); 
            setExpertData('devId', this.value);
        });
        
        $('#ep-selector').change(function() {
            setExpertData('ep', this.value);
        });

        $('#cid-selector').change(function() {
            populateSelector('#attrid', 'attrIdList', this.value);
            if ($('#cmd-type-selector').val() == 'functional') {
                var cid = $('#cid-selector option:selected').val();
                populateSelector('#cmd', 'cmdListFunctional', cid);
            }
            setExpertData('cid', this.value);
        });	

        $('#cmd-type-selector').change(function() {
            if (this.value == "foundation") {
                populateSelector('#cmd', 'cmdListFoundation');
            }
            else if (this.value == "functional") {
                var cid = $('#cid-selector option:selected').val();
                populateSelector('#cmd', 'cmdListFunctional', cid);
            }
            setExpertData('cmdType', this.value);
        }); 
        
        $('#cmd-selector').change(function() {
            setExpertData('cmd', this.value);
        });
        $('#attrid-selector').change(function() {
            setExpertData('zclData.attrId', this.value);
        });
        $('#type-selector').change(function() {
            setExpertData('zclData.dataType', this.value);
        });

        // value selector checkbox
        $('#value-needed').change(function() {
            if (this.checked === true) {
                $('#type-selector, #value-input').removeAttr('disabled');
                setExpertData('zclData.dataType', $('#type-selector').val());
                setExpertData('zclData.attrData', $('#value-input').val());
            }
            else {
                $('#type-selector, #value-input').attr('disabled', 'disabled');
                setExpertData('zclData.dataType', null);
                setExpertData('zclData.attrData', null);
            }
            $('#type-selector').select();
            Materialize.updateTextFields();
        });

        $('#value-input').keyup(function() {
            setExpertData('zclData.attrData', this.value);
        });

        $('#expert-mode').change(function() {
            if (this.checked === true) {
                setExpertData();
                $('#expert-json-box').css('display', 'inline-block');
            }
            else {
                $('#expert-json-box').css('display', 'none');
            }
            $('#type-selector').select();
            Materialize.updateTextFields();
        });

        $('#dev-send-btn').click(function() {
            var data;
            if ($('#expert-mode').is(':checked')) {
                data = prepareExpertData();
            }
            else {
                data = prepareData();
            }
            sendToZigbee(data.devId, data.ep, data.cid, data.cmd, data.cmdType, data.zclData, data.cfg, function (reply) {
                console.log('Reply from zigbee: '+ JSON.stringify(reply));
                if (reply.hasOwnProperty("localErr")) {
                    showDevRunInfo(reply.localErr, reply.errMsg, 'yellow');
                }
                else if (reply.hasOwnProperty('localStatus')) {
                    showDevRunInfo(reply.localErr, reply.errMsg);
                }
                else {
                    addDevLog(reply);
                    showDevRunInfo('OK', 'Finished.');
                }
            });
        });
    }

    responseCodes = null;
    // load list of response codes
    sendTo(null, 'getLibData', {key: 'respCodes'}, function (data) {
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
    if (!zclData || zclData.attrId < 0) {
        if (callback) {callback({localErr: 'Incomplete', errMsg: 'Ids must be positive!'});}
        return;
    }
    var data = {id: id, ep: ep, cid: cid, cmd: cmd, cmdType: cmdType, zclData: zclData, cfg: cfg};
    if (callback) {callback({localStatus: 'Send', errMsg: 'Waiting for reply...'});}

    const sendTimeout = setTimeout(function() {
        if (callback) {
            callback({localErr: 'Timeout', errMsg: 'We did not receive any response.'})
        }
    }, 15000);

    console.log('Send to zigbee, id '+id+ ',ep '+ep+', cid '+cid+', cmd '+cmd+', cmdType '+cmdType+', zclData '+JSON.stringify(zclData));
    sendTo(null, 'sendToZigbee', data, function(reply) {
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
    var card = $('#devActResult');
    if (level == 'yellow') {
        card.removeClass( "white-text" ).addClass( "yellow-text" );
    }
    else {
        card.removeClass( "yellow-text" ).addClass( "white-text" );
    }
    $('#devActResult').text(result);
    $('#devInfoMsg').text(text);
}

function addDevLog(reply) {
    var msg, statusCode;
    if (reply.msg) {
        if (Array.isArray(reply.msg)) {
            msg = reply.msg[0];
        }
        else {
            msg = reply.msg;
        }
        statusCode = msg.hasOwnProperty('status') ? msg.status : msg.statusCode;
    }

    var logHtml = '<span>'+JSON.stringify(reply)+'</span><br>';
    if (responseCodes != undefined) {
        const status = Object.keys(responseCodes).find(key => responseCodes[key] === statusCode);
        if (statusCode == 0) {
            logHtml = '<span class="green-text">'+status+'</span>   '+logHtml;
        }
        else {
            logHtml = '<span class="yellow-text">'+status+'</span>   '+logHtml;
        }
    }
    var logView = $('#dev_result_log');
    logView.append(logHtml);
    logView.scrollTop(logView.prop("scrollHeight"));
}

/**
 * Query adapter and update select with result
 */
function populateSelector(selectId, key, cid) {
    $(selectId+'>option:enabled').remove(); // remove existing elements
    $(selectId).select();
    if (cid == "-2") {
        updateSelect(selectId, null);
        return;
    }
    sendTo(null, 'getLibData', {key: key, cid: cid}, function (data) {
        var list = data.list;
        if (key === 'attrIdList') {
            updateSelect(selectId, list, 
                    function(index, attr) {
                        return attr.attrName + ' ('+attr.attrId +', type '+attr.dataType+')';
                    }, 
                    function(index, attr) {
                        return attr.attrId;
                    });
        }
        else {
            updateSelect(selectId, list, 
                    function(name, val) {
                        return name +' ('+val+')';
                    }, 
                    function(name, val) {
                        return val;
                    }); 
        }
    });
}

function updateSelect(id, list, getText, getId) {
    const selectId = id+'-selector';
    var mySelect = $(selectId);
    $(selectId+'>:not(:first[disabled])').remove(); // remove existing elements, except first if disabled, (is 'Select...' info)
    mySelect.select();
    if (list == null) {
        var infoOption = new Option("Nothing available");
        infoOption.disabled = true;
        mySelect.append( infoOption);
    }
    else {
        var keys = Object.keys(list); // is index in case of array
        for (var i=0; i<keys.length; i++) {
            var key = keys[i];
            var item = list[key];
            var optionText = getText(key, item);
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

function list2select(selector, list, selected) {
    var element = $(selector);
    element.empty();
    for (var j in list) {
        if (list.hasOwnProperty(j)) {
            const cls = (selected.indexOf(j) >= 0) ? " selected" : "";
            element.append(`<option value="${j}"${cls}>${list[j]}</option>`);
        }
    }
    element.select();
}

function showGroups() {
    $("#groups_table").find(".group").remove();
    if (!groups) return;
    var element = $('#groups_table');
    for (var j in groups) {
        if (groups.hasOwnProperty(j)) {
            element.append(`<tr id="group_${j}" class="group"><td>${j}</td><td><div>${groups[j]}<span class="right">`+
            `<a id="${j}" name="groupedit" class="waves-effect green btn-floating"><i class="material-icons">edit</i></a>`+
            `<a id="${j}" name="groupdelete" class="waves-effect red btn-floating"><i class="material-icons">delete</i></a></span></div></td></tr>`);
        }
    }
    $("a.btn-floating[name='groupedit']").click(function(e) {
        const index = $(this).attr("id"),
            name = groups[index];
        editGroupName(index, name);
    });
    $("a.btn-floating[name='groupdelete']").click(function() {
        const index = $(this).attr("id"),
            name = groups[index];
        deleteGroupConfirmation(index, name);
    });
}

function editGroupName(id, name) {
    //var text = 'Enter new name for "'+name+'" ('+id+')?';
    $('#groupedit').find("input[id='g_index']").val(id);
    $('#groupedit').find("input[id='g_name']").val(name);
    $("#groupedit a.btn[name='save']").unbind("click");
    $("#groupedit a.btn[name='save']").click(function(e) {
        var newId = $('#groupedit').find("input[id='g_index']").val(),
            newName = $('#groupedit').find("input[id='g_name']").val();
        updateGroup(id, newId, newName);
        showGroups();
    });
    $('#groupedit').modal('open');
    Materialize.updateTextFields();
}

function deleteGroupConfirmation(id, name) {
    var text = translateWord('Do you really whant to delete group') + ' "'+name+'" ('+id+')?';
    $('#modaldelete').find("p").text(text);
    $("#modaldelete a.btn[name='yes']").unbind("click");
    $("#modaldelete a.btn[name='yes']").click(function(e) {
        deleteGroup(id);
        showGroups();
    });
    $('#modaldelete').modal('open');
}

function updateGroup(id, newId, newName) {
    delete groups[id];
    groups[newId] = newName;
    sendTo(null, 'updateGroups', groups);
}

function deleteGroup(id) {
    delete groups[id];
    sendTo(null, 'updateGroups', groups);
}

function updateDev(id, newName, newGroups) {
    const dev = devices.find((d) => d._id == id);
    if (dev && dev.common.name != newName) {
        renameDevice(id, newName);
    }
    if (dev.info.type == "Router") {
        const oldGroups = devGroups[id] || [];
        if (oldGroups.toString() != newGroups.toString()) {
            devGroups[id] = newGroups;
            dev.groups = newGroups;
            // save dev-groups
            sendTo(null, 'groupDevices', devGroups, function (msg) {
                if (msg) {
                    if (msg.error) {
                        showMessage(msg.error, _('Error'), 'alert');
                    }
                }
            });
            showDevices();
        }
    }
}