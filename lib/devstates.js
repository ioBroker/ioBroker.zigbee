'use strict';

const rgb = require(__dirname + '/rgb.js');

/* states for device:
   id - sysname of state, id
   name - display name of state
   prop - attr name of payload object with value of state
   icon - url of state icon
   role - state role
   write, read - allow to write and read state from admin
   type - type of value
   isEvent - sign of clearing the value after 300ms
   getter - result of call is the value of state. if value is undefined - state not apply
   setter - result of call is the value for publish to zigbee
   setterOpt - result of call is the options for publish to zigbee
   setattr - name of converter to zigbee, if it different from "prop" value
   epname - endpoint name for publish
*/

const timers = {};

const states = {
    link_quality: {
        id: 'link_quality',
        prop: 'linkquality',
        name: 'Link quality',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
        min: 0,
        max: 254
    },
    checking: { // press button for checking
        id: 'checking',
        name: 'Start checking process',
        icon: undefined,
        role: 'button',
        write: true,
        read: false,
        type: 'boolean',
    },
    click: {
        id: 'click',
        name: 'Click event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.click === 'single') ? true : undefined,
    },
    double_click: {
        id: 'double_click',
        prop: 'click',
        name: 'Double click event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.click === 'double') ? true : undefined,
    },
    triple_click: {
        id: 'triple_click',
        prop: 'click',
        name: 'Triple click event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.click === 'triple') ? true : undefined,
    },
    quad_click: {
        id: 'quad_click',
        prop: 'click',
        name: 'Quadruple click event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.click === 'quadruple') ? true : undefined,
    },
    many_click: {
        id: 'many_click',
        prop: 'click',
        name: 'Many clicks event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.click === 'many') ? true : undefined,
    },
    long_click: {
        id: 'long_click',
        prop: 'click',
        name: 'Long click event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.click === 'long') ? true : undefined,
    },
    voltage: {
        id: 'voltage',
        name: 'Battery voltage',
        icon: 'img/battery_v.png',
        role: 'battery.voltage',
        write: false,
        read: true,
        type: 'number',
        unit: 'V',
        getter: payload => payload.voltage / 1000,
    },
 //   battery: {
 //        id: 'battery',
 //        prop: 'voltage',
 //        name: 'Battery percent second',
 //        icon: 'img/battery_p.png',
 //        role: 'battery.percent',
 //        write: false,
 //        read: true,
 //        type: 'number',
 //        unit: '%',
 //        getter: payload => toPercentage(payload.voltage, 2700, 3200),
 //        min: 0,
 //        max: 100
 //    },
    battery: {
        id: 'battery',
        prop: 'battery',
        name: 'Battery percent',
        icon: 'img/battery_p.png',
        role: 'battery.percent',
        write: false,
        read: true,
        type: 'number',
        unit: '%',
        min: 0,
        max: 100
    },
    left_click: {
        id: 'left_click',
        prop: 'click',
        name: 'Left click event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.click === 'left') ? true : undefined,
    },
    right_click: {
        id: 'right_click',
        prop: 'click',
        name: 'Right click event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.click === 'right') ? true : undefined,
    },
    both_click: {
        id: 'both_click',
        prop: 'click',
        name: 'Both click event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.click === 'both') ? true : undefined,
    },
    state: {
        id: 'state',
        name: 'Switch state',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: payload => (payload.state === 'ON'),
        setter: (value) => (value) ? 'ON' : 'OFF',
        inOptions: true,
    },
    stateEp: {
        id: 'state',
        name: 'Switch state',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: payload => (payload.state === 'ON'),
        setter: (value) => (value) ? 'ON' : 'OFF',
        epname: '',
    },
    left_state: {
        id: 'left_state',
        prop: 'state_left',
        name: 'Left switch state',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: payload => (payload.state_left === 'ON'),
        setter: (value) => (value) ? 'ON' : 'OFF',
        setattr: 'state',
        epname: 'left',
    },
    right_state: {
        id: 'right_state',
        prop: 'state_right',
        name: 'Right switch state',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: payload => (payload.state_right === 'ON'),
        setter: (value) => (value) ? 'ON' : 'OFF',
        setattr: 'state',
        epname: 'right',
    },
    left_button: {
        id: 'left_button',
        prop: 'button_left',
        name: 'Left button pressed',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        getter: payload => (payload.button_left === 'hold')
    },
    right_button: {
        id: 'right_button',
        prop: 'button_right',
        name: 'Right button pressed',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        getter: payload => (payload.button_right === 'hold'),
    },
    temperature: {
        id: 'temperature',
        name: 'Temperature',
        icon: undefined,
        role: 'value.temperature',
        write: false,
        read: true,
        type: 'number',
        unit: '°C'
    },
    humidity: {
        id: 'humidity',
        name: 'Humidity',
        icon: undefined,
        role: 'value.humidity',
        write: false,
        read: true,
        type: 'number',
        unit: '%',
        min: 0,
        max: 100
    },
    pressure: {
        id: 'pressure',
        name: 'Pressure',
        icon: undefined,
        role: 'value.pressure',
        write: false,
        read: true,
        type: 'number',
        unit: 'hPa',
        min: 0,
        max: 100
    },
    illuminance: {
        id: 'illuminance',
        name: 'Illuminance',
        icon: undefined,
        role: 'value.brightness',
        write: false,
        read: true,
        type: 'number',
        unit: 'lux'
    },
    occupancy: {
        id: 'occupancy',
        name: 'Occupancy',
        icon: undefined,
        role: 'indicator.motion',
        write: false,
        read: true,
        type: 'boolean',
    },
    no_motion: {
        id: 'no_motion',
        prop: 'occupancy',
        name: 'Time from last motion',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
        unit: 'seconds',
        prepublish: (devId, value, callback, options) => {
            if (value) {
                if (timers[devId]) {
                    clearInterval(timers[devId]);
                    delete timers[devId];
                }
                callback(0);
            } else {
                if (!timers[devId]) {
                    const hasTimeout = options && options.hasOwnProperty('occupancy_timeout');
                    let counter = hasTimeout ? options.occupancy_timeout : 60;
                    callback(counter);
                    timers[devId] = setInterval(() => {
                        counter = counter + 10;
                        callback(counter);
                        if (counter > 1800) { // cancel after 1800 sec
                            clearInterval(timers[devId]);
                            delete timers[devId];
                        }
                    }, 10000); // update every 10 second
                }
            }
        }
    },
    contact: {
        id: 'contact',
        name: 'Contact event',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'boolean'
    },
    opened: {
        id: 'opened',
        prop: 'contact',
        name: 'Is open',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'boolean',
        getter: payload => !payload.contact,
    },
    water_detected: {
        id: 'detected',
        prop: 'water_leak',
        name: 'Water leak detected',
        icon: undefined,
        role: 'indicator.leakage',
        write: false,
        read: true,
        type: 'boolean'
    },
    gas_detected: {
        id: 'detected',
        prop: 'gas',
        name: 'Gas leak detected',
        icon: undefined,
        role: 'indicator.alarm.fire',
        write: false,
        read: true,
        type: 'boolean'
    },
    smoke_detected: {
        id: 'detected',
        prop: 'smoke',
        name: 'Smoke leak detected',
        icon: undefined,
        role: 'indicator.alarm.fire',
        write: false,
        read: true,
        type: 'boolean'
    },
   smoke_detected2: {   // for Heiman
        id: 'smoke',
        prop: 'smoke',
        name: 'Smoke leak detected',
        icon: undefined,
        role: 'indicator.alarm.fire',
        write: false,
        read: true,
        type: 'boolean'
    },       
    shake: {
        id: 'shake',
        prop: 'action',
        name: 'Shake event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'shake') ? true : undefined,
    },
    wakeup: {
        id: 'wakeup',
        prop: 'action',
        name: 'Wakeup event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'wakeup') ? true : undefined,
    },
    fall: {
        id: 'fall',
        prop: 'action',
        name: 'Free fall event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'fall') ? true : undefined,
    },
    tap: {
        id: 'tap',
        prop: 'action',
        name: 'Tapped twice event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'tap') ? true : undefined,
    },
    tap_side: {
        id: 'tap_side',
        prop: 'side',
        name: 'Top side on tap',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
        getter: payload => (payload.action === 'tap') ? payload.side : undefined,
    },
    slide: {
        id: 'slide',
        prop: 'action',
        name: 'Slide event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'slide') ? true : undefined,
    },
    slide_side: {
        id: 'slide_side',
        prop: 'side',
        name: 'Top side on slide',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
        getter: payload => (payload.action === 'slide') ? payload.side : undefined,
    },
    flip180: {
        id: 'flip180',
        prop: 'action',
        name: 'Flip on 180°',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'flip180') ? true : undefined,
    },
    flip180_side: {
        id: 'flip180_side',
        prop: 'side',
        name: 'Top side on flip 180°',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
        getter: payload => (payload.action === 'flip180') ? payload.side : undefined,
    },
    flip90: {
        id: 'flip90',
        prop: 'action',
        name: 'Flip on 90° event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'flip90') ? true : undefined,
    },
    flip90_from: {
        id: 'flip90_from',
        prop: 'from_side',
        name: 'From top side on flip 90°',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
        getter: payload => (payload.action === 'flip90') ? payload.from_side : undefined,
    },
    flip90_to: {
        id: 'flip90_to',
        prop: 'to_side',
        name: 'To top side on flip 90°',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
        getter: payload => (payload.action === 'flip90') ? payload.to_side : undefined,
    },
    rotate_left: {
        id: 'rotate_left',
        prop: 'action',
        name: 'Rotate left event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'rotate_left') ? true : undefined,
    },
    rotate_right: {
        id: 'rotate_right',
        prop: 'action',
        name: 'Rotate right event',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'rotate_right') ? true : undefined,
    },
    rotate_angle: {
        id: 'rotate_angle',
        prop: 'angle',
        name: 'Rotate angle',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
    },
    load_power: {
        id: 'load_power',
        prop: 'power',
        name: 'Load power',
        icon: undefined,
        role: 'value.power',
        write: false,
        read: true,
        type: 'number',
        unit: 'W'
    },
    brightness: {
        id: 'brightness',
        name: 'Brightness',
        icon: undefined,
        role: 'level.dimmer',
        write: true,
        read: true,
        type: 'number',
        unit: '',
        min: 0,
        max: 100,
        // transform from 0..100 to 0..254
        getter: payload => {
            if (payload.brightness) {
                return Math.round(payload.brightness*100/254);
            } else {
                return payload.brightness;
            }
        },
        setter: (value, options) => {
            if (value) {
                return Math.round(value*254/100);
            } else {
                return value;
            }
        },
        setterOpt: (value, options) => {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time');
            const transitionTime = hasTransitionTime ? options.transition_time : 0;
            return {transition: transitionTime};
        },
        readTimeout: (value, options) => {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time');
            const transitionTime = hasTransitionTime ? options.transition_time : 0;
            return transitionTime * 1000;
        },
    },
    colortemp: {
        id: 'colortemp',
        prop: 'color_temp',
        name: 'Color temperature',
        icon: undefined,
        role: 'level.color.temperature',
        write: true,
        read: true,
        type: 'number',
        setterOpt: (value, options) => {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time');
            const transitionTime = hasTransitionTime ? options.transition_time : 0;
            return {transition: transitionTime};
        },
        readTimeout: (value, options) => {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time');
            const transitionTime = hasTransitionTime ? options.transition_time : 0;
            return transitionTime * 1000;
        },
    },
    color: {
        id: 'color',
        prop: 'color',
        name: 'Color',
        icon: undefined,
        role: 'level.color.rgb',
        write: true,
        read: true,
        type: 'string',
        setter: (value) => {
            // convert RGB to XY for set
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
            let xy = [0, 0];
            if (result) {
                const r = parseInt(result[1], 16),
                    g = parseInt(result[2], 16),
                    b = parseInt(result[3], 16);
                xy = rgb.rgb_to_cie(r, g, b);
            }
            return {
                x: xy[0],
                y: xy[1]
            };
        },
        setterOpt: (value, options) => {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time');
            const transitionTime = hasTransitionTime ? options.transition_time : 0;
            return {transition: transitionTime};
        },
        readTimeout: (value, options) => {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time');
            const transitionTime = hasTransitionTime ? options.transition_time : 0;
            return transitionTime * 1000;
        },
    },
    transition_time: {
        id: 'transition_time',
        name: 'Transition time',
        icon: undefined,
        role: 'state',
        write: true,
        read: false,
        type: 'number',
        unit: 'sec',
        isOption: true,
    },
    // new RWL states 
    rwl_state: {
        id: 'state',
        prop: 'action',
        name: 'Switch state',
        icon: undefined,
        role: 'switch',
        write: false,
        read: true,
        type: 'boolean',
        getter: payload => (payload.action === 'on') ? true : (payload.action === 'off') ? false : undefined,
    },
    rwl_up_button: {
        id: 'up_button',
        prop: 'action',
        name: 'Up button pressed',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'up-press') ? true : undefined
    },
    rwl_up_hold: {
        id: 'up_hold',
        prop: 'action',
        name: 'Up button hold',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'up-hold') ? true : undefined
    },
    rwl_down_button: {
        id: 'down_button',
        prop: 'action',
        name: 'Down button pressed',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'down-press') ? true : undefined
    },
    rwl_down_hold: {
        id: 'down_hold',
        prop: 'action',
        name: 'Down button hold',
        icon: undefined,
        role: 'button',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'down-hold') ? true : undefined
    },
    occupancy_timeout: {
        id: 'occupancy_timeout',
        name: 'Occupancy timeout',
        icon: undefined,
        role: 'state',
        write: true,
        read: false,
        type: 'number',
        unit: 'sec',
        isOption: true,
    },
    DNCKAT_state_1: {
        id: 'state_1',
        prop: 'state_left',
        name: 'Switch state 1',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: (payload) => (payload.state_left === 'ON') ? true : false,
        setter: (value) => (value) ? 'ON' : 'OFF',
        setattr: 'state',
        epname: 'left',
    },
    DNCKAT_state_2: {
        id: 'state_2',
        prop: 'state_right',
        name: 'Switch state 2',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: (payload) => (payload.state_right === 'ON') ? true : false,
        setter: (value) => (value) ? 'ON' : 'OFF',
        setattr: 'state',
        epname: 'right',
    },
    DNCKAT_state_3: {
        id: 'state_3',
        prop: 'state_center',
        name: 'Switch state 3',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: (payload) => (payload.state_center === 'ON') ? true : false,
        setter: (value) => (value) ? 'ON' : 'OFF',
        setattr: 'state',
        epname: 'center',
    },
    DNCKAT_state_41: {
        id: 'state_1',
        prop: 'state_bottom_left',
        name: 'Switch state 1',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: (payload) => (payload.state_bottom_left === 'ON') ? true : false,
        setter: (value) => (value) ? 'ON' : 'OFF',
        setattr: 'state',
        epname: 'bottom_left',
    },
    DNCKAT_state_42: {
        id: 'state_2',
        prop: 'state_bottom_right',
        name: 'Switch state 2',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: (payload) => (payload.state_bottom_right === 'ON') ? true : false,
        setter: (value) => (value) ? 'ON' : 'OFF',
        setattr: 'state',
        epname: 'bottom_right',
    },
    DNCKAT_state_43: {
        id: 'state_3',
        prop: 'state_top_left',
        name: 'Switch state 3',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: (payload) => (payload.state_top_left === 'ON') ? true : false,
        setter: (value) => (value) ? 'ON' : 'OFF',
        setattr: 'state',
        epname: 'top_left',
    },
    DNCKAT_state_44: {
        id: 'state_4',
        prop: 'state_top_right',
        name: 'Switch state 4',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        getter: (payload) => (payload.state_top_right === 'ON') ? true : false,
        setter: (value) => (value) ? 'ON' : 'OFF',
        setattr: 'state',
        epname: 'top_right',
    },
    vibration_action: {
        id: 'vibration',
        prop: 'action',
        name: 'Vibration event',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'vibration') ? true : undefined,
    },
    tilt_action: {
        id: 'tilt',
        prop: 'action',
        name: 'Tilt event',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'tilt') ? true : undefined,
    },
    drop_action: {
        id: 'drop',
        prop: 'action',
        name: 'Drop event',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'boolean',
        isEvent: true,
        getter: payload => (payload.action === 'drop') ? true : undefined,
    },
    tilt_angle: {
        id: 'tilt_angle',
        prop: 'angle',
        name: 'Tilt angle',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
    },
    tilt_angle_x: {
        id: 'tilt_angle_x',
        prop: 'angle_x',
        name: 'Tilt angle X',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
    },
    tilt_angle_y: {
        id: 'tilt_angle_y',
        prop: 'angle_y',
        name: 'Tilt angle Y',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
    },
    tilt_angle_z: {
        id: 'tilt_angle_z',
        prop: 'angle_z',
        name: 'Tilt angle Z',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
    },
    tilt_angle_x_abs: {
        id: 'tilt_angle_x_abs',
        prop: 'angle_x_absolute',
        name: 'Tilt angle X absolute ',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
    },
    tilt_angle_y_abs: {
        id: 'tilt_angle_y_abs',
        prop: 'angle_y_absolute',
        name: 'Tilt angle Y absolute',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
    },
};

