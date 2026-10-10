import { existsSync } from 'node:fs';
import { test as setup } from '@playwright/test';
import { createPool } from '../../server/database/connection.js';
import { seedVisualData, sessionPath } from './seed.js';

// Os testes visuais precisam de uma base conhecida: depois dos testes funcionais, esta etapa limpa a base descartável
// (a mesma proteção do servidor de testes: só bases terminadas em _test) e recria a conta e os dados fictícios.
setup('prepara uma base limpa com dados fictícios determinísticos', async ({ playwright, baseURL }) => {
  if (existsSync('.env.test')) process.loadEnvFile('.env.test');
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !decodeURIComponent(new URL(url).pathname.slice(1)).endsWith('_test')) {
    throw new Error('Execução bloqueada: TEST_DATABASE_URL precisa apontar para uma base descartável terminada em _test.');
  }
  const pool = createPool(url);
  try {
    await pool.query('TRUNCATE TABLE users CASCADE');
  } finally {
    await pool.end();
  }

  const api = await playwright.request.newContext({ baseURL });
  try {
    await seedVisualData(api, baseURL);
    await api.storageState({ path: sessionPath });
  } finally {
    await api.dispose();
  }
});
