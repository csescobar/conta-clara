import express from 'express';
import { requireAuth, requireCsrf } from './auth.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && uuidPattern.test(value);
}

export function parseCard(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const holderUserId = body?.holderUserId;
  const closingDay = body?.closingDay;
  const dueDay = body?.dueDay;
  if (!name || name.length > 80 || !isUuid(holderUserId)) return null;
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) return null;
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null;
  return { name, holderUserId, closingDay, dueDay };
}

function requestedVersion(value) {
  const version = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(version) && version > 0 ? version : undefined;
}

export async function selectCard(client, spaceId, cardId) {
  const result = await client.query(
    `
    SELECT c.id, c.name, c.holder_user_id, u.display_name AS holder_name,
      c.closing_day, c.due_day, c.archived_at, c.created_by_user_id,
      c.updated_by_user_id, c.version, c.created_at, c.updated_at
    FROM credit_cards c
    JOIN users u ON u.id = c.holder_user_id
    WHERE c.id = $1 AND c.space_id = $2
  `,
    [cardId, spaceId],
  );
  return result.rows[0] ?? null;
}

export async function validateCardHolder(client, spaceId, holderUserId, currentHolderId = null) {
  if (holderUserId === currentHolderId) return null;
  const result = await client.query(
    `
    SELECT 1 FROM space_memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.space_id = $1 AND m.user_id = $2
      AND m.deactivated_at IS NULL AND u.is_active
    FOR SHARE OF m, u
  `,
    [spaceId, holderUserId],
  );
  return result.rowCount ? null : 'Selecione uma pessoa ativa deste espaço como titular.';
}

function sendCardError(error, response, next) {
  if (error.code === '23505') return response.status(409).json({ error: 'Já existe um cartão ativo com este apelido.' });
  return next(error);
}

function sendConflict(response, serverCard) {
  return response
    .status(409)
    .json({ error: 'Este cartão mudou em outro aparelho. Confira a versão atual antes de salvar.', conflict: true, serverCard });
}

export function createCardsRouter({ pool, secureCookies = false, csrfSecret }) {
  const router = express.Router();
  const csrf = requireCsrf(csrfSecret);
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));

  router.get('/', async (request, response, next) => {
    try {
      const includeArchived = request.query.includeArchived === 'true';
      const result = await pool.query(
        `
        SELECT c.id, c.name, c.holder_user_id, u.display_name AS holder_name,
          c.closing_day, c.due_day, c.archived_at, c.created_by_user_id,
          c.updated_by_user_id, c.version, c.created_at, c.updated_at
        FROM credit_cards c
        JOIN users u ON u.id = c.holder_user_id
        WHERE c.space_id = $1 AND ($2::boolean OR c.archived_at IS NULL)
        ORDER BY lower(c.name), c.id
      `,
        [request.auth.spaceId, includeArchived],
      );
      return response.json({ cards: result.rows });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', csrf, async (request, response, next) => {
    const card = parseCard(request.body);
    if (!card) return response.status(400).json({ error: 'Confira o apelido, o titular e os dias de fechamento e vencimento.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const holderError = await validateCardHolder(client, request.auth.spaceId, card.holderUserId);
      if (holderError) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: holderError });
      }
      const inserted = await client.query(
        `
        INSERT INTO credit_cards (
          space_id, name, holder_user_id, closing_day, due_day,
          created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $6)
        RETURNING id
      `,
        [request.auth.spaceId, card.name, card.holderUserId, card.closingDay, card.dueDay, request.auth.id],
      );
      const created = await selectCard(client, request.auth.spaceId, inserted.rows[0].id);
      await client.query('COMMIT');
      return response.status(201).json({ card: created });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return sendCardError(error, response, next);
    } finally {
      client?.release();
    }
  });

  router.put('/:id', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Cartão não encontrado.' });
    const card = parseCard(request.body);
    const baseVersion = requestedVersion(request.body?.baseVersion);
    if (!card || baseVersion === undefined) return response.status(400).json({ error: 'Confira os dados do cartão e sua versão atual.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const currentResult = await client.query(
        'SELECT holder_user_id, version, archived_at FROM credit_cards WHERE id = $1 AND space_id = $2 FOR UPDATE',
        [request.params.id, request.auth.spaceId],
      );
      const current = currentResult.rows[0];
      if (!current || current.archived_at) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Cartão não encontrado ou arquivado.' });
      }
      const serverCard = await selectCard(client, request.auth.spaceId, request.params.id);
      if (Number(current.version) !== baseVersion) {
        await client.query('ROLLBACK');
        return sendConflict(response, serverCard);
      }
      const holderError = await validateCardHolder(client, request.auth.spaceId, card.holderUserId, current.holder_user_id);
      if (holderError) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: holderError });
      }
      await client.query(
        `
        UPDATE credit_cards SET name = $1, holder_user_id = $2,
          closing_day = $3, due_day = $4, updated_by_user_id = $5,
          updated_at = now(), version = version + 1
        WHERE id = $6 AND space_id = $7
      `,
        [card.name, card.holderUserId, card.closingDay, card.dueDay, request.auth.id, request.params.id, request.auth.spaceId],
      );
      const updated = await selectCard(client, request.auth.spaceId, request.params.id);
      await client.query('COMMIT');
      return response.json({ card: updated });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return sendCardError(error, response, next);
    } finally {
      client?.release();
    }
  });

  for (const action of ['archive', 'restore']) {
    router.post(`/:id/${action}`, csrf, async (request, response, next) => {
      if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Cartão não encontrado.' });
      const baseVersion = requestedVersion(request.body?.baseVersion);
      if (baseVersion === undefined) return response.status(400).json({ error: 'A versão-base do cartão é inválida.' });
      let client;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        const currentResult = await client.query(
          'SELECT version, archived_at FROM credit_cards WHERE id = $1 AND space_id = $2 FOR UPDATE',
          [request.params.id, request.auth.spaceId],
        );
        const current = currentResult.rows[0];
        if (!current || (action === 'archive' ? current.archived_at : !current.archived_at)) {
          await client.query('ROLLBACK');
          return response.status(404).json({ error: current ? 'O cartão já está nesse estado.' : 'Cartão não encontrado.' });
        }
        const serverCard = await selectCard(client, request.auth.spaceId, request.params.id);
        if (Number(current.version) !== baseVersion) {
          await client.query('ROLLBACK');
          return sendConflict(response, serverCard);
        }
        await client.query(
          `
          UPDATE credit_cards SET archived_at = ${action === 'archive' ? 'now()' : 'NULL'},
            updated_by_user_id = $1, updated_at = now(), version = version + 1
          WHERE id = $2 AND space_id = $3
        `,
          [request.auth.id, request.params.id, request.auth.spaceId],
        );
        const updated = await selectCard(client, request.auth.spaceId, request.params.id);
        await client.query('COMMIT');
        return response.json({ card: updated });
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        return sendCardError(error, response, next);
      } finally {
        client?.release();
      }
    });
  }

  return router;
}
