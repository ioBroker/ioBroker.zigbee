'use strict';

const namedColors = {
    mediumvioletred: {
        rgb:  '#c71585',
    },
    deeppink: {
        rgb:  '#ff1493',
    },
    palevioletred:  {
        rgb:  '#db7093',
    },
    hotpink: {
        rgb:  '#ff69b4',
    },
    lightpink: {
        rgb:  '#ffb6c1',
    },
    pink: {
        rgb:  '#ffc0cb',
    },
    darkred: {
        rgb:  '#8b0000',
    },
    red: {
        rgb:  '#ff0000',
    },
    firebrick: {
        rgb:  '#b22222',
    },
    crimson: {
        rgb:  '#dc143c',
    },
    indianred: {
        rgb:  '#cd5c5c',
    },
    lightcoral: {
        rgb:  '#f08080',
    },
    salmon: {
        rgb:  '#fa8072',
    },
    darksalmon: {
        rgb:  '#e9967a',
    },
    lightsalmon: {
        rgb:  '#ffa07a',
    },
    orangered: {
        rgb:  '#ff4500',
    },
    tomato: {
        rgb:  '#ff6347',
    },
    darkorange: {
        rgb:  '#ff8c00',
    },
    coral: {
        rgb:  '#ff7f50',
    },
    orange: {
        rgb:  '#ffa500',
    },
    darkkhaki: {
        rgb:  '#bdb76b',
    },
    gold: {
        rgb:  '#ffd700',
    },
    khaki: {
        rgb:  '#f0e68c',
    },
    peachpuff: {
        rgb:  '#ffdab9',
    },
    yellow: {
        rgb:  '#ffff00',
    },
    palegoldenrod: {
        rgb:  '#eee8aa',
    },
    moccasin: {
        rgb:  '#ffe4b5',
    },
    papayawhip: {
        rgb:  '#ffefd5',
    },
    lightgoldenrodyellow: {
        rgb:  '#fafad2',
    },
    lemonchiffon: {
        rgb:  '#fffacd',
    },
    lightyellow: {
        rgb:  '#ffffe0',
    },
    maroon: {
        rgb:  '#800000',
    },
    brown: {
        rgb:  '#a52a2a',
    },
    saddlebrown: {
        rgb:  '#8b4513',
    },
    sienna: {
        rgb:  '#a0522d',
    },
    chocolate: {
        rgb:  '#d2691e',
    },
    darkgoldenrod: {
        rgb:  '#b8860b',
    },
    peru: {
        rgb:  '#cd853f',
    },
    rosybrown: {
        rgb:  '#bc8f8f',
    },
    goldenrod: {
        rgb:  '#daa520',
    },
    sandybrown: {
        rgb:  '#f4a460',
    },
    tan: {
        rgb:  '#d2b48c',
    },
    burlywood: {
        rgb:  '#deb887',
    },
    wheat: {
        rgb:  '#f5deb3',
    },
    navajowhite: {
        rgb:  '#ffdead',
    },
    bisque: {
        rgb:  '#ffe4c4',
    },
    blanchedalmond: {
        rgb:  '#ffebcd',
    },
    cornsilk: {
        rgb:  '#fff8dc',
    },
    darkgreen: {
        rgb:  '#006400',
    },
    green: {
        rgb:  '#008000',
    },
    darkolivegreen: {
        rgb:  '#556b2f',
    },
    forestgreen: {
        rgb:  '#228b22',
    },
    seagreen: {
        rgb:  '#2e8b57',
    },
    olive: {
        rgb:  '#808000',
    },
    olivedrab: {
        rgb:  '#6b8e23',
    },
    mediumseagreen: {
        rgb:  '#3cb371',
    },
    limegreen: {
        rgb:  '#32cd32',
    },
    lime: {
        rgb:  '#00ff00',
    },
    springgreen: {
        rgb:  '#00ff7f',
    },
    mediumspringgreen: {
        rgb:  '#00fa9a',
    },
    darkseagreen: {
        rgb:  '#8fbc8f',
    },
    mediumaquamarine: {
        rgb:  '#66cdaa',
    },
    yellowgreen: {
        rgb:  '#9acd32',
    },
    lawngreen: {
        rgb:  '#7cfc00',
    },
    chartreuse: {
        rgb:  '#7fff00',
    },
    lightgreen: {
        rgb:  '#90ee90',
    },
    greenyellow: {
        rgb:  '#adff2f',
    },
    palegreen: {
        rgb:  '#98fb98',
    },
    teal: {
        rgb:  '#008080',
    },
    darkcyan: {
        rgb:  '#008b8b',
    },
    lightseagreen: {
        rgb:  '#20b2aa',
    },
    cadetblue: {
        rgb:  '#5f9ea0',
    },
    darkturquoise: {
        rgb:  '#00ced1',
    },
    mediumturquoise: {
        rgb:  '#48d1cc',
    },
    turquoise: {
        rgb:  '#40e0d0',
    },
    aqua: {
        rgb:  '#00ffff',
    },
    cyan: {
        rgb:  '#00ffff',
    },
    aquamarine: {
        rgb:  '#7fffd4',
    },
    paleturquoise: {
        rgb:  '#afeeee',
    },
    lightcyan: {
        rgb:  '#e0ffff',
    },
    navy: {
        rgb:  '#000080',
    },
    darkblue: {
        rgb:  '#00008b',
    },
    mediumblue: {
        rgb:  '#0000cd',
    },
    blue: {
        rgb:  '#0000ff',
    },
    midnightblue: {
        rgb:  '#191970',
    },
    royalblue: {
        rgb:  '#4169e1',
    },
    steelblue: {
        rgb:  '#4682b4',
    },
    dodgerblue: {
        rgb:  '#1e90ff',
    },
    deepskyblue: {
        rgb:  '#00bfff',
    },
    cornflowerblue: {
        rgb:  '#6495ed',
    },
    skyblue: {
        rgb:  '#87ceeb',
    },
    lightskyblue: {
        rgb:  '#87cefa',
    },
    lightsteelblue: {
        rgb:  '#b0c4de',
    },
    lightblue: {
        rgb:  '#add8e6',
    },
    powderblue: {
        rgb:  '#b0e0e6',
    },
    indigo: {
        rgb:  '#4b0082',
    },
    purple: {
        rgb:  '#800080',
    },
    darkmagenta: {
        rgb:  '#8b008b',
    },
    darkviolet: {
        rgb:  '#9400d3',
    },
    darkslateblue: {
        rgb:  '#483d8b',
    },
    blueviolet: {
        rgb:  '#8a2be2',
    },
    darkorchid: {
        rgb:  '#9932cc',
    },
    fuchsia: {
        rgb:  '#ff00ff',
    },
    magenta: {
        rgb:  '#ff00ff',
    },
    slateblue: {
        rgb:  '#6a5acd',
    },
    mediumslateblue: {
        rgb:  '#7b68ee',
    },
    mediumorchid: {
        rgb:  '#ba55d3',
    },
    mediumpurple: {
        rgb:  '#9370db',
    },
    orchid: {
        rgb:  '#da70d6',
    },
    violet: {
        rgb:  '#ee82ee',
    },
    plum: {
        rgb:  '#dda0dd',
    },
    thistle: {
        rgb:  '#d8bfd8',
    },
    lavender: {
        rgb:  '#e6e6fa',
    },
    mistyrose: {
        rgb:  '#ffe4e1',
    },
    antiquewhite: {
        rgb:  '#faebd7',
    },
    linen: {
        rgb:  '#faf0e6',
    },
    beige: {
        rgb:  '#f5f5dc',
    },
    whitesmoke: {
        rgb:  '#f5f5f5',
    },
    lavenderblush: {
        rgb:  '#fff0f5',
    },
    oldlace: {
        rgb:  '#fdf5e6',
    },
    aliceblue: {
        rgb:  '#f0f8ff',
    },
    seashell: {
        rgb:  '#fff5ee',
    },
    ghostwhite: {
        rgb:  '#f8f8ff',
    },
    honeydew: {
        rgb:  '#f0fff0',
    },
    floralwhite: {
        rgb:  '#fffaf0',
    },
    azure: {
        rgb:  '#f0ffff',
    },
    mintcream: {
        rgb:  '#f5fffa',
    },
    snow: {
        rgb:  '#fffafa',
    },
    ivory: {
        rgb:  '#fffff0',
    },
    white: {
        rgb:  '#ffffff',
    },
    black: {
        rgb:  '#000000',
    },
    darkslategray: {
        rgb:  '#2f4f4f',
    },
    dimgray: {
        rgb:  '#696969',
    },
    slategray: {
        rgb:  '#708090',
    },
    gray: {
        rgb:  '#808080',
    },
    lightslategray: {
        rgb:  '#778899',
    },
    darkgray: {
        rgb:  '#a9a9a9',
    },
    silver: {
        rgb:  '#c0c0c0',
    },
    lightgray: {
        rgb:  '#d3d3d3',
    },
    gainsboro: {
        rgb:  '#dcdcdc',
    },
};

