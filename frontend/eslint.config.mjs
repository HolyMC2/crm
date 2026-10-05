import { createRequire } from 'node:module'

// pre-commit supplies these packages through NODE_PATH when the worktree has no
// application dependencies. CommonJS resolution supports that isolated hook.
const require = createRequire(import.meta.url)
const js = require('@eslint/js')
const ts = require('typescript-eslint')
const pluginVue = require('eslint-plugin-vue')
const configPrettier = require('eslint-config-prettier')
const vueParser = require('vue-eslint-parser')
const globals = require('globals')

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/public/dist/**',
      // byte-checked vendored packages (scripts/verify-vendor.mjs)
      'src/vendor/muelle-shell/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue', '**/*.js', '**/*.ts'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: ts.parser,
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        frappe: 'readonly',
        __: 'readonly',
      },
    },
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/prop-name-casing': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },
  configPrettier,
]
