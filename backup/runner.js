import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const zone = 'America/Sao_Paulo';
const scheduleHour = 3;
const retryMs = 15 * 60 * 1000;
const retentionRules = [
  { directory: 'daily', keep: 7 },
  { directory: 'weekly', keep: 4 },
  { directory: 'monthly', keep: 6 },
];

const publicFailureMessages = {
  configuration: 'A configuração do Google Drive ou da criptografia não está disponível.',
  database_dump: 'Não foi possível criar o dump do PostgreSQL.',
  drive_upload: 'Não foi possível enviar o backup ao Google Drive.',
  upload_verification: 'O arquivo enviado não passou na verificação de integridade.',
  retention: 'O backup novo foi validado, mas a retenção não pôde ser aplicada.',
};

function partsInZone(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
}

export function localBackupDate(date) {
  const parts = partsInZone(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localBackupPeriod(date, period) {
  const parts = partsInZone(date);
  if (period === 'month') return `${parts.year}-${parts.month}`;
  const monday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export function isBackupDue(status, date) {
  const parts = partsInZone(date);
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  return Number(parts.hour) >= scheduleHour && status?.lastSuccessDate !== today;
}

function isRetentionDue(status, date) {
  if (!status?.retentionPending || !status.lastSuccessDate || status.lastSuccessDate !== localBackupDate(date)) return false;
  if (!status.lastRetentionAttemptAt) return true;
  const lastAttempt = Date.parse(status.lastRetentionAttemptAt);
  return !Number.isFinite(lastAttempt) || date.getTime() - lastAttempt >= retryMs;
}

function emptyStatus() {
  return {
    version: 1,
    runState: 'never',
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastSuccessDate: null,
    lastFailureAt: null,
    lastFailureCode: null,
    retentionPending: false,
    lastRetentionAttemptAt: null,
    lastWeeklyPeriod: null,
    lastMonthlyPeriod: null,
  };
}

function normalizeStatus(status) {
  const base = emptyStatus();
  return {
    ...base,
    ...Object.fromEntries(Object.keys(base).filter((key) => Object.hasOwn(status ?? {}, key)).map((key) => [key, status[key]])),
  };
}

async function readStatus(statusFile) {
  try {
    return normalizeStatus(JSON.parse(await readFile(statusFile, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return emptyStatus();
    if (error instanceof SyntaxError) return emptyStatus();
    throw error;
  }
}

async function writeStatus(statusFile, status) {
  await mkdir(dirname(statusFile), { recursive: true });
  const temporaryFile = `${statusFile}.${randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(normalizeStatus(status), null, 2)}\n`, { mode: 0o644 });
  await rename(temporaryFile, statusFile);
}

function connectionEnvironment(databaseUrl, parentEnv = process.env) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('invalid_database_url');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1)) {
    throw new Error('invalid_database_url');
  }
  const env = { ...parentEnv };
  delete env.DATABASE_URL;
  delete env.BACKUP_DATABASE_URL;
  delete env.MIGRATION_DATABASE_URL;
  return {
    ...env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGCONNECT_TIMEOUT: '15',
    ...(parsed.searchParams.has('sslmode') ? { PGSSLMODE: parsed.searchParams.get('sslmode') } : {}),
  };
}

function spawnCommand(command, args, { env = process.env, stdoutPath } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    let streamError;
    let stream;
    let exitCode;
    let streamFinished = !stdoutPath;
    const finish = () => {
      if (exitCode === undefined || !streamFinished) return;
      if (streamError) return reject(streamError);
      if (exitCode !== 0) return reject(new Error(`${command}_failed`));
      resolve(output);
    };
    if (stdoutPath) {
      stream = createWriteStream(stdoutPath, { mode: 0o600 });
      child.stdout.pipe(stream);
      stream.on('finish', () => { streamFinished = true; finish(); });
      stream.on('error', (error) => { streamError = error; child.kill(); finish(); });
    } else {
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.length > 2_000_000) child.kill();
      });
    }
    child.on('error', reject);
    child.on('close', (code) => { exitCode = code; finish(); });
  });
}

async function runRetention({ execute, remote, config, status, now, env = process.env }) {
  status.lastRetentionAttemptAt = now.toISOString();
  for (const { directory, keep } of retentionRules) {
    const output = await execute('rclone', [
      '--config', config,
      'lsf', `${remote}${directory}`,
      '--files-only', '--format', 'p',
    ], { env });
    const files = output
      .split(/\r?\n/u)
      .filter((name) => /^conta-clara-\d{8}T\d{6}Z-[a-f0-9]{8}\.dump$/u.test(name))
      .sort((left, right) => right.localeCompare(left, 'en'));
    for (const oldFile of files.slice(keep)) {
      await execute('rclone', ['--config', config, 'deletefile', `${remote}${directory}/${oldFile}`], { env });
    }
  }
  status.retentionPending = false;
  status.runState = 'success';
}

function backupErrorCode(error) {
  return typeof error?.backupCode === 'string' ? error.backupCode : 'drive_upload';
}

function backupError(code) {
  const error = new Error(publicFailureMessages[code]);
  error.backupCode = code;
  return error;
}

