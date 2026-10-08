import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const lockKey = 1717170001;

export async function getMigrationFiles(directory = migrationDirectory) {
  const names = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(path.join(directory, name), 'utf8');
      return {
        version: name.split('_', 1)[0],
        name,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
}

export async function migrate(pool, directory = migrationDirectory) {
  const client = await pool.connect();
  let lockHeld = false;
  try {
    await client.query('SELECT pg_advisory_lock($1, 1)', [lockKey]);
    lockHeld = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL UNIQUE,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = await getMigrationFiles(directory);
    const { rows } = await client.query('SELECT version, name, checksum FROM schema_migrations ORDER BY version');
    const appliedByVersion = new Map(rows.map((row) => [row.version, row]));
    const fileVersions = new Set(files.map((file) => file.version));

    for (const applied of rows) {
      if (!fileVersions.has(applied.version)) {
        throw new Error(`Arquivo da migração aplicada ${applied.name} não existe mais.`);
      }
    }

    for (const file of files) {
      const applied = appliedByVersion.get(file.version);
      if (applied) {
        if (applied.name !== file.name || applied.checksum !== file.checksum) {
          throw new Error(`A migração aplicada ${file.name} foi alterada; crie uma nova migração em vez de editá-la.`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
          file.version,
          file.name,
          file.checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return files.map(({ version, name }) => ({ version, name }));
  } finally {
    if (lockHeld) await client.query('SELECT pg_advisory_unlock($1, 1)', [lockKey]);
    client.release();
  }
}

export async function migrationStatus(pool, directory = migrationDirectory) {
  const files = await getMigrationFiles(directory);
  const client = await pool.connect();
  try {
    let appliedByVersion;
    try {
      const { rows } = await client.query('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version');
      appliedByVersion = new Map(rows.map((row) => [row.version, row]));
    } catch (error) {
      if (error.code !== '42P01') throw error;
      appliedByVersion = new Map();
    }

    return files.map(({ version, name, checksum }) => {
      const applied = appliedByVersion.get(version);
      return {
        version,
        name,
        status: !applied ? 'pending' : applied.name === name && applied.checksum === checksum ? 'applied' : 'modified',
        appliedAt: applied?.applied_at ?? null,
      };
    });
  } finally {
    client.release();
  }
}
