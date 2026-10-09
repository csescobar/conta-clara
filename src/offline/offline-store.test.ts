import { IDBFactory } from 'fake-indexeddb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  clearOfflineWorkspace,
  acknowledgeOfflineOperation,
  acknowledgeOfflineCardOperation,
  loadRememberedOfflineUser,
  loadOfflineSnapshot,
  loadOfflineWorkspace,
  markOfflineConflict,
  markOfflineCardConflict,
  acknowledgeOfflinePurchaseOperation,
  markOfflinePurchaseConflict,
  offlineScopeKey,
  queueOfflineEntryChange,
  queueOfflineEntryDelete,
  queueOfflineCardChange,
  queueOfflinePurchaseChange,
  queueOfflinePurchaseDelete,
  resolveOfflineConflict,
  resolveOfflineCardConflict,
  resolveOfflinePurchaseConflict,
  rememberOfflineUser,
  offlineSessionLeaseMs,
  saveOfflineCatalogs,
  saveOfflineCards,
  saveOfflinePurchases,
  saveOfflineEntries,
  saveOfflineSnapshot,
  type OfflineEntry,
  type OfflineCard,
  type OfflinePurchase,
  type OfflineScope,
} from './offline-store';

const admin: OfflineScope = { userId: 'admin-fixture', spaceId: 'family-fixture' };
const member: OfflineScope = { userId: 'member-fixture', spaceId: 'family-fixture' };

function entry(id: string, description = 'Despesa fictícia'): OfflineEntry {
  return {
    id,
    kind: 'expense',
    description,
    category_id: 'home-fixture',
    category_name: 'Moradia',
    competence_on: '2026-10-01',
    due_on: '2026-10-15',
    planned_cents: '12345',
    actual_cents: null,
    realized_on: null,
    payment_method_id: 'pix-fixture',
    payment_method_name: 'Pix',
    notes: null,
    created_by_user_id: admin.userId,
    updated_by_user_id: admin.userId,
    status: 'pending',
  };
}

function card(id: string, name = 'Cartão fictício', version = 1): OfflineCard {
  return {
    id,
    name,
    holder_user_id: admin.userId,
    holder_name: 'Pessoa titular',
    closing_day: 25,
    due_day: 5,
    archived_at: null,
    created_by_user_id: admin.userId,
    updated_by_user_id: admin.userId,
    version,
  };
}

function purchase(id: string, description = 'Compra fictícia', version = 1): OfflinePurchase {
  return {
    id,
    card_id: 'card-fixture',
    card_name: 'Cartão fictício',
    description,
    category_id: 'home-fixture',
    category_name: 'Moradia',
    purchase_on: '2026-10-25',
    first_invoice_on: '2026-11-01',
    total_cents: '1001',
    installment_count: 2,
    canceled_at: null,
    created_by_user_id: admin.userId,
    updated_by_user_id: admin.userId,
    version,
    installments: [1, 2].map((number) => ({
      id: `${id}-entry-${number}`,
      description: `${description} (${number}/2)`,
      category_id: 'home-fixture',
      category_name: 'Moradia',
      invoice_on: number === 1 ? '2026-11-01' : '2026-12-01',
      due_on: number === 1 ? '2026-11-05' : '2026-12-05',
      planned_cents: number === 1 ? '501' : '500',
      actual_cents: null,
      realized_on: null,
      created_by_user_id: admin.userId,
      updated_by_user_id: admin.userId,
      version: 1,
      installment_number: number,
      installment_count: 2,
      status: 'pending',
    })),
  };
}

function purchasePayload(item: OfflinePurchase) {
  return {
    purchase: {
      cardId: item.card_id,
      categoryId: item.category_id,
      description: item.description,
      purchaseOn: item.purchase_on,
      firstInvoiceOn: item.first_invoice_on,
      totalCents: Number(item.total_cents),
      installmentCount: item.installment_count,
    },
    installments: item.installments.map((installment) => ({
      id: installment.id,
      installmentNumber: installment.installment_number,
      plannedCents: Number(installment.planned_cents),
      invoiceOn: installment.invoice_on,
    })),
  };
}

beforeAll(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `operation-${cryptoId++}`) });
});

let cryptoId = 0;

afterAll(() => vi.unstubAllGlobals());

