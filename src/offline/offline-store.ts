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
};
export type OfflineCategory = { id: string; name: string; kind: OfflineEntry['kind']; expense_class: 'fixed' | 'variable' | null; archived_at: string | null };
export type OfflinePaymentMethod = { id: string; name: string; archived_at: string | null };
export type OfflineOperationKind = 'create' | 'update' | 'delete';
export type OfflineOperation = {
  operationId: string;
  scope: string;
  userId: string;
  spaceId: string;
  entryId: string;
  kind: OfflineOperationKind;
  payload: Record<string, unknown> | null;
  queuedAt: string;
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
const databaseVersion = 1;
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
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of storeNames) {
        const store = database.objectStoreNames.contains(name)
          ? request.transaction!.objectStore(name)
          : database.createObjectStore(name, { keyPath: 'key' });
        if (!store.indexNames.contains('scope')) store.createIndex('scope', 'scope', { unique: false });
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
      payload: entryPayload(entry),
      queuedAt: prior?.queuedAt ?? now,
    } satisfies StoredOperation);
    transaction.objectStore('entries').put({ key, scope: scopeKey, entry, isLocal: true } satisfies StoredEntry);
  };
  await transactionDone(transaction);
}

export async function queueOfflineEntryDelete(scope: OfflineScope, entryId: string, now = new Date().toISOString()) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, entryId);
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
      entryId,
      operationId: previous.result?.operationId ?? crypto.randomUUID(),
      kind: 'delete',
      payload: null,
      queuedAt: previous.result?.queuedAt ?? now,
    } satisfies StoredOperation);
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
