// @vitest-environment node
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { createSession } from './auth.js';
import { lockCardInvoiceKeys, updateInvoicePayment } from '../services/card-invoices.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

describe.skipIf(!testDatabaseUrl)('card invoice routes with PostgreSQL', () => {
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
      const user = await client.query('INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, \'integration-test-only\') RETURNING id', [email, name]);
      let activeSpaceId = spaceId;
      if (!activeSpaceId) activeSpaceId = (await client.query('INSERT INTO finance_spaces (name, created_by_user_id) VALUES ($1, $2) RETURNING id', [`Espaço ${name}`, user.rows[0].id])).rows[0].id;
      await client.query('INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, $3)', [activeSpaceId, user.rows[0].id, role]);
      const sessionToken = await createSession(client, { user_id: user.rows[0].id, space_id: activeSpaceId });
      await client.query('COMMIT');
      return { id: user.rows[0].id, name, spaceId: activeSpaceId, sessionToken };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  function purchasePayload({ cardId, categoryId, amounts = [334, 334, 333], description = 'Compra parcelada fictícia' }) {
    const months = ['2026-11-01', '2026-12-01', '2027-01-01'];
    return {
      purchase: { cardId, categoryId, description, purchaseOn: '2026-10-25', firstInvoiceOn: '2026-11-01', totalCents: amounts.reduce((sum, value) => sum + value, 0), installmentCount: amounts.length },
      installments: amounts.map((plannedCents, index) => ({ id: randomUUID(), installmentNumber: index + 1, plannedCents, invoiceOn: months[index] })),
    };
  }

  it('groups installments, pays and reverses an invoice idempotently, updates dashboard and CSV, and detects stale changes', async () => {
    const owner = await createAccount({ email: 'invoice-owner@example.test', name: 'Admin faturas' });
    const member = await createAccount({ email: 'invoice-member@example.test', name: 'Membro faturas', role: 'member', spaceId: owner.spaceId });
    const otherSpace = await createAccount({ email: 'invoice-other@example.test', name: 'Outro espaço faturas' });
    const card = await pool.query(`
      INSERT INTO credit_cards (space_id, name, holder_user_id, closing_day, due_day, created_by_user_id, updated_by_user_id)
      VALUES ($1, 'Cartão de teste', $2, 25, 5, $2, $2) RETURNING id
    `, [owner.spaceId, owner.id]);
    const category = await pool.query(`
      INSERT INTO categories (space_id, name, kind, expense_class)
      VALUES ($1, 'Categoria de teste', 'expense', 'variable') RETURNING id
    `, [owner.spaceId]);
    const method = await pool.query(`
      INSERT INTO payment_methods (space_id, name)
      VALUES ($1, 'Pix de teste') RETURNING id
    `, [owner.spaceId]);

    const purchaseId = randomUUID();
    const operationId = randomUUID();
    const payload = purchasePayload({ cardId: card.rows[0].id, categoryId: category.rows[0].id });
    const created = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'purchase', purchaseId, operationId, kind: 'create', baseVersion: null, payload,
    }).expect(200);
    expect(created.body.purchase.installments).toHaveLength(3);

    const listed = await sessionRequest('get', '/api/invoices?month=2026-11', member.sessionToken).expect(200);
    expect(listed.body.invoices).toHaveLength(1);
    const firstInvoice = listed.body.invoices[0];
    expect(firstInvoice).toMatchObject({ card_name: 'Cartão de teste', invoice_month: '2026-11-01', due_on: '2026-11-05', planned_cents: '334', status: 'open', installment_count: 1, version: 1 });
    expect(firstInvoice.entries[0]).toMatchObject({ installment_number: 1, installment_count: 3, purchase_description: 'Compra parcelada fictícia' });
    expect((await sessionRequest('get', '/api/invoices?month=2026-11', otherSpace.sessionToken).expect(200)).body.invoices).toEqual([]);
    await sessionRequest('get', '/api/invoices?month=2026-13', owner.sessionToken).expect(400);

    const payment = { actualCents: 301, paidOn: '2026-11-09', paymentMethodId: method.rows[0].id };
    const paidOperation = { entity: 'invoice', cardId: card.rows[0].id, invoiceMonth: '2026-11', operationId: randomUUID(), kind: 'pay', baseVersion: firstInvoice.version, payload: payment };
    const paid = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, paidOperation).expect(200);
    expect(paid.body.invoice).toMatchObject({ status: 'paid', payment_status: 'paid', actual_cents: '301', paid_on: '2026-11-09', payment_method_id: method.rows[0].id, version: 2 });
    expect(paid.body.invoice.entries.reduce((sum, entry) => sum + BigInt(entry.actual_cents), 0n)).toBe(301n);
    const repeated = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, paidOperation).expect(200);
    expect(repeated.body.invoice.version).toBe(2);
    expect(await pool.query('SELECT count(*)::integer AS count FROM financial_entries WHERE card_purchase_id = $1', [purchaseId])).toMatchObject({ rows: [{ count: 3 }] });
    await sessionRequest('post', `/api/entries/${firstInvoice.entries[0].id}/confirm`, owner.sessionToken, { actualCents: 334, realizedOn: '2026-11-05' }).expect(409);

    const dashboardNovember = await sessionRequest('get', '/api/dashboard?month=2026-11', owner.sessionToken).expect(200);
    expect(dashboardNovember.body.planned.expenseCents).toBe('334');
    expect(dashboardNovember.body.realized.expenseCents).toBe('301');
    const january = await sessionRequest('get', '/api/dashboard?month=2027-01', owner.sessionToken).expect(200);
    expect(january.body.planned.expenseCents).toBe('333');
    const exported = await sessionRequest('get', '/api/entries?month=2026-11', owner.sessionToken).expect(200);
    expect(exported.body.entries[0]).toMatchObject({ card_name: 'Cartão de teste', invoice_month: '2026-11-01', installment_number: 1, installment_count: 3, invoice_status: 'paid' });

    const reverses = { entity: 'invoice', cardId: card.rows[0].id, invoiceMonth: '2026-11', operationId: randomUUID(), kind: 'reverse', baseVersion: 2, payload: null };
    const reversed = await sessionRequest('post', '/api/sync/operations', member.sessionToken, reverses).expect(200);
    expect(reversed.body.invoice).toMatchObject({ status: 'open', actual_cents: null, paid_on: null, version: 3 });
    const afterReverse = await sessionRequest('get', '/api/dashboard?month=2026-11', owner.sessionToken).expect(200);
    expect(afterReverse.body.realized.expenseCents).toBe('0');

    const repaid = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'invoice', cardId: card.rows[0].id, invoiceMonth: '2026-11', operationId: randomUUID(), kind: 'pay', baseVersion: 3,
      payload: { actualCents: 301, paidOn: '2026-12-05', paymentMethodId: null },
    }).expect(200);
    expect(repaid.body.invoice.actual_cents).toBe('301');
    expect((await sessionRequest('get', '/api/dashboard?month=2026-12', owner.sessionToken).expect(200)).body.realized.expenseCents).toBe('301');

    const updatedPayload = {
      purchase: { ...payload.purchase, description: 'Compra revisada fictícia', totalCents: 1002 },
      installments: created.body.purchase.installments.map((entry, index) => ({
        id: entry.id, installmentNumber: index + 1, plannedCents: [335, 334, 333][index], invoiceOn: entry.invoice_on,
      })),
    };
    await sessionRequest('post', '/api/sync/operations', member.sessionToken, {
      entity: 'purchase', purchaseId, operationId: randomUUID(), kind: 'update', baseVersion: 1, payload: updatedPayload,
    }).expect(200);
    const changedInvoice = (await sessionRequest('get', '/api/invoices?month=2026-11', owner.sessionToken).expect(200)).body.invoices[0];
    expect(changedInvoice).toMatchObject({ status: 'needs_review', payment_status: 'needs_review', actual_cents: null, planned_cents: '335', version: 6 });
    expect(changedInvoice.entries[0].actual_cents).toBeNull();
    const stale = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'invoice', cardId: card.rows[0].id, invoiceMonth: '2026-11', operationId: randomUUID(), kind: 'pay', baseVersion: 4,
      payload: { actualCents: 335, paidOn: '2026-12-05', paymentMethodId: null },
    }).expect(409);
    expect(stale.body).toMatchObject({ status: 'conflict', reason: 'version_mismatch', serverInvoice: { status: 'needs_review', version: 6 } });
    const reviewConfirmed = await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'invoice', cardId: card.rows[0].id, invoiceMonth: '2026-11', operationId: randomUUID(), kind: 'pay', baseVersion: 6,
      payload: { actualCents: 335, paidOn: '2026-12-06', paymentMethodId: null },
    }).expect(200);
    expect(reviewConfirmed.body.invoice).toMatchObject({ status: 'paid', actual_cents: '335', paid_on: '2026-12-06', version: 7 });
  });

  it('serializes a new purchase with an invoice payment and reopens the changed invoice for review', async () => {
    const owner = await createAccount({ email: 'invoice-race-owner@example.test', name: 'Admin concorrência' });
    const cardId = (await pool.query(`
      INSERT INTO credit_cards (space_id, name, holder_user_id, closing_day, due_day, created_by_user_id, updated_by_user_id)
      VALUES ($1, 'Cartão concorrência', $2, 25, 5, $2, $2) RETURNING id
    `, [owner.spaceId, owner.id])).rows[0].id;
    const categoryId = (await pool.query(`
      INSERT INTO categories (space_id, name, kind, expense_class)
      VALUES ($1, 'Categoria concorrência', 'expense', 'variable') RETURNING id
    `, [owner.spaceId])).rows[0].id;
    const firstPurchaseId = randomUUID();
    const firstPurchase = purchasePayload({ cardId, categoryId, amounts: [100], description: 'Primeira compra fictícia' });
    await sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
      entity: 'purchase', purchaseId: firstPurchaseId, operationId: randomUUID(), kind: 'create', baseVersion: null, payload: firstPurchase,
    }).expect(200);
    const invoice = (await sessionRequest('get', '/api/invoices?month=2026-11', owner.sessionToken).expect(200)).body.invoices[0];

    const paymentClient = await pool.connect();
    let concurrentCreate;
    try {
      await paymentClient.query('BEGIN');
      await lockCardInvoiceKeys(paymentClient, owner.spaceId, [{ cardId, invoiceMonth: '2026-11' }]);
      const secondPurchase = purchasePayload({ cardId, categoryId, amounts: [100], description: 'Compra concorrente fictícia' });
      concurrentCreate = sessionRequest('post', '/api/sync/operations', owner.sessionToken, {
        entity: 'purchase', purchaseId: randomUUID(), operationId: randomUUID(), kind: 'create', baseVersion: null, payload: secondPurchase,
      }).expect(200);
      const paid = await updateInvoicePayment(paymentClient, {
        spaceId: owner.spaceId, userId: owner.id, actorName: owner.name, cardId, month: '2026-11',
        action: 'pay', baseVersion: invoice.version, payload: { actualCents: 100, paidOn: '2026-11-05', paymentMethodId: null },
      });
      expect(paid.status).toBe(200);
      await paymentClient.query('COMMIT');
    } catch (error) {
      await paymentClient.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      paymentClient.release();
    }
    await concurrentCreate;

    const changedInvoice = (await sessionRequest('get', '/api/invoices?month=2026-11', owner.sessionToken).expect(200)).body.invoices[0];
    expect(changedInvoice).toMatchObject({ status: 'needs_review', payment_status: 'needs_review', actual_cents: null, planned_cents: '200', installment_count: 2 });
    expect(changedInvoice.entries).toHaveLength(2);
    expect(changedInvoice.entries.every((entry) => entry.actual_cents === null)).toBe(true);
  });
});
