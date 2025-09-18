# ioBroker.zigbee Adapter

ioBroker.zigbee is a Node.js adapter for controlling zigbee devices using the zigbee-herdsman-converters and zigbee-herdsman libraries

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

Bootstrap, build, and test the repository:
- `npm install` -- takes 1-3 seconds normally, may take up to 30 seconds on slow networks. NEVER CANCEL. Set timeout to 60+ seconds.
- `npm test` -- runs package validation and unit tests, takes ~1 second. NEVER CANCEL. Set timeout to 30+ seconds.
- `npm run test:package` -- validates package.json and io-package.json structure, takes ~0.5 seconds. NEVER CANCEL.
- `npm run test:unit` -- runs deprecated unit tests, takes ~0.5 seconds. NEVER CANCEL.
- `npm run test:integration` -- comprehensive adapter startup test, takes 30-60 seconds. NEVER CANCEL. Set timeout to 120+ seconds.

## Validation

- Always run `npm install && npm test` before making changes to ensure the baseline works.
- Always run `npm run test:integration` after making significant changes as it performs real adapter startup simulation.
- ALWAYS manually validate any configuration or main.js changes by running the integration test suite.
- When modifying translations, always run `npx translate-adapter translate` to update all language files.
- You cannot run the adapter directly outside of the ioBroker environment -- it requires js-controller.

## Common Tasks

The following are outputs from frequently run commands. Reference them instead of viewing, searching, or running bash commands to save time.

### Repository Root
```
ls -la
.git                    # Git repository
.github/                # GitHub workflows and configuration
.gitignore              # Git ignore patterns
.npmignore              # NPM publish ignore patterns
.releaseconfig.json     # Release script configuration
LICENSE                 # MIT License
README.md               # Main documentation
admin/                  # Admin UI files and translations
io-package.json         # ioBroker package configuration (13KB)
main.js                 # Main adapter code (2368 lines)
package-lock.json       # NPM lock file (264KB)
package.json            # NPM package configuration
test/                   # Test files
lib/                    # modules used
```

### NPM Scripts Available
```
npm run test            # Runs test:package && test:unit
npm run test:package    # Validates package structure (40 tests, ~0.5s)
npm run test:unit       # Deprecated unit tests (1 test, ~0.5s)
npm run test:integration # Full adapter startup test (1 test, 30-60s)
npm run release         # Release script using @alcalzone/release-script
npm run translate       # Update translations using translate-adapter
```

### Key File Locations
- **Main Code**: `main.js` (2368 lines) - core adapter logic, device handling, cloud communication
- **Admin Interface**: `admin/index_m.html` - configuration UI with Meross credentials form
- **Configuration**: `io-package.json` - adapter metadata, news, translation keys
- **Package Info**: `package.json` - dependencies, scripts, Node.js 18+ requirement
- **Tests**: `test/` directory with package, unit, and integration tests
- **Translations**: `admin/i18n/` with language-specific JSON files
- **GitHub Workflow**: `.github/workflows/test-and-release.yml` - CI/CD pipeline

### Dependencies and Environment
- **Node.js**: Requires 18.x or higher (package.json engines)
- **Key Dependencies**:
  - `meross-cloud` (^3.1.2) - Meross API client
  - `@iobroker/adapter-core` (^3.3.2) - ioBroker adapter framework
  - `@apollon/iobroker-tools` (^0.2.1) - Helper utilities
  - `zigbee-herdsman-converters` (25.25.0) - zigbee device compatibility library
  - `zigbee-herdsman` (6.1.1) - zigbee hardware library
- **Dev Dependencies**: Mocha testing, release scripts, ioBroker testing framework
- **Known Vulnerabilities**: npm audit reports 11 vulnerabilities (form-data, tough-cookie, xmldom) from transitive dependencies. These are in dev/test dependencies and do not affect production functionality.

## Build Process and Timing

There is NO traditional build step - this is a pure Node.js project that runs directly from source.

