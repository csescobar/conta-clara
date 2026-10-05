import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const app = express();
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist/client',
);

app.disable('x-powered-by');
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false }));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(clientDist, 'index.html'));
  });
}

export default app;
