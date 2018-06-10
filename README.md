![Logo](admin/zigbee.png)
# ioBroker.zigbee

[![NPM version](http://img.shields.io/npm/v/iobroker.zigbee.svg)](https://www.npmjs.com/package/iobroker.zigbee)
[![Downloads](https://img.shields.io/npm/dm/iobroker.zigbee.svg)](https://www.npmjs.com/package/iobroker.zigbee)
[![Tests](https://travis-ci.org/kirovilya/ioBroker.zigbee.svg?branch=master)](https://travis-ci.org/kirovilya/ioBroker.zigbee)

[![NPM](https://nodei.co/npm/iobroker.zigbee.png?downloads=true)](https://nodei.co/npm/iobroker.zigbee/)

## ioBroker Zigbee adapter for Xiaomi (and other) devices via cc2531/cc2530

With the Zigbee-coordinator based on Texas Instruments SoC cc253x (and others), it creates its own zigbee-network, into which zigbee-devices are connected. By work directly with the coordinator, the driver allows you to manage devices without additional gateways / bridge from device manufacturers (Xiaomi / TRADFRI / Hue). About the device Zigbee-network can be read [here (in English)](https://github.com/Koenkk/zigbee2mqtt/wiki/ZigBee-network).

## Hardware

For work, you need one of the following devices, flashed with a special ZNP firmware: [cc2531, cc2530, cc2530 + RF](https://github.com/Koenkk/zigbee2mqtt/wiki/Supported-sniffer-devices#zigbee-coordinator)

<span><img src="https://ae01.alicdn.com/kf/HTB1Httue3vD8KJjSsplq6yIEFXaJ/Wireless-Zigbee-CC2531-Sniffer-Bare-Board-Packet-Protocol-Analyzer-Module-USB-Interface-Dongle-Capture-Packet.jpg_640x640.jpg" width="100"></span>
<span><img src="http://img.dxcdn.com/productimages/sku_429478_2.jpg" width="100"></span>
<span><img src="http://img.dxcdn.com/productimages/sku_429601_2.jpg" width="100"></span>
<span><img src="https://ae01.alicdn.com/kf/HTB1zAA5QVXXXXahapXXq6xXFXXXu/RF-TO-USB-CC2530-CC2591-RF-switch-USB-transparent-serial-data-transmission-equipment.jpg_640x640.jpg" width="100"></span>

The necessary equipment for the firmware and the device preparation process is described [here (in English)](https://github.com/Koenkk/zigbee2mqtt/wiki/Getting-started) or [here (in Russian)](https://github.com/kirovilya/ioBroker.zigbee/wiki/%D0%9F%D1%80%D0%BE%D1%88%D0%B8%D0%B2%D0%BA%D0%B0)

The devices connected to the Zigbee-network inform the coordinator of their status and events (button presses, motion detection, temperature change). This information is reflected in the ioBroker object-states. Some ioBroker states have feedback and send commands to the zigbee-device when the value changes (switching the state of the outlet or lamp, changing the scene or the brightness of the lamp).

## Work with adapter

![](https://raw.githubusercontent.com/kirovilya/files/master/config.PNG)

To start the driver, you must specify the name of the port on which the cc253x device is connected. Usually this is the port `/dev/ttyACM0` for cc2531 or `/dev/ttyUSB0` for the UART-connection cc2530. For Windows this will be the COM port number.

To connect devices, you need to switch the Zigbee-coordinator to pairing mode by pressing the green button. The countdown will begin (60 seconds) until the device connectivity is available.
To connect Zigbee devices in most cases, just press the pairing button on the device itself. But there are features for some devices. More information about pairing with devices can be found [here (in English)](https://github.com/Koenkk/zigbee2mqtt/wiki/Pairing-devices) or [here (in Russian)](https://github.com/kirovilya/ioBroker.zigbee/wiki#%D0%9F%D0%BE%D0%B4%D0%B4%D0%B5%D1%80%D0%B6%D0%B8%D0%B2%D0%B0%D0%B5%D0%BC%D1%8B%D0%B5-%D1%83%D1%81%D1%82%D1%80%D0%BE%D0%B9%D1%81%D1%82%D0%B2%D0%B0)

After successful pairing, the device appears in the configuration panel. If the device appears in the configuration panel but has the type "undefined", then this is an unknown device and can not be work with it. If the device is in the list of available devices, but added as "undefined", then try to remove the device and add it again.

## Additional info

There is a [friendly project](https://github.com/koenkk/zigbee2mqtt) with similar functionality on the same technologies, where you can work with the same devices using the MQTT protocol. Therefore, if any improvements or support for new zigbee-devices occur in the Zigbee2MQTT project, we can transfer and add the same functionality to this adapter. If you notice this, then write the issue - we'll postpone it.

There are knowledge bases that can be useful for working with Zigbee-devices and equipment:
* in English https://github.com/koenkk/zigbee2mqtt/wiki
* in Russian https://github.com/kirovilya/ioBroker.zigbee/wiki

## Tested with devices:

* QBCZ11LM Aqara Smart Socket ZiGBee (state, load power, in use)
* QBKG11LM Xiaomi Aqara Smart Wall Switch Line-Neutral Single-Button (click, state, load power)
* JTYJ-GD-01LM/BW Xiaomi Smoke Alarm (detected, voltage)
* ZNCZ02LM Xiaomi Smart Power Plug (state, load power, in use)
* QBKG03LM Xiaomi Aqara Light Switch (left is on, right is on, click left, click right, click both)
* MFKZQ01LM Xiaomi Magic Cube Controller (shake, slide, flip90, flip180, tap, rotate, fall, wakeup, voltage)
* SJCGQ11LM Aqara Smart Water Sensor (detected, voltage)
* WXKG02LM Aqara Smart Light Switch Wireless (click left, click right, click both, voltage)
* WSDCGQ11LM Aqara Temperature Humidity Sensor (humidity, pressure, temperature, voltage)
* WSDCGQ01LM Aqara Temperature Humidity Sensor (humidity, temperature, voltage)
* MCCGQ11LM Aqara Window Door Sensor (contact, voltage)
* MCCGQ01LM Xiaomi Mi Smart Door/Window Sensor (contact, voltage)
* WXKG11LM Aqara Smart Wireless Switch (click, double click, voltage)
* WXKG01LM Xiaomi Smart Wireless Switch (click, double click, triple, long click, voltage)
* RTCGQ11LM Aqara Human Body Sensor (illuminance, occupancy, voltage)
* RTCGQ01LM Xiaomi Mi Smart IR Human Body Sensor (illuminance, occupancy, voltage)


## Changelog

### 0.5.4 (2018-06-10)
* (kirovilya) Public version

### 0.5.0 (2018-06-06)
* (kirovilya) All refactored

### 0.0.1 (2018-02-07)
* (kirovilya) First version


## License
The MIT License (MIT)

Copyright (c) 2018 Kirov Ilya <kirovilya@gmail.com>

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
