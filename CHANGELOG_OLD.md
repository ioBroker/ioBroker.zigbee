# Older changes
## 3.4.6 (2026-06-11)
* Fix: Option meta_message
* Fix: zigbee network on tcp connection loss
* ZH 10.3
* ZHC 26.63
* state controlled OTA

## 3.4.5 (2026-05-17)
* Bugfix
* Wider Webkit scrollbars

## 3.4.4 (2026-05-17)
* ZH10 ZHC 26.51.0
* Configurable dynamic UI
* Configurable read after binding trigger
* Bugfix in binding creation
* edit binding button on device tile

## 3.4.3 (2026-05-08)
* Dynamic IU setting (2 card sizes)
* Bugfixes

## 3.4.2 (2026-05-06)
* Fix bug with color expose
* remove serialport, axios, debug dependency
* Tooltips for cards
* different card sizes (test)
* changed visuals for checkboxes and radio boxes

## 3.4.1 (2026-05-03)
* new Binding UI
* new *model specific* option `meta_state` - accepts a list of states (.ie. 'state,brightness')
* adapter defined default-options
* ZH 9.0
* ZHC 24.41 or newer

## 3.3.5 (2026-01-30)
* Bugfix - Error on startup from onEvent
* fix: send_payload read with array of cluster

## 3.3.4 (2026-01-26)
* ZHC 25.112.0
* ZH 8.1.0
* Fix: Admin does not load com ports

## 3.3.3 (2026-01-11)
* Fix crash bug
* getter for composite states V1
* zhc

## 3.3.2 (2026-01-04)
* Fix sync brightness / state
* Fix bug in expose
* Fix rewrite state config

## 3.3.1 (2025-12-31)
* Update documentation
* Color Hue/Saturation in Groups
* Zigbee-Herdsman v8.x.x
* Sort by model in Admin
* Object for complex exposes
* POSSIBLY BREAKING: Complex exposes changed to 'channel / state' structure
* Bugfixes

## 3.3.0 (2025-12-08)
* Fix: dynamic model assignment when exposes is function (PTVO, BuschJaeger)
* Fix: Roles
* Refactor: Legacy code moved
* Refactor: Expose creation changed.
* Refactor: Exposes no longer use states from legacy code
* Feature: Offer state rebuild function in Settings
* (mh2134): Additional filters for device display
* Fix: Orphaned group states detected, marked and deletable
* Update: ZH 7.x
* Update: ZHC 25.84.0


### 3.2.5 (2025-10-31)
* (asgothian) changed setState for lasterror

### 3.2.4 (2025-10-31)
* (asgothian) added missing state

### 3.2.3 (2025-10-31)
* (asgothian) Improvements on debug UI
* (asgothian) Option 'resend_states' to publish state values to device on reconnect
* (asgothian) Improved group card
* (asgothian) Improved group info
* (asgothian) Modified coordinator card (2 sides)
* (asgothian) retry on error 25
* (asgothian) clear stashed error messages
* (asgothian) ZHC 25.50.0 or newer

### 3.2.2 (2025-10-27)
* (asgothian) Bugfix on delete object.
* (asgothian) improved device query.
* (asgothain) fixed delete device with local overrides.
*

### 3.2.1 (2025-10-26)
* (asgothian) fix bug #2640
*

### 3.2.0 (2025-10-26)
* (asgothian) remove local overrides tab from config
* (asgothian) establish local data tab in config to edit global and device level settings and options
* (asgothian) remove the local overrides tab
* (asgothian) remove the ability to set model level overrides from device tab.
* (asgothian) fix errors for 'polling' devices with changed poll times.
* (asgothian) warning icon for devices which are not completely interviewed.
* (asgothian) improved router detection for opening the network
* (asgothian) bugfix: open network on router
* (asgothian) ZHC 25.x latest, ZH 6.1.3,
* (asgothian) restore from in-adapter backup

### 3.1.6 (2025-10-21)
* (asgothian) Bugfixes
*

