import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  acknowledgeOfflineCardOperation,
  acknowledgeOfflinePurchaseOperation,
  acknowledgeOfflineOperation,
  clearOfflineWorkspace,
  loadOfflineSnapshot,
  loadOfflineWorkspace,
  markOfflineConflict,
  markOfflineCardConflict,
  markOfflinePurchaseConflict,
  queueOfflineCardChange,
  queueOfflinePurchaseChange,
  queueOfflinePurchaseDelete,
  queueOfflineEntryChange,
  queueOfflineEntryDelete,
  removeCachedOfflineEntry,
  resolveOfflineConflict,
  resolveOfflineCardConflict,
  resolveOfflinePurchaseConflict,
  saveOfflineCatalogs,
  saveOfflineCards,
  saveOfflinePurchases,
  saveOfflineEntries,
  saveOfflineSnapshot,
  type OfflineCategory,
  type OfflineCard,
  type OfflineCardMember,
  type OfflineEntry,
  type OfflinePaymentMethod,
  type OfflinePurchase,
  type OfflinePurchaseOperation,
  type OfflineScope,
  type OfflineWorkspaceSnapshot,
} from './offline-store';

export type OfflineWorkspace = OfflineWorkspaceSnapshot & {
  online: boolean;
  ready: boolean;
  supported: boolean;
  storageError: string;
  pendingCount: number;
  syncing: boolean;
  syncError: string;
  refresh: () => Promise<OfflineWorkspaceSnapshot>;
  cacheEntries: (entries: OfflineEntry[]) => Promise<void>;
  cacheCatalogs: (categories: OfflineCategory[], paymentMethods: OfflinePaymentMethod[]) => Promise<void>;
  cacheCards: (cards: OfflineCard[], members: OfflineCardMember[]) => Promise<void>;
  cachePurchases: (purchases: OfflinePurchase[]) => Promise<void>;
  cacheSnapshot: (path: string, data: unknown) => Promise<void>;
  getSnapshot: <T>(path: string) => Promise<T | null>;
  queueChange: (entry: OfflineEntry, kind: 'create' | 'update') => Promise<void>;
  queueDelete: (entry: OfflineEntry) => Promise<void>;
  queueCardChange: (card: OfflineCard, kind: 'create' | 'update') => Promise<void>;
  queuePurchaseChange: (purchase: OfflinePurchase, kind: 'create' | 'update', payload: Record<string, unknown>) => Promise<void>;
  queuePurchaseDelete: (purchase: OfflinePurchase) => Promise<void>;
  sync: (csrfToken: string) => Promise<void>;
  resolveConflict: (operationId: string, choice: 'local' | 'server') => Promise<void>;
  resolveCardConflict: (operationId: string, choice: 'local' | 'server') => Promise<void>;
  resolvePurchaseConflict: (operationId: string, choice: 'local' | 'server') => Promise<void>;
  removeCachedEntry: (entryId: string) => Promise<void>;
  clear: () => Promise<void>;
  setOnline: (online: boolean) => void;
  invalidateSession: () => void;
};

const emptySnapshot: OfflineWorkspaceSnapshot = { entries: [], categories: [], paymentMethods: [], cards: [], cardMembers: [], operations: [], cardOperations: [], purchases: [], purchaseOperations: [], lastSyncedAt: null };
const OfflineWorkspaceContext = createContext<OfflineWorkspace | null>(null);

