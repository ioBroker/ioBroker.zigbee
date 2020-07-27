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
const gl_white_channel = [states.white_brightness, states.white_state, states.white_colortemp, states.separate_control];

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
        if (entity.mapped.model === 'GL-C-007' && hasEndpoints(entity.device, [11, 13, 15])) {
            return gl_lightStatesWithColor.concat(gl_white_channel);
        } else {
            return lightStatesWithColor;
        }
    },
};

const devices = [
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_switch'],
        icon: 'img/xiaomi_wireless_switch.png',
        states: [
            states.click, states.double_click, states.triple_click, states.quad_click,
            states.many_click, states.long_click, states.voltage, states.battery,
            states.long_press,
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_switch.aq2', 'lumi.remote.b1acn01'],
        icon: 'img/aqara_switch.png',
        states: [
            states.click, states.double_click, states.triple_click, states.quad_click,
            states.voltage, states.battery
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_switch.aq3', 'lumi.sensor_swit'],
        icon: 'img/aqara_switch.png',
        states: [
            states.click, states.double_click, states.voltage, states.battery,
            states.shake, states.hold
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_86sw1', 'lumi.remote.b186acn01'],
        icon: 'img/86sw1.png',
        states: [
            states.click, states.double_click, states.voltage, states.battery,
            states.hold
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_86sw2', 'lumi.sensor_86sw2.es1', 'lumi.remote.b286acn01'],
        icon: 'img/86sw2.png',
        states: [
            states.left_click, states.right_click, states.both_click,
            states.left_click_long, states.left_click_double, states.right_click_long, states.right_click_double,
            states.both_click_long, states.both_click_double, states.voltage, states.battery
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.remote.b286acn02'],
        icon: 'img/86sw2.png',
        states: [
            states.lumi_left_click, states.lumi_right_click, states.lumi_both_click,
            states.lumi_left_click_long, states.lumi_right_click_long, states.lumi_left_click_double, states.lumi_right_click_double,
            states.lumi_both_click_long, states.lumi_both_click_double, states.voltage, states.battery
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.ctrl_ln1.aq1', 'lumi.ctrl_ln1'],
        icon: 'img/ctrl_ln1.png',
        states: [
            states.click, states.state, states.operation_mode,
            states.load_power, states.plug_consumption, states.plug_temperature
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.ctrl_ln2.aq1', 'lumi.ctrl_ln2'],
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
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.ctrl_neutral1'],
        icon: 'img/ctrl_neutral1.png',
        states: [states.stateEp, states.operation_mode, states.click],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.ctrl_neutral2'],
        icon: 'img/ctrl_neutral2.png',
        states: [
            states.left_button, states.right_button, states.left_state, states.right_state,
            states.operation_mode_left, states.operation_mode_right, states.left_click, states.right_click
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sens', 'lumi.sensor_ht'],
        icon: 'img/sensor_ht.png',
        states: [states.temperature, states.humidity, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.weather'],
        icon: 'img/aqara_temperature_sensor.png',
        states: [states.temperature, states.humidity, states.pressure, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_motion'],
        icon: 'img/aqara_numan_body_sensor.png',
        states: [states.occupancy, states.no_motion, states.voltage, states.battery, states.occupancy_timeout],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_motion.aq2'],
        icon: 'img/aqara_numan_body_sensor.png',
        states: [states.occupancy, states.no_motion, states.illuminance, states.voltage, states.battery, states.occupancy_timeout],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_magnet'],
        icon: 'img/magnet.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_magnet.aq2'],
        icon: 'img/sensor_magnet_aq2.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_wleak.aq1'],
        icon: 'img/sensor_wleak_aq1.png',
        states: [states.water_detected, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_cube', 'lumi.sensor_cube.aqgl01'],
        icon: 'img/cube.png',
        states: [
            states.shake, states.wakeup, states.fall, states.tap, states.slide, states.flip180,
            states.flip90, states.rotate_left, states.rotate_right, states.voltage, states.battery,
            states.flip90_to, states.flip90_from, states.flip180_side, states.slide_side, states.tap_side,
            states.rotate_angle
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.plug.mmeu01'],
        icon: 'img/xiaomi_plug_eu.png',
        states: [
            states.state, states.load_power, states.plug_voltage, states.load_current, states.plug_consumption,
            states.plug_temperature],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.plug'],
        icon: 'img/plug.png',
        states: [states.state, states.load_power, states.plug_voltage, states.plug_consumption, states.plug_temperature],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.relay.c2acn01'],
        icon: 'img/lumi.relay.c2acn01.png',
        states: [states.state, states.load_power, states.plug_voltage, states.plug_consumption],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.ctrl_86plug.aq1', 'lumi.ctrl_86plug'],
        icon: 'img/86plug.png',
        states: [states.state, states.load_power, states.plug_voltage, states.plug_consumption, states.plug_temperature],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_smoke'],
        icon: 'img/smoke.png',
        states: [states.smoke_detected, states.voltage, states.battery],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.vibration.aq1'],
        icon: 'img/lumi_vibration.png',
        states: [
            states.voltage, states.battery, states.vibration_action, states.tilt_action,
            states.drop_action, states.tilt_angle, states.tilt_angle_x, states.tilt_angle_y,
            states.tilt_angle_z, states.tilt_angle_x_abs, states.tilt_angle_y_abs,
            states.sensitivity,
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.lock.v1'],
        icon: 'img/lumi_lock_v1.png',
        states: [states.inserted, states.forgotten, states.key_error],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.lock.aq1'],
        icon: 'img/lumi_lock_aq1.png',
        states: [
            states.lumi_lock_unlock_user_id,
            states.lumi_lock_failed_times,
            states.lumi_lock_action,
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.light.aqcn02'],
        icon: 'img/aqara_bulb.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sensor_natgas'],
        icon: 'img/smoke.png',
        states: [
            states.natgas_detected, states.natgas_density, states.natgas_sensitivity,
            states.voltage, states.battery
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.relay.c2acn01'],
        icon: 'img/lumi_relay.png',
        states: [states.channel1_state, states.channel2_state, states.load_power, states.temperature],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.curtain'],
        icon: 'img/aqara_curtain.png',
        states: [states.curtain_position, states.curtain_running, states.curtain_stop],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.remote.b286opcn01'],
        icon: 'img/lumi_remote_b286opcn01.png',
        states: [
            states.aqara_opple_1, states.aqara_opple_1_double, states.aqara_opple_1_triple, states.aqara_opple_1_hold,
            states.aqara_opple_2, states.aqara_opple_2_double, states.aqara_opple_2_triple, states.aqara_opple_2_hold,
            states.battery, states.aqara_opple_mode,
        ],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.remote.b486opcn01'],
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
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.remote.b686opcn01'],
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
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.plug.maeu01'],
        icon: 'img/lonsonho_plug.png',
        states: [states.state, states.load_power],
    },
    {
        vendor: 'Xiaomi',
        zigbeeModels: ['lumi.sen_ill.mgl01'],
        icon: 'img/lumi_sen_ill_mgl01.png',
        states: [states.battery, states.illuminance],
    },
    /*
    {
        zigbeeModel: ['lumi.sensor_natgas'],
        model: 'JTQJ-BF-01LM/BW',
        vendor: 'Xiaomi',
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
        vendor: 'OSRAM',
        zigbeeModels: ['PAR16 50 TW', 'MR16 TW OSRAM', 'PAR16 TW Z3'],
        icon: 'img/lightify-par16.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['PAR 16 50 RGBW - LIGHTIFY','PAR16 RGBW Z3'],
        icon: 'img/lightify-par16.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Classic B40 TW - LIGHTIFY'],
        icon: 'img/lightify-b40tw.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Plug 01'],
        icon: 'img/lightify-plug.png',
        states: [states.state],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Plug Z3'],
        icon: 'img/lightify-plug.png',
        states: [states.state],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['PAR16 DIM Z3'],
        icon: 'img/lightify-par16.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Classic A60 RGBW', 'CLA60 RGBW OSRAM', 'CLA60 RGBW Z3'],
        icon: 'img/osram_a60_rgbw.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['LIGHTIFY A19 Tunable White', 'Classic A60 TW', 'CLA60 TW OSRAM', 'TRADFRI bulb E14 WS opal 600lm'],
        icon: 'img/osram_lightify.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Ceiling TW OSRAM'],
        icon: 'img/osram_ceiling_tw.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Flex RGBW', 'LIGHTIFY Indoor Flex RGBW', 'LIGHTIFY Outdoor Flex RGBW'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Gardenpole RGBW-Lightify' ],
        icon: 'img/osram_gpole.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: [ 'Gardenpole Mini RGBW OSRAM' ],
        icon: 'img/osram_gpole_mini.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Gardenspot RGB'],
        icon: 'img/osram_g_spot.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Gardenspot W'],
        icon: 'img/osram_g_spot.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Classic A60 W clear - LIGHTIFY','A60 DIM Z3'],
        icon: 'img/osram_lightify.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Surface Light TW', 'A60 TW Z3'],
        icon: 'img/osram_surface_light_tw.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Surface Light W �C LIGHTIFY'],
        icon: 'img/osram_surface_light_tw.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['B40 DIM Z3'],
        icon: 'img/lightify-b40tw.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Outdoor Lantern W RGBW OSRAM'],
        icon: 'img/osram_4058075816718.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Lightify Switch Mini'],
        icon: 'img/lightify-switch.png',
        states: [states.switch_state, states.switch_circle, states.switch_hold, states.switch_release, states.battery],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Switch 4x EU-LIGHTIFY'],
        icon: 'img/ledvance_smartplus_switch.png',
        states: [states.left_top_click, states.right_top_click, states.left_bottom_click, states.right_bottom_click, states.left_top_hold, states.left_top_release, states.right_top_hold, states.right_top_release, states.left_bottom_hold, states.left_bottom_release, states.right_bottom_hold, states.right_bottom_release],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Motion Sensor-A'],
        icon: 'img/osram_sensorA.png',
        states: [states.occupancy, states.temperature, states.temp_calibration],
    },
    {
        vendor: 'OSRAM',
        zigbeeModels: ['Panel TW 595 UGR22'],
        icon: 'img/FLOALT.panel.WS.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },

    // Hue and Philips
    {
        vendor: 'Philips',
        zigbeeModels: ['ROM001'],
        icon: 'img/hue-smart-button.png',
        states: [
            states.button_action_on, states.button_action_off,
            states.button_action_press, states.button_action_hold, states.button_action_release,
            states.button_action_skip_back, states.button_action_skip_forward, states.battery,
        ],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LWO001'],
        icon: 'img/philips_hue_lwo001.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LWE002'],
        icon: 'img/philips_hue_e14_ambiance.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LWB010'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LWG001', 'LWG004'],
        icon: 'img/philips_hue_gu10_ambiance.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LLC010'],
        icon: 'img/philips_hue_iris.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LCC001'],
        icon: 'img/philips_hue_flourish.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LLC012', 'LLC011'],
        icon: 'img/hue_go.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LLC020'],
        icon: 'img/hue_go.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LCT026'],
        icon: 'img/hue_go.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LST001', 'LST002', 'LST004'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },   
    {
        vendor: 'Philips',
        zigbeeModels: ['LWB004'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LWB006'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LWA001'],
        icon: 'img/philips_hue_white.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTA001'],
        icon: 'img/philips_hue_e27_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LCT001', 'LCT007', 'LCT010', 'LCT012', 'LCT014', 'LCT015', 'LCT016', 'LCT021', 'LCA001', 'LCF002'],
        icon: 'img/philips_hue_color.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LCT002', 'LCT011'],
        icon: 'img/philips_hue_lct002.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LCF002'],
        icon: 'img/philips_hue_calla_out.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LCT003'],
        icon: 'img/philips_hue_gu10_color.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LCG002'],
        icon: 'img/philips_hue_gu10_color_bt.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTC001'],
        icon: 'img/philips_white_ambiance_being.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTC015', 'LTC011'],
        icon: 'img/philips_hue_ltc015.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['4080248P9'],
        icon: 'img/philips_hue_signe_floor.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['4080148P9'],
        icon: 'img/philips_hue_signe_table.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['5062231P7'],
        icon: 'img/philips_hue_argenta_2.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['5062431P7'],
        icon: 'img/philips_hue_argenta_4.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTC014'],
        icon: 'img/philips_hue_ltc014.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTC002'],
        icon: 'img/philips_hue_ltc002.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },    
    {
        vendor: 'Philips',
        zigbeeModels: ['LCT024'],
        icon: 'img/philips_hue_lightbar.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LPT001'],
        icon: 'img/philips_hue_bloom.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTW001','LTW004'],
        icon: 'img/philips_hue_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTW010', 'LTW015'],
        icon: 'img/philips_hue_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTW012'],
        icon: 'img/philips_hue_e14_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTW013'],
        icon: 'img/philips_hue_gu10_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTG002'],
        icon: 'img/philips_hue_gu10_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['RWL020', 'RWL021'],
        icon: 'img/philips_hue_rwl021.png',
        states: [
            states.rwl_state, states.rwl_up_button, states.rwl_down_button, states.rwl_down_hold, states.rwl_up_hold, states.battery,
            states.rwl_counter, states.rwl_duration, states.rwl_multiple_press_timeout
        ],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['SML001'],
        icon: 'img/sensor_philipshue.png',
        states: [
            states.battery, states.occupancy, states.occupancy_pirOToUDelay, states.temperature, states.illuminance, states.sml_sensitivity,
            states.temp_calibration, states.illuminance_calibration
        ],
        readAfterWriteStates: [states.occupancy_pirOToUDelay, states.sml_sensitivity],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['SML002'],
        icon: 'img/hue_outdoor_motion.png',
        states: [
            states.battery, states.occupancy, states.occupancy_pirOToUDelay, states.temperature, states.illuminance, states.sml_sensitivity,
            states.temp_calibration, states.illuminance_calibration
        ],
        readAfterWriteStates: [states.occupancy_pirOToUDelay, states.sml_sensitivity],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LOM001'],
        icon: 'img/philips_hue_lom001.png',
        states: [states.state],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LWL001'],
        icon: 'img/philips_lwl.png',
        states: [states.state],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LWV001', 'LWA004'],
        icon: 'img/philips_hue_lwv001.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['1742930P7'],
        icon: 'img/philips_hue_1742930P7.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['1746430P7'],
        icon: 'img/philips_hue_1746430P7.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTW017'],
        icon: 'img/LTW017.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        zigbeeModels: ['LTC021'],
        icon: 'img/philips_hue_ltc021.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },    
    {
        vendor: 'Philips',
        zigbeeModels: ['1746130P7'],
        icon: 'img/philips_hue_1746130P7.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    
    // SCHWAIGER
    {
        vendor: 'Schwaiger',
        zigbeeModels: ['ZBT-DIMLight-GLS0800'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },

    // IKEA
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI Driver 10W', 'TRADFRI transformer 10W', 'TRADFRI transformer 30W', 'TRADFRI Driver 30W'],
        icon: 'img/lightify-driver.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['LEPTITER Recessed spot light'],
        icon: 'img/ikea_recessed_spot_light.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: [
            'TRADFRI bulb E27 WS opal 980lm', 'TRADFRI bulb E26 WS opal 980lm', 'TRADFRI bulb E27 WS\uFFFDopal 980lm',
            'TRADFRI bulb E27 WW 806lm',      'TRADFRI bulb E27 WS clear 806lm','TRADFRI bulb E27 WS clear 950lm',
            'TRADFRI bulb E26 WS clear 950lm', 'TRADFRI bulb E27 WS opal 1000lm'
        ],
        icon: 'img/ikea_bulb_E27.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },

    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI bulb E27 WW clear 250lm'],
        icon: 'img/ikea_bulb_E27_clear.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: [
            'TRADFRI bulb E27 opal 1000lm', 'TRADFRI bulb E27 W opal 1000lm', 'TRADFRI bulb E26 W opal 1000lm',
            'TRADFRI bulb E26 opal 1000lm', 'TRADFRI bulb E27 WW 806lm'
        ],
        icon: 'img/ikea_bulb_E27.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI bulb GU10 WS 400lm'],
        icon: 'img/ikea_gu10.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI bulb GU10 W 400lm','TRADFRI bulb GU10 WW 400lm'],
        icon: 'img/ikea_gu10.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI bulb E14 WS opal 400lm', 'TRADFRI bulb E12 WS opal 400lm', 'TRADFRI bulb E14 WS 470lm'],
        icon: 'img/ikea_e14_bulb.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI bulb E27 CWS opal 600lm'],
        icon: 'img/ikea_bulb_E27.png',
        states: lightStatesWithColorNoTemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI bulb E14 CWS opal 600lm'],
        icon: 'img/ikea_e14_bulb.png',
        states: lightStatesWithColorNoTemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI bulb E14 W op/ch 400lm'],
        icon: 'img/ikea_e14_bulb2.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI transformer 10W', 'TRADFRI transformer 30W'],
        icon: 'img/ikea_transformer.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['FLOALT panel WS', 'FLOALT panel WS 30x30', 'FLOALT panel WS 60x60'],
        icon: 'img/FLOALT.panel.WS.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['FLOALT panel WS 30x90'],
        icon: 'img/FLOALT.panel.WS.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['GUNNARP panel round'],
        icon: 'img/gunnarp_panel.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI control outlet'],
        icon: 'img/ikea_control_outlet.png',
        states: [states.state],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI transformer 10W', 'TRADFRI transformer 30W'],
        icon: 'img/ikea_transformer.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI wireless dimmer'],
        icon: 'img/ikea_wireless_dimmer1.png',
        states: [states.brightness_readonly, states.battery],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI remote control'],
        icon: 'img/ikea_remote_control1.png',
        states: [
            states.E1524_toggle, states.E1524_hold,
            states.E1524_left_click, states.E1524_right_click, states.E1524_up_click, states.E1524_down_click,
            states.E1524_left_button, states.E1524_right_button, states.E1524_up_button, states.E1524_down_button,
        ],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI on/off switch'],
        icon: 'img/ikea_on-off-switch.png',
        states: [states.E1743_onoff, states.E1743_up_button, states.E1743_down_button, states.battery],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI signal repeater', 'TRADFRI Signal Repeater'],
        icon: 'img/ikea_repeater.png',
        states: [],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI motion sensor'],
        icon: 'img/ikea_motion_sensor.png',
        states: [states.occupancy, states.battery, states.no_motion]
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['FYRTUR block-out roller blind', 'KADRILJ roller blind'],
        states: [states.battery, states.blind_position, states.blind_stop],
        icon:  'img/Ikea_fyrtur.png',
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI Driver 10W', 'TRADFRI transformer 10W', 'TRADFRI transformer 30W', 'TRADFRI Driver 30W'],
        icon: 'img/ikea_transformer.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['TRADFRI open/close remote'],
        icon: 'img/ikea_open_close_switch.png',
        states: [states.cover_close, states.cover_open, states.battery],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['SURTE door WS 38x64'],
        icon: 'img/surte_door_light_panel.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        zigbeeModels: ['SYMFONISK Sound Controller'],
        icon: 'img/ikea_SYMFONISK_Sound_Controller.png',
        states: [states.button_action_skip_back, states.button_action_skip_forward,  states.action_play_pause,
            states.rotate_left, states.rotate_right, states.rotate_stop, states.battery],
    },
    // Hive
    {
        vendor: 'Hive',
        zigbeeModels: ['FWBulb01'],
        icon: 'img/hive.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Illuminize
    {
        vendor: 'Illuminize',
        zigbeeModels: ['511.201'],
        icon: 'img/illuminize_511_201.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Illuminize',
        zigbeeModels: ['511.202'],
        icon: 'img/illuminize_511_201.png',
        states: [states.state],
    },
    {
        vendor: 'Iluminize',
        zigbeeModels: ['RGBW-CCT'],
        icon: 'img/iluminize_511_040.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    // Innr
    {
        vendor: 'Innr',
        zigbeeModels: ['RB 185 C', 'RB 285 C', 'RB 250 C'],
        icon: 'img/innr.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        zigbeeModels: ['BY 185 C', 'BY 285 C'],
        icon: 'img/innr4.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        zigbeeModels: ['RS 230 C'],
        icon: 'img/innr_color_gu10.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        zigbeeModels: [
            'RB 165', 'RB 175 W', 'RS 125', 'RB 145', 'PL 110', 'ST 110', 'UC 110',
            'DL 110 N', 'DL 110 W', 'SL 110 N', 'SL 110 M', 'SL 110 W', 'RS 125', 'RB 245', 'RB 256', 'RB 265',
            'RF 265'
        ],
        icon: 'img/innr1.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        zigbeeModels: ['RB 178 T'],
        icon: 'img/innr1.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        zigbeeModels: ['RS 225'],
        icon: 'img/innr2.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        zigbeeModels: ['RS 128 T','RS 228 T'],
        icon: 'img/innr2.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        zigbeeModels: ['RB 248 T', 'RB 148 T'],
        icon: 'img/innr3.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        zigbeeModels: ['RB 245'],
        icon: 'img/innr3.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        zigbeeModels: ['RF 263'],
        icon: 'img/innr_filament1.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        zigbeeModels: ['SP 120', 'SP 220', 'SP 222', 'SP 224'],
        icon: 'img/innr_plug.png',
        states: [states.state,states.load_power],
    },
    {
        vendor: 'Innr',
        zigbeeModels: ['FL 130 C'],
        icon: 'img/innr_flex_FL130C.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    // Lingan
    {
        vendor: 'Lingan',
        zigbeeModels: ['SA-003-Zigbee'],
        icon: 'img/lamp_01.png',
        states: [states.state],
    },
    // Sylvania
    {
        vendor: 'Sylvania',
        zigbeeModels: ['LIGHTIFY RT Tunable White'],
        icon: 'img/sylvania_rt.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Sylvania',
        zigbeeModels: ['LIGHTIFY BR Tunable White'],
        icon: 'img/sylvania_br.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },

    // GE
    {
        vendor: 'GE',
        zigbeeModels: ['45852'],
        icon: 'img/ge_bulb.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // Sengled
    {
        vendor: 'Sengled',
        zigbeeModels: ['E11-G13'],
        icon: 'img/sengled.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // JIAWEN
    {
        vendor: 'JIAWEN',
        zigbeeModels: ['FB56-ZCW08KU1.1', 'FB56-ZCW08KU1.2'],
        icon: 'img/jiawen.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    // Belkin
    {
        vendor: 'Belkin',
        zigbeeModels: ['MZ100'],
        icon: 'img/wemo.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // EDP
    {
        vendor: 'EDP',
        zigbeeModels: ['ZB-SmartPlug-1.0.0'],
        icon: 'img/edp_redy_plug.png',
        // TODO: power measurement
        states: [states.state],
    },

    // Custom devices (DiY)
    {
        vendor: 'Custom devices (DiY)',
        zigbeeModels: ['lumi.router'],
        icon: 'img/lumi_router.png',
        states: [states.state],
    },
    {
        vendor: 'Custom devices (DiY)',
        zigbeeModels: ['DNCKAT_S001'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_1],
    },
    {
        vendor: 'Custom devices (DiY)',
        zigbeeModels: ['DNCKAT_S002'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_1, states.DNCKAT_state_2],
    },
    {
        vendor: 'Custom devices (DiY)',
        zigbeeModels: ['DNCKAT_S003'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_1, states.DNCKAT_state_2, states.DNCKAT_state_3],
    },
    {
        vendor: 'Custom devices (DiY)',
        zigbeeModels: ['DNCKAT_S004'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_41, states.DNCKAT_state_42, states.DNCKAT_state_43, states.DNCKAT_state_44],
    },
    {
        vendor: 'DIYRuZ',
        zigbeeModels: ['DIYRUZ_R4_5'],
        icon: 'img/DIYRuZ.png',
        states: [states.DNCKAT_state_41, states.DNCKAT_state_42, states.DNCKAT_state_43, states.DNCKAT_state_44, states.DIYRUZ_buzzer],
    },
    {
        vendor: 'Custom devices (DiY)',
        zigbeeModels: ['ZigUP'],
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
        vendor: 'DIYRuZ',
        zigbeeModels: ['DIYRuZ_KEYPAD20'],
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
        vendor: 'DIYRuZ',
        zigbeeModels: ['DIYRuZ_magnet'],
        icon: 'img/DIYRuZ.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        vendor: 'DIYRuZ',
        zigbeeModels: ['DIYRuZ_rspm'],
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
        vendor: 'HUEUC',
        zigbeeModels: ['HOMA2023'],
        icon: 'img/dimmablelight.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // Paulmann
    {
        vendor: 'Paulmann',
        zigbeeModels: ['Dimmablelight'],
        icon: 'img/dimmablelight.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Paulmann',
        zigbeeModels: ['Switch Controller'],
        icon: 'img/dimmablelight.png',
        states: [states.state],
    },
    {
        vendor: 'Paulmann',
        zigbeeModels: ['500.48'],
        icon: 'img/paulmann_rgbw_controller.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Paulmann',
        zigbeeModels: ['RGBW light', '500.49'],
        icon: 'img/paulmann_rgbw_controller.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Paulmann',
        zigbeeModels: ['CCT light'],
        icon: 'img/paulmann_spot.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Paulmann',
        zigbeeModels: ['371000001'],
        icon: 'img/paulmann_spot.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Paulmann',
        zigbeeModels: ['Switch Controller '],
        icon: 'img/dimmablelight.png',
        states: [states.state],
    },
    {
        vendor: 'Paulmann',
        zigbeeModels: ['500.45'],
        icon: 'img/dimmablelight.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },

    // Ksentry
    {
        vendor: 'Ksentry',
        zigbeeModels: ['Lamp_01'],
        icon: 'img/lamp_01.png',
        states: [states.state],
    },
    // Gledopto
    {
        vendor: 'Gledopto',
        zigbeeModels: ['GL-MC-001'],
        icon: 'img/gledopto_stripe.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        zigbeeModels: ['GL-B-008Z', 'GL-B-001Z', 'GL-B-007Z', 'GL-B-007ZS'],
        icon: 'img/gledopto_bulb.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        zigbeeModels: ['GLEDOPTO', 'GL-C-008', 'GL-C-007', 'GL-C-008S'],
        icon: 'img/gledopto.png',
        states: generator.gledopto,
        syncStates: [sync.brightness, sync.white_brightness],
    },
    {
        vendor: 'Gledopto',
        zigbeeModels: ['GL-C-006', 'GL-C-009'],
        icon: 'img/gledopto.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        zigbeeModels: ['GL-D-003Z', 'GL-D-003ZS', 'GL-D-004Z'],
        icon: 'img/gld003z.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        zigbeeModels: ['GL-G-001Z', 'GL-FL-004TZ'],
        icon: 'img/gledopto_spot.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        zigbeeModels: ['GL-S-007Z'],
        icon: 'img/gledopto_gu10.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        zigbeeModels: ['GL-W-001Z'],
        icon: 'img/nue_switch_single.png',
        states: [states.state],
    },
    // Dresden Elektronik
    {
        vendor: 'Dresden Elektronik',
        zigbeeModels: ['FLS-PP3','FLS-PP-IP'],
        icon: 'img/flspp3.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Dresden Elektronik',
        zigbeeModels: ['FLS-CT'],
        icon: 'img/flspp3.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    // ilux
    {
        vendor: 'ilux',
        zigbeeModels: ['LEColorLight'],
        icon: 'img/lecolorlight.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Heiman
    {
        vendor: 'Heiman',
        zigbeeModels: [
            'SMOK_V16',  'SMOK_YDLV10', 'SmokeSensor-EM', 'SmokeSensor-N', 'SmokeSensor-N-3.0', 'SmokeSensor-EF-3.0',
            'b5db59bfd81e4f1f95dc57fdbba17931', '98293058552c49f38ad0748541ee96ba',
        ],
        icon: 'img/hs1sa.png',
        states: [states.smoke_detected2, states.battery, states.heiman_batt_low],
    },
    {
        vendor: 'Heiman',
        zigbeeModels: ['COSensor-EM', 'COSensor-N'],
        icon: 'img/hs1sa.png',
        states: [states.co_detected, states.battery, states.heiman_batt_low],
    },
    {
        vendor: 'Heiman',
        zigbeeModels: ['RC-EM', 'COSensor-N'],
        icon: 'img/hs1sa.png',
        states: [
            states.heiman_smart_controller_emergency, states.heiman_smart_controller_armed,
            states.heiman_smart_controller_arm_mode, states.battery
        ],
    },
    {
        vendor: 'Heiman',
        zigbeeModels: ['SmartPlug'],
        icon: 'img/hs2sk.png',
        states: [states.state, states.load_power, states.load_current, states.plug_voltage],
    },
    {
        vendor: 'Heiman',
        zigbeeModels: ['WarningDevice', 'WarningDevice-EF-3.0', 'SRHMP-I1'],
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
        vendor: 'GS',
        zigbeeModels: ['SGMHM-I1'],
        icon: 'img/SGMHM-I1.png',
        states: [
            states.gas_detected,
        ],
    },
    {
        vendor: 'Smart Home Pty',
        zigbeeModels: ['FNB56-SKT1EHG1.2', 'FNB56-SKT1JXN1.0'],
        icon: 'img/smarthomepty_plug.png',
        states: [states.state],
    },
    {
        vendor: 'Smart Home Pty',
        zigbeeModels: ['FB56-ZCW11HG1.2', 'LXT56-LS27LX1.7'],
        icon: 'img/sylvania_rt.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Smart Home Pty',
        zigbeeModels: ['FB56-ZCW11HG1.4','ZB-CT01'],
        icon: 'img/smarthomepty_remote.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },    
    // Mueller Licht
    {
        vendor: 'Mueller Licht',
        zigbeeModels: ['ZBT-ExtendedColor', 'ZBT-DimmableLight'],
        icon: 'img/zbt_e27_rgbw.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Mueller Licht',
        zigbeeModels: ['ZBT-ColorTemperature'],
        icon: 'img/innr3.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Mueller Licht',
        zigbeeModels: ['ZBT-Remote-ALL-RGBW'],
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
        vendor: 'Mueller Licht',
        zigbeeModels: ['RGBW Lighting'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    {
        vendor: 'Mueller Licht',
        zigbeeModels: ['RGB-CCT'],
        icon: 'img/zbt_led_panel.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    {
        vendor: 'Mueller Licht',
        zigbeeModels: ['tint Smart Switch'],
        icon: 'img/zbt_smart_switch.png',
        states: [states.state],
    },

    // Ninja Blocks
    {
        vendor: 'Ninja Blocks Inc',
        zigbeeModels: ['Ninja Smart plug'],
        icon: 'img/ninja_plug.png',
        states: [states.state, states.load_power],
    },
    // Paul Neuhaus
    {
        vendor: 'Paul Neuhaus',
        zigbeeModels: ['NLG-CCT light'],
        icon: 'img/q-inigo_led_ceiling_light.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Paul Neuhaus',
        zigbeeModels: ['NLG-RGBW light'],
        icon: 'img/q-flag_led_panel.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    // Eurotronic
    {
        vendor: 'Eurotronic',
        zigbeeModels: ['SPZB0001'],
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
        vendor: 'Immax',
        zigbeeModels: ['IM-Z3.0-DIM'],
        icon: 'img/immax_e14.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Bitron
    {
        vendor: 'Bitron',
        zigbeeModels: ['902010/25'],
        icon: 'img/bitron_plug.png',
        states: [states.state, states.load_power],
    },
    {
        vendor: 'Bitron',
        zigbeeModels: ['902010/32'],
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
        vendor: 'Bitron',
        zigbeeModels: ['902010/21A'],
        icon: 'img/Bitron_AV201021A.png',
        states: [states.contact, states.opened, states.tamper, states.voltage, states.heiman_batt_low],
    },
    {
        vendor: 'Bitron',
        zigbeeModels: ['902010/24'],
        icon: 'img/bitron_902010_24.png',
        states: [states.heiman_batt_low, states.smoke_detected],
    },
    {
        vendor: 'Bitron',
        zigbeeModels: ['AV2010/22'],
        icon: 'img/bitron_motion.png',
        states: [states.occupancy, states.no_motion, states.voltage, states.battery, states.heiman_batt_low, states.occupancy_timeout],
    },    
    {
        vendor: 'Bitron',
        zigbeeModels: ['AV2010/22A'],
        icon: 'img/bitron_motion_a.png',
        states: [states.occupancy, states.no_motion, states.voltage, states.battery, states.heiman_batt_low, states.occupancy_timeout],
    },
    // Sunricher
    {
        vendor: 'Sunricher',
        zigbeeModels: ['ZG9101SAC-HP'],
        icon: 'img/sunricher_dimmer.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Nue / 3A
    {
        vendor: 'Nue / 3A',
        zigbeeModels: ['FNB56-ZSW01LX2.0'],
        icon: 'img/fnb56zsw01.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Nue / 3A',
        zigbeeModels: ['FNB56-ZCW25FB1.9'],
        icon: 'img/fnb56zsw01.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Nue / 3A',
        zigbeeModels: ['FNB56-ZSW01LX2.0', 'FNB56-ZSC01LX1.2'],
        icon: 'img/nue_hgzb-02a.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Nue / 3A',
        zigbeeModels: ['FB56+ZSW1GKJ2.5', 'LXN-1S27LX1.0', 'LXN56-0S27LX1.3'],
        icon: 'img/nue_switch_single.png',
        states: [states.state],
    },
    {
        vendor: 'Nue / 3A',
        zigbeeModels: ['FNB56-ZSW02LX2.0'],
        icon: 'img/tuya_switch_2.png',
        states: [states.top_state, states.bottom_state],
    },

    // eCozy
    {
        vendor: 'eCozy GmbH',
        zigbeeModels: ['Thermostat'],
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
        vendor: 'Shenzhen Homa',
        zigbeeModels: ['HOMA1008', 'HOMA1031'],
        icon: 'img/smart_led_driver.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Danalock
    {
        vendor: 'Danalock',
        zigbeeModels: ['V3-BTZB'],
        icon: 'img/danalock_v3.png',
        states: [states.lock_state, states.battery, states.heiman_batt_low],
    },
    // Trust
    {
        vendor: 'Trust',
        zigbeeModels: ['VMS_ADUROLIGHT'],
        icon: 'img/trust_zpir_8000.png',
        states: [states.occupancy, states.battery],
    },
    {
        vendor: 'Trust',
        zigbeeModels: ['CSW_ADUROLIGHT'],
        icon: 'img/sensor_magnet_aq2.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        vendor: 'Trust',
        zigbeeModels: ['ZLL-DimmableLigh'],
        icon: 'img/wemo.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Trust',
        zigbeeModels: ['ZLL-ColorTempera'],
        icon: 'img/trust_tune9.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Trust',
        zigbeeModels: ['ZLL-ExtendedColo'],
        icon: 'img/zbt_e27_rgbw.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Trust',
        zigbeeModels: ['WATER_TPV14'],
        icon: 'img/ZWLD-100.png',
        states: [states.water_detected, states.tamper, states.heiman_batt_low],
    },
    {
        vendor: 'Trust',
        zigbeeModels: ['\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000'+
                      '\u0000\u0000\u0000\u0000\u0000'],
        icon: 'img/gibtmichnochnicht.png',
        states: [
            states.battery, states.ZYCT202_down, states.ZYCT202_up,
            states.ZYCT202_off, states.ZYCT202_on, states.ZYCT202_stop
        ],
    },
    // Konke
    {
        vendor: 'Konke',
        zigbeeModels: ['3AFE170100510001'],
        icon: 'img/konke_kpkey.png',
        states: [states.click, states.double_click, states.long_click, states.battery, states.voltage],
    },
    {
        vendor: 'Konke',
        zigbeeModels: ['3AFE14010402000D', '3AFE27010402000D', '3AFE28010402000D'],
        icon: 'img/konke_kpbs.png',
        states: [states.battery, states.voltage, states.occupancy_event],
    },
    {
        vendor: 'Konke',
        zigbeeModels: ['3AFE140103020000', '3AFE220103020000'],
        icon: 'img/konke_kpft.png',
        states: [states.battery, states.voltage, states.temperature, states.humidity],
    },
    {
        vendor: 'Konke',
        zigbeeModels: ['3AFE130104020015', '3AFE270104020015'],
        icon: 'img/konke_kpdr.png',
        states: [states.battery, states.voltage, states.contact, states.opened],
    },
    // Tuya
    {
        vendor: 'Tuya',
        zigbeeModels: ['RH3052'],
        icon: 'img/tuya_RH3052.png',
        states: [states.temperature, states.temp_calibration, states.humidity, states.humidity_calibration, states.voltage, states.battery],
    },
    {
        vendor: 'Tuya',
        zigbeeModels: ['TS0201'],
        icon: 'img/tuya_TS0201.png',
        states: [states.temperature, states.humidity, states.voltage, states.battery],
    },
    {
        vendor: 'Tuya',
        zigbeeModels: ['TS0011', 'TS0001'],
        icon: 'img/tuya_switch_1.png',
        states: [states.state],
    },
    {
        vendor: 'Tuya',
        zigbeeModels: ['TS0012'],
        icon: 'img/tuya_switch_2.png',
        states: [states.left_state, states.right_state],
    },
    {
        vendor: 'Tuya',
        zigbeeModels: ['TS0013', 'TS0003'],
        icon: 'img/tuya_switch_3.png',
        states: [states.left_state, states.right_state, states.center_state],
    },
    {
        vendor: 'Tuya',
        zigbeeModels: ['gq8b1uv'],
        icon: 'img/gq8b1uv.png',
        states: [states.state, states.brightness],
    },
    {
        vendor: 'Tuya',
        zigbeeModels: ['RH3040'],
        icon: 'img/tuya_pir.png',
        states: [states.occupancy, states.voltage, states.battery],
    },
    {
        vendor: 'Tuya',
        zigbeeModels: ['TS0218'],
        icon: 'img/TS0218.png',
        states: [states.action_click],
    },
 
    {
        vendor: 'Tuya',
        zigbeeModels: ['TS0215'],
        icon: 'img/TS0215.png',
        states: [states.battery, states.emergency, states.disarm, states.arm_away, states.arm_stay],
    },
    {
        vendor: 'Tuya',
        zigbeeModels: ['owvfni3','owvfni3\u0000'],
        icon: 'img/owvfni3.png',
        states: [states.curtain_position, states.curtain_running, states.curtain_stop],
    },
    {
        vendor: 'Tuya',
        zigbeeModels: ['TS0121'],
        icon: 'img/lonsonho_plug.png',
        states: [states.state, states.plug_summdelivered, states.load_current, states.plug_voltage, states.load_power],
    },
    // Zemismart
    {
        vendor: 'Zemismart',
        zigbeeModels: ['TS0002'],
        icon: 'img/zemismart_sw2.png',
        states: [states.channel1_state, states.channel2_state],
    },
	
    // Lonsonho
    {
        vendor: 'Lonsonho',
        zigbeeModels: ['Plug_01'],
        icon: 'img/lonsonho_plug.png',
        states: [states.state],
    },
    // iHORN
    {
        vendor: 'iHORN',
        zigbeeModels: ['113D'],
        icon: 'img/lh_32Zb.png',
        states: [states.temperature, states.humidity, states.voltage, states.battery],
    },
    // ITEAD
    {
        vendor: 'ITEAD',
        zigbeeModels: ['BASICZBR3'],
        icon: 'img/basiczbr3.png',
        states: [states.state],
    },
    // TERNCY
    {
        vendor: 'TERNCY',
        zigbeeModels: ['TERNCY-PP01'],
        icon: 'img/terncy_pp01.png',
        states: [
            states.temperature, states.occupancy, states.occupancy_side, states.no_motion,
            states.illuminance, states.battery, states.click, states.double_click, states.triple_click,
        ],
    },
    {
        vendor: 'TERNCY',
        zigbeeModels: ['TERNCY-SD01'],
        icon: 'img/terncy_sd01.png',
        states: [
            states.battery, states.click, states.double_click, states.triple_click,
            states.rotate_direction, states.rotate_number,
        ],
    },
    // ORVIBO
    {
        vendor: 'ORVIBO',
        zigbeeModels: ['3c4e4fc81ed442efaf69353effcdfc5f'],
        icon: 'img/orvibo_cr11s8uz.png',
        states: [
            states.btn1_click, states.btn2_click, states.btn3_click, states.btn4_click,
            states.btn1_pressed, states.btn2_pressed, states.btn3_pressed, states.btn4_pressed,
        ],
    },
    // LIVOLO
    {
        vendor: 'LIVOLO',
        zigbeeModels: ['TI0001'],
        icon: 'img/livolo.png',
        states: [states.left_state, states.right_state],
    },
    {
        vendor: 'LIVOLO',
        zigbeeModels: ['TI0001-switch'],
        icon: 'img/livolo_switch_1g.png',
        states: [states.state],
    },
    {
        vendor: 'LIVOLO',
        zigbeeModels: ['TI0001-socket'],
        icon: 'img/livolo_socket.png',
        states: [states.state],
    },
    // HORNBACH
    {
        vendor: 'HORNBACH',
        zigbeeModels: ['VIYU-A60-806-RGBW-10011725'],
        icon: 'img/flair_viyu_e27_rgbw.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    // eWeLink
    {
        vendor: 'eWeLink',
        zigbeeModels: ['DS01'],
        icon: 'img/ewelink_DS01.png',
        states: [
            states.contact, states.opened, states.voltage, states.battery,
        ],
    },
    {
        vendor: 'eWeLink',
        zigbeeModels: ['WB01'],
        icon: 'img/ewelink_WB01.png',
        states: [
            states.action_single, states.action_double_click, states.action_long_click,
            states.voltage, states.battery,
        ],
    },
    {
        vendor: 'eWeLink',
        zigbeeModels: ['TH01'],
        icon: 'img/ewelink_TH01.png',
        states: [
            states.temperature, states.humidity, states.voltage, states.battery,
        ],
    },
    {
        vendor: 'eWeLink',
        zigbeeModels: ['MS01'],
        icon: 'img/ewelink_MS01.png',
        states: [
            states.occupancy, states.no_motion, states.voltage, states.battery,
        ],
    },
    //iCasa
    {
        vendor: 'iCasa',
        zigbeeModels: ['ICZB-IW11SW'],
        icon: 'img/sunricher_dimmer.png',
        states: [states.state],
    },
    {
        vendor: 'iCasa',
        zigbeeModels: ['ICZB-FC'],
        icon: 'img/philips_hue_lwv001.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'icasa',
        zigbeeModels: ['ICZB-KPD14S'],
        icon: 'img/iczb_kpd14s.png',
        states: [
            states.icasa_click, states.scenes_recall_click, states.icasa_action, states.icasa_brightness, states.voltage, states.battery,
        ],
    },
    {
        vendor: 'icasa',
        zigbeeModels: ['ICZB-KPD18S'],
        icon: 'img/iczb_kpd18s.png',
        states: [
            states.icasa_click, states.scenes_recall_click, states.icasa_action, states.icasa_brightness, states.voltage, states.battery,
        ],
    },
    // Oujiabao
    {
        vendor: 'Oujiabao',
        zigbeeModels: ['OJB-CR701-YZ'],
        icon: 'img/qujiabao_gas.png',
        states: [
            states.co_detected, states.gas_detected,
            states.heiman_batt_low, states.tamper,
        ],
    },
    // LifeControl
    {
        vendor: 'LifeControl',
        zigbeeModels: ['vivi ZLight'],
        icon: 'img/lifecontrol_lamp.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'LifeControl',
        zigbeeModels: ['Leak_Sensor'],
        icon: 'img/lifecontrol_water-sensor.png',
        states: [states.water_detected, states.battery],
    },
    {
        vendor: 'LifeControl',
        zigbeeModels: ['Door_Sensor'],
        icon: 'img/lifecontrol_door-alarm.png',
        states: [states.contact, states.opened, states.battery],
    },
    {
        vendor: 'LifeControl',
        zigbeeModels: ['VOC_Sensor'],
        icon: 'img/lifecontrol_air-sensor.png',
        states: [states.temperature, states.humidity, states.voc, states.eco2],
    },
    {
        vendor: 'LifeControl',
        zigbeeModels: ['Motion_Sensor'],
        icon: 'img/lifecontrol_motion-sensor.png',
        states: [states.battery, states.occupancy],
    },
    {
        vendor: 'LifeControl',
        zigbeeModels: ['RICI01'],
        icon: 'img/lifecontrol_plug.png',
        states: [states.state, states.load_power, states.load_current, states.plug_voltage],
    },
    // Moes
    {
        vendor: 'Moes',
        zigbeeModels: ['kud7u2l'],
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
        vendor: 'Essentials Smart Home Solutions',
        zigbeeModels: ['eaxp72v\u0000'],
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
        vendor: 'Immax',
        zigbeeModels: ['IM-Z3.0-RGBW'],
        icon: 'img/sengled.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    // Blitzwolf
    {
        vendor: 'Blitzwolf',
        zigbeeModels: ['RH3001'],
        icon: 'img/blitzwolf_magnet.png',
        states: [states.contact, states.opened, states.tamper, states.voltage, states.heiman_batt_low],
    },
    // Insta Gira  Jung
    {
        vendor: 'Gira, Jung',
        zigbeeModels: [' Remote'],
        icon: 'img/gira_4_buttons.png',
        states: [
            states.gira_pressed_up, states.gira_pressed_down_hold, states.gira_pressed_stop,
            states.gira_scene_click, states.gira_step_mode, states.gira_step_size,
        ],
    },
    // Busch Jaeger 
    {
        vendor: 'Busch Jaeger',
        zigbeeModels: ['RM01'],
        icon: 'img/gira_4_buttons.png',
        states: [states.state, states.brightness, states.rm01_row_2, states.rm01_row_3, states.rm01_row_4],
    },
    // Friends of Hue Smart Switch, Senic & Gira, Enocean based
    {
        vendor: 'GreenPower',
        zigbeeModels: ['GreenPower_2'],
        icon: 'img/ctrl_neutral2.png',
        states: [
            states.button_action_press, states.button_action_release, states.action,
        ],
    },
    
    // Smart9
    {
        vendor: 'Smart9',
        zigbeeModels: ['TS0041'],
        icon: 'img/smart9_s9tszgb-1.png',
        states: [
            states.action_single, states.action_double_click, states.hold,
        ],
    },
    
    {
        vendor: 'Smart9',
        zigbeeModels: ['TS0043'],
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
        vendor: 'SmartThings',
        zigbeeModels: ['motionv4','motionv5'],
        icon: 'img/smartthings_motion.png',
        states: [states.occupancy, states.no_motion, states.temperature, states.voltage, states.battery, states.occupancy_timeout],
    },    
        
    // Moes   
    {
        vendor: 'ZK-EU-2U',
        zigbeeModels: ['TS0112'],
        icon: 'img/moes_ts0112.png',
        states: [states.state],
    },
	
    // CR Smart Home	
    {
        vendor: 'ZK-EU-2U',
        zigbeeModels: ['TS0111'],
        icon: 'img/crts0111.png',
        states: [states.state],
    },	
        
];

const commonStates = [
    states.link_quality,
    states.available
];

const groupStates = [].concat(lightStatesWithColor);

const byZigbeeModel = new Map();
for (const device of devices) {
    for (const zigbeeModel of device.zigbeeModels) {
        const stripModel = zigbeeModel.replace(/\0.*$/g, '').trim();
        byZigbeeModel.set(stripModel, device);
    }
}

module.exports = {
    devices: devices,
    commonStates: commonStates,
    groupStates: groupStates,
    groupsState: states.groups,
    findModel: (model) => {
        const stripModel = (model) ? model.replace(/\0.*$/g, '').trim() : '';
        return byZigbeeModel.get(stripModel);
    }
};
