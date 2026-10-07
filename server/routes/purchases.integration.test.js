// @vitest-environment node
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { createSession } from './auth.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

describe.skipIf(!testDatabaseUrl)('card purchase routes with PostgreSQL', () => {
  let pool;
  let app;
  let csrfToken;

  beforeAll(async () => {
    const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
    if (!/_test$/.test(databaseName)) throw new Error('TEST_DATABASE_URL deve apontar para um banco descartável com sufixo _test.');
    pool = createPool(testDatabaseUrl);
    await migrate(pool);
    await pool.query('TRUNCATE users CASCADE');
    app = createApp({ pool, loginLimit: 100 });
    csrfToken = (await request(app).get('/api/auth/state').set('Host', 'conta-clara.test').expect(200)).body.csrfToken;
  });

  afterAll(async () => {
    if (pool) await pool.query('TRUNCATE users CASCADE');
    await pool?.end();
  });

  function sessionRequest(method, path, sessionToken, body) {
    let call = request(app)[method](path).set('Host', 'conta-clara.test').set('Origin', origin).set('Cookie', `cc_session=${sessionToken}; cc_csrf=${csrfToken}`);
    if (method !== 'get') call = call.set('X-CSRF-Token', csrfToken);
    if (body !== undefined) call = call.send(body);
    return call;
  }

  async function createAccount({ email, name, role = 'admin', spaceId = null }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query("INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, 'integration-test-only') RETURNING id", [email, name]);
      let activeSpaceId = spaceId;
      if (!activeSpaceId) activeSpaceId = (await client.query('INSERT INTO finance_spaces (name, created_by_user_id) VALUES ($1, $2) RETURNING id', [`Espaço ${name}`, user.rows[0].id])).rows[0].id;
      await client.query('INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, $3)', [activeSpaceId, user.rows[0].id, role]);
      const sessionToken = await createSession(client, { user_id: user.rows[0].id, space_id: activeSpaceId });
      await client.query('COMMIT');
      return { id: user.rows[0].id, spaceId: activeSpaceId, sessionToken };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  function payloadFor({ cardId, categoryId, purchaseOn = '2026-10-25', firstInvoiceOn = '2026-11-01', totalCents = 1001, amounts = [334, 334, 333], months = ['2026-11-01', '2026-12-01', '2027-01-01'], description = 'Compra de teste' }) {
    return {
      purchase: { cardId, categoryId, description, purchaseOn, firstInvoiceOn, totalCents, installmentCount: amounts.length },
      installments: amounts.map((plannedCents, index) => ({ id: randomUUID(), installmentNumber: index + 1, plannedCents, invoiceOn: months[index] })),
    };
  }

  it('creates, edits and cancels a shared installment series idempotently while preserving paid installments', async () => {
    const owner = await createAccount({ email: 'purchase-owner@example.test', name: 'Admin compras' });
    const client = await pool.connect();
    let cardId;
    let categoryId;
    try {
      cardId = (await client.query("INSERT INTO credit_cards (space_id, name, holder_user_id, closing_day, due_day, created_by_user_id, updated_by_user_id) VALUES ($1, 'Cartão fictício', $2, 25, 5, $2, $2) RETURNING id", [owner.spaceId, owner.id])).rows[0].id;
      categoryId = (await client.query("INSERT INTO categories (space_id, name, kind, expense_class) VALUES ($1, 'Casa fictícia', 'expense', 'variable') RETURNING id", [owner.spaceId])).rows[0].id;
    } finally { client.release(); }
    const member = await createAccount({ email: 'purchase-member@example.test', name: 'Membro compras', role: 'member', spaceId: owner.spaceId });
    const otherSpace = await createAccount({ email: 'purchase-other@example.test', name: 'Outro espaço' });

    const purchaseId = randomUUID();
    const operationId = randomUUID();
    const initial = payloadFor({ cardId, categoryId });
    const created = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'purchase', purchaseId, operationId, kind: 'create', baseVersion: null, payload: initial,
    }).expect(200);
    expect(created.body).toMatchObject({ status: 'applied', purchase: { id: purchaseId, total_cents: '1001', installment_count: 3, version: 1 } });
    expect(created.body.purchase.installments.map(({ planned_cents }) => planned_cents)).toEqual(['334', '334', '333']);
    expect(created.body.purchase.installments.map(({ invoice_on }) => invoice_on)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
    expect(created.body.purchase.installments.map(({ due_on }) => due_on)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05']);
    const dashboard = await sessionRequest('get', '/api/dashboard?month=2026-11', owner.sessionToken).expect(200);
    expect(dashboard.body.planned.expenseCents).toBe('334');
    expect(dashboard.body.charts.expensesByCategory).toMatchObject([{ categoryName: 'Casa fictícia', plannedCents: '334' }]);

    const repeated = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'purchase', purchaseId, operationId, kind: 'create', baseVersion: null, payload: initial,
    }).expect(200);
    expect(repeated.body.purchase.installments).toHaveLength(3);
    expect(await pool.query('SELECT count(*)::integer AS count FROM financial_entries WHERE card_purchase_id = $1', [purchaseId])).toMatchObject({ rows: [{ count: 3 }] });

    const shared = await sessionRequest('get', '/api/purchases', member.sessionToken).expect(200);
    expect(shared.body.purchases.map(({ id }) => id)).toContain(purchaseId);
    expect((await sessionRequest('get', '/api/purchases', otherSpace.sessionToken).expect(200)).body.purchases).toEqual([]);

    const novemberInvoice = (await sessionRequest('get', '/api/invoices?month=2026-11', owner.sessionToken).expect(200)).body.invoices[0];
    await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'invoice', cardId, invoiceMonth: '2026-11', operationId: randomUUID(), kind: 'pay', baseVersion: novemberInvoice.version,
      payload: { actualCents: 334, paidOn: '2026-11-05', paymentMethodId: null },
    }).expect(200);
    const updatedSeries = {
      purchase: { ...initial.purchase, description: 'Compra ajustada', firstInvoiceOn: '2026-12-01' },
      installments: created.body.purchase.installments.map((installment, index) => ({
        id: installment.id, installmentNumber: index + 1, plannedCents: [334, 334, 333][index],
        invoiceOn: ['2026-11-01', '2026-12-01', '2027-01-01'][index],
      })),
    };
    const seriesEdit = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'purchase', purchaseId, operationId: randomUUID(), kind: 'update', baseVersion: 1, payload: updatedSeries,
    }).expect(200);
    expect(seriesEdit.body.purchase).toMatchObject({ version: 2, description: 'Compra ajustada', first_invoice_on: '2026-12-01', total_cents: '1001' });
    expect(seriesEdit.body.purchase.installments[0]).toMatchObject({ actual_cents: null, invoice_on: '2026-11-01', description: 'Compra ajustada (1/3)' });
    expect((await sessionRequest('get', '/api/invoices?month=2026-11', owner.sessionToken).expect(200)).body.invoices[0]).toMatchObject({ status: 'needs_review', actual_cents: null });
    expect(seriesEdit.body.purchase.installments.slice(1).map(({ invoice_on }) => invoice_on)).toEqual(['2026-12-01', '2027-01-01']);

    const afterSeries = seriesEdit.body.purchase;
    const installmentEdit = {
      purchase: { cardId, categoryId, description: 'Compra ajustada', purchaseOn: '2026-10-25', firstInvoiceOn: '2026-12-01', totalCents: 1067, installmentCount: 3 },
      installments: afterSeries.installments.map((item, index) => ({
        id: item.id, installmentNumber: index + 1, plannedCents: [334, 400, 333][index],
        invoiceOn: ['2026-11-01', '2027-02-01', '2027-01-01'][index],
      })),
    };
    const lastBefore = afterSeries.installments[2];
    const singleEdit = await sessionRequest('post', '/api/sync/operations', member.sessionToken, {
      entity: 'purchase', purchaseId, operationId: randomUUID(), kind: 'update', baseVersion: 2, payload: installmentEdit,
    }).expect(200);
    expect(singleEdit.body.purchase).toMatchObject({ version: 3, total_cents: '1067' });
    expect(singleEdit.body.purchase.installments[1]).toMatchObject({ planned_cents: '400', invoice_on: '2027-02-01' });
    expect(singleEdit.body.purchase.installments[2].version).toBe(lastBefore.version);

    const canceled = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'purchase', purchaseId, operationId: randomUUID(), kind: 'delete', baseVersion: 3, payload: null,
    }).expect(200);
    expect(canceled.body.purchase.canceled_at).toBeTruthy();
    expect(canceled.body.purchase.installments).toHaveLength(0);
    expect(await pool.query('SELECT count(*)::integer AS count FROM financial_entries WHERE card_purchase_id = $1', [purchaseId])).toMatchObject({ rows: [{ count: 0 }] });

    const noPaidPurchaseId = randomUUID();
    const noPaidPayload = payloadFor({ cardId, categoryId, totalCents: 100, amounts: [100], months: ['2026-11-01'], description: 'Compra cancelada antes do pagamento' });
    await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'purchase', purchaseId: noPaidPurchaseId, operationId: randomUUID(), kind: 'create', baseVersion: null, payload: noPaidPayload,
    }).expect(200);
    const noPaidCanceled = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'purchase', purchaseId: noPaidPurchaseId, operationId: randomUUID(), kind: 'delete', baseVersion: 1, payload: null,
    }).expect(200);
    expect(noPaidCanceled.body.purchase).toMatchObject({ canceled_at: expect.any(String), total_cents: '100', installments: [] });

    await sessionRequest('post', `/api/cards/${cardId}/archive`, owner.sessionToken, { baseVersion: 1 }).expect(200);
    const archivedCardCreate = payloadFor({ cardId, categoryId, purchaseOn: '2026-10-26', firstInvoiceOn: '2026-12-01' });
    const rejected = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'purchase', purchaseId: randomUUID(), operationId: randomUUID(), kind: 'create', baseVersion: null, payload: archivedCardCreate,
    }).expect(400);
    expect(rejected.body.error).toMatch(/cartão ativo/i);

    const audit = await pool.query("SELECT action, count(*)::integer AS count FROM financial_entry_audit WHERE space_id = $1 GROUP BY action", [owner.spaceId]);
    expect(Object.fromEntries(audit.rows.map((row) => [row.action, row.count]))).toMatchObject({ created: 4, updated: 4, deleted: 4, confirmed: 1, unconfirmed: 1 });
  });
});
