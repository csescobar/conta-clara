// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashOpaqueToken } from './auth.js';
import { createBackupsRouter } from './backups.js';

describe('backup status endpoint', () => {
  let directory;
  let statusFile;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'conta-clara-backup-status-'));
    statusFile = join(directory, 'status.json');
  });

  afterEach(async () => rm(directory, { recursive: true, force: true }));

  function app() {
    const sessions = new Map([
      [
        hashOpaqueToken('admin-session'),
        { user_id: 'admin-id', display_name: 'Administradora', email: 'admin@example.test', role: 'admin', space_id: 'space-id' },
      ],
      [
        hashOpaqueToken('member-session'),
        { user_id: 'member-id', display_name: 'Membro', email: 'member@example.test', role: 'member', space_id: 'space-id' },
      ],
    ]);
    const pool = {
      query: async (_sql, [sessionHash]) => ({ rows: sessions.has(sessionHash) ? [sessions.get(sessionHash)] : [] }),
    };
    const server = express();
    server.use('/api/backups', createBackupsRouter({ pool, statusFile }));
    return server;
  }

  it('returns only sanitized status fields to an administrator', async () => {
    await writeFile(
      statusFile,
      JSON.stringify({
        runState: 'warning',
        lastAttemptAt: '2026-10-06T06:00:00.000Z',
        lastSuccessAt: '2026-10-05T06:00:00.000Z',
        lastSuccessDate: '2026-10-05',
        lastFailureAt: '2026-10-06T06:00:00.000Z',
        lastFailureCode: 'retention',
        retentionPending: true,
        accessToken: 'never-return-this',
        password: 'never-return-this-either',
      }),
    );

    const response = await request(app()).get('/api/backups/status').set('Cookie', 'cc_session=admin-session').expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      runState: 'warning',
      lastAttemptAt: '2026-10-06T06:00:00.000Z',
      lastSuccessAt: '2026-10-05T06:00:00.000Z',
      lastSuccessDate: '2026-10-05',
      lastFailureAt: '2026-10-06T06:00:00.000Z',
      lastFailureCode: 'retention',
      lastFailureMessage: 'O backup novo foi validado, mas a retenção não pôde ser aplicada.',
    });
    expect(JSON.stringify(response.body)).not.toContain('never-return');
  });

  it('denies members and unauthenticated visitors', async () => {
    await request(app()).get('/api/backups/status').expect(401);
    await request(app()).get('/api/backups/status').set('Cookie', 'cc_session=member-session').expect(403);
  });

  it('reports a safe empty state before the first backup', async () => {
    const response = await request(app()).get('/api/backups/status').set('Cookie', 'cc_session=admin-session').expect(200);
    expect(response.body).toEqual({
      runState: 'never',
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastSuccessDate: null,
      lastFailureAt: null,
      lastFailureCode: null,
      lastFailureMessage: null,
    });
  });
});
