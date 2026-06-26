/**
 *
 * Zigbee devices adapter
 *
 */
'use strict';

let debug;
try {
    debug = require('zigbee-herdsman/node_modules/debug');
} catch (e) {
    debug = undefined;
}
const originalLogMethod = debug ? debug.log : undefined;

// node components
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const util = require('node:util');
const dns = require('node:dns');
const net = require('node:net');

// own components
const safeJsonStringify = require('./lib/json');
// plugins
const SerialListPlugin = require('./lib/seriallist');
const CommandsPlugin = require('./lib/commands');
const GroupsPlugin = require('./lib/groups');
const NetworkMapPlugin = require('./lib/networkmap');
const DeveloperPlugin = require('./lib/developer');
const BindingPlugin = require('./lib/binding');
const OtaPlugin = require('./lib/ota');
const BackupPlugin = require('./lib/backup');
// libraries
const utils = require('./lib/utils');
const dmZigbee  = require('./lib/devicemgmt.js');
const DeviceDebug = require('./lib/DeviceDebug');
const localConfig = require('./lib/localConfig');
const ZigbeeController = require('./lib/zigbeecontroller');
const StatesController = require('./lib/statescontroller');

// ioroker components
const adapterCore = require('@iobroker/adapter-core'); // Get common adapter utils
const disallowedDashStates = [
    'link_quality', 'available', 'battery', 'groups', 'device_query',
    'hue_move', 'color_temp_move', 'satuation_move', 'brightness_move', 'brightness_step', 'hue_calibration',
    'msg_from_zigbee', 'send_payload',
];
const modelDefinitions = require('./lib/models.js');


// ZH / ZHC
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const zigbeeHerdsmanConvertersPackage = require('zigbee-herdsman-converters/package.json')
const zigbeeHerdsmanPackage = require('zigbee-herdsman/package.json')


const createByteArray = function (hexString) {
    const bytes = [];
    for (let c = 0; c < hexString.length; c += 2) {
        bytes.push(parseInt(hexString.substr(c, 2), 16));
    }
    return bytes;
};

const E_INFO  = 1;
const E_DEBUG = 2;
const E_WARN  = 3;
const E_ERROR = 4;

const errorCodes = {
    9999: {severity: E_INFO, message: 'No response'},
    233: {severity: E_DEBUG, message: 'MAC NO ACK'},
    205: {severity: E_WARN, message: 'No network route'},
    134: {severity: E_WARN, message: 'Unsupported Attribute'},
};

