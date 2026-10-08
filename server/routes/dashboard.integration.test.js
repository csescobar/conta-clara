// @vitest-environment node
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { createSession } from './auth.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

function shiftDate(value, offset) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(value, offset) {
  const [year, month] = value.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
}

describe.skipIf(!testDatabaseUrl)('dashboard routes with PostgreSQL', () => {
  let pool;
  let app;

  beforeAll(async () => {
    const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
    if (!/_test$/.test(databaseName)) throw new Error('TEST_DATABASE_URL deve apontar para um banco descartável com sufixo _test.');
    pool = createPool(testDatabaseUrl);
    await migrate(pool);
    await pool.query('TRUNCATE users CASCADE');
    app = createApp({ pool, loginLimit: 100 });
  });

  afterAll(async () => {
    if (pool) await pool.query('TRUNCATE users CASCADE');
    await pool?.end();
  });

  function sameOrigin(agent, method, path, csrfToken) {
    let call = agent[method](path).set('Host', 'conta-clara.test').set('Origin', origin);
    if (csrfToken) call = call.set('X-CSRF-Token', csrfToken);
    return call;
  }

  function cookieValue(response, name) {
    return response.headers['set-cookie']
      ?.find((value) => value.startsWith(`${name}=`))
      ?.split(';', 1)[0]
      .slice(name.length + 1);
  }

  function sessionRequest(method, path, sessionToken, csrfToken) {
    return request(app)
      [method](path)
      .set('Host', 'conta-clara.test')
      .set('Origin', origin)
      .set('Cookie', `cc_session=${sessionToken}; cc_csrf=${csrfToken}`);
  }

  async function createOtherSpace() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, display_name, password_hash) VALUES ('dashboard-other@example.test', 'Outra administradora', 'integration-test-only') RETURNING id",
      );
      const space = await client.query(
        "INSERT INTO finance_spaces (name, created_by_user_id) VALUES ('Outro espaço do painel', $1) RETURNING id",
        [user.rows[0].id],
      );
      await client.query("INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, 'admin')", [
        space.rows[0].id,
        user.rows[0].id,
      ]);
      const sessionToken = await createSession(client, { user_id: user.rows[0].id, space_id: space.rows[0].id });
      await client.query('COMMIT');
      return { sessionToken };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  it('separates competence from realization month, handles empty/year-boundary months, and scopes totals', async () => {
    const browser = request.agent(app);
    const state = await sameOrigin(browser, 'get', '/api/auth/state').expect(200);
    const setup = await sameOrigin(browser, 'post', '/api/auth/setup', state.body.csrfToken)
      .send({ displayName: 'Admin painel', email: 'admin-dashboard@example.test', password: 'senha-admin-dashboard-ficticia-123' })
      .expect(201);
    const admin = setup.body.user;
    const session = cookieValue(setup, 'cc_session');
    const otherSpace = await createOtherSpace();

    const categoryResult = await pool.query(
      `
      INSERT INTO categories (space_id, name, kind, expense_class)
      VALUES ($1, $2, 'expense', 'variable')
      RETURNING id, name
    `,
      [admin.spaceId, 'Moradia'],
    );
    const homeCategoryId = categoryResult.rows[0].id;
    const foodCategory = await pool.query(
      `
      INSERT INTO categories (space_id, name, kind, expense_class)
      VALUES ($1, 'Alimentação', 'expense', 'variable')
      RETURNING id
    `,
      [admin.spaceId],
    );
    const foodCategoryId = foodCategory.rows[0].id;

    const insertEntry = ({
      kind,
      description,
      competenceOn,
      dueOn = null,
      plannedCents,
      actualCents = null,
      realizedOn = null,
      categoryId = null,
    }) =>
      pool.query(
        `
      INSERT INTO financial_entries (
        space_id, created_by_user_id, updated_by_user_id, kind, description,
        category_id, competence_on, due_on, planned_cents, actual_cents, realized_on
      ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `,
        [admin.spaceId, admin.id, kind, description, categoryId, competenceOn, dueOn, plannedCents, actualCents, realizedOn],
      );

    await insertEntry({
      kind: 'income',
      description: 'Receita prevista em dezembro',
      competenceOn: '2025-12-01',
      dueOn: '2025-12-05',
      plannedCents: 100000,
      actualCents: 95000,
      realizedOn: '2026-01-05',
    });
    await insertEntry({
      kind: 'income',
      description: 'Receita de competência anterior',
      competenceOn: '2025-11-01',
      dueOn: '2025-12-02',
      plannedCents: 20000,
      actualCents: 12000,
      realizedOn: '2025-12-30',
    });
    await insertEntry({
      kind: 'expense',
      description: 'Moradia',
      competenceOn: '2025-12-01',
      dueOn: '2025-12-20',
      plannedCents: 30000,
      actualCents: 28000,
      realizedOn: '2025-12-31',
      categoryId: homeCategoryId,
    });
    await insertEntry({
      kind: 'expense',
      description: 'Mercado',
      competenceOn: '2025-11-01',
      dueOn: '2025-11-20',
      plannedCents: 14000,
      actualCents: 12000,
      realizedOn: '2025-12-30',
      categoryId: foodCategoryId,
    });
    await insertEntry({ kind: 'investment', description: 'Aporte', competenceOn: '2025-12-01', plannedCents: 10000 });
    await insertEntry({ kind: 'income', description: 'Renda em aberto', competenceOn: '2025-12-01', plannedCents: 5000 });

    const todayResult = await pool.query("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS today");
    const today = todayResult.rows[0].today;
    const currentMonth = `${today.slice(0, 7)}-01`;
    await insertEntry({
      kind: 'expense',
      description: 'Conta próxima',
      competenceOn: currentMonth,
      dueOn: shiftDate(today, 2),
      plannedCents: 9990,
    });
    await insertEntry({
      kind: 'expense',
      description: 'Conta atrasada',
      competenceOn: currentMonth,
      dueOn: shiftDate(today, -1),
      plannedCents: 5490,
    });
    await insertEntry({
      kind: 'expense',
      description: 'Conta já paga',
      competenceOn: currentMonth,
      dueOn: shiftDate(today, 1),
      plannedCents: 4000,
      actualCents: 4000,
      realizedOn: today,
    });
    await insertEntry({
      kind: 'expense',
      description: 'Conta além do horizonte',
      competenceOn: currentMonth,
      dueOn: shiftDate(today, 8),
      plannedCents: 12000,
    });

    const december = await sessionRequest('get', '/api/dashboard?month=2025-12', session, state.body.csrfToken).expect(200);
    expect(december.body).toMatchObject({
      month: '2025-12-01',
      planned: { incomeCents: '105000', expenseCents: '30000', investmentCents: '10000', resultCents: '65000' },
      realized: { incomeCents: '12000', expenseCents: '40000', investmentCents: '0', resultCents: '-28000' },
      upcoming: { count: 1 },
      overdue: { count: 1 },
    });
    expect(december.body.charts.expensesByCategory).toEqual([
      { categoryId: homeCategoryId, categoryName: 'Moradia', plannedCents: '30000', realizedCents: '28000' },
      { categoryId: foodCategoryId, categoryName: 'Alimentação', plannedCents: '0', realizedCents: '12000' },
    ]);
    expect(december.body.upcoming.entries[0]).toMatchObject({
      description: 'Conta próxima',
      due_on: shiftDate(today, 2),
      planned_cents: '9990',
    });
    expect(december.body.overdue.entries[0]).toMatchObject({
      description: 'Conta atrasada',
      due_on: shiftDate(today, -1),
      planned_cents: '5490',
    });

    const january = await sessionRequest('get', '/api/dashboard?month=2026-01', session, state.body.csrfToken).expect(200);
    expect(january.body).toMatchObject({
      month: '2026-01-01',
      planned: { incomeCents: '0', expenseCents: '0', investmentCents: '0', resultCents: '0' },
      realized: { incomeCents: '95000', expenseCents: '0', investmentCents: '0', resultCents: '95000' },
    });
    expect(january.body.charts.expensesByCategory).toEqual([]);
    const empty = await sessionRequest('get', '/api/dashboard?month=2025-10', session, state.body.csrfToken).expect(200);
    expect(empty.body).toMatchObject({
      planned: { incomeCents: '0', expenseCents: '0', investmentCents: '0', resultCents: '0' },
      realized: { incomeCents: '0', expenseCents: '0', investmentCents: '0', resultCents: '0' },
    });
    expect(empty.body.charts.expensesByCategory).toEqual([]);
    await sessionRequest('get', '/api/dashboard?month=2025-13', session, state.body.csrfToken).expect(400);
    await sessionRequest('get', '/api/dashboard?month=2025-12', otherSpace.sessionToken, state.body.csrfToken)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          planned: { incomeCents: '0', expenseCents: '0', investmentCents: '0', resultCents: '0' },
          realized: { incomeCents: '0', expenseCents: '0', investmentCents: '0', resultCents: '0' },
          charts: { expensesByCategory: [] },
          upcoming: { count: 0 },
          overdue: { count: 0 },
        }),
      );
    await request(app).get('/api/dashboard?month=2025-12').set('Host', 'conta-clara.test').expect(401);

    const recurrence = await sessionRequest('post', '/api/recurrences', session, state.body.csrfToken)
      .set('X-CSRF-Token', state.body.csrfToken)
      .send({
        kind: 'expense',
        description: 'Serviço recorrente fictício',
        categoryId: homeCategoryId,
        startCompetenceOn: currentMonth,
        endCompetenceOn: shiftMonth(currentMonth, 12),
        dueDay: 15,
        plannedCents: 8790,
      })
      .expect(201);
    const nextMonth = shiftMonth(currentMonth, 1).slice(0, 7);
    const firstFuturePanel = await sessionRequest('get', `/api/dashboard?month=${nextMonth}`, session, state.body.csrfToken).expect(200);
    expect(firstFuturePanel.body).toMatchObject({
      planned: { expenseCents: '8790', resultCents: '-8790' },
      realized: { expenseCents: '0', resultCents: '0' },
      charts: { expensesByCategory: [{ categoryId: homeCategoryId, categoryName: 'Moradia', plannedCents: '8790', realizedCents: '0' }] },
    });
    const futureEntries = await sessionRequest('get', `/api/entries?month=${nextMonth}`, session, state.body.csrfToken).expect(200);
    expect(futureEntries.body.entries).toHaveLength(1);
    expect(futureEntries.body.entries[0]).toMatchObject({
      description: 'Serviço recorrente fictício',
      planned_cents: '8790',
      recurrence_rule_id: recurrence.body.rule.id,
    });
    const refreshedPanel = await sessionRequest('get', `/api/dashboard?month=${nextMonth}`, session, state.body.csrfToken).expect(200);
    expect(refreshedPanel.body.planned.expenseCents).toBe('8790');

    const beyondMonth = shiftMonth(currentMonth, 13);
    await insertEntry({
      kind: 'expense',
      description: 'Despesa manual além do horizonte',
      competenceOn: beyondMonth,
      dueOn: beyondMonth.replace('-01', '-18'),
      plannedCents: 4500,
      categoryId: homeCategoryId,
    });
    const beyondHorizon = await sessionRequest(
      'get',
      `/api/dashboard?month=${shiftMonth(currentMonth, 13).slice(0, 7)}`,
      session,
      state.body.csrfToken,
    ).expect(200);
    expect(beyondHorizon.body.planned.expenseCents).toBe('4500');
    const manualBeyondHorizon = await sessionRequest(
      'get',
      `/api/entries?month=${beyondMonth.slice(0, 7)}`,
      session,
      state.body.csrfToken,
    ).expect(200);
    expect(manualBeyondHorizon.body.entries).toHaveLength(1);
    expect(manualBeyondHorizon.body.entries[0]).toMatchObject({ description: 'Despesa manual além do horizonte', planned_cents: '4500' });
  });
});
