'use strict';

const states = require(__dirname + '/states.js').states;

// return list of changing states when incoming state is changed
const comb = {
    brightnessAndState: (state, value, options, disableQueue) => {
        // if state is brightness
        if (state.id === states.brightness.id) {
            const hasTransitionTime = options && options.hasOwnProperty('transition_time');
            const timeout = (hasTransitionTime ? options.transition_time : 0) * 1000;
            // and new value > 0
            if (value > 0) {
                // turn on light first
                if (disableQueue || !options.state) {
                    return [{
                        stateDesc: states.state,
                        value: true,
                        // index: -1, // before main change
                        // timeout: 0,
                        index: 1, // after main change
                        timeout: timeout,
                    }];
                }
            } else if (disableQueue || options.state) {
                // turn off light after transition time
                return [{
                    stateDesc: states.state,
                    value: false,
                    index: 1, // after main change
                    timeout: timeout,
                }];
            }
        }
    }
};

// return list of states to read after main change has been done
const sync = {
    brightness: (state, value, options) => {
        // if state is brightness
        if (state.id === states.brightness.id) {
            if (value > 0) {
                if (!options.state) {
                    // light is turned on
                    return [{
                        stateDesc: states.state,
                        value: true,
                    }];
                }
            } else if (options.state) {
                // light is turned off
                return [{
                    stateDesc: states.state,
                    value: false,
                }];
            }
        }
    },
    white_brightness: (state, value, options) => {
        // if state is brightness
        if (state.id === states.white_brightness.id) {
            if (value > 0) {
                if (!options.white_state) {
                    // light is turned on
                    return [{
                        stateDesc: states.white_state,
                        value: true,
                    }];
                }
            } else if (options.white_state) {
                // light is turned off
                return [{
                    stateDesc: states.white_state,
                    value: false,
                }];
            }
        }
    },
};

const lightStatesWithColortemp = [states.state, states.brightness, states.colortemp, states.transition_time];
const lightStatesWithColor = [states.state, states.brightness, states.colortemp, states.color, states.transition_time];
const lightStatesWithColorNoTemp = [states.state, states.brightness, states.color, states.transition_time];
const lightStates = [states.state, states.brightness, states.transition_time];

const gl_lightStatesWithColor = [states.gl_state, states.gl_brightness, states.gl_colortemp, states.gl_color, states.transition_time];
const gl_white_channel = [states.white_brightness, states.white_state, states.white_colortemp];
const freepad_states = [states.battery];

function hasEndpoints(device, endpoints) {
    const eps = device.endpoints.map((e) => e.ID);
    for (const endpoint of endpoints) {
        if (!eps.includes(endpoint)) {
            return false;
        }
    }
    return true;
}

const generator = {
    gledopto: (entity) => {
        if (entity.device._modelID === 'GL-C-007' && hasEndpoints(entity.device, [11, 13, 15])) {
            return gl_lightStatesWithColor.concat(gl_white_channel);
        } else {
            return lightStatesWithColor;
        }
    },
    freepad: (entity) => {
        const freepad_st = [];
        const ecount = entity.device.endpoints.length;
        for (let i = 1; i < ecount; i++) {
            freepad_st.push(
                {
                    id: `btn${i}_single`,
                    prop: 'action',
                    name: `Button ${i} click event`,
                    icon: undefined,
                    role: 'button',
                    write: false,
                    read: true,
                    type: 'boolean',
                    isEvent: true,
                    getter: payload => (payload.action === `button_${i}_single`) ? true : undefined,
                }
            );
            freepad_st.push(
                {
                    id: `btn${i}_double`,
                    prop: 'action',
                    name: `Button ${i} double click event`,
                    icon: undefined,
                    role: 'button',
                    write: false,
                    read: true,
                    type: 'boolean',
                    isEvent: true,
                    getter: payload => (payload.action === `button_${i}_double`) ? true : undefined,
                }
            );
            freepad_st.push(
                {
                    id: `btn${i}_hold`,
                    prop: 'action',
                    name: `Button ${i} hold`,
                    icon: undefined,
                    role: 'button',
                    write: false,
                    read: true,
                    type: 'boolean',
                    getter: payload => (payload.action === `button_${i}_hold`) ? true : (payload.action === `button_${i}_release`) ? false : undefined,
                }
            );
            freepad_st.push(
                {
                    id: `btn${i}_triple`,
                    prop: 'action',
                    name: `Button ${i} triple click event`,
                    icon: undefined,
                    role: 'button',
                    write: false,
                    read: true,
                    type: 'boolean',
                    isEvent: true,
                    getter: payload => (payload.action === `button_${i}_triple`) ? true : undefined,
                    lazy: true,
                }
            );
            freepad_st.push(
                {
                    id: `btn${i}_quadruple`,
                    prop: 'action',
                    name: `Button ${i} quadruple click event`,
                    icon: undefined,
                    role: 'button',
                    write: false,
                    read: true,
                    type: 'boolean',
                    isEvent: true,
                    getter: payload => (payload.action === `button_${i}_quadruple`) ? true : undefined,
                    lazy: true,
                }
            );

        }
        return freepad_states.concat(freepad_st);
    },
};

