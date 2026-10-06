import { IDBFactory } from 'fake-indexeddb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  clearOfflineWorkspace,
  loadRememberedOfflineUser,
  loadOfflineSnapshot,
  loadOfflineWorkspace,
  offlineScopeKey,
  queueOfflineEntryChange,
  queueOfflineEntryDelete,
  rememberOfflineUser,
  offlineSessionLeaseMs,
  saveOfflineCatalogs,
  saveOfflineEntries,
  saveOfflineSnapshot,
  type OfflineEntry,
  type OfflineScope,
} from './offline-store';

const admin: OfflineScope = { userId: 'admin-fixture', spaceId: 'family-fixture' };
const member: OfflineScope = { userId: 'member-fixture', spaceId: 'family-fixture' };

function entry(id: string, description = 'Despesa fictícia'): OfflineEntry {
  return {
    id, kind: 'expense', description, category_id: 'home-fixture', category_name: 'Moradia',
    competence_on: '2026-10-01', due_on: '2026-10-15', planned_cents: '12345', actual_cents: null,
    realized_on: null, payment_method_id: 'pix-fixture', payment_method_name: 'Pix', notes: null,
    created_by_user_id: admin.userId, updated_by_user_id: admin.userId, status: 'pending',
  };
}

beforeAll(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `operation-${cryptoId++}`) });
});

let cryptoId = 0;

afterAll(() => vi.unstubAllGlobals());

describe('scoped IndexedDB workspace', () => {
  it('isolates cached data and queued edits by both user and shared space', async () => {
    const scopeA = { userId: admin.userId, spaceId: 'isolation-fixture' };
    const scopeB = { userId: member.userId, spaceId: 'isolation-fixture' };
    const original = entry('entry-admin');
    await saveOfflineCatalogs(scopeA, [{ id: 'home-fixture', name: 'Moradia', kind: 'expense', expense_class: 'fixed', archived_at: null }], []);
    await saveOfflineEntries(scopeA, [original], '2026-10-06T12:00:00.000Z');
    await saveOfflineEntries(scopeB, [entry('entry-member', 'Outra despesa fictícia')]);
    await queueOfflineEntryChange(scopeA, { ...original, description: 'Edição pendente' }, 'update');

    const adminSnapshot = await loadOfflineWorkspace(scopeA);
    const memberSnapshot = await loadOfflineWorkspace(scopeB);

    expect(offlineScopeKey(scopeA)).not.toBe(offlineScopeKey(scopeB));
    expect(adminSnapshot.entries.map((item) => item.description)).toEqual(['Edição pendente']);
    expect(adminSnapshot.operations).toHaveLength(1);
    expect(adminSnapshot.operations[0]).toMatchObject({ userId: scopeA.userId, spaceId: scopeA.spaceId, entryId: 'entry-admin', kind: 'update' });
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
    expect(updated.operations[0]).toMatchObject({ operationId: initial?.operationId, kind: 'create', payload: expect.objectContaining({ description: 'Nome corrigido' }) });
    expect(updated.entries.find((item) => item.id === first.id)?.description).toBe('Nome corrigido');

    await queueOfflineEntryDelete(scope, first.id);
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

    await queueOfflineEntryDelete(scope, serverEntry.id);
    const deleted = await loadOfflineWorkspace(scope);
    expect(deleted.entries).toEqual([]);
    expect(deleted.operations).toMatchObject([expect.objectContaining({ entryId: serverEntry.id, kind: 'delete', payload: null })]);
  });

  it('persists private dashboard snapshots and clears only the requested user workspace', async () => {
    const scopeA = { userId: admin.userId, spaceId: 'snapshot-fixture' };
    const scopeB = { userId: member.userId, spaceId: 'snapshot-fixture' };
    await saveOfflineSnapshot(scopeA, '/api/dashboard?month=2026-10', { planned: { expenseCents: '12345' } });
    await saveOfflineSnapshot(scopeB, '/api/dashboard?month=2026-10', { planned: { expenseCents: '67890' } });
    await rememberOfflineUser({ id: scopeA.userId, name: 'Pessoa A', email: 'a@example.test', role: 'admin', spaceId: scopeA.spaceId }, '2026-10-01T00:00:00.000Z');
    await rememberOfflineUser({ id: scopeB.userId, name: 'Pessoa B', email: 'b@example.test', role: 'member', spaceId: scopeB.spaceId }, '2026-10-02T00:00:00.000Z');
    expect(await loadOfflineSnapshot(scopeA, '/api/dashboard?month=2026-10')).toEqual({ planned: { expenseCents: '12345' } });

    await saveOfflineEntries(scopeB, [entry('entry-member')]);
    await clearOfflineWorkspace(scopeA);
    expect(await loadOfflineWorkspace(scopeA)).toMatchObject({ entries: [], categories: [], operations: [], lastSyncedAt: null });
    expect(await loadOfflineSnapshot(scopeA, '/api/dashboard?month=2026-10')).toBeNull();
    expect(await loadOfflineSnapshot(scopeB, '/api/dashboard?month=2026-10')).toEqual({ planned: { expenseCents: '67890' } });
    expect((await loadOfflineWorkspace(scopeB)).entries).toHaveLength(1);
    expect((await loadRememberedOfflineUser())?.user.id).toBe(scopeB.userId);
    await clearOfflineWorkspace(scopeB);
    expect(await loadRememberedOfflineUser()).toBeNull();
  });

  it('allows a cached identity only during the seven-day verified-session window', async () => {
    const scope = { userId: 'lease-fixture', spaceId: 'lease-space' };
    await rememberOfflineUser({ id: scope.userId, name: 'Pessoa de teste', email: 'offline@example.test', role: 'member', spaceId: scope.spaceId }, '2026-10-01T00:00:00.000Z');
    expect((await loadRememberedOfflineUser(Date.parse('2026-10-06T00:00:00.000Z')))?.user.id).toBe(scope.userId);
    expect(await loadRememberedOfflineUser(Date.parse('2026-10-08T00:00:01.000Z'))).toBeNull();
    expect(offlineSessionLeaseMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
