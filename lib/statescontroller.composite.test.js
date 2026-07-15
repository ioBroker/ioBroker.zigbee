'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const StatesController = require('./statescontroller');
const { states } = require('./models');

const IEEE = '0xa4c13878b2fbd388';
const ID = 'a4c13878b2fbd388';

// All color states share compositeState 'color' and are always offered together,
// exactly as statescontroller receives them from devStates.states.
const ALL_COLOR_DEFS = [
    states.color_hue,
    states.color_saturation,
    states.color_red,
    states.color_green,
    states.color_blue,
];

class FakeAdapter extends EventEmitter {
    constructor(stateStore) {
        super();
        this.stateStore = stateStore;
        this.written = [];
        this.localConfig = { getOverrideWithKey: () => undefined, NameForId: (id) => id };
        this.log = { debug() {}, info() {}, warn() {}, error() {}, silly() {} };
    }
    setTimeout(fn, ms) { return setTimeout(fn, ms); }
    clearTimeout(handle) { clearTimeout(handle); }
    async getState(id) { return this.stateStore[id]; }
    setState(id, val) { this.written.push({ id, val }); }
    getStatesOf() {}
}

function buildController(stateStore) {
    const adapter = new FakeAdapter(stateStore);
    const controller = new StatesController(adapter);
    return { adapter, controller };
}

const waitForComposite = () => new Promise((resolve) => setTimeout(resolve, 900));

describe('triggerComposite groups color states by compositeKey', () => {
    test('hue/saturation must not be polluted by the cached rgb values', async () => {
        // Real-world state: lamp currently shows blue, so color_rgb holds that blue.
        // User now sets pure red via hue/saturation.
        const { adapter, controller } = buildController({
            [`${ID}.color_hs.hue`]: { val: 0 },
            [`${ID}.color_hs.saturation`]: { val: 100 },
            [`${ID}.color_rgb.r`]: { val: 0 },
            [`${ID}.color_rgb.g`]: { val: 128 },
            [`${ID}.color_rgb.b`]: { val: 255 },
        });

        await controller.triggerComposite(IEEE, states.color_hue, false, ALL_COLOR_DEFS);
        await waitForComposite();

        const write = adapter.written.find((w) => w.id === `${ID}.color`);
        assert.ok(write, 'composite must write the color state');
        const payload = JSON.parse(write.val);

        // The whole point: zigbee-herdsman-converters decides hs vs xy by inspecting
        // the payload. Any r/g/b key makes Color.fromConverterArg() report isRGB(),
        // which routes to moveToColor(xy) and silently drops the hue/saturation intent.
        assert.deepStrictEqual(payload, { hue: 0, saturation: 100 });
    });

    test('rgb components are still grouped together', async () => {
        const { adapter, controller } = buildController({
            [`${ID}.color_hs.hue`]: { val: 0 },
            [`${ID}.color_hs.saturation`]: { val: 100 },
            [`${ID}.color_rgb.r`]: { val: 255 },
            [`${ID}.color_rgb.g`]: { val: 0 },
            [`${ID}.color_rgb.b`]: { val: 0 },
        });

        await controller.triggerComposite(IEEE, states.color_red, false, ALL_COLOR_DEFS);
        await waitForComposite();

        const write = adapter.written.find((w) => w.id === `${ID}.color`);
        assert.ok(write, 'composite must write the color state');
        assert.deepStrictEqual(JSON.parse(write.val), { r: 255, g: 0, b: 0 });
    });
});
