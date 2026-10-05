import pg from 'pg';

const { Pool } = pg;

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL não foi definida. Configure o banco conforme docs/database.md.');
  }

  return new Pool({
    connectionString,
    application_name: 'conta-clara',
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