### 3.1.5 (2025-10-04)
* (asgothian) Bugfixes
* (asgothian) ZHC25.36.0
* (asgothian) reduced stopTimeout to 5s

### 3.1.4 (2025-09-26)
* (asgothian) Remove extra logging
* (asgothian) Add extra configurations
* (asgothian) Do not read states from deactivated devices
* (asgothian) Ignore deactivated devices for group state updates
* (asgothian) Change display for deactivated devices in the object tree (gray, no connected icon)
* (asgothian) more detailed device debug
* (asgothian) device debug UI improvements
* (asgothian) Pairing and device Query buttons on router cards
* (asgothian) ZHC 25.31.0, ZH 6.1.2 or newer
* (asgothian) Options based on ZHC defined options

### 3.1.2 (2025-09-15)
* (asgothian) Fix pairing bug
* (asgothian) add ping messages to device debug to verify ping failure reasons
* (asgothian) Fix bug that blocked group names and renaming
* (asgothian) removed extra warning message for resolveEntity

### 3.1.1 (2025-09-14)
* (asgothian) ZHC 25.x ZH 6.x
* (asgothian) Refactor main/statescontroller/zigbeecontroller
* (asgothian) Allow groups to trigger member state reads (via state memberupdate)
* (asgothian) Allow groups to set state based on accumulated member states (via state stateupdate)
* (asgothian) Trigger state read at device announce (via Settings: Read states at device announce)
* (asgothian) Trigger state read at adapter start for all pingable devices (via settings: 'try to read all states at adapter start' and 'read delay' (in seconds))
* (asgothian) Bugfix: Error in automatic restart function
* (asgothian) Bugfix: Error in device_query blocked certain states from being read
* (asgothian) Change to device Query: 15 second delay between queries only for automated queries. Manual queries are not affected

### 3.1.0 (2025-08-02)
* (asgothian) ZHC 24.9.0
* (asgothian) ZH 5.x
* (asgothian) extend and stop pairing countdown

### 3.0.5 (2025-08-27)
* (asgothian) fix random error where devices are not shown due to illegal groups
* (asgothian) drop support for node 18
* (asgothian) Required node Versions Node 20.19.0 or 22.11.0 or newer (courtesy of ZH 4.4.1 / ZHC 24.8.0)