export function OfflineWorkspaceProvider({ scope, children }: { scope: OfflineScope; children: ReactNode }) {
  const stableScope = useMemo(() => ({ userId: scope.userId, spaceId: scope.spaceId }), [scope.userId, scope.spaceId]);
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const syncPromise = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const loaded = await loadOfflineWorkspace(stableScope);
      setSnapshot(loaded);
      setSupported(true);
      setStorageError('');
      return loaded;
    } catch (error) {
      setSupported(false);
      setStorageError(error instanceof Error ? error.message : 'Não foi possível acessar o armazenamento offline.');
      return emptySnapshot;
    } finally {
      setReady(true);
    }
  }, [stableScope]);

  useEffect(() => {
    const setBrowserOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', setBrowserOnline);
    window.addEventListener('offline', setBrowserOnline);
    void refresh();
    return () => {
      window.removeEventListener('online', setBrowserOnline);
      window.removeEventListener('offline', setBrowserOnline);
    };
  }, [refresh]);

  const cacheEntries = useCallback(async (entries: OfflineEntry[]) => {
    if (!supported) return;
    try {
      await saveOfflineEntries(stableScope, entries);
      await refresh();
    } catch (error) {
      setSupported(false);
      setStorageError(error instanceof Error ? error.message : 'Não foi possível salvar os dados offline.');
    }
  }, [refresh, stableScope, supported]);

  const cacheCatalogs = useCallback(async (categories: OfflineCategory[], paymentMethods: OfflinePaymentMethod[]) => {
    if (!supported) return;
    try {
      await saveOfflineCatalogs(stableScope, categories, paymentMethods);
      await refresh();
    } catch (error) {
      setSupported(false);
      setStorageError(error instanceof Error ? error.message : 'Não foi possível salvar os cadastros offline.');
    }
  }, [refresh, stableScope, supported]);

  const cacheCards = useCallback(async (cards: OfflineCard[], members: OfflineCardMember[]) => {
    if (!supported) return;
    try {
      await saveOfflineCards(stableScope, cards, members);
      await refresh();
    } catch (error) {
      setSupported(false);
      setStorageError(error instanceof Error ? error.message : 'Não foi possível salvar os cartões offline.');
    }
  }, [refresh, stableScope, supported]);

  const cachePurchases = useCallback(async (purchases: OfflinePurchase[]) => {
    if (!supported) return;
    try {
      await saveOfflinePurchases(stableScope, purchases);
      await refresh();
    } catch (error) {
      setSupported(false);
      setStorageError(error instanceof Error ? error.message : 'Não foi possível salvar as compras offline.');
    }
  }, [refresh, stableScope, supported]);

  const cacheSnapshot = useCallback(async (path: string, data: unknown) => {
    if (!supported) return;
    try {
      await saveOfflineSnapshot(stableScope, path, data);
      await refresh();
    } catch (error) {
      setSupported(false);
      setStorageError(error instanceof Error ? error.message : 'Não foi possível salvar o painel offline.');
    }
  }, [refresh, stableScope, supported]);

  const getSnapshot = useCallback(<T,>(path: string) => loadOfflineSnapshot<T>(stableScope, path), [stableScope]);

  const queueChange = useCallback(async (entry: OfflineEntry, kind: 'create' | 'update') => {
    await queueOfflineEntryChange(stableScope, entry, kind);
    await refresh();
  }, [refresh, stableScope]);

  const queueDelete = useCallback(async (entry: OfflineEntry) => {
    await queueOfflineEntryDelete(stableScope, entry);
    await refresh();
  }, [refresh, stableScope]);

  const queueCardChange = useCallback(async (card: OfflineCard, kind: 'create' | 'update') => {
    await queueOfflineCardChange(stableScope, card, kind);
    await refresh();
  }, [refresh, stableScope]);

  const queuePurchaseChange = useCallback(async (purchase: OfflinePurchase, kind: 'create' | 'update', payload: Record<string, unknown>) => {
    await queueOfflinePurchaseChange(stableScope, purchase, kind, payload);
    await refresh();
  }, [refresh, stableScope]);

  const queuePurchaseDelete = useCallback(async (purchase: OfflinePurchase) => {
    await queueOfflinePurchaseDelete(stableScope, purchase);
    await refresh();
  }, [refresh, stableScope]);

  const invalidateSession = useCallback(() => {
    window.dispatchEvent(new Event('conta-clara:session-expired'));
  }, []);

  const sync = useCallback((csrfToken: string) => {
    if (!csrfToken || !supported || (typeof navigator !== 'undefined' && !navigator.onLine)) return Promise.resolve();
    if (syncPromise.current) return syncPromise.current;
    if (!online) setOnline(true);
    const job = (async () => {
      setSyncing(true);
      setSyncError('');
      const attempted = new Set<string>();
      try {
        for (let count = 0; count < 500; count += 1) {
          const current = await loadOfflineWorkspace(stableScope);
          const entryOperation = current.operations.find((item) => !item.conflict && !attempted.has(item.operationId));
          const cardOperation = current.cardOperations.find((item) => !item.conflict && !attempted.has(item.operationId));
          const purchaseOperation = current.purchaseOperations.find((item) => !item.conflict && !attempted.has(item.operationId));
          const operation = [entryOperation, cardOperation, purchaseOperation]
            .filter((item) => item !== undefined)
            .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))[0];
          if (!operation) break;
          attempted.add(operation.operationId);
          const isCardOperation = 'cardId' in operation;
          const isPurchaseOperation = 'purchaseId' in operation;
          const response = await fetch('/api/sync/operations', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({
              ...(isCardOperation ? { entity: 'card', cardId: operation.cardId } : isPurchaseOperation ? { entity: 'purchase', purchaseId: operation.purchaseId } : {}),
              operationId: operation.operationId,
              ...(!isCardOperation && !isPurchaseOperation ? { entryId: operation.entryId } : {}),
              kind: operation.kind,
              baseVersion: operation.baseVersion,
              payload: operation.payload,
            }),
          });
          const result = await response.json().catch(() => ({})) as {
            status?: string;
            reason?: string;
            error?: string;
            entry?: OfflineEntry;
            serverEntry?: OfflineEntry | null;
            card?: OfflineCard;
            serverCard?: OfflineCard | null;
            purchase?: OfflinePurchase;
            serverPurchase?: OfflinePurchase | null;
            deleted?: boolean;
          };
          if (response.status === 401) {
            invalidateSession();
            break;
          }
          if (response.status === 409 && result.status === 'conflict') {
            const reasons = new Set(['version_mismatch', 'server_deleted', 'id_collision', 'idempotency_key_reused']);
            const reason = reasons.has(result.reason ?? '') ? result.reason as 'version_mismatch' | 'server_deleted' | 'id_collision' | 'idempotency_key_reused' : 'version_mismatch';
            if (isCardOperation) {
              await markOfflineCardConflict(stableScope, operation, { reason, serverCard: result.serverCard ?? null });
            } else if (isPurchaseOperation) {
              await markOfflinePurchaseConflict(stableScope, operation as OfflinePurchaseOperation, { reason, serverPurchase: result.serverPurchase ?? null });
            } else {
              await markOfflineConflict(stableScope, operation, { reason, serverEntry: result.serverEntry ?? null });
            }
            await refresh();
            continue;
          }
          if (!response.ok || result.status !== 'applied') {
            setSyncError(result.error ?? 'Não foi possível sincronizar as alterações. Elas continuam salvas neste aparelho.');
            break;
          }
          if (isCardOperation) await acknowledgeOfflineCardOperation(stableScope, operation, { card: result.card });
          else if (isPurchaseOperation) await acknowledgeOfflinePurchaseOperation(stableScope, operation as OfflinePurchaseOperation, { purchase: result.purchase });
          else await acknowledgeOfflineOperation(stableScope, operation, { entry: result.entry, deleted: result.deleted });
          await refresh();
        }
      } catch (error) {
        if (error instanceof TypeError) {
          setOnline(false);
          setSyncError('A conexão foi interrompida. As alterações continuam salvas neste aparelho.');
        } else {
          setSyncError(error instanceof Error ? error.message : 'Não foi possível sincronizar as alterações.');
        }
      } finally {
        setSyncing(false);
      }
    })();
    syncPromise.current = job;
    void job.finally(() => { if (syncPromise.current === job) syncPromise.current = null; });
    return job;
  }, [invalidateSession, online, refresh, stableScope, supported]);

  const resolveConflict = useCallback(async (operationId: string, choice: 'local' | 'server') => {
    await resolveOfflineConflict(stableScope, operationId, choice);
    setSyncError('');
    await refresh();
  }, [refresh, stableScope]);

  const resolveCardConflict = useCallback(async (operationId: string, choice: 'local' | 'server') => {
    await resolveOfflineCardConflict(stableScope, operationId, choice);
    setSyncError('');
    await refresh();
  }, [refresh, stableScope]);

  const resolvePurchaseConflict = useCallback(async (operationId: string, choice: 'local' | 'server') => {
    await resolveOfflinePurchaseConflict(stableScope, operationId, choice);
    setSyncError('');
    await refresh();
  }, [refresh, stableScope]);

  const removeCachedEntry = useCallback(async (entryId: string) => {
    if (!supported) return;
    try {
      await removeCachedOfflineEntry(stableScope, entryId);
      await refresh();
    } catch (error) {
      setSupported(false);
      setStorageError(error instanceof Error ? error.message : 'Não foi possível atualizar os dados offline.');
    }
  }, [refresh, stableScope, supported]);

  const clear = useCallback(async () => {
    if (supported) await clearOfflineWorkspace(stableScope);
    setSnapshot(emptySnapshot);
  }, [stableScope, supported]);

  const value = useMemo<OfflineWorkspace>(() => ({
    ...snapshot,
    online,
    ready,
    supported,
    storageError,
    pendingCount: snapshot.operations.length + snapshot.cardOperations.length + snapshot.purchaseOperations.length,
    syncing,
    syncError,
    refresh,
    cacheEntries,
    cacheCatalogs,
    cacheCards,
    cachePurchases,
    cacheSnapshot,
    getSnapshot,
    queueChange,
    queueDelete,
    queueCardChange,
    queuePurchaseChange,
    queuePurchaseDelete,
    sync,
    resolveConflict,
    resolveCardConflict,
    resolvePurchaseConflict,
    removeCachedEntry,
    clear,
    setOnline,
    invalidateSession,
  }), [snapshot, online, ready, supported, storageError, syncing, syncError, refresh, cacheEntries, cacheCatalogs, cacheCards, cachePurchases, cacheSnapshot, getSnapshot, queueChange, queueDelete, queueCardChange, queuePurchaseChange, queuePurchaseDelete, sync, resolveConflict, resolveCardConflict, resolvePurchaseConflict, removeCachedEntry, clear, invalidateSession]);

  return <OfflineWorkspaceContext.Provider value={value}>{children}</OfflineWorkspaceContext.Provider>;
}

