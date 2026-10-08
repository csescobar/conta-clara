import express from 'express';
import { createSession, hashOpaqueToken, hashPassword, requireCsrf, sessionCookieOptions } from './auth.js';

const inviteTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const invalidTokenMessage = 'Este link é inválido, expirou ou já foi utilizado.';

function passwordIsValid(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 1024;
}

async function findValidToken(pool, purpose, token) {
  if (typeof token !== 'string' || !inviteTokenPattern.test(token)) return null;
  const result = await pool.query(
    `
    SELECT id, space_id, email, target_user_id
    FROM account_tokens
    WHERE token_hash = $1 AND purpose = $2
      AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
    LIMIT 1
  `,
    [hashOpaqueToken(token), purpose],
  );
  return result.rows[0] ?? null;
}

export function createAccountActivationRouter({ pool, secureCookies = false, csrfSecret }) {
  const router = express.Router();
  const csrf = requireCsrf(csrfSecret);

  router.get('/invites/:token', async (request, response, next) => {
    try {
      const invite = await findValidToken(pool, 'invite', request.params.token);
      return response.json(invite ? { valid: true, email: invite.email } : { valid: false });
    } catch (error) {
      next(error);
    }
  });

  router.post('/accept-invite', csrf, async (request, response, next) => {
    const { token, displayName, password } = request.body ?? {};
    const name = typeof displayName === 'string' ? displayName.trim() : '';
    if (!name || name.length > 160 || !passwordIsValid(password)) {
      return response.status(400).json({ error: 'Informe seu nome e uma senha com pelo menos 12 caracteres.' });
    }

    let client;
    try {
      const preview = await findValidToken(pool, 'invite', token);
      if (!preview) return response.status(400).json({ error: invalidTokenMessage });
      const passwordHash = await hashPassword(password);

      client = await pool.connect();
      await client.query('BEGIN');
      const locked = await client.query(
        `
        SELECT id, space_id, email
        FROM account_tokens
        WHERE id = $1 AND purpose = 'invite'
          AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        FOR UPDATE
      `,
        [preview.id],
      );
      if (!locked.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: invalidTokenMessage });
      }

      const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [locked.rows[0].email]);
      if (existing.rowCount) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Este e-mail já possui um acesso. Peça ao administrador um novo convite.' });
      }

      const userResult = await client.query(
        'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, display_name',
        [locked.rows[0].email, name, passwordHash],
      );
      const user = userResult.rows[0];
      const spaceId = locked.rows[0].space_id;
      await client.query('INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, $3)', [spaceId, user.id, 'member']);
      await client.query('UPDATE account_tokens SET used_at = now() WHERE id = $1', [locked.rows[0].id]);
      const sessionToken = await createSession(client, { user_id: user.id, space_id: spaceId });
      await client.query('COMMIT');
      response.cookie('cc_session', sessionToken, sessionCookieOptions(secureCookies));
      return response.status(201).json({ user: { id: user.id, name: user.display_name, email: user.email, role: 'member', spaceId } });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505' && error.constraint === 'users_email_key') {
        return response.status(409).json({ error: 'Este e-mail já possui um acesso. Peça ao administrador um novo convite.' });
      }
      next(error);
    } finally {
      client?.release();
    }
  });

  router.get('/password-resets/:token', async (request, response, next) => {
    try {
      const reset = await pool.query(
        `
        SELECT t.email
        FROM account_tokens t
        JOIN users u ON u.id = t.target_user_id AND u.is_active
        JOIN space_memberships m ON m.space_id = t.space_id AND m.user_id = t.target_user_id AND m.deactivated_at IS NULL
        WHERE t.token_hash = $1 AND t.purpose = 'password_reset'
          AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at > now()
        LIMIT 1
      `,
        [inviteTokenPattern.test(request.params.token) ? hashOpaqueToken(request.params.token) : ''],
      );
      return response.json(reset.rows[0] ? { valid: true, email: reset.rows[0].email } : { valid: false });
    } catch (error) {
      next(error);
    }
  });

  router.post('/password-reset', csrf, async (request, response, next) => {
    const { token, password } = request.body ?? {};
    if (!passwordIsValid(password)) {
      return response.status(400).json({ error: 'Use uma senha com pelo menos 12 caracteres.' });
    }

    let client;
    try {
      if (typeof token !== 'string' || !inviteTokenPattern.test(token)) {
        return response.status(400).json({ error: invalidTokenMessage });
      }
      const preview = await pool.query(
        `
        SELECT t.id, t.space_id, t.target_user_id
        FROM account_tokens t
        JOIN users u ON u.id = t.target_user_id AND u.is_active
        JOIN space_memberships m ON m.space_id = t.space_id AND m.user_id = t.target_user_id AND m.deactivated_at IS NULL
        WHERE t.token_hash = $1 AND t.purpose = 'password_reset'
          AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at > now()
        LIMIT 1
      `,
        [hashOpaqueToken(token)],
      );
      if (!preview.rows[0]) return response.status(400).json({ error: invalidTokenMessage });
      const passwordHash = await hashPassword(password);

      client = await pool.connect();
      await client.query('BEGIN');
      const membership = await client.query(
        `
        SELECT role
        FROM space_memberships
        WHERE space_id = $1 AND user_id = $2 AND deactivated_at IS NULL
        FOR UPDATE
      `,
        [preview.rows[0].space_id, preview.rows[0].target_user_id],
      );
      if (!membership.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: invalidTokenMessage });
      }
      const locked = await client.query(
        `
        SELECT t.id, t.space_id, t.target_user_id, u.display_name, u.email, m.role
        FROM account_tokens t
        JOIN users u ON u.id = t.target_user_id AND u.is_active
        JOIN space_memberships m ON m.space_id = t.space_id AND m.user_id = u.id AND m.deactivated_at IS NULL
        WHERE t.id = $1 AND t.purpose = 'password_reset'
          AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at > now()
        FOR UPDATE OF t
      `,
        [preview.rows[0].id],
      );
      if (!locked.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: invalidTokenMessage });
      }
      const tokenRow = locked.rows[0];
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, tokenRow.target_user_id]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [tokenRow.target_user_id]);
      await client.query('UPDATE account_tokens SET used_at = now() WHERE id = $1', [tokenRow.id]);
      const sessionToken = await createSession(client, { user_id: tokenRow.target_user_id, space_id: tokenRow.space_id });
      await client.query('COMMIT');
      response.cookie('cc_session', sessionToken, sessionCookieOptions(secureCookies));
      return response.json({
        ok: true,
        user: {
          id: tokenRow.target_user_id,
          name: tokenRow.display_name,
          email: tokenRow.email,
          role: tokenRow.role,
          spaceId: tokenRow.space_id,
        },
      });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client?.release();
    }
  });

  return router;
}
