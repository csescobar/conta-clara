// @vitest-environment node
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { requireAuth, verifyPassword } from './auth.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

describe.skipIf(!testDatabaseUrl)('member invitations and local password reset with PostgreSQL', () => {
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

  function tokenFrom(path) {
    return path.split('/').at(-1);
  }

  function protectedProbe() {
    const probe = express();
    probe.get('/private', requireAuth(pool, true), (request_, response) => response.json({ user: request_.auth }));
    return probe;
  }

  it('issues, reissues, revokes, expires, and consumes links only for administrators', async () => {
    const adminBrowser = request.agent(app);
    const adminState = await sameOrigin(adminBrowser, 'get', '/api/auth/state').expect(200);
    const setup = await sameOrigin(adminBrowser, 'post', '/api/auth/setup', adminState.body.csrfToken)
      .send({ displayName: 'Administradora de teste', email: 'admin@example.test', password: 'senha-admin-ficticia-123' }).expect(201);
    const admin = setup.body.user;

    const issued = await sameOrigin(adminBrowser, 'post', '/api/members/invitations', adminState.body.csrfToken)
      .send({ email: 'Member@example.test' }).expect(201);
    expect(issued.body.invitation.email).toBe('member@example.test');
    expect(issued.body.activationPath).toMatch(/^\/ativar\/[A-Za-z0-9_-]{43}$/);
    const originalToken = tokenFrom(issued.body.activationPath);
    const originalDigest = createHash('sha256').update(originalToken).digest('hex');
    const storedInvite = await pool.query('SELECT token_hash FROM account_tokens WHERE id = $1', [issued.body.invitation.id]);
    expect(storedInvite.rows[0].token_hash).toBe(originalDigest);
    expect(storedInvite.rows[0].token_hash).not.toBe(originalToken);
    await request(app).get(`/api/auth/invites/${originalToken}`).expect('Cache-Control', 'no-store').expect(200).expect(({ body }) => expect(body).toEqual({ valid: true, email: 'member@example.test' }));
    await sameOrigin(adminBrowser, 'post', '/api/members/invitations', adminState.body.csrfToken)
      .send({ email: 'member@example.test' }).expect(409);

    const reissued = await sameOrigin(adminBrowser, 'post', `/api/members/invitations/${issued.body.invitation.id}/reissue`, adminState.body.csrfToken).expect(201);
    const activeToken = tokenFrom(reissued.body.activationPath);
    expect(activeToken).not.toBe(originalToken);
    await request(app).get(`/api/auth/invites/${originalToken}`).expect(200).expect(({ body }) => expect(body.valid).toBe(false));
    await request(app).get(`/api/auth/invites/${activeToken}`).expect(200).expect(({ body }) => expect(body.valid).toBe(true));

    const memberBrowser = request.agent(app);
    const memberState = await sameOrigin(memberBrowser, 'get', '/api/auth/state').expect(200);
    const activation = await sameOrigin(memberBrowser, 'post', '/api/auth/accept-invite', memberState.body.csrfToken)
      .send({ token: activeToken, displayName: 'Pessoa convidada', password: 'senha-membro-ficticia-123' }).expect(201);
    const member = activation.body.user;
    expect(member).toMatchObject({ email: 'member@example.test', role: 'member', spaceId: admin.spaceId });
    const membership = await pool.query('SELECT space_id, role FROM space_memberships WHERE user_id = $1', [member.id]);
    expect(membership.rows[0]).toEqual({ space_id: admin.spaceId, role: 'member' });
    await sameOrigin(memberBrowser, 'post', '/api/auth/accept-invite', memberState.body.csrfToken)
      .send({ token: activeToken, displayName: 'Pessoa duplicada', password: 'senha-membro-ficticia-123' }).expect(400);

    const roster = await sameOrigin(memberBrowser, 'get', '/api/members').expect('Cache-Control', 'no-store').expect(200);
    expect(roster.body.members).toHaveLength(2);
    await sameOrigin(memberBrowser, 'get', '/api/members/invitations').expect(403);
    await sameOrigin(memberBrowser, 'post', '/api/members/invitations', memberState.body.csrfToken)
      .send({ email: 'outro@example.test' }).expect(403);
    await sameOrigin(memberBrowser, 'post', `/api/members/${admin.id}/password-reset`, memberState.body.csrfToken).expect(403);

    const revoked = await sameOrigin(adminBrowser, 'post', '/api/members/invitations', adminState.body.csrfToken)
      .send({ email: 'revoked@example.test' }).expect(201);
    const revokedToken = tokenFrom(revoked.body.activationPath);
    await sameOrigin(adminBrowser, 'post', `/api/members/invitations/${revoked.body.invitation.id}/revoke`, adminState.body.csrfToken).expect(204);
    await request(app).get(`/api/auth/invites/${revokedToken}`).expect(200).expect(({ body }) => expect(body.valid).toBe(false));
    const revokedAttempt = request.agent(app);
    const revokedState = await sameOrigin(revokedAttempt, 'get', '/api/auth/state').expect(200);
    await sameOrigin(revokedAttempt, 'post', '/api/auth/accept-invite', revokedState.body.csrfToken)
      .send({ token: revokedToken, displayName: 'Pessoa revogada', password: 'senha-membro-ficticia-123' }).expect(400);

    const expired = await sameOrigin(adminBrowser, 'post', '/api/members/invitations', adminState.body.csrfToken)
      .send({ email: 'expired@example.test' }).expect(201);
    const expiredToken = tokenFrom(expired.body.activationPath);
    const expiredDigest = createHash('sha256').update(expiredToken).digest('hex');
    await pool.query("UPDATE account_tokens SET created_at = now() - interval '3 days', expires_at = now() - interval '1 minute' WHERE token_hash = $1", [expiredDigest]);
    await request(app).get(`/api/auth/invites/${expiredToken}`).expect(200).expect(({ body }) => expect(body.valid).toBe(false));
    const expiredAttempt = request.agent(app);
    const expiredState = await sameOrigin(expiredAttempt, 'get', '/api/auth/state').expect(200);
    await sameOrigin(expiredAttempt, 'post', '/api/auth/accept-invite', expiredState.body.csrfToken)
      .send({ token: expiredToken, displayName: 'Pessoa expirada', password: 'senha-membro-ficticia-123' }).expect(400);

    const invitations = await sameOrigin(adminBrowser, 'get', '/api/members/invitations').expect(200);
    expect(invitations.body.invitations.map(({ status }) => status)).toEqual(expect.arrayContaining(['accepted', 'revoked', 'expired']));

    const resetExpired = await sameOrigin(adminBrowser, 'post', `/api/members/${member.id}/password-reset`, adminState.body.csrfToken).expect(201);
    const resetExpiredToken = tokenFrom(resetExpired.body.resetPath);
    const resetExpiredDigest = createHash('sha256').update(resetExpiredToken).digest('hex');
    await pool.query("UPDATE account_tokens SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute' WHERE token_hash = $1", [resetExpiredDigest]);
    await request(app).get(`/api/auth/password-resets/${resetExpiredToken}`).expect(200).expect(({ body }) => expect(body.valid).toBe(false));
    await sameOrigin(memberBrowser, 'post', '/api/auth/password-reset', memberState.body.csrfToken)
      .send({ token: resetExpiredToken, password: 'senha-redefinida-ficticia-123' }).expect(400);

    const reset = await sameOrigin(adminBrowser, 'post', `/api/members/${member.id}/password-reset`, adminState.body.csrfToken).expect(201);
    expect(reset.body).toMatchObject({ email: 'member@example.test', expiresInMinutes: 60 });
    const resetToken = tokenFrom(reset.body.resetPath);
    const resetDigest = createHash('sha256').update(resetToken).digest('hex');
    const storedReset = await pool.query('SELECT token_hash FROM account_tokens WHERE token_hash = $1', [resetDigest]);
    expect(storedReset.rowCount).toBe(1);
    await request(app).get(`/api/auth/password-resets/${resetToken}`).expect(200).expect(({ body }) => expect(body).toEqual({ valid: true, email: 'member@example.test' }));

    const probe = protectedProbe();
    const oldMemberCookie = activation.headers['set-cookie'].find((value) => value.startsWith('cc_session=')).split(';', 1)[0];
    await request(probe).get('/private').set('Cookie', oldMemberCookie).expect(200);
    const resetResult = await sameOrigin(memberBrowser, 'post', '/api/auth/password-reset', memberState.body.csrfToken)
      .send({ token: resetToken, password: 'senha-redefinida-ficticia-123' }).expect(200);
    expect(resetResult.body.user).toMatchObject({ id: member.id, role: 'member', spaceId: admin.spaceId });
    await request(probe).get('/private').set('Cookie', oldMemberCookie).expect(401);
    const newMemberCookie = resetResult.headers['set-cookie'].find((value) => value.startsWith('cc_session=')).split(';', 1)[0];
    await request(probe).get('/private').set('Cookie', newMemberCookie).expect(200);
    await sameOrigin(memberBrowser, 'post', '/api/auth/password-reset', memberState.body.csrfToken)
      .send({ token: resetToken, password: 'senha-redefinida-ficticia-123' }).expect(400);

    const userHash = await pool.query('SELECT password_hash FROM users WHERE id = $1', [member.id]);
    expect(await verifyPassword('senha-redefinida-ficticia-123', userHash.rows[0].password_hash)).toBe(true);
  });
});
