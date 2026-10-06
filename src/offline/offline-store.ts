export type OfflineScope = { userId: string; spaceId: string };
export type OfflineUser = { id: string; name: string; email: string; role: string; spaceId: string };
export type OfflineEntry = {
  id: string;
  kind: 'income' | 'expense' | 'investment';
  description: string;
  category_id: string | null;
  category_name: string | null;
  competence_on: string;
  due_on: string | null;
  planned_cents: string;
  actual_cents: string | null;
  realized_on: string | null;
  payment_method_id: string | null;
  payment_method_name: string | null;
  notes: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  status: 'pending' | 'late' | 'paid';
  version?: number;
};
export type OfflineCategory = { id: string; name: string; kind: OfflineEntry['kind']; expense_class: 'fixed' | 'variable' | null; archived_at: string | null };
export type OfflinePaymentMethod = { id: string; name: string; archived_at: string | null };
export type OfflineOperationKind = 'create' | 'update' | 'delete';
export type OfflineSyncConflict = { reason: 'version_mismatch' | 'server_deleted' | 'id_collision' | 'idempotency_key_reused'; serverEntry: OfflineEntry | null };
export type OfflineOperation = {
  operationId: string;
  scope: string;
  userId: string;
  spaceId: string;
  entryId: string;
  kind: OfflineOperationKind;
  baseVersion: number | null;
  payload: Record<string, unknown> | null;
  queuedAt: string;
  conflict?: OfflineSyncConflict;
};
export type OfflineWorkspaceSnapshot = {
  entries: OfflineEntry[];
  categories: OfflineCategory[];
  paymentMethods: OfflinePaymentMethod[];
  operations: OfflineOperation[];
  lastSyncedAt: string | null;
};

type ScopedRecord = { key: string; scope: string };
type StoredEntry = ScopedRecord & { entry: OfflineEntry; isLocal: boolean };
type StoredCatalog = ScopedRecord & { categories: OfflineCategory[]; paymentMethods: OfflinePaymentMethod[] };
type StoredMetadata = ScopedRecord & { lastSyncedAt: string | null };
type StoredOperation = OfflineOperation & { key: string };
type StoredSnapshot = ScopedRecord & { path: string; data: unknown };
type StoredDeviceSession = ScopedRecord & { user: OfflineUser; verifiedAt: string };
type StoredDeviceLogout = ScopedRecord & { userId: string; spaceId: string; markedAt: string };

const databaseName = 'conta-clara-offline';
const databaseVersion = 2;
const deviceSessionKey = '@last-authenticated-user';
const deviceLogoutKey = '@offline-logout';
export const offlineSessionLeaseMs = 7 * 24 * 60 * 60 * 1000;
const storeNames = ['entries', 'catalogs', 'operations', 'metadata', 'snapshots'] as const;
type StoreName = typeof storeNames[number];
let databasePromise: Promise<IDBDatabase> | null = null;

export function offlineScopeKey(scope: OfflineScope) {
  return `${scope.spaceId}\u0000${scope.userId}`;
}

