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
    const user = await pool.query('INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id', [
      `${unique}@example.test`,
      `Pessoa ${label}`,
      'synthetic-test-hash',
    ]);
    const space = await pool.query('INSERT INTO finance_spaces (name, created_by_user_id) VALUES ($1, $2) RETURNING id', [
      `Espaço ${label}`,
      user.rows[0].id,
    ]);
    await pool.query('INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, $3)', [
      space.rows[0].id,
      user.rows[0].id,
      'admin',
    ]);
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
    expect(status.find(({ name }) => name === '007_spreadsheet_import_batches.sql')?.status).toBe('applied');
    expect(status.find(({ name }) => name === '008_entry_versions_and_sync_receipts.sql')?.status).toBe('applied');
    expect(status.find(({ name }) => name === '009_credit_cards.sql')?.status).toBe('applied');
    expect(status.find(({ name }) => name === '010_card_purchases.sql')?.status).toBe('applied');
    expect(status.find(({ name }) => name === '011_card_invoices.sql')?.status).toBe('applied');
    expect(status.find(({ name }) => name === '012_recurrence_skip_reason.sql')?.status).toBe('applied');
  });

  it('applies every migration from a clean isolated schema', async () => {
    const schema = `migration_${randomUUID().replaceAll('-', '')}`;
    await pool.query(`CREATE SCHEMA ${schema}`);
    const isolatedUrl = new URL(testDatabaseUrl);
    isolatedUrl.searchParams.set('options', `-c search_path=${schema},public`);
    const isolatedPool = createPool(isolatedUrl.toString());
    try {
      await migrate(isolatedPool);
      const status = await migrationStatus(isolatedPool);
      expect(status).toHaveLength(12);
      expect(status.every(({ status: migrationState }) => migrationState === 'applied')).toBe(true);
      const schemaTables = await isolatedPool.query(`
        SELECT to_regclass('users') AS users, to_regclass('credit_cards') AS credit_cards,
          to_regclass('card_purchases') AS card_purchases, to_regclass('card_invoices') AS card_invoices
      `);
      expect(schemaTables.rows[0]).toEqual({
        users: 'users',
        credit_cards: 'credit_cards',
        card_purchases: 'card_purchases',
        card_invoices: 'card_invoices',
      });
    } finally {
      await isolatedPool.end();
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });

  it('backfills one invoice when different members created purchases for the same card and month', async () => {
    // Simulate upgrading a database that has purchases but has not applied migration 011.
    await pool.query('DROP TABLE card_invoices');
    await pool.query("DELETE FROM schema_migrations WHERE version = '011'");

    const household = await createSpace('fatura-retroativa');
    const secondUser = await pool.query('INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id', [
      `${randomUUID()}@example.test`,
      'Pessoa membro',
      'synthetic-test-hash',
    ]);
    const secondUserId = secondUser.rows[0].id;
    await pool.query('INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, $3)', [
      household.spaceId,
      secondUserId,
      'member',
    ]);
    const category = await pool.query("INSERT INTO categories (space_id, name, kind) VALUES ($1, $2, 'expense') RETURNING id", [
      household.spaceId,
      'Compras de teste',
    ]);
    const card = await pool.query(
      `
      INSERT INTO credit_cards (
        space_id, name, holder_user_id, closing_day, due_day, created_by_user_id, updated_by_user_id
      ) VALUES ($1, 'Cartão fictício', $2, 25, 5, $3, $3) RETURNING id
    `,
      [household.spaceId, household.userId, household.userId],
    );
    const purchases = [];
    for (const [userId, amount] of [
      [household.userId, 10000],
      [secondUserId, 20000],
    ]) {
      const purchase = await pool.query(
        `
        INSERT INTO card_purchases (
          space_id, card_id, description, category_id, purchase_on, first_invoice_on,
          total_cents, installment_count, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, 'Compra fictícia', $3, '2026-10-10', '2026-11-01', $4, 1, $5, $5)
        RETURNING id
      `,
        [household.spaceId, card.rows[0].id, category.rows[0].id, amount, userId],
      );
      purchases.push({ id: purchase.rows[0].id, amount, userId });
    }
    for (const purchase of purchases) {
      await pool.query(
        `
        INSERT INTO financial_entries (
          space_id, created_by_user_id, updated_by_user_id, kind, description, category_id,
          competence_on, due_on, planned_cents, actual_cents, realized_on, card_purchase_id,
          installment_number, installment_count
        ) VALUES ($1, $2, $2, 'expense', 'Parcela fictícia', $3, '2026-11-01', '2026-11-05',
          $4, $4, $5, $6, 1, 1)
      `,
        [
          household.spaceId,
          purchase.userId,
          category.rows[0].id,
          purchase.amount,
          purchase.userId === household.userId ? '2026-11-05' : '2026-11-06',
          purchase.id,
        ],
      );
    }

    await migrate(pool);

    const invoices = await pool.query(
      `
      SELECT status, actual_cents, to_char(paid_on, 'YYYY-MM-DD') AS paid_on
      FROM card_invoices
      WHERE space_id = $1 AND card_id = $2 AND invoice_month = '2026-11-01'
    `,
      [household.spaceId, card.rows[0].id],
    );
    expect(invoices.rows).toEqual([{ status: 'paid', actual_cents: '30000', paid_on: '2026-11-06' }]);
  });

  it('preserves existing manual recurrence skips when adding the skip reason migration', async () => {
    const household = await createSpace('pulo-manual-retroativo');
    const category = await pool.query(
      "INSERT INTO categories (space_id, name, kind) VALUES ($1, 'Moradia fictícia', 'expense') RETURNING id",
      [household.spaceId],
    );
    const rule = await pool.query(
      `
      INSERT INTO recurrence_rules (
        space_id, created_by_user_id, updated_by_user_id, kind, description,
        category_id, start_competence_on, planned_cents
      ) VALUES ($1, $2, $2, 'expense', 'Conta fictícia', $3, '2026-10-01', 10000)
      RETURNING id
    `,
      [household.spaceId, household.userId, category.rows[0].id],
    );
    const entry = await pool.query(
      `
      INSERT INTO financial_entries (
        space_id, created_by_user_id, updated_by_user_id, kind, description,
        category_id, competence_on, planned_cents, recurrence_rule_id, recurrence_skipped
      ) VALUES ($1, $2, $2, 'expense', 'Conta fictícia', $3, '2026-10-01', 10000, $4, true)
      RETURNING id
    `,
      [household.spaceId, household.userId, category.rows[0].id, rule.rows[0].id],
    );

    await pool.query('ALTER TABLE financial_entries DROP CONSTRAINT financial_entries_recurrence_skip_reason_check');
    await pool.query('ALTER TABLE financial_entries DROP COLUMN recurrence_skip_reason');
    await pool.query("DELETE FROM schema_migrations WHERE version = '012'");
    await migrate(pool);

    const backfilled = await pool.query('SELECT recurrence_skipped, recurrence_skip_reason FROM financial_entries WHERE id = $1', [
      entry.rows[0].id,
    ]);
    expect(backfilled.rows).toEqual([{ recurrence_skipped: true, recurrence_skip_reason: 'user' }]);
  });

  it('rejects cross-space categories, invalid money, and non-month competence dates', async () => {
    const household = await createSpace('um');
    const other = await createSpace('dois');
    const otherCategory = await pool.query('INSERT INTO categories (space_id, name, kind) VALUES ($1, $2, $3) RETURNING id', [
      other.spaceId,
      'Categoria de teste',
      'expense',
    ]);

    const insertEntry = ({ categoryId = null, competenceOn = '2026-10-01', plannedCents = 25000 } = {}) =>
      pool.query(
        `
      INSERT INTO financial_entries (
        space_id, created_by_user_id, updated_by_user_id, kind, description,
        category_id, competence_on, planned_cents
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
        [household.spaceId, household.userId, household.userId, 'expense', 'Item fictício', categoryId, competenceOn, plannedCents],
      );

    await expect(insertEntry({ categoryId: otherCategory.rows[0].id })).rejects.toMatchObject({ code: '23503' });
    await expect(insertEntry({ plannedCents: -1 })).rejects.toMatchObject({ code: '23514' });
    await expect(insertEntry({ competenceOn: '2026-10-15' })).rejects.toMatchObject({ code: '23514' });

    await insertEntry();
    const count = await pool.query('SELECT count(*)::integer AS count FROM financial_entries WHERE space_id = $1', [household.spaceId]);
    expect(count.rows[0].count).toBe(1);
  });
});