const devices = [
    {
        models: ['WXKG01LM'],
        icon: 'img/xiaomi_wireless_switch.png',
        states: [
            states.click, states.double_click, states.triple_click, states.quad_click,
            states.many_click, states.long_click, states.voltage, states.battery,
            states.long_press,
        ],
    },
    {
        models: ['WXKG11LM'],
        icon: 'img/aqara_switch.png',
        states: (entity) => {
            if (entity.device._modelID === 'lumi.sensor_switch.aq2') {
                return [
                    states.click, states.double_click, states.triple_click, states.quad_click,
                    states.voltage, states.battery
                ];
            } else {
                return [
                    states.click, states.double_click, states.hold,
                    states.voltage, states.battery
                ];
            }
        },
    },
    {
        models: ['WXKG12LM'],
        icon: 'img/aqara_switch.png',
        states: [
            states.click, states.double_click, states.voltage, states.battery,
            states.shake, states.hold
        ],
    },
    {
        models: ['WXKG03LM'],
        icon: 'img/86sw1.png',
        states: [
            states.click, states.double_click, states.voltage, states.battery,
            states.hold
        ],
    },
    {
        models: ['WXKG02LM'],
        icon: 'img/86sw2.png',
        states: [
            states.left_click, states.right_click, states.both_click,
            states.left_click_long, states.left_click_double, states.right_click_long, states.right_click_double,
            states.both_click_long, states.both_click_double, states.voltage, states.battery
        ],
    },
    {
        models: ['WXKG07LM'],
        icon: 'img/86sw2.png',
        states: [
            states.lumi_left_click, states.lumi_right_click, states.lumi_both_click,
            states.lumi_left_click_long, states.lumi_right_click_long, states.lumi_left_click_double, states.lumi_right_click_double,
            states.lumi_both_click_long, states.lumi_both_click_double, states.voltage, states.battery
        ],
    },
    {
        models: ['QBKG11LM'],
        icon: 'img/ctrl_ln1.png',
        states: [
            states.click, states.state, states.operation_mode,
            states.load_power, states.plug_consumption, states.plug_temperature
        ],
    },
    {
        models: ['QBKG12LM'],
        icon: 'img/ctrl_ln2.png',
        // TODO: power measurement
        states: [
            states.left_button, states.right_button, states.left_state, states.right_state,
            states.operation_mode_left, states.operation_mode_right,
            states.left_click_single, states.right_click_single, states.both_click_single,
            states.left_click_double, states.right_click_double, states.both_click_double,
        ],
    },
    {
        models: ['QBKG04LM'],
        icon: 'img/ctrl_neutral1.png',
        states: [states.stateEp, states.operation_mode, states.click],
    },
    {
        models: ['QBKG03LM'],
        icon: 'img/ctrl_neutral2.png',
        states: [
            states.left_button, states.right_button, states.left_state, states.right_state,
            states.operation_mode_left, states.operation_mode_right, states.left_click, states.right_click
        ],
    },
    {
        models: ['WSDCGQ01LM'],
        icon: 'img/sensor_ht.png',
        states: [states.temperature, states.humidity, states.voltage, states.battery],
    },
    {
        models: ['WSDCGQ11LM'],
        icon: 'img/aqara_temperature_sensor.png',
        states: [states.temperature, states.humidity, states.pressure, states.voltage, states.battery],
    },
    {
        models: ['RTCGQ01LM'],
        icon: 'img/aqara_numan_body_sensor.png',
        states: [states.occupancy, states.no_motion, states.voltage, states.battery, states.occupancy_timeout],
    },
    {
        models: ['RTCGQ11LM'],
        icon: 'img/aqara_numan_body_sensor.png',
        states: [states.occupancy, states.no_motion, states.illuminance, states.voltage, states.battery, states.occupancy_timeout],
    },
    {
        models: ['MCCGQ01LM'],
        icon: 'img/magnet.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        models: ['MCCGQ11LM'],
        icon: 'img/sensor_magnet_aq2.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        models: ['SJCGQ11LM'],
        icon: 'img/sensor_wleak_aq1.png',
        states: [states.water_detected, states.voltage, states.battery],
    },
    {
        models: ['MFKZQ01LM'],
        icon: 'img/cube.png',
        states: [
            states.shake, states.wakeup, states.fall, states.tap, states.slide, states.flip180,
            states.flip90, states.rotate_left, states.rotate_right, states.voltage, states.battery,
            states.flip90_to, states.flip90_from, states.flip180_side, states.slide_side, states.tap_side,
            states.rotate_angle
        ],
    },
    {
        models: ['ZNCZ04LM'],
        icon: 'img/xiaomi_plug_eu.png',
        states: [
            states.state, states.load_power, states.plug_voltage, states.load_current, states.plug_consumption,
            states.plug_temperature],
    },
    {
        models: ['ZNCZ02LM'],
        icon: 'img/plug.png',
        states: [states.state, states.load_power, states.plug_voltage, states.plug_consumption, states.plug_temperature],
    },
    {
        models: ['LLKZMK11LM'],
        icon: 'img/lumi.relay.c2acn01.png',
        states: [states.state, states.load_power, states.plug_voltage, states.plug_consumption],
    },
    {
        models: ['QBCZ11LM'],
        icon: 'img/86plug.png',
        states: [states.state, states.load_power, states.plug_voltage, states.plug_consumption, states.plug_temperature],
    },
    {
        models: ['JTYJ-GD-01LM/BW'],
        icon: 'img/smoke.png',
        states: [
            states.smoke_detected, states.voltage, states.battery,
            states.density, states.sensitivity, states.selftest,
        ],
    },
    {
        models: ['DJT11LM'],
        icon: 'img/lumi_vibration.png',
        states: [
            states.voltage, states.battery, states.vibration_action, states.tilt_action,
            states.drop_action, states.tilt_angle, states.tilt_angle_x, states.tilt_angle_y,
            states.tilt_angle_z, states.tilt_angle_x_abs, states.tilt_angle_y_abs,
            states.sensitivity,
        ],
    },
    {
        models: ['A6121'],
        icon: 'img/lumi_lock_v1.png',
        states: [states.inserted, states.forgotten, states.key_error],
    },
    {
        models: ['ZNMS11LM'],
        icon: 'img/lumi_lock_aq1.png',
        states: [
            states.lumi_lock_unlock_user_id,
            states.lumi_lock_failed_times,
            states.lumi_lock_action,
        ],
    },
    {
        models: ['ZNLDP12LM'],
        icon: 'img/aqara_bulb.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['JTQJ-BF-01LM/BW'],
        icon: 'img/smoke.png',
        states: [
            states.natgas_detected, states.natgas_density, states.natgas_sensitivity,
            states.voltage, states.battery
        ],
    },
    {
        models: ['LLKZMK11LM'],
        icon: 'img/lumi_relay.png',
        states: [states.channel1_state, states.channel2_state, states.load_power, states.temperature],
    },
    {
        models: ['ZNCLDJ11LM'],
        icon: 'img/aqara_curtain.png',
        states: [states.curtain_position, states.curtain_running, states.curtain_stop],
    },
    {
        models: ['WXCJKG11LM'],
        icon: 'img/lumi_remote_b286opcn01.png',
        states: [
            states.aqara_opple_1, states.aqara_opple_1_double, states.aqara_opple_1_triple, states.aqara_opple_1_hold,
            states.aqara_opple_2, states.aqara_opple_2_double, states.aqara_opple_2_triple, states.aqara_opple_2_hold,
            states.battery, states.aqara_opple_mode,
        ],
    },
    {
        models: ['WXCJKG12LM'],
        icon: 'img/lumi_remote_b486opcn01.png',
        states: [
            states.aqara_opple_1, states.aqara_opple_1_double, states.aqara_opple_1_triple, states.aqara_opple_1_hold,
            states.aqara_opple_2, states.aqara_opple_2_double, states.aqara_opple_2_triple, states.aqara_opple_2_hold,
            states.aqara_opple_3, states.aqara_opple_3_double, states.aqara_opple_3_triple, states.aqara_opple_3_hold,
            states.aqara_opple_4, states.aqara_opple_4_double, states.aqara_opple_4_triple, states.aqara_opple_4_hold,
            states.battery, states.aqara_opple_mode,
        ],
    },
    {
        models: ['WXCJKG13LM'],
        icon: 'img/lumi_remote_b686opcn01.png',
        states: [
            states.aqara_opple_1, states.aqara_opple_1_double, states.aqara_opple_1_triple, states.aqara_opple_1_hold,
            states.aqara_opple_2, states.aqara_opple_2_double, states.aqara_opple_2_triple, states.aqara_opple_2_hold,
            states.aqara_opple_3, states.aqara_opple_3_double, states.aqara_opple_3_triple, states.aqara_opple_3_hold,
            states.aqara_opple_4, states.aqara_opple_4_double, states.aqara_opple_4_triple, states.aqara_opple_4_hold,
            states.aqara_opple_5, states.aqara_opple_5_double, states.aqara_opple_5_triple, states.aqara_opple_5_hold,
            states.aqara_opple_6, states.aqara_opple_6_double, states.aqara_opple_6_triple, states.aqara_opple_6_hold,
            states.battery, states.aqara_opple_mode,
        ],
    },
    {
        models: ['SP-EUC01'],
        icon: 'img/lonsonho_plug.png',
        states: [states.state, states.load_power],
    },
    {
        models: ['GZCGQ01LM'],
        icon: 'img/lumi_sen_ill_mgl01.png',
        states: [states.battery, states.illuminance],
    },
    /*
    {
        zigbeeModel: ['lumi.sensor_natgas'],
        model: 'JTQJ-BF-01LM/BW',
        description: 'MiJia gas leak detector ',
        supports: 'gas',
        fromZigbee: [
            fz.JTQJBF01LMBW_gas,
            fz.JTQJBF01LMBW_sensitivity,
            fz.JTQJBF01LMBW_gas_density,
            fz.ignore_basic_change,
        ],
        toZigbee: [tz.JTQJBF01LMBW_sensitivity, tz.JTQJBF01LMBW_selfest],
    },
    */

    // Osram
    {
        models: ['AA68199', 'AC03648', '4058075148338'],
        icon: 'img/lightify-par16.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['AB35996', 'AC08559'],
        icon: 'img/lightify-par16.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['AB32840'],
        icon: 'img/lightify-b40tw.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['AB3257001NJ'],
        icon: 'img/lightify-plug.png',
        states: [states.state],
    },
    {
        models: ['AC10691'],
        icon: 'img/lightify-plug.png',
        states: [states.state],
    },
    {
        models: ['AC08560'],
        icon: 'img/lightify-par16.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['AA69697', 'AC03645', 'AC03647'],
        icon: 'img/osram_a60_rgbw.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['AA70155', 'AC03642', 'LED1733G7'],
        icon: 'img/osram_lightify.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['4058075816794'],
        icon: 'img/osram_ceiling_tw.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['4052899926110', '4058075036185'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['4058075036147'],
        icon: 'img/osram_gpole.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['AC0363900NJ'],
        icon: 'img/osram_gpole_mini.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['73699'],
        icon: 'img/osram_g_spot.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['4052899926127'],
        icon: 'img/osram_g_spot.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['AC03641', 'AC10786-DIM'],
        icon: 'img/osram_lightify.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['AB401130055', 'AC10787'],
        icon: 'img/osram_surface_light_tw.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['4052899926158'],
        icon: 'img/osram_surface_light_tw.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['AC08562'],
        icon: 'img/lightify-b40tw.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['4058075816718'],
        icon: 'img/osram_4058075816718.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['AC0251100NJ/AC0251700NJ'],
        icon: 'img/lightify-switch.png',
        states: [states.switch_state, states.switch_circle, states.switch_hold, states.switch_release, states.battery],
    },
    {
        models: ['4058075816459'],
        icon: 'img/ledvance_smartplus_switch.png',
        states: [states.left_top_click, states.right_top_click, states.left_bottom_click, states.right_bottom_click, states.left_top_hold, states.left_top_release, states.right_top_hold, states.right_top_release, states.left_bottom_hold, states.left_bottom_release, states.right_bottom_hold, states.right_bottom_release],
    },
    {
        models: ['AC01353010G'],
        icon: 'img/osram_sensorA.png',
        states: [states.occupancy, states.temperature, states.temp_calibration],
    },
    {
        models: ['595UGR22'],
        icon: 'img/FLOALT.panel.WS.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },

    // Hue and Philips
    {
        models: ['8718699693985'],
        icon: 'img/hue-smart-button.png',
        states: [
            states.button_action_on, states.button_action_off,
            states.button_action_press, states.button_action_hold, states.button_action_release,
            states.button_action_skip_back, states.button_action_skip_forward, states.battery,
        ],
    },
    {
        models: ['8718699688882'],
        icon: 'img/philips_hue_lwo001.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['9290020399'],
        icon: 'img/philips_hue_e14_ambiance.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['8718696449691'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['9290018195', 'LWG004'],
        icon: 'img/philips_hue_gu10_ambiance.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['7199960PH'],
        icon: 'img/philips_hue_iris.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['4090531P7'],
        icon: 'img/philips_hue_flourish.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['7299760PH'],
        icon: 'img/philips_hue_bloom.png',
        states: lightStatesWithColorNoTemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['7146060PH'],
        icon: 'img/hue_go.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['7602031P7'],
        icon: 'img/hue_go.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['7299355PH', '915005106701', '9290018187B'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },   
    {
        models: ['433714'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['9290011370'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['8718699673147'],
        icon: 'img/philips_hue_white.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['9290022169'],
        icon: 'img/philips_hue_e27_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['9290012573A', '9290022166', '8718696167991'],
        icon: 'img/philips_hue_color.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['9290002579A'],
        icon: 'img/philips_hue_lct002.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['8718696167991'],
        icon: 'img/philips_hue_calla_out.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['8718696485880'],
        icon: 'img/philips_hue_gu10_color.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['929001953101'],
        icon: 'img/philips_hue_gu10_color_bt.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['3261030P7'],
        icon: 'img/philips_white_ambiance_being.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['3216331P5', '4096730U7'],
        icon: 'img/philips_hue_ltc015.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['4080248P9'],
        icon: 'img/philips_hue_signe_floor.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['4080148P9'],
        icon: 'img/philips_hue_signe_table.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['5062231P7'],
        icon: 'img/philips_hue_argenta_2.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['5062431P7'],
        icon: 'img/philips_hue_argenta_4.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['3216231P5'],
        icon: 'img/philips_hue_ltc014.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['4034031P7'],
        icon: 'img/philips_hue_ltc002.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },    
    {
        models: ['915005733701'],
        icon: 'img/philips_hue_lightbar.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: [],
        icon: 'img/philips_hue_bloom.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['8718696548738'],
        icon: 'img/philips_hue_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['8718696548738', '9290011998B'],
        icon: 'img/philips_hue_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['8718696695203'],
        icon: 'img/philips_hue_e14_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['8718696598283'],
        icon: 'img/philips_hue_gu10_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['929001953301'],
        icon: 'img/philips_hue_gu10_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['324131092621'],
        icon: 'img/philips_hue_rwl021.png',
        states: [
            states.rwl_state, states.rwl_up_button, states.rwl_down_button, states.rwl_down_hold, states.rwl_up_hold, states.battery,
            states.rwl_counter, states.rwl_duration, states.rwl_multiple_press_timeout
        ],
    },
    {
        models: ['9290012607'],
        icon: 'img/sensor_philipshue.png',
        states: [
            states.battery, states.occupancy, states.occupancy_pirOToUDelay, states.temperature, states.illuminance, states.sml_sensitivity,
            states.temp_calibration, states.illuminance_calibration
        ],
        readAfterWriteStates: [states.occupancy_pirOToUDelay, states.sml_sensitivity],
    },
    {
        models: ['9290019758'],
        icon: 'img/hue_outdoor_motion.png',
        states: [
            states.battery, states.occupancy, states.occupancy_pirOToUDelay, states.temperature, states.illuminance, states.sml_sensitivity,
            states.temp_calibration, states.illuminance_calibration
        ],
        readAfterWriteStates: [states.occupancy_pirOToUDelay, states.sml_sensitivity],
    },
    {
        models: ['929002240401'],
        icon: 'img/philips_hue_lom001.png',
        states: [states.state],
    },
    {
        models: [],
        icon: 'img/philips_lwl.png',
        states: [states.state],
    },
    {
        models: ['929002241201', '8718699688820'],
        icon: 'img/philips_hue_lwv001.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['1742930P7'],
        icon: 'img/philips_hue_1742930P7.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['1746430P7'],
        icon: 'img/philips_hue_1746430P7.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['915005587401'],
        icon: 'img/LTW017.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['3435011P7'],
        icon: 'img/philips_hue_ltc021.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },    
    {
        models: ['1746130P7'],
        icon: 'img/philips_hue_1746130P7.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    
    // SCHWAIGER
    {
        models: [],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },

    // IKEA
    {
        models: ['ICPSHC24-10EU-IL-1', 'ICPSHC24-30EU-IL-1'],
        icon: 'img/lightify-driver.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['T1820'],
        icon: 'img/ikea_recessed_spot_light.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['LED1545G12', 'LED1836G9', 'LED1736G9', 'LED1546G12', 'LED1732G11'],
        icon: 'img/ikea_bulb_E27.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },

    {
        models: ['LED1842G3'],
        icon: 'img/ikea_bulb_E27_clear.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['LED1623G12', 'LED1622G12', 'LED1836G9'],
        icon: 'img/ikea_bulb_E27.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['LED1537R6/LED1739R5'],
        icon: 'img/ikea_gu10.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['LED1650R5', 'LED1837R5'],
        icon: 'img/ikea_gu10.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['LED1536G5', 'LED1903C5/LED1835C6'],
        icon: 'img/ikea_e14_bulb.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['LED1624G9'],
        icon: 'img/ikea_bulb_E27.png',
        states: lightStatesWithColorNoTemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['LED1624G9'],
        icon: 'img/ikea_e14_bulb.png',
        states: lightStatesWithColorNoTemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['LED1649C5'],
        icon: 'img/ikea_e14_bulb2.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['ICPSHC24-10EU-IL-1', 'ICPSHC24-30EU-IL-1'],
        icon: 'img/ikea_transformer.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['L1527', 'L1529'],
        icon: 'img/FLOALT.panel.WS.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['L1528'],
        icon: 'img/FLOALT.panel.WS.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['T1828'],
        icon: 'img/gunnarp_panel.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['E1603/E1702'],
        icon: 'img/ikea_control_outlet.png',
        states: [states.state],
    },
    {
        models: ['ICPSHC24-10EU-IL-1', 'ICPSHC24-30EU-IL-1'],
        icon: 'img/ikea_transformer.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['ICTC-G-1'],
        icon: 'img/ikea_wireless_dimmer1.png',
        states: [states.brightness_readonly, states.battery],
    },
    {
        models: ['E1524/E1810'],
        icon: 'img/ikea_remote_control1.png',
        states: [
            states.E1524_toggle, states.E1524_hold,
            states.E1524_left_click, states.E1524_right_click, states.E1524_up_click, states.E1524_down_click,
            states.E1524_left_button, states.E1524_right_button, states.E1524_up_button, states.E1524_down_button,
        ],
    },
    {
        models: ['E1743'],
        icon: 'img/ikea_on-off-switch.png',
        states: [states.E1743_onoff, states.E1743_up_button, states.E1743_down_button, states.battery],
    },
    {
        models: ['E1746'],
        icon: 'img/ikea_repeater.png',
        states: [],
    },
    {
        models: ['E1525/E1745'],
        icon: 'img/ikea_motion_sensor.png',
        states: [states.occupancy, states.battery, states.no_motion]
    },
    {
        models: ['E1757', 'E1926'],
        states: [states.battery, states.blind_position, states.blind_stop],
        icon:  'img/Ikea_fyrtur.png',
    },
    {
        models: ['ICPSHC24-10EU-IL-1', 'ICPSHC24-30EU-IL-1'],
        icon: 'img/ikea_transformer.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['E1766'],
        icon: 'img/ikea_open_close_switch.png',
        states: [states.cover_close, states.cover_open, states.battery],
    },
    {
        models: ['L1531'],
        icon: 'img/surte_door_light_panel.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['E1744'],
        icon: 'img/ikea_SYMFONISK_Sound_Controller.png',
        states: [states.button_action_skip_back, states.button_action_skip_forward,  states.action_play_pause,
            states.rotate_left, states.rotate_right, states.rotate_stop, states.battery],
    },
    // Hive
    {
        models: ['HALIGHTDIMWWE27'],
        icon: 'img/hive.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Illuminize
    {
        models: ['511.201'],
        icon: 'img/illuminize_511_201.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['511.202'],
        icon: 'img/illuminize_511_201.png',
        states: [states.state],
    },
    {
        models: ['511.040'],
        icon: 'img/iluminize_511_040.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    // Innr
    {
        models: ['RB 185 C', 'RB 285 C', 'RB 250 C'],
        icon: 'img/innr.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['BY 185 C', 'BY 285 C'],
        icon: 'img/innr4.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['RS 230 C'],
        icon: 'img/innr_color_gu10.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['RB 165', 'RB 175 W', 'RS 125', 'RB 145', 'PL 110', 'ST 110', 'UC 110', 'DL 110 N', 'DL 110 W', 'SL 110 N', 'SL 110 M', 'SL 110 W', 'RB 245', 'RB 265', 'RF 265'],
        icon: 'img/innr1.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['RB 178 T', 'RB 278 T'],
        icon: 'img/innr1.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['RS 225'],
        icon: 'img/innr2.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['RS 128 T', 'RS 228 T'],
        icon: 'img/innr2.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['RB 248 T', 'RB 148 T'],
        icon: 'img/innr3.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['RB 245'],
        icon: 'img/innr3.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['RF 263'],
        icon: 'img/innr_filament1.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['SP 120', 'SP 220', 'SP 222', 'SP 224'],
        icon: 'img/innr_plug.png',
        states: [states.state,states.load_power],
    },
    {
        models: ['FL 130 C', 'OSL 130 C'],
        icon: 'img/innr_flex_FL130C.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    // Lingan
    {
        models: ['SA-003-Zigbee'],
        icon: 'img/lamp_01.png',
        states: [states.state],
    },
    // Sylvania
    {
        models: ['73742'],
        icon: 'img/sylvania_rt.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['73740'],
        icon: 'img/sylvania_br.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },

    // GE
    {
        models: ['45852GE'],
        icon: 'img/ge_bulb.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // Sengled
    {
        models: ['E11-G13'],
        icon: 'img/sengled.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // JIAWEN
    {
        models: ['K2RGBW01'],
        icon: 'img/jiawen.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    // Belkin
    {
        models: ['F7C033'],
        icon: 'img/wemo.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // EDP
    {
        models: ['PLUG EDP RE:DY'],
        icon: 'img/edp_redy_plug.png',
        // TODO: power measurement
        states: [states.state],
    },

    // Custom devices (DiY)
    {
        models: ['CC2530.ROUTER'],
        icon: 'img/lumi_router.png',
        states: [states.state],
    },
    {
        models: ['DNCKATSW001'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_1],
    },
    {
        models: ['DNCKATSW002'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_1, states.DNCKAT_state_2],
    },
    {
        models: ['DNCKATSW003'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_1, states.DNCKAT_state_2, states.DNCKAT_state_3],
    },
    {
        models: ['DNCKATSW004'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_41, states.DNCKAT_state_42, states.DNCKAT_state_43, states.DNCKAT_state_44],
    },
    {
        models: ['DIYRuZ_R4_5'],
        icon: 'img/DIYRuZ.png',
        states: [states.DNCKAT_state_41, states.DNCKAT_state_42, states.DNCKAT_state_43, states.DNCKAT_state_44, states.DIYRUZ_buzzer],
    },
    {
        models: ['ZigUP'],
        icon: 'img/diy.png',
        states: [
            states.state,
            states.zigup_cputemp,
            states.zigup_exttemp,
            states.zigup_exthumi,
            states.zigup_s0counts,
            states.zigup_adc_volt,
            states.zigup_diginput,
            states.zigup_reason,
            states.color,
        ],
    },
    {
        models: ['DIYRuZ_KEYPAD20'],
        icon: 'img/DIYRuZ.png',
        states: [
            states.voltage, states.battery,
            states.keypad_btn1, states.keypad_btn2, states.keypad_btn3, states.keypad_btn4, states.keypad_btn5,
            states.keypad_btn6, states.keypad_btn7, states.keypad_btn8, states.keypad_btn9, states.keypad_btn10,
            states.keypad_btn11, states.keypad_btn12, states.keypad_btn13, states.keypad_btn14, states.keypad_btn15,
            states.keypad_btn16, states.keypad_btn17, states.keypad_btn18, states.keypad_btn19, states.keypad_btn20
        ],
    },
    {
        models: ['DIYRuZ_magnet'],
        icon: 'img/DIYRuZ.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        models: ['DIYRuZ_rspm'],
        icon: 'img/DIYRuZ.png',
        states: [
            states.state,
            states.zigup_cputemp,
            states.load_power,
            states.load_current,
            states.hold,
            states.temperature,
        ],
    },
    {
        models: ['DIYRuZ_R8_8'],
        icon: 'img/DIYRuZ_R8_8.png',
        states: [
            states.l1_state, states.l2_state, states.l3_state, states.l4_state,
            states.l5_state, states.l6_state, states.l7_state, states.l8_state,
            states.btn1_single, states.btn2_single, states.btn3_single, states.btn4_single,
            states.btn5_single, states.btn6_single, states.btn7_single, states.btn8_single,
        ],
    },
    {
        models: ['DIYRuZ_FreePad'],
        icon: 'img/DIYRuZ_FreePad.png',
        states: generator.freepad,
    },
    {
        models: ['DIYRuZ_Geiger'],
        icon: 'img/DIYRuZ_Geiger.png',
        states: [
            states.radioactive_events_per_minute,
            states.radiation_dose_per_hour,
            states.action_onoff,
            states.geiger_sensitivity,
            states.geiger_led_feedback,
            states.geiger_buzzer_feedback,
            states.geiger_sensors_count,
            states.geiger_sensors_type,
            states.geiger_alert_threshold,
        ],
    },

    {
        models: ['GD-CZ-006'],
        icon: 'img/dimmablelight.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // Paulmann
    {
        models: [],
        icon: 'img/dimmablelight.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: [],
        icon: 'img/dimmablelight.png',
        states: [states.state],
    },
    {
        models: ['500.48'],
        icon: 'img/paulmann_rgbw_controller.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['50049'],
        icon: 'img/paulmann_rgbw_controller.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['50064'],
        icon: 'img/paulmann_spot.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['371000001','371000002'],
        icon: 'img/paulmann_spot.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        models: ['50043'],
        icon: 'img/dimmablelight.png',
        states: [states.state],
    },
    {
        models: ['798.15'],
        icon: 'img/dimmablelight.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        models: ['798.09'],
        icon: 'img/Paulmann_79809.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['500.67'],
        icon: 'img/Paulmann_50067.png',
        states: [
            states.tint404011_onoff,
            states.E1524_toggle,
            states.brightness_step_up, states.brightness_step_up_size,
            states.brightness_step_down, states.brightness_step_down_size,
            states.brightness_stop,
            states.color_temperature_move, states.color_temperature_move_value,
            states.color_move, states.color_move_value,
            states.brightness_move_up, states.brightness_move_up_size,
            states.brightness_move_down, states.brightness_move_down_size,
            states.enhanced_move_to_hue_and_saturation, states.enhanced_move_enhanced_hue,
            states.enhanced_move_hue, states.enhanced_move_saturation,
            states.scene,
        ],
    },

    // Ksentry
    {
        models: ['KS-SM001'],
        icon: 'img/lamp_01.png',
        states: [states.state],
    },
    // Gledopto
    {
        models: ['GL-MC-001'],
        icon: 'img/gledopto_stripe.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['GL-B-008Z', 'GL-B-001Z', 'GL-B-007Z', 'GL-B-007ZS'],
        icon: 'img/gledopto_bulb.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['GL-C-006', 'GL-C-008-1ID', 'GL-C-007-1ID', 'GL-C-008S', 'GL-C-008-2ID'],
        icon: 'img/gledopto.png',
        states: generator.gledopto,
        syncStates: [sync.brightness, sync.white_brightness],
    },
    {
        models: ['GL-C-006', 'GL-C-009'],
        icon: 'img/gledopto.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['GL-D-003Z', 'GL-D-003ZS', 'GL-D-004Z'],
        icon: 'img/gld003z.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['GL-G-001Z', 'GL-FL-004TZ'],
        icon: 'img/gledopto_spot.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['GL-S-007Z'],
        icon: 'img/gledopto_gu10.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['GL-W-001Z'],
        icon: 'img/nue_switch_single.png',
        states: [states.state],
    },
    // Dresden Elektronik
    {
        models: ['Mega23M12'],
        icon: 'img/flspp3.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['XVV-Mega23M12'],
        icon: 'img/flspp3.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    // ilux
    {
        models: ['900008-WW'],
        icon: 'img/lecolorlight.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Heiman
    {
        models: ['HS1SA-M', 'HS3SA'],
        icon: 'img/hs1sa.png',
        states: [states.smoke_detected2, states.battery, states.heiman_batt_low],
    },
    {
        models: ['HS1CA-E'],
        icon: 'img/hs1sa.png',
        states: [states.co_detected, states.battery, states.heiman_batt_low],
    },
    {
        models: ['HS1CA-E'],
        icon: 'img/hs1sa.png',
        states: [
            states.heiman_smart_controller_emergency, states.heiman_smart_controller_armed,
            states.heiman_smart_controller_arm_mode, states.battery
        ],
    },
    {
        models: ['HS2SK'],
        icon: 'img/hs2sk.png',
        states: [states.state, states.load_power, states.load_current, states.plug_voltage],
    },
    {
        models: ['HS2WD-E'],
        icon: 'img/heiman_HS2WD_E.png',
        states: [
            states.heiman_execute_warning,
            states.heiman_execute_warning_strobe_only,
            states.heiman_batt_low,
            states.heiman_battery,
            states.voltage
        ],
    },
    {
        models: ['SGMHM-I1'],
        icon: 'img/SGMHM-I1.png',
        states: [
            states.gas_detected,
        ],
    },
    {
        models: ['HGZB-20-DE', 'HGZB-20A'],
        icon: 'img/smarthomepty_plug.png',
        states: [states.state],
    },
    {
        models: ['HGZB-07A'],
        icon: 'img/sylvania_rt.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['HGZB-07A'],
        icon: 'img/smarthomepty_remote.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },    
    // Mueller Licht
    {
        models: ['404000/404005/404012', '4713407'],
        icon: 'img/zbt_e27_rgbw.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['404006/404008/404004'],
        icon: 'img/innr3.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['MLI-404011'],
        icon: 'img/zbt_remote.png',
        states: [
            states.tint404011_scene_sunset, states.tint404011_scene_party,
            states.tint404011_scene_nightlight, states.tint404011_scene_working,
            states.tint404011_scene_bonfire, states.tint404011_scene_romance,
            states.tint404011_brightness_up_click, states.tint404011_brightness_down_click,
            states.tint404011_colortemp_read, states.tint404011_color_read,
            states.tint404011_onoff, states.tint404011_brightness_up_hold,
            states.tint404011_brightness_down_hold
        ]
    },

    {
        models: ['44435'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    {
        models: ['404028'],
        icon: 'img/zbt_led_panel.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    {
        models: ['404021'],
        icon: 'img/zbt_smart_switch.png',
        states: [states.state],
    },

    // Ninja Blocks
    {
        models: ['Z809AF'],
        icon: 'img/ninja_plug.png',
        states: [states.state, states.load_power],
    },
    // Paul Neuhaus
    {
        models: [],
        icon: 'img/q-inigo_led_ceiling_light.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: [],
        icon: 'img/q-flag_led_panel.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    // Eurotronic
    {
        models: ['SPZB0001'],
        icon: 'img/Eurotronic_Spirit_04.png',
        states: [
            states.battery,
            states.hvacThermostat_local_temp, states.hvacThermostat_local_temp_calibration,
            states.hvacThermostat_occupied_heating_setpoint, states.hvacThermostat_unoccupied_heating_setpoint,
            states.SPBZ0001_current_heating_setpoint, states.SPBZ0001_error_status,
            states.SPZB0001_valve_position, states.SPBZ0001_auto_valve_position,
            states.SPBZ0001_system_mode, states.SPBZ0001_trv_mode,
            states.SPBZ0001_window_open, states.SPBZ0001_boost,
            states.SPBZ0001_child_protection, states.SPBZ0001_mirror_display
        ],
    },
    // Immax
    {
        models: ['07005B'],
        icon: 'img/immax_e14.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Bitron
    {
        models: ['AV2010/25'],
        icon: 'img/bitron_plug.png',
        states: [states.state, states.load_power],
    },
    {
        models: ['AV2010/32'],
        icon: 'img/AV2010_32.png',
        states: [
            states.hvacThermostat_local_temp,
            states.hvacThermostat_local_temp_calibration,
            states.hvacThermostat_occupancy,
            states.hvacThermostat_occupied_heating_setpoint,
            states.hvacThermostat_unoccupied_heating_setpoint,
            states.hvacThermostat_setpoint_raise_lower,
            states.hvacThermostat_remote_sensing,
            states.hvacThermostat_control_sequence_of_operation,
            states.hvacThermostat_system_mode,
            states.voltage,
        ],
    },
    {
        models: ['AV2010/21A'],
        icon: 'img/Bitron_AV201021A.png',
        states: [states.contact, states.opened, states.tamper, states.voltage, states.heiman_batt_low],
    },
    {
        models: ['902010/24'],
        icon: 'img/bitron_902010_24.png',
        states: [states.heiman_batt_low, states.smoke_detected],
    },
    {
        models: [],
        icon: 'img/bitron_motion.png',
        states: [states.occupancy, states.no_motion, states.voltage, states.battery, states.heiman_batt_low, states.occupancy_timeout],
    },    
    {
        models: ['AV2010/22A'],
        icon: 'img/bitron_motion_a.png',
        states: [states.occupancy, states.no_motion, states.voltage, states.battery, states.heiman_batt_low, states.occupancy_timeout],
    },
    // Sunricher
    {
        models: ['ZG9101SAC-HP'],
        icon: 'img/sunricher_dimmer.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Nue / 3A
    {
        models: ['HGZB-42-UK / HGZB-41 / HGZB-41-UK'],
        icon: 'img/fnb56zsw01.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['XY12S-15'],
        icon: 'img/fnb56zsw01.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['HGZB-42-UK / HGZB-41 / HGZB-41-UK', 'HGZB-02A'],
        icon: 'img/nue_hgzb-02a.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['HGZB-41', 'HGZB-20-UK'],
        icon: 'img/nue_switch_single.png',
        states: [states.state],
    },
    {
        models: ['HGZB-42'],
        icon: 'img/tuya_switch_2.png',
        states: [states.top_state, states.bottom_state],
    },

    // eCozy
    {
        models: ['1TST-EU'],
        icon: 'img/ecozy.png',
        states: [
            //        states.factory_reset,
            states.hvacThermostat_local_temp,
            states.hvacThermostat_local_temp_calibration,
            states.hvacThermostat_occupancy,
            states.hvacThermostat_occupied_heating_setpoint,
            states.hvacThermostat_unoccupied_heating_setpoint,
            states.hvacThermostat_setpoint_raise_lower,
            states.hvacThermostat_remote_sensing,
            states.hvacThermostat_control_sequence_of_operation_write,
            //        states.hvacThermostat_weeklyShedule,
            //        states.hvacThermostat_clear_weeklySchedule,
            states.hvacThermostat_system_mode,
            //        states.hvacThermostat_weekly_schedule_rsp,
            //        states.hvacThermostat_relay_status_log,
            //        states.hvacThermostat_relay_status_log_rsp,
            states.ecozy_voltage]
    },
    // Shenzhen Homa
    {
        models: ['HLD812-Z-SC', 'HLC821-Z-SC'],
        icon: 'img/smart_led_driver.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Danalock
    {
        models: ['V3-BTZB'],
        icon: 'img/danalock_v3.png',
        states: [states.lock_state, states.battery, states.heiman_batt_low],
    },
    // Trust
    {
        models: ['ZPIR-8000'],
        icon: 'img/trust_zpir_8000.png',
        states: [states.occupancy, states.battery],
    },
    {
        models: ['ZCTS-808'],
        icon: 'img/sensor_magnet_aq2.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        models: ['ZLED-2709'],
        icon: 'img/wemo.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['X711A'],
        icon: 'img/tuya_switch_1.png',
        states: [states.l1],
    },
    {
        models: [ 'X712A'],
        icon: 'img/tuya_switch_2.png',
        states: [states.l1, states.l2],
    },
    {
        models: ['ZLED-TUNE9'],
        icon: 'img/trust_tune9.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['81809/81813'],
        icon: 'img/zbt_e27_rgbw.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['ZWLD-100'],
        icon: 'img/ZWLD-100.png',
        states: [states.water_detected, states.tamper, states.heiman_batt_low],
    },
    {
        models: ['ZYCT-202'],
        icon: 'img/gibtmichnochnicht.png',
        states: [
            states.battery, states.ZYCT202_down, states.ZYCT202_up,
            states.ZYCT202_off, states.ZYCT202_on, states.ZYCT202_stop
        ],
    },
    // Konke
    {
        models: ['2AJZ4KPKEY'],
        icon: 'img/konke_kpkey.png',
        states: [states.click, states.double_click, states.long_click, states.battery, states.voltage],
    },
    {
        models: ['2AJZ4KPBS'],
        icon: 'img/konke_kpbs.png',
        states: [states.battery, states.voltage, states.occupancy_event],
    },
    {
        models: ['2AJZ4KPFT'],
        icon: 'img/konke_kpft.png',
        states: [states.battery, states.voltage, states.temperature, states.humidity],
    },
    {
        models: ['2AJZ4KPDR'],
        icon: 'img/konke_kpdr.png',
        states: [states.battery, states.voltage, states.contact, states.opened],
    },
    // Tuya
    {
        models: ['TT001ZAV20'],
        icon: 'img/tuya_RH3052.png',
        states: [states.temperature, states.temp_calibration, states.humidity, states.humidity_calibration, states.voltage, states.battery],
    },
    {
        models: ['TS0201'],
        icon: 'img/tuya_TS0201.png',
        states: [states.temperature, states.humidity, states.voltage, states.battery],
    },
    {
        models: ['GDKES-01TZXD', 'TS0001', 'TS0011'],
        icon: 'img/tuya_switch_1.png',
        states: [states.state],
    },
    {
        models: ['GDKES-02TZXD', 'TS0012'],
        icon: 'img/tuya_switch_2.png',
        states: [states.left_state, states.right_state],
    },
    {
        models: ['GDKES-03TZXD', 'ZM-L03E-Z', 'TS0013'],
        icon: 'img/tuya_switch_3.png',
        states: [states.left_state, states.right_state, states.center_state],
    },
    {
        models: ['gq8b1uv'],
        icon: 'img/gq8b1uv.png',
        states: [states.state, states.brightness],
    },
    {
        models: ['RH3040'],
        icon: 'img/tuya_pir.png',
        states: [states.occupancy, states.voltage, states.battery],
    },
    {
        models: ['TS0218'],
        icon: 'img/TS0218.png',
        states: [states.action_click],
    },
 
    {
        models: ['S9ZGBRC01'],
        icon: 'img/TS0215.png',
        states: [states.battery, states.emergency, states.disarm, states.arm_away, states.arm_stay],
    },
    {
        models: ['TS0601_curtain'],
        icon: 'img/owvfni3.png',
        states: [states.curtain_position, states.curtain_running, states.curtain_stop],
    },
    {
        models: ['TS0121'],
        icon: 'img/lonsonho_plug.png',
        states: [states.state, states.plug_summdelivered, states.load_current, states.plug_voltage, states.load_power],
    },	
    {        
        models: ['TS0601_thermostat'],
        icon: 'img/tuya_TS0601.png',
        states: [
            states.voltage,
            states.hvacThermostat_local_temp,
            states.hvacThermostat_local_temp_calibration,
            states.tuya_trv_target_temperature,
            states.tuya_trv_lock,
            states.tuya_trv_auto_lock,
            states.tuya_trv_min_temp,
            states.tuya_trv_max_temp,
            states.tuya_trv_boost_time,
            states.tuya_trv_comfort_temp,
            states.tuya_trv_eco_temp,
            states.tuya_trv_system_mode,
            states.tuya_trv_force_mode,
            states.tuya_trv_valve_position,
            states.SPBZ0001_window_open
        ],
    },		
    // Zemismart
    {
        models: ['TS0002'],
        icon: 'img/zemismart_sw2.png',
        states: [states.channel1_state, states.channel2_state],
    },
	
    // Lonsonho
    {
        models: ['4000116784070'],
        icon: 'img/lonsonho_plug.png',
        states: [states.state],
    },
    // iHORN
    {
        models: ['LH-32ZB'],
        icon: 'img/lh_32Zb.png',
        states: [states.temperature, states.humidity, states.voltage, states.battery],
    },
    // ITEAD
    {
        models: ['BASICZBR3'],
        icon: 'img/basiczbr3.png',
        states: [states.state],
    },
    // TERNCY
    {
        models: ['TERNCY-PP01'],
        icon: 'img/terncy_pp01.png',
        states: [
            states.temperature, states.occupancy, states.occupancy_side, states.no_motion,
            states.illuminance, states.battery, states.click, states.double_click, states.triple_click,
        ],
    },
    {
        models: ['TERNCY-SD01'],
        icon: 'img/terncy_sd01.png',
        states: [
            states.battery, states.click, states.double_click, states.triple_click,
            states.rotate_direction, states.rotate_number,
        ],
    },
    // ORVIBO
    {
        models: ['CR11S8UZ'],
        icon: 'img/orvibo_cr11s8uz.png',
        states: [
            states.btn1_click, states.btn2_click, states.btn3_click, states.btn4_click,
            states.btn1_pressed, states.btn2_pressed, states.btn3_pressed, states.btn4_pressed,
        ],
    },
    // LIVOLO
    {
        models: ['TI0001'],
        icon: 'img/livolo.png',
        states: [states.left_state, states.right_state],
    },
    {
        models: ['TI0001-switch'],
        icon: 'img/livolo_switch_1g.png',
        states: [states.state],
    },
    {
        models: ['TI0001-socket'],
        icon: 'img/livolo_socket.png',
        states: [states.state],
    },
    // HORNBACH
    {
        models: ['10011725'],
        icon: 'img/flair_viyu_e27_rgbw.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    // eWeLink
    {
        models: ['SNZB-04'],
        icon: 'img/ewelink_DS01.png',
        states: [
            states.contact, states.opened, states.voltage, states.battery,
        ],
    },
    {
        models: ['SNZB-01'],
        icon: 'img/ewelink_WB01.png',
        states: [
            states.action_single, states.action_double_click, states.action_long_click,
            states.voltage, states.battery,
        ],
    },
    {
        models: ['SNZB-02'],
        icon: 'img/ewelink_TH01.png',
        states: [
            states.temperature, states.humidity, states.voltage, states.battery,
        ],
    },
    {
        models: ['SNZB-03'],
        icon: 'img/ewelink_MS01.png',
        states: [
            states.occupancy, states.no_motion, states.voltage, states.battery,
        ],
    },
    //iCasa
    {
        models: ['ICZB-IW11D'],
        icon: 'img/sunricher_dimmer.png',
        states: [states.lightStates],
    },
    {
        models: ['ICZB-IW11SW'],
        icon: 'img/sunricher_dimmer.png',
        states: [states.state],
    },
    {
        models: ['ICZB-B1FC60/B3FC64/B2FC95/B2FC125'],
        icon: 'img/philips_hue_lwv001.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        models: ['ICZB-KPD14S'],
        icon: 'img/iczb_kpd14s.png',
        states: [
            states.icasa_click, states.scenes_recall_click, states.icasa_action, states.icasa_brightness, states.voltage, states.battery,
        ],
    },
    {
        models: ['ICZB-KPD18S'],
        icon: 'img/iczb_kpd18s.png',
        states: [
            states.icasa_click, states.scenes_recall_click, states.icasa_action, states.icasa_brightness, states.voltage, states.battery,
        ],
    },
    // Oujiabao
    {
        models: ['CR701-YZ'],
        icon: 'img/qujiabao_gas.png',
        states: [
            states.co_detected, states.gas_detected,
            states.heiman_batt_low, states.tamper,
        ],
    },
    // LifeControl
    {
        models: ['MCLH-02'],
        icon: 'img/lifecontrol_lamp.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        models: ['MCLH-07'],
        icon: 'img/lifecontrol_water-sensor.png',
        states: [states.water_detected, states.battery],
    },
    {
        models: ['MCLH-04'],
        icon: 'img/lifecontrol_door-alarm.png',
        states: [states.contact, states.opened, states.battery],
    },
    {
        models: ['MCLH-08'],
        icon: 'img/lifecontrol_air-sensor.png',
        states: [states.temperature, states.humidity, states.voc, states.eco2],
    },
    {
        models: ['MCLH-05'],
        icon: 'img/lifecontrol_motion-sensor.png',
        states: [states.battery, states.occupancy],
    },
    {
        models: ['MCLH-03'],
        icon: 'img/lifecontrol_plug.png',
        states: [states.state, states.load_power, states.load_current, states.plug_voltage],
    },
    // Moes
    {
        models: ['TS0601_thermostat'],
        icon: 'img/moes_trv.png',
        states: [
            states.battery,
            states.hvacThermostat_local_temp,
            states.hvacThermostat_local_temp_calibration,
            states.tuya_trv_target_temperature,
            states.tuya_trv_lock,
            states.tuya_trv_window_detected,
            states.tuya_trv_valve_detected,
            states.tuya_trv_auto_lock,
            states.tuya_trv_min_temp,
            states.tuya_trv_max_temp,
            states.tuya_trv_boost_time,
            states.tuya_trv_comfort_temp,
            states.tuya_trv_eco_temp,
            states.tuya_trv_system_mode,
            states.tuya_trv_force_mode,
            states.tuya_trv_valve_position,
        ],
    },
    // Essentials 
    {
        models: ['GS361A-H04'],
        icon: 'img/essentials_premium.png',
        states: [
            states.battery,
            states.hvacThermostat_local_temp,
            states.hvacThermostat_local_temp_calibration,
            states.tuya_trv_target_temperature,
            states.tuya_trv_lock,
            states.tuya_trv_window_detected,
            states.tuya_trv_valve_detected,
            states.tuya_trv_auto_lock,
            states.tuya_trv_min_temp,
            states.tuya_trv_max_temp,
            states.tuya_trv_boost_time,
            states.tuya_trv_comfort_temp,
            states.tuya_trv_eco_temp,
            states.tuya_trv_system_mode,
            states.tuya_trv_force_mode,
            states.tuya_trv_valve_position,
        ],
    },
    // IMMAX
    {
        models: ['07004D'],
        icon: 'img/sengled.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    // Blitzwolf
    {
        models: ['BW-IS2'],
        icon: 'img/blitzwolf_magnet.png',
        states: [states.contact, states.opened, states.tamper, states.voltage, states.heiman_batt_low],
    },
    {
        models: ['BW-IS3'],
        icon: 'img/BW-IS3.png',
        states: [states.occupancy, states.occupancy_timeout],
    },
    // Insta Gira  Jung
    {
        models: ['InstaRemote'],
        icon: 'img/gira_4_buttons.png',
        states: [
            states.gira_pressed_up, states.gira_pressed_down_hold, states.gira_pressed_stop,
            states.gira_scene_click, states.gira_step_mode, states.gira_step_size,
        ],
    },
    // Busch Jaeger 
    {
        models: ['6735/6736/6737'],
        icon: 'img/gira_4_buttons.png',
        states: [states.state, states.brightness, states.rm01_row_2, states.rm01_row_3, states.rm01_row_4],
    },
    // Friends of Hue Smart Switch, Senic & Gira, Enocean based
    {
        models: ['GreenPower_On_Off_Switch'],
        icon: 'img/ctrl_neutral2.png',
        states: [
            states.button_action_press, states.button_action_release, states.action,
        ],
    },
    
    // Smart9
    {
        models: ['TS0041'],
        icon: 'img/smart9_s9tszgb-1.png',
        states: [
            states.action_single, states.action_double_click, states.hold,
        ],
    },
    
    {
        models: ['S9TSZGB_3'],
        icon: 'img/smart9_s9tszgb-3.png',
        states: [
            states.ts0043_right_click, states.ts0043_middle_click, states.ts0043_left_click,
            states.ts0043_right_double, states.ts0043_middle_double, states.ts0043_left_double,
            states.ts0043_right_hold, states.ts0043_middle_hold, states.ts0043_left_hold,
            states.voltage, states.battery,
        ],
    },
    // SmartThings  
    {
        models: ['STS-IRM-250', 'STS-IRM-251'],
        icon: 'img/smartthings_motion.png',
        states: [states.occupancy, states.no_motion, states.temperature, states.voltage, states.battery, states.occupancy_timeout],
    },    
        
    // Moes   
    {
        models: ['ZK-EU-2U'],
        icon: 'img/moes_ts0112.png',
        states: [states.state],
    },
	
    // CR Smart Home	
    {
        models: ['TS0111'],
        icon: 'img/crts0111.png',
        states: [states.state],
    },

    // Neo
    {
        models: ['NAS-AB02B0'],
        icon: 'img/NAS-AB02B0.png',
        states: [
            states.temperature, states.humidity,
            states.alarm, states.melody, states.volume, states.duration,
            states.temperature_max, states.temperature_min,
            states.humidity_max, states.humidity_min,
            states.temperature_alarm, states.humidity_alarm,
        ],
    },
];

const commonStates = [
    states.link_quality,
    states.available
];

const groupStates = [].concat(lightStatesWithColor);

const byModel = new Map();
for (const device of devices) {
    for (const model of device.models) {
        const stripModel = model.replace(/\0.*$/g, '').trim();
        byModel.set(stripModel, device);
    }
}

module.exports = {
    devices: devices,
    commonStates: commonStates,
    groupStates: groupStates,
    groupsState: states.groups,
    findModel: (model) => {
        const stripModel = (model) ? model.replace(/\0.*$/g, '').trim() : '';
        return byModel.get(stripModel);
    }
};