export function useOfflineWorkspace() {
  return useContext(OfflineWorkspaceContext);
}

export function filterOfflineEntries(entries: OfflineEntry[], filters: { month?: string; categoryId?: string; status?: string }) {
  return entries.filter((entry) => (!filters.month || entry.competence_on.startsWith(filters.month))
    && (!filters.categoryId || entry.category_id === filters.categoryId)
    && (!filters.status || entry.status === filters.status));
}

export function mergeOfflineEntries(serverEntries: OfflineEntry[], snapshot: OfflineWorkspaceSnapshot, filters: { month?: string; categoryId?: string; status?: string }, includeCached = true) {
  const localOperations = new Map(snapshot.operations.map((operation) => [operation.entryId, operation]));
  const entries = new Map(serverEntries.map((entry) => [entry.id, entry]));
  for (const operation of snapshot.operations) {
    if (operation.kind === 'delete') entries.delete(operation.entryId);
    else {
      const local = snapshot.entries.find((entry) => entry.id === operation.entryId);
      if (local) entries.set(local.id, local);
    }
  }
  if (includeCached) {
    for (const entry of snapshot.entries) {
      if (!localOperations.has(entry.id) && !entries.has(entry.id)) entries.set(entry.id, entry);
    }
  }
  return filterOfflineEntries([...entries.values()], filters);
}

