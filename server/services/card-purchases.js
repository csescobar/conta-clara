import { randomUUID } from 'node:crypto';
import { recordEntryAudit } from './financial-entry-audit.js';
import { ensureCardInvoice, invoiceMonthForDate, invalidatePaidInvoices, lockCardInvoiceKeys, touchCardInvoice } from './card-invoices.js';
import { selectEntry } from '../routes/entries.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])-01$/;

export function isValidDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftMonth(month, offset) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function cycleDate(month, day) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function calculateFirstInvoiceMonth(purchaseOn, closingDay, dueDay) {
  if (
    !isValidDate(purchaseOn) ||
    !Number.isInteger(closingDay) ||
    closingDay < 1 ||
    closingDay > 31 ||
    !Number.isInteger(dueDay) ||
    dueDay < 1 ||
    dueDay > 31
  ) {
    throw new RangeError('Informe uma data de compra e um ciclo de cartão válidos.');
  }
  let closeMonth = purchaseOn.slice(0, 7);
  let closingOn = cycleDate(closeMonth, closingDay);
  if (closingOn < purchaseOn) {
    closeMonth = shiftMonth(closeMonth, 1);
    closingOn = cycleDate(closeMonth, closingDay);
  }
  const dueOn = cycleDate(closeMonth, dueDay);
  const dueMonth = dueOn > closingOn ? closeMonth : shiftMonth(closeMonth, 1);
  return `${dueMonth}-01`;
}

export function splitInstallmentAmounts(totalCents, count) {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || !Number.isInteger(count) || count < 1 || count > 120 || totalCents < count)
    return null;
  const each = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => each + (index < remainder ? 1 : 0));
}

export function parsePurchaseSnapshot(payload, { requireIds = true } = {}) {
  const purchase = payload?.purchase;
  const description = typeof purchase?.description === 'string' ? purchase.description.trim() : '';
  const purchaseOn = purchase?.purchaseOn;
  const firstInvoiceOn = purchase?.firstInvoiceOn;
  const totalCents = purchase?.totalCents;
  const installmentCount = purchase?.installmentCount;
  if (
    !uuidPattern.test(purchase?.cardId ?? '') ||
    !uuidPattern.test(purchase?.categoryId ?? '') ||
    !description ||
    description.length > 200 ||
    !isValidDate(purchaseOn) ||
    !monthPattern.test(firstInvoiceOn ?? '') ||
    !Number.isSafeInteger(totalCents) ||
    totalCents <= 0 ||
    !Number.isInteger(installmentCount) ||
    installmentCount < 1 ||
    installmentCount > 120 ||
    totalCents < installmentCount
  )
    return null;
  if (firstInvoiceOn.slice(0, 7) < purchaseOn.slice(0, 7)) return null;
  const installments = payload?.installments;
  if (!Array.isArray(installments) || installments.length !== installmentCount) return null;
  const seenNumbers = new Set();
  const seenIds = new Set();
  const parsedInstallments = [];
  for (const installment of installments) {
    const installmentNumber = installment?.installmentNumber;
    const id = installment?.id;
    const plannedCents = installment?.plannedCents;
    const invoiceOn = installment?.invoiceOn;
    if (
      (requireIds && !uuidPattern.test(id ?? '')) ||
      (id !== undefined && !uuidPattern.test(id)) ||
      !Number.isInteger(installmentNumber) ||
      installmentNumber < 1 ||
      installmentNumber > installmentCount ||
      !Number.isSafeInteger(plannedCents) ||
      plannedCents <= 0 ||
      !monthPattern.test(invoiceOn ?? '') ||
      seenNumbers.has(installmentNumber) ||
      (id && seenIds.has(id))
    )
      return null;
    seenNumbers.add(installmentNumber);
    if (id) seenIds.add(id);
    parsedInstallments.push({ id: id ?? randomUUID(), installmentNumber, plannedCents, invoiceOn });
  }
  parsedInstallments.sort((left, right) => left.installmentNumber - right.installmentNumber);
  if (parsedInstallments.some((item, index) => item.installmentNumber !== index + 1)) return null;
  if (parsedInstallments.reduce((sum, item) => sum + BigInt(item.plannedCents), 0n) !== BigInt(totalCents)) return null;
  return {
    purchase: {
      cardId: purchase.cardId,
      categoryId: purchase.categoryId,
      description,
      purchaseOn,
      firstInvoiceOn,
      totalCents,
      installmentCount,
    },
    installments: parsedInstallments,
  };
}

