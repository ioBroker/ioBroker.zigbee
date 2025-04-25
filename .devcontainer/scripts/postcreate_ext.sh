#!/bin/bash

set -e
# Configure based on the
iob object set system.adapter.zigbee.0 native.port=tcp://192.168.0.17:6638
iob object set system.adapter.zigbee.0 native.adapterType=ember
iob object set system.adapter.zigbee.0 native.flowCTRL=true
iob object set system.adapter.zigbee.0 native.baudrate=115200
iob object set system.adapter.zigbee.0 native.panID=3788
iob object set system.adapter.zigbee.0 native.extPanID=c8bb26fe53dc70e3
iob object set system.adapter.zigbee.0 native.precfgkey=01030507090B0D0F00020406080A0C0D
iob object set system.adapter.zigbee.0 native.debugHerdsman=true
iob object set system.adapter.zigbee.0 native.autostart=true

