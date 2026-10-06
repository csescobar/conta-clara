// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isBackupDue, localBackupDate, runBackup } from './runner.js';

describe('Google Drive backup runner', () => {
  let directory;
  let statusFile;
  let configFile;
  let remoteFiles;
  let commands;
  let failures;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'conta-clara-backup-test-'));
    statusFile = join(directory, 'status.json');
    configFile = join(directory, 'rclone.conf');
    await writeFile(configFile, '[drive-crypt]\ntype = crypt\n');
    remoteFiles = new Map([['daily', new Map()], ['weekly', new Map()], ['monthly', new Map()]]);
    commands = [];
    failures = new Set();
  });

  afterEach(async () => rm(directory, { recursive: true, force: true }));

  const env = () => ({
    BACKUP_DATABASE_URL: 'postgresql://backup_user:local%40password@postgres:5432/conta_clara',
    RCLONE_CONFIG: configFile,
    RCLONE_REMOTE: 'drive-crypt:',
    BACKUP_STATUS_FILE: statusFile,
    PATH: process.env.PATH,
    TZ: 'UTC',
  });

  async function execute(command, args, options = {}) {
    commands.push({ command, args, options });
    if (command === 'pg_dump') {
      const outputPath = args[args.indexOf('--file') + 1];
      await writeFile(outputPath, 'synthetic PostgreSQL dump');
      return '';
    }
    const action = args[2];
    if (failures.has(action)) throw new Error(`simulated ${action} failure`);
    const remotePath = args[3] ?? '';
    const [, rest = ''] = remotePath.split(':');
    const [bucket, fileName] = rest.split('/');
    if (action === 'mkdir') {
      if (!remoteFiles.has(bucket)) remoteFiles.set(bucket, new Map());
      return '';
    }
    if (action === 'copyto') {
      const contents = await readFile(args[3], 'utf8');
      const [, destination = ''] = args[4].split(':');
      const [destinationBucket, destinationName] = destination.split('/');
      remoteFiles.get(destinationBucket).set(destinationName, contents);
      return '';
    }
    if (action === 'cryptcheck') {
      const sourceDirectory = args[3];
      const targetDirectory = args[4];
      const [, target = ''] = targetDirectory.split(':');
      const targetBucket = target.split('/')[0];
      const { readdir } = await import('node:fs/promises');
      for (const name of await readdir(sourceDirectory)) {
        expect(remoteFiles.get(targetBucket).get(name)).toBe(await readFile(join(sourceDirectory, name), 'utf8'));
      }
      return '';
    }
    if (action === 'lsf') return [...(remoteFiles.get(bucket)?.keys() ?? [])].join('\n');
    if (action === 'deletefile') remoteFiles.get(bucket)?.delete(fileName);
    return '';
  }

  it('backs up at 03:00 São Paulo, verifies every upload, then applies retention', async () => {
    const now = new Date('2026-11-01T06:00:00.000Z'); // Sunday, 03:00 in São Paulo.
    for (const [bucket, count] of [['daily', 8], ['weekly', 5], ['monthly', 7]]) {
      for (let index = 0; index < count; index += 1) {
        const day = String(index + 1).padStart(2, '0');
        remoteFiles.get(bucket).set(`conta-clara-202501${day}T030000Z-00000000.dump`, 'old valid dump');
      }
    }

    const result = await runBackup({ env: env(), now: () => now, execute });

    expect(result).toMatchObject({ skipped: false, ok: true, status: { runState: 'success', lastSuccessDate: '2026-11-01', retentionPending: false } });
    expect(localBackupDate(now)).toBe('2026-11-01');
    expect([...remoteFiles].map(([bucket, files]) => [bucket, files.size])).toEqual([['daily', 7], ['weekly', 4], ['monthly', 6]]);
    const lastVerificationIndex = commands.map(({ args }) => args[2]).lastIndexOf('cryptcheck');
    const firstDeletionIndex = commands.map(({ args }) => args[2]).indexOf('deletefile');
    expect(lastVerificationIndex).toBeGreaterThanOrEqual(0);
    expect(firstDeletionIndex).toBeGreaterThan(lastVerificationIndex);
    const pgDump = commands.find(({ command }) => command === 'pg_dump');
    expect(pgDump.options.env).toMatchObject({ PGHOST: 'postgres', PGPORT: '5432', PGUSER: 'backup_user', PGPASSWORD: 'local@password', PGDATABASE: 'conta_clara' });
    expect(pgDump.options.env.BACKUP_DATABASE_URL).toBeUndefined();
    expect(commands.some(({ args }) => args.some((argument) => argument.includes('local@password')))).toBe(false);
  });

  it('catches up a missed scheduled run after startup and skips after today succeeds', async () => {
    const justBeforeSchedule = new Date('2026-11-01T05:59:00.000Z');
    const afterScheduledTime = new Date('2026-11-01T14:00:00.000Z');
    expect(isBackupDue({}, justBeforeSchedule)).toBe(false);
    expect(isBackupDue({}, afterScheduledTime)).toBe(true);
    expect(isBackupDue({ lastSuccessDate: '2026-11-01' }, afterScheduledTime)).toBe(false);

    const result = await runBackup({ env: env(), now: () => afterScheduledTime, execute });
    expect(result.ok).toBe(true);
    expect(result.status.lastSuccessDate).toBe('2026-11-01');
  });

  it('preserves the previous valid backup and does not prune when the Drive is unavailable', async () => {
    const previousSuccess = '2026-10-31T06:00:00.000Z';
    const previousFile = 'conta-clara-20261031T060000Z-00000000.dump';
    remoteFiles.get('daily').set(previousFile, 'last valid backup');
    await writeFile(statusFile, JSON.stringify({
      version: 1,
      runState: 'success',
      lastSuccessAt: previousSuccess,
      lastSuccessDate: '2026-10-31',
      retentionPending: false,
    }));
    failures.add('mkdir');

    const result = await runBackup({ env: env(), now: () => new Date('2026-11-01T06:00:00.000Z'), execute });

    expect(result).toMatchObject({ ok: false, status: { runState: 'failed', lastSuccessAt: previousSuccess, lastFailureCode: 'drive_upload' } });
    expect(remoteFiles.get('daily').get(previousFile)).toBe('last valid backup');
    expect(commands.some(({ args }) => args[2] === 'deletefile')).toBe(false);
    expect(commands.some(({ command }) => command === 'pg_dump')).toBe(false);
  });

  it('retries failed retention without creating or replacing another dump', async () => {
    failures.add('deletefile');
    const now = new Date('2026-11-01T06:00:00.000Z');
    for (let index = 1; index <= 8; index += 1) {
      const day = String(index).padStart(2, '0');
      remoteFiles.get('daily').set(`conta-clara-202501${day}T030000Z-00000000.dump`, 'old valid dump');
    }
    const result = await runBackup({ env: env(), now: () => now, execute });

    expect(result).toMatchObject({ ok: true, status: { runState: 'warning', lastSuccessDate: '2026-11-01', retentionPending: true, lastFailureCode: 'retention' } });
    const dumpCount = commands.filter(({ command }) => command === 'pg_dump').length;
    failures.clear();
    const retry = await runBackup({ env: env(), now: () => new Date(now.getTime() + 16 * 60_000), execute });

    expect(retry).toMatchObject({ ok: true, maintenance: true, status: { runState: 'success', retentionPending: false } });
    expect(commands.filter(({ command }) => command === 'pg_dump')).toHaveLength(dumpCount);
  });
});
