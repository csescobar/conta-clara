// @vitest-environment node
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { createSession, requireAuth } from './auth.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

describe.skipIf(!testDatabaseUrl)('shared-space authorization with PostgreSQL', () => {
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
    let call = request(app)
      [method](path)
      .set('Host', 'conta-clara.test')
      .set('Origin', origin)
      .set('Cookie', `cc_session=${sessionToken}; cc_csrf=${csrfToken}`);
    if (csrfToken) call = call.set('X-CSRF-Token', csrfToken);
    return call;
  }

  async function createAccountInSpace({ spaceId, spaceName, email, name, role = 'member' }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, 'integration-test-only') RETURNING id",
        [email, name],
      );
      let activeSpaceId = spaceId;
      if (!activeSpaceId) {
        const space = await client.query('INSERT INTO finance_spaces (name, created_by_user_id) VALUES ($1, $2) RETURNING id', [
          spaceName,
          user.rows[0].id,
        ]);
        activeSpaceId = space.rows[0].id;
      }
      await client.query('INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, $3)', [
        activeSpaceId,
        user.rows[0].id,
        role,
      ]);
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

  it('shares one space across roles, isolates other spaces, and revokes a deactivated member without losing authorship', async () => {
    const adminBrowser = request.agent(app);
    const adminState = await sameOrigin(adminBrowser, 'get', '/api/auth/state').expect(200);
    const setup = await sameOrigin(adminBrowser, 'post', '/api/auth/setup', adminState.body.csrfToken)
      .send({ displayName: 'Administradora A', email: 'admin-a@example.test', password: 'senha-admin-a-ficticia-123' })
      .expect(201);
    const admin = setup.body.user;
    const adminSession = cookieValue(setup, 'cc_session');

    const invite = await sameOrigin(adminBrowser, 'post', '/api/members/invitations', adminState.body.csrfToken)
      .send({ email: 'member-a@example.test' })
      .expect(201);
    const memberBrowser = request.agent(app);
    const memberState = await sameOrigin(memberBrowser, 'get', '/api/auth/state').expect(200);
    const activation = await sameOrigin(memberBrowser, 'post', '/api/auth/accept-invite', memberState.body.csrfToken)
      .send({ token: invite.body.activationPath.split('/').at(-1), displayName: 'Membro A', password: 'senha-member-a-ficticia-123' })
      .expect(201);
    const member = activation.body.user;
    const memberSession = cookieValue(activation, 'cc_session');
    expect(member.spaceId).toBe(admin.spaceId);

    const otherAdmin = await createAccountInSpace({
      spaceName: 'Outro espaço de teste',
      email: 'admin-b@example.test',
      name: 'Administradora B',
      role: 'admin',
    });
    const otherMember = await createAccountInSpace({ spaceId: otherAdmin.spaceId, email: 'member-b@example.test', name: 'Membro B' });
    const csrfBrowser = request.agent(app);
    const csrf = (await sameOrigin(csrfBrowser, 'get', '/api/auth/state').expect(200)).body.csrfToken;

    const memberStateResponse = await sessionRequest('get', '/api/auth/state', memberSession, memberState.body.csrfToken).expect(200);
    expect(memberStateResponse.body.user).toMatchObject({ id: member.id, role: 'member', spaceId: admin.spaceId });
    const memberRoster = await sessionRequest('get', '/api/members', memberSession, memberState.body.csrfToken).expect(200);
    expect(memberRoster.body.members.map(({ email }) => email).sort()).toEqual(['admin-a@example.test', 'member-a@example.test']);

    const otherAdminRoster = await sessionRequest('get', '/api/members', otherAdmin.sessionToken, csrf).expect(200);
    expect(otherAdminRoster.body.members.map(({ email }) => email).sort()).toEqual(['admin-b@example.test', 'member-b@example.test']);
    await sessionRequest('post', `/api/members/${otherMember.id}/password-reset`, adminSession, adminState.body.csrfToken).expect(404);
    await sessionRequest('post', `/api/members/${otherMember.id}/deactivate`, adminSession, adminState.body.csrfToken).expect(404);
    await sessionRequest('post', `/api/members/${member.id}/deactivate`, memberSession, memberState.body.csrfToken).expect(403);

    const entry = await pool.query(
      `
      INSERT INTO financial_entries (space_id, created_by_user_id, updated_by_user_id, kind, description, competence_on, planned_cents)
      VALUES ($1, $2, $2, 'expense', 'Registro fictício de autoria', DATE '2026-10-01', 1250)
      RETURNING id
    `,
      [admin.spaceId, member.id],
    );
    const probe = express();
    probe.get('/financial-space', requireAuth(pool), (request_, response) =>
      response.json({ spaceId: request_.auth.spaceId, role: request_.auth.role }),
    );
    await request(probe)
      .get('/financial-space')
      .set('Cookie', `cc_session=${adminSession}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ spaceId: admin.spaceId, role: 'admin' }));
    await request(probe)
      .get('/financial-space')
      .set('Cookie', `cc_session=${memberSession}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ spaceId: admin.spaceId, role: 'member' }));

    await sessionRequest('post', `/api/members/${admin.id}/deactivate`, adminSession, adminState.body.csrfToken).expect(409);
    const pendingReset = await sessionRequest(
      'post',
      `/api/members/${member.id}/password-reset`,
      adminSession,
      adminState.body.csrfToken,
    ).expect(201);
    const resetToken = pendingReset.body.resetPath.split('/').at(-1);
    await sessionRequest('post', `/api/members/${member.id}/deactivate`, adminSession, adminState.body.csrfToken).expect(204);
    await sessionRequest('get', '/api/members', memberSession, memberState.body.csrfToken).expect(401);
    await sessionRequest('post', `/api/members/${member.id}/password-reset`, adminSession, adminState.body.csrfToken).expect(404);
    const blockedState = await sameOrigin(memberBrowser, 'get', '/api/auth/state').expect(200);
    expect(blockedState.body.user).toBeNull();
    await sameOrigin(memberBrowser, 'post', '/api/auth/login', blockedState.body.csrfToken)
      .send({ email: 'member-a@example.test', password: 'senha-member-a-ficticia-123' })
      .expect(401);
    await request(app)
      .get(`/api/auth/password-resets/${resetToken}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ valid: false }));
    await sessionRequest('post', '/api/auth/password-reset', memberSession, memberState.body.csrfToken)
      .send({ token: resetToken, password: 'senha-nova-ficticia-123' })
      .expect(400);

    const retainedEntry = await pool.query('SELECT created_by_user_id, updated_by_user_id FROM financial_entries WHERE id = $1', [
      entry.rows[0].id,
    ]);
    expect(retainedEntry.rows[0]).toEqual({ created_by_user_id: member.id, updated_by_user_id: member.id });
    const retainedMembership = await pool.query('SELECT deactivated_at FROM space_memberships WHERE space_id = $1 AND user_id = $2', [
      admin.spaceId,
      member.id,
    ]);
    expect(retainedMembership.rows[0].deactivated_at).not.toBeNull();
    const remainingSessions = await pool.query('SELECT count(*)::integer AS count FROM sessions WHERE space_id = $1 AND user_id = $2', [
      admin.spaceId,
      member.id,
    ]);
    expect(remainingSessions.rows[0].count).toBe(0);
    const adminRosterAfter = await sessionRequest('get', '/api/members', adminSession, adminState.body.csrfToken).expect(200);
    expect(adminRosterAfter.body.members.find(({ id }) => id === member.id)).toMatchObject({ is_active: false, role: 'member' });

    await sessionRequest('post', `/api/members/${member.id}/reactivate`, adminSession, adminState.body.csrfToken).expect(204);
    const signedOutState = await sameOrigin(memberBrowser, 'get', '/api/auth/state').expect(200);
    expect(signedOutState.body.user).toBeNull();
    const memberLogin = await sameOrigin(memberBrowser, 'post', '/api/auth/login', signedOutState.body.csrfToken)
      .send({ email: 'member-a@example.test', password: 'senha-member-a-ficticia-123' })
      .expect(200);
    expect(memberLogin.body.user).toMatchObject({ id: member.id, role: 'member', spaceId: admin.spaceId });
    await sameOrigin(memberBrowser, 'get', '/api/members').expect(200);
    const adminRosterRestored = await sessionRequest('get', '/api/members', adminSession, adminState.body.csrfToken).expect(200);
    expect(adminRosterRestored.body.members.find(({ id }) => id === member.id)).toMatchObject({ is_active: true, role: 'member' });
  });
});
