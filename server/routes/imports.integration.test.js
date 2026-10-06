// @vitest-environment node
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

describe.skipIf(!testDatabaseUrl)('spreadsheet import route with PostgreSQL', () => {
  let pool;
  let app;
  let browser;
  let csrfToken;
  let sessionCookie;
  let expenseCategoryId;
  let investmentCategoryId;
  let incomeCategoryId;
  let paymentMethodId;

  beforeAll(async () => {
    const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
    if (!/_test$/.test(databaseName)) throw new Error('TEST_DATABASE_URL deve apontar para um banco descartável com sufixo _test.');
    pool = createPool(testDatabaseUrl);
    await migrate(pool);
    await pool.query('TRUNCATE users CASCADE');
    app = createApp({ pool, loginLimit: 100 });
    browser = request.agent(app);
    const state = await browser.get('/api/auth/state').set('Host', 'conta-clara.test').set('Origin', origin).expect(200);
    csrfToken = state.body.csrfToken;
    const setup = await browser.post('/api/auth/setup').set('Host', 'conta-clara.test').set('Origin', origin).set('X-CSRF-Token', csrfToken)
      .send({ displayName: 'Admin importação', email: 'admin-import@example.test', password: 'senha-admin-importacao-ficticia-123' }).expect(201);
    sessionCookie = setup.headers['set-cookie'].find((value) => value.startsWith('cc_session=')).split(';', 1)[0];
    const expense = await sameOrigin('post', '/api/catalog/categories').send({ name: 'Casa teste', kind: 'expense', expenseClass: 'fixed' }).expect(201);
    expenseCategoryId = expense.body.category.id;
    const investment = await sameOrigin('post', '/api/catalog/categories').send({ name: 'Aporte teste', kind: 'investment', expenseClass: null }).expect(201);
    investmentCategoryId = investment.body.category.id;
    const income = await sameOrigin('post', '/api/catalog/categories').send({ name: 'Renda teste', kind: 'income', expenseClass: null }).expect(201);
    incomeCategoryId = income.body.category.id;
    const payment = await sameOrigin('post', '/api/catalog/payment-methods').send({ name: 'Pix teste' }).expect(201);
    paymentMethodId = payment.body.paymentMethod.id;
  });

  afterAll(async () => {
    if (pool) await pool.query('TRUNCATE users CASCADE');
    await pool?.end();
  });

  function sameOrigin(method, path) {
    return browser[method](path).set('Host', 'conta-clara.test').set('Origin', origin).set('X-CSRF-Token', csrfToken);
  }

  function validEntries() {
    return [
      { kind: 'expense', description: 'Conta fictícia de teste', categoryId: expenseCategoryId, competenceOn: '2026-10-01', dueOn: '2026-10-18', plannedCents: 12590, actualCents: null, realizedOn: null, paymentMethodId, notes: null },
      { kind: 'investment', description: 'Aporte fictício de teste', categoryId: investmentCategoryId, competenceOn: '2026-10-01', dueOn: '2026-10-20', plannedCents: 50000, actualCents: null, realizedOn: null, paymentMethodId: null, notes: null },
      { kind: 'income', description: 'Receita fictícia de teste', categoryId: incomeCategoryId, competenceOn: '2026-11-01', dueOn: null, plannedCents: 250000, actualCents: null, realizedOn: null, paymentMethodId: null, notes: null },
    ];
  }

  it('validates the confirmation, records a shared audited batch atomically, and blocks duplicate imports', async () => {
    await request(app).post('/api/imports').set('Host', 'conta-clara.test').set('Origin', origin).send({ entries: validEntries() }).expect(401);
    await browser.post('/api/imports').set('Host', 'conta-clara.test').set('Origin', origin).send({ entries: validEntries() }).expect(403);
    await sameOrigin('post', '/api/imports').send({ entries: [{ ...validEntries()[0], competenceOn: '2026-10-02' }] }).expect(400);
    await sameOrigin('post', '/api/imports').send({ entries: [{ ...validEntries()[0], categoryId: investmentCategoryId }] }).expect(400);

    const payload = { entries: validEntries() };
    const imported = await sameOrigin('post', '/api/imports').send(payload).expect(201);
    expect(imported.body.batch).toMatchObject({ item_count: 3 });
    expect(imported.body.batch.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(imported.body.entries).toHaveLength(3);
    const stored = await pool.query(`
      SELECT e.kind, e.description, e.created_by_user_id, a.action, a.actor_display_name
      FROM financial_entries e JOIN financial_entry_audit a ON a.entry_id = e.id
      WHERE e.description IN ('Conta fictícia de teste', 'Aporte fictício de teste', 'Receita fictícia de teste')
      ORDER BY e.kind
    `);
    expect(stored.rows).toHaveLength(3);
    expect(stored.rows.map((row) => row.action)).toEqual(['created', 'created', 'created']);
    expect(stored.rows.every((row) => row.created_by_user_id && row.actor_display_name === 'Admin importação')).toBe(true);

    await sameOrigin('post', '/api/imports').send({ entries: [...payload.entries].reverse() }).expect(409);
    const afterDuplicate = await pool.query('SELECT (SELECT count(*)::int FROM financial_entries) AS entries, (SELECT count(*)::int FROM spreadsheet_import_batches) AS batches');
    expect(afterDuplicate.rows[0]).toEqual({ entries: 3, batches: 1 });

    await pool.query(`
      CREATE FUNCTION fail_one_import_row() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.description = 'Falha fictícia de teste' THEN RAISE EXCEPTION 'import integration test'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_one_import_row_trigger BEFORE INSERT ON financial_entries FOR EACH ROW EXECUTE FUNCTION fail_one_import_row();
    `);
    try {
      const rollbackPayload = { entries: [
        { ...validEntries()[0], description: 'Linha válida antes da falha', dueOn: null },
        { ...validEntries()[0], description: 'Falha fictícia de teste', dueOn: null },
      ] };
      await sameOrigin('post', '/api/imports').send(rollbackPayload).expect(500);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS fail_one_import_row_trigger ON financial_entries; DROP FUNCTION IF EXISTS fail_one_import_row();');
    }
    const afterRollback = await pool.query(`
      SELECT count(*)::int AS entries,
        (SELECT count(*)::int FROM spreadsheet_import_batches) AS batches,
        (SELECT count(*)::int FROM financial_entry_audit) AS events
      FROM financial_entries
    `);
    expect(afterRollback.rows[0]).toEqual({ entries: 3, batches: 1, events: 3 });
  });
});