function isFunction(functionToCheck) {
    return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

class Zigbee extends adapterCore.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super(Object.assign(options ?? {}, {
            dirname: __dirname.indexOf('node_modules') !== -1 ? undefined : __dirname,
            name: 'zigbee',
            systemConfig: true,
        }));
        this.zhversion = zigbeeHerdsmanPackage ? zigbeeHerdsmanPackage.version : 'unknown';
        this.zhcversion = zigbeeHerdsmanConvertersPackage ? zigbeeHerdsmanConvertersPackage.version : 'unknown';
        this.on('ready', () => this.onReady());
        this.on('unload', callback => this.onUnload(callback));
        this.on('message', obj => this.onMessage(obj));
        this.uploadRequired = false;

        this.query_device_block = [];
        this.localConfig = new localConfig(this);

        this.stController = new StatesController(this);
        this.stController.on('log', this.onLog.bind(this));
        this.stController.on('acknowledge_state', this.acknowledgeState.bind(this));

        this.deviceManagement = new dmZigbee(this);
        this.deviceDebug =  new DeviceDebug(this);
        this.deviceDebug.on('log', this.onLog.bind(this));
        this.debugActive = true;
        this.onreadycount = 1;

        this.plugins = [
            new SerialListPlugin(this),
            new CommandsPlugin(this),
            new GroupsPlugin(this),
            new NetworkMapPlugin(this),
            new DeveloperPlugin(this),
            new BindingPlugin(this),
            new OtaPlugin(this),
            new BackupPlugin(this),
        ];
    }

    async onMessage(obj) {
        if (typeof obj === 'object' && obj.command) {
            switch (obj.command) {
                case 'SendToDevice': {
                    let rv = {
                        success: false,
                        loc: -1,
                    };

                    try {
                        rv = await this.sendPayload(obj.message);
                    } catch (e) {
                        rv.error = e;
                    }

                    this.sendTo(obj.from, obj.command, rv, obj.callback);
                    break;
                }
            }
        }
    }

    sendError(error, message) {
        /* try {
            if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
                const sentryInstance = this.getPluginInstance('sentry');
                if (sentryInstance) {
                    const Sentry = sentryInstance.getSentryObject();
                    if (Sentry) {
                        if (message) {
                            Sentry && Sentry.withScope(scope => scope.addBreadcrumb({
                                type: 'error', // predefined types
                                category: 'error message',
                                level: 'error',
                                message
                            }));
                        }
                        if (typeof error == 'string') {
                            Sentry.captureException(new Error(error));
                        } else {
                            Sentry.captureException(error);
                        }
                    }
                }
            }
        } catch (err) {
            this.log.error(`SentryError : ${message} ${error} ${err} `);
        } */
    }

    filterError(errormessage, message, error) {
        if (error != null && error.code == undefined) {
            let em = error.stack.match(/failed \((.+?)\) at/);
            em = em || error.stack.match(/failed \((.+?)\)/);
            this.log.error(`${message} no error code (${(em ? em[1] : 'undefined')})`);
            this.sendError(error, `${message} no error code`);
            if (this.debugActive) this.log.debug(`Stack trace for ${em}: ${error.stack}`);
            return;
        }

        const ecode = errorCodes[error.code];
        if (ecode === undefined) {
            this.log.error(errormessage);
            this.sendError(error, errormessage);
            return;
        }

        switch (ecode.severity) {
            case E_INFO:
                this.log.info(`${message}: Code ${error.code} (${ecode.message})`);
                break;
            case E_DEBUG:
                if (this.debugActive) this.log.debug(`${message}: Code ${error.code} (${ecode.message})`);
                break;
            case E_WARN:
                this.log.warn(`${message}: Code ${error.code} (${ecode.message})`);
                break;
            case E_ERROR:
                this.log.error(`${message}: Code ${error.code} (${ecode.message})`);
                this.sendError(error, `${message}: Code ${error.code} (${ecode.message})`);
                break;
            default:
                this.log.error(`${message}: Code ${error.code} (malformed error)`);
                this.sendError(error, `${message}: Code ${error.code} (malformed error)`);
                break;
        }
    }

    debugLog(data, ...args) {
        const message = (args) ? util.format(data, ...args) : data;
        if (this.debugActive) this.log.debug(message.slice(message.indexOf('zigbee-herdsman')));
    }

    async onReady() {

        const dbActive = await this.getForeignState(`system.adapter.${this.namespace}.logLevel`);
        this.debugActive = (dbActive && dbActive.val === 'debug');
        this.log.info('Adapter ready - starting subsystems. Adapter is running in '+dbActive.val+ ' mode.');
        if (this.config.debugHerdsman) {
            if (debug) {
                this.log.warn('Activating zigbee-herdsman debug connection - successful');
                debug.log = this.debugLog.bind(this);
                debug.enable('zigbee-herdsman*');
            }
            else {
                this.log.warn('Activating zigbee-herdsman debug connection - failed: debug library not available');
            }
        }
        // external converters
        this.applyExternalConverters();

        this.subscribeStates('*');
        this.subscribeForeignStates(`system.adapter.${this.namespace}.logLevel`)
        // set connection false before connect to zigbee
        this.setState('info.connection', false, true);
        const zigbeeOptions = this.getZigbeeOptions();
        this.zbController = new ZigbeeController(this);

        this.zbController.on('log', this.onLog.bind(this));
        this.zbController.on('ready', this.onZigbeeAdapterReady.bind(this));
        this.zbController.on('disconnect', this.onZigbeeAdapterDisconnected.bind(this));
        this.zbController.on('new', this.newDevice.bind(this));
        this.zbController.on('leave', this.stController.leaveDevice.bind(this.stController));
        this.zbController.on('announce', this.stController.announceDevice.bind(this));
        this.zbController.on('pairing', this.onPairing.bind(this));
        this.zbController.on('event', this.stController.onZigbeeEvent.bind(this.stController));
        this.zbController.on('msg', this.stController.onZigbeeEvent.bind(this.stController));
        this.zbController.on('publish', this.stController.publishToState.bind(this.stController));
        this.stController.on('send_payload', this.zbController.publishPayload.bind(this.zbController));
        this.stController.on('zb_devicecommand', this.zbController.zbDeviceCommand.bind(this.zbController));
        this.stController.on('changed', this.zbController.publishFromState.bind(this.zbController));
        this.zbController.on('resend_states', this.stController.handleStateResend.bind(this.stController));
        this.stController.on('device_query', this.zbController.deviceQuery.bind(this.zbController));
        this.zbController.on('acknowledge_state', this.acknowledgeState.bind(this));
        this.zbController.on('stash_error', this.stController.stashErrors.bind(this.stController));
        this.zbController.on('stash_unknown_model', this.stController.stashUnknownModel.bind(this.stController));

        this.zbController.configure(zigbeeOptions);
        this.zbController.debugActive = this.debugActive;
        this.stController.debugActive = this.debugActive;
        await this.callPluginMethod('configure', [zigbeeOptions]);

        // elevated debug handling
        this.deviceDebug.start(this.stController, this.zbController);
        this.reconnectDelay =  this.config.reconnectDelay || 10;

        this.reconnectCounter = this.config.reconnectCount;
        if (this.config.autostart) {
            this.log.info('Autostart Zigbee subsystem');
            this.doConnect();
        }
        else this.log.warn('Zigbee autostart option not set - omitting start of zigbee subsystem!');
    }
    updateDebugLevel(state) {
        const dbActive = state === 'debug';
        this.debugActive = dbActive;
        this.stController.debugActive = dbActive;
        this.zbController.debugActive = dbActive;
        this.log.info('Change of log level while running to ' + state);
    }

    sandboxAdd(sandbox, item, module, isNamed) {
        const multipleItems = item.split(',');
        const message = `Adding code from '${module}'`;
        if (!module.match(new RegExp(`/${sandbox.zhclibBase}/`)))
            module = module.replace(/zigbee-herdsman-converters\//, `${sandbox.zhclibBase}/`);
        try {
            const m = require(module);
            for(const singleItem of multipleItems) {
                const sti = singleItem.trim();
                if (m.hasOwnProperty(sti)) {
                    sandbox[sti] = m[sti];
                    if (m[sti]) {
                        if (isFunction(m[sti])) this.log.info(`Adding code from '${module}' as '${sti}' (function) to sandbox -- success`)
                        else this.log.info(`Adding code from '${module}' as '${sti}' (${typeof m[sti]} to sandbox -- success`);
                    }
                    else this.log.info(`Adding code from '${module}' as '${sti}' (undefined) to sandbox -- possible failure`);
                }
                else {
                    sandbox[sti] = m;
                    if (m) this.log.info(`Adding '${module}' as ${sti} (${typeof m}) toi sandbox -- success`);
                    else this.log.info(`Adding '${module}' as ${sti} (undefined) to sandbox -- possiblefailure`);
                }
            }
        }
        catch (error) {
            this.log.warn(`${message} -- failed: ${error && error.message ? error.message : 'no reason given'}`);
        }
    }

    SandboxRequire(sandbox, items, isNamed) {
        if (!items) return true;
        for (const item of items) {
            const modulePath = item[2].replace(/['"]/gm, '');

            const ZHCComponentMatch = modulePath.match(/\/(lib|converters|devices)\/(.+)/)

            if (ZHCComponentMatch) {
                const fullModulePath = '.' + path.sep + path.join('.',sandbox.zhclibBase, ZHCComponentMatch[1], ZHCComponentMatch[2]);
                this.sandboxAdd(sandbox, item[1], fullModulePath, isNamed);
                continue;
            }
            this.sandboxAdd(sandbox, item[1], modulePath);

        }
        return true;
    }

    checkExternalConverterExists(fn) {
        if (fs.existsSync(fn)) return fn;
        const fnD = this.expandFileName(fn)
        if (fs.existsSync(fnD)) return fnD;
        const fnL = path.join('converters', fn)
        if (fs.existsSync(fnL)) return fnL;
        this.log.error(`unable to load ${fn} - checked ${path.resolve(fn)}, ${path.resolve(fnD)} and ${path.resolve(fnL)}`);
        return false;
    }



    * getExternalDefinition() {

        if (this.config.external === undefined) {
            return;
        }
        const zhcPackageFn = require.resolve('zigbee-herdsman-converters/package.json');
        const zhcBaseDir = path.relative('.',path.dirname(zhcPackageFn));
        const extfiles = this.config.external.split(';');
        for (const moduleName of extfiles) {
            if (!moduleName) continue;
            const ZHCP = zigbeeHerdsmanConvertersPackage;
            const sandbox = {
                require,
                module: {},
                zhclibBase : path.join(zhcBaseDir,(ZHCP && ZHCP.exports && ZHCP.exports['.'] ? path.dirname(ZHCP.exports['.']) : ''))
            };

            const mN = this.checkExternalConverterExists(moduleName.trim());

            if (mN) {
                const converterCode = fs.readFileSync(mN, {encoding: 'utf8'}).toString();
                let converterLoaded = true;
                let modifiedCode = converterCode.replace(/\s+\/\/.+/gm, ''); // remove all lines starting with // (with the exception of the first.)
                modifiedCode = modifiedCode.replace(/^\/\/.+/gm, ''); // remove the fist line if it starts with //

                converterLoaded &= this.SandboxRequire(sandbox,[...modifiedCode.matchAll(/import\s+\*\s+as\s+(\S+)\s+from\s+(\S+);/gm)]);
                modifiedCode = modifiedCode.replace(/import\s+\*\s+as\s+\S+\s+from\s+\S+;/gm, '')

                converterLoaded &= this.SandboxRequire(sandbox,[...modifiedCode.matchAll(/import\s+\{(.+)\}\s+from\s+(\S+);/gm)], true);
                modifiedCode = modifiedCode.replace(/import\s+\{.+\}\s+from\s+\S+;/gm, '');

                converterLoaded &= this.SandboxRequire(sandbox,[...modifiedCode.matchAll(/import\s+(.+)\s+from\s+(\S+);/gm)]);
                modifiedCode = modifiedCode.replace(/import\s+.+\s+from\s+\S+;/gm, '');

                converterLoaded &= this.SandboxRequire(sandbox,[...modifiedCode.matchAll(/const\s+\{(.+)\}\s+=\s+require\((.+)\)/gm)], true);
                modifiedCode = modifiedCode.replace(/const\s+\{.+\}\s+=\s+require\(.+\)/gm, '');

                converterLoaded &= this.SandboxRequire(sandbox,[...modifiedCode.matchAll(/const\s+(\S+)\s+=\s+require\((.+)\)/gm)]);
                modifiedCode = modifiedCode.replace(/const\s+\S+\s+=\s+require\(.+\)/gm, '');

                for(const component of modifiedCode.matchAll(/const (.+):(.+)=/gm)) {
                    modifiedCode = modifiedCode.replace(component[0], `const ${component[1]} = `);
                }
                modifiedCode = modifiedCode.replace(/export .+ +/gm, 'module.exports = ');

                if (modifiedCode.indexOf('module.exports') < 0) {
                    converterLoaded = false;
                    this.log.error(`converter does not export any converter array, please add 'module.exports' statement to ${mN}`);
                }
                if (converterLoaded) {
                    try {
                        this.log.warn('Trying to run sandbox for ' + mN);
                        vm.runInNewContext(modifiedCode, sandbox);
                        const sandboxResult = sandbox.module.exports;
                        const converter = Array.isArray(sandboxResult) ? sandboxResult : [sandboxResult];

                        for (const item of converter) {
                            if (item.hasOwnProperty('icon')) {
                                if (!item.icon.toLowerCase().startsWith('http') && !item.useadaptericon)
                                    item.icon = path.join(path.dirname(mN), item.icon);
                            }
                            const rtz = utils.removeFromArray(item.toZigbee);
                            const rfz = utils.removeFromArray(item.fromZigbee);
                            const rtzfzmsg = [];
                            if (rtz) rtzfzmsg.push(`${rtz} unknown entr${rtz>1?'ies' : 'y'} in toZigbee`);
                            if (rfz) rtzfzmsg.push(`${rfz} unknown entr${rtz>1?'ies' : 'y'} in fromZigbee`);
                            this.log.info(`Model ${item.model} defined ${rtz+rfz ? 'with '+ rtzfzmsg.join(' and ') + ' ' : ''}in external converter ${mN}`);
                        }
                        yield converter;
                    }
                    catch (e) {
                        this.log.error(`Unable to apply converter from module: ${mN} - the code does not run: ${e}`);
                    }
                }
                else
                    this.log.info(`Ignoring converter from module: ${mN} - see warn messages for reason`);

            }
        }
    }

    applyExternalConverters() {
        for (const definition of this.getExternalDefinition()) {
            const toAdd = definition;
            try {
                for (const item of toAdd) {
                    delete item['homeassistant'];
                    const t = Date.now();
                    if (zigbeeHerdsmanConverters.hasOwnProperty('addExternalDefinition')) {
                        zigbeeHerdsmanConverters.addExternalDefinition(item);
                        this.log.info(`added external converter using addExternalDefinition (${Date.now()-t} ms)`)
                    }
                    else if (zigbeeHerdsmanConverters.hasOwnProperty('addDefinition')) {
                        zigbeeHerdsmanConverters.addDefinition(item);
                        this.log.info(`added external converter using addDefinition (${Date.now()-t} ms)`);
                    }
                }
            } catch (e) {
                this.log.error(`unable to apply external converter for ${JSON.stringify(toAdd.model)}: ${e && e.message ? e.message : 'no error message available'}`);
            }
        }
    }

    async testConnect(message) {
        const response = {};
        if (this.reconnectTimer) this.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        const zo = message?.zigbeeOptions ?? {};
        if (message.start) {
            try {
                const keys = Object.keys(zo);
                if (keys) {
                    this.logToPairing(`overriding zigbee options with:`);
                    for (const k of keys) {
                        this.logToPairing(`${k} : ${zo[k]}`)
                    }
                }
                this.zbController.configure(this.getZigbeeOptions(zo));
                response.status = await this.doConnect(true);
                if (!response.status) response.error = { message: 'Unable to start the Zigbee Network. Please check the previous messages.'}
                return response;
            }
            catch (error) {
                try {
                    await this.zbController.stopHerdsman();
                }
                catch {
                    // intentionally empty
                }
                return { status:false, error };
            }
        }
        else try {
            await this.zbController.stopHerdsman();
            return { status:true };
        } catch (error) {
            return { status:true, error };
        }
    }

    async doConnect(noReconnect) {

        let debugversion = '';
        try {
            const DebugIdentify = require('./debugidentify');
            debugversion = DebugIdentify.ReportIdentifier();
        } catch {
            debugversion = 'npm ...';
        }

        // installed version
        let gitVers = '';
        try {
            if (noReconnect) this.logToPairing(`Starting Adapter ${debugversion}`);
            this.log.info(`Starting Adapter ${debugversion}`);

            const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            gitVers = (obj?.common?.installedFrom ?? 'unknown').replace('tarball', 'commint');
            if (noReconnect) this.logToPairing(`Installed Version: ${gitVers} (Converters ${zigbeeHerdsmanConvertersPackage.version} Herdsman ${zigbeeHerdsmanPackage.version})`);
            this.log.info(`Installed Version: ${gitVers} (Converters ${zigbeeHerdsmanConvertersPackage.version} Herdsman ${zigbeeHerdsmanPackage.version})`);
            const result = await this.zbController.start(noReconnect);
        } catch (error) {
            this.setState('info.connection', false, true);
            this.logToPairing(`Failed to start Zigbee: ${error && error.message ? error.message : 'no message given'}`)
            this.log.error(`Failed to start Zigbee: ${error && error.message ? error.message : 'no message given'}`);
            this.sendError(error, `Failed to start Zigbee`);
            if (noReconnect) return false;

            if (this.reconnectCounter > 0) {
                this.tryToReconnect();
            }
        }
        return true;
    }

    UploadRequired(status) {
        this.uploadRequired = (typeof status === 'boolean' ? status : this.uploadRequired) ;
        return status;
    }

    async onZigbeeAdapterDisconnected() {
        this.reconnectCounter = this.config?.reconnectCount ?? 5;
        this.reconnectDelay = this.config?.reconnectDelay ?? 10;
        this.log.error('Adapter disconnected, stopping');
        this.sendError('Adapter disconnected, stopping');
        this.setState('info.connection', false, true);
        await this.zbController.stop();
        await this.callPluginMethod('stop');
        this.log.warn('Adapter stopped');
        this.tryToReconnect();
    }

    async tryToReconnect() {
        this.reconnectTimer = this.setTimeout(async () => {
            try {
                const result = await this.testConnection(this.config.port)
                if (result.error) {
                    this.tryToReconnect();
                    return;
                }
                if (this.config.port.includes('tcp://')) {
                    // Controller connect though Wi-Fi.
                    // Unlikely USB dongle, connection broken may only cause user unplugged the dongle,
                    // Wi-Fi connected gateway is possible that device connection is broken caused by
                    // AP issue or Zigbee gateway power is turned off unexpectedly.
                    // So try to reconnect gateway every 10 seconds all the time.
                    this.log.info(`Try to reconnect.`);
                } else {
                    this.log.info(`Try to reconnect. ${this.reconnectCounter} attempts left`);
                    this.reconnectCounter -= 1;
                }
                this.doConnect();
            } catch (error) {
                this.log.warn(`error ${error?.message ?? 'unknown'} in tryToReconnect`);
                this.tryToReconnect();
            }
        }, this.reconnectDelay * 1000); // every 10 seconds
    }


    async testConnection(address, interactive) {

        function InteractivePairingMessage(msg, t) {
            if (interactive) t.logToPairing(msg);
            t.log.debug(msg);
        }

        this.log.debug(`Test connection for ${address}`);
        const strMsg = '';

        if (address) {
            const netAddress = utils.getNetAddress(address);
            if (netAddress && netAddress.host) {
                const netConnectPromise = new Promise((resolve) => {
                    InteractivePairingMessage(`attempting dns lookup for ${netAddress.host}`, this);
                    dns.lookup(netAddress.host, (err, ip, _) => {
                        if (err) {
                            resolve({error:`Unable to resolve name: ${err && err.message ? err.message : 'no message'}`});
                        }
                        InteractivePairingMessage(`dns lookup for ${address} produced ${ip}`, this );
                        const client = new net.Socket();
                        InteractivePairingMessage(`attempting to connect to ${ip} port ${netAddress.port ? netAddress.port : 80}`, this);
                        client.connect(netAddress.port, ip, () => {
                            client.destroy()
                            InteractivePairingMessage(`connected successfully to connect to ${ip} port ${netAddress.port ? netAddress.port : 80}`, this);
                            resolve({});
                        })
                        client.on('error', (error) => {
                            resolve({error:`unable to connect to ${ip} port ${netAddress.port ? netAddress.port : 80} : ${error && error.message ? error.message : 'no message given'}`});
                        });
                    })
                });
                return await netConnectPromise;
            }
            else
            {
                const serialConnectPromise = new Promise((resolve) => {
                    try {
                        const port =address.trim();
                        InteractivePairingMessage(`reading access rights for ${port}`, this);
                        fs.access(port, fs.constants.R_OK | fs.constants.W_OK, (error) => {
                            if (error) {
                                resolve({error:`unable to access ${port} : ${error && error.message ? error.message : 'no message given'}`});
                            }
                            InteractivePairingMessage(`read and write access available for ${port}`, this);
                            resolve({});
                        });
                    }
                    catch (error) {
                        resolve({error:`File access error: ${error && error.message ? error.message : 'no message given'}`});
                    }
                });
                return await serialConnectPromise;
            }
        }
        return {error: `missing parameter: address`};
    }

    async onZigbeeAdapterReady() {
        this.reconnectTimer && this.clearTimeout(this.reconnectTimer);
        this.log.info(`Zigbee started`);
        // https://github.com/ioBroker/ioBroker.zigbee/issues/668
        const extPanIdFix = this.config.extPanIdFix ? this.config.extPanIdFix : false;
        if (!extPanIdFix) {
            const configExtPanId = this.config.extPanID ? `0x${this.config.extPanID.toLowerCase()}` : '0xdddddddddddddddd';
            let networkExtPanId = (await this.zbController.herdsman.getNetworkParameters()).extendedPanID;
            let needChange = false;
            this.log.info(`Config value ${configExtPanId} : Network value ${networkExtPanId}`);
            const adapterType = this.config.adapterType || 'zstack';
            if (adapterType === 'zstack') {
                if (configExtPanId !== networkExtPanId) {
                    try {
                        // try to read from nvram
                        const result = await this.zbController.herdsman.adapter.znp.request(
                            1, // Subsystem.SYS
                            'osalNvRead',
                            {
                                id: 45, // EXTENDED_PAN_ID
                                len: 0x08,
                                offset: 0x00,
                            },
                            null, [
                                0, // ZnpCommandStatus.SUCCESS
                                2, // ZnpCommandStatus.INVALID_PARAM
                            ]
                        );
                        const nwExtPanId = `0x${result.payload.value.reverse().toString('hex')}`;
                        if (this.debugActive) this.log.debug(`Config value ${configExtPanId} : nw value ${nwExtPanId}`);
                        this.logToPairing(`Config value ${configExtPanId} : nw value ${nwExtPanId}`)
                        if (configExtPanId !== nwExtPanId) {
                            networkExtPanId = nwExtPanId;
                            needChange = true;
                        }
                    } catch (e) {
                        const msg = `Unable to apply ExtPanID changes: ${e}`;
                        this.log.error(msg);
                        this.logToPairing(msg)
                        needChange = false;
                    }
                } else {
                    needChange = true;
                }
            }
            if (needChange) {
                // need change config value and mark that fix is applied
                if (this.debugActive) this.log.debug(`Fix extPanId value to ${networkExtPanId}. And restart adapter.`);
                this.updateConfig({extPanID: networkExtPanId.substr(2), extPanIdFix: true});
            } else {
                // only mark that fix is applied
                if (this.debugActive) this.log.debug(`Fix without changes. And restart adapter.`);
                this.updateConfig({extPanIdFix: true});
            }
        }

        await this.setState('info.connection', true, true);

        for (const id of await this.syncAllDeviceStates(false)) {
            try {
                this.log.info(`removing object for device ${id} - it is no longer in the zigbee database`);
                await this.delObjectAsync(id.substring(2), { recursive:true })
            }
            catch {
                this.log.warn(`error removing ${id}`)
            }
        }

        this.stController.updateCoordinatorIEEE(await this.zbController.getCoordinatorIeee());

        await this.callPluginMethod('start', [this.zbController, this.stController]);
    }

    async syncDeviceState(device, rebuild) {
        if (rebuild) {
            const hM = await zigbeeHerdsmanConverters.findByDevice(device);
            await this.stController.AddModelFromHerdsman(device, hM ? hM.model : device.modelID);
        }
        // remove from the Adapter device list

        // if it has a mapped model - update its states
        const entity = await this.zbController.resolveEntity(device);
        if (entity) {
            const model = entity.mapped ? entity.mapped.model : entity.device.modelID;
            await this.stController.updateDev(utils.zbIdorIeeetoAdId(this, device.ieeeAddr, false), entity.name, model);
            await this.stController.syncDevStates(device, model);
        }
        else (this.log.debug('resolveEntity returned no entity'));

    }

    async syncAllDeviceStates(rebuildStates) {
        this.stController.CleanupRequired(false);
        if (rebuildStates) this.stController.clearModelDefinitions();
        const devicesFromObjects = (await this.getDevicesAsync()).filter(item => item.native.id.length ==16).map((item) => `0x${item.native.id}`);
        const devicesFromDB = this.zbController.getClientIterator(false);
        const promises = [];
        for (const device of devicesFromDB) {
            const idx = devicesFromObjects.indexOf(device.ieeeAddr);
            if (idx > -1) devicesFromObjects.splice(idx, 1);
            promises.push(this.syncDeviceState(device, rebuildStates));
        }
        Promise.allSettled(promises);
        // return the devices in the adapter namespace which do not link to an active zigbee device.
        return devicesFromObjects;
    }

    acknowledgeState(deviceId, model, stateDesc, value) {
        const stateId = `${utils.zbIdorIeeetoAdId(this, deviceId, true)}.${stateDesc.id}`;
        /*const stateId = (model === 'group' ?
            `${this.namespace}.group_${deviceId}.${stateDesc.id}` :
            `${this.namespace}.${deviceId.replace('0x', '')}.${stateDesc.id}`); */
        if (value === undefined) {
            try {
                this.getState(stateId, (err, state) => {
                    if (!err && state?.hasOwnProperty('val')) this.setState(stateId,  state.val, true)
                });
            }
            catch (error) {
                this.log.warn(`Error acknowledging ${stateId} without value: ${error && error.message ? error.message : 'no reason given'}`);
            }
        }
        else {
            try {
                this.setState(stateId, value, true);
            }
            catch (error) {
                this.log.warn(`Error acknowledging ${stateId} with value ${JSON.stringify(value)}: ${error && error.message ? error.message : 'no reason given'}`);
            }
        }
    }

    async sendPayload(payload) {
        return await this.zbController.publishPayload(payload);
    }


    async newDevice(entity) {

        const device = entity.device;
        const model = (entity.mapped) ? entity.mapped.model : device.modelID;
        this.log.debug(`New device event: ${safeJsonStringify(utils.entityData(entity))}`);
        if (!entity.mapped && !entity.device.interviewing) {
            const msg = `New device: '${device.ieeeAddr}' does not have a known model. please provide an external converter for '${device.modelID}'.`;
            this.log.warn(msg);
            this.logToPairing(msg, true);
        }
        await this.stController.AddModelFromHerdsman(entity.device, model)
        if (device) {
            this.getObjectAsync(utils.zbIdorIeeetoAdId(this, device.ieeeAddr, false), (_err, obj) => {
                if (!obj) this.logToPairing(`New device joined '${device.ieeeAddr}' model ${model}`, true);
            });
            const model = (entity.mapped) ? entity.mapped.model : entity.device.modelID;
            if (this.debugActive) this.log.debug(`new device ${device.ieeeAddr} ${device.networkAddress} ${model} `);
            await this.stController.updateDev(utils.zbIdorIeeetoAdId(this, device.ieeeAddr, false), entity.name, model);
            await this.stController.syncDevStates(device, model);
        }
    }

    /*

    leaveDevice(ieeeAddr) {
        if (this.debugActive) this.log.debug(`Leave device event: ${ieeeAddr}`);
        if (ieeeAddr) {
            const devId = zbIdorIeeetoAdId(this, ieeeAddr, false);
            if (this.debugActive) this.log.debug(`Delete device ${devId} from iobroker.`);
            this.stController.deleteObj(devId);
        }
    }

    */
    async callPluginMethod(method, parameters) {
        for (const plugin of this.plugins) {
            if (plugin[method]) {
                try {
                    if (parameters !== undefined) {
                        await plugin[method](...parameters);
                    } else {
                        await plugin[method]();
                    }
                } catch (error) {
                    if (error && !error.hasOwnProperty('code')) {
                        this.log.error(`Failed to call '${plugin.constructor.name}' '${method}' (${error.stack})`);
                        this.sendError(error, `Failed to call '${plugin.constructor.name}' '${method}'`);
                    }
                    throw error;
                }
            }
        }
    }

    /**
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            this.log.info(`Halting zigbee adapter. Restart delay is at least ${this.ioPack.common.stopTimeout / 1000} seconds.`)
            this.setState('info.connection', false, true);
            const chain = [];
            if (this.config.debugHerdsman) {
                if (debug) {
                    debug.disable();
                    debug.log = originalLogMethod;
                }
            }
            this.log.info('cleaning everything up');
            await this.callPluginMethod('stop');
            if (this.stController) chain.push(this.stController.stop());
            if (this.zbController) chain.push(this.zbController.stop());
            await Promise.all(chain);
            this.log.info('cleanup successful');
            callback();
        } catch (error) {
            if (error) {
                this.log.error(`Unload error (${error.stack})`);
            }
            this.sendError(error, `Unload error`);
            callback();
        }
    }

    getZigbeeOptions(overrideOptions) {
        const override = overrideOptions ?? {};
        // file path for db
        const dbDir = this.expandFileName('');

        if (this.systemConfig && !fs.existsSync(dbDir)) {
            try {
                fs.mkdirSync(dbDir);
            } catch (e) {
                this.log.error(`Cannot create directory ${dbDir}: ${e}`);
                this.sendError(`Cannot create directory ${dbDir}: ${e}`);
            }
        }
        const port = override.port ? override.port : this.config.port;
        if (!port) {
            this.log.error('Serial port not selected! Go to settings page.');
            this.sendError('Serial port not selected! Go to settings page.');
        }
        const panID = parseInt(override.panID ? override.panID : this.config.panID ? this.config.panID : 0x1a62);
        const channel = parseInt(override.channel ? override.channel : this.config.channel ? this.config.channel : 11);
        const precfgkey = createByteArray(override.precfgkey ? override.precfgkey : this.config.precfgkey ? this.config.precfgkey : '01030507090B0D0F00020406080A0C0D');
        const extPanId = createByteArray(override.extPanID ? override.extPanID : this.config.extPanID ? this.config.extPanID : 'DDDDDDDDDDDDDDDD').reverse();
        const adapterType = override.adapterType ? override.adapterType : this.config.adapterType || 'zstack';
        // https://github.com/ioBroker/ioBroker.zigbee/issues/668
        const extPanIdFix = this.config.extPanIdFix ? this.config.extPanIdFix : false;
        const baudRate = parseInt(override.baudRate ? override.baudRate : this.config.baudRate ? this.config.baudRate : 115200);

        const setRtscts = override.flowCTRL ? override.flowCTRL : this.config.flowCTRL ? this.config.flowCTRL : false;

        return {
            net: {
                panId: panID,
                extPanId: extPanId,
                channelList: [channel],
                precfgkey: precfgkey
            },
            sp: {
                port: port,
                baudRate: baudRate,
                rtscts: setRtscts,
                adapter: adapterType,
            },
            transmitpower: this.transmitPower,
            dbDir: dbDir,
            dbPath: 'shepherd.db',
            backupPath: 'nvbackup.json',
            localConfigPath: 'LocalOverrides.json',
            disableLed: this.config.disableLed,
            disablePing: (this.config.pingCluster=='off'),
            transmitPower: this.config.transmitPower,
            disableBackup: this.config.disableBackup,
            extPanIdFix: extPanIdFix,
            startWithInconsistent: override.startWithInconsistent ? override.startWithInconsistent: this.config.startWithInconsistent || false,
            availableUpdateTime:this.config.availableUpdateTime,
        };
    }

    onPairing(message, data) {
        if (Number.isInteger(data)) {
            this.setState('info.pairingCountdown', data, true);
        }
        if (data === 0) {
            // set pairing mode off
            this.setState('info.pairingMode', false, true);
        }
        if (data) {
            this.logToPairing(`${message}: ${typeof data === 'string' ? data: data.toString()}`);
        } else {
            this.logToPairing(`${message}`);
        }
    }

    logToPairing(message) {
        this.setState('info.pairingMessage', message, true);
    }

    expandFileName(fn) {
        return path.join(this.getDataFolder(), fn);
    }

    getDataFolder() {
        const datapath=this.namespace.replace('.','_');
        return path.join(adapterCore.getAbsoluteInstanceDataDir(this).replace(this.namespace, datapath));
    }

    onLog(level, msg, data) {
        if (msg) {
            let logger = this.log.info;
            switch (level) {
                case 'error':
                    logger = this.log.error;
                    if (data)
                        data = data.toString();
                    if (this.ErrorMessagesToPairing)
                        this.logToPairing(`Error: ${msg}. ${data}`, true);
                    this.sendError(`Error: ${msg}. ${data}`);
                    break;
                case 'debug':
                    logger = this.log.debug;
                    break;
                case 'info':
                    logger = this.log.info;
                    break;
                case 'warn':
                    logger = this.log.warn;
                    break;
            }
            if (data) {
                if (typeof data === 'string') {
                    logger(`${msg}. ${data}`);
                } else {
                    logger(`${msg}. ${safeJsonStringify(data)}`);
                }
            } else {
                logger(msg);
            }
        }
    }
    async appendDevicesWithoutObjects(devices, client) {
        const entity = await this.zbController.resolveEntity(client.ieeeAddr);
        if (!entity || !entity.device) {
            return;
        }
        const exists = devices.find((dev) => (dev._id && entity.device.ieeeAddr === utils.adIdtoZbIdorIeee(this, dev._id)));
        if (!exists) {
            const coordinatorData = {
                _id : `${this.namespace}.${entity.device.ieeeAddr.substring(2)}`,
                paired: true,
                info: this.buildDeviceInfo(entity),
                native: { id: entity.device.ieeeAddr.substring(2) },
                mapped : { model: client.modelID || client.type || 'NotSet' },
                statesDev: [],
            }
            if (entity.name === 'Coordinator') {
                coordinatorData.icon = 'zigbee.png';
                coordinatorData.common = { name: 'Coordinator', type: 'Coordinator'  };
                coordinatorData.info.coordinatorData = await this.getCoordinatorInfo();
            } else {
                coordinatorData.common = { name: entity.mapped?.model || 'unknown', type: entity.type  };
                coordinatorData.icon= 'img/unknown.png';
            }
            devices.push(coordinatorData);
        }
    }

    buildDeviceInfo(entity) {
        function getKey(object, value) {
            try {
                for (const key of Object.keys(object)) {
                    if (object[key] == value) {
                        return key;
                    }
                }
            }
            catch {
                return undefined;
            }
            return undefined;

        }

        function haveBindableClusters(clusters) {
            const nonBindableClusters = [25,33, 4096]
            const BindableClusters = [4,5,6,8,768]
            if (Array.isArray(clusters)) {
                return (clusters.filter((candidate) => BindableClusters.includes(candidate)).length > 0);
            }
            return false;
        }
        const rv = {};
        try {
            rv.device = {
                modelZigbee:entity.device.modelID,
                type:entity.device.type,
                ieee:entity.device.ieeeAddr || entity.device.groupID,
                nwk:entity.device.networkAddress || 0,
                manuf_id:entity.device.maufacturerID,
                manuf_name:entity.device.manufacturerName,
                manufacturer:entity.mapped?.vendor,
                power:entity.device.powerSource,
                app_version:entity.device.applicationVersion,
                hard_version:entity.device.hardwareVersion,
                zcl_version:entity.device.zclVersion,
                stack_version:entity.device.stack_version,
                date_code:entity.device.dateCode,
                build:entity.device.softwareBuildID,
                interviewstate:entity.device.interviewState || 'UNKNOWN',
                BindSource: false,
                isGroupable: false,
            }
            rv.endpoints = [];
            let dBindSource = false;
            let disGroupable = false;
            for (const ep_idx in entity.endpoints) {
                const ep = entity.endpoints[ep_idx];
                const bindable = haveBindableClusters(ep.outputClusters);
                dBindSource |= bindable;
                rv.endpoints.push({
                    ID:ep.ID,
                    epName: entity.mapped?.endpoint ? getKey(entity.mapped?.endpoint(entity.device), ep.ID) : ep.ID,
                    profile:ep.profileID,
                    input_clusters:ep.inputClusters,
                    output_clusters:ep.outputClusters,
                    BindSource: Boolean(bindable),
                })
                disGroupable |= ep.inputClusters.includes(4);
            }
            rv.device.isGroupable = Boolean(disGroupable);
            rv.device.BindSource = Boolean(dBindSource);
            if (entity.mapped) {
                rv.mapped = {
                    model:entity.mapped.model,
                    readKeys: [],
                    type:entity.device.type,
                    description:entity.mapped.description,
                    hasLegacyDef:modelDefinitions.hasLegacyDevice(entity.mapped.model),
                    hasState:modelDefinitions.hasStateExpose(entity.mapped.model),
                    //fingerprint:JSON.stringify(device.mapped.fingerprint),
                    vendor:entity.mapped.vendor,
                    hasOnEvent:entity.mapped.onEvent != undefined,
                    hasConfigure:entity.mapped.configure != undefined,
                    icon:`img/${entity.mapped.model.replace(/\//g, '-')}.png`,
                    legacyIcon: modelDefinitions.getIconforLegacyModel(entity.mapped.model),
                    options:[],
                }
                if (entity.mapped.options && typeof (entity.mapped.options == 'object')) {
                    rv.mapped.optionExposes = entity.mapped.options;
                    for (const option of entity.mapped.options) {
                        if (option.name) {
                            rv.mapped.options.push(option.name);
                        }
                    }
                }
                try {
                    rv.mapped.readKeys = (typeof entity?.mapped?.exposes === 'function') ? entity.mapped.exposes(entity.device) : (entity?.mapped?.exposes || []).find((e) => e.type == 'light') != undefined;
                }
                catch {
                    // no action
                }
            }
            else {
                rv.mapped = {
                    model:entity.name,
                    type: entity.device.type,
                    description:entity.name,
                    vendor:'not set',
                    hasOnEvent: false,
                    hasConfigure: false,
                    options:[],
                }
            }
        }
        catch (error) {
            if (entity && entity.name === 'Coordinator') {
                return rv;
            }
            const dev = entity ? entity.device || {} : {}
            const msg = entity ? `device ${entity.name} (${dev.ieeeAddr}, NWK ${dev.networkAddres}, ID: ${dev.ID})` : 'undefined device';
            this.warn(`Error ${error && error.message ? error.message + ' ' : ''}building device info for ${msg}`);
        }
        return rv;
    }

    async fillInfo(device, entity, device_stateDefs, all_states, models) {
        const reg = /\(.*\)/
        device.statesDef = (device_stateDefs || []).filter(stateDef => {
            const sid = stateDef._id.replace(this.namespace + '.', '');
            const names = sid.split('.');
            if (stateDef.common.color || names.length > 2) return false;
            return !disallowedDashStates.includes(names.pop());
        }).map(stateDef => {
            const name = stateDef.common.name;
            const devname = device.common.name;
            // replace state
            return {
                id: stateDef._id,
                name: typeof name === 'string' ? name.replace(devname, '').replace(reg, '').trim() : name,
                type: stateDef.common.type,
                read: stateDef.common.read,
                write: stateDef.common.write,
                val: all_states[stateDef._id] ? all_states[stateDef._id].val : undefined,
                role: stateDef.common.role,
                unit: stateDef.common.unit,
                states: stateDef.common.states,
                isAction: stateDef.native?.isAction ?? false,
                isEvent: stateDef.common.isEvent ?? false,
            };
        });


        device.info = this.buildDeviceInfo(entity);

        const UID = models.UIDbyModel[device.info?.mapped?.model || 'unknown'] || `m_${Object.keys(models.UIDbyModel).length}`;
        if (models.byUID.hasOwnProperty(UID)) {
            models.byUID[UID].devices.push(device);
        }
        else {
            models.byUID[UID] = {
                model:device.info.mapped,
                availableOptions : [...device.info?.mapped?.options || [], ...['use_legacy_model']],
                setOptions: this.stController.localConfig.getByModel(device.info?.mapped?.model || 'unknown') || [],
                devices: [device],
            };
            if (!models.byUID[UID].model.type)
                models.byUID[UID].model.type = 'Group';
            models.UIDbyModel[device.info?.mapped?.model || 'unknown'] = UID;
        }
        // check configuration
        try {
            if (device.info) {
                const result = await this.zbController.callExtensionMethod(
                    'shouldConfigure',
                    [device.info.device, device.info.mapped],
                );
                if (result.length > 0) device.isConfigured = !result[0];
                device.paired = true;
            } else device.paired = false;
        } catch (error) {
            this.warn('error calling shouldConfigure: ' + error && error.message ? error.message : 'no error message');
        }
    }

    async handleGroupforInfo(group, groups) {
        group.icon = 'img/group_1.png';
        group.vendor = 'ioBroker';
        // get group members and store them
        const match = /zigbee.\d.group_([0-9]+)/.exec(group._id);
        if (match && match.length > 1) {
            const groupID = Number(match[1]);
            const groupmembers = await this.zbController.getGroupMembersFromController(groupID);
            //this.debug(`group members for group ${groupID}: ${JSON.stringify(groupmembers)}`);
            if (groupmembers && groupmembers.length > 0) {
                const memberinfo = [];
                for (const member of groupmembers) {
                    if (member && typeof member.ieee === 'string') {
                        const memberId = utils.zbIdorIeeetoAdId(this, member.ieee, false);
                        const device = await this.getObjectAsync(utils.zbIdorIeeetoAdId(this, member.ieee, true));
                        const item = groups[memberId] || { groups:[], gep: { }};
                        const gep = item.gep[member.epid] || [];

                        if (!item.groups.includes(groupID)) item.groups.push(groupID);
                        if (!gep.includes(`${groupID}`)) gep.push(`${groupID}`);
                        item.gep[member.epid] = gep;
                        groups[memberId] = item;
                        memberinfo.push({
                            ieee:member.ieee,
                            epid:member.epid,
                            model:member.model,
                            device:device? device.common.name:'unknown'
                        });
                    }
                }
                group.memberinfo = memberinfo;
                this.log.debug(`memberinfo for ${match[1]}: ${JSON.stringify(group.memberinfo)}`);
            }
        }
    }

    async getDeviceInformation(id) {
        const roomsEnum = await this.getEnumsAsync('enum.rooms') || {};
        const deviceObjects = (id ? [await this.getObjectAsync(id)] : await this.getDevicesAsync());
        const all_states = id ? await this.getStatesAsync(id + '.*') : await this.getStatesAsync('*');
        const all_stateDefs = id ? await this.getStatesOfAsync(id) : await this.getStatesOfAsync();

        const illegalDevices = [];
        const groups = {};
        const PromiseChain = [];
        const models = { byUID : {}, UIDbyModel: {} };
        for (const deviceObject of deviceObjects) {
            const id = utils.getZbId(deviceObject._id);
            const entity = await this.zbController.resolveEntity(id);
            if (deviceObject._id.indexOf('group') > -1) {
                PromiseChain.push(this.handleGroupforInfo(deviceObject, groups));
            }
            else {
                const modelDesc = await modelDefinitions.findModel(deviceObject.common.type, entity?.device?.ieeeAddr,entity?.mapped?.legacy);
                deviceObject.icon = (modelDesc?.icon) ? modelDesc.icon : 'img/unknown.png';
                if (modelDesc?.vendor) deviceObject.vendor = modelDesc.vendor;
                const arr = (modelDesc?.states || []).filter((s) => Array.isArray(s.readKeys)).map((s)=> s.readKeys).flat();
                if (arr.length > 0) deviceObject.readKeys = arr;
                deviceObject.legacyIcon = modelDefinitions.getIconforLegacyModel(deviceObject.common.type);
                const lq_state = all_states[`${deviceObject._id}.link_quality`];
                deviceObject.link_quality = lq_state ? lq_state.val : -1;
                deviceObject.link_quality_lc = lq_state ? lq_state.lc : undefined;
                const battery_state = all_states[`${deviceObject._id}.battery`];
                deviceObject.battery = battery_state ? battery_state.val : undefined;

            }
            deviceObject.rooms = [];
            const rooms = roomsEnum['enum.rooms'] || {};
            for (const room of Object.keys(rooms)) {
                if (!rooms.hasOwnProperty(room) ||
                    !rooms[room] ||
                    !rooms[room].common ||
                    !rooms[room].common.members
                ) {
                    continue;
                }
                if (rooms[room].common.members.includes(deviceObject._id)) {
                    deviceObject.rooms.push(rooms[room].common.name);
                }
            }
            PromiseChain.push(this.fillInfo(deviceObject, entity, all_stateDefs.filter(item => item._id.startsWith(deviceObject._id)),all_states, models));
        }
        if (!id) {
            for (const client of this.zbController.getClientIterator(true)) {
                PromiseChain.push(this.appendDevicesWithoutObjects(deviceObjects,client))
            }
        }

        await Promise.all(PromiseChain);

        for (const groupmember in groups) {
            const device = deviceObjects.find(dev => (groupmember === dev.native.id));
            if (device) {
                device.groups = groups[groupmember].groups;
                device.groups_by_ep = groups[groupmember].gep;
            }
        }


        this.log.debug(`getDevices contains ${deviceObjects.length} Devices`);
        return { deviceObjects, models };
    }

    async getCoordinatorInfo() {
        const coordinatorinfo = {
            installSource: 'IADefault_1',
            channel: '-1',
            port: 'Default_1',
            installedVersion: 'Default_1',
            type: 'Default_1',
            revision: 'unknown',
            version: 'unknown',
            herdsman: this.zhversion,
            converters: this.zhcversion,
        };

        const coordinatorVersion =  this.zbController && this.zbController.herdsmanStarted ? await this.zbController.herdsman.getCoordinatorVersion() : {};
        const coordinatorCandidates = this.zbController && this.zbController.herdsmanStarted ? await this.zbController.herdsman?.getDevicesByType('Coordinator') ?? [] : [];
        if (coordinatorCandidates.length == 0) coordinatorinfo.ieee = '0x0000000000000000';
        else coordinatorinfo.ieee = coordinatorCandidates[0]?.ieeeAddr ?? '0xffffffffffffffff';

        const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        if (obj) {
            if (obj.common.installedFrom && obj.common.installedFrom.includes('://')) {
                const instFrom = obj.common.installedFrom;
                coordinatorinfo.installSource = instFrom.replace('tarball', 'commit');
            } else {
                coordinatorinfo.installSource = obj.common.installedFrom;
            }
        }
        try {
            coordinatorinfo.port = obj.native.port;
            coordinatorinfo.type = obj.native.adapterType;
            coordinatorinfo.channel = obj.native.channel;
            coordinatorinfo.autostart = this.config.autostart;
            coordinatorinfo.installedVersion = obj.common.version;
            if (coordinatorVersion && coordinatorVersion.type && coordinatorVersion.meta) {
                coordinatorinfo.type = coordinatorVersion.type;
                const meta = coordinatorVersion.meta;
                if (typeof meta == 'object') {
                    if (meta.hasOwnProperty('revision')) {
                        coordinatorinfo.revision = meta.revision;
                    }
                    let vt = 'x-';
                    if (meta.hasOwnProperty('transportrev')) {
                        vt = meta.transportrev + '-';
                    }
                    if (meta.hasOwnProperty('product')) {
                        vt = vt + meta.product + '.';
                    } else {
                        vt = vt + 'x.';
                    }
                    if (meta.hasOwnProperty('majorrel')) {
                        vt = vt + meta.majorrel + '.';
                    } else {
                        vt = vt + 'x.';
                    }
                    if (meta.hasOwnProperty('minorrel')) {
                        vt = vt + meta.minorrel + '.';
                    } else {
                        vt = vt + 'x.';
                    }
                    if (meta.hasOwnProperty('maintrel')) {
                        vt = vt + meta.maintrel + '.';
                    } else {
                        vt = vt + 'x.';
                    }
                    coordinatorinfo.version = vt;
                }
                else {
                    coordinatorinfo.version = 'illegal data';
                    coordinatorinfo.revision = 'illegal data';
                }
            }
            else {
                coordinatorinfo.version = this.adapter.config.autostart ? 'not connected' : 'autostart not set';
                coordinatorinfo.revision = this.adapter.config.autostart ? 'not connected' : 'autostart not set';
            }
        } catch {
            this.log.warn('exception raised in getCoordinatorInfo');
        }

        this.log.debug(`getCoordinatorInfo result: ${JSON.stringify(coordinatorinfo)}`);
        this.stController.updateCoordinatorIEEE(coordinatorinfo.ieee);
        return coordinatorinfo;
    }
}



if (module && module.parent) {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Zigbee(options);
} else {
    // or start the instance directly
    new Zigbee();
}
