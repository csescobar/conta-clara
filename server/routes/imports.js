import { createHash } from 'node:crypto';
import express from 'express';
import { requireAuth, requireCsrf } from './auth.js';
import { recordEntryAudit } from '../services/financial-entry-audit.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const kinds = new Set(['income', 'expense', 'investment']);
const maxEntries = 500;

function isIsoDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function optionalUuid(value) {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}

function parseImportedEntry(body) {
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const categoryId = optionalUuid(body?.categoryId);
  const paymentMethodId = optionalUuid(body?.paymentMethodId);
  const dueOn = body?.dueOn === '' || body?.dueOn === undefined ? null : body.dueOn;
  const plannedCents = body?.plannedCents;
  const actualCents = body?.actualCents === undefined ? null : body.actualCents;
  const realizedOn = body?.realizedOn === undefined ? null : body.realizedOn;
  const notes = body?.notes === undefined || body?.notes === null || body?.notes === '' ? null : typeof body.notes === 'string' ? body.notes.trim() : undefined;

  if (!kinds.has(body?.kind) || !description || description.length > 200) return null;
  if (!isIsoDate(body?.competenceOn) || body.competenceOn.slice(-2) !== '01') return null;
  if (dueOn !== null && !isIsoDate(dueOn)) return null;
  if (!Number.isSafeInteger(plannedCents) || plannedCents <= 0) return null;
  if (categoryId === undefined || paymentMethodId === undefined) return null;
  if (actualCents !== null && (!Number.isSafeInteger(actualCents) || actualCents < 0)) return null;
  if ((actualCents === null) !== (realizedOn === null) || (realizedOn !== null && !isIsoDate(realizedOn))) return null;
  if (notes === undefined || (notes && notes.length > 2000)) return null;
  return { kind: body.kind, description, categoryId, competenceOn: body.competenceOn, dueOn, plannedCents, actualCents, realizedOn, paymentMethodId, notes };
}

function canonicalFingerprint(entries) {
  const orderedEntries = entries.map((entry) => JSON.stringify(entry)).sort();
  return createHash('sha256').update(JSON.stringify(orderedEntries)).digest('hex');
}

export function createImportsRouter({ pool, secureCookies = false, csrfSecret }) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));
  router.use(express.json({ limit: '4mb' }));

  router.post('/', requireCsrf(csrfSecret), async (request, response, next) => {
    const rawEntries = request.body?.entries;
    if (!Array.isArray(rawEntries) || rawEntries.length < 1 || rawEntries.length > maxEntries) {
      return response.status(400).json({ error: `Confirme entre 1 e ${maxEntries} lançamentos válidos.` });
    }
    const entries = rawEntries.map(parseImportedEntry);
    if (entries.some((entry) => !entry)) return response.status(400).json({ error: 'Um ou mais lançamentos têm tipo, descrição, competência, valor ou datas inválidas.' });
    const validatedEntries = entries;
    const fingerprint = canonicalFingerprint(validatedEntries);

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const categoryIds = [...new Set(validatedEntries.map((entry) => entry.categoryId).filter(Boolean))];
      const paymentMethodIds = [...new Set(validatedEntries.map((entry) => entry.paymentMethodId).filter(Boolean))];
      const categoryResult = categoryIds.length ? await client.query(`
        SELECT id, name, kind FROM categories
        WHERE space_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL
        FOR SHARE
      `, [request.auth.spaceId, categoryIds]) : { rows: [] };
      const methodResult = paymentMethodIds.length ? await client.query(`
        SELECT id, name FROM payment_methods
        WHERE space_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL
        FOR SHARE
      `, [request.auth.spaceId, paymentMethodIds]) : { rows: [] };
      const categories = new Map(categoryResult.rows.map((row) => [row.id, row]));
      const methods = new Map(methodResult.rows.map((row) => [row.id, row]));
      for (const entry of validatedEntries) {
        if (entry.categoryId && (!categories.has(entry.categoryId) || categories.get(entry.categoryId).kind !== entry.kind)) {
          await client.query('ROLLBACK');
          return response.status(400).json({ error: 'Cada categoria precisa estar ativa, pertencer a este espaço e corresponder ao tipo do lançamento.' });
        }
        if (entry.paymentMethodId && !methods.has(entry.paymentMethodId)) {
          await client.query('ROLLBACK');
          return response.status(400).json({ error: 'Cada forma de pagamento precisa estar ativa e pertencer a este espaço.' });
        }
      }

      const batchResult = await client.query(`
        INSERT INTO spreadsheet_import_batches (space_id, imported_by_user_id, fingerprint, item_count)
        VALUES ($1, $2, $3, $4)
        RETURNING id, fingerprint, item_count, imported_at
      `, [request.auth.spaceId, request.auth.id, fingerprint, validatedEntries.length]);
      const imported = [];
      for (const entry of validatedEntries) {
        const result = await client.query(`
          INSERT INTO financial_entries (
            space_id, created_by_user_id, updated_by_user_id, kind, description,
            category_id, competence_on, due_on, planned_cents, actual_cents, realized_on,
            payment_method_id, notes
          ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `, [request.auth.spaceId, request.auth.id, entry.kind, entry.description, entry.categoryId, entry.competenceOn, entry.dueOn, entry.plannedCents, entry.actualCents, entry.realizedOn, entry.paymentMethodId, entry.notes]);
        const category = entry.categoryId ? categories.get(entry.categoryId) : null;
        const method = entry.paymentMethodId ? methods.get(entry.paymentMethodId) : null;
        const auditEntry = {
          id: result.rows[0].id,
          ...entry,
          category_id: entry.categoryId,
          category_name: category?.name ?? null,
          competence_on: entry.competenceOn,
          due_on: entry.dueOn,
          planned_cents: entry.plannedCents,
          actual_cents: entry.actualCents,
          realized_on: entry.realizedOn,
          payment_method_id: entry.paymentMethodId,
          payment_method_name: method?.name ?? null,
        };
        await recordEntryAudit(client, { spaceId: request.auth.spaceId, actorUserId: request.auth.id, actorName: request.auth.name, entry: auditEntry, action: 'created', after: auditEntry });
        imported.push({ id: auditEntry.id, description: entry.description, kind: entry.kind });
      }
      await client.query('COMMIT');
      return response.status(201).json({ batch: batchResult.rows[0], entries: imported });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') return response.status(409).json({ error: 'Este mesmo lote já foi importado para este espaço.' });
      return next(error);
    } finally {
      client?.release();
    }
  });

  return router;
}