### 3.0.3 (2025-07-27)
* (asgothian) fix 'icon' error for unknown devices
* (asgothian) fix state for level.color.rgb role (hex_color, accepts only #rrggbb values
* (asgothian) ZH 4.4.1
* (asgothian) ZHC 23.72.1
* (asgothian) preparation for breaking change in ZHC 24.0.0

### 3.0.2 (2025-07-07)
* (asgothian) fix images

### 3.0.1 (2025-04-25)
* (AlexHaxe)  Fix for Ikea SOMRIG configuration raising 'definition.endpoint is not a function' error.
* (asgothian) Access to 'zigbee2mqtt options as settings in zigbee adapter (ALPHA Stage !)
* (asgothian) Fix for 'error: zigbee.0 (1118300) zigbee.0 already running' at adapter start (Alpha Stage)
* (asgothian) Updated hardware configuration panel - exchanged text buttons for buttons with icons.
* (asgothian) Limited states on device tiles to states which are read only or which can be modified sensibly via the device tile.
*

### 3.0.0 (2025-04-08)
* (asgothian) Breaking change: Start of zigbee subsystem requires checking the 'start the Zigbee network automatically' checkbox. !!!
* (asgothian) Hardware configuration panel
* (asgothian) Update for external converter - detect /dist/ subfolder
* (asgothian) Update device image: use of icons defined in external converter (beta)
*

### 2.0.5 (2025-03-25)
* (asgothian) ZHC 23.6.0
* (asgothian) ZH 3.3.x
* (asgothian) removed extra logging
* (asgothian) fixed memory issue.
* (asgothian) Configure on Message - 5 attempts.
* (arteck) update transmitPower
* (asgothian) fix crash in ZigbeeController.ByteArrayToString
* (AlexHaxe) device designation for  devices without mapped model (allows use in groups and bindings)
*

### 2.0.4 (2025-03-09)
* (arteck) back to 2.0.2

### 2.0.3 (2025-03-07)
* (asgothian) fix configured info
* (asgothian) fix battery voltage (V -> mV)
* (asgothian) enable debug interface v1.0
* (asgothian) Push Zigbee-Herdsman to 2.5.7
* (asgothian) Push Zigbee-Herdsman-Converters to 23.1.1
* (asgothian) fix configure on message
* (asgothian) remove extra warning messages
* (asgothian) fix Adapter-Checker notes
* (asgothian) improve base64 image detection
* (asgothian) removed unused adaptert objects (info.groups, excludes) from adapter config

### 2.0.2 (2025-03-02)
* (asgothian)  expose generation with expose function requiring a device. (Issue #1842)
* (asgothian) fix failure to configure for devices needing multiple configurations (Issue #2375)
* (asgothian) fix hold/release and press/release action handling (Issue #2387)
* (asgothian) fix lib/legacy requirement for external converters (Issue #2376)
* (asgothian) improved external converter handling
* (asgothian) fix OTA bug
* (asgothian) improved message handling for devices which report values outside their defined ranges
* (asgothian) preparation for ZHC 22.x (model definition loaded on demand
* (asgothian) fix legacy definition for devices
* (asgothian) added action state for remotes.
*

### 2.0.1 (2025-02-25)
* BREAKING CHANGES
*
* switch to converters 21 changes the exposes for a large numbern of devices (mostly remotes)
* new method for controlling color based on subchannels for rgb, hs and xy
* Exposes as default for ALL devices. Use of old definition as option only
* Requires Node 20.x or newer
*
* (asgothian) Fix Pairing
* (asgothian) change ping
* (asgothian) delay map generation until refresh is activated, map messages after generation
* (asgothian) remove bindings tab from zigbee tab
* (asgothian) reorder tabs in configuration
* (asgothian) remove binding tab from configuration
* (asgothian) remove map from configuration
* (asgothian) add debug to zigbee tab
* (asgothian) Herdsman 3.2.5, Converters 21.30.0
* (asgothian) Exposes as default, use of old device definitions as legacy optional
* (asgothian) User specific images (model based, device based)
* (asgothian) Improved group editing - remove members from group card

### 1.10.14 (2025-01-01)
* (arteck) Herdsman 2.1.9, Converters 20.58.0
* (asgothian) Fix: Aqara T1M (CL-L02D)
* (arteck) deleteDeviceStates change to deleteObj

### 1.10.13 (2024-11-10)
* (arteck) corr icon download bug (axios)

### 1.10.12 (2024-11-03)
* (asgothian) corr Channel Scan

### 1.10.11 (2024-11-02)
* BREAKING CHANGE
*
*  bugs : ChannelScan is currently not available
*
*
* (lebrinkma) fix linter errors
* (asgothian) disable map display for deactivated devices
* (asgothian) new option on map: disable physics interaction
* (asgothian) new zigbee-herdsman-converters 20.28.0
* (asgothian) new zigbee-herdsman 2.1.1
* (asgothian) Allow use of keyless converters (used for TuYa and compatible devices in zigbee-herdsman-converters
* (arteck) swap from request to axios
* (arteck) delete groups works again

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
* (arteck) Baudrate is now configurable. works ONLY with Deconz/Conbee(38400)
* (arteck) add nvbackup.json delete button

### 1.10.0 (2024-01-13)
* (arteck) new zigbee-herdsman-converters 18.x
* (arteck) configure message is now a warning

 ***********************************************

### 1.0.0 (2020-01-22)
* Powered by new [zigbee-herdsman](https://github.com/Koenkk/zigbee-herdsman) library and new [converters database](https://github.com/Koenkk/zigbee-herdsman-converters)
* Drop support NodeJS 6
* Serialport 8.0.5 (in zigbee-herdsman)
* More new devices
* Some design update
* Binding


------------------------------------------------------------------------------
