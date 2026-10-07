// @vitest-environment node
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { createSession } from './auth.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

describe.skipIf(!testDatabaseUrl)('shared credit card routes with PostgreSQL', () => {
  let pool;
  let app;
  let csrfToken;

  beforeAll(async () => {
    const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
    if (!/_test$/.test(databaseName)) throw new Error('TEST_DATABASE_URL deve apontar para um banco descartável com sufixo _test.');
    pool = createPool(testDatabaseUrl);
    await migrate(pool);
    await pool.query('TRUNCATE users CASCADE');
    app = createApp({ pool, loginLimit: 100 });
    csrfToken = (await request(app).get('/api/auth/state').set('Host', 'conta-clara.test').expect(200)).body.csrfToken;
  });

  afterAll(async () => {
    if (pool) await pool.query('TRUNCATE users CASCADE');
    await pool?.end();
  });

  function sessionRequest(method, path, sessionToken, body) {
    let call = request(app)[method](path)
      .set('Host', 'conta-clara.test')
      .set('Origin', origin)
      .set('Cookie', `cc_session=${sessionToken}; cc_csrf=${csrfToken}`);
    if (method !== 'get') call = call.set('X-CSRF-Token', csrfToken);
    if (body !== undefined) call = call.send(body);
    return call;
  }

  async function createAccount({ email, name, role = 'admin', spaceId = null }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, 'integration-test-only') RETURNING id",
        [email, name],
      );
      let activeSpaceId = spaceId;
      if (!activeSpaceId) {
        const space = await client.query('INSERT INTO finance_spaces (name, created_by_user_id) VALUES ($1, $2) RETURNING id', [`Espaço ${name}`, user.rows[0].id]);
        activeSpaceId = space.rows[0].id;
      }
      await client.query('INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, $3)', [activeSpaceId, user.rows[0].id, role]);
      const sessionToken = await createSession(client, { user_id: user.rows[0].id, space_id: activeSpaceId });
      await client.query('COMMIT');
      return { id: user.rows[0].id, spaceId: activeSpaceId, sessionToken };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  it('shares cards with active members, isolates spaces, validates cycles, and preserves archives', async () => {
    const admin = await createAccount({ email: 'cards-admin@example.test', name: 'Admin cartões' });
    const member = await createAccount({ email: 'cards-member@example.test', name: 'Membro cartões', role: 'member', spaceId: admin.spaceId });
    const inactive = await createAccount({ email: 'cards-inactive@example.test', name: 'Membro inativo', role: 'member', spaceId: admin.spaceId });
    const otherSpace = await createAccount({ email: 'cards-other@example.test', name: 'Outro espaço' });
    await pool.query('UPDATE space_memberships SET deactivated_at = now() WHERE space_id = $1 AND user_id = $2', [admin.spaceId, inactive.id]);

    const invalid = await sessionRequest('post', '/api/cards', member.sessionToken, {
      name: 'Dia inválido', holderUserId: member.id, closingDay: 32, dueDay: 5,
    }).expect(400);
    expect(invalid.body.error).toMatch(/dias/i);
    await sessionRequest('post', '/api/cards', admin.sessionToken, {
      name: 'Titular inativo', holderUserId: inactive.id, closingDay: 10, dueDay: 20,
    }).expect(400);

    const first = await sessionRequest('post', '/api/cards', admin.sessionToken, {
      name: '  Cartão da casa  ', holderUserId: member.id, closingDay: 31, dueDay: 29,
      number: '4111111111111111', cvv: '123', limit: 500000,
    }).expect(201);
    expect(first.body.card).toMatchObject({
      name: 'Cartão da casa', holder_user_id: member.id, holder_name: 'Membro cartões',
      closing_day: 31, due_day: 29, archived_at: null, version: 1,
    });
    expect(JSON.stringify(first.body)).not.toMatch(/4111111111111111|"cvv"|"limit"/i);
    expect(Object.keys(first.body.card)).not.toEqual(expect.arrayContaining(['number', 'cvv', 'limit', 'expiry']));

    const second = await sessionRequest('post', '/api/cards', member.sessionToken, {
      name: 'Cartão virtual', holderUserId: member.id, closingDay: 1, dueDay: 1,
    }).expect(201);
    await sessionRequest('post', '/api/cards', admin.sessionToken, {
      name: 'cartão da CASA', holderUserId: admin.id, closingDay: 1, dueDay: 2,
    }).expect(409);

    const sharedList = await sessionRequest('get', '/api/cards', member.sessionToken).expect(200);
    expect(sharedList.body.cards.map(({ id }) => id)).toEqual(expect.arrayContaining([first.body.card.id, second.body.card.id]));
    const otherList = await sessionRequest('get', '/api/cards?includeArchived=true', otherSpace.sessionToken).expect(200);
    expect(otherList.body.cards).toEqual([]);
    await sessionRequest('put', `/api/cards/${first.body.card.id}`, otherSpace.sessionToken, {
      name: 'Intrusão', holderUserId: otherSpace.id, closingDay: 2, dueDay: 3, baseVersion: 1,
    }).expect(404);

    const updated = await sessionRequest('put', `/api/cards/${first.body.card.id}`, member.sessionToken, {
      name: 'Cartão da casa', holderUserId: member.id, closingDay: 30, dueDay: 31, baseVersion: 1,
    }).expect(200);
    expect(updated.body.card).toMatchObject({ closing_day: 30, due_day: 31, version: 2, updated_by_user_id: member.id });
    const stale = await sessionRequest('put', `/api/cards/${first.body.card.id}`, admin.sessionToken, {
      name: 'Versão desatualizada', holderUserId: member.id, closingDay: 28, dueDay: 5, baseVersion: 1,
    }).expect(409);
    expect(stale.body).toMatchObject({ conflict: true, serverCard: { id: first.body.card.id, version: 2, closing_day: 30 } });

    await sessionRequest('post', `/api/cards/${first.body.card.id}/archive`, member.sessionToken, { baseVersion: 2 }).expect(200);
    const activeList = await sessionRequest('get', '/api/cards', admin.sessionToken).expect(200);
    expect(activeList.body.cards.map(({ id }) => id)).not.toContain(first.body.card.id);
    const archivedList = await sessionRequest('get', '/api/cards?includeArchived=true', admin.sessionToken).expect(200);
    expect(archivedList.body.cards.find(({ id }) => id === first.body.card.id).archived_at).toBeTruthy();

    const sameNameReplacement = await sessionRequest('post', '/api/cards', admin.sessionToken, {
      name: 'Cartão da casa', holderUserId: admin.id, closingDay: 10, dueDay: 20,
    }).expect(201);
    await sessionRequest('post', `/api/cards/${first.body.card.id}/restore`, admin.sessionToken, { baseVersion: 3 }).expect(409);
    await sessionRequest('post', `/api/cards/${sameNameReplacement.body.card.id}/archive`, admin.sessionToken, { baseVersion: 1 }).expect(200);
    await sessionRequest('post', `/api/cards/${first.body.card.id}/restore`, admin.sessionToken, { baseVersion: 3 }).expect(200);
    await sessionRequest('post', `/api/cards/${first.body.card.id}/archive`, otherSpace.sessionToken, { baseVersion: 4 }).expect(404);

    const stored = await pool.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1', ['credit_cards']);
    expect(stored.rows.map(({ column_name }) => column_name)).not.toEqual(expect.arrayContaining(['number', 'card_number', 'cvv', 'limit_cents', 'expiry']));
  });
});
