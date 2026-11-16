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
    }
]

module.exports = converter;
