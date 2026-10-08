import { readFile } from 'node:fs/promises';
import express from 'express';
import { requireAuth } from './auth.js';

const emptyStatus = {
  runState: 'never',
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastSuccessDate: null,
  lastFailureAt: null,
  lastFailureCode: null,
  lastFailureMessage: null,
};

const failureMessages = {
  configuration: 'A configuração do Google Drive ou da criptografia não está disponível.',
  database_dump: 'Não foi possível criar o dump do PostgreSQL.',
  drive_upload: 'Não foi possível enviar o backup ao Google Drive.',
  upload_verification: 'O arquivo enviado não passou na verificação de integridade.',
  retention: 'O backup novo foi validado, mas a retenção não pôde ser aplicada.',
};

function publicStatus(status) {
  const code = Object.hasOwn(failureMessages, status?.lastFailureCode) ? status.lastFailureCode : null;
  return {
    runState: ['never', 'running', 'success', 'warning', 'failed'].includes(status?.runState) ? status.runState : 'never',
    lastAttemptAt: typeof status?.lastAttemptAt === 'string' ? status.lastAttemptAt : null,
    lastSuccessAt: typeof status?.lastSuccessAt === 'string' ? status.lastSuccessAt : null,
    lastSuccessDate: typeof status?.lastSuccessDate === 'string' ? status.lastSuccessDate : null,
    lastFailureAt: typeof status?.lastFailureAt === 'string' ? status.lastFailureAt : null,
    lastFailureCode: code,
    lastFailureMessage: code ? failureMessages[code] : null,
  };
}

export function createBackupsRouter({ pool, secureCookies = false, statusFile = process.env.BACKUP_STATUS_FILE } = {}) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));

  router.get('/status', async (request, response, next) => {
    if (request.auth?.role !== 'admin') {
      return response.status(403).json({ error: 'Somente administradores podem consultar os backups.' });
    }
    try {
      if (!statusFile) return response.json({ ...emptyStatus });
      const contents = await readFile(statusFile, 'utf8');
      return response.json(publicStatus(JSON.parse(contents)));
    } catch (error) {
      if (error.code === 'ENOENT') return response.json({ ...emptyStatus });
      if (error instanceof SyntaxError) return response.json({ ...emptyStatus, runState: 'failed' });
      return next(error);
    }
  });

  return router;
}
