import { recordEntryAudit } from './financial-entry-audit.js';
import { selectEntry } from '../routes/entries.js';

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function invoiceMonthForDate(value) {
  return String(value).slice(0, 7);
}

export function isInvoiceMonth(value) {
  return typeof value === 'string' && monthPattern.test(value);
}

export function invoiceKey(cardId, invoiceMonth) {
  return `${cardId}:${invoiceMonth}`;
}

export async function lockCardInvoiceKeys(client, spaceId, keys) {
  const unique = new Map(keys.map((item) => [invoiceKey(item.cardId, item.invoiceMonth), item]));
  for (const item of [...unique.values()].sort((left, right) =>
    invoiceKey(left.cardId, left.invoiceMonth).localeCompare(invoiceKey(right.cardId, right.invoiceMonth)),
  )) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
      spaceId,
      `invoice:${item.cardId}:${item.invoiceMonth}`,
    ]);
  }
}

export async function ensureCardInvoice(client, { spaceId, cardId, invoiceMonth, dueOn, userId }) {
  await client.query(
    `
    INSERT INTO card_invoices (space_id, card_id, invoice_month, due_on, created_by_user_id, updated_by_user_id)
    VALUES ($1, $2, $3::date, $4::date, $5, $5)
    ON CONFLICT (space_id, card_id, invoice_month) DO UPDATE
      SET due_on = LEAST(card_invoices.due_on, EXCLUDED.due_on)
  `,
    [spaceId, cardId, `${invoiceMonth}-01`, dueOn, userId],
  );
}

export async function touchCardInvoice(client, { spaceId, cardId, invoiceMonth, dueOn, userId }) {
  await client.query(
    `
    INSERT INTO card_invoices (space_id, card_id, invoice_month, due_on, created_by_user_id, updated_by_user_id)
    VALUES ($1, $2, $3::date, $4::date, $5, $5)
    ON CONFLICT (space_id, card_id, invoice_month) DO UPDATE
      SET due_on = EXCLUDED.due_on,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now(), version = card_invoices.version + 1
  `,
    [spaceId, cardId, `${invoiceMonth}-01`, dueOn, userId],
  );
}

export async function invalidatePaidInvoices(client, { spaceId, userId, actorName, keys }) {
  if (!keys.length) return [];
  const cardIds = keys.map((item) => item.cardId);
  const invoiceMonths = keys.map((item) => `${item.invoiceMonth}-01`);
  const result = await client.query(
    `
    SELECT id, card_id, invoice_month::text AS invoice_month
    FROM card_invoices
    WHERE space_id = $1 AND status IN ('paid', 'needs_review')
      AND (card_id, invoice_month) IN (
        SELECT card_id, invoice_month FROM unnest($2::uuid[], $3::date[]) AS requested(card_id, invoice_month)
      )
    ORDER BY card_id, invoice_month
    FOR UPDATE
  `,
    [spaceId, cardIds, invoiceMonths],
  );
  const invalidated = [];
  for (const invoice of result.rows) {
    const installments = await client.query(
      `
      SELECT e.id FROM financial_entries e
      JOIN card_purchases p ON p.space_id = e.space_id AND p.id = e.card_purchase_id
      WHERE e.space_id = $1 AND p.card_id = $2
        AND date_trunc('month', e.due_on)::date = $3::date
      ORDER BY e.id FOR UPDATE OF e
    `,
      [spaceId, invoice.card_id, invoice.invoice_month],
    );
    for (const { id } of installments.rows) {
      const before = await selectEntry(client, spaceId, id);
      if (!before || before.actual_cents === null) continue;
      await client.query(
        `
        UPDATE financial_entries SET actual_cents = NULL, realized_on = NULL,
          updated_by_user_id = $1, updated_at = now(), version = version + 1
        WHERE id = $2 AND space_id = $3
      `,
        [userId, id, spaceId],
      );
      const after = await selectEntry(client, spaceId, id);
      await recordEntryAudit(client, { spaceId, actorUserId: userId, actorName, entry: after, action: 'unconfirmed', before, after });
    }
    await client.query(
      `
      UPDATE card_invoices SET status = 'needs_review', actual_cents = NULL, paid_on = NULL,
        payment_method_id = NULL, updated_by_user_id = $1, updated_at = now(), version = version + 1
      WHERE id = $2 AND space_id = $3
    `,
      [userId, invoice.id, spaceId],
    );
    invalidated.push(invoiceKey(invoice.card_id, String(invoice.invoice_month).slice(0, 7)));
  }
  return invalidated;
}

