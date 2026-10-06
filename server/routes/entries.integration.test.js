// @vitest-environment node
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { createSession } from './auth.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

describe.skipIf(!testDatabaseUrl)('financial entry routes with PostgreSQL', () => {
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
    return response.headers['set-cookie']?.find((value) => value.startsWith(`${name}=`))?.split(';', 1)[0].slice(name.length + 1);
  }

  function sessionRequest(method, path, sessionToken, csrfToken, body) {
    let call = request(app)[method](path)
      .set('Host', 'conta-clara.test')
      .set('Origin', origin)
      .set('Cookie', `cc_session=${sessionToken}; cc_csrf=${csrfToken}`);
    if (csrfToken) call = call.set('X-CSRF-Token', csrfToken);
    if (body !== undefined) call = call.send(body);
    return call;
  }

  async function createOtherSpace() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, display_name, password_hash) VALUES ('entries-other@example.test', 'Outra administradora', 'integration-test-only') RETURNING id",
      );
      const space = await client.query(
        "INSERT INTO finance_spaces (name, created_by_user_id) VALUES ('Outro espaço de lançamentos', $1) RETURNING id",
        [user.rows[0].id],
      );
      await client.query("INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, 'admin')", [space.rows[0].id, user.rows[0].id]);
      const sessionToken = await createSession(client, { user_id: user.rows[0].id, space_id: space.rows[0].id });
      await client.query('COMMIT');
      return { spaceId: space.rows[0].id, sessionToken };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  it('creates, edits, filters, and deletes shared entries with per-space references', async () => {
    const adminBrowser = request.agent(app);
    const adminState = await sameOrigin(adminBrowser, 'get', '/api/auth/state').expect(200);
    const setup = await sameOrigin(adminBrowser, 'post', '/api/auth/setup', adminState.body.csrfToken)
      .send({ displayName: 'Admin lançamentos', email: 'admin-entries@example.test', password: 'senha-admin-entries-ficticia-123' }).expect(201);
    const admin = setup.body.user;
    const adminSession = cookieValue(setup, 'cc_session');

    const expenseCategory = await sessionRequest('post', '/api/catalog/categories', adminSession, adminState.body.csrfToken, {
      name: 'Casa', kind: 'expense', expenseClass: 'fixed',
    }).expect(201);
    const incomeCategory = await sessionRequest('post', '/api/catalog/categories', adminSession, adminState.body.csrfToken, {
      name: 'Renda', kind: 'income', expenseClass: null,
    }).expect(201);
    const paymentMethod = await sessionRequest('post', '/api/catalog/payment-methods', adminSession, adminState.body.csrfToken, { name: 'Pix' }).expect(201);

    const invite = await sameOrigin(adminBrowser, 'post', '/api/members/invitations', adminState.body.csrfToken)
      .send({ email: 'member-entries@example.test' }).expect(201);
    const memberBrowser = request.agent(app);
    const memberState = await sameOrigin(memberBrowser, 'get', '/api/auth/state').expect(200);
    const activation = await sameOrigin(memberBrowser, 'post', '/api/auth/accept-invite', memberState.body.csrfToken)
      .send({ token: invite.body.activationPath.split('/').at(-1), displayName: 'Membro lançamentos', password: 'senha-member-entries-ficticia-123' }).expect(201);
    const member = activation.body.user;
    const memberSession = cookieValue(activation, 'cc_session');
    const otherSpace = await createOtherSpace();

    await sessionRequest('post', '/api/entries', memberSession, memberState.body.csrfToken, {
      kind: 'expense', description: 'Conta residencial', categoryId: incomeCategory.body.category.id,
      competenceOn: '2026-10-01', dueOn: '2026-10-10', plannedCents: 145600,
      paymentMethodId: paymentMethod.body.paymentMethod.id, notes: 'Observação fictícia',
    }).expect(400).expect(({ body }) => expect(body.error).toMatch(/tipo/i));
    await sessionRequest('post', '/api/entries', memberSession, memberState.body.csrfToken, {
      kind: 'expense', description: 'Conta residencial', categoryId: expenseCategory.body.category.id,
      competenceOn: '2026-10-10', dueOn: '31/02/2026', plannedCents: 145600,
      paymentMethodId: paymentMethod.body.paymentMethod.id,
    }).expect(400);
    await sessionRequest('post', '/api/entries', memberSession, memberState.body.csrfToken, {
      kind: 'expense', description: 'Conta residencial', categoryId: expenseCategory.body.category.id,
      competenceOn: '2026-10-01', dueOn: '2026-10-10', plannedCents: 145600.5,
      paymentMethodId: paymentMethod.body.paymentMethod.id,
    }).expect(400);
    await sessionRequest('post', '/api/entries', memberSession, memberState.body.csrfToken, {
      kind: 'expense', description: 'Conta residencial', categoryId: incomeCategory.body.category.id,
      competenceOn: '2026-10-01', plannedCents: 145600,
    }).expect(400);
    const otherCategory = await sessionRequest('post', '/api/catalog/categories', otherSpace.sessionToken, memberState.body.csrfToken, {
      name: 'Categoria externa', kind: 'expense', expenseClass: 'fixed',
    }).expect(201);
    await sessionRequest('post', '/api/entries', memberSession, memberState.body.csrfToken, {
      kind: 'expense', description: 'Conta externa', categoryId: otherCategory.body.category.id,
      competenceOn: '2026-10-01', plannedCents: 145600,
    }).expect(400);

    const expense = await sessionRequest('post', '/api/entries', memberSession, memberState.body.csrfToken, {
      kind: 'expense', description: 'Conta residencial', categoryId: expenseCategory.body.category.id,
      competenceOn: '2026-10-01', dueOn: '2026-10-10', plannedCents: 145600,
      paymentMethodId: paymentMethod.body.paymentMethod.id, notes: 'Observação fictícia',
    }).expect(201);
    expect(expense.body.entry).toMatchObject({
      kind: 'expense', description: 'Conta residencial', category_name: 'Casa', competence_on: '2026-10-01',
      due_on: '2026-10-10', planned_cents: '145600', payment_method_name: 'Pix', status: 'pending',
      created_by_user_id: member.id, updated_by_user_id: member.id,
    });
    const income = await sessionRequest('post', '/api/entries', adminSession, adminState.body.csrfToken, {
      kind: 'income', description: 'Salário', categoryId: incomeCategory.body.category.id,
      competenceOn: '2026-10-01', plannedCents: 780000,
    }).expect(201);
    const late = await sessionRequest('post', '/api/entries', adminSession, adminState.body.csrfToken, {
      kind: 'investment', description: 'Aporte mensal', competenceOn: '2026-10-01', dueOn: '2026-09-01', plannedCents: 50000,
    }).expect(201);
    expect(late.body.entry).toMatchObject({ kind: 'investment', category_name: null, status: 'late' });

    await sessionRequest('post', `/api/catalog/categories/${expenseCategory.body.category.id}/archive`, adminSession, adminState.body.csrfToken).expect(204);
    await sessionRequest('post', `/api/catalog/payment-methods/${paymentMethod.body.paymentMethod.id}/archive`, adminSession, adminState.body.csrfToken).expect(204);
    await sessionRequest('get', `/api/entries/${expense.body.entry.id}`, memberSession, memberState.body.csrfToken).expect(200)
      .expect(({ body }) => expect(body.entry).toMatchObject({ category_name: 'Casa', payment_method_name: 'Pix' }));
    await sessionRequest('post', '/api/entries', memberSession, memberState.body.csrfToken, {
      kind: 'expense', description: 'Novo com categoria arquivada', categoryId: expenseCategory.body.category.id,
      competenceOn: '2026-10-01', plannedCents: 1000,
    }).expect(400);
    await sessionRequest('post', '/api/entries', memberSession, memberState.body.csrfToken, {
      kind: 'expense', description: 'Novo com pagamento arquivado', competenceOn: '2026-10-01',
      plannedCents: 1000, paymentMethodId: paymentMethod.body.paymentMethod.id,
    }).expect(400);

    const sharedList = await sessionRequest('get', '/api/entries?month=2026-10', adminSession, adminState.body.csrfToken).expect(200);
    expect(sharedList.body.entries).toHaveLength(3);
    await sessionRequest('get', `/api/entries?categoryId=${expenseCategory.body.category.id}`, memberSession, memberState.body.csrfToken).expect(200)
      .expect(({ body }) => expect(body.entries.map(({ id }) => id)).toEqual([expense.body.entry.id]));
    await sessionRequest('get', '/api/entries?month=2026-10&status=pending', memberSession, memberState.body.csrfToken).expect(200)
      .expect(({ body }) => expect(body.entries.map(({ id }) => id)).toEqual([expense.body.entry.id, income.body.entry.id]));
    await sessionRequest('get', '/api/entries?month=2026-10&status=late', memberSession, memberState.body.csrfToken).expect(200)
      .expect(({ body }) => expect(body.entries.map(({ id }) => id)).toEqual([late.body.entry.id]));
    await sessionRequest('get', '/api/entries?month=2026-15', memberSession, memberState.body.csrfToken).expect(400);
    await sessionRequest('get', '/api/entries?status=unknown', memberSession, memberState.body.csrfToken).expect(400);
    await sessionRequest('get', '/api/entries', otherSpace.sessionToken, memberState.body.csrfToken).expect(200).expect(({ body }) => expect(body.entries).toEqual([]));
    await sessionRequest('get', `/api/entries/${expense.body.entry.id}`, otherSpace.sessionToken, memberState.body.csrfToken).expect(404);

    const updated = await sessionRequest('put', `/api/entries/${expense.body.entry.id}`, adminSession, adminState.body.csrfToken, {
      kind: 'expense', description: 'Moradia', categoryId: expenseCategory.body.category.id,
      competenceOn: '2026-10-01', dueOn: '2026-10-12', plannedCents: 150000,
      paymentMethodId: paymentMethod.body.paymentMethod.id, notes: null,
    }).expect(200);
    expect(updated.body.entry).toMatchObject({ description: 'Moradia', due_on: '2026-10-12', planned_cents: '150000', updated_by_user_id: admin.id });
    await sessionRequest('put', `/api/entries/${expense.body.entry.id}`, otherSpace.sessionToken, memberState.body.csrfToken, {
      kind: 'expense', description: 'Tentativa externa', categoryId: null,
      competenceOn: '2026-10-01', plannedCents: 1,
    }).expect(404);
    await sessionRequest('delete', `/api/entries/${expense.body.entry.id}`, otherSpace.sessionToken, memberState.body.csrfToken).expect(404);
    await sessionRequest('delete', `/api/entries/${income.body.entry.id}`, memberSession, memberState.body.csrfToken).expect(204);
    await sessionRequest('get', '/api/entries?month=2026-10', adminSession, adminState.body.csrfToken).expect(200)
      .expect(({ body }) => expect(body.entries.map(({ id }) => id)).toEqual([late.body.entry.id, expense.body.entry.id]));
  });
});
