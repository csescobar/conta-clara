import express from 'express';
import { requireAuth, requireCsrf } from './auth.js';
import { recordEntryAudit } from '../services/financial-entry-audit.js';
import { generateRecurrenceOccurrences } from '../services/recurrences.js';

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

export function parseEntry(body) {
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

function parseRealization(body) {
  const actualCents = body?.actualCents;
  const realizedOn = body?.realizedOn;
  if (!Number.isSafeInteger(actualCents) || actualCents < 0 || !isIsoDate(realizedOn)) return null;
  return { actualCents, realizedOn };
}

export async function validateReferences(client, spaceId, entry, current = {}) {
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

export async function selectEntry(client, spaceId, entryId) {
  const result = await client.query(`
    SELECT e.id, e.kind, e.description, e.category_id, c.name AS category_name,
      e.competence_on::text AS competence_on, e.due_on::text AS due_on,
      e.planned_cents, e.actual_cents, e.realized_on::text AS realized_on,
      e.payment_method_id, pm.name AS payment_method_name, e.notes,
      e.card_purchase_id, e.installment_number, e.installment_count,
      cc.name AS card_name, i.invoice_month::text AS invoice_month,
      CASE WHEN e.card_purchase_id IS NULL THEN NULL ELSE i.status END AS invoice_status,
      e.recurrence_rule_id, e.recurrence_overridden,
      e.created_by_user_id, e.updated_by_user_id, e.version, e.created_at, e.updated_at,
      CASE
        WHEN e.actual_cents IS NOT NULL THEN 'paid'
        WHEN e.kind = 'expense' AND e.due_on < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'late'
        ELSE 'pending'
      END AS status
    FROM financial_entries e
    LEFT JOIN categories c ON c.space_id = e.space_id AND c.id = e.category_id
    LEFT JOIN payment_methods pm ON pm.space_id = e.space_id AND pm.id = e.payment_method_id
    LEFT JOIN card_purchases cp ON cp.space_id = e.space_id AND cp.id = e.card_purchase_id
    LEFT JOIN credit_cards cc ON cc.space_id = cp.space_id AND cc.id = cp.card_id
    LEFT JOIN card_invoices i ON i.space_id = cp.space_id AND i.card_id = cp.card_id
      AND i.invoice_month = date_trunc('month', e.due_on)::date
    WHERE e.id = $1 AND e.space_id = $2 AND NOT e.recurrence_skipped
  `, [entryId, spaceId]);
  return result.rows[0] ?? null;
}

function requestedBaseVersion(request) {
  const value = request.body?.baseVersion ?? request.get('x-entry-version');
  if (value === undefined) return null;
  const version = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(version) && version > 0 ? version : undefined;
}

function versionConflict(response, entry) {
  return response.status(409).json({ error: 'Este lançamento mudou em outro aparelho. Escolha qual versão manter.', conflict: true, serverEntry: entry });
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
      await generateRecurrenceOccurrences(pool, { spaceId: request.auth.spaceId });
      const monthStart = month ? `${month}-01` : null;
      const result = await pool.query(`
        SELECT e.id, e.kind, e.description, e.category_id, c.name AS category_name,
          e.competence_on::text AS competence_on, e.due_on::text AS due_on,
          e.planned_cents, e.actual_cents, e.realized_on::text AS realized_on,
          e.payment_method_id, pm.name AS payment_method_name, e.notes,
          e.card_purchase_id, e.installment_number, e.installment_count,
          cc.name AS card_name, i.invoice_month::text AS invoice_month,
          CASE WHEN e.card_purchase_id IS NULL THEN NULL ELSE i.status END AS invoice_status,
          e.recurrence_rule_id, e.recurrence_overridden,
          e.created_by_user_id, e.updated_by_user_id, e.version, e.created_at, e.updated_at,
          CASE
            WHEN e.actual_cents IS NOT NULL THEN 'paid'
            WHEN e.kind = 'expense' AND e.due_on < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'late'
            ELSE 'pending'
          END AS status
        FROM financial_entries e
        LEFT JOIN categories c ON c.space_id = e.space_id AND c.id = e.category_id
        LEFT JOIN payment_methods pm ON pm.space_id = e.space_id AND pm.id = e.payment_method_id
        LEFT JOIN card_purchases cp ON cp.space_id = e.space_id AND cp.id = e.card_purchase_id
        LEFT JOIN credit_cards cc ON cc.space_id = cp.space_id AND cc.id = cp.card_id
        LEFT JOIN card_invoices i ON i.space_id = cp.space_id AND i.card_id = cp.card_id
          AND i.invoice_month = date_trunc('month', e.due_on)::date
        WHERE e.space_id = $1 AND NOT e.recurrence_skipped
          AND ($2::date IS NULL OR e.competence_on = $2::date)
          AND ($3::uuid IS NULL OR e.category_id = $3::uuid)
          AND ($4::text IS NULL OR CASE
            WHEN e.actual_cents IS NOT NULL THEN 'paid'
            WHEN e.kind = 'expense' AND e.due_on < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'late'
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
      await recordEntryAudit(client, { spaceId: request.auth.spaceId, actorUserId: request.auth.id, actorName: request.auth.name, entry: created, action: 'created', after: created });
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
    const baseVersion = requestedBaseVersion(request);
    if (baseVersion === undefined) return response.status(400).json({ error: 'A versão-base do lançamento é inválida.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const existing = await client.query('SELECT id, category_id, payment_method_id, recurrence_rule_id, card_purchase_id, version FROM financial_entries WHERE id = $1 AND space_id = $2 AND NOT recurrence_skipped FOR UPDATE', [request.params.id, request.auth.spaceId]);
      if (!existing.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Lançamento não encontrado.' });
      }
      if (existing.rows[0].card_purchase_id) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Edite esta parcela na compra de cartão vinculada.' });
      }
      const before = await selectEntry(client, request.auth.spaceId, request.params.id);
      if (baseVersion !== null && Number(existing.rows[0].version) !== baseVersion) {
        await client.query('ROLLBACK');
        return versionConflict(response, before);
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
          payment_method_id = $7, notes = $8,
          recurrence_overridden = CASE WHEN recurrence_rule_id IS NULL THEN recurrence_overridden ELSE true END,
          updated_by_user_id = $9, updated_at = now(), version = version + 1
        WHERE id = $10 AND space_id = $11
      `, [entry.kind, entry.description, entry.categoryId, entry.competenceOn, entry.dueOn, entry.plannedCents, entry.paymentMethodId, entry.notes, request.auth.id, request.params.id, request.auth.spaceId]);
      const updated = await selectEntry(client, request.auth.spaceId, request.params.id);
      await recordEntryAudit(client, { spaceId: request.auth.spaceId, actorUserId: request.auth.id, actorName: request.auth.name, entry: updated, action: 'updated', before, after: updated });
      await client.query('COMMIT');
      return response.json({ entry: updated });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client?.release();
    }
  });

  router.post('/:id/confirm', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Lançamento não encontrado.' });
    const realization = parseRealization(request.body);
    if (!realization) return response.status(400).json({ error: 'Informe um valor realizado em centavos inteiros e uma data válida.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const existing = await client.query('SELECT actual_cents, planned_cents, card_purchase_id, version FROM financial_entries WHERE id = $1 AND space_id = $2 FOR UPDATE', [request.params.id, request.auth.spaceId]);
      if (!existing.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Lançamento não encontrado.' });
      }
      if (existing.rows[0].card_purchase_id) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Quite a fatura de cartão para liquidar todas as parcelas em um único pagamento.' });
      }
      const baseVersion = requestedBaseVersion(request);
      if (baseVersion === undefined) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: 'A versão-base do lançamento é inválida.' });
      }
      const before = await selectEntry(client, request.auth.spaceId, request.params.id);
      if (baseVersion !== null && Number(existing.rows[0].version) !== baseVersion) {
        await client.query('ROLLBACK');
        return versionConflict(response, before);
      }
      if (existing.rows[0].actual_cents !== null) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Este lançamento já foi confirmado. Desfaça a confirmação antes de alterar o valor realizado.' });
      }
      if (existing.rows[0].card_purchase_id && BigInt(existing.rows[0].planned_cents) !== BigInt(realization.actualCents)) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: 'Confirme a parcela pelo valor integral previsto.' });
      }
      await client.query(`
        UPDATE financial_entries
        SET actual_cents = $1, realized_on = $2, updated_by_user_id = $3, updated_at = now(), version = version + 1
        WHERE id = $4 AND space_id = $5
      `, [realization.actualCents, realization.realizedOn, request.auth.id, request.params.id, request.auth.spaceId]);
      const confirmed = await selectEntry(client, request.auth.spaceId, request.params.id);
      await recordEntryAudit(client, { spaceId: request.auth.spaceId, actorUserId: request.auth.id, actorName: request.auth.name, entry: confirmed, action: 'confirmed', before, after: confirmed });
      await client.query('COMMIT');
      return response.json({ entry: confirmed });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client?.release();
    }
  });

  router.delete('/:id/confirm', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Lançamento não encontrado.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const existing = await client.query('SELECT actual_cents, card_purchase_id, version FROM financial_entries WHERE id = $1 AND space_id = $2 FOR UPDATE', [request.params.id, request.auth.spaceId]);
      if (!existing.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Lançamento não encontrado.' });
      }
      const baseVersion = requestedBaseVersion(request);
      if (baseVersion === undefined) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: 'A versão-base do lançamento é inválida.' });
      }
      const before = await selectEntry(client, request.auth.spaceId, request.params.id);
      if (baseVersion !== null && Number(existing.rows[0].version) !== baseVersion) {
        await client.query('ROLLBACK');
        return versionConflict(response, before);
      }
      if (existing.rows[0].actual_cents === null) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Este lançamento ainda não foi confirmado.' });
      }
      if (existing.rows[0].card_purchase_id) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'A confirmação de uma parcela de cartão não pode ser desfeita.' });
      }
      await client.query(`
        UPDATE financial_entries
        SET actual_cents = NULL, realized_on = NULL, updated_by_user_id = $1, updated_at = now(), version = version + 1
        WHERE id = $2 AND space_id = $3
      `, [request.auth.id, request.params.id, request.auth.spaceId]);
      const unconfirmed = await selectEntry(client, request.auth.spaceId, request.params.id);
      await recordEntryAudit(client, { spaceId: request.auth.spaceId, actorUserId: request.auth.id, actorName: request.auth.name, entry: unconfirmed, action: 'unconfirmed', before, after: unconfirmed });
      await client.query('COMMIT');
      return response.json({ entry: unconfirmed });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client?.release();
    }
  });

  router.delete('/:id', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Lançamento não encontrado.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const existing = await client.query('SELECT id, recurrence_rule_id, card_purchase_id, version FROM financial_entries WHERE id = $1 AND space_id = $2 AND NOT recurrence_skipped FOR UPDATE', [request.params.id, request.auth.spaceId]);
      if (!existing.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'Lançamento não encontrado.' });
      }
      if (existing.rows[0].card_purchase_id) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'Cancele a compra de cartão vinculada para remover parcelas futuras.' });
      }
      const baseVersion = requestedBaseVersion(request);
      if (baseVersion === undefined) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error: 'A versão-base do lançamento é inválida.' });
      }
      const deleted = await selectEntry(client, request.auth.spaceId, request.params.id);
      if (baseVersion !== null && Number(existing.rows[0].version) !== baseVersion) {
        await client.query('ROLLBACK');
        return versionConflict(response, deleted);
      }
      await recordEntryAudit(client, { spaceId: request.auth.spaceId, actorUserId: request.auth.id, actorName: request.auth.name, entry: deleted, action: 'deleted', before: deleted });
      if (existing.rows[0].recurrence_rule_id) {
        await client.query('UPDATE financial_entries SET recurrence_skipped = true, updated_by_user_id = $1, updated_at = now(), version = version + 1 WHERE id = $2 AND space_id = $3', [request.auth.id, request.params.id, request.auth.spaceId]);
      } else {
        await client.query('DELETE FROM financial_entries WHERE id = $1 AND space_id = $2', [request.params.id, request.auth.spaceId]);
      }
      await client.query('COMMIT');
      return response.status(204).end();
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client?.release();
    }
  });

  return router;
}