export async function selectPurchase(client, spaceId, purchaseId) {
  const purchaseResult = await client.query(
    `
    SELECT p.id, p.card_id, c.name AS card_name, p.description, p.category_id,
      cat.name AS category_name, p.purchase_on::text AS purchase_on,
      p.first_invoice_on::text AS first_invoice_on, p.total_cents::text AS total_cents,
      p.installment_count, p.canceled_at, p.created_by_user_id, p.updated_by_user_id,
      p.version, p.created_at, p.updated_at
    FROM card_purchases p
    JOIN credit_cards c ON c.space_id = p.space_id AND c.id = p.card_id
    JOIN categories cat ON cat.space_id = p.space_id AND cat.id = p.category_id
    WHERE p.id = $1 AND p.space_id = $2
  `,
    [purchaseId, spaceId],
  );
  if (!purchaseResult.rows[0]) return null;
  const installmentResult = await client.query(
    `
    SELECT e.id, e.description, e.category_id, cat.name AS category_name,
      e.competence_on::text AS invoice_on, e.due_on::text AS due_on,
      e.planned_cents::text AS planned_cents, e.actual_cents::text AS actual_cents,
      e.realized_on::text AS realized_on, e.created_by_user_id, e.updated_by_user_id,
      e.version, e.installment_number, e.installment_count,
      CASE WHEN e.actual_cents IS NOT NULL THEN 'paid'
        WHEN e.due_on < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'late'
        ELSE 'pending' END AS status
    FROM financial_entries e
    LEFT JOIN categories cat ON cat.space_id = e.space_id AND cat.id = e.category_id
    WHERE e.space_id = $1 AND e.card_purchase_id = $2
    ORDER BY e.installment_number, e.id
  `,
    [spaceId, purchaseId],
  );
  return { ...purchaseResult.rows[0], installments: installmentResult.rows };
}

async function validateReferences(client, spaceId, purchase, { currentCardId = null, currentCategoryId = null } = {}) {
  const cardResult = await client.query(
    `
    SELECT closing_day, due_day, archived_at FROM credit_cards
    WHERE id = $1 AND space_id = $2 AND (archived_at IS NULL OR id = $3)
    FOR SHARE
  `,
    [purchase.cardId, spaceId, currentCardId],
  );
  if (!cardResult.rows[0]) return { error: 'Selecione um cartão ativo deste espaço.' };
  const categoryResult = await client.query(
    `
    SELECT kind FROM categories WHERE id = $1 AND space_id = $2 AND (archived_at IS NULL OR id = $3) FOR SHARE
  `,
    [purchase.categoryId, spaceId, currentCategoryId],
  );
  if (!categoryResult.rows[0] || categoryResult.rows[0].kind !== 'expense')
    return { error: 'Selecione uma categoria de despesa ativa deste espaço.' };
  return { card: cardResult.rows[0] };
}

function dueDate(invoiceOn, dueDay) {
  return cycleDate(invoiceOn.slice(0, 7), dueDay);
}

