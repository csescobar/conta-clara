import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAccountActivationRouter } from './account-activation.js';

const scrypt = promisify(scryptCallback);
const sessionCookie = 'cc_session';
const csrfCookie = 'cc_csrf';
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const advisoryLockKey = 1717170002;
const passwordCost = 16_384;
const passwordBlockSize = 8;
const passwordParallel = 1;
const passwordLength = 64;

function readCookie(request, name) {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

export function sessionCookieOptions(secure) {
  return { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: sessionLifetimeMs };
}

function issueCsrfToken(secret) {
  const nonce = randomBytes(32).toString('base64url');
  const signature = createHmac('sha256', secret).update(nonce).digest('base64url');
  return `${nonce}.${signature}`;
}

function isValidCsrfToken(token, secret) {
  if (typeof token !== 'string') return false;
  const [nonce, signature, ...extra] = token.split('.');
  if (!nonce || !signature || extra.length || !/^[\w-]{43}$/.test(nonce)) return false;
  const expected = createHmac('sha256', secret).update(nonce).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return false; }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function sameOrigin(request) {
  const origin = request.get('origin');
  const host = request.get('host');
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function requireCsrf(secret) {
  return (request, response, next) => {
    const cookieToken = readCookie(request, csrfCookie);
    const headerToken = request.get('x-csrf-token');
    if (!sameOrigin(request) || cookieToken !== headerToken || !isValidCsrfToken(cookieToken, secret)) {
      return response.status(403).json({ error: 'Requisição inválida. Atualize a página e tente novamente.' });
    }
    next();
  };
}

function ensureCsrf(request, response, secret, secureCookies) {
  const existing = readCookie(request, csrfCookie);
  const token = isValidCsrfToken(existing, secret) ? existing : issueCsrfToken(secret);
  if (token !== existing) {
    response.cookie(csrfCookie, token, {
      httpOnly: false,
      secure: secureCookies,
      sameSite: 'strict',
      path: '/',
      maxAge: sessionLifetimeMs,
    });
  }
  return token;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, passwordLength, {
    N: passwordCost,
    r: passwordBlockSize,
    p: passwordParallel,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${passwordCost}$${passwordBlockSize}$${passwordParallel}$${salt.toString('base64url')}$${Buffer.from(hash).toString('base64url')}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, cost, blockSize, parallel, saltText, hashText, ...extra] = String(storedHash).split('$');
  if (algorithm !== 'scrypt' || cost !== String(passwordCost) || blockSize !== String(passwordBlockSize) || parallel !== String(passwordParallel) || !saltText || !hashText || extra.length) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(saltText, 'base64url');
    expected = Buffer.from(hashText, 'base64url');
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== passwordLength) return false;
  const actual = Buffer.from(await scrypt(password, salt, passwordLength, {
    N: passwordCost,
    r: passwordBlockSize,
    p: passwordParallel,
    maxmem: 64 * 1024 * 1024,
  }));
  return timingSafeEqual(actual, expected);
}

const dummyPasswordHash = hashPassword(randomBytes(32).toString('hex'));

export function hashOpaqueToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function publicUser(row) {
  return { id: row.user_id, name: row.display_name, email: row.email, role: row.role, spaceId: row.space_id };
}

export async function createSession(client, user) {
  const token = randomBytes(32).toString('base64url');
  await client.query(
    'INSERT INTO sessions (space_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval \'7 days\')',
    [user.space_id, user.user_id, hashOpaqueToken(token)],
  );
  return token;
}

async function findSessionUser(pool, request) {
  const token = readCookie(request, sessionCookie);
  if (!token) return null;
  const result = await pool.query(`
    SELECT u.id AS user_id, u.display_name, u.email, m.role, m.space_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id AND u.is_active
    JOIN space_memberships m ON m.space_id = s.space_id AND m.user_id = s.user_id AND m.deactivated_at IS NULL
    WHERE s.token_hash = $1 AND s.expires_at > now()
    LIMIT 1
  `, [hashOpaqueToken(token)]);
  return result.rows[0] ?? null;
}

export function requireAuth(pool, secureCookies = false) {
  return async (request, response, next) => {
    try {
      const user = await findSessionUser(pool, request);
      if (!user) {
        response.clearCookie(sessionCookie, sessionCookieOptions(secureCookies));
        return response.status(401).json({ error: 'Autenticação necessária.' });
      }
      request.auth = publicUser(user);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createAuthRouter({ pool, secureCookies = false, secret = randomBytes(32), loginLimit = 10 }) {
  const router = express.Router();
  const csrfSecret = Buffer.isBuffer(secret) ? secret : Buffer.from(secret);
  const csrf = requireCsrf(csrfSecret);
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde e tente novamente.' },
  });

  router.get('/state', async (request, response, next) => {
    try {
      const token = ensureCsrf(request, response, csrfSecret, secureCookies);
      const initialized = (await pool.query('SELECT EXISTS (SELECT 1 FROM users) AS initialized')).rows[0].initialized;
      const row = initialized ? await findSessionUser(pool, request) : null;
      if (readCookie(request, sessionCookie) && !row) response.clearCookie(sessionCookie, sessionCookieOptions(secureCookies));
      return response.json({ initialized, user: row ? publicUser(row) : null, csrfToken: token });
    } catch (error) {
      next(error);
    }
  });

  router.post('/setup', csrf, async (request, response, next) => {
    const displayName = typeof request.body?.displayName === 'string' ? request.body.displayName.trim() : '';
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!displayName || displayName.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 1024) {
      return response.status(400).json({ error: 'Confira o nome, o e-mail e use uma senha com pelo menos 12 caracteres.' });
    }

    let client;
    try {
      const passwordHash = await hashPassword(password);
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, 1)', [advisoryLockKey]);
      const existing = await client.query('SELECT EXISTS (SELECT 1 FROM users) AS initialized');
      if (existing.rows[0].initialized) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'A configuração inicial já foi concluída.' });
      }
      const userResult = await client.query(
        'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id, display_name, email',
        [email, displayName, passwordHash],
      );
      const user = userResult.rows[0];
      const spaceResult = await client.query(
        'INSERT INTO finance_spaces (name, created_by_user_id) VALUES ($1, $2) RETURNING id',
        ['Finanças da família', user.id],
      );
      const spaceId = spaceResult.rows[0].id;
      await client.query(
        'INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, $3)',
        [spaceId, user.id, 'admin'],
      );
      const sessionToken = await createSession(client, { user_id: user.id, space_id: spaceId });
      await client.query('COMMIT');
      response.cookie(sessionCookie, sessionToken, sessionCookieOptions(secureCookies));
      return response.status(201).json({ user: { id: user.id, name: user.display_name, email: user.email, role: 'admin', spaceId } });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client?.release();
    }
  });

  router.post('/login', csrf, loginLimiter, async (request, response, next) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!email || !password || password.length > 1024) {
      return response.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await client.query(`
        SELECT u.id AS user_id, u.display_name, u.email, u.password_hash,
               m.role, m.space_id
        FROM users u
        JOIN space_memberships m ON m.user_id = u.id
        WHERE u.email = $1 AND u.is_active AND m.deactivated_at IS NULL
        ORDER BY m.created_at
        LIMIT 1
        FOR SHARE OF u, m
      `, [email]);
      const user = result.rows[0];
      const valid = await verifyPassword(password, user?.password_hash ?? await dummyPasswordHash);
      if (!user || !valid) {
        await client.query('ROLLBACK');
        return response.status(401).json({ error: 'E-mail ou senha inválidos.' });
      }

      const token = await createSession(client, user);
      await client.query('COMMIT');
      response.cookie(sessionCookie, token, sessionCookieOptions(secureCookies));
      return response.json({ user: publicUser(user) });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client?.release();
    }
  });

  router.post('/logout', csrf, requireAuth(pool, secureCookies), async (request, response, next) => {
    try {
      const token = readCookie(request, sessionCookie);
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashOpaqueToken(token)]);
      response.clearCookie(sessionCookie, sessionCookieOptions(secureCookies));
      return response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.use(createAccountActivationRouter({ pool, secureCookies, csrfSecret }));

  return router;
}
