// @vitest-environment node
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { createSession } from './auth.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

describe.skipIf(!testDatabaseUrl)('shared catalog routes with PostgreSQL', () => {
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

  function sessionRequest(method, path, sessionToken, csrfToken) {
    let call = request(app)[method](path)
      .set('Host', 'conta-clara.test')
      .set('Origin', origin)
      .set('Cookie', `cc_session=${sessionToken}; cc_csrf=${csrfToken}`);
    if (csrfToken) call = call.set('X-CSRF-Token', csrfToken);
    return call;
  }

  async function createOtherSpace() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, display_name, password_hash) VALUES ('admin-other@example.test', 'Outra administradora', 'integration-test-only') RETURNING id",
      );
      const space = await client.query(
        "INSERT INTO finance_spaces (name, created_by_user_id) VALUES ('Outro espaço fictício', $1) RETURNING id",
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

  it('validates shared categories and methods, isolates spaces, and archives referenced history', async () => {
    const adminBrowser = request.agent(app);
    const adminState = await sameOrigin(adminBrowser, 'get', '/api/auth/state').expect(200);
    const setup = await sameOrigin(adminBrowser, 'post', '/api/auth/setup', adminState.body.csrfToken)
      .send({ displayName: 'Admin catálogo', email: 'admin-catalog@example.test', password: 'senha-admin-catalog-ficticia-123' }).expect(201);
    const admin = setup.body.user;
    const adminSession = cookieValue(setup, 'cc_session');

    const invite = await sameOrigin(adminBrowser, 'post', '/api/members/invitations', adminState.body.csrfToken)
      .send({ email: 'member-catalog@example.test' }).expect(201);
    const memberBrowser = request.agent(app);
    const memberState = await sameOrigin(memberBrowser, 'get', '/api/auth/state').expect(200);
    const activation = await sameOrigin(memberBrowser, 'post', '/api/auth/accept-invite', memberState.body.csrfToken)
      .send({ token: invite.body.activationPath.split('/').at(-1), displayName: 'Membro catálogo', password: 'senha-member-catalog-ficticia-123' }).expect(201);
    const member = activation.body.user;
    const memberSession = cookieValue(activation, 'cc_session');
    const otherSpace = await createOtherSpace();
    const csrf = memberState.body.csrfToken;

    const badCategory = await sessionRequest('post', '/api/catalog/categories', memberSession, csrf)
      .send({ name: ' ', kind: 'expense', expenseClass: 'fixed' }).expect(400);
    expect(badCategory.body.error).toMatch(/nome/i);
    await sessionRequest('post', '/api/catalog/categories', memberSession, csrf)
      .send({ name: 'Moradia', kind: 'expense' }).expect(400);
    await sessionRequest('post', '/api/catalog/categories', memberSession, csrf)
      .send({ name: 'Renda', kind: 'income', expenseClass: 'fixed' }).expect(400);

    const housing = await sessionRequest('post', '/api/catalog/categories', memberSession, csrf)
      .send({ name: '  Moradia  ', kind: 'expense', expenseClass: 'fixed' }).expect(201);
    expect(housing.body.category).toMatchObject({ name: 'Moradia', kind: 'expense', expense_class: 'fixed', archived_at: null });
    await sessionRequest('post', '/api/catalog/categories', adminSession, adminState.body.csrfToken)
      .send({ name: 'moradia', kind: 'expense', expenseClass: 'variable' }).expect(409);
    const income = await sessionRequest('post', '/api/catalog/categories', adminSession, adminState.body.csrfToken)
      .send({ name: 'Renda', kind: 'income', expenseClass: null }).expect(201);
    const memberList = await sessionRequest('get', '/api/catalog/categories', memberSession, csrf).expect(200);
    expect(memberList.body.categories.map(({ id }) => id)).toEqual(expect.arrayContaining([housing.body.category.id, income.body.category.id]));

    const updatedHousing = await sessionRequest('put', `/api/catalog/categories/${housing.body.category.id}`, adminSession, adminState.body.csrfToken)
      .send({ name: 'Casa', kind: 'expense', expenseClass: 'variable' }).expect(200);
    expect(updatedHousing.body.category).toMatchObject({ name: 'Casa', expense_class: 'variable' });
    await sessionRequest('get', '/api/catalog/categories', otherSpace.sessionToken, csrf).expect(200).expect(({ body }) => expect(body.categories).toEqual([]));
    await sessionRequest('get', '/api/catalog/payment-methods', otherSpace.sessionToken, csrf).expect(200).expect(({ body }) => expect(body.paymentMethods).toEqual([]));
    await sessionRequest('put', `/api/catalog/categories/${housing.body.category.id}`, otherSpace.sessionToken, csrf)
      .send({ name: 'Minha casa', kind: 'expense', expenseClass: 'fixed' }).expect(404);
    await sessionRequest('post', `/api/catalog/categories/${housing.body.category.id}/archive`, otherSpace.sessionToken, csrf).expect(404);

    const payment = await sessionRequest('post', '/api/catalog/payment-methods', adminSession, adminState.body.csrfToken)
      .send({ name: '  Cartão  ' }).expect(201);
    expect(payment.body.paymentMethod.name).toBe('Cartão');
    const updatedPayment = await sessionRequest('put', `/api/catalog/payment-methods/${payment.body.paymentMethod.id}`, memberSession, csrf)
      .send({ name: 'Cartão de crédito' }).expect(200);
    expect(updatedPayment.body.paymentMethod.name).toBe('Cartão de crédito');
    await sessionRequest('put', `/api/catalog/payment-methods/${payment.body.paymentMethod.id}`, otherSpace.sessionToken, csrf)
      .send({ name: 'Cartão alheio' }).expect(404);
    await sessionRequest('post', '/api/catalog/payment-methods', memberSession, csrf)
      .send({ name: 'cartão de CRÉDITO' }).expect(409);

    const entry = await pool.query(`
      INSERT INTO financial_entries (space_id, created_by_user_id, updated_by_user_id, kind, description, category_id, competence_on, planned_cents, payment_method_id)
      VALUES ($1, $2, $2, 'expense', 'Lançamento fictício arquivado', $3, DATE '2026-10-01', 4500, $4)
      RETURNING id
    `, [admin.spaceId, member.id, housing.body.category.id, payment.body.paymentMethod.id]);
    await sessionRequest('put', `/api/catalog/categories/${housing.body.category.id}`, adminSession, adminState.body.csrfToken)
      .send({ name: 'Casa', kind: 'income', expenseClass: null }).expect(409);
    await sessionRequest('post', `/api/catalog/categories/${housing.body.category.id}/archive`, memberSession, csrf).expect(204);
    await sessionRequest('post', `/api/catalog/payment-methods/${payment.body.paymentMethod.id}/archive`, memberSession, csrf).expect(204);
    const activeCategories = await sessionRequest('get', '/api/catalog/categories', adminSession, adminState.body.csrfToken).expect(200);
    expect(activeCategories.body.categories.map(({ id }) => id)).not.toContain(housing.body.category.id);
    const archivedCategory = await sessionRequest('get', '/api/catalog/categories?includeArchived=true', adminSession, adminState.body.csrfToken).expect(200);
    expect(archivedCategory.body.categories.find(({ id }) => id === housing.body.category.id).archived_at).not.toBeNull();
    const activeMethods = await sessionRequest('get', '/api/catalog/payment-methods', adminSession, adminState.body.csrfToken).expect(200);
    expect(activeMethods.body.paymentMethods.map(({ id }) => id)).not.toContain(payment.body.paymentMethod.id);
    const archivedMethod = await sessionRequest('get', '/api/catalog/payment-methods?includeArchived=true', adminSession, adminState.body.csrfToken).expect(200);
    expect(archivedMethod.body.paymentMethods.find(({ id }) => id === payment.body.paymentMethod.id).archived_at).not.toBeNull();

    const archivedHistory = await pool.query('SELECT category_id, payment_method_id FROM financial_entries WHERE id = $1', [entry.rows[0].id]);
    expect(archivedHistory.rows[0]).toEqual({ category_id: housing.body.category.id, payment_method_id: payment.body.paymentMethod.id });
    const replacementCategory = await sessionRequest('post', '/api/catalog/categories', memberSession, csrf)
      .send({ name: 'Casa', kind: 'expense', expenseClass: 'fixed' }).expect(201);
    await sessionRequest('post', `/api/catalog/categories/${housing.body.category.id}/restore`, adminSession, adminState.body.csrfToken).expect(409);
    await sessionRequest('post', `/api/catalog/categories/${replacementCategory.body.category.id}/archive`, memberSession, csrf).expect(204);
    await sessionRequest('post', `/api/catalog/categories/${housing.body.category.id}/restore`, adminSession, adminState.body.csrfToken).expect(204);
    await sessionRequest('post', `/api/catalog/payment-methods/${payment.body.paymentMethod.id}/restore`, adminSession, adminState.body.csrfToken).expect(204);
    await sessionRequest('put', `/api/catalog/categories/${housing.body.category.id}`, otherSpace.sessionToken, csrf)
      .send({ name: 'Intrusão', kind: 'expense', expenseClass: 'fixed' }).expect(404);
  });
});
