import express from 'express';
import { requireAuth, requireCsrf } from './auth.js';
import { parseEntry, selectEntry, validateReferences } from './entries.js';
import { parseCard, selectCard, validateCardHolder } from './cards.js';
import { recordEntryAudit } from '../services/financial-entry-audit.js';
import { cancelPurchase, createPurchase, parsePurchaseSnapshot, selectPurchase, updatePurchase } from '../services/card-purchases.js';
import { isInvoiceMonth, lockCardInvoiceKeys, selectCardInvoice, updateInvoicePayment } from '../services/card-invoices.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const kinds = new Set(['create', 'update', 'delete']);

function isIsoDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function parseOperation(body) {
  if (body?.entity === 'invoice') {
    if (!uuidPattern.test(body.cardId ?? '') || !uuidPattern.test(body.operationId ?? '') || !isInvoiceMonth(body.invoiceMonth) || !['pay', 'reverse'].includes(body.kind)) return null;
    if (!Number.isSafeInteger(body.baseVersion) || body.baseVersion < 1) return null;
    if (body.kind === 'reverse') {
      if (body.payload !== null) return null;
      return { entity: 'invoice', operationId: body.operationId, cardId: body.cardId, invoiceMonth: body.invoiceMonth, kind: body.kind, baseVersion: body.baseVersion, payload: null };
    }
    const payload = body.payload;
    const paymentMethodId = payload?.paymentMethodId === undefined || payload?.paymentMethodId === null || payload?.paymentMethodId === ''
      ? null : payload.paymentMethodId;
    if (!Number.isSafeInteger(payload?.actualCents) || payload.actualCents <= 0 || !isIsoDate(payload.paidOn)
      || (paymentMethodId !== null && !uuidPattern.test(paymentMethodId)) || (payload?.replacePaid !== undefined && typeof payload.replacePaid !== 'boolean')) return null;
    return { entity: 'invoice', operationId: body.operationId, cardId: body.cardId, invoiceMonth: body.invoiceMonth, kind: body.kind, baseVersion: body.baseVersion, payload: { actualCents: payload.actualCents, paidOn: payload.paidOn, paymentMethodId, replacePaid: payload.replacePaid === true } };
  }
  if (body?.entity === 'purchase') {
    if (!uuidPattern.test(body.purchaseId ?? '') || !uuidPattern.test(body.operationId ?? '') || !['create', 'update', 'delete'].includes(body.kind)) return null;
    const baseVersion = body.baseVersion;
    if (body.kind === 'create' ? baseVersion !== null : !Number.isSafeInteger(baseVersion) || baseVersion < 1) return null;
    if (body.kind === 'delete') {
      if (body.payload !== null) return null;
      return { entity: 'purchase', operationId: body.operationId, purchaseId: body.purchaseId, kind: body.kind, baseVersion, payload: null };
    }
    const payload = parsePurchaseSnapshot(body.payload);
    if (!payload) return null;
    return { entity: 'purchase', operationId: body.operationId, purchaseId: body.purchaseId, kind: body.kind, baseVersion, payload };
  }
  if (body?.entity === 'card') {
    if (!uuidPattern.test(body.cardId ?? '') || !uuidPattern.test(body.operationId ?? '') || !['create', 'update'].includes(body.kind)) return null;
    const baseVersion = body.baseVersion;
    if (body.kind === 'create' ? baseVersion !== null : !Number.isSafeInteger(baseVersion) || baseVersion < 1) return null;
    const card = parseCard(body.payload);
    if (!card || typeof body.payload.archived !== 'boolean' || (body.kind === 'create' && body.payload.archived)) return null;
    return { entity: 'card', operationId: body.operationId, cardId: body.cardId, kind: body.kind, baseVersion, payload: { ...card, archived: body.payload.archived } };
  }
  if (body?.entity !== undefined && body.entity !== 'entry') return null;
  if (!body || !uuidPattern.test(body.operationId ?? '') || !uuidPattern.test(body.entryId ?? '') || !kinds.has(body.kind)) return null;
  const baseVersion = body.baseVersion;
  if (body.kind === 'create' ? baseVersion !== null : !Number.isSafeInteger(baseVersion) || baseVersion < 1) return null;
  if (body.kind === 'delete') {
    if (body.payload !== null) return null;
    return { operationId: body.operationId, entryId: body.entryId, kind: body.kind, baseVersion, payload: null };
  }
  const payload = parseEntry(body.payload);
  if (!payload) return null;
  return { operationId: body.operationId, entryId: body.entryId, kind: body.kind, baseVersion, payload };
}

