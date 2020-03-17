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
    }
};

const lightStatesWithColortemp = [states.state, states.brightness, states.colortemp, states.transition_time];
const lightStatesWithColor = [states.state, states.brightness, states.colortemp, states.color, states.transition_time];
const lightStatesWithColorNoTemp = [states.state, states.brightness, states.color, states.transition_time];
const lightStates = [states.state, states.brightness, states.transition_time];


const devices = [
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_switch'],
        icon: 'img/xiaomi_wireless_switch.png',
        states: [
            states.click, states.double_click, states.triple_click, states.quad_click,
            states.many_click, states.long_click, states.voltage, states.battery,
            states.long_press,
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_switch.aq2', 'lumi.remote.b1acn01'],
        icon: 'img/aqara_switch.png',
        states: [
            states.click, states.double_click, states.triple_click, states.quad_click,
            states.voltage, states.battery
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_switch.aq3', 'lumi.sensor_swit'],
        icon: 'img/aqara_switch.png',
        states: [
            states.click, states.double_click, states.voltage, states.battery,
            states.shake, states.hold
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_86sw1', 'lumi.remote.b186acn01'],
        icon: 'img/86sw1.png',
        states: [
            states.click, states.double_click, states.voltage, states.battery,
            states.hold
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_86sw2', 'lumi.sensor_86sw2.es1', 'lumi.remote.b286acn01'],
        icon: 'img/86sw2.png',
        states: [
            states.left_click, states.right_click, states.both_click,
            states.left_click_long, states.left_click_double, states.right_click_long, states.right_click_double,
            states.both_click_long, states.both_click_double, states.voltage, states.battery
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.ctrl_ln1.aq1', 'lumi.ctrl_ln1'],
        icon: 'img/ctrl_ln1.png',
        states: [
            states.click, states.state, states.operation_mode,
            states.load_power, states.plug_consumption, states.plug_temperature
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.ctrl_ln2.aq1'],
        icon: 'img/ctrl_ln2.png',
        // TODO: power measurement
        states: [
            states.left_button, states.right_button, states.left_state, states.right_state,
            states.operation_mode_left, states.operation_mode_right, states.left_click, states.right_click
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.ctrl_neutral1'],
        icon: 'img/ctrl_neutral1.png',
        states: [states.stateEp, states.operation_mode, states.click],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.ctrl_neutral2'],
        icon: 'img/ctrl_neutral2.png',
        states: [
            states.left_button, states.right_button, states.left_state, states.right_state,
            states.operation_mode_left, states.operation_mode_right, states.left_click, states.right_click
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sens', 'lumi.sensor_ht'],
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
        models: ['lumi.sensor_cube', 'lumi.sensor_cube.aqgl01'],
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
        models: ['lumi.plug.mmeu01'],
        icon: 'img/xiaomi_plug_eu.png',
        states: [states.state, states.load_power, states.plug_voltage, states.plug_consumption, states.plug_temperature],
    },           
    {
        vendor: 'Xiaomi',
        models: ['lumi.plug'],
        icon: 'img/plug.png',
        states: [states.state, states.load_power, states.plug_voltage, states.plug_consumption, states.plug_temperature],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.relay.c2acn01'],
        icon: 'img/lumi.relay.c2acn01.png',
        states: [states.state, states.load_power, states.plug_voltage, states.plug_consumption],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.ctrl_86plug.aq1', 'lumi.ctrl_86plug'],
        icon: 'img/86plug.png',
        states: [states.state, states.load_power, states.plug_voltage, states.plug_consumption, states.plug_temperature],
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
        states: [
            states.voltage, states.battery, states.vibration_action, states.tilt_action,
            states.drop_action, states.tilt_angle, states.tilt_angle_x, states.tilt_angle_y,
            states.tilt_angle_z, states.tilt_angle_x_abs, states.tilt_angle_y_abs,
            states.sensitivity,
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.lock.v1'],
        icon: 'img/lumi_lock_v1.png',
        states: [states.inserted, states.forgotten, states.key_error],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.lock.aq1'],
        icon: 'img/lumi_lock_aq1.png',
        states: [
            states.lumi_lock_unlock_user_id,
            states.lumi_lock_failed_times,
            states.lumi_lock_action,
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.light.aqcn02'],
        icon: 'img/aqara_bulb.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sensor_natgas'],
        icon: 'img/smoke.png',
        states: [
            states.natgas_detected, states.natgas_density, states.natgas_sensitivity,
            states.voltage, states.battery
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.relay.c2acn01'],
        icon: 'img/lumi_relay.png',
        states: [states.channel1_state, states.channel2_state, states.load_power, states.temperature],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.curtain'],
        icon: 'img/aqara_curtain.png',
        states: [states.curtain_position, states.curtain_running, states.curtain_stop],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.remote.b286opcn01'],
        icon: 'img/lumi_remote_b286opcn01.png',
        states: [
            states.aqara_opple_1, states.aqara_opple_1_double, states.aqara_opple_1_triple, states.aqara_opple_1_hold,
            states.aqara_opple_2, states.aqara_opple_2_double, states.aqara_opple_2_triple, states.aqara_opple_2_hold,
            states.battery, states.aqara_opple_mode,
        ],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.remote.b486opcn01'],
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
        models: ['lumi.remote.b686opcn01'],
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
        models: ['lumi.plug.maeu01'],
        icon: 'img/lonsonho_plug.png',
        states: [states.state],
    },
    {
        vendor: 'Xiaomi',
        models: ['lumi.sen_ill.mgl01'],
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
        models: ['PAR16 50 TW', 'MR16 TW OSRAM'],
        icon: 'img/lightify-par16.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['PAR 16 50 RGBW - LIGHTIFY','PAR16 RGBW Z3'],
        icon: 'img/lightify-par16.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Classic B40 TW - LIGHTIFY'],
        icon: 'img/lightify-b40tw.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Plug 01'],
        icon: 'img/lightify-plug.png',
        states: [states.state],
    },
    {
        vendor: 'OSRAM',
        models: ['Plug Z3'],
        icon: 'img/lightify-plug.png',
        states: [states.state],
    },
    {
        vendor: 'OSRAM',
        models: ['PAR16 DIM Z3'],
        icon: 'img/lightify-par16.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Classic A60 RGBW', 'CLA60 RGBW OSRAM', 'CLA60 RGBW Z3'],
        icon: 'img/osram_a60_rgbw.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['LIGHTIFY A19 Tunable White', 'Classic A60 TW', 'CLA60 TW OSRAM', 'TRADFRI bulb E14 WS opal 600lm'],
        icon: 'img/osram_lightify.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Ceiling TW OSRAM'],
        icon: 'img/osram_ceiling_tw.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Flex RGBW', 'LIGHTIFY Indoor Flex RGBW', 'LIGHTIFY Outdoor Flex RGBW'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Gardenpole RGBW-Lightify' ],
        icon: 'img/osram_gpole.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: [ 'Gardenpole Mini RGBW OSRAM' ],
        icon: 'img/osram_gpole_mini.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Gardenspot RGB'],
        icon: 'img/osram_g_spot.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Gardenspot W'],
        icon: 'img/osram_g_spot.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Classic A60 W clear - LIGHTIFY','A60 DIM Z3'],
        icon: 'img/osram_lightify.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Surface Light TW'],
        icon: 'img/osram_surface_light_tw.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Surface Light W �C LIGHTIFY'],
        icon: 'img/osram_surface_light_tw.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['B40 DIM Z3'],
        icon: 'img/lightify-b40tw.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Outdoor Lantern W RGBW OSRAM'],
        icon: 'img/osram_4058075816718.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'OSRAM',
        models: ['Lightify Switch Mini'],
        icon: 'img/lightify-switch.png',
        states: [states.switch_state, states.switch_circle, states.switch_hold, states.battery],
    },

    {
        vendor: 'OSRAM',
        models: ['Motion Sensor-A'],
        icon: 'img/osram_sensorA.png',
        states: [states.occupancy, states.temperature, states.temp_calibration],
    },
    {
        vendor: 'OSRAM',
        models: ['Panel TW 595 UGR22'],
        icon: 'img/FLOALT.panel.WS.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },

    // Hue and Philips
    {
        vendor: 'Philips',
        models: ['ROM001'],
        icon: 'img/hue-smart-button.png',
        states: [
            states.button_action_on, states.button_action_off,
            states.button_action_skip_back, states.button_action_skip_forward, states.battery,
        ],
    },
    {
        vendor: 'Philips',
        models: ['LWO001'],
        icon: 'img/philips_hue_lwo001.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LWE002'],
        icon: 'img/philips_hue_e14_ambiance.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LWB010'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LWG001'],
        icon: 'img/philips_hue_gu10_ambiance.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LLC010'],
        icon: 'img/philips_hue_iris.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LLC012', 'LLC011'],
        icon: 'img/hue_go.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LLC020'],
        icon: 'img/hue_go.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LST001'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LST002'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LST004'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LWB004'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LWB006'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LWA001'],
        icon: 'img/philips_hue_white.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LCT001', 'LCT007', 'LCT010', 'LCT012', 'LCT014', 'LCT015', 'LCT016', 'LCT021', 'LCA001', 'LCF002'],
        icon: 'img/philips_hue_color.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LCF002'],
        icon: 'img/philips_hue_calla_out.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LCT003'],
        icon: 'img/philips_hue_gu10_color.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LCG002'],
        icon: 'img/philips_hue_gu10_color.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LTC001'],
        icon: 'img/philips_white_ambiance_being.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LTC015'],
        icon: 'img/LTC015.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LTC014'],
        icon: 'img/LTC014.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LCT024'],
        icon: 'img/philips_hue_lightbar.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LPT001'],
        icon: 'img/philips_hue_bloom.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LTW001','LTW004'],
        icon: 'img/philips_hue_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LTW010'],
        icon: 'img/philips_hue_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LTW012'],
        icon: 'img/philips_hue_e14_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LTW013'],
        icon: 'img/philips_hue_gu10_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LTG002'],
        icon: 'img/philips_hue_gu10_ambiance.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['RWL020', 'RWL021'],
        icon: 'img/philips_hue_rwl021.png',
        states: [
            states.rwl_state, states.rwl_up_button, states.rwl_down_button, states.rwl_down_hold, states.rwl_up_hold, states.battery,
            states.rwl_counter, states.rwl_duration, states.rwl_multiple_press_timeout
        ],
    },
    {
        vendor: 'Philips',
        models: ['SML001'],
        icon: 'img/sensor_philipshue.png',
        states: [
            states.battery, states.occupancy, states.occupancy_pirOToUDelay, states.temperature, states.illuminance, states.sml_sensitivity,
            states.temp_calibration, states.illuminance_calibration
        ],
        readAfterWriteStates: [states.occupancy_pirOToUDelay, states.sml_sensitivity],
    },
    {
        vendor: 'Philips',
        models: ['SML002'],
        icon: 'img/hue_outdoor_motion.png',
        states: [
            states.battery, states.occupancy, states.occupancy_pirOToUDelay, states.temperature, states.illuminance, states.sml_sensitivity,
            states.temp_calibration, states.illuminance_calibration
        ],
        readAfterWriteStates: [states.occupancy_pirOToUDelay, states.sml_sensitivity],
    },
    {
        vendor: 'Philips',
        models: ['LOM001'],
        icon: 'img/philips_hue_lom001.png',
        states: [states.state],
    },
    {
        vendor: 'Philips',
        models: ['LWL001'],
        icon: 'img/philips_lwl.png',
        states: [states.state],
    },
    {
        vendor: 'Philips',
        models: ['LWV001', 'LWA004'],
        icon: 'img/philips_hue_lwv001.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['1742930P7'],
        icon: 'img/philips_hue_1742930P7.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Philips',
        models: ['LTW017'],
        icon: 'img/LTW017.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    
    // SCHWAIGER   
    {
        vendor: 'Schwaiger',
        models: ['ZBT-DIMLight-GLS0800'],
        icon: 'img/philips_hue_white.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },

    // IKEA
    {
        vendor: 'IKEA',
        models: ['TRADFRI Driver 10W', 'TRADFRI transformer 10W', 'TRADFRI transformer 30W', 'TRADFRI Driver 30W'],
        icon: 'img/lightify-driver.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'IKEA',
        models: ['LEPTITER Recessed spot light'],
        icon: 'img/ikea_recessed_spot_light.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: [
            'TRADFRI bulb E27 WS opal 980lm', 'TRADFRI bulb E26 WS opal 980lm', 'TRADFRI bulb E27 WS\uFFFDopal 980lm',
            'TRADFRI bulb E27 WW 806lm',      'TRADFRI bulb E27 WS clear 806lm','TRADFRI bulb E27 WS clear 950lm',
            'TRADFRI bulb E26 WS clear 950lm'
        ],
        icon: 'img/ikea_bulb_E27.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },

    {
        vendor: 'IKEA',
        models: ['TRADFRI bulb E27 WW clear 250lm'],
        icon: 'img/ikea_bulb_E27_clear.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: [
            'TRADFRI bulb E27 opal 1000lm', 'TRADFRI bulb E27 W opal 1000lm', 'TRADFRI bulb E26 W opal 1000lm',
            'TRADFRI bulb E26 opal 1000lm', 'TRADFRI bulb E27 WW 806lm',      'TRADFRI bulb E27 WS opal 1000lm'
        ],
        icon: 'img/ikea_bulb_E27.png',
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
        models: ['TRADFRI bulb GU10 W 400lm','TRADFRI bulb GU10 WW 400lm'],
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
        icon: 'img/ikea_bulb_E27.png',
        states: lightStatesWithColorNoTemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI bulb E14 CWS opal 600lm'],
        icon: 'img/ikea_e14_bulb.png',
        states: lightStatesWithColorNoTemp,
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
        models: ['TRADFRI control outlet'],
        icon: 'img/ikea_control_outlet.png',
        states: [states.state],
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
        models: ['TRADFRI wireless dimmer'],
        icon: 'img/ikea_wireless_dimmer1.png',
        states: [states.brightness_readonly, states.battery],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI remote control'],
        icon: 'img/ikea_remote_control1.png',
        states: [
            states.E1524_toggle, states.E1524_hold,
            states.E1524_left_click, states.E1524_right_click, states.E1524_up_click, states.E1524_down_click,
            states.E1524_left_button, states.E1524_right_button, states.E1524_up_button, states.E1524_down_button,
        ],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI on/off switch'],
        icon: 'img/ikea_on-off-switch.png',
        states: [states.E1743_onoff, states.E1743_up_button, states.E1743_down_button, states.battery],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI signal repeater', 'TRADFRI Signal Repeater'],
        icon: 'img/ikea_repeater.png',
        states: [],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI motion sensor'],
        icon: 'img/ikea_motion_sensor.png',
        states: [states.occupancy, states.battery, states.no_motion]
    },
    {
      vendor: 'IKEA',
      models: ['FYRTUR block-out roller blind', 'KADRILJ roller blind'],
      states: [states.battery, states.blind_position, states.blind_stop],
      icon:  'img/Ikea_fyrtur.png',
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI Driver 10W', 'TRADFRI transformer 10W', 'TRADFRI transformer 30W', 'TRADFRI Driver 30W'],
        icon: 'img/ikea_transformer.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'IKEA',
        models: ['TRADFRI open/close remote'],
        icon: 'img/ikea_open_close_switch.png',
        states: [states.cover_close, states.cover_open, states.battery],
    },
    {
        vendor: 'IKEA',
        models: ['SURTE door WS 38x64'],
        icon: 'img/surte_door_light_panel.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },

    // Hive
    {
        vendor: 'Hive',
        models: ['FWBulb01'],
        icon: 'img/hive.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Illuminize
    {
        vendor: 'Illuminize',
        models: ['511.201'],
        icon: 'img/illuminize_511_201.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Illuminize',
        models: ['511.202'],
        icon: 'img/illuminize_511_201.png',
        states: [states.state],
    },

    // Innr
    {
        vendor: 'Innr',
        models: ['RB 185 C', 'RB 285 C', 'RB 250 C'],
        icon: 'img/innr.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: ['BY 185 C', 'BY 285 C'],
        icon: 'img/innr4.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: ['RS 230 C'],
        icon: 'img/innr_color_gu10.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: [
            'RB 165', 'RB 175 W', 'RS 125', 'RB 178 T', 'RB 145', 'PL 110', 'ST 110', 'UC 110',
            'DL 110 N', 'DL 110 W', 'SL 110 N', 'SL 110 M', 'SL 110 W', 'RS 125', 'RB 245', 'RB 256', 'RB 265',
            'RF 265'
        ],
        icon: 'img/innr1.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: ['RS 225'],
        icon: 'img/innr2.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: ['RS 128 T','RS 228 T'],
        icon: 'img/innr2.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: ['RS 248 T', 'RB 148 T'],
        icon: 'img/innr3.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: ['RB 245'],
        icon: 'img/innr3.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: ['RF 263'],
        icon: 'img/innr_filament1.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Innr',
        models: ['SP 120'],
        icon: 'img/innr_plug.png',
        states: [states.state,states.load_power],
    },
    // Lingan
    {
        vendor: 'Lingan',
        models: ['SA-003-Zigbee'],
        icon: 'img/lamp_01.png',
        states: [states.state],
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
        models: ['FB56-ZCW08KU1.1', 'FB56-ZCW08KU1.2'],
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
        states: [states.state],
    },
    {
        vendor: 'Custom devices (DiY)',
        models: ['DNCKAT_S001'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_1],
    },
    {
        vendor: 'Custom devices (DiY)',
        models: ['DNCKAT_S002'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_1, states.DNCKAT_state_2],
    },
    {
        vendor: 'Custom devices (DiY)',
        models: ['DNCKAT_S003'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_1, states.DNCKAT_state_2, states.DNCKAT_state_3],
    },
    {
        vendor: 'Custom devices (DiY)',
        models: ['DNCKAT_S004'],
        icon: 'img/diy.png',
        states: [states.DNCKAT_state_41, states.DNCKAT_state_42, states.DNCKAT_state_43, states.DNCKAT_state_44],
    },
    {
        vendor: 'DIYRuZ',
        models: ['DIYRUZ_R4_5'],
        icon: 'img/DIYRuZ.png',
        states: [states.DNCKAT_state_41, states.DNCKAT_state_42, states.DNCKAT_state_43, states.DNCKAT_state_44, states.DIYRUZ_buzzer],
    },
    {
        vendor: 'Custom devices (DiY)',
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
        vendor: 'DIYRuZ',
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
        vendor: 'DIYRuZ',
        models: ['DIYRuZ_magnet'],
        icon: 'img/DIYRuZ.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        vendor: 'DIYRuZ',
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
        vendor: 'HUEUC',
        models: ['HOMA2023'],
        icon: 'img/dimmablelight.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },

    // Paulmann
    {
        vendor: 'Paulmann',
        models: ['Dimmablelight'],
        icon: 'img/dimmablelight.png',
        states: lightStates,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Paulmann',
        models: ['Switch Controller'],
        icon: 'img/dimmablelight.png',
        states: [states.state],
    },
    {
        vendor: 'Paulmann',
        models: ['RGBW light', '500.49'],
        icon: 'img/paulmann_rgbw_controller.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Paulmann',
        models: ['CCT light'],
        icon: 'img/paulmann_spot.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Paulmann',
        models: ['371000001'],
        icon: 'img/paulmann_spot.png',
        states: lightStatesWithColortemp,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'Paulmann',
        models: ['Switch Controller '],
        icon: 'img/dimmablelight.png',
        states: [states.state],
    },


    // Ksentry
    {
        vendor: 'Ksentry',
        models: ['Lamp_01'],
        icon: 'img/lamp_01.png',
        states: [states.state],
    },
    // Gledopto
    {
        vendor: 'Gledopto',
        models: ['GL-MC-001'],
        icon: 'img/gledopto_stripe.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        models: ['GL-B-008Z', 'GL-B-001Z', 'GL-B-007Z', 'GL-B-007ZS'],
        icon: 'img/gledopto_bulb.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        models: ['GLEDOPTO', 'GL-C-008', 'GL-C-007', 'GL-C-008S'],
        icon: 'img/gledopto.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        models: ['GL-C-006', 'GL-C-009'],
        icon: 'img/gledopto.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        models: ['GL-D-003Z', 'GL-D-003ZS'],
        icon: 'img/gld003z.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        models: ['GL-G-001Z', 'GL-FL-004TZ'],
        icon: 'img/gledopto_spot.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Gledopto',
        models: ['GL-S-007Z'],
        icon: 'img/gledopto_gu10.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    // Dresden Elektronik
    {
        vendor: 'Dresden Elektronik',
        models: ['FLS-PP3'],
        icon: 'img/flspp3.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Dresden Elektronik',
        models: ['FLS-CT'],
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
        models: [
            'SMOK_V16',  'SMOK_YDLV10', 'SmokeSensor-EM', 'SmokeSensor-N', 'SmokeSensor-N-3.0',
            'b5db59bfd81e4f1f95dc57fdbba17931', '98293058552c49f38ad0748541ee96ba',
        ],
        icon: 'img/hs1sa.png',
        states: [states.smoke_detected2, states.battery, states.heiman_batt_low],
    },
    {
        vendor: 'Heiman',
        models: ['COSensor-EM', 'COSensor-N'],
        icon: 'img/hs1sa.png',
        states: [states.co_detected, states.battery, states.heiman_batt_low],
    },
    {
        vendor: 'Heiman',
        models: ['RC-EM', 'COSensor-N'],
        icon: 'img/hs1sa.png',
        states: [states.heiman_smart_controller_emergency,states.heiman_smart_controller_armed, states.battery],
    },
    {
        vendor: 'Heiman',
        models: ['SmartPlug'],
        icon: 'img/hs2sk.png',
        states: [states.state, states.load_power, states.load_current, states.plug_voltage],
    },
    {
        vendor: 'Heiman',
        models: ['WarningDevice', 'WarningDevice-EF-3.0'],
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
        vendor: 'Smart Home Pty',
        models: ['FNB56-SKT1EHG1.2', 'FNB56-SKT1JXN1.0'],
        icon: 'img/smarthomepty_plug.png',
        states: [states.state],
    },
    {
        vendor: 'Smart Home Pty',
        models: ['FB56-ZCW11HG1.2', 'FB56-ZCW11HG1.4', 'LXT56-LS27LX1.7'],
        icon: 'img/sylvania_rt.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    // Müller Licht
    {
        vendor: 'Mueller Licht',
        models: ['ZBT-ExtendedColor', 'ZBT-DimmableLight'],
        icon: 'img/zbt_e27_rgbw.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Mueller Licht',
        models: ['ZBT-ColorTemperature'],
        icon: 'img/zbt_e27.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Mueller Licht',
        models: ['ZBT-Remote-ALL-RGBW'],
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
        models: ['RGBW Lighting'],
        icon: 'img/philips_hue_lst002.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    {
        vendor: 'Mueller Licht',
        models: ['RGB-CCT'],
        icon: 'img/zbt_led_panel.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },

    {
        vendor: 'Mueller Licht',
        models: ['tint Smart Switch'],
        icon: 'img/zbt_smart_switch.png',
        states: [states.state],
    },

    // Ninja Blocks
    {
        vendor: 'Ninja Blocks Inc',
        models: ['Ninja Smart plug'],
        icon: 'img/ninja_plug.png',
        states: [states.state, states.load_power],
    },
    // Paul Neuhaus
    {
        vendor: 'Paul Neuhaus',
        models: ['NLG-CCT light'],
        icon: 'img/q-inigo_led_ceiling_light.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Paul Neuhaus',
        models: ['NLG-RGBW light'],
        icon: 'img/q-flag_led_panel.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    // Eurotronic
    {
        vendor: 'Eurotronic',
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
        vendor: 'Immax',
        models: ['IM-Z3.0-DIM'],
        icon: 'img/immax_e14.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Bitron
    {
        vendor: 'Bitron',
        models: ['902010/25'],
        icon: 'img/bitron_plug.png',
        states: [states.state, states.load_power],
    },
    {
        vendor: 'Bitron',
        models: ['902010/32'],
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
        models: ['902010/21A'],
        icon: 'img/Bitron_AV201021A.png',
        states: [states.contact, states.opened, states.tamper, states.voltage, states.heiman_batt_low],
    },
    // Sunricher
    {
        vendor: 'Sunricher',
        models: ['ZG9101SAC-HP'],
        icon: 'img/sunricher_dimmer.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Nue / 3A
    {
        vendor: 'Nue / 3A',
        models: ['FNB56-ZSW01LX2.0'],
        icon: 'img/fnb56zsw01.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Nue / 3A',
        models: ['FNB56-ZCW25FB1.9'],
        icon: 'img/fnb56zsw01.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
         vendor: 'Nue / 3A',
         models: ['FNB56-ZSW01LX2.0', 'FNB56-ZSC01LX1.2'],
         icon: 'img/nue_hgzb-02a.png',
         states: lightStates,
         linkedStates: [comb.brightnessAndState],
    },
    // eCozy
    {
      vendor: 'eCozy GmbH',
      models: ['Thermostat'],
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
        states.hvacThermostat_control_sequence_of_operation,
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
        models: ['HOMA1008', 'HOMA1031'],
        icon: 'img/smart_led_driver.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    // Danalock
    {
        vendor: 'Danalock',
        models: ['V3-BTZB'],
        icon: 'img/danalock_v3.png',
        states: [states.lock_state, states.battery, states.heiman_batt_low],
    },
    // Trust
    {
        vendor: 'Trust',
        models: ['VMS_ADUROLIGHT'],
        icon: 'img/trust_zpir_8000.png',
        states: [states.occupancy, states.battery],
    },
    {
        vendor: 'Trust',
        models: ['CSW_ADUROLIGHT'],
        icon: 'img/sensor_magnet_aq2.png',
        states: [states.contact, states.opened, states.voltage, states.battery],
    },
    {
        vendor: 'Trust',
        models: ['ZLL-DimmableLigh'],
        icon: 'img/wemo.png',
        states: lightStates,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Trust',
        models: ['ZLL-ColorTempera'],
        icon: 'img/trust_tune9.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Trust',
        models: ['ZLL-ExtendedColo'],
        icon: 'img/zbt_e27_rgbw.png',
        states: lightStatesWithColor,
        linkedStates: [comb.brightnessAndState],
    },
    {
        vendor: 'Trust',
        models: ['WATER_TPV14'],
        icon: 'img/ZWLD-100.png',
        states: [states.water_detected, states.tamper, states.heiman_batt_low],
    },
    {
        vendor: 'Trust',
        models: ['\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000'+
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
        models: ['3AFE170100510001'],
        icon: 'img/konke_kpkey.png',
        states: [states.click, states.double_click, states.long_click, states.battery, states.voltage],
    },
    {
        vendor: 'Konke',
        models: ['3AFE14010402000D', '3AFE27010402000D', '3AFE28010402000D'],
        icon: 'img/konke_kpbs.png',
        states: [states.battery, states.voltage, states.occupancy_event],
    },
    {
        vendor: 'Konke',
        models: ['3AFE140103020000', '3AFE220103020000'],
        icon: 'img/konke_kpft.png',
        states: [states.battery, states.voltage, states.temperature, states.humidity],
    },
    {
        vendor: 'Konke',
        models: ['3AFE130104020015', '3AFE270104020015'],
        icon: 'img/konke_kpdr.png',
        states: [states.battery, states.voltage, states.contact, states.opened],
    },
    // Tuya
    {
        vendor: 'Tuya',
        models: ['RH3052'],
        icon: 'img/tuya_RH3052.png',
        states: [states.temperature, states.humidity, states.voltage, states.battery],
    },
    {
        vendor: 'Tuya',
        models: ['TS0201'],
        icon: 'img/tuya_TS0201.png',
        states: [states.temperature, states.humidity, states.voltage, states.battery],
    },
    {
        vendor: 'Tuya',
        models: ['TS0011'],
        icon: 'img/tuya_switch_1.png',
        states: [states.state],
    },
    {
        vendor: 'Tuya',
        models: ['TS0012'],
        icon: 'img/tuya_switch_2.png',
        states: [states.left_state, states.right_state],
    },
    {
        vendor: 'Tuya',
        models: ['TS0013'],
        icon: 'img/tuya_switch_3.png',
        states: [states.left_state, states.right_state, states.center_state],
    },
    {
        vendor: 'Tuya',
        models: ['gq8b1uv'],
        icon: 'img/gq8b1uv.png',
        states: [states.state, states.brightness],
    },
    {
        vendor: 'Tuya',
        models: ['RH3040'],
        icon: 'img/tuya_pir.png',
        states: [states.occupancy, states.voltage, states.battery],
    },
    {
        vendor: 'Tuya',
        models: ['TS0218'],
        icon: 'img/TS0218.png',
        states: [states.action_click],
    },
    // Zemismart
    {
        vendor: 'Zemismart',
        models: ['TS0002'],
        icon: 'img/zemismart_sw2.png',
        states: [states.channel1_state, states.channel2_state],
    },
    // Lonsonho
    {
        vendor: 'Lonsonho',
        models: ['Plug_01'],
        icon: 'img/lonsonho_plug.png',
        states: [states.state],
    },
    // iHORN
    {
        vendor: 'iHORN',
        models: ['113D'],
        icon: 'img/lh_32Zb.png',
        states: [states.temperature, states.humidity, states.voltage, states.battery],
    },
    // ITEAD
    {
        vendor: 'ITEAD',
        models: ['BASICZBR3'],
        icon: 'img/basiczbr3.png',
        states: [states.state],
    },
    // TERNCY
    {
        vendor: 'TERNCY',
        models: ['TERNCY-PP01'],
        icon: 'img/terncy_pp01.png',
        states: [
            states.temperature, states.occupancy, states.occupancy_side, states.no_motion,
            states.illuminance, states.battery, states.click, states.double_click, states.triple_click,
        ],
    },
    {
        vendor: 'TERNCY',
        models: ['TERNCY-SD01'],
        icon: 'img/terncy_sd01.png',
        states: [
            states.battery, states.click, states.double_click, states.triple_click,
            states.rotate_direction, states.rotate_number,
        ],
    },
    // ORVIBO
    {
        vendor: 'ORVIBO',
        models: ['3c4e4fc81ed442efaf69353effcdfc5f'],
        icon: 'img/orvibo_cr11s8uz.png',
        states: [
            states.btn1_click, states.btn2_click, states.btn3_click, states.btn4_click,
            states.btn1_pressed, states.btn2_pressed, states.btn3_pressed, states.btn4_pressed,
        ],
    },
    // LIVOLO
    {
        vendor: 'LIVOLO',
        models: ['TI0001'],
        icon: 'img/livolo.png',
        states: [states.left_state, states.right_state],
    },
    // HORNBACH
    {
        vendor: 'HORNBACH',
        models: ['VIYU-A60-806-RGBW-10011725'],
        icon: 'img/flair_viyu_e27_rgbw.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    // eWeLink
    {
        vendor: 'eWeLink',
        models: ['DS01'],
        icon: 'img/ewelink_DS01.png',
        states: [
            states.contact, states.opened, states.voltage, states.battery,
        ],
    },
    {
        vendor: 'eWeLink',
        models: ['WB01'],
        icon: 'img/ewelink_WB01.png',
        states: [
            states.action_single, states.action_double_click, states.action_long_click, 
            states.voltage, states.battery,
        ],
    },
    {
        vendor: 'eWeLink',
        models: ['TH01'],
        icon: 'img/ewelink_TH01.png',
        states: [
            states.temperature, states.humidity, states.voltage, states.battery,
        ],
    },
    {
        vendor: 'eWeLink',
        models: ['MS01'],
        icon: 'img/ewelink_MS01.png',
        states: [
            states.occupancy, states.no_motion, states.voltage, states.battery,
        ],
    },
    //iCasa
    {
        vendor: 'iCasa',
        models: ['ICZB-FC'],
        icon: 'img/philips_hue_lwv001.png',
        states: lightStatesWithColortemp,
        linkedStates: [comb.brightnessAndState],
    },
    // Oujiabao
    {
        vendor: 'Oujiabao',
        models: ['OJB-CR701-YZ'],
        icon: 'img/qujiabao_gas.png',
        states: [
        	states.co_detected, states.gas_detected,
        	states.heiman_batt_low, states.tamper, 
        ],
    },
    // LifeControl
    {
        vendor: 'LifeControl',
        models: ['vivi ZLight'],
        icon: 'img/lifecontrol_lamp.png',
        states: lightStatesWithColor,
        syncStates: [sync.brightness],
    },
    {
        vendor: 'LifeControl',
        models: ['Leak_Sensor'],
        icon: 'img/lifecontrol_water-sensor.png',
        states: [states.water_detected, states.battery],
    },
    {
        vendor: 'LifeControl',
        models: ['Door_Sensor'],
        icon: 'img/lifecontrol_door-alarm.png',
        states: [states.contact, states.opened, states.battery],
    },
    // {
    //     vendor: 'LifeControl',
    //     models: [''],
    //     icon: 'img/lifecontrol_air-sensor.png',
    //     states: [states.battery],
    // },
    // {
    //     vendor: 'LifeControl',
    //     models: [''],
    //     icon: 'img/lifecontrol_motion-sensor.png',
    //     states: [states.battery],
    // },
    // {
    //     vendor: 'LifeControl',
    //     models: [''],
    //     icon: 'img/lifecontrol_plug.png',
    //     states: [],
    // },
];

const commonStates = [
    states.link_quality,
    states.available
];

const groupStates = [].concat(lightStatesWithColor);

const byZigbeeModel = new Map();
for (const device of devices) {
    for (const zigbeeModel of device.models) {
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
