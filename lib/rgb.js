/*
With these functions you can convert the CIE color space to the RGB color space and vice versa.

The developer documentation for Philips Hue provides the formulas used in the code below:
https://developers.meethue.com/documentation/color-conversions-rgb-xy

I've used the formulas and Objective-C example code and transfered it to JavaScript.


Examples:

const rgb = cie_to_rgb(0.6611, 0.2936)
const cie = rgb_to_cie(255, 39, 60)

------------------------------------------------------------------------------------

The MIT License (MIT)

Copyright (c) 2017 www.usolved.net
Published under https://github.com/usolved/cie-rgb-converter

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
'use strict';

const colors = require('./colors.js');

/**
 * Converts CIE color space to RGB color space
 * @param {Number} x
 * @param {Number} y
 * @param {Number} brightness - Ranges from 1 to 254
 * @return {Array} Array that contains the color values for red, green and blue
 */
function cie_to_rgb(x, y, brightness) {
    //Set to maximum brightness if no custom value was given (Not the slick ECMAScript 6 way for compatibility reasons)
    if (brightness === undefined) {
        brightness = 254;
    }

    const z = 1.0 - x - y;
    const Y = (brightness / 254).toFixed(2);
    const X = (Y / y) * x;
    const Z = (Y / y) * z;

    //Convert to RGB using Wide RGB D65 conversion
    let red 	=  X * 1.656492 - Y * 0.354851 - Z * 0.255038;
    let green = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
    let blue 	=  X * 0.051713 - Y * 0.121364 + Z * 1.011530;

    //If red, green or blue is larger than 1.0 set it back to the maximum of 1.0
    if (red > blue && red > green && red > 1.0) {

        green = green / red;
        blue = blue / red;
        red = 1.0;
    }
    else if (green > blue && green > red && green > 1.0) {

        red = red / green;
        blue = blue / green;
        green = 1.0;
    }
    else if (blue > red && blue > green && blue > 1.0) {

        red = red / blue;
        green = green / blue;
        blue = 1.0;
    }

    //Reverse gamma correction
    red 	= red   <= 0.0031308 ? 12.92 * red   : (1.0 + 0.055) * Math.pow(red,   (1.0 / 2.4)) - 0.055;
    green 	= green <= 0.0031308 ? 12.92 * green : (1.0 + 0.055) * Math.pow(green, (1.0 / 2.4)) - 0.055;
    blue 	= blue  <= 0.0031308 ? 12.92 * blue  : (1.0 + 0.055) * Math.pow(blue,  (1.0 / 2.4)) - 0.055;


    //Convert normalized decimal to decimal
    red 	= Math.round(red * 255);
    green 	= Math.round(green * 255);
    blue 	= Math.round(blue * 255);

    if (isNaN(red) || red < 0 ) {
        red = 0;
    }

    if (isNaN(green) || green < 0 ) {
        green = 0;
    }

    if (isNaN(blue) || blue < 0 ) {
        blue = 0;
    }

    return [red, green, blue];
}


/**
 * Converts RGB color space to CIE color space
 * @param {Number} red
 * @param {Number} green
 * @param {Number} blue
 * @return {Array} Array that contains the CIE color values for x and y
 */
function rgb_to_cie(red, green, blue) {
    // Apply a gamma correction to the RGB values, which makes the color more vivid and more the like the color displayed on the screen of your device
    red 	= (red > 0.04045) ? Math.pow((red + 0.055) / (1.0 + 0.055), 2.4) : (red / 12.92);
    green 	= (green > 0.04045) ? Math.pow((green + 0.055) / (1.0 + 0.055), 2.4) : (green / 12.92);
    blue 	= (blue > 0.04045) ? Math.pow((blue + 0.055) / (1.0 + 0.055), 2.4) : (blue / 12.92);

    // RGB values to XYZ using the Wide RGB D65 conversion formula
    const X 		= red * 0.664511 + green * 0.154324 + blue * 0.162028;
    const Y 		= red * 0.283881 + green * 0.668433 + blue * 0.047685;
    const Z 		= red * 0.000088 + green * 0.072310 + blue * 0.986039;

    // Calculate the xy values from the XYZ values
    let x 		= (X / (X + Y + Z)).toFixed(4);
    let y 		= (Y / (X + Y + Z)).toFixed(4);

    if (isNaN(x)) {
        x = 0;
    }

    if (isNaN(y)) {
        y = 0;
    }

    return [x, y];
}


function hsvToRGB(h, s, v) {
    h = h % 360 / 360;
    s = s / 100;
    v = v / 100;

    let r; let g; let b;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
    };
}

function rgbToHSV(r, g, b, numeric) {
    if (arguments.length === 1) {
        g = r.g, b = r.b, r = r.r;
    }
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    const d = max - min;
    let h;
    const s = (max === 0 ? 0 : d / max);
    const v = max / 255;

    switch (max) {
        case min: h = 0; break;
        case r: h = (g - b) + d * (g < b ? 6: 0); h /= 6 * d; break;
        case g: h = (b - r) + d * 2; h /= 6 * d; break;
        case b: h = (r - g) + d * 4; h /= 6 * d; break;
    }
    if (numeric) return {
        h: Math.round(h*360),
        s: Math.round(s*100),
        v: Math.round(v*100),
    };
    return {
        h: (h * 360).toFixed(3),
        s: (s * 100).toFixed(3),
        v: (v * 100).toFixed(3),
    };
}
function colorArrayFromString(value) {
    if (typeof(value) === 'string') {
        const rv = [];
        value.split(',').forEach(element => {
            rv.push(colors.ParseColor(element));
        });
        return rv;
    }
    return [{r:0,g:128,b:255}];
}

function colorStringFromRGBArray(payload)
{
    let rv = []
    payload.forEach(element => {
        rv.push(rgb_to_rgbstring(element));
    });
    return rv.toString();
}

function hsv_to_cie(h,s,v){
    const rgb = hsvToRGB(h,s,v);
    return rgb_to_cie(rgb.r, rgb.g, rgb.b);
}

function rgb_to_rgbstring(element) {
    let col = '#';
    if (element && element.hasOwnProperty("r"))
      col = col + element.r.toString(16).padStart(2, '0');
    else col = col + '00';
    if (element && element.hasOwnProperty("g"))
      col = col + element.g.toString(16).padStart(2, '0');
    else col = col + '00';
    if (element && element.hasOwnProperty("b"))
      col = col + element.b.toString(16).padStart(2, '0');
    else col = col + '00';
    return col;
}


function hsvToRGBString(h,s,v) {
    return rgb_to_rgbstring(hsvToRGB(h,s,v))
}

exports.hsv_to_cie = hsv_to_cie;
exports.rgb_to_cie = rgb_to_cie;
exports.cie_to_rgb = cie_to_rgb;
exports.hsvToRGB = hsvToRGB;
exports.rgbToHSV = rgbToHSV;
exports.colorArrayFromString = colorArrayFromString;
exports.colorStringFromRGBArray = colorStringFromRGBArray;
exports.hsvToRGBString = hsvToRGBString;