// return list of changing states when incoming state is changed
const comb = {
    brightnessAndState: (state, value, options) => {
        // if state is brightness
        if (state.id === states.brightness.id) {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time');
            const timeout = (hasTransitionTime ? options.transition_time : 0) * 1000;    
            // and new value > 0
            if (value > 0) {
                // turn on light first
                if (!options.state) {
                    return [{
                        stateDesc: states.state,
                        value: true,
                        //index: -1, // before main change
                        //timeout: 0,
                        index: 1, // after main change
                        timeout: timeout,
                    }];
                }
            } else {
                // turn off light after transition time
                if (options.state) {
                    return [{
                        stateDesc: states.state,
                        value: false,
                        index: 1, // after main change
                        timeout: timeout,
                    }];
                }
            }
        }
    }
};

const lightStatesWithColortemp = [states.state, states.brightness, states.colortemp, states.transition_time];
const lightStatesWithColor = [states.state, states.brightness, states.colortemp, states.color, states.transition_time];
const lightStatesWithColorNoTemp = [states.state, states.brightness, states.color, states.transition_time];
const lightStates = [states.state, states.brightness, states.transition_time];


const devices = [{
        vendor: 'Xiaomi',
        models: ['lumi.sensor_switch'],
        icon: 'img/xiaomi_wireless_switch.png',
        states: [states.click, states.double_click, states.triple_click, states.quad_click,
            states.many_click, states.long_click, states.voltage, states.battery
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_switch.aq2', 'lumi.remote.b1acn01\u0000\u0000\u0000\u0000\u0000\u0000'],
        icon: 'img/aqara.switch.png',
        states: [states.click, states.double_click, states.triple_click, states.quad_click,
            states.voltage, states.battery
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_switch.aq3', 'lumi.sensor_swit'],
        icon: 'img/aqara.switch.png',
        // TODO: shake, hold, release
        states: [states.click, states.double_click, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_86sw1\u0000lu', 'lumi.remote.b186acn01\u0000\u0000\u0000'],
        icon: 'img/86sw1.png',
        states: [states.click, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_86sw2\u0000Un', 'lumi.sensor_86sw2.es1', 'lumi.remote.b286acn01\u0000\u0000\u0000'],
        icon: 'img/86sw2.png',
        states: [states.left_click, states.right_click, states.both_click, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.ctrl_ln1.aq1'],
        icon: 'img/ctrl_ln1.png',
        // TODO: power measurement
        states: [states.click, states.state],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.ctrl_ln2.aq1'],
        icon: 'img/ctrl_ln2.png',
        // TODO: power measurement
        states: [states.left_button, states.right_button, states.left_state, states.right_state],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.ctrl_neutral1'],
        icon: 'img/ctrl_neutral1.png',
        states: [states.stateEp],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.ctrl_neutral2'],
        icon: 'img/ctrl_neutral2.png',
        states: [states.left_button, states.right_button, states.left_state, states.right_state],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sens'],
        icon: 'img/sensor_ht.png',
        states: [states.temperature, states.humidity, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.weather'],
        icon: 'img/aqara_temperature_sensor.png',
        states: [states.temperature, states.humidity, states.pressure, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_motion'],
        icon: 'img/aqara_numan_body_sensor.png',
        states: [states.occupancy, states.no_motion, states.voltage, states.battery, states.occupancy_timeout],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_motion.aq2'],
        icon: 'img/aqara_numan_body_sensor.png',
        states: [states.occupancy, states.no_motion, states.illuminance, states.voltage, states.battery, states.occupancy_timeout],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_magnet'],
        icon: 'img/magnet.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_magnet.aq2'],
        icon: 'img/sensor_magnet_aq2.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_wleak.aq1'],
        icon: 'img/sensor_wleak_aq1.png',
        states: [states.water_detected, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_cube', 'sensor_cube.aqgl01'],
        icon: 'img/cube.png',
        states: [states.shake, states.wakeup, states.fall, states.tap, states.slide, states.flip180,
            states.flip90, states.rotate_left, states.rotate_right, states.voltage, states.battery,
            states.flip90_to, states.flip90_from, states.flip180_side, states.slide_side, states.tap_side,
            states.rotate_angle
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.plug'],
        icon: 'img/plug.png',
        states: [states.state, states.load_power],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.ctrl_86plug.aq1', 'lumi.ctrl_86plug'],
        icon: 'img/86plug.png',
        states: [states.state, states.load_power],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_smoke'],
        icon: 'img/smoke.png',
        states: [states.smoke_detected, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.vibration.aq1'],
        icon: 'img/lumi_vibration.png',
        states: [states.voltage, states.battery, states.vibration_action, states.tilt_action, 
            states.drop_action, states.tilt_angle, states.tilt_angle_x, states.tilt_angle_y, 
            states.tilt_angle_z, states.tilt_angle_x_abs, states.tilt_angle_y_abs,
        ],
    },


    // Osram
    {
        vendor: 'OSRAM',
        models: ['PAR16 50 TW'],
        icon: 'img/lightify-par16.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
                 
   {
        vendor: 'OSRAM',
        models: ['PAR 16 50 RGBW - LIGHTIFY'],
        icon: 'img/lightify-par16.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'OSRAM',
        models: ['Classic B40 TW - LIGHTIFY'],
        icon: 'img/lightify-b40tw.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'OSRAM',
        models: ['Plug 01'],
        icon: 'img/lightify-plug.png',
        states: [states.state],
    },
    {
        vendor: 'OSRAM',
        models: ['Classic A60 RGBW', 'CLA60 RGBW OSRAM'],
        icon: 'img/osram_a60_rgbw.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    {
        vendor: 'OSRAM',
        models: ['LIGHTIFY A19 Tunable White', 'Classic A60 TW', 'CLA60 TW OSRAM'],
        icon: 'img/osram_lightify.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'OSRAM',
        models: ['Ceiling TW OSRAM'],
        icon: 'img/osram_ceiling_tw.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
                 
    {
        vendor: 'OSRAM',
        models: ['Flex RGBW', 'LIGHTIFY Indoor Flex RGBW', 'LIGHTIFY Outdoor Flex RGBW'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'OSRAM',
        models: ['Gardenpole RGBW-Lightify', 'Gardenspot W'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'OSRAM',
        models: ['Classic A60 W clear - LIGHTIFY'],
        icon: 'img/osram_lightify.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'OSRAM',
        models: ['Surface Light TW'],
        icon: 'img/osram_surface_light_tw.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },    
    {
        vendor: 'OSRAM',
        models: ['Surface Light W �C LIGHTIFY'],
        icon: 'img/osram_surface_light_tw.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },         
                 
    // Hue and Philips
    {
        vendor: 'Philips',
        models: ['LWB010'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['LLC010'],
        icon: 'img/philips_hue_iris.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['LLC012', 'LLC011'],
        icon: 'img/hue_go.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['LLC020'],
        icon: 'img/hue_go.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['LST002'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['LWB004'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['LWB006'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['LCT001', 'LCT007', 'LCT010', 'LCT012', 'LCT014', 'LCT015', 'LCT016'],
        icon: 'img/philips_hue_color.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['LCT003'],
        icon: 'img/philips_hue_gu10_color.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['LTC001'],
        icon: 'img/philips_white_ambiance_being.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },                
    {
        vendor: 'Philips',
        models: ['LCT024'],
        icon: 'img/philips_hue_lightbar.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },                     
    {
        vendor: 'Philips',
        models: ['LTW001','LTW004'],
        icon: 'img/philips_hue_ambiance.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
   {
        vendor: 'Philips',
        models: ['LTW010'],
        icon: 'img/philips_hue_ambiance.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },                 
    {
        vendor: 'Philips',
        models: ['LTW012'],
        icon: 'img/philips_hue_e14_ambiance.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['LTW013'],
        icon: 'img/philips_hue_gu10_ambiance.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Philips',
        models: ['RWL020', 'RWL021'],
        icon: 'img/philips_hue_rwl021.png',
        states: [states.rwl_state, states.rwl_up_button, states.rwl_down_button, states.rwl_down_hold, states.rwl_up_hold, states.battery],
    },
    {
        vendor: 'Philips',
        models: ['SML001'],
        icon: 'img/sensor_philipshue.png',
        states: [states.battery, states.occupancy, states.temperature, states.illuminance],
    },


    // IKEA
    {
        vendor: 'IKEA',
        models: [
            'TRADFRI bulb E27 WS opal 980lm', 'TRADFRI bulb E26 WS opal 980lm', 'TRADFRI bulb E27 WS\uFFFDopal 980lm',
        ],
        icon: 'img/TRADFRI.bulb.E27.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: [
            'TRADFRI bulb E27 WS clear 950lm', 'TRADFRI bulb E26 WS clear 950lm',
        ],
        icon: 'img/TRADFRI.bulb.E27.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: [
            'TRADFRI bulb E27 opal 1000lm', 'TRADFRI bulb E27 W opal 1000lm',
            'TRADFRI bulb E26 opal 1000lm'
        ],
        icon: 'img/TRADFRI.bulb.E27.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI bulb GU10 WS 400lm'],
        icon: 'img/ikea_gu10.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI bulb GU10 W 400lm'],
        icon: 'img/ikea_gu10.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI bulb E14 WS opal 400lm', 'TRADFRI bulb E12 WS opal 400lm'],
        icon: 'img/ikea_e14_bulb.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI bulb E27 CWS opal 600lm'],
        icon: 'img/TRADFRI.bulb.E27.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI bulb E14 W op/ch 400lm'],
        icon: 'img/ikea_e14_bulb2.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI transformer 10W', 'TRADFRI transformer 30W'],
        icon: 'img/ikea_transformer.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: ['FLOALT panel WS', 'FLOALT panel WS 30x30', 'FLOALT panel WS 60x60'],
        icon: 'img/FLOALT.panel.WS.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: ['FLOALT panel WS 30x90'],
        icon: 'img/FLOALT.panel.WS.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI wireless dimmer'],
        icon: 'img/tradfri-wireless-dimmer.png',
        states: [states.brightness],
    },

    // Hive
    {
        vendor: 'Hive',
        models: ['FWBulb01'],
        icon: 'img/hive.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // Innr
    {
        vendor: 'Innr',
        models: ['RB 185 C'],
        icon: 'img/innr.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: [
            'RB 165', 'RB 175 W', 'RS 125', 'RS 128 T', 'RB 178 T', 'RB 145', 'PL 110', 'ST 110', 'UC 110',
            'DL 110 N', 'DL 110 W', 'SL 110 N', 'SL 110 M', 'SL 110 W'
        ],
        icon: 'img/innr1.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: ['RS 128 T'],
        icon: 'img/innr2.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },

    // Sylvania
    {
        vendor: 'Sylvania',
        models: ['LIGHTIFY RT Tunable White'],
        icon: 'img/sylvania_rt.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Sylvania',
        models: ['LIGHTIFY BR Tunable White'],
        icon: 'img/sylvania_br.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },

    // GE
    {
        vendor: 'GE',
        models: ['45852'],
        icon: 'img/ge_bulb.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // Sengled
    {
        vendor: 'Sengled',
        models: ['E11-G13'],
        icon: 'img/sengled.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // JIAWEN
    {
        vendor: 'JIAWEN',
        models: ['FB56-ZCW08KU1.1'],
        icon: 'img/jiawen.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    // Belkin
    {
        vendor: 'Belkin',
        models: ['MZ100'],
        icon: 'img/wemo.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // EDP
    {
        vendor: 'EDP',
        models: ['ZB-SmartPlug-1.0.0'],
        icon: 'img/edp_redy_plug.png',
        // TODO: power measurement
        states: [states.state],
    },

    // Custom devices (DiY)
    {
        vendor: 'Custom devices (DiY)',
        models: ['lumi.router'],
        icon: 'img/lumi_router.png',
        // TODO: description, type, rssi
        states: [states.state],
    },
    {
        vendor: 'Custom devices (DiY)',
      	models: ['DNCKAT_S001'],
        icon: 'img/diy.png',
        // TODO: description, type, rssi
        states: [states.DNCKAT_state_1],
    },
    {
        vendor: 'Custom devices (DiY)',
        models: ['DNCKAT_S002'],
        icon: 'img/diy.png',
        // TODO: description, type, rssi
        states: [states.DNCKAT_state_1, states.DNCKAT_state_2],
    },
    {
        vendor: 'Custom devices (DiY)',
        models: ['DNCKAT_S003'],
        icon: 'img/diy.png',
        // TODO: description, type, rssi
        states: [states.DNCKAT_state_1, states.DNCKAT_state_2, states.DNCKAT_state_3],
    },
    {
        vendor: 'Custom devices (DiY)',
        models: ['DNCKAT_S004'],
        icon: 'img/diy.png',
        // TODO: description, type, rssi
        states: [states.DNCKAT_state_41, states.DNCKAT_state_42, states.DNCKAT_state_43, states.DNCKAT_state_44],
    },
    
    {
        vendor: 'HUEUC',
        models: ['HOMA2023'],
        icon: 'img/dimmablelight.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },      

    // Paulmann
    {
        vendor: 'Paulmann',
        models: ['Dimmablelight '],
        icon: 'img/dimmablelight.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Paulmann',
        models: ['RGBW light '],
        icon: 'img/paulmann_rgbw_controller.png',
        states: lightStatesWithColorNoTemp,
        linkedStates: [comb.brightnessAndState],
    },
    // Ksentry
    {
        vendor: 'Ksentry',
        models: ['Lamp_01'],
        icon: 'img/lamp_01.png',
        // TODO: description, type, rssi
        states: [states.state],
    },                       
    // Gledopto
    {
        vendor: 'Gledopto',
        models: ['GL-B-008Z'],
        icon: 'img/gledopto_bulb.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        models: ['GLEDOPTO', 'GL-C-008', 'GL-C-007', 'GL-S-007Z'],
        icon: 'img/gledopto.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        models: ['GL-D-003Z'],
        icon: 'img/gld003z.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },                 
                       
                 
                 
 // Dresden Elektronik
    {
        vendor: 'Dresden Elektronik',
        models: ['FLS-PP3\u0000'],
        icon: 'img/flspp3.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
 // ilux
    {
        vendor: 'ilux',
        models: ['LEColorLight'],
        icon: 'img/lecolorlight.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
// Heiman           
    {
        vendor: 'Heiman',
        models: ['SMOK_V16', 'b5db59bfd81e4f1f95dc57fdbba17931', 'SMOK_YDLV10'],
        icon: 'img/hs1sa.png',
        states: [states.smoke_detected2, states.battery],
    },                                 
];

const commonStates = [
    states.link_quality,
];

module.exports = {
    devices: devices,
    commonStates: commonStates,
    findModel: (model) => devices.find((d) => d.models.includes(model)),
};
