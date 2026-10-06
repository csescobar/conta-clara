import { randomBytes } from 'node:crypto';
import express from 'express';
import { hashOpaqueToken, requireAuth, requireCsrf } from './auth.js';

const inviteLifetimeHours = 48;
const resetLifetimeHours = 1;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && uuidPattern.test(value);
}

function createToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashOpaqueToken(token) };
}

function requireAdmin(request, response, next) {
  if (request.auth?.role !== 'admin') return response.status(403).json({ error: 'Somente administradores podem gerenciar acessos.' });
  next();
}

async function issueInvitation(client, { spaceId, issuedByUserId, email }) {
  const { token, tokenHash } = createToken();
  const result = await client.query(`
    INSERT INTO account_tokens (space_id, purpose, email, token_hash, issued_by_user_id, expires_at)
    VALUES ($1, 'invite', $2, $3, $4, now() + interval '${inviteLifetimeHours} hours')
    RETURNING id, email, expires_at
  `, [spaceId, email, tokenHash, issuedByUserId]);
  return { invitation: result.rows[0], activationPath: `/ativar/${token}` };
}

export function createMembersRouter({ pool, secureCookies = false, csrfSecret }) {
  const router = express.Router();
  const csrf = requireCsrf(csrfSecret);
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));

  router.get('/', async (request, response, next) => {
    try {
      const result = await pool.query(`
        SELECT u.id, u.display_name AS name, u.email, m.role, m.created_at AS joined_at
        FROM space_memberships m
        JOIN users u ON u.id = m.user_id AND u.is_active
        WHERE m.space_id = $1
        ORDER BY CASE WHEN m.role = 'admin' THEN 0 ELSE 1 END, lower(u.display_name)
      `, [request.auth.spaceId]);
      return response.json({ members: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.get('/invitations', requireAdmin, async (request, response, next) => {
    try {
      const result = await pool.query(`
        SELECT id, email, created_at, expires_at,
          CASE
            WHEN used_at IS NOT NULL THEN 'accepted'
            WHEN revoked_at IS NOT NULL THEN 'revoked'
            WHEN expires_at <= now() THEN 'expired'
            ELSE 'pending'
          END AS status
        FROM account_tokens
        WHERE space_id = $1 AND purpose = 'invite'
        ORDER BY created_at DESC
        LIMIT 50
      `, [request.auth.spaceId]);
      return response.json({ invitations: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.post('/invitations', csrf, requireAdmin, async (request, response, next) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    if (!emailPattern.test(email) || email.length > 254) {
      return response.status(400).json({ error: 'Informe um e-mail válido.' });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [1717170003, email]);
      const existingUser = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
      if (existingUser.rowCount) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Este e-mail já possui um acesso ao Conta Clara.' });
      }
      const pending = await client.query(`
        SELECT 1 FROM account_tokens
        WHERE space_id = $1 AND email = $2 AND purpose = 'invite'
          AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        LIMIT 1
      `, [request.auth.spaceId, email]);
      if (pending.rowCount) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Já existe um convite válido para este e-mail. Reemita-o para gerar um novo link.' });
      }
      await client.query(`
        UPDATE account_tokens SET revoked_at = now()
        WHERE space_id = $1 AND email = $2 AND purpose = 'invite'
          AND used_at IS NULL AND revoked_at IS NULL AND expires_at <= now()
      `, [request.auth.spaceId, email]);
      const created = await issueInvitation(client, { spaceId: request.auth.spaceId, issuedByUserId: request.auth.id, email });
      await client.query('COMMIT');
      return response.status(201).json(created);
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client?.release();
    }
  });

  router.post('/invitations/:id/reissue', csrf, requireAdmin, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Convite não encontrado.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const candidate = await client.query(`
        SELECT id, email FROM account_tokens
        WHERE id = $1 AND space_id = $2 AND purpose = 'invite' AND used_at IS NULL
      `, [request.params.id, request.auth.spaceId]);
      if (!candidate.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Convite não encontrado ou já utilizado.' });
      }
      const email = candidate.rows[0].email;
      await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [1717170003, email]);
      const selected = await client.query(`
        SELECT id, email FROM account_tokens
        WHERE id = $1 AND space_id = $2 AND purpose = 'invite' AND used_at IS NULL
        FOR UPDATE
      `, [request.params.id, request.auth.spaceId]);
      if (!selected.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Convite não encontrado ou já utilizado.' });
      }
      const existingUser = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
      if (existingUser.rowCount) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Este e-mail já possui um acesso ao Conta Clara.' });
      }
      await client.query(`
        UPDATE account_tokens SET revoked_at = now()
        WHERE space_id = $1 AND email = $2 AND purpose = 'invite'
          AND used_at IS NULL AND revoked_at IS NULL
      `, [request.auth.spaceId, email]);
      const created = await issueInvitation(client, { spaceId: request.auth.spaceId, issuedByUserId: request.auth.id, email });
      await client.query('COMMIT');
      return response.status(201).json(created);
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client?.release();
    }
  });

  router.post('/invitations/:id/revoke', csrf, requireAdmin, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Convite não encontrado.' });
    try {
      const result = await pool.query(`
        UPDATE account_tokens SET revoked_at = now()
        WHERE id = $1 AND space_id = $2 AND purpose = 'invite'
          AND used_at IS NULL AND revoked_at IS NULL
      `, [request.params.id, request.auth.spaceId]);
      if (!result.rowCount) return response.status(404).json({ error: 'Convite não encontrado ou já utilizado.' });
      return response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post('/:userId/password-reset', csrf, requireAdmin, async (request, response, next) => {
    if (!isUuid(request.params.userId)) return response.status(404).json({ error: 'Membro não encontrado.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [1717170004, request.params.userId]);
      const target = await client.query(`
        SELECT u.id, u.email
        FROM users u
        JOIN space_memberships m ON m.user_id = u.id
        WHERE u.id = $1 AND m.space_id = $2 AND u.is_active
      `, [request.params.userId, request.auth.spaceId]);
      if (!target.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Membro não encontrado.' });
      }
      const member = target.rows[0];
      await client.query(`
        UPDATE account_tokens SET revoked_at = now()
        WHERE space_id = $1 AND target_user_id = $2 AND purpose = 'password_reset'
          AND used_at IS NULL AND revoked_at IS NULL
      `, [request.auth.spaceId, member.id]);
      const { token, tokenHash } = createToken();
      await client.query(`
        INSERT INTO account_tokens (space_id, purpose, email, token_hash, issued_by_user_id, target_user_id, expires_at)
        VALUES ($1, 'password_reset', $2, $3, $4, $5, now() + interval '${resetLifetimeHours} hours')
      `, [request.auth.spaceId, member.email, tokenHash, request.auth.id, member.id]);
      await client.query('COMMIT');
      return response.status(201).json({ email: member.email, resetPath: `/redefinir-senha/${token}`, expiresInMinutes: resetLifetimeHours * 60 });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client?.release();
    }
  });

  return router;
}