async function invoiceHeaders(client, spaceId, month = null) {
  const result = await client.query(
    `
    SELECT i.id, i.card_id, c.name AS card_name, c.closing_day, c.due_day,
      i.invoice_month::text AS invoice_month, i.due_on::text AS due_on,
      i.status AS payment_status, i.actual_cents::text AS actual_cents,
      i.paid_on::text AS paid_on, i.payment_method_id, pm.name AS payment_method_name,
      i.updated_by_user_id, i.version,
      COALESCE(SUM(e.planned_cents), 0)::text AS planned_cents,
      count(e.id)::integer AS installment_count
    FROM card_invoices i
    JOIN credit_cards c ON c.space_id = i.space_id AND c.id = i.card_id
    LEFT JOIN payment_methods pm ON pm.space_id = i.space_id AND pm.id = i.payment_method_id
    LEFT JOIN card_purchases p ON p.space_id = i.space_id AND p.card_id = i.card_id
    LEFT JOIN financial_entries e ON e.space_id = i.space_id AND e.card_purchase_id = p.id
      AND date_trunc('month', e.due_on)::date = i.invoice_month
    WHERE i.space_id = $1 AND ($2::date IS NULL OR i.invoice_month = $2::date)
    GROUP BY i.id, c.id, pm.name
    HAVING count(e.id) > 0 OR i.status IN ('paid', 'needs_review')
    ORDER BY i.invoice_month DESC, lower(c.name), i.due_on, i.id
  `,
    [spaceId, month ? `${month}-01` : null],
  );
  return result.rows;
}

async function invoiceEntries(client, spaceId, invoices) {
  if (!invoices.length) return new Map();
  const result = await client.query(
    `
    SELECT i.id AS invoice_id, e.id, e.description, p.description AS purchase_description,
      cat.name AS category_name, e.competence_on::text AS invoice_on, e.due_on::text AS due_on,
      e.planned_cents::text AS planned_cents, e.actual_cents::text AS actual_cents,
      e.realized_on::text AS realized_on, e.version, e.installment_number, e.installment_count
    FROM card_invoices i
    JOIN card_purchases p ON p.space_id = i.space_id AND p.card_id = i.card_id
    JOIN financial_entries e ON e.space_id = p.space_id AND e.card_purchase_id = p.id
      AND date_trunc('month', e.due_on)::date = i.invoice_month
    LEFT JOIN categories cat ON cat.space_id = e.space_id AND cat.id = e.category_id
    WHERE i.space_id = $1 AND i.id = ANY($2::uuid[])
    ORDER BY i.invoice_month, lower(p.description), e.installment_number, e.id
  `,
    [spaceId, invoices.map((item) => item.id)],
  );
  const grouped = new Map();
  for (const row of result.rows) {
    const rows = grouped.get(row.invoice_id) ?? [];
    rows.push(row);
    grouped.set(row.invoice_id, rows);
  }
  return grouped;
}

export async function listCardInvoices(client, { spaceId, month = null }) {
  const headers = await invoiceHeaders(client, spaceId, month);
  const entries = await invoiceEntries(client, spaceId, headers);
  return headers.map((header) => {
    const detail = entries.get(header.id) ?? [];
    const status =
      header.payment_status === 'paid'
        ? 'paid'
        : header.payment_status === 'needs_review'
          ? 'needs_review'
          : header.due_on < new Date().toISOString().slice(0, 10)
            ? 'late'
            : 'open';
    return {
      ...header,
      status,
      entries: detail,
    };
  });
}

export async function selectCardInvoice(client, spaceId, cardId, month) {
  return (await listCardInvoices(client, { spaceId, month })).find((invoice) => invoice.card_id === cardId) ?? null;
}

function allocateActualCents(entries, actualCents, plannedTotal) {
  const total = BigInt(actualCents);
  const shares = entries.map((entry) => {
    const numerator = total * BigInt(entry.planned_cents);
    return { id: entry.id, cents: numerator / plannedTotal, remainder: numerator % plannedTotal };
  });
  let remainder = total - shares.reduce((sum, item) => sum + item.cents, 0n);
  const priority = [...shares].sort((left, right) =>
    left.remainder === right.remainder ? left.id.localeCompare(right.id) : left.remainder > right.remainder ? -1 : 1,
  );
  for (let index = 0; remainder > 0n; index += 1, remainder -= 1n) priority[index % priority.length].cents += 1n;
  return new Map(shares.map((item) => [item.id, item.cents.toString()]));
}

