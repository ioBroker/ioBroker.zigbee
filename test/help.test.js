'use strict';

// The answer of the message 'help' (lib/help.js) must list every command the adapter answers: the ones of
// onMessage in main.js and in the plugins, and the device manager of @iobroker/dm-utils.
// Run:  node --test test/help.test.js

const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { HELP, COMMANDS } = require('../lib/help');

/** The commands of one message handler: from the method to the next method of the class */
function commandsOf(file, method) {
    const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const start = source.search(new RegExp(`\\n {4}(async )?${method}\\(\\w+\\) \\{`));
    assert.ok(start > 0, `${method} in ${file}`);
    const next = source.slice(start + 1).search(/\n {4}(async )?\w+\([^)]*\) \{/);
    const body = next > 0 ? source.slice(start, start + 1 + next) : source.slice(start);
    return [...body.matchAll(/case '([^']+)':|command === '([^']+)'/g)].map(m => m[1] || m[2]);
}

function handledCommands() {
    const root = path.join(__dirname, '..');
    const files = [path.join(root, 'main.js')];
    for (const name of fs.readdirSync(path.join(root, 'lib'))) {
        if (/^plugin(?!Base).*\.js$/.test(name)) files.push(path.join(root, 'lib', name));
    }
    const commands = files.flatMap(file => commandsOf(file, 'onMessage'));
    const dm = path.join(path.dirname(require.resolve('@iobroker/dm-utils')), 'DeviceManagement.js');
    commands.push(...commandsOf(dm, 'handleMessage'));
    return commands;
}

describe('help', () => {
    it('lists exactly the commands the adapter answers, each once', () => {
        const listed = COMMANDS.map(c => c.command);
        assert.deepStrictEqual([...new Set(listed)].sort(), [...listed].sort(), 'duplicates');
        assert.deepStrictEqual([...listed].sort(), [...new Set(handledCommands())].sort());
    });

    it('names every command', () => {
        for (const { command } of COMMANDS.filter(c => c.command !== 'help')) {
            assert.ok(new RegExp(`(^|[^\\w:])${command}(?!\\w)`).test(HELP), command);
        }
    });

    it('marks the commands that need an explicit request as write', () => {
        const rule = HELP.split('\n- ').find(part => part.includes("only on the user's explicit request"));
        assert.ok(rule, 'rule found');
        for (const { command, write } of COMMANDS) {
            if (new RegExp(`(^|[^\\w:])${command}(?!\\w)`).test(rule)) {
                assert.strictEqual(write, true, command);
            }
        }
        for (const command of ['getDevices', 'getMap', 'checkOtaAvail', 'listbackups', 'getGroups']) {
            assert.strictEqual(COMMANDS.find(c => c.command === command).write, false, command);
        }
    });

    it('keeps the lines short', () => {
        for (const line of HELP.split('\n')) {
            assert.ok(line.length <= 120, line);
        }
    });
});
