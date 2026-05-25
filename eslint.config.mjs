// ioBroker eslint template configuration file for js and ts files
// Please note that esm or react based modules need additional modules loaded.
import config from '@iobroker/eslint-config';

export default [
    ...config,

    {
        // specify files to exclude from linting here
        ignores: [
            '.dev-server/',
            '.vscode/',
            '*.test.js',
            'test/**/*.js',
            '*.config.mjs',
            'build',
            'dist',
            'admin/build',
            'admin/words.js',
            'admin/admin.d.ts',
            'admin/blockly.js',
            'admin/moment.min.js',
            'admin/shuffle.min.js',
            'admin/vis-network.min.js',
            '**/adapter-config.d.ts',
        ],
    },
    {
        // Browser admin files – browser globals and 3rd-party libs (moment, Shuffle) are available at runtime
        files: ['admin/admin.js', 'admin/adapter-settings.js'],
        rules: {
            'no-undef': 'off',
            'no-global-assign': 'off',
            '@typescript-eslint/no-this-alias': 'off',
        },
    },
    {
        // you may disable some 'jsdoc' warnings - but using jsdoc is highly recommended
        // as this improves maintainability. jsdoc warnings will not block build process.
        rules: {
            'prettier/prettier': ['off', { endOfLine: 'auto' }],
            'jsdoc/no-blank-blocks': 'off',
            'no-prototype-builtins': 'off',
            '@typescript-eslint/no-unused-vars': 'warn',
            'no-useless-escape': 'warn',
            '@typescript-eslint/no-this-alias': 'warn',
            'jsdoc/require-param-description': 'off',
        },
    },
];