export async function runBackup({
  env = process.env,
  now = () => new Date(),
  execute = spawnCommand,
  statusFile = env.BACKUP_STATUS_FILE ?? '/status/status.json',
  force = false,
} = {}) {
  const currentTime = now();
  const status = await readStatus(statusFile);
  if (!force && isRetentionDue(status, currentTime)) {
    status.runState = 'running';
    status.lastAttemptAt = currentTime.toISOString();
    await writeStatus(statusFile, status);
    try {
      const config = env.RCLONE_CONFIG ?? '/run/rclone/rclone.conf';
      const remote = env.RCLONE_REMOTE ?? 'conta-clara-crypt:';
      if (!(env.BACKUP_DATABASE_URL ?? env.DATABASE_URL) || !config || !remote || !remote.endsWith(':')) throw backupError('configuration');
      const rcloneEnv = { ...env };
      delete rcloneEnv.DATABASE_URL;
      delete rcloneEnv.BACKUP_DATABASE_URL;
      delete rcloneEnv.MIGRATION_DATABASE_URL;
      await runRetention({ execute, remote, config, status, now: currentTime, env: rcloneEnv });
      await writeStatus(statusFile, status);
      return { skipped: false, ok: true, maintenance: true, status };
    } catch (error) {
      status.runState = 'warning';
      status.retentionPending = true;
      status.lastFailureAt = currentTime.toISOString();
      status.lastFailureCode = backupErrorCode(error) === 'drive_upload' ? 'retention' : backupErrorCode(error);
      await writeStatus(statusFile, status);
      return { skipped: false, ok: false, maintenance: true, status };
    }
  }
  if (!force && !isBackupDue(status, currentTime)) return { skipped: true, ok: true, status };

  const attemptAt = currentTime.toISOString();
  status.runState = 'running';
  status.lastAttemptAt = attemptAt;
  await writeStatus(statusFile, status);

  let directory;
  let dumpFile;
  try {
    // mkdtemp gives this run a unique private directory on the container tmpfs.
    directory = await mkdtemp(join(tmpdir(), 'conta-clara-backup-'));
    dumpFile = join(directory, 'conta-clara.dump');
    const config = env.RCLONE_CONFIG ?? '/run/rclone/rclone.conf';
    const remote = env.RCLONE_REMOTE ?? 'conta-clara-crypt:';
    const databaseUrl = env.BACKUP_DATABASE_URL ?? env.DATABASE_URL;
    if (!databaseUrl || !remote.endsWith(':')) throw backupError('configuration');
    try {
      await readFile(config);
    } catch {
      throw backupError('configuration');
    }
    const rcloneEnv = { ...env };
    delete rcloneEnv.DATABASE_URL;
    delete rcloneEnv.BACKUP_DATABASE_URL;
    delete rcloneEnv.MIGRATION_DATABASE_URL;
    const runRclone = (args) => execute('rclone', ['--config', config, ...args], { env: rcloneEnv });

    try {
      for (const { directory: bucket } of retentionRules) await runRclone(['mkdir', `${remote}${bucket}`]);
    } catch {
      throw backupError('drive_upload');
    }

    try {
      await execute('pg_dump', [
        '--format=custom', '--no-owner', '--no-privileges', '--file', dumpFile,
      ], { env: connectionEnvironment(databaseUrl, env) });
    } catch {
      throw backupError('database_dump');
    }

    const buckets = ['daily'];
    const weeklyPeriod = localBackupPeriod(currentTime, 'week');
    const monthlyPeriod = localBackupPeriod(currentTime, 'month');
    if (status.lastWeeklyPeriod !== weeklyPeriod) buckets.push('weekly');
    if (status.lastMonthlyPeriod !== monthlyPeriod) buckets.push('monthly');
    const stamp = currentTime.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
    const fileName = `conta-clara-${stamp}-${randomUUID().slice(0, 8)}.dump`;
    const sourceDirectory = join(directory, 'verify');
    await mkdir(sourceDirectory);
    const sourceFile = join(sourceDirectory, fileName);
    await copyFile(dumpFile, sourceFile);

    for (const bucket of buckets) {
      const remoteFile = `${remote}${bucket}/${fileName}`;
      try {
        await runRclone(['copyto', dumpFile, remoteFile]);
      } catch {
        throw backupError('drive_upload');
      }
      try {
        await runRclone(['cryptcheck', sourceDirectory, `${remote}${bucket}`, '--one-way']);
      } catch {
        throw backupError('upload_verification');
      }
    }

    status.lastSuccessAt = attemptAt;
    status.lastSuccessDate = localBackupDate(currentTime);
    if (buckets.includes('weekly')) status.lastWeeklyPeriod = weeklyPeriod;
    if (buckets.includes('monthly')) status.lastMonthlyPeriod = monthlyPeriod;
    status.runState = 'success';
    status.retentionPending = true;
    await writeStatus(statusFile, status);

    try {
      await runRetention({ execute, remote, config, status, now: currentTime, env: rcloneEnv });
    } catch {
      status.runState = 'warning';
      status.retentionPending = true;
      status.lastFailureAt = currentTime.toISOString();
      status.lastFailureCode = 'retention';
      await writeStatus(statusFile, status);
      return { skipped: false, ok: true, status };
    }
    await writeStatus(statusFile, status);
    return { skipped: false, ok: true, status };
  } catch (error) {
    const code = backupErrorCode(error);
    status.runState = 'failed';
    status.lastFailureAt = attemptAt;
    status.lastFailureCode = code;
    await writeStatus(statusFile, status);
    return { skipped: false, ok: false, status };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

async function schedule() {
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  while (!stopping) {
    const status = await readStatus(process.env.BACKUP_STATUS_FILE ?? '/status/status.json');
    const now = new Date();
    if (isBackupDue(status, now) || isRetentionDue(status, now)) {
      const result = await runBackup();
      await sleep(result.ok ? 60_000 : retryMs);
    } else {
      await sleep(60_000);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--run-once')) {
    const result = await runBackup({ force: true });
    process.exitCode = result.ok ? 0 : 1;
  } else {
    await schedule();
  }
}
