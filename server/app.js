import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createAuthRouter } from './routes/auth.js';
import { createActivityRouter } from './routes/activity.js';
import { createCatalogRouter } from './routes/catalog.js';
import { createEntriesRouter } from './routes/entries.js';
import { createMembersRouter } from './routes/members.js';
import { createRecurrencesRouter } from './routes/recurrences.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createImportsRouter } from './routes/imports.js';

const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist/client',
);

export function createApp({ pool, secureCookies = process.env.COOKIE_SECURE === 'true', loginLimit = 10 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  if (pool) {
    const csrfSecret = randomBytes(32);
    app.use('/api/imports', createImportsRouter({ pool, secureCookies, csrfSecret }));
    app.use(express.json({ limit: '16kb' }));
    app.use('/api/auth', createAuthRouter({ pool, secureCookies, loginLimit, secret: csrfSecret }));
    app.use('/api/activity', createActivityRouter({ pool, secureCookies }));
    app.use('/api/catalog', createCatalogRouter({ pool, secureCookies, csrfSecret }));
    app.use('/api/entries', createEntriesRouter({ pool, secureCookies, csrfSecret }));
    app.use('/api/members', createMembersRouter({ pool, secureCookies, csrfSecret }));
    app.use('/api/recurrences', createRecurrencesRouter({ pool, secureCookies, csrfSecret }));
    app.use('/api/dashboard', createDashboardRouter({ pool, secureCookies }));
  } else {
    app.use(express.json({ limit: '16kb' }));
  }

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }));
    app.get(/.*/, (_request, response) => {
      response.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((error, _request, response, _next) => {
    if (error.type !== 'entity.too.large' && error.type !== 'entity.parse.failed') console.error(`API request failed${error.code ? ` (${error.code})` : ''}`);
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    response.status(status).json({ error: status === 413 ? 'A solicitação excede o limite de 4 MB.' : status === 400 ? 'O corpo da solicitação não contém JSON válido.' : 'Ocorreu um erro. Tente novamente.' });
  });
  return app;
}
