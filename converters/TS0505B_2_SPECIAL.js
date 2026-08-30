const exposes = require('../lib/exposes');
const fz = require('../converters/fromZigbee');
const tz = require('../converters/toZigbee');
const reporting = require('../lib/reporting');
const utils = require('../lib/utils');
const tuya = require('../lib/tuya');
const e = exposes.presets;
const constants = require('../lib/constants');
const libColor = require('../lib/color');


const tzLocal = {
    led_control: {
        key: ['brightness', 'color', 'color_temp'],
        options: [exposes.options.color_sync()],
        convertSet: async (entity, key, value, meta) => {
            if (
                key === 'brightness' &&
                meta.state.color_mode === constants.colorModeLookup[2] &&
                meta.message.color == null &&
                meta.message.color_temp == null
            ) {
                const level = Number(value);

                await entity.command(
                    'genLevelCtrl',
                    'moveToLevel',
                    {level, transtime: 0, optionsMask: 0, optionsOverride: 0},
                    utils.getOptions(meta.mapped, entity),
                );

                return {state: {brightness: level}};
            }

            if (key === 'brightness' && utils.isNumber(meta.message.color_temp)) {
                const level = Number(value);

                await entity.command('lightingColorCtrl', 'tuyaRgbMode', {enable: 0});
                await entity.command(
                    'lightingColorCtrl',
                    'moveToColorTemp',
                    {
                        colortemp: utils.mapNumberRange(meta.message.color_temp, 500, 154, 0, 254),
                        transtime: 0,
                        optionsMask: 0,
                        optionsOverride: 0,
                    },
                    utils.getOptions(meta.mapped, entity),
                );
                await entity.command(
                    'genLevelCtrl',
                    'moveToLevel',
                    {level, transtime: 0, optionsMask: 0, optionsOverride: 0},
                    utils.getOptions(meta.mapped, entity),
                );

                //globalStore.putValue(entity, 'brightness', level);

                const newState = {
                    brightness: level,
                    color_mode: constants.colorModeLookup[2],
                    color_temp: meta.message.color_temp,
                };

                return {state: libColor.syncColorState(newState, meta.state, entity, meta.options)};
            }

            if (key === 'color_temp') {
                utils.assertNumber(value, key);
                const level = meta.message.brightness ?? 100;

                await entity.command('lightingColorCtrl', 'tuyaRgbMode', {enable: 0});
                await entity.command(
                    'lightingColorCtrl',
                    'moveToColorTemp',
                    {colortemp: utils.mapNumberRange(value, 500, 154, 0, 254), transtime: 0, optionsMask: 0, optionsOverride: 0},
                    utils.getOptions(meta.mapped, entity),
                );
                await entity.command(
                    'genLevelCtrl',
                    'moveToLevel',
                    {level, transtime: 0, optionsMask: 0, optionsOverride: 0},
                    utils.getOptions(meta.mapped, entity),
                );

                const newState = {
                    brightness: level,
                    color_mode: constants.colorModeLookup[2],
                    color_temp: value,
                };

                return {state: libColor.syncColorState(newState, meta.state, entity, meta.options)};
            }

            let complexColor = libColor.Color.fromConverterArg(meta.state.color);
            const hsv = complexColor.hsv ?? complexColor.rgb?.toHSV() ?? complexColor.xy?.toHSV();

            const zclData = {
                brightness: hsv.value ?? (key==='brightness' ? value : meta.message.brightness),
                // @ts-expect-error ignore
                hue: utils.mapNumberRange(hsv.hue, 0, 360, 0, 254) || 100,
                // @ts-expect-error ignore
                saturation: utils.mapNumberRange(hsv.saturation, 0, 100, 0, 254) || 100,
                transtime: 0,
            };

            if (utils.isObject(value)) {

                complexColor = libColor.Color.fromConverterArg(value);
                const vhsv = complexColor.hsv ?? complexColor.rgb?.toHSV() ?? complexColor.xy?.toHSV();

                if (vhsv.hue != undefined) {
                    zclData.hue = utils.mapNumberRange(vhsv.hue, 0, 360, 0, 254);
                }
                if (vhsv.saturation != undefined) {
                    zclData.saturation = utils.mapNumberRange(value.saturation, 0, 100, 0, 254);
                }
                if (vhsv.value != undefined) {
                    zclData.brightness = vhsv.value;
                }

            } else if (typeof value === 'number') {
                zclData.brightness = value;
            }

            if (meta.message.color != null) {
                if (utils.isObject(meta.message.color)) {
                    if (meta.message.color.h) {
                        zclData.hue = utils.mapNumberRange(meta.message.color.h, 0, 360, 0, 254);
                    }
                    if (meta.message.color.s) {
                        zclData.saturation = utils.mapNumberRange(meta.message.color.s, 0, 100, 0, 254);
                    }
                    if (meta.message.color.b) {
                        zclData.brightness = Number(meta.message.color.b);
                    }
                    if (meta.message.color.brightness) {
                        zclData.brightness = Number(meta.message.color.brightness);
                    }
                }
            }

            await entity.command('lightingColorCtrl', 'tuyaRgbMode', {enable: 1});
            await entity.command(
                'lightingColorCtrl',
                'tuyaMoveToHueAndSaturationBrightness',
                zclData,
                utils.getOptions(meta.mapped, entity),
            );

            const newState = {
                brightness: zclData.brightness,
                color: {
                    h: utils.mapNumberRange(zclData.hue, 0, 254, 0, 360),
                    hue: utils.mapNumberRange(zclData.hue, 0, 254, 0, 360),
                    s: utils.mapNumberRange(zclData.saturation, 0, 254, 0, 100),
                    saturation: utils.mapNumberRange(zclData.saturation, 0, 254, 0, 100),
                },
                color_mode: constants.colorModeLookup[0],
            };
            if (key === 'brightness') return {state: {brightness:zclData.brightness}};
            return {state: libColor.syncColorState(newState, meta.state, entity, meta.options)};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read('lightingColorCtrl', [
                'currentHue',
                'currentSaturation',
                'tuyaBrightness',
                'tuyaRgbMode',
                'colorTemperature',
            ]);
        },
    },
}
module.exports = [
    {
        fingerprint: tuya.fingerprint('TS0505B', ['_TZ3210_iystcadi', '_TZ3210_it1u8ahz']),
        model: 'TS0505B_2_old',
        vendor: 'Tuya',
        description: 'Zigbee RGB+CCT light',
        whiteLabel: [
            tuya.whitelabel('Lidl', '14149505L/14149506L_2', 'Livarno Lux light bar RGB+CCT (black/white)', ['_TZ3210_iystcadi']),
            tuya.whitelabel('Tuya', 'TS0505B_2_2', 'Zigbee GU10/E14 5W smart bulb', ['_TZ3210_it1u8ahz']),
        ],
        toZigbee: [tz.on_off, tzLocal.led_control, tuya.tz.do_not_disturb],
        fromZigbee: [fz.on_off, fz.tuya_led_controller, fz.brightness],
        extend: [tuya.modernExtend.tuyaLight({colorTemp: {range: [153, 500]}, color: {modes: ['hs', 'xy'], applyRedFix: true}})],
        configure: (device, coordinatorEndpoint) => {
            device.getEndpoint(1).saveClusterAttributeKeyValue('lightingColorCtrl', {
                colorCapabilities: 29,
            });
        },
    },
]