function namedColorToRGBstring(name) {
    const lowerName = name.toLowerCase();
    if (namedColors.hasOwnProperty(lowerName)) {
        return namedColors[lowerName].rgb;
    }
    return '#0088FF';
}

function parseColor(rgbstring) {
    if (typeof rgbstring === 'string') {
        const lowerName = rgbstring.toLowerCase();
        if (namedColors.hasOwnProperty(lowerName)) {
            rgbstring = namedColors[lowerName].rgb;
        }
        rgbstring = rgbstring.trim();
        if (rgbstring.startsWith('#')) {
            rgbstring = rgbstring.slice(1);
        }
        if (rgbstring.length != 6) return {r: 0, g: 128, b: 255}
        const val = parseInt(`0x${rgbstring}`);
        const oneColor = {};
        oneColor.r = Math.floor(val / (256 * 256));
        oneColor.g = Math.floor(val % (256 * 256) / 256);
        oneColor.b = val % 256;
        return oneColor;
    }

    return {r: 0, g: 128, b: 255};
}

function namedColorToRGB(name) {
    if (namedColors.hasOwnProperty(name)) {
        return parseColor(namedColors[name].rgb);
    }

    return {r: 0, g: 128, b: 255};
}

function getColorNames()
{
    return Object.keys(namedColors);
}

exports.NamedColorToRGB = namedColorToRGB;
exports.NamedCOlorToRGBString = namedColorToRGBstring;
exports.ParseColor = parseColor;
exports.getColorNames = getColorNames;
