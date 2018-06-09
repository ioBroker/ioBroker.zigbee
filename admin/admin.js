var Materialize = M ? M : Materialize,
    anime = M ? M.anime : anime,
    namespace = 'zigbee.' + instance,
    namespaceLen = namespace.length,
    devices = [],
    dialog,
    messages = [];

function getCard(dev) {
    var title = dev.common.name,
        id = dev._id,
        type = dev.common.type,
        img_src = dev.common.icon || dev.icon,
        rooms = [], room;
    for (var r in dev.rooms) {
        if (dev.rooms[r].hasOwnProperty('en')) {
            rooms.push(dev.rooms[r]['en']);
        } else {
            rooms.push(dev.rooms[r]);
        }
    }
    room = rooms.join(',');

    var paired = (dev.paired) ? '' : '<i class="material-icons right">leak_remove</i>';
    var image = '<img src="' + img_src + '" width="96px">',
        info = '<p style="min-height:96px">' + type + '<br>' + id.replace(namespace+'.', '') + '</p>',
        buttons = '<a name="delete" class="btn-floating waves-effect waves-light right hoverable black"><i class="material-icons tiny">delete</i></a><a name="edit" class="btn-floating waves-effect waves-light right hoverable blue"><i class="material-icons small">mode_edit</i></a>',
        card = '<div id="' + id + '" class="device col s12 m6 l4 xl3">'+
                    '<div class="card hoverable">'+
                    '<div class="card-content">'+
                        '<span class="card-title">'+title+'</span>'+paired+
                        '<i class="left">'+image+'</i>'+
                        info+
                        buttons+
                    '</div>'+
                    '<div class="card-action">'+room+'</div>'+
                    '<div class="card-reveal">'+
                        '<div class="input-field">'+
                            '<input id="name" type="text" class="value validate">'+
                            '<label for="name" class="translate">Enter new name</label>'+
                        '</div>'+
                        '<span class="right">'+
                            '<a name="done" class="waves-effect waves-green btn green"><i class="material-icons">done</i></a>'+
                            '<a name="close" class="waves-effect waves-red btn-flat"><i class="material-icons">close</i></a>'+
                        '</span>'+
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
    let $cardReveal = $card.find('.card-reveal');
    $cardReveal.find("input").val(name);
    Materialize.updateTextFields();
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
    if (id) {
        renameDevice(id, name);
    }
    var $card = $(e.target).closest('.card');
    if ($card.data('initialOverflow') === undefined) {
        $card.data(
            'initialOverflow',
            $card.css('overflow') === undefined ? '' : $card.css('overflow')
        );
    }
    let $cardReveal = $card.find('.card-reveal');
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
    var text = 'Enter new name for "'+name+'" ('+id+')?';
    $('#modaledit').find("input").val(name);
    $('#modaledit').find("label").text(text);
    $('#modaledit').modal('open');
    Materialize.updateTextFields();
}

function deleteDevice(id) {
    sendTo(null, 'deleteDevice', {id: id}, function (msg) {
        //console.log(msg);
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
        //console.log(msg);
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
    var html = '';
    for (var i=0;i < devices.length; i++) {
        var d = devices[i];
        var card = getCard(d);
        html += card;
    }
    $('#devices').html(html);
    $("a.btn-floating[name='delete']").click(function() {
        var dev_block = $(this).parents("div.device"),
            id = dev_block.attr("id"),
            name = dev_block.find(".card-title").text();
        deleteConfirmation(id, name);
    });
    $("a.btn-floating[name='edit']").click(function(e) {
        var dev_block = $(this).parents("div.device"),
            id = dev_block.attr("id"),
            name = dev_block.find(".card-title").text();
        // editName(id, name);
        openReval(e, id, name);
    });
    $("a.btn[name='done']").click(function(e) {
        var dev_block = $(this).parents("div.device"),
            id = dev_block.attr("id"),
            name = dev_block.find("input").val();
        closeReval(e, id, name);
    });
    $("a.btn-flat[name='close']").click(function(e) {
        closeReval(e);
    });
    translateAll();
}

function letsPairing() {
    messages = [];
    sendTo(null, 'letsPairing', {}, function (msg) {
        //console.log(msg);
        if (msg) {
            if (msg.error) {
                showMessage(msg.error, _('Error'), 'alert');
            }
        }
    });
}

function getDevices() {
    sendTo(null, 'getDevices', {}, function (msg) {
        //console.log(msg);
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

// the function loadSettings has to exist ...
function load(settings, onChange) {
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
    //dialog = new MatDialog({EndingTop: '50%'});
    getDevices();
    //addCard();

    // Signal to admin, that no changes yet
    onChange(false);

    $('#pairing').click(function() {
        if (!$('#pairing').hasClass('pulse'))
            letsPairing();
        showPairingProcess();
    });
    $(document).ready(function() {
        $('.modal').modal({
            startingTop: '30%',
            endingTop: '30%',
        });
        Materialize.updateTextFields();
    });

    var text = $('#pairing').attr('data-tooltip');
    var transText = translateWord(text);
    if (transText) {
        $('#pairing').attr('data-tooltip', transText);
    }
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
    //console.log("State change announced: " + id + " and obj = " + JSON.stringify(state));
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
    //console.log("Object change announced: " + id + " and obj = " + JSON.stringify(obj));
    if (obj && obj.type == "device") {
        getDevices();
    }
});
socket.emit('getObject', 'system.config', function (err, res) {
    if (!err && res && res.common) {
        systemLang = res.common.language || systemLang;
        systemConfig = res;
    }
});