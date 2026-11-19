'use strict';

/**
 * The answer of the message 'help': what the instance answers, written for AI agents (e.g. ioBroker.pi-agent or
 * the MCP server with send_to) and script authors. Keep it in sync with the message handlers in main.js,
 * lib/plugin*.js and the device manager (@iobroker/dm-utils).
 */

/** Every command the adapter answers; write = the command changes something */
const COMMANDS = [
    { command: 'help', write: false },
    { command: 'letsPairing', write: true },
    { command: 'getDevices', write: false },
    { command: 'getDevice', write: false },
    { command: 'getMap', write: false },
    { command: 'renameDevice', write: true },
    { command: 'checkOtaAvail', write: false },
    { command: 'startOta', write: true },
    { command: 'reconfigure', write: true },
    { command: 'deleteZigbeeDevice', write: true },
    { command: 'backup', write: true },
    { command: 'listbackups', write: false },
    { command: 'restore', write: true },
    { command: 'deleteNVBackup', write: true },
    { command: 'readNVRam', write: false },
    { command: 'SendToDevice', write: true },
    { command: 'getGroups', write: false },
    { command: 'renameGroup', write: true },
    { command: 'deleteGroup', write: true },
    { command: 'updateGroupMembership', write: true },
    { command: 'touchlinkReset', write: true },
    { command: 'setDeviceActivated', write: true },
    { command: 'getCoordinatorInfo', write: false },
    { command: 'reset', write: true },
    { command: 'setState', write: true },
    { command: 'syncGroups', write: true },
    { command: 'testConnect', write: true },
    { command: 'testConnection', write: false },
    { command: 'getChannels', write: false },
    { command: 'modifyDeviceStates', write: true },
    { command: 'setDeviceDebug', write: true },
    { command: 'getDebugDevices', write: false },
    { command: 'getDebugMessages', write: true },
    { command: 'getNamedColors', write: false },
    { command: 'getLocalImages', write: false },
    { command: 'updateDeviceImage', write: true },
    { command: 'updateLocalConfigItems', write: true },
    { command: 'getLocalConfigItems', write: false },
    { command: 'getDeviceCleanupRequired', write: false },
    { command: 'downloadIcons', write: true },
    { command: 'aliveCheck', write: false },
    { command: 'clearErrors', write: true },
    { command: 'getJoinBlocklist', write: false },
    { command: 'updateJoinBlocklist', write: true },
    { command: 'addBinding', write: true },
    { command: 'editBinding', write: true },
    { command: 'getBinding', write: false },
    { command: 'delBinding', write: true },
    { command: 'delHerdsmanBinding', write: true },
    { command: 'getHerdsmanBindings', write: false },
    { command: 'sendToZigbee', write: true },
    { command: 'getLibData', write: false },
    { command: 'listUart', write: false },
    { command: 'dm:instanceInfo', write: false },
    { command: 'dm:loadDevices', write: false },
    { command: 'dm:deviceInfo', write: false },
    { command: 'dm:deviceStatus', write: false },
    { command: 'dm:deviceDetails', write: false },
    { command: 'dm:instanceAction', write: true },
    { command: 'dm:deviceAction', write: true },
    { command: 'dm:deviceControl', write: true },
    { command: 'dm:deviceControlState', write: false },
    { command: 'dm:deviceLoadProgress', write: false },
    { command: 'dm:actionProgress', write: true },
];

