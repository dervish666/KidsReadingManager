const js = require('@eslint/js');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'src/**/*.jsx'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        crypto: 'readonly',
      },
    },
    rules: {
      // React hooks — only the high-signal rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/static-components': 'warn',

      // Unused code detection
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_|^React$',
          caughtErrorsIgnorePattern: '^_|^err|^error|^e$',
        },
      ],

      // Disable noisy recommended rules
      'no-useless-catch': 'off',
      'preserve-caught-error': 'off',

      // Real bug catchers
      'no-undef': 'error',
      'no-constant-binary-expression': 'error',
      'no-constructor-return': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'warn',
      'no-unmodified-loop-condition': 'warn',
    },
  },
  {
    files: [
      'src/routes/**/*.js',
      'src/middleware/**/*.js',
      'src/services/**/*.js',
      'src/data/**/*.js',
      'src/utils/**/*.js',
    ],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        crypto: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['src/data/jsonProvider.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_|^React$|^mock|^create|^setup',
          caughtErrorsIgnorePattern: '.*',
        },
      ],
    },
  },
  {
    ignores: ['build/**', 'scripts/**', 'node_modules/**', 'e2e/**'],
  },
];