function dateOnly(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function entryDescription(description, number, count) {
  return `${description} (${number}/${count})`;
}

async function insertInstallment(client, { spaceId, userId, actorName, purchaseId, purchase, installment, dueDay }) {
  const dueOn = dueDate(installment.invoiceOn, dueDay);
  const inserted = await client.query(
    `
    INSERT INTO financial_entries (
      id, space_id, created_by_user_id, updated_by_user_id, kind, description,
      category_id, competence_on, due_on, planned_cents, card_purchase_id,
      installment_number, installment_count
    ) VALUES ($1, $2, $3, $3, 'expense', $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id
  `,
    [
      installment.id,
      spaceId,
      userId,
      entryDescription(purchase.description, installment.installmentNumber, purchase.installmentCount),
      purchase.categoryId,
      installment.invoiceOn,
      dueOn,
      installment.plannedCents,
      purchaseId,
      installment.installmentNumber,
      purchase.installmentCount,
    ],
  );
  await ensureCardInvoice(client, { spaceId, cardId: purchase.cardId, invoiceMonth: invoiceMonthForDate(dueOn), dueOn, userId });
  const entry = await selectEntry(client, spaceId, inserted.rows[0].id);
  await recordEntryAudit(client, { spaceId, actorUserId: userId, actorName, entry, action: 'created', after: entry });
}

export async function createPurchase(client, { spaceId, userId, actorName, purchaseId, snapshot }) {
  const reference = await validateReferences(client, spaceId, snapshot.purchase);
  if (reference.error) return { status: 400, body: { error: reference.error } };
  calculateFirstInvoiceMonth(snapshot.purchase.purchaseOn, Number(reference.card.closing_day), Number(reference.card.due_day));
  if (
    snapshot.installments.some(
      (installment, index) => installment.invoiceOn !== `${shiftMonth(snapshot.purchase.firstInvoiceOn.slice(0, 7), index)}-01`,
    )
  ) {
    return { status: 400, body: { error: 'As parcelas precisam avançar uma fatura por mês a partir da fatura inicial.' } };
  }
  const invoiceDates = new Map();
  for (const installment of snapshot.installments) {
    const dueOn = dueDate(installment.invoiceOn, Number(reference.card.due_day));
    const month = invoiceMonthForDate(dueOn);
    const key = `${snapshot.purchase.cardId}:${month}`;
    invoiceDates.set(key, { cardId: snapshot.purchase.cardId, invoiceMonth: month, dueOn });
  }
  await lockCardInvoiceKeys(client, spaceId, [...invoiceDates.values()]);
  await invalidatePaidInvoices(client, { spaceId, userId, actorName, keys: [...invoiceDates.values()] });
  for (const item of invoiceDates.values()) {
    await touchCardInvoice(client, { spaceId, ...item, userId });
  }
  const inserted = await client.query(
    `
    INSERT INTO card_purchases (
      id, space_id, card_id, description, category_id, purchase_on,
      first_invoice_on, total_cents, installment_count, created_by_user_id, updated_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
    ON CONFLICT (id) DO NOTHING RETURNING id
  `,
    [
      purchaseId,
      spaceId,
      snapshot.purchase.cardId,
      snapshot.purchase.description,
      snapshot.purchase.categoryId,
      snapshot.purchase.purchaseOn,
      snapshot.purchase.firstInvoiceOn,
      snapshot.purchase.totalCents,
      snapshot.purchase.installmentCount,
      userId,
    ],
  );
  if (!inserted.rowCount) {
    const existing = await selectPurchase(client, spaceId, purchaseId);
    return { status: 409, body: { status: 'conflict', reason: 'id_collision', serverPurchase: existing } };
  }
  for (const installment of snapshot.installments) {
    await insertInstallment(client, {
      spaceId,
      userId,
      actorName,
      purchaseId,
      purchase: snapshot.purchase,
      installment,
      dueDay: Number(reference.card.due_day),
    });
  }
  return { status: 200, body: { status: 'applied', purchase: await selectPurchase(client, spaceId, purchaseId) } };
}

export async function updatePurchase(client, { spaceId, userId, actorName, purchaseId, baseVersion, snapshot }) {
  const currentResult = await client.query(
    'SELECT card_id, category_id, version, canceled_at FROM card_purchases WHERE id = $1 AND space_id = $2 FOR UPDATE',
    [purchaseId, spaceId],
  );
  const current = currentResult.rows[0];
  if (!current) return { status: 409, body: { status: 'conflict', reason: 'server_deleted', serverPurchase: null } };
  const serverPurchase = await selectPurchase(client, spaceId, purchaseId);
  if (Number(current.version) !== baseVersion)
    return { status: 409, body: { status: 'conflict', reason: 'version_mismatch', serverPurchase } };
  if (current.canceled_at) return { status: 409, body: { status: 'conflict', reason: 'server_deleted', serverPurchase } };

  const reference = await validateReferences(client, spaceId, snapshot.purchase, {
    currentCardId: current.card_id,
    currentCategoryId: current.category_id,
  });
  if (reference.error) return { status: 400, body: { error: reference.error } };
  const invoiceLocks = [
    ...serverPurchase.installments.map((installment) => ({
      cardId: current.card_id,
      invoiceMonth: invoiceMonthForDate(installment.due_on),
    })),
    ...snapshot.installments.map((installment) => ({
      cardId: snapshot.purchase.cardId,
      invoiceMonth: invoiceMonthForDate(dueDate(installment.invoiceOn, Number(reference.card.due_day))),
    })),
  ];
  await lockCardInvoiceKeys(client, spaceId, invoiceLocks);

  const installmentResult = await client.query(
    `
    SELECT * FROM financial_entries WHERE space_id = $1 AND card_purchase_id = $2 FOR UPDATE
  `,
    [spaceId, purchaseId],
  );
  const original = installmentResult.rows;
  const originalPaid = original.filter((entry) => entry.actual_cents !== null);
  const paidByNumber = new Map(originalPaid.map((entry) => [Number(entry.installment_number), entry]));
  const paidPlanned = originalPaid.reduce((sum, entry) => sum + BigInt(entry.planned_cents), 0n);
  if (snapshot.purchase.installmentCount < Math.max(0, ...paidByNumber.keys())) {
    return { status: 400, body: { error: 'A quantidade de parcelas não pode remover uma parcela já paga.' } };
  }
  if (BigInt(snapshot.purchase.totalCents) < paidPlanned) {
    return { status: 400, body: { error: 'O total não pode ser menor que as parcelas já pagas.' } };
  }
  const desiredByNumber = new Map(snapshot.installments.map((item) => [item.installmentNumber, item]));
  const desiredSum = snapshot.installments.reduce((sum, item) => sum + BigInt(item.plannedCents), 0n);
  if (desiredSum !== BigInt(snapshot.purchase.totalCents))
    return { status: 400, body: { error: 'A soma das parcelas deve ser igual ao total da compra.' } };

  const changedInvoices = new Map();
  const markInvoice = (cardId, dueOn) => {
    const invoiceMonth = invoiceMonthForDate(dueOn);
    changedInvoices.set(`${cardId}:${invoiceMonth}`, { cardId, invoiceMonth, dueOn });
  };
  for (const entry of original) {
    const number = Number(entry.installment_number);
    const desired = desiredByNumber.get(number);
    const desiredDueOn = desired ? dueDate(desired.invoiceOn, Number(reference.card.due_day)) : null;
    const changed =
      current.card_id !== snapshot.purchase.cardId ||
      !desired ||
      entry.description !== entryDescription(snapshot.purchase.description, number, snapshot.purchase.installmentCount) ||
      entry.category_id !== snapshot.purchase.categoryId ||
      dateOnly(entry.competence_on) !== desired.invoiceOn ||
      dateOnly(entry.due_on) !== desiredDueOn ||
      BigInt(entry.planned_cents) !== BigInt(desired.plannedCents) ||
      Number(entry.installment_count) !== snapshot.purchase.installmentCount;
    if (changed) {
      markInvoice(current.card_id, dateOnly(entry.due_on));
      if (desiredDueOn) markInvoice(snapshot.purchase.cardId, desiredDueOn);
    }
    desiredByNumber.delete(number);
  }
  for (const desired of desiredByNumber.values()) {
    markInvoice(snapshot.purchase.cardId, dueDate(desired.invoiceOn, Number(reference.card.due_day)));
  }
  await invalidatePaidInvoices(client, { spaceId, userId, actorName, keys: [...changedInvoices.values()] });
  const refreshedExisting = await client.query(
    `
    SELECT * FROM financial_entries WHERE space_id = $1 AND card_purchase_id = $2 FOR UPDATE
  `,
    [spaceId, purchaseId],
  );
  const existing = refreshedExisting.rows;
  const currentDesiredByNumber = new Map(snapshot.installments.map((item) => [item.installmentNumber, item]));

  for (const entry of existing) {
    const number = Number(entry.installment_number);
    const desired = currentDesiredByNumber.get(number);
    if (entry.actual_cents !== null) {
      currentDesiredByNumber.delete(number);
      continue;
    }
    if (!desired) {
      const before = await selectEntry(client, spaceId, entry.id);
      await recordEntryAudit(client, { spaceId, actorUserId: userId, actorName, entry: before, action: 'deleted', before });
      await client.query('DELETE FROM financial_entries WHERE id = $1 AND space_id = $2', [entry.id, spaceId]);
      continue;
    }
    currentDesiredByNumber.delete(number);
    const desiredDueOn = dueDate(desired.invoiceOn, Number(reference.card.due_day));
    const unchanged =
      entry.description === entryDescription(snapshot.purchase.description, number, snapshot.purchase.installmentCount) &&
      entry.category_id === snapshot.purchase.categoryId &&
      dateOnly(entry.competence_on) === desired.invoiceOn &&
      dateOnly(entry.due_on) === desiredDueOn &&
      BigInt(entry.planned_cents) === BigInt(desired.plannedCents) &&
      Number(entry.installment_count) === snapshot.purchase.installmentCount;
    if (unchanged) continue;
    const before = await selectEntry(client, spaceId, entry.id);
    const updated = await client.query(
      `
      UPDATE financial_entries SET description = $1, category_id = $2,
        competence_on = $3, due_on = $4, planned_cents = $5,
        installment_count = $6, updated_by_user_id = $7, updated_at = now(), version = version + 1
      WHERE id = $8 AND space_id = $9 RETURNING id
    `,
      [
        entryDescription(snapshot.purchase.description, number, snapshot.purchase.installmentCount),
        snapshot.purchase.categoryId,
        desired.invoiceOn,
        desiredDueOn,
        desired.plannedCents,
        snapshot.purchase.installmentCount,
        userId,
        entry.id,
        spaceId,
      ],
    );
    const after = await selectEntry(client, spaceId, updated.rows[0].id);
    await recordEntryAudit(client, { spaceId, actorUserId: userId, actorName, entry: after, action: 'updated', before, after });
  }

  for (const [number, desired] of currentDesiredByNumber) {
    if (paidByNumber.has(number)) continue;
    if (desired.id === purchaseId || existing.some((entry) => entry.id === desired.id)) {
      return { status: 400, body: { error: 'Um identificador de parcela já está em uso.' } };
    }
    await insertInstallment(client, {
      spaceId,
      userId,
      actorName,
      purchaseId,
      purchase: snapshot.purchase,
      installment: desired,
      dueDay: Number(reference.card.due_day),
    });
  }

  const refreshedInstallments = await client.query(
    'SELECT installment_number, planned_cents FROM financial_entries WHERE space_id = $1 AND card_purchase_id = $2',
    [spaceId, purchaseId],
  );
  const newTotal = refreshedInstallments.rows.reduce((sum, row) => sum + BigInt(row.planned_cents), 0n);
  await client.query(
    `
    UPDATE card_purchases SET card_id = $1, description = $2, category_id = $3,
      purchase_on = $4, first_invoice_on = $5, total_cents = $6,
      installment_count = $7, updated_by_user_id = $8,
      updated_at = now(), version = version + 1
    WHERE id = $9 AND space_id = $10
  `,
    [
      snapshot.purchase.cardId,
      snapshot.purchase.description,
      snapshot.purchase.categoryId,
      snapshot.purchase.purchaseOn,
      snapshot.purchase.firstInvoiceOn,
      newTotal.toString(),
      snapshot.purchase.installmentCount,
      userId,
      purchaseId,
      spaceId,
    ],
  );
  for (const item of changedInvoices.values()) {
    const dueOn = await client.query(
      `
      SELECT min(e.due_on)::text AS due_on
      FROM financial_entries e JOIN card_purchases p ON p.space_id = e.space_id AND p.id = e.card_purchase_id
      WHERE e.space_id = $1 AND p.card_id = $2 AND date_trunc('month', e.due_on)::date = $3::date
    `,
      [spaceId, item.cardId, `${item.invoiceMonth}-01`],
    );
    await touchCardInvoice(client, { spaceId, ...item, dueOn: dueOn.rows[0]?.due_on ?? item.dueOn, userId });
  }
  return { status: 200, body: { status: 'applied', purchase: await selectPurchase(client, spaceId, purchaseId) } };
}

export async function cancelPurchase(client, { spaceId, userId, actorName, purchaseId, baseVersion }) {
  const currentResult = await client.query(
    'SELECT card_id, version, canceled_at FROM card_purchases WHERE id = $1 AND space_id = $2 FOR UPDATE',
    [purchaseId, spaceId],
  );
  const current = currentResult.rows[0];
  if (!current) return { status: 409, body: { status: 'conflict', reason: 'server_deleted', serverPurchase: null } };
  const serverPurchase = await selectPurchase(client, spaceId, purchaseId);
  if (Number(current.version) !== baseVersion)
    return { status: 409, body: { status: 'conflict', reason: 'version_mismatch', serverPurchase } };
  if (current.canceled_at) return { status: 200, body: { status: 'applied', purchase: serverPurchase } };
  await lockCardInvoiceKeys(
    client,
    spaceId,
    serverPurchase.installments.map((installment) => ({
      cardId: current.card_id,
      invoiceMonth: invoiceMonthForDate(installment.due_on),
    })),
  );
  const unpaid = await client.query(
    'SELECT id, due_on::text AS due_on FROM financial_entries WHERE space_id = $1 AND card_purchase_id = $2 AND actual_cents IS NULL FOR UPDATE',
    [spaceId, purchaseId],
  );
  const changedInvoices = new Map();
  for (const { id } of unpaid.rows) {
    const entry = await selectEntry(client, spaceId, id);
    if (entry) await recordEntryAudit(client, { spaceId, actorUserId: userId, actorName, entry, action: 'deleted', before: entry });
    await client.query('DELETE FROM financial_entries WHERE id = $1 AND space_id = $2', [id, spaceId]);
  }
  for (const entry of unpaid.rows) {
    const invoiceMonth = invoiceMonthForDate(entry.due_on);
    changedInvoices.set(`${current.card_id}:${invoiceMonth}`, { cardId: current.card_id, invoiceMonth, dueOn: entry.due_on });
  }
  await client.query(
    `UPDATE card_purchases SET canceled_at = now(), updated_by_user_id = $3, updated_at = now(), version = version + 1 WHERE id = $2 AND space_id = $1`,
    [spaceId, purchaseId, userId],
  );
  for (const item of changedInvoices.values()) await touchCardInvoice(client, { spaceId, ...item, userId });
  return { status: 200, body: { status: 'applied', purchase: await selectPurchase(client, spaceId, purchaseId) } };
}

export function createPurchasePayload({
  cardId,
  categoryId,
  description,
  purchaseOn,
  firstInvoiceOn,
  totalCents,
  installmentCount,
  closingDay,
  dueDay,
}) {
  const amounts = splitInstallmentAmounts(totalCents, installmentCount);
  if (!amounts) return null;
  const firstMonth = firstInvoiceOn ?? calculateFirstInvoiceMonth(purchaseOn, closingDay, dueDay);
  const installments = amounts.map((plannedCents, index) => ({
    id: randomUUID(),
    installmentNumber: index + 1,
    plannedCents,
    invoiceOn: `${shiftMonth(firstMonth.slice(0, 7), index)}-01`,
  }));
  return {
    purchase: { cardId, categoryId, description, purchaseOn, firstInvoiceOn: firstMonth, totalCents, installmentCount },
    installments,
  };
}
