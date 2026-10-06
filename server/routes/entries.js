import express from 'express';
import { requireAuth, requireCsrf } from './auth.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const entryKinds = new Set(['income', 'expense', 'investment']);
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const statuses = new Set(['pending', 'late', 'paid']);

function isUuid(value) {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function parseOptionalId(value) {
  if (value === undefined || value === null || value === '') return null;
  return isUuid(value) ? value : undefined;
}

function parseEntry(body) {
  const kind = body?.kind;
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const competenceOn = body?.competenceOn;
  const dueOn = body?.dueOn === '' || body?.dueOn === undefined ? null : body?.dueOn;
  const plannedCents = body?.plannedCents;
  const categoryId = parseOptionalId(body?.categoryId);
  const paymentMethodId = parseOptionalId(body?.paymentMethodId);
  const notes = body?.notes === undefined || body?.notes === null ? null : typeof body.notes === 'string' ? body.notes.trim() || null : undefined;

  if (!entryKinds.has(kind) || !description || description.length > 200 || !isIsoDate(competenceOn) || competenceOn.slice(-2) !== '01') return null;
  if (dueOn !== null && !isIsoDate(dueOn)) return null;
  if (!Number.isSafeInteger(plannedCents) || plannedCents <= 0) return null;
  if (categoryId === undefined || paymentMethodId === undefined || notes === undefined || (notes && notes.length > 2000)) return null;
  return { kind, description, competenceOn, dueOn, plannedCents, categoryId, paymentMethodId, notes };
}

async function validateReferences(client, spaceId, entry, current = {}) {
  if (entry.categoryId) {
    const category = await client.query(`
      SELECT kind FROM categories
      WHERE id = $1 AND space_id = $2 AND (archived_at IS NULL OR id = $3)
      FOR SHARE
    `, [entry.categoryId, spaceId, current.categoryId ?? null]);
    if (!category.rows[0]) return 'Selecione uma categoria ativa deste espaço.';
    if (category.rows[0].kind !== entry.kind) return 'A categoria precisa corresponder ao tipo do lançamento.';
  }
  if (entry.paymentMethodId) {
    const method = await client.query(`
      SELECT id FROM payment_methods
      WHERE id = $1 AND space_id = $2 AND (archived_at IS NULL OR id = $3)
      FOR SHARE
    `, [entry.paymentMethodId, spaceId, current.paymentMethodId ?? null]);
    if (!method.rows[0]) return 'Selecione uma forma de pagamento ativa deste espaço.';
  }
  return null;
}

async function selectEntry(client, spaceId, entryId) {
  const result = await client.query(`
    SELECT e.id, e.kind, e.description, e.category_id, c.name AS category_name,
      e.competence_on::text AS competence_on, e.due_on::text AS due_on,
      e.planned_cents, e.actual_cents, e.realized_on::text AS realized_on,
      e.payment_method_id, pm.name AS payment_method_name, e.notes,
      e.created_by_user_id, e.updated_by_user_id, e.created_at, e.updated_at,
      CASE
        WHEN e.actual_cents IS NOT NULL THEN 'paid'
        WHEN e.due_on < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'late'
        ELSE 'pending'
      END AS status
    FROM financial_entries e
    LEFT JOIN categories c ON c.space_id = e.space_id AND c.id = e.category_id
    LEFT JOIN payment_methods pm ON pm.space_id = e.space_id AND pm.id = e.payment_method_id
    WHERE e.id = $1 AND e.space_id = $2
  `, [entryId, spaceId]);
  return result.rows[0] ?? null;
}

export function createEntriesRouter({ pool, secureCookies = false, csrfSecret }) {
  const router = express.Router();
  const csrf = requireCsrf(csrfSecret);
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));

  router.get('/', async (request, response, next) => {
    const month = request.query.month || null;
    const categoryId = request.query.categoryId || null;
    const status = request.query.status || null;
    if (month !== null && (typeof month !== 'string' || !monthPattern.test(month))) return response.status(400).json({ error: 'Informe a competência no formato AAAA-MM.' });
    if (categoryId !== null && !isUuid(categoryId)) return response.status(400).json({ error: 'Categoria inválida.' });
    if (status !== null && (typeof status !== 'string' || !statuses.has(status))) return response.status(400).json({ error: 'Situação inválida.' });
    try {
      const monthStart = month ? `${month}-01` : null;
      const result = await pool.query(`
        SELECT e.id, e.kind, e.description, e.category_id, c.name AS category_name,
          e.competence_on::text AS competence_on, e.due_on::text AS due_on,
          e.planned_cents, e.actual_cents, e.realized_on::text AS realized_on,
          e.payment_method_id, pm.name AS payment_method_name, e.notes,
          e.created_by_user_id, e.updated_by_user_id, e.created_at, e.updated_at,
          CASE
            WHEN e.actual_cents IS NOT NULL THEN 'paid'
            WHEN e.due_on < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'late'
            ELSE 'pending'
          END AS status
        FROM financial_entries e
        LEFT JOIN categories c ON c.space_id = e.space_id AND c.id = e.category_id
        LEFT JOIN payment_methods pm ON pm.space_id = e.space_id AND pm.id = e.payment_method_id
        WHERE e.space_id = $1
          AND ($2::date IS NULL OR e.competence_on = $2::date)
          AND ($3::uuid IS NULL OR e.category_id = $3::uuid)
          AND ($4::text IS NULL OR CASE
            WHEN e.actual_cents IS NOT NULL THEN 'paid'
            WHEN e.due_on < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'late'
            ELSE 'pending'
          END = $4::text)
        ORDER BY e.competence_on DESC, e.due_on NULLS LAST, lower(e.description), e.id
      `, [request.auth.spaceId, monthStart, categoryId, status]);
      return response.json({ entries: result.rows });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', csrf, async (request, response, next) => {
    const entry = parseEntry(request.body);
    if (!entry) return response.status(400).json({ error: 'Confira o tipo, a descrição, as datas, o valor e os identificadores.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const referenceError = await validateReferences(client, request.auth.spaceId, entry);
      if (referenceError) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: referenceError });
      }
      const result = await client.query(`
        INSERT INTO financial_entries (
          space_id, created_by_user_id, updated_by_user_id, kind, description,
          category_id, competence_on, due_on, planned_cents, payment_method_id, notes
        ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [request.auth.spaceId, request.auth.id, entry.kind, entry.description, entry.categoryId, entry.competenceOn, entry.dueOn, entry.plannedCents, entry.paymentMethodId, entry.notes]);
      const created = await selectEntry(client, request.auth.spaceId, result.rows[0].id);
      await client.query('COMMIT');
      return response.status(201).json({ entry: created });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client?.release();
    }
  });

  router.get('/:id', async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Lançamento não encontrado.' });
    try {
      const entry = await selectEntry(pool, request.auth.spaceId, request.params.id);
      if (!entry) return response.status(404).json({ error: 'Lançamento não encontrado.' });
      return response.json({ entry });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/:id', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Lançamento não encontrado.' });
    const entry = parseEntry(request.body);
    if (!entry) return response.status(400).json({ error: 'Confira o tipo, a descrição, as datas, o valor e os identificadores.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const existing = await client.query('SELECT id, category_id, payment_method_id FROM financial_entries WHERE id = $1 AND space_id = $2 FOR UPDATE', [request.params.id, request.auth.spaceId]);
      if (!existing.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Lançamento não encontrado.' });
      }
      const referenceError = await validateReferences(client, request.auth.spaceId, entry, {
        categoryId: existing.rows[0].category_id,
        paymentMethodId: existing.rows[0].payment_method_id,
      });
      if (referenceError) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: referenceError });
      }
      await client.query(`
        UPDATE financial_entries SET kind = $1, description = $2, category_id = $3,
          competence_on = $4, due_on = $5, planned_cents = $6,
          payment_method_id = $7, notes = $8, updated_by_user_id = $9, updated_at = now()
        WHERE id = $10 AND space_id = $11
      `, [entry.kind, entry.description, entry.categoryId, entry.competenceOn, entry.dueOn, entry.plannedCents, entry.paymentMethodId, entry.notes, request.auth.id, request.params.id, request.auth.spaceId]);
      const updated = await selectEntry(client, request.auth.spaceId, request.params.id);
      await client.query('COMMIT');
      return response.json({ entry: updated });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client?.release();
    }
  });

  router.delete('/:id', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Lançamento não encontrado.' });
    try {
      const result = await pool.query('DELETE FROM financial_entries WHERE id = $1 AND space_id = $2 RETURNING id', [request.params.id, request.auth.spaceId]);
      if (!result.rowCount) return response.status(404).json({ error: 'Lançamento não encontrado.' });
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
