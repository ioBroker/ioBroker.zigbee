# ioBroker Adapter for ZigBee Devices
Using a ZigBee network coordinator, a dedicated ZigBee network is created, to which ZigBee devices (lights, dimmers, sensors, etc.) can join. Thanks to direct interaction with the coordinator, the ZigBee adapter allows the devices to be controlled without any gateways/bridges from the manufacturers (Xiaomi/Tradfri/Hue). Additional information about ZigBee can be found [here](https://github.com/Koenkk/zigbee2mqtt/wiki/ZigBee-network).

## Hardware
The coordinator (see above) requires additional hardware that enables the conversion between USB and ZigBee wireless signals. There are three types of coordinators:

- Plug-in modules for the Raspberry Pi (The use of these modules is **not** recommended.)
- USB-connected modules, either in the form of development boards or USB sticks
- Network coordinators

A complete list of compatible coordinators can be found [here](https://www.zigbee2mqtt.io/guide/adapters/). We recommend using only coordinators listed as 'recommended'. Instructions for installing the required firmware can also be found there.

Coordinators are also sold with pre-installed firmware. The following applies: **Any coordinator whose firmware is compatible with Zigbee2mqtt.io can also be used with the ZigBee adapter**.

Currently (as of March 2025), the "Sonoff ZIGBEE 3.0 USB-STICK CC2652P" (both the CC2652P and EZSP chipset versions) and network coordinators with Cod.m and/or XTG firmware are particularly popular. The Conbee II and Conbee III are also frequently used. The use of TI coordinators with CC2530/CC2531 is strongly discouraged – these are now considered obsolete.

The devices connected to the ZigBee network transmit their status to the coordinator and notify them of events (button presses, motion detection, temperature changes, etc.). This information is displayed in the adapter under the respective ioBroker objects and can thus be further processed in ioBroker. It is also possible to send commands to the ZigBee device (change of status of sockets and lamps, color and brightness settings, etc.).

## Software

The software is divided into "converter" and "adapter".

![](img/software1.jpg)

   - Converter
    The converter is divided into two parts: <br>
      a) General provision of the data from the ZigBee radio signals. This [software part](https://github.com/Koenkk/zigbee-herdsman) is used for all ZigBee devices. <br>
      b) Device-specific [processing](https://github.com/Koenkk/zigbee-herdsman-converters) of the data to a defined interface to the adapter.
   - Adapter<br>
      This software part is the connection of the converter to ioBroker. The [adapter](https://github.com/ioBroker/ioBroker.zigbee) includes the graphical user interface for managing the ZigBee devices and the creation of ioBroker objects for controlling the ZigBee devices.


## Installation
1. Connect the coordinator hardware to computer running ioBroker (or the network, in case of LAN/WLan coordinators).<br>
2. Open a console on the server. In case of Unix/Linux based systems, this can be done remotely via ssh. Depending on the OS used, additional programs (e.g. puTTY on Windows) may be needed.<br>
3. Determine the coordinator path. On Unix/Linux systems, this is often located in the /dev/serial/by-id directory. Alternatively, /dev/ttyUSB*, /dev/ttyAM* (Unix/Linux), /dev/tty.usbserial-* (macOS), or com* (Windows) are expected.<br>
The following example shows a Linux installation on a Raspberry Pi. The command `ls -la /dev/serial/by-id/` produces the output shown in the image.
![](../de/img/Bild2.png)
4. ioBroker -> Install the ZigBee adapter, here version 1.8.10 as an example. <br> ![](../de/img/Bild3.png) <br> This installs all required software components (converter and adapter). <br>![](img/Zigbee_config_en.png)<br>
5. Open the adapter configuration. The above image shows the interface version 3.0.0 or newer.
In this situation, the admin indicates whether the ZigBee subsystem is started (A).
6. Enter the port for the coordinator (B). In the case of USB coordinators, this is the previously determined device path. For coordinators controlled via the network, the network address and port must be specified in the form tcp://ip:port instead of the device path. If the adapter itself (not the Zigbee subsystem) is active, a list of available serial interfaces is available for selection. The following applies when selecting:
- If multiple adapters with different USB devices are used for communication on the system, a port from the /dev/serial/by-id directory (if available) should **absolutely** be selected. This ensures that the adapter's association with the coordinator is retained when the system is restarted.
- If only one USB device is used, the /dev/TTY* port is preferable. This allows the coordinator to be replaced with an identical device in the event of a defect without having to adjust the configuration.
7. Assign a Network ID and Pan ID to distinguish it from other ZigBee networks within wireless range. e.g., starting with adapter version 2.1.0, ExtPanID (C) and PanID (D) are automatically pre-assigned with random values ​​until the configuration is saved.<br>
8. Select a suitable ZigBee channel (E). Please note that ZigBee and 2.4GHz Wi-Fi share the same frequency band. The optimal channel therefore depends, among other things, on the Wi-Fi channels used in the area. The channel names for ZigBee and Wi-Fi are **not** identical, e.g. WIFI channel 11 and Zigbee channel 11 do **not** interfere with each other. It is also advisable to limit your selection to the ZigBee Light Link channels (11, 15, 20, 25). If a channel is selected that does not belong to the ZLL, the interface displays a yellow triangle with an exclamation mark above the entered channel. <br>After the adapter has been successfully started, a scan of the network channels can also be performed via the configuration.<br>
**Note:** Starting with adapter version 2.1.0, it is possible to change the channel without deleting the configuration and re-learning all devices. However, **this feature is considered experimental** – individual devices may not respond to the channel change; these devices will then need to be re-learned.<br>
9. Check whether the Zigbee subsystem is starting. To do this, try starting the Zigbee subsystem using *Start/Stop* (F). The progress of the start attempt can be observed in the log. The icon (A) changes from black/red to black/orange while the Herdsman starts. If the attempt was successful, the icon disappears completely; otherwise, it turns red again, and the messages in the log provide clues as to the cause.<br>
The Herdsman can also be stopped using the same button. The icon is also displayed in black/orange. **Important: Stopping can take up to 2 minutes in some cases – especially when using network coordinators.** Patience is required here. After Herdsman has been terminated, the icon appears in black/red and the message 'Herdsman stopped!' appears.
Depending on the error, there are various possible reasons why Herdsman may not start. If it is 'just' a timeout, it is certainly advisable to repeat the attempt immediately. If the configuration is inconsistent, the relevant data is displayed in the log. The adapter offers two options for resolving the conflict:
- Reading the data from the NV backup. In this case, the adapter's configuration is adjusted.
- Deleting the NV backup. In this case, the adapter's configuration remains as it is. This **forces** a rebuild of the network, which subsequently requires all previously trained devices to be reset and retrained.<br>
The log output can also be used to search for a solution in the [ioBroker Forum](https://forum.iobroker.net). Please highlight the messages and post them **as text** in the forum.

## Pairing
Each ZigBee device (switch, bulb, sensor, ...) must be paired with the coordinator (pairing):  <br>

   - ZigBee device:
    Each ZigBee device can only be connected to exactly 1 ZigBee network. If the ZigBee device still has pairing information saved for a different coordinator (e.g. Philips Hue Bridge), then it must first be decoupled from this ZigBee network. This decoupling from the old ZigBee network preferably is done via the user interface of the old ZigBee network (z.B. Philips Hue App). Alternatively, you can reset the ZigBee device to factory settings.  <br>
There are typically the following options for putting a ZigBee device into pairing mode <br>
        1.	Unpair a ZigBee device from a ZigBee network
        2.	Press the pairing button on the ZigBee device
        3.	Switch the supply voltage of the ZigBee device off and then on again


The ZigBee device is then in pairing mode for typically 60 seconds. Similar to the procedure for resetting to factory settings, activating the pairing mode also depends on the respective device type (if necessary, read the operating instructions of the ZigBee device).

   - Coordinator:
Press the green button to put the coordinator into pairing mode for 60 seconds. <br>
![](img/Zigbee_pairing_en.png)

   - Wait until "New device joined" appears in the dialog:  <br>
![](img/Bild13.png)

   - Check Pairing:
The device to be paired must be supported by the ioBroker ZigBee adapter. In the best case, a new device is displayed in the ZigBee adapter (e.g. Philips Light Stripe) and corresponding ioBroker objects are created:
![](../de/img/Bild14.png) ![](../de/img/Bild15.png)

   - In the worst case, the ZigBee device is not currently supported. The next section describes what needs to be done to use this ZigBee device anyhow.

## Pairing of unknown ZigBee devices so far

For previously unknown ZigBee devices, the ZigBee name of the ZigBee device (e.g., HOMA1001) appears during pairing with the suffix "supported": false. <br>
![](../de/img/Bild16.png) <br>

Rotating this tile provides detailed information about the ZigBee device: <br>
![](../de/img/Bild17.png) ![](img/Bild18.png) <br>

After registering at [github.com](https://github.com/ioBroker/ioBroker.zigbee/issues), the missing ZigBee device can be reported via an "issue":

![](../de/img/Bild19.png) <br>

Include the detailed information about the tile (see above) in the issue, create a brief documentation (preferably in English), and submit it. A developer will then respond to the issue.

One of two options is possible as a result:
- Adapting to the Zigbee Herdsman converter. This requires an updated version of the Zigbee adapter, which is first tested and then made available in the Latest Repository.
- Creating an "external converter" – a file with JS code that can be copied to the Zigbee adapter's data directory and specified in the adapter's configuration.
In both cases, restarting the adapter is sufficient – ​​the adapter's correspondingly adapted data points will be created. If data points are no longer supported, they will be highlighted in orange, and the adapter will display a button for deleting the orphaned data points.


## Symbols within the ZigBee adapter

| Icon                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ![](../de/img/Bild30.png) | **State Cleanup** <br> Deletes unconnected ioBroker objects. These can be created by the "Exclude" operation. |
| ![](../de/img/Bild38.png) | **Show stashed errors** <br> Displays accumulated error messages that occur repeatedly. This icon is only visible if the system has suppressed recurring error messages and serves to alert the user to their existence. |
| ![](../de/img/Bild31.png) | **Check for Firmware Updates** <br> The Zigbee adapter supports OTA firmware upgrades, provided the connected devices support them. This button initiates the check for newer firmware – the actual upgrade must then be initiated individually on each device. |
| ![](../de/img/Bild32.png) | **Add Group** <br>The Zigbee specification supports the creation of groups of devices that can be controlled together via a single command. While the specification supports almost any command as group commands, the implementation in the Zigbee adapter is limited to light bulbs - this button can be used to create a new group. Members can be added and removed via the devices |
| ![](../de/img/Bild33.png) | **Reset and pair Touchlink** <br> Touchlink is a function of the Zigbee Light Link (ZLL) that allows devices that are physically close to one another to communicate with each other without being connected to a coordinator. This function is not supported by all devices. To reset a Zigbee device to factory settings via Touchlink, bring the device close (< 10 cm) to the Zigbee coordinator and then press the green symbol. **Warning** If the Touchlink reset process is not carried out correctly, devices located further away may also be reset. If in doubt, it is advisable to briefly unplug any affected devices. |
| ![](../de/img/Bild34.png) | **Pairing with a QR Code** <br>There are devices that require an additional security code to pair with a network. This is usually provided as a QR code on the device and/or in the instructions. Pairing with these devices is only possible if the corresponding code has been entered beforehand. **Note** Many instructions specify QR codes that should be read with the manufacturer-specific app in order to connect the device to the manufacturer's gateway, even though the devices do not support a security code. In this case, the adapter displays an error when you try to enter the code. If this happens, it makes sense to try to program the device 'normally'. |
| ![](../de/img/Bild35.png) | **Pairing** <br> Start the pairing process for new ZigBee devices. Pressing this button opens the network for a (configurable) time between 10 and 250 seconds so that new devices can be added to the network.
## Device tiles
| Icon                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ![](../de/img/Bild36.png) | Time since a data exchange last took place with this ZigBee device. |
| ![](../de/img/battery.png) | Battery level, if the device reports a battery level. |
| ![](../de/img/Bild37.png)<br>![](../de/img/disconnected.png) | Strength of the ZigBee radio signal on this ZigBee device (<10 poor, <50 medium, >50 good). ZigBee is a wireless mesh network. Most mains-powered ZigBee devices (e.g., Philips Hue lamps) can act as ZigBee routers, i.e., as wireless nodes. ZigBee devices therefore do not necessarily have to establish a direct wireless connection to the coordinator, but can instead use any router in the network for a wireless connection. With each ZigBee router, the wireless range of the network is extended. All ZigBee devices regularly check whether there is a better wireless route and automatically switch over. However, this process can take several minutes.<br>Manually assigning devices to routers is **not** possible.<br> The red, crossed-out symbol is displayed when a device is considered 'not connected'. |
| ![](../de/img/grp_ok.png) ![](../de/img/grp_nok.png) | Status of a group <br> A green circle indicates that a group has members and is functional; the red X appears when a group is empty or unusable for other reasons. |
| ![](../de/img/info.png) | Info <br> Opens the information display for the device. The information shown on this page comes directly from the device. It is also available for unknown devices. |
| ![](../de/img/debug.png) | Debug device <br> Enables / disables the generation of extended debug messages for this device. The color of the icon indicates the current status: (Black/White: no debug messages, Green: debug messages - can be deactivated with this button. Orange: debug messages via filter under zigbee.x.info.debugmessages. |
| ![](../de/img/on_off.png) | On/Off <br> This button can be used to activate/deactivate a device. No communication takes place with deactivated devices. |
| ![](../de/img/edit_image.png) | Assign image/name <br> This button allows you to specify a custom image and/or name for the device based on the device or device type. Settings made in this way are retained even if the device is deleted. |
| ![](../de/img/edit_grp.png) | Edit name/groups <br> This button can be used to change the name of a device and - if applicable - the assignment of the device to one or more groups. |
| ![](../de/img/delete.png) | Delete device <br> Starts the deletion process for this device. |
## Additional information
The Zigbee-Adapter shares the same libraries (zigbee-herdsman, zigbee-herdsman-converters) asn the [Zigbee2mqtt](https://www.zigbee2mqtt.io/) Project ([Github Link](https://github.com/Koenkk/zigbee2mqtt)). It is possible to use zigbee2mqtt.io directly with ioBroker using MQTT or its own [Adapter](https://github.com/arteck/ioBroker.zigbee2mqtt).<br>
As the libraries are shared, any device supported in zigbee2mqtt.io will in time also be supported in the Zigbee Adapter. Due to the need for compatibility-checks, this can occur with a delay of a few days or weeks. Generating an issue describing the device and its zigbee2mqtt.io integration usually leads to either a temporary solution or an adapter update to include the support in the zigbee Adapter.<br>
Other topics related to this adapter are also documented in the associated [wiki](https://github.com/ioBroker/ioBroker.zigbee/wiki).
