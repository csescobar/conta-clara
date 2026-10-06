import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createAuthRouter } from './routes/auth.js';
import { createMembersRouter } from './routes/members.js';

const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist/client',
);

export function createApp({ pool, secureCookies = process.env.COOKIE_SECURE === 'true', loginLimit = 10 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  if (pool) {
    const csrfSecret = randomBytes(32);
    app.use('/api/auth', createAuthRouter({ pool, secureCookies, loginLimit, secret: csrfSecret }));
    app.use('/api/members', createMembersRouter({ pool, secureCookies, csrfSecret }));
  }

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }));
    app.get(/.*/, (_request, response) => {
      response.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((error, _request, response, _next) => {
    console.error(`API request failed${error.code ? ` (${error.code})` : ''}`);
    response.status(500).json({ error: 'Ocorreu um erro. Tente novamente.' });
  });
  return app;
}
