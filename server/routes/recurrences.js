import express from 'express';
import { requireAuth, requireCsrf } from './auth.js';
import { generateRecurrenceOccurrences, generateRecurrenceOccurrencesInTransaction } from '../services/recurrences.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const entryKinds = new Set(['income', 'expense', 'investment']);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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

function parseRule(body) {
  const kind = body?.kind;
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const startCompetenceOn = body?.startCompetenceOn;
  const endCompetenceOn = body?.endCompetenceOn === '' || body?.endCompetenceOn === undefined ? null : body?.endCompetenceOn;
  const dueDay = body?.dueDay === '' || body?.dueDay === undefined || body?.dueDay === null ? null : body?.dueDay;
  const plannedCents = body?.plannedCents;
  const categoryId = parseOptionalId(body?.categoryId);
  const paymentMethodId = parseOptionalId(body?.paymentMethodId);
  const notes = body?.notes === undefined || body?.notes === null ? null : typeof body.notes === 'string' ? body.notes.trim() || null : undefined;
  if (!entryKinds.has(kind) || !description || description.length > 200) return null;
  if (!isIsoDate(startCompetenceOn) || startCompetenceOn.slice(-2) !== '01') return null;
  if (endCompetenceOn !== null && (!isIsoDate(endCompetenceOn) || endCompetenceOn.slice(-2) !== '01' || endCompetenceOn < startCompetenceOn)) return null;
  if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) return null;
  if (!Number.isSafeInteger(plannedCents) || plannedCents <= 0) return null;
  if (categoryId === undefined || paymentMethodId === undefined || notes === undefined || (notes && notes.length > 2000)) return null;
  return { kind, description, startCompetenceOn, endCompetenceOn, dueDay, plannedCents, categoryId, paymentMethodId, notes };
}

async function validateReferences(client, spaceId, rule, current = {}) {
  if (rule.categoryId) {
    const category = await client.query(`
      SELECT kind FROM categories
      WHERE id = $1 AND space_id = $2 AND (archived_at IS NULL OR id = $3)
      FOR SHARE
    `, [rule.categoryId, spaceId, current.categoryId ?? null]);
    if (!category.rows[0]) return 'Selecione uma categoria ativa deste espaço.';
    if (category.rows[0].kind !== rule.kind) return 'A categoria precisa corresponder ao tipo da regra.';
  }
  if (rule.paymentMethodId) {
    const method = await client.query(`
      SELECT id FROM payment_methods
      WHERE id = $1 AND space_id = $2 AND (archived_at IS NULL OR id = $3)
      FOR SHARE
    `, [rule.paymentMethodId, spaceId, current.paymentMethodId ?? null]);
    if (!method.rows[0]) return 'Selecione uma forma de pagamento ativa deste espaço.';
  }
  return null;
}

async function selectRule(client, spaceId, ruleId) {
  const result = await client.query(`
    SELECT r.id, r.kind, r.description, r.category_id, c.name AS category_name,
      r.payment_method_id, pm.name AS payment_method_name,
      r.start_competence_on::text AS start_competence_on,
      r.end_competence_on::text AS end_competence_on, r.due_day,
      r.planned_cents, r.notes, r.archived_at::text AS archived_at,
      r.created_by_user_id, r.updated_by_user_id,
      (SELECT count(*)::integer FROM financial_entries e
       WHERE e.space_id = r.space_id AND e.recurrence_rule_id = r.id AND NOT e.recurrence_skipped) AS occurrence_count
    FROM recurrence_rules r
    LEFT JOIN categories c ON c.space_id = r.space_id AND c.id = r.category_id
    LEFT JOIN payment_methods pm ON pm.space_id = r.space_id AND pm.id = r.payment_method_id
    WHERE r.id = $1 AND r.space_id = $2
  `, [ruleId, spaceId]);
  return result.rows[0] ?? null;
}