function recordKey(scope: OfflineScope, recordId: string) {
  return `${offlineScopeKey(scope)}\u0000${recordId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('O navegador não oferece armazenamento local.'));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction!;
      for (const name of storeNames) {
        const store = database.objectStoreNames.contains(name)
          ? transaction.objectStore(name)
          : database.createObjectStore(name, { keyPath: 'key' });
        if (!store.indexNames.contains('scope')) store.createIndex('scope', 'scope', { unique: false });
      }
      if (event.oldVersion < 2) {
        const entries = transaction.objectStore('entries').openCursor();
        entries.onsuccess = () => {
          const cursor = entries.result;
          if (!cursor) return;
          const record = cursor.value as StoredEntry;
          if (typeof record.entry.version !== 'number') cursor.update({ ...record, entry: { ...record.entry, version: 1 } } satisfies StoredEntry);
          cursor.continue();
        };
        const operations = transaction.objectStore('operations').openCursor();
        operations.onsuccess = () => {
          const cursor = operations.result;
          if (!cursor) return;
          const record = cursor.value as StoredOperation;
          if (typeof record.baseVersion === 'undefined') {
            cursor.update({ ...record, baseVersion: record.kind === 'create' ? null : 1 } satisfies StoredOperation);
          }
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Não foi possível abrir o armazenamento local.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('O armazenamento local está ocupado em outra janela.'));
    };
  });
  return databasePromise;
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível ler o armazenamento local.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('A gravação local foi cancelada.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Não foi possível gravar os dados locais.'));
  });
}

function scopedValues<T extends ScopedRecord>(transaction: IDBTransaction, storeName: StoreName, scope: string) {
  return requestValue(transaction.objectStore(storeName).index('scope').getAll(scope) as IDBRequest<T[]>);
}

export async function loadOfflineWorkspace(scope: OfflineScope): Promise<OfflineWorkspaceSnapshot> {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction([...storeNames], 'readonly');
  const done = transactionDone(transaction);
  const [entries, catalogs, operations, metadata] = await Promise.all([
    scopedValues<StoredEntry>(transaction, 'entries', scopeKey),
    requestValue(transaction.objectStore('catalogs').get(scopeKey) as IDBRequest<StoredCatalog | undefined>),
    scopedValues<StoredOperation>(transaction, 'operations', scopeKey),
    requestValue(transaction.objectStore('metadata').get(scopeKey) as IDBRequest<StoredMetadata | undefined>),
    done,
  ]).then(([loadedEntries, loadedCatalogs, loadedOperations, loadedMetadata]) => [loadedEntries, loadedCatalogs, loadedOperations, loadedMetadata] as const);

  return {
    entries: entries.map((record) => record.entry),
    categories: catalogs?.categories ?? [],
    paymentMethods: catalogs?.paymentMethods ?? [],
    operations: operations.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt)).map(({ key: _key, ...operation }) => operation),
    lastSyncedAt: metadata?.lastSyncedAt ?? null,
  };
}

export async function saveOfflineCatalogs(scope: OfflineScope, categories: OfflineCategory[], paymentMethods: OfflinePaymentMethod[], now = new Date().toISOString()) {
  const database = await openDatabase();
  const key = offlineScopeKey(scope);
  const transaction = database.transaction(['catalogs', 'metadata'], 'readwrite');
  transaction.objectStore('catalogs').put({ key, scope: key, categories, paymentMethods } satisfies StoredCatalog);
  transaction.objectStore('metadata').put({ key, scope: key, lastSyncedAt: now } satisfies StoredMetadata);
  await transactionDone(transaction);
}

export async function saveOfflineEntries(scope: OfflineScope, entries: OfflineEntry[], now = new Date().toISOString()) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction(['entries', 'operations', 'metadata'], 'readwrite');
  const operations = transaction.objectStore('operations').index('scope').getAll(scopeKey) as IDBRequest<StoredOperation[]>;
  operations.onsuccess = () => {
    const protectedEntryIds = new Set(operations.result.map((operation) => operation.entryId));
    const entryStore = transaction.objectStore('entries');
    for (const entry of entries) {
      if (!protectedEntryIds.has(entry.id)) {
        const key = recordKey(scope, entry.id);
        entryStore.put({ key, scope: scopeKey, entry, isLocal: false } satisfies StoredEntry);
      }
    }
    const key = scopeKey;
    transaction.objectStore('metadata').put({ key, scope: scopeKey, lastSyncedAt: now } satisfies StoredMetadata);
  };
  await transactionDone(transaction);
}

function entryPayload(entry: OfflineEntry) {
  return {
    kind: entry.kind,
    description: entry.description,
    categoryId: entry.category_id,
    competenceOn: entry.competence_on,
    dueOn: entry.due_on,
    plannedCents: Number(entry.planned_cents),
    paymentMethodId: entry.payment_method_id,
    notes: entry.notes,
  };
}

export async function queueOfflineEntryChange(scope: OfflineScope, entry: OfflineEntry, kind: Exclude<OfflineOperationKind, 'delete'>, now = new Date().toISOString()) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, entry.id);
  const transaction = database.transaction(['entries', 'operations'], 'readwrite');
  const operationStore = transaction.objectStore('operations');
  const previous = operationStore.get(key) as IDBRequest<StoredOperation | undefined>;
  previous.onsuccess = () => {
    const prior = previous.result;
    const operationKind = prior?.kind === 'create' ? 'create' : kind;
    operationStore.put({
      key,
      scope: scopeKey,
      userId: scope.userId,
      spaceId: scope.spaceId,
      entryId: entry.id,
      operationId: prior?.operationId ?? crypto.randomUUID(),
      kind: operationKind,
      baseVersion: prior ? prior.baseVersion : operationKind === 'create' ? null : entry.version ?? 1,
      payload: entryPayload(entry),
      queuedAt: prior?.queuedAt ?? now,
    } satisfies StoredOperation);
    transaction.objectStore('entries').put({ key, scope: scopeKey, entry, isLocal: true } satisfies StoredEntry);
  };
  await transactionDone(transaction);
}

export async function queueOfflineEntryDelete(scope: OfflineScope, entry: OfflineEntry, now = new Date().toISOString()) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, entry.id);
  const transaction = database.transaction(['entries', 'operations'], 'readwrite');
  const operationStore = transaction.objectStore('operations');
  const previous = operationStore.get(key) as IDBRequest<StoredOperation | undefined>;
  previous.onsuccess = () => {
      transaction.objectStore('entries').delete(key);
      if (previous.result?.kind === 'create') operationStore.delete(key);
      else operationStore.put({
      key,
      scope: scopeKey,
      userId: scope.userId,
      spaceId: scope.spaceId,
        entryId: entry.id,
        operationId: previous.result?.operationId ?? crypto.randomUUID(),
        kind: 'delete',
        baseVersion: previous.result?.baseVersion ?? entry.version ?? 1,
        payload: null,
      queuedAt: previous.result?.queuedAt ?? now,
    } satisfies StoredOperation);
  };
  await transactionDone(transaction);
}

export async function markOfflineConflict(scope: OfflineScope, sentOperation: OfflineOperation, conflict: OfflineSyncConflict) {
  const database = await openDatabase();
  const transaction = database.transaction(['operations'], 'readwrite');
  const store = transaction.objectStore('operations');
  const request = store.get(recordKey(scope, sentOperation.entryId)) as IDBRequest<StoredOperation | undefined>;
  request.onsuccess = () => {
    const current = request.result;
    if (current?.operationId === sentOperation.operationId && current.baseVersion === sentOperation.baseVersion) store.put({ ...current, conflict } satisfies StoredOperation);
  };
  await transactionDone(transaction);
}

export type OfflineSyncResult = { entry?: OfflineEntry; deleted?: boolean };

export async function acknowledgeOfflineOperation(scope: OfflineScope, sentOperation: OfflineOperation, result: OfflineSyncResult) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, sentOperation.entryId);
  const transaction = database.transaction(['entries', 'operations', 'metadata'], 'readwrite');
  const entryStore = transaction.objectStore('entries');
  const operationStore = transaction.objectStore('operations');
  const currentRequest = operationStore.get(key) as IDBRequest<StoredOperation | undefined>;
  const localEntryRequest = entryStore.get(key) as IDBRequest<StoredEntry | undefined>;
  let currentOperation: StoredOperation | undefined;
  let localEntry: StoredEntry | undefined;
  let completedReads = 0;
  const finish = () => {
    completedReads += 1;
    if (completedReads < 2) return;
    if (!currentOperation || currentOperation.operationId !== sentOperation.operationId) return;
    const unchanged = currentOperation.kind === sentOperation.kind
      && currentOperation.baseVersion === sentOperation.baseVersion
      && JSON.stringify(currentOperation.payload) === JSON.stringify(sentOperation.payload);

    if (unchanged) {
      operationStore.delete(key);
      if (result.deleted) entryStore.delete(key);
      else if (result.entry) entryStore.put({ key, scope: scopeKey, entry: result.entry, isLocal: false } satisfies StoredEntry);
    } else if (result.entry) {
      if (currentOperation.kind === 'create') currentOperation.kind = 'update';
      currentOperation.baseVersion = result.entry.version ?? 1;
      currentOperation.operationId = crypto.randomUUID();
      delete currentOperation.conflict;
      operationStore.put(currentOperation);
      if (localEntry) entryStore.put({ ...localEntry, entry: { ...localEntry.entry, version: result.entry.version ?? 1 }, isLocal: true } satisfies StoredEntry);
    } else if (result.deleted && currentOperation.kind === 'delete') {
      operationStore.delete(key);
      entryStore.delete(key);
    } else if (result.deleted && localEntry) {
      const newEntryId = crypto.randomUUID();
      const newKey = recordKey(scope, newEntryId);
      entryStore.delete(key);
      entryStore.put({ ...localEntry, key: newKey, entry: { ...localEntry.entry, id: newEntryId, version: undefined }, isLocal: true } satisfies StoredEntry);
      operationStore.delete(key);
      operationStore.put({ ...currentOperation, key: newKey, entryId: newEntryId, operationId: crypto.randomUUID(), kind: 'create', baseVersion: null, conflict: undefined } satisfies StoredOperation);
    }
    transaction.objectStore('metadata').put({ key: scopeKey, scope: scopeKey, lastSyncedAt: new Date().toISOString() } satisfies StoredMetadata);
  };
  currentRequest.onsuccess = () => { currentOperation = currentRequest.result; finish(); };
  localEntryRequest.onsuccess = () => { localEntry = localEntryRequest.result; finish(); };
  await transactionDone(transaction);
}

export async function resolveOfflineConflict(scope: OfflineScope, operationId: string, choice: 'local' | 'server') {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction(['entries', 'operations'], 'readwrite');
  const entryStore = transaction.objectStore('entries');
  const operationStore = transaction.objectStore('operations');
  const operationsRequest = operationStore.index('scope').getAll(scopeKey) as IDBRequest<StoredOperation[]>;
  operationsRequest.onsuccess = () => {
    const operation = operationsRequest.result.find((item) => item.operationId === operationId && item.conflict);
    if (!operation) return;
    const key = recordKey(scope, operation.entryId);
    const serverEntry = operation.conflict!.serverEntry;
    if (choice === 'server') {
      operationStore.delete(key);
      if (serverEntry) entryStore.put({ key, scope: scopeKey, entry: serverEntry, isLocal: false } satisfies StoredEntry);
      else entryStore.delete(key);
      return;
    }
    if (operation.kind === 'delete' && !serverEntry && operation.conflict!.reason === 'server_deleted') {
      operationStore.delete(key);
      entryStore.delete(key);
      return;
    }
    if (operation.kind === 'delete' && !serverEntry) {
      operationStore.put({ ...operation, operationId: crypto.randomUUID(), conflict: undefined } satisfies StoredOperation);
      return;
    }
    if (operation.kind === 'create' && serverEntry && operation.conflict!.reason === 'idempotency_key_reused') {
      operationStore.put({ ...operation, operationId: crypto.randomUUID(), kind: 'update', baseVersion: serverEntry.version ?? 1, conflict: undefined } satisfies StoredOperation);
      const localRequest = entryStore.get(key) as IDBRequest<StoredEntry | undefined>;
      localRequest.onsuccess = () => {
        if (localRequest.result) entryStore.put({ ...localRequest.result, entry: { ...localRequest.result.entry, version: serverEntry.version ?? 1 }, isLocal: true } satisfies StoredEntry);
      };
      return;
    }
    if (!serverEntry || operation.kind === 'create' || operation.conflict!.reason === 'id_collision') {
      const localRequest = entryStore.get(key) as IDBRequest<StoredEntry | undefined>;
      localRequest.onsuccess = () => {
        if (!localRequest.result) return;
        const newEntryId = crypto.randomUUID();
        const newKey = recordKey(scope, newEntryId);
        const entry = { ...localRequest.result.entry, id: newEntryId, version: undefined };
        entryStore.delete(key);
        entryStore.put({ key: newKey, scope: scopeKey, entry, isLocal: true } satisfies StoredEntry);
        operationStore.delete(key);
        operationStore.put({ ...operation, key: newKey, entryId: newEntryId, operationId: crypto.randomUUID(), kind: 'create', baseVersion: null, conflict: undefined } satisfies StoredOperation);
      };
      return;
    }
    operationStore.put({ ...operation, operationId: crypto.randomUUID(), baseVersion: serverEntry.version ?? 1, conflict: undefined } satisfies StoredOperation);
    if (operation.kind !== 'delete') {
      const localRequest = entryStore.get(key) as IDBRequest<StoredEntry | undefined>;
      localRequest.onsuccess = () => {
        if (localRequest.result) entryStore.put({ ...localRequest.result, entry: { ...localRequest.result.entry, version: serverEntry.version ?? 1 }, isLocal: true } satisfies StoredEntry);
      };
    }
  };
  await transactionDone(transaction);
}

export async function removeCachedOfflineEntry(scope: OfflineScope, entryId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(['entries'], 'readwrite');
  transaction.objectStore('entries').delete(recordKey(scope, entryId));
  await transactionDone(transaction);
}

export async function saveOfflineSnapshot(scope: OfflineScope, path: string, data: unknown, now = new Date().toISOString()) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, path);
  const transaction = database.transaction(['snapshots', 'metadata'], 'readwrite');
  transaction.objectStore('snapshots').put({ key, scope: scopeKey, path, data } satisfies StoredSnapshot);
  transaction.objectStore('metadata').put({ key: scopeKey, scope: scopeKey, lastSyncedAt: now } satisfies StoredMetadata);
  await transactionDone(transaction);
}

export async function rememberOfflineUser(user: OfflineUser, verifiedAt = new Date().toISOString()) {
  const database = await openDatabase();
  const transaction = database.transaction(['metadata'], 'readwrite');
  transaction.objectStore('metadata').put({
    key: deviceSessionKey,
    scope: '@device',
    user,
    verifiedAt,
  } satisfies StoredDeviceSession);
  await transactionDone(transaction);
}

export async function loadRememberedOfflineUser(now = Date.now()): Promise<StoredDeviceSession | null> {
  const database = await openDatabase();
  const transaction = database.transaction(['metadata'], 'readonly');
  const done = transactionDone(transaction);
  const session = await requestValue(transaction.objectStore('metadata').get(deviceSessionKey) as IDBRequest<StoredDeviceSession | undefined>);
  await done;
  if (!session) return null;
  const age = now - new Date(session.verifiedAt).getTime();
  return age >= 0 && age <= offlineSessionLeaseMs ? session : null;
}

export async function clearRememberedOfflineUser(scope?: OfflineScope) {
  const database = await openDatabase();
  const transaction = database.transaction(['metadata'], 'readwrite');
  const metadata = transaction.objectStore('metadata');
  if (!scope) metadata.delete(deviceSessionKey);
  else {
    const request = metadata.get(deviceSessionKey) as IDBRequest<StoredDeviceSession | undefined>;
    request.onsuccess = () => {
      if (request.result?.user.id === scope.userId && request.result.user.spaceId === scope.spaceId) metadata.delete(deviceSessionKey);
    };
  }
  await transactionDone(transaction);
}

export async function markOfflineLogout(user: OfflineUser, markedAt = new Date().toISOString()) {
  const database = await openDatabase();
  const transaction = database.transaction(['metadata'], 'readwrite');
  transaction.objectStore('metadata').put({
    key: deviceLogoutKey,
    scope: '@device',
    userId: user.id,
    spaceId: user.spaceId,
    markedAt,
  } satisfies StoredDeviceLogout);
  await transactionDone(transaction);
}

export async function isOfflineLogoutMarked(user: OfflineUser) {
  const database = await openDatabase();
  const transaction = database.transaction(['metadata'], 'readonly');
  const done = transactionDone(transaction);
  const marker = await requestValue(transaction.objectStore('metadata').get(deviceLogoutKey) as IDBRequest<StoredDeviceLogout | undefined>);
  await done;
  return marker?.userId === user.id && marker.spaceId === user.spaceId;
}

export async function clearOfflineLogoutMarker() {
  const database = await openDatabase();
  const transaction = database.transaction(['metadata'], 'readwrite');
  transaction.objectStore('metadata').delete(deviceLogoutKey);
  await transactionDone(transaction);
}

export async function loadOfflineSnapshot<T>(scope: OfflineScope, path: string): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(['snapshots'], 'readonly');
  const done = transactionDone(transaction);
  const snapshot = await requestValue(transaction.objectStore('snapshots').get(recordKey(scope, path)) as IDBRequest<StoredSnapshot | undefined>);
  await done;
  return snapshot ? snapshot.data as T : null;
}

export async function clearOfflineWorkspace(scope: OfflineScope) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction([...storeNames], 'readwrite');
  const done = transactionDone(transaction);
  const scopedStores: StoreName[] = ['entries', 'operations', 'snapshots'];
  const deletes = scopedStores.map((name) => {
    const store = transaction.objectStore(name);
    const request = store.index('scope').getAllKeys(scopeKey);
    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        for (const key of request.result) store.delete(key);
        resolve();
      };
      request.onerror = () => reject(request.error ?? new Error('Não foi possível limpar os dados locais.'));
    });
  });
  transaction.objectStore('catalogs').delete(scopeKey);
  const metadata = transaction.objectStore('metadata');
  metadata.delete(scopeKey);
  const rememberedUser = metadata.get(deviceSessionKey) as IDBRequest<StoredDeviceSession | undefined>;
  rememberedUser.onsuccess = () => {
    if (rememberedUser.result?.user.id === scope.userId && rememberedUser.result.user.spaceId === scope.spaceId) metadata.delete(deviceSessionKey);
  };
  await Promise.all([...deletes, done]);
}
