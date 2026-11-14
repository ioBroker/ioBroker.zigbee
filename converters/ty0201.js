import * as fz from "../converters/fromZigbee";
import * as exposes from "../lib/exposes";
import * as tuya from "../lib/tuya";

//const NS = "zhc:tuya";

const e = exposes.presets;
const fzLocal = {
    TS0201_battery: {
        cluster: "genPowerCfg",
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            // https://github.com/Koenkk/zigbee2mqtt/issues/11470
            // https://github.com/Koenkk/zigbee-herdsman-converters/pull/8246
            if (
                msg.data.batteryPercentageRemaining === 200 &&
                msg.data.batteryVoltage < 30 &&
                !["_TZ3000_lqmvrwa2"].includes(meta.device.manufacturerName)
            )
                return;
            return fz.battery.convert(model, msg, publish, options, meta);
        },
    },
}

const converter = [
        {
        fingerprint: tuya.fingerprint("TY0201", [
            "_TZ3000_bjawzodf",
        ]),
        model: "WSD500A_2",
        vendor: "Telink Semiconductor",
        description: "Temperature & humidity sensor",
        fromZigbee: [fzLocal.TS0201_battery, fz.temperature, fz.humidity],
        toZigbee: [],
        exposes: [e.battery(), e.temperature(), e.humidity(), e.battery_voltage()],
        configure: tuya.configureMagicPacket,
        meta: {
            battery: {
                // These sensors do send a Battery Percentage Remaining (0x0021)
                // value, but is usually incorrect. For example, a coin battery tested
                // with a load tester may show 80%, but report 2.5V / 1%. This voltage
                // calculation matches what ZHA does by default.
                // https://github.com/Koenkk/zigbee2mqtt/discussions/17337
                // https://github.com/zigpy/zha-device-handlers/blob/c6ed94a52a469e72b32ece2a92d528060c7fd034/zhaquirks/__init__.py#L195-L228
                voltageToPercentage: "3V_1500_2800",
            },
        },
    }
]

module.exports = converter;
