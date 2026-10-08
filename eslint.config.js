import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Cores devem vir dos tokens do design system (docs/design-system.md), nunca da paleta padrão do Tailwind ou de hexadecimais.
const offTokenColor = String.raw`/(^|[\s:'"\x60])(bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|accent|caret|divide|placeholder|shadow)-(\[#|(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(\b|-))/`;
const offTokenMessage =
  'Use os tokens de cor do design system (ex.: bg-destructive-soft, text-warning) em vez da paleta padrão ou de hexadecimais.';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'coverage', 'local-certs'] },
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'scripts/**/*.js', 'backup/**/*.js', 'e2e/**/*.js', '*.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }] },
  },
  {
    files: ['e2e/**/*.js', 'src/pwa/service-worker.js'],
    // __PWA_PRECACHE_URLS__ é substituído pelo build (vite.config.ts).
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker, __PWA_PRECACHE_URLS__: 'readonly' } },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended, jsxA11y.flatConfigs.recommended],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${offTokenColor}]`, message: offTokenMessage },
        { selector: `TemplateElement[value.raw=${offTokenColor}]`, message: offTokenMessage },
      ],
    },
  },
  prettier,
);