const HELP = `ioBroker.zigbee: connects Zigbee devices through a coordinator (USB stick or network adapter). Every device
is the object zigbee.0.<ieee> (ieee = 16 hex digits of its IEEE address, e.g. 00158d0001a2b3c4), every group
zigbee.0.group_<number>; their values and commands are the states below it. To switch a device write its states
(e.g. zigbee.0.<ieee>.state, .brightness); the commands pair, list, rename, update and maintain the devices.
id / devId in the commands: the object ID zigbee.0.<ieee>. Most commands need the running Zigbee network, else
they answer {error} or nothing. Send at least {} as message.

Commands (sendTo zigbee.0):
- letsPairing {stop?, id?, code?}: opens the network for new devices for the pairing time of the settings (default
  60 s; each call starts it again); stop true closes it. id = a router: join only through it. code = the install
  code (QR code) of a device that needs one. Answers only an error ({error}), no answer on success: then
  info.pairingMode is true, info.pairingCountdown counts the seconds, info.pairingMessage tells what joined.
- getDevices {}: all devices and groups: {devices: [{_id, common: {name, type (the model)}, rooms, vendor,
  link_quality, battery, statesDef: [{id, name, type, val, unit, write}], info: {device: {ieee, type (Router,
  EndDevice), power, interviewstate}, mapped: {model, vendor, description}}, groups}], ...}; large (all states).
- getDevice {id}: the same for one device: {devices: [that device]}.
- getMap {rebuild?}: the network map built last: {lqis: [{parent, ieeeAddr, lqi, relationship, depth, status}],
  routing: [{source, destination, nextHop, status}], errors, timestamp}. rebuild true builds a new one (minutes:
  asks every router) and answers the old one; with no map yet there is no answer: ask again later without rebuild.
- renameDevice {id, name}: renames a device or group (also its object); an empty name restores the model: {}.
- checkOtaAvail {devId}: asks the device for a firmware update: {status: available, not_available, not_supported
  or fail, device, msg?}; no answer while a check or update of it runs.
- startOta {devId}: installs the update that checkOtaAvail reported as available; the answer {status: success or
  fail, msg} comes when it is done (it can take an hour, the call may time out before; the device must keep
  power and stay reachable). An empty answer: an update of it runs already, or it is deactivated or unavailable.
- reconfigure {id}: configures the device again (reporting and bindings of its definition): {} or {error}.
- deleteZigbeeDevice {id, force?}: removes the device from the network and deletes its objects; force true also
  removes it if it does not answer (a still paired device may come back): {} or {error}.
- backup {}: saves the Zigbee database, the NV backup and the local data as backup_<date>.tar.gz in the data folder
  (answers the message back; no answer if backups are disabled). listbackups {}: {files: [names, newest first]}.
  restore {name (from listbackups)}: stops Zigbee, unpacks that backup over the current files, starts again: {} or
  {error}.
- deleteNVBackup {}: deletes the NV backup (the network parameters saved from the coordinator): {} or {error}.
  readNVRam {}: the network parameters from it: {channel, panID, extPanID, precfgkey (the network key)}.
- SendToDevice {device, payload, endpoint?, options}: sends values through the converters, also options that are no
  states. device = the bare <ieee>, payload in zigbee2mqtt terms, e.g. {"state": "ON", "brightness": 200};
  options = {} (needed in this version): {success, error?}.
- getGroups {}: {groups: {<number>: name}}. renameGroup {id: number, name}: creates or renames a group (no answer).
  deleteGroup: the message is the group number (no answer). updateGroupMembership {id, groups: {<endpoint>:
  [group numbers; negative = remove]}}: {} or {error}.
- touchlinkReset {}: resets a Touchlink device (e.g. a bulb) close to the coordinator to factory settings and
  opens the network.
- setDeviceActivated {id, deactivated}: true deactivates the device (no communication), false activates it.
- getCoordinatorInfo {}: {type, revision, version, channel, port, ieee, herdsman, converters, installedVersion}.
- reset {mode: soft or hard}: restarts the coordinator.
- setState, syncGroups, testConnect, testConnection, getChannels, modifyDeviceStates, setDeviceDebug,
  getDebugDevices, getDebugMessages, getNamedColors, getLocalImages, updateDeviceImage, updateLocalConfigItems,
  getLocalConfigItems, getDeviceCleanupRequired, downloadIcons, aliveCheck, clearErrors, getJoinBlocklist,
  updateJoinBlocklist, addBinding, editBinding, getBinding, delBinding, delHerdsmanBinding, getHerdsmanBindings,
  sendToZigbee, getLibData, listUart, dm:instanceInfo, dm:loadDevices, dm:deviceInfo, dm:deviceStatus,
  dm:deviceDetails, dm:instanceAction, dm:deviceAction, dm:deviceControl, dm:deviceControlState,
  dm:deviceLoadProgress, dm:actionProgress: for the settings, the admin tab and the device manager, not for agents.

States (zigbee.0.*): <ieee>.available (reachable), <ieee>.link_quality, <ieee>.battery; info.connection
(coordinator connected), info.pairingMode / pairingCountdown / pairingMessage, info.ota (true checks every
device for firmware updates), info.ota_available (JSON list of <ieee> with an update; writing a list starts them).

How to talk to the user:
- Name devices by name and room (getDevices), not by IEEE address; times in local time.
- Pairing: ask which device; after letsPairing tell the user to put it into pairing mode now (see its manual,
  often holding a button or switching it on and off) and how long the network stays open.
- deleteZigbeeDevice, restore, deleteNVBackup, backup, startOta, reset, touchlinkReset, renameGroup, deleteGroup,
  updateGroupMembership and setDeviceActivated change the network: only on the user's explicit request, after
  naming the device. Warn before startOta that it takes long and the device must not lose power.
- Never repeat the network key (precfgkey) unless the user asks for exactly that.`;

module.exports = { HELP, COMMANDS };