export function createRecurrencesRouter({ pool, secureCookies = false, csrfSecret }) {
  const router = express.Router();
  const csrf = requireCsrf(csrfSecret);
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));

  router.get('/', async (request, response, next) => {
    try {
      const generatedCount = await generateRecurrenceOccurrences(pool, { spaceId: request.auth.spaceId });
      const result = await pool.query(`
        SELECT r.id, r.kind, r.description, r.category_id, c.name AS category_name,
          r.payment_method_id, pm.name AS payment_method_name,
          r.start_competence_on::text AS start_competence_on,
          r.end_competence_on::text AS end_competence_on, r.due_day,
          r.planned_cents, r.notes, r.archived_at::text AS archived_at,
          r.created_by_user_id, r.updated_by_user_id,
          (SELECT count(*)::integer FROM financial_entries e
           WHERE e.space_id = r.space_id AND e.recurrence_rule_id = r.id AND NOT e.recurrence_skipped) AS occurrence_count
        FROM recurrence_rules r
        LEFT JOIN categories c ON c.space_id = r.space_id AND c.id = r.category_id
        LEFT JOIN payment_methods pm ON pm.space_id = r.space_id AND pm.id = r.payment_method_id
        WHERE r.space_id = $1
        ORDER BY r.archived_at NULLS FIRST, r.start_competence_on DESC, lower(r.description)
      `, [request.auth.spaceId]);
      return response.json({ rules: result.rows, generatedCount });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:id', async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Regra não encontrada.' });
    try {
      const rule = await selectRule(pool, request.auth.spaceId, request.params.id);
      if (!rule) return response.status(404).json({ error: 'Regra não encontrada.' });
      return response.json({ rule });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', csrf, async (request, response, next) => {
    const rule = parseRule(request.body);
    if (!rule) return response.status(400).json({ error: 'Confira o tipo, a descrição, as competências, o dia, o valor e os identificadores.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const referenceError = await validateReferences(client, request.auth.spaceId, rule);
      if (referenceError) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: referenceError });
      }
      const inserted = await client.query(`
        INSERT INTO recurrence_rules (
          space_id, created_by_user_id, updated_by_user_id, kind, description,
          category_id, payment_method_id, start_competence_on, end_competence_on,
          due_day, planned_cents, notes
        ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [request.auth.spaceId, request.auth.id, rule.kind, rule.description, rule.categoryId, rule.paymentMethodId, rule.startCompetenceOn, rule.endCompetenceOn, rule.dueDay, rule.plannedCents, rule.notes]);
      const ruleId = inserted.rows[0].id;
      const generatedCount = await generateRecurrenceOccurrencesInTransaction(client, { spaceId: request.auth.spaceId, ruleId });
      const created = await selectRule(client, request.auth.spaceId, ruleId);
      await client.query('COMMIT');
      return response.status(201).json({ rule: created, generatedCount });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client?.release();
    }
  });

  router.put('/:id', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Regra não encontrada.' });
    const rule = parseRule(request.body);
    if (!rule) return response.status(400).json({ error: 'Confira o tipo, a descrição, as competências, o dia, o valor e os identificadores.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const existing = await client.query(`
        SELECT id, category_id, payment_method_id, archived_at
        FROM recurrence_rules WHERE id = $1 AND space_id = $2 FOR UPDATE
      `, [request.params.id, request.auth.spaceId]);
      if (!existing.rows[0] || existing.rows[0].archived_at) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Regra não encontrada ou arquivada.' });
      }
      const referenceError = await validateReferences(client, request.auth.spaceId, rule, {
        categoryId: existing.rows[0].category_id,
        paymentMethodId: existing.rows[0].payment_method_id,
      });
      if (referenceError) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: referenceError });
      }
      await client.query(`
        UPDATE recurrence_rules SET kind = $1, description = $2, category_id = $3,
          payment_method_id = $4, start_competence_on = $5, end_competence_on = $6,
          due_day = $7, planned_cents = $8, notes = $9,
          updated_by_user_id = $10, updated_at = now()
        WHERE id = $11 AND space_id = $12
      `, [rule.kind, rule.description, rule.categoryId, rule.paymentMethodId, rule.startCompetenceOn, rule.endCompetenceOn, rule.dueDay, rule.plannedCents, rule.notes, request.auth.id, request.params.id, request.auth.spaceId]);
      const generatedCount = await generateRecurrenceOccurrencesInTransaction(client, { spaceId: request.auth.spaceId, ruleId: request.params.id });
      const updated = await selectRule(client, request.auth.spaceId, request.params.id);
      await client.query('COMMIT');
      return response.json({ rule: updated, generatedCount });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client?.release();
    }
  });

  router.post('/:id/archive', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Regra não encontrada.' });
    try {
      const result = await pool.query(`
        UPDATE recurrence_rules SET archived_at = now(), updated_by_user_id = $1, updated_at = now()
        WHERE id = $2 AND space_id = $3 AND archived_at IS NULL
      `, [request.auth.id, request.params.id, request.auth.spaceId]);
      if (!result.rowCount) return response.status(404).json({ error: 'Regra não encontrada ou já arquivada.' });
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
