import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
export default [
  {
    ignores: [
      'node_modules/**',
      'frontend/dist/**',
      'desktop/target/**',
      'desktop/resources/**',
      'engine/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['frontend/src/**/*.{js,vue}', 'docs/guide/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.{js,mjs}', '*.config.js', 'frontend/vite.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Control-byte patterns are deliberate input validation. Stable public errors intentionally discard untrusted native causes.
  {
    rules: {
      'no-control-regex': 'off',
      'preserve-caught-error': 'off',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-constant-binary-expression': 'error',
    },
  },
  {
    files: ['scripts/live-*.mjs', 'scripts/native-test-engine.mjs'],
    rules: { 'no-shadow': ['error', { builtinGlobals: true }] },
  },
  { files: ['**/*.vue'], rules: { 'vue/no-v-html': 'error' } },
];
