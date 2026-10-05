// @vitest-environment node
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { hashPassword, requireAuth, verifyPassword } from './auth.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';
const adminCredentials = {
  displayName: 'Pessoa de teste',
  email: 'admin@example.test',
  password: 'senha-segura-de-teste-123',
};

describe.skipIf(!testDatabaseUrl)('auth routes with PostgreSQL', () => {
  let pool;

  beforeAll(async () => {
    const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
    if (!/_test$/.test(databaseName)) throw new Error('TEST_DATABASE_URL deve apontar para um banco descartável com sufixo _test.');
    pool = createPool(testDatabaseUrl);
    await migrate(pool);
    // The test command requires an isolated database; clear rows left by a previous run.
    await pool.query('TRUNCATE users CASCADE');
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

  function cookieFrom(response, name) {
    const cookie = response.headers['set-cookie']?.find((value) => value.startsWith(`${name}=`));
    return cookie?.split(';', 1)[0];
  }

  function protectedProbe() {
    const app = express();
    app.get('/private', requireAuth(pool, true), (request_, response) => response.json({ user: request_.auth }));
    return app;
  }

  describe.sequential('administrator bootstrap, session lifecycle, and protections', () => {
    let activeSessionCookie;
    let user;

    it('sets up exactly one administrator, authenticates, expires, and revokes sessions', async () => {
      const firstBrowser = request.agent(createApp({ pool, loginLimit: 100 }));
      const secondBrowser = request.agent(createApp({ pool, loginLimit: 100 }));
      const firstState = await sameOrigin(firstBrowser, 'get', '/api/auth/state').expect(200);
      const secondState = await sameOrigin(secondBrowser, 'get', '/api/auth/state').expect(200);
      expect(firstState.body).toMatchObject({ initialized: false, user: null });

      await firstBrowser.post('/api/auth/setup').set('Host', 'conta-clara.test').set('Origin', origin)
        .send(adminCredentials).expect(403);
      await sameOrigin(firstBrowser, 'post', '/api/auth/setup', firstState.body.csrfToken)
        .set('Origin', 'https://attacker.test').send(adminCredentials).expect(403);
      await sameOrigin(firstBrowser, 'post', '/api/auth/setup', firstState.body.csrfToken)
        .send({ ...adminCredentials, password: 'short' }).expect(400);

      const setupCalls = await Promise.all([
        sameOrigin(firstBrowser, 'post', '/api/auth/setup', firstState.body.csrfToken).send(adminCredentials),
        sameOrigin(secondBrowser, 'post', '/api/auth/setup', secondState.body.csrfToken).send(adminCredentials),
      ]);
      expect(setupCalls.map(({ status }) => status).sort()).toEqual([201, 409]);
      const setup = setupCalls.find(({ status }) => status === 201);
      const winner = setupCalls[0] === setup ? firstBrowser : secondBrowser;
      const loser = winner === firstBrowser ? secondBrowser : firstBrowser;
      const loserState = winner === firstBrowser ? secondState.body : firstState.body;
      user = setup.body.user;
      expect(user).toMatchObject({ email: adminCredentials.email, role: 'admin', name: adminCredentials.displayName });
      expect(setup.headers['set-cookie'].join(';')).toMatch(/cc_session=.*HttpOnly/i);
      expect(setup.headers['set-cookie'].join(';')).toMatch(/SameSite=Strict/i);
      expect(setup.headers['set-cookie'].join(';')).not.toMatch(/cc_session=.*Secure/i);

      const stored = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
      expect(stored.rows[0].password_hash).not.toBe(adminCredentials.password);
      expect(stored.rows[0].password_hash).toMatch(/^scrypt\$/);
      expect(await verifyPassword(adminCredentials.password, stored.rows[0].password_hash)).toBe(true);
      expect(await verifyPassword('senha-incorreta', stored.rows[0].password_hash)).toBe(false);
      await sameOrigin(loser, 'post', '/api/auth/setup', loserState.csrfToken).send(adminCredentials).expect(409);
      expect((await pool.query('SELECT count(*)::integer AS count FROM users')).rows[0].count).toBe(1);

      const loginBrowser = request.agent(createApp({ pool, loginLimit: 100 }));
      const loginState = await sameOrigin(loginBrowser, 'get', '/api/auth/state').expect(200);
      expect(loginState.body).toMatchObject({ initialized: true, user: null });
      const invalidLogin = await sameOrigin(loginBrowser, 'post', '/api/auth/login', loginState.body.csrfToken)
        .send({ email: adminCredentials.email, password: 'senha-errada' }).expect(401);
      expect(invalidLogin.body.error).toBe('E-mail ou senha inválidos.');
      const login = await sameOrigin(loginBrowser, 'post', '/api/auth/login', loginState.body.csrfToken)
        .send({ email: adminCredentials.email.toUpperCase(), password: adminCredentials.password }).expect(200);
      expect(login.body.user).toMatchObject({ id: user.id, role: 'admin' });
      activeSessionCookie = cookieFrom(login, 'cc_session');
      const token = activeSessionCookie.slice('cc_session='.length);
      const tokenDigest = createHash('sha256').update(token).digest('hex');
      const storedSession = await pool.query('SELECT token_hash FROM sessions WHERE user_id = $1 AND token_hash = $2', [user.id, tokenDigest]);
      expect(storedSession.rowCount).toBe(1);

      const probe = protectedProbe();
      await request(probe).get('/private').set('Cookie', activeSessionCookie).expect(200)
        .expect(({ body }) => expect(body.user).toMatchObject({ id: user.id, email: adminCredentials.email }));
      await request(probe).get('/private').expect(401);

      await sameOrigin(loginBrowser, 'post', '/api/auth/logout', loginState.body.csrfToken).expect(204);
      await request(probe).get('/private').set('Cookie', activeSessionCookie).expect(401);

      const expiryBrowser = request.agent(createApp({ pool, loginLimit: 100 }));
      const expiryState = await sameOrigin(expiryBrowser, 'get', '/api/auth/state').expect(200);
      const expiryLogin = await sameOrigin(expiryBrowser, 'post', '/api/auth/login', expiryState.body.csrfToken)
        .send({ email: adminCredentials.email, password: adminCredentials.password }).expect(200);
      const expiredCookie = cookieFrom(expiryLogin, 'cc_session');
      const expiredToken = expiredCookie.slice('cc_session='.length);
      await pool.query('UPDATE sessions SET created_at = now() - interval \'2 days\', expires_at = now() - interval \'1 minute\' WHERE token_hash = $1', [createHash('sha256').update(expiredToken).digest('hex')]);
      await request(probe).get('/private').set('Cookie', expiredCookie).expect(401);
    });

    it('marks session cookies Secure when configured for HTTPS', async () => {
      const secureApp = createApp({ pool, secureCookies: true, loginLimit: 100 });
      const state = await sameOrigin(request(secureApp), 'get', '/api/auth/state').expect(200);
      const csrfCookie = `cc_csrf=${state.headers['set-cookie'][0].split(';', 1)[0].split('=').slice(1).join('=')}`;
      const login = await sameOrigin(request(secureApp), 'post', '/api/auth/login', state.body.csrfToken)
        .set('Cookie', csrfCookie)
        .send({ email: adminCredentials.email, password: adminCredentials.password }).expect(200);
      expect(login.headers['set-cookie'].join(';')).toMatch(/cc_session=.*HttpOnly; Secure; SameSite=Strict/i);
    });

    it('rate limits repeated login failures', async () => {
      const limitedApp = createApp({ pool, loginLimit: 1 });
      const browser = request.agent(limitedApp);
      const state = await sameOrigin(browser, 'get', '/api/auth/state').expect(200);
      await sameOrigin(browser, 'post', '/api/auth/login', state.body.csrfToken)
        .send({ email: adminCredentials.email, password: 'senha-errada' }).expect(401);
      await sameOrigin(browser, 'post', '/api/auth/login', state.body.csrfToken)
        .send({ email: adminCredentials.email, password: 'senha-errada' }).expect(429);
    });
  });
});
