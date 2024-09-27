![Logo](admin/zigbee.png)
# ioBroker.zigbee

![Number of Installations](http://iobroker.live/badges/zigbee-installed.svg)
![Number of Installations](http://iobroker.live/badges/zigbee-stable.svg)
[![NPM version](http://img.shields.io/npm/v/iobroker.zigbee.svg)](https://www.npmjs.com/package/iobroker.zigbee)

![Test and Release](https://github.com/ioBroker/iobroker.zigbee/workflows/Test%20and%20Release/badge.svg)
[![Translation status](https://weblate.iobroker.net/widgets/adapters/-/zigbee/svg-badge.svg)](https://weblate.iobroker.net/engage/adapters/?utm_source=widget)
[![Downloads](https://img.shields.io/npm/dm/iobroker.zigbee.svg)](https://www.npmjs.com/package/iobroker.zigbee)

## ioBroker adapter for Zigbee devices via TI cc2531/cc2530/cc26x2r/cc2538 and deCONZ ConBee/RaspBee.

With the Zigbee-coordinator based on Texas Instruments SoC, deCONZ ConBee/RaspBee modules, Silicon Labs EZSP v8 or ZIGate USB-TTL it creates its own zigbee-network, into which zigbee-devices are connected. By work directly with the coordinator, the driver allows you to manage devices without additional application / gateways / bridge from device manufacturers (Xiaomi / TRADFRI / Hue / Tuya). About the device Zigbee-network can be read [here (in English)](https://www.zigbee2mqtt.io/information/zigbee_network.html).

## Hardware


One coordinator device is required for each zigbee Adapter instance. The device must be flashed with the respective coordinator firmware. A list of supported coordinators, the necessary equipment for the firmware and the device preparation process for different coordinator devices are described [here in English](https://www.zigbee2mqtt.io/guide/adapters/) or [smarthomescene.com ](https://smarthomescene.com/blog/best-zigbee-dongles-for-home-assistant-2023/) or [here in Russian](https://myzigbee.ru/books/%D0%BF%D1%80%D0%BE%D1%88%D0%B8%D0%B2%D0%BA%D0%B8/page/%D0%BF%D1%80%D0%BE%D1%88%D0%B8%D0%B2%D0%BA%D0%B0-cc2531cc2530)


### Texas Instruments SoC

Recommended devices are based on either the CC2652 or CC1352 chip. Devices based on cc253x chips are still supported but are no longer recommended.
Only CC26xx/cc1352/cc2538 Devices support extraction of the NVRam backup which should allow to swap coordinator hardware without having to reconnect all zigbee devices to the network.
Current firmware files for these devices can be found [on GitHub](https://github.com/Koenkk/Z-Stack-firmware)

<span><img src="https://raw.githubusercontent.com/ioBroker/ioBroker.zigbee/master/docs/de/img/CC2531.png" width="100"></span>
<span><img src="https://raw.githubusercontent.com/ioBroker/ioBroker.zigbee/master/docs/de/img/CC2591.png" width="100"></span>
<span><img src="https://raw.githubusercontent.com/ioBroker/ioBroker.zigbee/master/docs/de/img/sonoff.png" width="100"></span>
<span><img src="https://raw.githubusercontent.com/ioBroker/ioBroker.zigbee/master/docs/de/img/CC2538_CC2592_PA.PNG" width="100"></span>
<span><img src="https://raw.githubusercontent.com/ioBroker/ioBroker.zigbee/master/docs/de/img/cc26x2r.PNG" width="100"></span>

tutorial/zigbee.png
### Dresden Elektronik SoC
<span><img src="https://raw.githubusercontent.com/ioBroker/ioBroker.zigbee/master/docs/en/img/deconz.png" width="180"></span>

recommended:
- ConBee II
- RaspBee II

no longer recommended:
- ConBee I
- RaspBee

While Conbee/RaspBee Support is no longer considered experimental in the zigbee-herdsman and zigbee-herdsman-converters libraries used by the zigbee Adapter, use of these devices with the adapter may limit functionality. Known issues are:
- link quality display may be incorrect
- device map metrics may be incorrect
- NVRam Backup is not supported.

### Silicon Labs SoC

Support for [Silicon Lab Zigbee](https://www.silabs.com/wireless/zigbee) based adapters is experimental. The initial support for EZSP v8 is still not yet considered stable and the project is in need of more developers volunteering to help with this integration. Please refer to the respective documentation on [this page](https://www.zigbee2mqtt.io/guide/adapters/) and [ongoing development discussion](https://github.com/Koenkk/zigbee-herdsman/issues/319) with regards to the state of Silabs EmberZNet Serial Protocol (EZSP) adapter implementation integration into the zigbee-herdsman and zigbee-herdsman-converters libraries which it depends on.


### ZiGate SoC

Support for [ZiGate](https://zigate.fr) based adapters is experimental. The initial support for ZiGate is still not yet considered stable and the project is in need of more developers volunteering to help with this integration. Please refer to the respective documentation on [this page](https://www.zigbee2mqtt.io/guide/adapters/) and [ongoing development discussion](https://github.com/Koenkk/zigbee-herdsman/issues/242) with regards to the state of ZiGate adapter implementation into the zigbee-herdsman and zigbee-herdsman-converters libraries which it depends on.


## Work with adapter

![](docs/tutorial/zigbee.png)

To start the driver, you must specify the name of the port on which the Zigbee-module (stick) is connected. Usually this is the port `/dev/ttyACM0` or `/dev/ttyUSB0` for the UART-connection. Or you can find with `ls -l /dev/serial/by-id` the device direct.

open the settings and change port
![](docs/tutorial/settings.png)


For Windows this will be the COM port number.

Starting from version 1.0.0 you can also use *tcp connection* for cases using esp8266 (or other microcontrollers) as serial-bridge. For example `tcp://192.168.1.46:8880`. Read more info here https://www.zigbee2mqtt.io/information/connecting_cc2530#via-an-esp8266

To connect devices, you need to switch the Zigbee-coordinator to pairing mode by pressing the green button. The countdown will begin (60 seconds) until the device connectivity is available.
To connect Zigbee devices in most cases, just press the pairing button on the device itself. But there are features for some devices. More information about pairing with devices can be found [here (in English)](https://www.zigbee2mqtt.io/getting_started/pairing_devices.html)

After successful pairing, the device appears in the configuration panel. If the device appears in the configuration panel but has the type "undefined", then this is an unknown device and can not be work with it. If the device is in the list of available devices, but added as "undefined", then try to remove the device and add it again.

The devices connected to the Zigbee-network and inform the coordinator of their status and events (button presses, motion detection, temperature change). This information is reflected in the ioBroker object-states. Some ioBroker states have feedback and send commands to the zigbee-device when the value changes (switching the state of the outlet or lamp, changing the scene or the brightness of the lamp).

### Device Groups
You may create groups of devices.

![](docs/tutorial/groups-1.png)

It is a Zigbee feature, intended for example to switch bulbs synchronized. Assign groups via device tabs edit button. A group will show as own "device" in Objects.

![](docs/tutorial/groups-2.png)

Note: Not all devices support groups (not supported by end devices like sensors).


### Binding

https://www.zigbee2mqtt.io/information/binding

### Developer Tab

This is a tool for advanced users to test currently unsupported devices or enhance this adapters functionality. More instructions can be found on tab.
![](docs/tutorial/tab-dev-1.png)

## Additional info

There is a [friendly project](https://github.com/koenkk/zigbee2mqtt) with similar functionality on the same technologies, where you can work with the same devices using the MQTT protocol. Therefore, if any improvements or support for new zigbee-devices occur in the Zigbee2MQTT project, we can transfer and add the same functionality to this adapter. If you notice this, then write the issue - we'll postpone it.

There are knowledge bases that can be useful for working with Zigbee-devices and equipment:
* in English https://www.zigbee2mqtt.io/
* in Russian https://myzigbee.ru/

## Supported devices

[Works with devices from this list](https://github.com/ioBroker/ioBroker.zigbee/wiki/Supported-devices)


## More Informations

[in Deutsch](https://github.com/ioBroker/ioBroker.zigbee/blob/master/docs/de/readme.md)

[in English](https://github.com/ioBroker/ioBroker.zigbee/blob/master/docs/en/readme.md)

or 

[wiki](https://github.com/ioBroker/ioBroker.zigbee/wiki)



## Donate

You can thank the authors by these links:
* to Arthur Rupp https://paypal.me/ArthurRupp

-----------------------------------------------------------------------------------------------------
## Changelog

### ### 1.10.10 (2024-09-27)
* (lebrinkma) fix linter errors
* (asgothian) disable map display for deactivated devices
* (asgothian) new option on map: disable physics interaction
* (asgothian) new zigbee-herdsman-converters 20.18.0
* (asgothian) new zigbee-herdsman 2.1.1
* (asgothian) Allow use of keyless converters (used for TuYa and compatible devices in zigbee-herdsman-converters
* (asgothian) add button to read network config from nvbackup.json (if present)
* (arteck) swap from request to axios

### 1.10.9 (2024-09-05)
* (arteck) typo admin settings
* (arteck) eslint config

### 1.10.8 (2024-09-05)
* (arteck) corr admin settings
* (arteck) add new eslint version

### 1.10.7 (2024-09-05)
* (arteck) add flow control option 
* (asgothian) add new NewHerdsman
* (arteck) add new ezsp coordinator Firmware (7.4.1.0)

### 1.10.5 (2024-06-21)
* (arteck) icon ota device update
* (arteck) icon fix

### 1.10.4 (2024-04-20)
* (arteck) core update
* (arteck) dependency update

### 1.10.3 (2024-04-06)
* (arteck) dependency update

### 1.10.2 (2024-01-25)
* (arteck) dependency update

### 1.10.1 (2024-01-21)
* (arteck) Baudrate is now configurable. works ONLY with Deconz/Conbee( 38400 )
* (arteck) add nvbackup.json delete button

### 1.10.0 (2024-01-13)
* (arteck) new zigbee-herdsman-converters 18.x
* (arteck) configure message is now a warning

### 1.9.7 (2024-01-05)
* (arteck) corr configure for some devices

### 1.9.6 (2024-01-01)
* (arteck) corr ikea bug 
* (crckmc) trv child lock works

### 1.9.5 (2023-12-29)
* (arteck) update dependency
* (arteck) min node 18.x.

### 1.9.4 (2023-12-29)
* (arteck) typo

### 1.9.3 (2023-12-26)
* (arteck) last zhc Version 16.x
* (arteck) corr reboot in statecontroller

### 1.9.2 (2023-12-25)
* (arteck) gen states from exposes as function
* (arteck) rebuild dev_names.json with state cleanup button

### 1.9.1 (2023-12-23)
* (arteck) corr TypeError: Cannot read properties of undefined (reading 'state')

### 1.9.0 (2023-12-22)
* (arteck) up to new zhc
* (arteck) update dependency

### 1.8.27 (2023-12-22)
* (arteck) update dependency

### 1.8.26 (2023-12-22)
* (arteck) corr toZigbee message
* (arteck) add deviceManager

### 1.8.25 (2023-12-17)
* zhc 16.x 
* (arteck) corr group from exclude dialog

### 1.8.24 (2023-09-05)
* (arteck) switch to exposes tab for some Aqara Devices [more infos](https://github.com/ioBroker/ioBroker.zigbee/wiki/Exposes-for-device-integration)

### 1.8.23 (2023-08-10)
* (arteck) query from xiaomi is now better

### 1.8.22 (2023-08-05)
* (arteck) crash when meta is empty

### 1.8.21 (2023-07-31)
* (arteck) no converter found

### 1.8.20 (2023-07-31)
* (arteck) add log

### 1.8.19 (2023-07-31)
* (arteck) fix occupancy_timeout
* (arteck) fix battery percentage and voltage

### 1.8.18 (2023-07-16)
* (arteck) little fix sentry and error log

### 1.8.17 (2023-07-15)
* (arteck) sentry corr

### 1.8.16 (2023-07-11)
* (arteck) battery corr

### 1.8.15 (2023-07-11)
* (arteck) corr battery status

### 1.8.13 (2023-07-09)
* (arteck) ota corr
* (arteck) devices are wrong with enum exposes
* (arteck) select field for groups is larger 
* (kirovilya) tuya.whitelabel corr

### 1.8.12 (2023-06-30)
* (arteck) new Documentation (thx Stefan)

### 1.8.11 (2022-12-10)
* (arteck) fix compsite exposes with list

### 1.8.10 (2022-12-12)
* (asgothian) fix group access
* (asgothian) add option for pairing code:
   A new icon allows to open the network after first entering a pairing code
   listed on the device
* (asgothian) easier use of external converters
   - external converters can now be placed in the zigbee adapter data folder
   - no absolite path is required to access them
   - external converters posted on the github for zigbee-herdsman-converters
     should work as they are - folders for libraries are rewritten to match
     the expected location when 'required' from within the zigbee adapter
   - Log entries will identify which files are entered as converters. Errors
     in these files should not cause the adapter to crash - instead, use of
     external converters may be unavailable.

### 1.8.9 (2022-12-10)
* (arteck) fix lidl plug

### 1.8.7 (2022-12-01)
* (arteck) fix exposes

### 1.8.5 (2022-11-30)
* (arteck) fix for new code

### 1.8.3 (2022-11-30)
* (arteck) back to old source

### 1.8.1 (2022-11-28)
* (bluefox) Packages updated
* (bluefox) Added names of serial ports in configuration dialog

### 1.7.7 (2022-11-24)
* dep update

### 1.7.6 (2022-07-23)
* (kirovilya) fix selecting nodes in admin
* (arteck) ikea fix

### 1.7.5 (2022-06-01)
* (arteck) error message for undefined devices or icons

### 1.7.4 (2022-05-30)
* (arteck) missing icons with multiple description

### 1.7.2 (2022-05-28)
* (arteck) download missing icons corr

### 1.7.1 (2022-05-28)
* (arteck) available status in admin is colored
* (arteck) disable Backups checkbox in settings
* (arteck) we keep last 10 backup files
* (arteck) download missing icons automatically (manual upload needed)

### 1.6.18 (2022-04-21)
* (arteck) fix pairing modus

### 1.6.17 (2022-04)
 rollback

### 1.6.16 (2022-02-16)
* (arteck) admin dep fix
* (arteck) colored objects for online/offline state

### 1.6.15 (2022-02-08)
* (arteck) Battery status % calculation was changed for xiaomi devices

### 1.6.14 (2022-01)
* (asgothian) OTA limitation
  - devices with the available state set to false are excluded from OTA updates (and the update check)
  - devices with link_quality 0 are excluded from OTA updates (and the update check)
* (asgothian) Device deactivation:
  - Devices can be marked inactive from the device card.
  - inactive devices are not pinged
  - state changes by the user are not sent to inactive devices.
  - when a pingable device is marked active (from being inactive) it will be pinged again.
  - inactive devices are excluded from OTA updates.
* (asgothian) Group rework part 2:
  - state device.groups will now be deleted with state Cleanup
  - state info.groups is now obsolete and will be deleted at adapter start (after transferring data to
    the new storage)
* (asgothian) Device name persistance.
  - Changes to device names made within the zigbee adapter are stored in the file dev_names.json. This file
    is not deleted when the adapter is removed, and will be referenced when a device is added to the zigbee adapter. Deleting and reinstalling the adapter will no longer remove custom device names, nor will deleting and adding the device anew.
* (asgothian) Readme edit to reflect the current information on zigbee coordinator hardware.
* (arteck) Zigbee-Herdsman 0.14.4, Zigbee-Herdsman-Converters 14.0.394

### 1.6.13 (2022-01)

* (kirovilya) update to Zigbee-Herdsman 0.14

### 1.6.12 (2022-01)
* (asgothian) Groups were newly revised (read [here](https://github.com/ioBroker/ioBroker.zigbee/pull/1327) )
   -  object device.groups is obsolet..the old one is no longer up to date

### 1.6.9 (2021-12)
* (simatec) fix admin Dark-Mode
* (asgothian) Expose Access Handling
* (arteck) translations
* (asgothian) fix groups
* (agross) use different normalization rules

### 1.6.1 (2021-08)
* (kirovilya) herdsman compatibility

----

### 1.0.0 (2020-01-22)
* Powered by new [zigbee-herdsman](https://github.com/Koenkk/zigbee-herdsman) library and new [converters database](https://github.com/Koenkk/zigbee-herdsman-converters)
* Drop support NodeJS 6
* Serialport 8.0.5 (in zigbee-herdsman)
* More new devices
* Some design update
* Binding

## License
The MIT License (MIT)

Copyright (c) 2018-2024 Kirov Ilya <kirovilya@gmail.com>

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