**CRITICAL TIMING EXPECTATIONS:**
- `npm install`: 1-3 seconds (normal), up to 30 seconds (slow networks)
- `npm run test:package`: ~0.5 seconds (validates package structure)
- `npm run test:unit`: ~0.5 seconds (deprecated test)
- `npm run test:integration`: 30-60 seconds (NEVER CANCEL - this starts ioBroker test environment)
- `npx translate-adapter translate`: ~0.5 seconds
- Full test suite (`npm test`): ~1 second

**NEVER CANCEL** any test commands. The integration test appears to hang but is actually setting up the ioBroker test environment with Redis servers.

## Validation Scenarios

Since this is an ioBroker adapter that requires cloud credentials, manual testing scenarios are limited:

1. **Package Validation**: Always run `npm run test:package` to verify package.json and io-package.json are correctly structured.

2. **Integration Test**: Always run `npm run test:integration` after changes - this is the primary validation that the adapter can start correctly in the ioBroker environment.

3. **Translation Updates**: When modifying admin interface or adding new configuration options, run `npx translate-adapter translate` to update all language files.

4. **Configuration Validation**: Check that changes to `io-package.json` maintain the required structure for news, version compatibility, and configuration options.

You CANNOT test actual device functionality without:
- zigbee coordinator hardware
- matching adapter configuration
- Running in a full ioBroker installation

## Configuration and Architecture

### Main Components
- **main.js**: Core adapter (~2400 lines)
  - Cloud connection handling via meross-cloud library
  - Device state management and synchronization
  - Support for 30+ device types (switches, sensors, thermostats, etc.)
  - Polling for electricity/consumption data
  - MFA (Multi-Factor Authentication) support
- **lib/statescontroller.js**: Device state management and synchronization
- **lib/zigbeecontroller.js**: Zigbee hardware management and synchronization

- **admin/index_m.html**: Configuration interface
  - Meross cloud credentials (username/password)
  - Optional MFA code input (30-second validity)
  - Polling interval settings
  - Local vs cloud communication preferences

### Key Configuration Options (io-package.json native)
```javascript
{
    "port": "",
    "panID": 0,
    "extPanID": "",
    "channel": 11,
    "disableLed": false,
    "precfgkey": "01030507090B0D0F00020406080A0C0D",
    "countDown": 60,
    "adapterType": "zstack",
    "debugHerdsman": false,
    "disablePing": false,
    "disableBackup": false,
    "external": "",
    "startWithInconsistent": false,
    "warnOnDeviceAnnouncement": true,
    "baudRate": 115200,
    "flowCTRL": false,
    "autostart": true,
}
```

## Development Workflows

### Making Code Changes
1. Run baseline tests: `npm install && npm test && npm run test:integration`
2. Make your changes to main.js, admin files, or configuration
3. Validate: `npm test && npm run test:integration`
4. If changing translations: `npx translate-adapter translate`
5. Commit changes

### Adding New Device Support
1. Study the device data patterns in main.js (search for device type names)
2. Add new case statements in the data handler switch block (~line 2100+)
3. Implement setValues functions for the new device type
4. Test with integration tests
5. Update device support documentation

### Modifying Admin Interface
1. Edit `admin/index_m.html` for UI changes
2. Update `admin/i18n/en/translations.json` for new text
3. Run `npx translate-adapter translate` to update all languages
4. Test admin interface in ioBroker environment

## Important Notes

- **Cloud Dependencies**: This adapter requires internet connectivity and valid Meross cloud credentials
- **No Local-Only Mode**: Devices must be connected to Meross cloud service
- **MFA Challenges**: MFA codes are only valid for 30 seconds - enter and save quickly
- **Token Storage**: Login tokens are stored and reused to minimize login frequency
- **Device Addition**: New devices require adapter restart to update the device tree
- **Debugging**: Set adapter to Debug mode and check ioBroker logs for troubleshooting

## GitHub Workflows

The project uses `.github/workflows/test-and-release.yml`:
- **check-and-lint**: Quick validation on Node 22.x
- **adapter-tests**: Full testing on Node 18.x, 20.x, 22.x, 24.x across ubuntu/windows/macos
- **deploy**: Automated NPM publishing on tagged releases

Tests run automatically on pushes and pull requests. The workflow includes package validation, unit tests, and integration tests across multiple environments.