async function selectSyncRow(client, spaceId, entryId) {
  const result = await client.query(`
    SELECT id, category_id, payment_method_id, recurrence_rule_id, recurrence_skipped, card_purchase_id, version
    FROM financial_entries WHERE id = $1 AND space_id = $2 FOR UPDATE
  `, [entryId, spaceId]);
  return result.rows[0] ?? null;
}

async function storeReceipt(client, { spaceId, userId, operation, request, body }) {
  await client.query(`
    INSERT INTO financial_sync_receipts (space_id, operation_id, actor_user_id, request, response_status, response_body)
    VALUES ($1, $2, $3, $4::jsonb, 200, $5::jsonb)
  `, [spaceId, operation.operationId, userId, JSON.stringify(request), JSON.stringify(body)]);
}

async function applyOperation(client, request, operation) {
  const spaceId = request.auth.spaceId;
  const userId = request.auth.id;
  const normalizedRequest = {
    operationId: operation.operationId,
    ...(operation.entity === 'card' ? { entity: 'card', cardId: operation.cardId }
      : operation.entity === 'purchase' ? { entity: 'purchase', purchaseId: operation.purchaseId }
        : operation.entity === 'invoice' ? { entity: 'invoice', cardId: operation.cardId, invoiceMonth: operation.invoiceMonth }
          : { entryId: operation.entryId }),
    kind: operation.kind,
    baseVersion: operation.baseVersion,
    payload: operation.payload,
  };
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [spaceId, operation.operationId]);
  const receipt = await client.query(`
    SELECT actor_user_id, request, request = $3::jsonb AS same_request, response_status, response_body
    FROM financial_sync_receipts WHERE space_id = $1 AND operation_id = $2 FOR UPDATE
  `, [spaceId, operation.operationId, JSON.stringify(normalizedRequest)]);
  if (receipt.rows[0]) {
    const previous = receipt.rows[0];
    if (previous.actor_user_id !== userId || !previous.same_request) {
      const sameResource = previous.actor_user_id === userId
        && previous.request.entity === operation.entity
        && (operation.entity === 'card' ? previous.request.cardId === operation.cardId
          : operation.entity === 'purchase' ? previous.request.purchaseId === operation.purchaseId
            : operation.entity === 'invoice' ? previous.request.cardId === operation.cardId && previous.request.invoiceMonth === operation.invoiceMonth
              : previous.request.entryId === operation.entryId);
      const resourceName = operation.entity === 'card' ? 'card' : operation.entity === 'purchase' ? 'purchase' : operation.entity === 'invoice' ? 'invoice' : 'entry';
      const serverResource = sameResource ? previous.response_body[resourceName] ?? null : null;
      const resourceFields = operation.entity === 'card' ? { serverCard: serverResource }
        : operation.entity === 'purchase' ? { serverPurchase: serverResource }
          : operation.entity === 'invoice' ? { serverInvoice: serverResource } : { serverEntry: serverResource };
      return { status: 409, body: { status: 'conflict', reason: 'idempotency_key_reused', ...resourceFields, error: 'Esta operação já foi usada com outros dados.' } };
    }
    return { status: Number(previous.response_status), body: previous.response_body };
  }

  if (operation.entity === 'card') {
    if (operation.kind === 'create') {
      const holderError = await validateCardHolder(client, spaceId, operation.payload.holderUserId);
      if (holderError) return { status: 400, body: { error: holderError } };
      const duplicate = await client.query('SELECT 1 FROM credit_cards WHERE space_id = $1 AND lower(name) = lower($2) AND archived_at IS NULL', [spaceId, operation.payload.name]);
      if (duplicate.rowCount) return { status: 400, body: { error: 'Já existe um cartão ativo com este apelido.' } };
      const inserted = await client.query(`
        INSERT INTO credit_cards (
          id, space_id, name, holder_user_id, closing_day, due_day,
          created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `, [operation.cardId, spaceId, operation.payload.name, operation.payload.holderUserId, operation.payload.closingDay, operation.payload.dueDay, userId]);
      if (!inserted.rowCount) {
        const serverCard = await selectCard(client, spaceId, operation.cardId);
        return { status: 409, body: { status: 'conflict', reason: 'id_collision', serverCard } };
      }
      const card = await selectCard(client, spaceId, operation.cardId);
      const body = { status: 'applied', operationId: operation.operationId, card };
      await storeReceipt(client, { spaceId, userId, operation, request: normalizedRequest, body });
      return { status: 200, body };
    }

    const currentResult = await client.query('SELECT holder_user_id, archived_at, version FROM credit_cards WHERE id = $1 AND space_id = $2 FOR UPDATE', [operation.cardId, spaceId]);
    const current = currentResult.rows[0];
    if (!current) return { status: 409, body: { status: 'conflict', reason: 'server_deleted', serverCard: null } };
    const serverCard = await selectCard(client, spaceId, operation.cardId);
    if (Number(current.version) !== operation.baseVersion) {
      return { status: 409, body: { status: 'conflict', reason: 'version_mismatch', serverCard } };
    }
    const holderError = await validateCardHolder(client, spaceId, operation.payload.holderUserId, current.holder_user_id);
    if (holderError) return { status: 400, body: { error: holderError } };
    const duplicate = await client.query(`
      SELECT 1 FROM credit_cards WHERE space_id = $1 AND lower(name) = lower($2)
        AND archived_at IS NULL AND id <> $3
    `, [spaceId, operation.payload.name, operation.cardId]);
    if (!operation.payload.archived && duplicate.rowCount) return { status: 400, body: { error: 'Já existe um cartão ativo com este apelido.' } };
    await client.query(`
      UPDATE credit_cards SET name = $1, holder_user_id = $2,
        closing_day = $3, due_day = $4, archived_at = CASE WHEN $5 THEN COALESCE(archived_at, now()) ELSE NULL END,
        updated_by_user_id = $6, updated_at = now(), version = version + 1
      WHERE id = $7 AND space_id = $8
    `, [operation.payload.name, operation.payload.holderUserId, operation.payload.closingDay, operation.payload.dueDay, operation.payload.archived, userId, operation.cardId, spaceId]);
    const card = await selectCard(client, spaceId, operation.cardId);
    const body = { status: 'applied', operationId: operation.operationId, card };
    await storeReceipt(client, { spaceId, userId, operation, request: normalizedRequest, body });
    return { status: 200, body };
  }

  if (operation.entity === 'purchase') {
    let result;
    if (operation.kind === 'create') {
      result = await createPurchase(client, { spaceId, userId, actorName: request.auth.name, purchaseId: operation.purchaseId, snapshot: operation.payload });
    } else if (operation.kind === 'update') {
      result = await updatePurchase(client, { spaceId, userId, actorName: request.auth.name, purchaseId: operation.purchaseId, baseVersion: operation.baseVersion, snapshot: operation.payload });
    } else {
      result = await cancelPurchase(client, { spaceId, userId, actorName: request.auth.name, purchaseId: operation.purchaseId, baseVersion: operation.baseVersion });
    }
    if (result.status !== 200) return result;
    const body = { ...result.body, operationId: operation.operationId };
    await storeReceipt(client, { spaceId, userId, operation, request: normalizedRequest, body });
    return { status: 200, body };
  }

  if (operation.entity === 'invoice') {
    await lockCardInvoiceKeys(client, spaceId, [{ cardId: operation.cardId, invoiceMonth: operation.invoiceMonth }]);
    const result = await updateInvoicePayment(client, {
      spaceId, userId, actorName: request.auth.name, cardId: operation.cardId,
      month: operation.invoiceMonth, action: operation.kind, baseVersion: operation.baseVersion, payload: operation.payload,
    });
    if (result.status !== 200) return result;
    const body = { ...result.body, operationId: operation.operationId };
    await storeReceipt(client, { spaceId, userId, operation, request: normalizedRequest, body });
    return { status: 200, body };
  }

  if (operation.kind === 'create') {
    const referenceError = await validateReferences(client, spaceId, operation.payload);
    if (referenceError) return { status: 400, body: { error: referenceError } };
    const inserted = await client.query(`
      INSERT INTO financial_entries (
        id, space_id, created_by_user_id, updated_by_user_id, kind, description,
        category_id, competence_on, due_on, planned_cents, payment_method_id, notes
      ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `, [operation.entryId, spaceId, userId, operation.payload.kind, operation.payload.description, operation.payload.categoryId, operation.payload.competenceOn, operation.payload.dueOn, operation.payload.plannedCents, operation.payload.paymentMethodId, operation.payload.notes]);
    if (!inserted.rowCount) {
      const current = await selectSyncRow(client, spaceId, operation.entryId);
      const serverEntry = current && !current.recurrence_skipped ? await selectEntry(client, spaceId, operation.entryId) : null;
      return { status: 409, body: { status: 'conflict', reason: 'id_collision', serverEntry } };
    }
    const entry = await selectEntry(client, spaceId, operation.entryId);
    await recordEntryAudit(client, { spaceId, actorUserId: userId, actorName: request.auth.name, entry, action: 'created', after: entry });
    const body = { status: 'applied', operationId: operation.operationId, entry };
    await storeReceipt(client, { spaceId, userId, operation, request: normalizedRequest, body });
    return { status: 200, body };
  }

  const current = await selectSyncRow(client, spaceId, operation.entryId);
  if (operation.kind === 'delete' && (!current || current.recurrence_skipped)) {
    const body = { status: 'applied', operationId: operation.operationId, entryId: operation.entryId, deleted: true, version: current?.version ?? null };
    await storeReceipt(client, { spaceId, userId, operation, request: normalizedRequest, body });
    return { status: 200, body };
  }
  if (!current || current.recurrence_skipped) {
    return { status: 409, body: { status: 'conflict', reason: 'server_deleted', serverEntry: null } };
  }
  if (current.card_purchase_id) {
    return { status: 400, body: { error: 'Altere parcelas pela compra de cartão vinculada.' } };
  }

  const serverEntry = await selectEntry(client, spaceId, operation.entryId);
  if (Number(current.version) !== operation.baseVersion) {
    return { status: 409, body: { status: 'conflict', reason: 'version_mismatch', serverEntry } };
  }

  if (operation.kind === 'update') {
    const referenceError = await validateReferences(client, spaceId, operation.payload, current);
    if (referenceError) return { status: 400, body: { error: referenceError } };
    const before = serverEntry;
    await client.query(`
      UPDATE financial_entries SET kind = $1, description = $2, category_id = $3,
        competence_on = $4, due_on = $5, planned_cents = $6,
        payment_method_id = $7, notes = $8,
        recurrence_overridden = CASE WHEN recurrence_rule_id IS NULL THEN recurrence_overridden ELSE true END,
        updated_by_user_id = $9, updated_at = now(), version = version + 1
      WHERE id = $10 AND space_id = $11
    `, [operation.payload.kind, operation.payload.description, operation.payload.categoryId, operation.payload.competenceOn, operation.payload.dueOn, operation.payload.plannedCents, operation.payload.paymentMethodId, operation.payload.notes, userId, operation.entryId, spaceId]);
    const entry = await selectEntry(client, spaceId, operation.entryId);
    await recordEntryAudit(client, { spaceId, actorUserId: userId, actorName: request.auth.name, entry, action: 'updated', before, after: entry });
    const body = { status: 'applied', operationId: operation.operationId, entry };
    await storeReceipt(client, { spaceId, userId, operation, request: normalizedRequest, body });
    return { status: 200, body };
  }

  await recordEntryAudit(client, { spaceId, actorUserId: userId, actorName: request.auth.name, entry: serverEntry, action: 'deleted', before: serverEntry });
  const nextVersion = Number(current.version) + 1;
  if (current.recurrence_rule_id) {
    await client.query(`
      UPDATE financial_entries SET recurrence_skipped = true, updated_by_user_id = $1,
        updated_at = now(), version = version + 1 WHERE id = $2 AND space_id = $3
    `, [userId, operation.entryId, spaceId]);
  } else {
    await client.query('DELETE FROM financial_entries WHERE id = $1 AND space_id = $2', [operation.entryId, spaceId]);
  }
  const body = { status: 'applied', operationId: operation.operationId, entryId: operation.entryId, deleted: true, version: nextVersion };
  await storeReceipt(client, { spaceId, userId, operation, request: normalizedRequest, body });
  return { status: 200, body };
}

export function createSyncRouter({ pool, secureCookies = false, csrfSecret }) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));
  router.post('/operations', requireCsrf(csrfSecret), async (request, response, next) => {
    const operation = parseOperation(request.body);
    if (!operation) return response.status(400).json({ error: 'A operação offline é inválida.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await applyOperation(client, request, operation);
      if (result.status !== 200) {
        await client.query('ROLLBACK');
        return response.status(result.status).json(result.body);
      }
      await client.query('COMMIT');
      return response.status(200).json(result.body);
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (operation.entity === 'card' && error.code === '23505') {
        return response.status(400).json({ error: 'Já existe um cartão ativo com este apelido.' });
      }
      if (operation.entity === 'purchase' && error.code === '23505') {
        return response.status(400).json({ error: 'Uma das parcelas desta compra já foi registrada.' });
      }
      return next(error);
    } finally {
      client?.release();
    }
  });
  return router;
}
