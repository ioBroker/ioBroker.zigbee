const globals = require('globals');
const js = require('@eslint/js');

const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

module.exports = [
    {
        ignores: [
            '.dev-server/**',
            'admin/*.min.js',
            'admin/words.js'
        ],
    },
    ...compat.extends('eslint:recommended', 'plugin:prettier/recommended'),
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.mocha,
            },

            ecmaVersion: 2022,
            sourceType: 'commonjs',

            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },

        rules: {
            indent: ['error', 4, { SwitchCase: 1 }],
            'prettier/prettier': ['off', { endOfLine: 'auto' }],
            'no-unused-vars': 'off',
            'no-fallthrough': 'off',
            'no-console': 'off',
            'no-prototype-builtins': 'off',
            'no-undef': 'warn',
            'no-empty': 'warn',
            'no-var': 'warn',
            'prefer-const': 'warn',
            'no-unsafe-finally': 'warn',
            'no-cond-assign': 'warn',
            'no-func-assign': 'warn',
            'no-global-assign': 'warn',
            'no-self-assign': 'warn',
            'no-trailing-spaces': 'error',
            quotes: ['warn',
                'single',
                {
                    avoidEscape: true,
                    allowTemplateLiterals: true,
                },
            ],
        },
    },
];