describe('scoped IndexedDB workspace', () => {
  it('isolates cached cards and keeps queued card edits over stale server reads', async () => {
    const scopeA = { userId: admin.userId, spaceId: 'card-isolation-fixture' };
    const scopeB = { userId: member.userId, spaceId: 'card-isolation-fixture' };
    const original = card('card-admin');
    const members = [{ id: admin.userId, name: 'Pessoa titular', is_active: true }];
    await saveOfflineCards(scopeA, [original], members, '2026-10-06T12:00:00.000Z');
    await saveOfflineCards(scopeB, [card('card-member', 'Outro cartão')], [{ id: member.userId, name: 'Outra titular', is_active: true }]);
    await queueOfflineCardChange(scopeA, { ...original, name: 'Edição local' }, 'update');
    await saveOfflineCards(scopeA, [original], members, '2026-10-06T12:00:00.000Z');

    const adminSnapshot = await loadOfflineWorkspace(scopeA);
    const memberSnapshot = await loadOfflineWorkspace(scopeB);
    expect(adminSnapshot.cards).toMatchObject([{ id: original.id, name: 'Edição local' }]);
    expect(adminSnapshot.cardMembers).toEqual(members);
    expect(adminSnapshot.cardOperations).toMatchObject([
      expect.objectContaining({ cardId: original.id, userId: scopeA.userId, spaceId: scopeA.spaceId, kind: 'update' }),
    ]);
    expect(adminSnapshot.lastSyncedAt).toBe('2026-10-06T12:00:00.000Z');
    expect(memberSnapshot.cards).toMatchObject([{ id: 'card-member', name: 'Outro cartão' }]);
    expect(memberSnapshot.cardOperations).toEqual([]);
  });

  it('coalesces local card changes, resolves a conflict, and acknowledges edits made during sync', async () => {
    const scope = { userId: admin.userId, spaceId: 'card-sync-fixture' };
    const local = card('card-local', 'Cartão novo');
    await queueOfflineCardChange(scope, local, 'create');
    const sent = (await loadOfflineWorkspace(scope)).cardOperations[0]!;
    await queueOfflineCardChange(scope, { ...local, name: 'Nome corrigido' }, 'update');
    expect((await loadOfflineWorkspace(scope)).cardOperations).toMatchObject([
      expect.objectContaining({
        operationId: sent.operationId,
        kind: 'create',
        baseVersion: null,
        payload: expect.objectContaining({ name: 'Nome corrigido' }),
      }),
    ]);

    const applied = { ...local, name: 'Cartão novo', version: 1 };
    await queueOfflineCardChange(scope, { ...local, name: 'Edição durante envio' }, 'update');
    await acknowledgeOfflineCardOperation(scope, sent, { card: applied });
    expect((await loadOfflineWorkspace(scope)).cardOperations).toMatchObject([
      expect.objectContaining({ kind: 'update', baseVersion: 1, payload: expect.objectContaining({ name: 'Edição durante envio' }) }),
    ]);

    const pending = (await loadOfflineWorkspace(scope)).cardOperations[0]!;
    const server = { ...applied, name: 'Versão do servidor', version: 2 };
    await markOfflineCardConflict(scope, pending, { reason: 'version_mismatch', serverCard: server });
    await resolveOfflineCardConflict(scope, pending.operationId, 'local');
    const resolvedLocal = await loadOfflineWorkspace(scope);
    expect(resolvedLocal.cardOperations).toMatchObject([expect.objectContaining({ kind: 'update', baseVersion: 2, conflict: undefined })]);
    expect(resolvedLocal.cards[0]).toMatchObject({ name: 'Edição durante envio', version: 2 });

    const localPending = resolvedLocal.cardOperations[0]!;
    await markOfflineCardConflict(scope, localPending, { reason: 'version_mismatch', serverCard: server });
    await resolveOfflineCardConflict(scope, localPending.operationId, 'server');
    expect(await loadOfflineWorkspace(scope)).toMatchObject({ cards: [server], cardOperations: [] });
  });

  it('caches purchase installments as expenses and protects offline changes from stale reads', async () => {
    const scope = { userId: admin.userId, spaceId: 'purchase-cache-fixture' };
    const original = purchase('purchase-local');
    await saveOfflinePurchases(scope, [original], '2026-10-06T12:00:00.000Z');
    const changed = {
      ...original,
      description: 'Compra alterada offline',
      installments: original.installments.map((item) => ({
        ...item,
        description: `Compra alterada offline (${item.installment_number}/2)`,
      })),
    };
    await queueOfflinePurchaseChange(scope, changed, 'update', purchasePayload(changed));
    await saveOfflinePurchases(scope, [original], '2026-10-06T12:01:00.000Z');
    const snapshot = await loadOfflineWorkspace(scope);
    expect(snapshot.purchases).toMatchObject([{ id: original.id, description: 'Compra alterada offline' }]);
    expect(snapshot.entries).toMatchObject([
      expect.objectContaining({ id: `${original.id}-entry-1`, kind: 'expense', card_purchase_id: original.id, installment_number: 1 }),
      expect.objectContaining({ id: `${original.id}-entry-2`, kind: 'expense', card_purchase_id: original.id, installment_number: 2 }),
    ]);
    expect(snapshot.purchaseOperations).toMatchObject([
      expect.objectContaining({ purchaseId: original.id, kind: 'update', baseVersion: 1 }),
    ]);
  });

  it('cancels a synced purchase offline without losing paid installments or its original total', async () => {
    const scope = { userId: admin.userId, spaceId: 'purchase-cancel-fixture' };
    const original = purchase('purchase-cancel-local');
    original.installments[0]!.actual_cents = '334';
    original.installments[0]!.realized_on = '2026-11-05';
    original.installments[0]!.status = 'paid';
    await saveOfflinePurchases(scope, [original]);
    await queueOfflinePurchaseDelete(scope, original, '2026-10-07T12:00:00.000Z');

    const snapshot = await loadOfflineWorkspace(scope);
    expect(snapshot.purchases).toMatchObject([
      {
        id: original.id,
        total_cents: '1001',
        canceled_at: '2026-10-07T12:00:00.000Z',
        installments: [{ id: original.installments[0]?.id, actual_cents: '334' }],
      },
    ]);
    expect(snapshot.purchaseOperations).toMatchObject([{ purchaseId: original.id, kind: 'delete', baseVersion: 1 }]);
    expect(snapshot.entries).toMatchObject([expect.objectContaining({ id: original.installments[0]?.id, actual_cents: '334' })]);
  });

  it('acknowledges, conflicts, and resolves purchase operations without replacing local follow-up edits', async () => {
    const scope = { userId: admin.userId, spaceId: 'purchase-sync-fixture' };
    const local = purchase('purchase-sync-local');
    await queueOfflinePurchaseChange(scope, local, 'create', purchasePayload(local));
    const sent = (await loadOfflineWorkspace(scope)).purchaseOperations[0]!;
    const applied = { ...local, version: 1 };
    const changed = {
      ...local,
      description: 'Edição durante envio',
      version: 1,
      installments: local.installments.map((item) => ({ ...item, description: `Edição durante envio (${item.installment_number}/2)` })),
    };
    await queueOfflinePurchaseChange(scope, changed, 'update', purchasePayload(changed));
    await acknowledgeOfflinePurchaseOperation(scope, sent, { purchase: applied });
    expect((await loadOfflineWorkspace(scope)).purchaseOperations).toMatchObject([
      expect.objectContaining({
        kind: 'update',
        baseVersion: 1,
        payload: expect.objectContaining({ purchase: expect.objectContaining({ description: 'Edição durante envio' }) }),
      }),
    ]);

    const pending = (await loadOfflineWorkspace(scope)).purchaseOperations[0]!;
    const server = { ...applied, description: 'Versão do servidor', version: 2 };
    await markOfflinePurchaseConflict(scope, pending, { reason: 'version_mismatch', serverPurchase: server });
    await resolveOfflinePurchaseConflict(scope, pending.operationId, 'local');
    expect((await loadOfflineWorkspace(scope)).purchaseOperations).toMatchObject([
      expect.objectContaining({ baseVersion: 2, conflict: undefined }),
    ]);
    const localPending = (await loadOfflineWorkspace(scope)).purchaseOperations[0]!;
    await markOfflinePurchaseConflict(scope, localPending, { reason: 'version_mismatch', serverPurchase: server });
    await resolveOfflinePurchaseConflict(scope, localPending.operationId, 'server');
    expect(await loadOfflineWorkspace(scope)).toMatchObject({ purchases: [server], purchaseOperations: [] });
  });

  it('recreates a locally retained purchase collision with matching installment identifiers', async () => {
    const scope = { userId: admin.userId, spaceId: 'purchase-collision-fixture' };
    const local = purchase('purchase-collision');
    await queueOfflinePurchaseChange(scope, local, 'create', purchasePayload(local));
    const pending = (await loadOfflineWorkspace(scope)).purchaseOperations[0]!;
    await markOfflinePurchaseConflict(scope, pending, { reason: 'id_collision', serverPurchase: purchase(local.id, 'Compra diferente') });
    await resolveOfflinePurchaseConflict(scope, pending.operationId, 'local');
    const snapshot = await loadOfflineWorkspace(scope);
    expect(snapshot.purchases).toHaveLength(1);
    expect(snapshot.purchases[0]?.id).not.toBe(local.id);
    expect(snapshot.purchaseOperations[0]).toMatchObject({ kind: 'create', baseVersion: null, purchaseId: snapshot.purchases[0]?.id });
    const payload = snapshot.purchaseOperations[0]?.payload as ReturnType<typeof purchasePayload>;
    expect(payload.installments.map((item) => item.id)).toEqual(snapshot.purchases[0]?.installments.map((item) => item.id));
  });

  it('isolates cached data and queued edits by both user and shared space', async () => {
    const scopeA = { userId: admin.userId, spaceId: 'isolation-fixture' };
    const scopeB = { userId: member.userId, spaceId: 'isolation-fixture' };
    const original = entry('entry-admin');
    await saveOfflineCatalogs(
      scopeA,
      [{ id: 'home-fixture', name: 'Moradia', kind: 'expense', expense_class: 'fixed', archived_at: null }],
      [],
    );
    await saveOfflineEntries(scopeA, [original], '2026-10-06T12:00:00.000Z');
    await saveOfflineEntries(scopeB, [entry('entry-member', 'Outra despesa fictícia')]);
    await queueOfflineEntryChange(scopeA, { ...original, description: 'Edição pendente' }, 'update');

    const adminSnapshot = await loadOfflineWorkspace(scopeA);
    const memberSnapshot = await loadOfflineWorkspace(scopeB);

    expect(offlineScopeKey(scopeA)).not.toBe(offlineScopeKey(scopeB));
    expect(adminSnapshot.entries.map((item) => item.description)).toEqual(['Edição pendente']);
    expect(adminSnapshot.operations).toHaveLength(1);
    expect(adminSnapshot.operations[0]).toMatchObject({
      userId: scopeA.userId,
      spaceId: scopeA.spaceId,
      entryId: 'entry-admin',
      kind: 'update',
    });
    expect(adminSnapshot.lastSyncedAt).toBe('2026-10-06T12:00:00.000Z');
    expect(adminSnapshot.categories).toHaveLength(1);
    expect(memberSnapshot.entries.map((item) => item.description)).toEqual(['Outra despesa fictícia']);
    expect(memberSnapshot.operations).toHaveLength(0);
    expect(memberSnapshot.categories).toEqual([]);
  });

  it('coalesces repeated changes and removes a queued create when it is deleted before sync', async () => {
    const scope = { userId: admin.userId, spaceId: 'queue-fixture' };
    const first = entry('entry-local', 'Nova conta fictícia');
    await queueOfflineEntryChange(scope, first, 'create');
    const initial = (await loadOfflineWorkspace(scope)).operations[0];
    await queueOfflineEntryChange(scope, { ...first, description: 'Nome corrigido' }, 'update');

    const updated = await loadOfflineWorkspace(scope);
    expect(updated.operations).toHaveLength(1);
    expect(updated.operations[0]).toMatchObject({
      operationId: initial?.operationId,
      kind: 'create',
      payload: expect.objectContaining({ description: 'Nome corrigido' }),
    });
    expect(updated.entries.find((item) => item.id === first.id)?.description).toBe('Nome corrigido');

    await queueOfflineEntryDelete(scope, first);
    const deleted = await loadOfflineWorkspace(scope);
    expect(deleted.entries.some((item) => item.id === first.id)).toBe(false);
    expect(deleted.operations.some((operation) => operation.entryId === first.id)).toBe(false);
  });

  it('keeps queued changes over stale server reads and stores delete tombstones', async () => {
    const scope = { userId: admin.userId, spaceId: 'server-fixture' };
    const serverEntry = entry('entry-server');
    await saveOfflineEntries(scope, [serverEntry]);
    await queueOfflineEntryChange(scope, { ...serverEntry, description: 'Edição local' }, 'update');
    await saveOfflineEntries(scope, [{ ...serverEntry, description: 'Resposta antiga do servidor' }]);
    expect((await loadOfflineWorkspace(scope)).entries.find((item) => item.id === serverEntry.id)?.description).toBe('Edição local');

    await queueOfflineEntryDelete(scope, serverEntry);
    const deleted = await loadOfflineWorkspace(scope);
    expect(deleted.entries).toEqual([]);
    expect(deleted.operations).toMatchObject([expect.objectContaining({ entryId: serverEntry.id, kind: 'delete', payload: null })]);
  });

  it('rebases a resolved local conflict and replaces a server conflict choice', async () => {
    const localScope = { userId: admin.userId, spaceId: 'resolve-local-fixture' };
    const original = { ...entry('entry-conflict'), version: 2 };
    await saveOfflineEntries(localScope, [original]);
    await queueOfflineEntryChange(localScope, { ...original, description: 'Versão local fictícia' }, 'update');
    const pending = (await loadOfflineWorkspace(localScope)).operations[0]!;
    const server = { ...original, version: 3, description: 'Versão do servidor fictícia' };
    await markOfflineConflict(localScope, pending, { reason: 'version_mismatch', serverEntry: server });
    await resolveOfflineConflict(localScope, pending.operationId, 'local');
    const localResult = await loadOfflineWorkspace(localScope);
    expect(localResult.operations).toMatchObject([
      expect.objectContaining({
        kind: 'update',
        baseVersion: 3,
        conflict: undefined,
        payload: expect.objectContaining({ description: 'Versão local fictícia' }),
      }),
    ]);
    expect(localResult.operations[0]?.operationId).not.toBe(pending.operationId);
    expect(localResult.entries[0]).toMatchObject({ version: 3, description: 'Versão local fictícia' });

    const serverScope = { userId: admin.userId, spaceId: 'resolve-server-fixture' };
    await saveOfflineEntries(serverScope, [original]);
    await queueOfflineEntryChange(serverScope, { ...original, description: 'Alteração descartável' }, 'update');
    const serverPending = (await loadOfflineWorkspace(serverScope)).operations[0]!;
    await markOfflineConflict(serverScope, serverPending, { reason: 'version_mismatch', serverEntry: server });
    await resolveOfflineConflict(serverScope, serverPending.operationId, 'server');
    expect(await loadOfflineWorkspace(serverScope)).toMatchObject({ entries: [server], operations: [] });
  });

  it('turns an edited queued create into an update when its original request already reached the server', async () => {
    const scope = { userId: admin.userId, spaceId: 'idempotency-edit-fixture' };
    const local = entry('entry-already-created', 'Edição local após a resposta perdida');
    await queueOfflineEntryChange(scope, local, 'create');
    const pending = (await loadOfflineWorkspace(scope)).operations[0]!;
    const server = { ...local, description: 'Primeira versão já criada', version: 1 };
    await markOfflineConflict(scope, pending, { reason: 'idempotency_key_reused', serverEntry: server });

    await resolveOfflineConflict(scope, pending.operationId, 'local');

    const snapshot = await loadOfflineWorkspace(scope);
    expect(snapshot.entries).toMatchObject([expect.objectContaining({ id: local.id, description: local.description, version: 1 })]);
    expect(snapshot.operations).toMatchObject([
      expect.objectContaining({
        kind: 'update',
        entryId: local.id,
        baseVersion: 1,
        payload: expect.objectContaining({ description: local.description }),
        conflict: undefined,
      }),
    ]);
    expect(snapshot.operations[0]?.operationId).not.toBe(pending.operationId);
  });

  it('acknowledges a sent version without losing a newer local edit made in another tab', async () => {
    const scope = { userId: admin.userId, spaceId: 'acknowledge-fixture' };
    const first = entry('entry-in-flight', 'Primeira versão local');
    await queueOfflineEntryChange(scope, first, 'create');
    const sent = (await loadOfflineWorkspace(scope)).operations[0]!;
    await queueOfflineEntryChange(scope, { ...first, description: 'Edição feita durante o envio' }, 'update');
    const applied = { ...first, version: 1, created_by_user_id: admin.userId, updated_by_user_id: admin.userId };
    await acknowledgeOfflineOperation(scope, sent, { entry: applied });

    const snapshot = await loadOfflineWorkspace(scope);
    expect(snapshot.entries[0]).toMatchObject({ description: 'Edição feita durante o envio', version: 1 });
    expect(snapshot.operations).toMatchObject([
      expect.objectContaining({
        kind: 'update',
        baseVersion: 1,
        payload: expect.objectContaining({ description: 'Edição feita durante o envio' }),
      }),
    ]);
    expect(snapshot.operations[0]).not.toHaveProperty('conflict');
    expect(snapshot.operations[0]?.operationId).not.toBe(sent.operationId);

    await acknowledgeOfflineOperation(scope, sent, { entry: applied });
    expect((await loadOfflineWorkspace(scope)).operations).toHaveLength(1);
  });

  it('persists private dashboard snapshots and clears only the requested user workspace', async () => {
    const scopeA = { userId: admin.userId, spaceId: 'snapshot-fixture' };
    const scopeB = { userId: member.userId, spaceId: 'snapshot-fixture' };
    await saveOfflineSnapshot(scopeA, '/api/dashboard?month=2026-10', { planned: { expenseCents: '12345' } });
    await saveOfflineSnapshot(scopeB, '/api/dashboard?month=2026-10', { planned: { expenseCents: '67890' } });
    await saveOfflineCards(scopeA, [card('card-clear-a')], [{ id: scopeA.userId, name: 'Pessoa A', is_active: true }]);
    await saveOfflineCards(scopeB, [card('card-clear-b')], [{ id: scopeB.userId, name: 'Pessoa B', is_active: true }]);
    await rememberOfflineUser(
      { id: scopeA.userId, name: 'Pessoa A', email: 'a@example.test', role: 'admin', spaceId: scopeA.spaceId },
      '2026-10-01T00:00:00.000Z',
    );
    await rememberOfflineUser(
      { id: scopeB.userId, name: 'Pessoa B', email: 'b@example.test', role: 'member', spaceId: scopeB.spaceId },
      '2026-10-02T00:00:00.000Z',
    );
    expect(await loadOfflineSnapshot(scopeA, '/api/dashboard?month=2026-10')).toEqual({ planned: { expenseCents: '12345' } });

    await saveOfflineEntries(scopeB, [entry('entry-member')]);
    await clearOfflineWorkspace(scopeA);
    expect(await loadOfflineWorkspace(scopeA)).toMatchObject({
      entries: [],
      categories: [],
      operations: [],
      cards: [],
      cardMembers: [],
      cardOperations: [],
      purchases: [],
      purchaseOperations: [],
      lastSyncedAt: null,
    });
    expect(await loadOfflineSnapshot(scopeA, '/api/dashboard?month=2026-10')).toBeNull();
    expect(await loadOfflineSnapshot(scopeB, '/api/dashboard?month=2026-10')).toEqual({ planned: { expenseCents: '67890' } });
    expect((await loadOfflineWorkspace(scopeB)).entries).toHaveLength(1);
    expect((await loadOfflineWorkspace(scopeB)).cards).toMatchObject([{ id: 'card-clear-b' }]);
    // Relógio fixo: a janela de sessão é de 7 dias e as datas do cenário não podem depender de quando o teste roda.
    const withinLease = Date.parse('2026-10-03T00:00:00.000Z');
    expect((await loadRememberedOfflineUser(withinLease))?.user.id).toBe(scopeB.userId);
    await clearOfflineWorkspace(scopeB);
    expect(await loadRememberedOfflineUser(withinLease)).toBeNull();
  });

  it('allows a cached identity only during the seven-day verified-session window', async () => {
    const scope = { userId: 'lease-fixture', spaceId: 'lease-space' };
    await rememberOfflineUser(
      { id: scope.userId, name: 'Pessoa de teste', email: 'offline@example.test', role: 'member', spaceId: scope.spaceId },
      '2026-10-01T00:00:00.000Z',
    );
    expect((await loadRememberedOfflineUser(Date.parse('2026-10-06T00:00:00.000Z')))?.user.id).toBe(scope.userId);
    expect(await loadRememberedOfflineUser(Date.parse('2026-10-08T00:00:01.000Z'))).toBeNull();
    expect(offlineSessionLeaseMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
