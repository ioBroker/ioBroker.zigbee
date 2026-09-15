'use strict';

// Bridge between the log output of libraries with a setLogger() export (zigbee-herdsman,
// zigbee-herdsman-converters) and the adapter log.
//
// Both libraries write through their own module-level logger, which defaults to console.*. The adapter
// runs as a child process of js-controller with stdout ignored, so without this bridge every warning
// and error the libraries report is lost - and the 'debugHerdsman' option has been without effect
// since zigbee-herdsman stopped using the 'debug' package.
//
// Usage: setup() once, then attach(...libraries) with module names (required here) or module objects.
// A library's setLogger() is a plain assignment, so attaching again just hands it the same object.
//
// Mapping:
//   library debug   -> adapter debug, only while 'debugHerdsman' is enabled
//   library info    -> adapter debug (the adapter reports the same events in its own words)
//   library warning -> adapter warn
//   library error   -> adapter error
// Debug/info lines of the byte-level namespaces (uart, ash, unpi, tokens) are always dropped.

const BYTE_LEVEL_NAMESPACE = /(?::uart|:ash|:unpi|:tokens)(?::|$)/;

class LibraryLogBridge {
    constructor(adapter) {
        this.adapter = adapter;
        this.logger = undefined;    // the object the libraries get through setLogger()
        this.active = false;
        this.attached = new Set();  // library objects that already hold the logger
    }

    /** Create the logger object once and switch the forwarding on. Safe to call again (after stop()). */
    setup() {
        if (!this.logger) {
            this.logger = {
                debug: (message, namespace) => this.handle('debug', message, namespace),
                info: (message, namespace) => this.handle('info', message, namespace),
                warning: (message, namespace) => this.handle('warning', message, namespace),
                error: (message, namespace) => this.handle('error', message, namespace),
            };
        }
        this.active = true;
        return this;
    }

    /**
     * Attach the logger to any number of libraries. A string is required by that name, an object is used
     * as it is; each needs a setLogger() export. The result is logged here, nothing is returned.
     */
    attach(...libraries) {
        if (!this.logger) this.setup();
        const attached = [];
        for (const entry of libraries) {
            const label = this.labelFor(entry);
            try {
                const library = typeof entry === 'string' ? require(entry) : entry;
                if (!library || typeof library.setLogger !== 'function') {
                    throw new Error('setLogger is not exported');
                }
                if (this.attached.has(library)) {
                    this.adapter.log.debug(`Log output of ${label} is already attached`);
                    continue;
                }
                library.setLogger(this.logger);
                this.attached.add(library);
                attached.push(label);
            } catch (error) {
                this.adapter.log.warn(`Log output of ${label} stays on the console: ${error && error.message ? error.message : error}`);
            }
        }
        if (attached.length > 0) {
            const debug = this.adapter.config && this.adapter.config.debugHerdsman ? ' (including debug output)' : '';
            this.adapter.log.info(`Library log output attached for ${attached.join(', ')}${debug}`);
        }
    }

    /** A name for the log line: the string itself, or the package a module object was loaded from. */
    labelFor(entry) {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry.name === 'string') return entry.name;
        for (const cached of Object.values(require.cache)) {
            if (cached && cached.exports === entry) {
                const match = /node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/]+)/.exec(cached.filename);
                if (match) return match[1];
            }
        }
        return 'library';
    }

    /** Stop forwarding; the libraries keep the logger, so every later line is dropped silently. */
    stop() {
        this.active = false;
    }

    /**
     * Entry point for all four levels of every attached library. Must never throw - it is called from
     * inside the libraries' own code paths.
     */
    handle(level, messageOrLambda, namespace) {
        try {
            if (!this.active) return;
            const ns = (typeof namespace === 'string' && namespace) ? namespace : 'lib';
            const diagnostic = level === 'debug' || level === 'info';
            if (diagnostic && BYTE_LEVEL_NAMESPACE.test(ns)) return;
            const message = String(typeof messageOrLambda === 'function' ? messageOrLambda() : messageOrLambda);
            const log = this.adapter.log;

            switch (level) {
                case 'error':
                    log.error(`[${ns}] ${message}`);
                    break;
                case 'warning':
                    log.warn(`[${ns}] ${message}`);
                    break;
                case 'info':
                    log.debug(`[${ns}] ${message}`);
                    break;
                default:
                    if (this.adapter.config && this.adapter.config.debugHerdsman) log.debug(`[${ns}] ${message}`);
            }
        } catch (error) {
            try {
                this.adapter.log.debug(`library log bridge: ${error && error.message ? error.message : error}`);
            } catch {
                // nothing left that could take the message
            }
        }
    }
}

module.exports = { LibraryLogBridge };
