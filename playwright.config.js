import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node --env-file-if-exists=.env.test scripts/e2e-api.js',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // O build de testes inclui o catálogo do design system (VITE_DESIGN_CATALOG) em dist/e2e; o build de produção não.
      command:
        'node node_modules/vite/bin/vite.js build --outDir dist/e2e && ' +
        'node node_modules/vite/bin/vite.js preview --outDir dist/e2e --host 127.0.0.1 --port 5173 --strictPort',
      env: { VITE_DESIGN_CATALOG: 'true' },
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