export async function updateInvoicePayment(client, { spaceId, userId, actorName, cardId, month, action, baseVersion, payload }) {
  const invoiceResult = await client.query(
    `
    SELECT * FROM card_invoices WHERE space_id = $1 AND card_id = $2 AND invoice_month = $3::date FOR UPDATE
  `,
    [spaceId, cardId, `${month}-01`],
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return { status: 409, body: { status: 'conflict', reason: 'server_deleted', serverInvoice: null } };
  const current = await selectCardInvoice(client, spaceId, cardId, month);
  if (Number(invoice.version) !== baseVersion) {
    return { status: 409, body: { status: 'conflict', reason: 'version_mismatch', serverInvoice: current } };
  }
  if (!current || !current.entries.length)
    return { status: 409, body: { status: 'conflict', reason: 'server_deleted', serverInvoice: current } };
  const entries = await client.query(
    `
    SELECT e.id, e.planned_cents::text AS planned_cents
    FROM financial_entries e JOIN card_purchases p ON p.space_id = e.space_id AND p.id = e.card_purchase_id
    WHERE e.space_id = $1 AND p.card_id = $2 AND date_trunc('month', e.due_on)::date = $3::date
    ORDER BY e.id FOR UPDATE OF e
  `,
    [spaceId, cardId, `${month}-01`],
  );
  if (action === 'pay') {
    if (invoice.status === 'paid' && !payload.replacePaid) {
      return {
        status: 409,
        body: {
          status: 'conflict',
          reason: 'state_mismatch',
          serverInvoice: current,
          error: 'Esta fatura já foi quitada em outro aparelho. Revise os dados antes de substituí-los.',
        },
      };
    }
    if (payload.paymentMethodId) {
      const method = await client.query(`SELECT id FROM payment_methods WHERE id = $1 AND space_id = $2 AND archived_at IS NULL`, [
        payload.paymentMethodId,
        spaceId,
      ]);
      if (!method.rowCount) return { status: 400, body: { error: 'Selecione uma forma de pagamento ativa deste espaço.' } };
    }
    const plannedTotal = entries.rows.reduce((sum, entry) => sum + BigInt(entry.planned_cents), 0n);
    if (plannedTotal <= 0n) return { status: 409, body: { status: 'conflict', reason: 'server_deleted', serverInvoice: current } };
    const allocations = allocateActualCents(entries.rows, payload.actualCents, plannedTotal);
    for (const entry of entries.rows) {
      const before = await selectEntry(client, spaceId, entry.id);
      const actualCents = allocations.get(entry.id);
      await client.query(
        `
        UPDATE financial_entries SET actual_cents = $1, realized_on = $2,
          updated_by_user_id = $3, updated_at = now(), version = version + 1
        WHERE id = $4 AND space_id = $5
      `,
        [actualCents, payload.paidOn, userId, entry.id, spaceId],
      );
      const after = await selectEntry(client, spaceId, entry.id);
      await recordEntryAudit(client, { spaceId, actorUserId: userId, actorName, entry: after, action: 'confirmed', before, after });
    }
    await client.query(
      `
      UPDATE card_invoices SET status = 'paid', actual_cents = $1, paid_on = $2,
        payment_method_id = $3, updated_by_user_id = $4, updated_at = now(), version = version + 1
      WHERE id = $5 AND space_id = $6
    `,
      [payload.actualCents, payload.paidOn, payload.paymentMethodId, userId, invoice.id, spaceId],
    );
  } else {
    if (invoice.status !== 'paid')
      return {
        status: 409,
        body: { status: 'conflict', reason: 'state_mismatch', serverInvoice: current, error: 'Esta fatura não está quitada no servidor.' },
      };
    for (const entry of entries.rows) {
      const before = await selectEntry(client, spaceId, entry.id);
      if (!before || before.actual_cents === null) continue;
      await client.query(
        `
        UPDATE financial_entries SET actual_cents = NULL, realized_on = NULL,
          updated_by_user_id = $1, updated_at = now(), version = version + 1
        WHERE id = $2 AND space_id = $3
      `,
        [userId, entry.id, spaceId],
      );
      const after = await selectEntry(client, spaceId, entry.id);
      await recordEntryAudit(client, { spaceId, actorUserId: userId, actorName, entry: after, action: 'unconfirmed', before, after });
    }
    await client.query(
      `
      UPDATE card_invoices SET status = 'open', actual_cents = NULL, paid_on = NULL,
        payment_method_id = NULL, updated_by_user_id = $1, updated_at = now(), version = version + 1
      WHERE id = $2 AND space_id = $3
    `,
      [userId, invoice.id, spaceId],
    );
  }
  return { status: 200, body: { status: 'applied', invoice: await selectCardInvoice(client, spaceId, cardId, month) } };
}