export function makeOfflineEntry(input: {
  id: string;
  userId: string;
  kind: OfflineEntry['kind'];
  description: string;
  categoryId: string | null;
  competenceOn: string;
  dueOn: string | null;
  plannedCents: number;
  paymentMethodId: string | null;
  notes: string | null;
}, categories: OfflineCategory[], paymentMethods: OfflinePaymentMethod[], previous?: OfflineEntry): OfflineEntry {
  const todayParts = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce<Record<string, string>>((parts, part) => ({ ...parts, [part.type]: part.value }), {});
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  return {
    id: input.id,
    kind: input.kind,
    description: input.description.trim(),
    category_id: input.categoryId,
    category_name: categories.find((category) => category.id === input.categoryId)?.name ?? previous?.category_name ?? null,
    competence_on: input.competenceOn,
    due_on: input.dueOn,
    planned_cents: String(input.plannedCents),
    actual_cents: previous?.actual_cents ?? null,
    realized_on: previous?.realized_on ?? null,
    payment_method_id: input.paymentMethodId,
    payment_method_name: paymentMethods.find((method) => method.id === input.paymentMethodId)?.name ?? previous?.payment_method_name ?? null,
    notes: input.notes,
    created_by_user_id: previous?.created_by_user_id ?? input.userId,
    updated_by_user_id: input.userId,
    status: previous?.actual_cents !== null && previous?.actual_cents !== undefined ? 'paid' : input.dueOn && input.dueOn < today ? 'late' : 'pending',
    version: previous?.version,
  };
}

export function isNetworkFailure(error: unknown, online: boolean) {
  return !online || error instanceof TypeError;
}

export function isAuthenticationFailure(response: Response) {
  return response.status === 401;
}
