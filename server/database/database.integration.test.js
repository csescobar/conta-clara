// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from './connection.js';
import { migrate, migrationStatus } from './migrate.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('PostgreSQL schema integration', () => {
  let pool;

  beforeAll(async () => {
    const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
    if (!/_test$/.test(databaseName)) throw new Error('TEST_DATABASE_URL deve apontar para um banco descartável com sufixo _test.');
    pool = createPool(testDatabaseUrl);
    await migrate(pool);
  });

  afterAll(async () => {
    if (pool) await pool.query('TRUNCATE users CASCADE');
    await pool?.end();
  });

  async function createSpace(label) {
    const unique = randomUUID();
    const user = await pool.query(
      'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [`${unique}@example.test`, `Pessoa ${label}`, 'synthetic-test-hash'],
    );
    const space = await pool.query(
      'INSERT INTO finance_spaces (name, created_by_user_id) VALUES ($1, $2) RETURNING id',
      [`Espaço ${label}`, user.rows[0].id],
    );
    await pool.query(
      'INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, $3)',
      [space.rows[0].id, user.rows[0].id, 'admin'],
    );
    return { spaceId: space.rows[0].id, userId: user.rows[0].id };
  }

  it('applies the checked-in migration and is safe to run twice', async () => {
    await migrate(pool);
    const status = await migrationStatus(pool);

    expect(status.find(({ name }) => name === '001_initial_schema.sql')?.status).toBe('applied');
    expect(status.find(({ name }) => name === '002_auth_sessions.sql')?.status).toBe('applied');
    expect(status.find(({ name }) => name === '003_account_tokens.sql')?.status).toBe('applied');
    expect(status.find(({ name }) => name === '004_membership_deactivation.sql')?.status).toBe('applied');
    expect(status.find(({ name }) => name === '005_financial_entry_audit.sql')?.status).toBe('applied');
    expect(status.find(({ name }) => name === '006_monthly_recurrences.sql')?.status).toBe('applied');
  });

  it('rejects cross-space categories, invalid money, and non-month competence dates', async () => {
    const household = await createSpace('um');
    const other = await createSpace('dois');
    const otherCategory = await pool.query(
      'INSERT INTO categories (space_id, name, kind) VALUES ($1, $2, $3) RETURNING id',
      [other.spaceId, 'Categoria de teste', 'expense'],
    );

    const insertEntry = ({ categoryId = null, competenceOn = '2026-10-01', plannedCents = 25000 } = {}) => pool.query(`
      INSERT INTO financial_entries (
        space_id, created_by_user_id, updated_by_user_id, kind, description,
        category_id, competence_on, planned_cents
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [household.spaceId, household.userId, household.userId, 'expense', 'Item fictício', categoryId, competenceOn, plannedCents]);

    await expect(insertEntry({ categoryId: otherCategory.rows[0].id })).rejects.toMatchObject({ code: '23503' });
    await expect(insertEntry({ plannedCents: -1 })).rejects.toMatchObject({ code: '23514' });
    await expect(insertEntry({ competenceOn: '2026-10-15' })).rejects.toMatchObject({ code: '23514' });

    await insertEntry();
    const count = await pool.query('SELECT count(*)::integer AS count FROM financial_entries WHERE space_id = $1', [household.spaceId]);
    expect(count.rows[0].count).toBe(1);
  });
});
