// converter for esp32-c6 boards, using various sample sketches

const exposes = require('zigbee-herdsman-converters/lib/exposes');
const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const e = exposes.presets;

module.exports = [
    {
        // sample sketch  Zigbee_Electrical_AC_Measurement.ino.
        // Converter courtesy of @clausmuus (ioBroker Forum)
        // NOTE: Freqyency is given in mHz. If this is fixed in the sketch, the 'withUnit' entry in the converter can be removed.
        // NOTE: Power calculation has a rounding error - the formula needs to be changed from
        //       int16_t power = ((voltage / 100) * (current / 1000) * 10);
        // to
        //       int16_t power = ((voltage / 100.0) * (current / 1000.0) * 10);
        // asgothian: possibly, a change to int16_t power = (voltage * current) / 10000; is better, if not as clear.
        fingerprint: [{modelID: 'ZigbeeElectricalMeasurementAC', manufacturerName: 'Espressif'}],
        model: 'ZigbeeElectricalMeasurementAC',
        description: 'AC Electrical Measurement device',
        vendor: 'Espressif',
        fromZigbee: [fz.electrical_measurement],
        toZigbee: [],
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ['haElectricalMeasurement']);
            await reporting.readEletricalMeasurementMultiplierDivisors(endpoint);
            await reporting.rmsVoltage(endpoint);
            await reporting.rmsCurrent(endpoint);
            await reporting.activePower(endpoint);
            await reporting.acFrequency(endpoint);
        },
        exposes: [e.power(), e.current(), e.voltage(), e.ac_frequency().withUnit('mHz')],

        icon: 'img/esp32-c6.png',
        useadaptericon: false,
    }
];