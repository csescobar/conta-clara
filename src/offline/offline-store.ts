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
  card_purchase_id?: string | null;
  installment_number?: number | null;
  installment_count?: number | null;
  card_name?: string | null;
  invoice_month?: string | null;
  invoice_status?: 'open' | 'paid' | 'needs_review' | null;
  notes: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  status: 'pending' | 'late' | 'paid';
  version?: number;
};
export type OfflineCategory = {
  id: string;
  name: string;
  kind: OfflineEntry['kind'];
  expense_class: 'fixed' | 'variable' | null;
  archived_at: string | null;
};
export type OfflinePaymentMethod = { id: string; name: string; archived_at: string | null };
export type OfflineCard = {
  id: string;
  name: string;
  holder_user_id: string;
  holder_name: string;
  closing_day: number;
  due_day: number;
  archived_at: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  version: number;
};
export type OfflineCardMember = { id: string; name: string; is_active: boolean };
export type OfflinePurchaseInstallment = {
  id: string;
  description: string;
  category_id: string;
  category_name: string;
  invoice_on: string;
  due_on: string;
  planned_cents: string;
  actual_cents: string | null;
  realized_on: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  version: number;
  installment_number: number;
  installment_count: number;
  status: 'pending' | 'late' | 'paid';
};
export type OfflinePurchase = {
  id: string;
  card_id: string;
  card_name: string;
  description: string;
  category_id: string;
  category_name: string;
  purchase_on: string;
  first_invoice_on: string;
  total_cents: string;
  installment_count: number;
  canceled_at: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  version: number;
  installments: OfflinePurchaseInstallment[];
};
export type OfflineInvoiceEntry = {
  id: string;
  description: string;
  purchase_description: string;
  category_name: string | null;
  invoice_on: string;
  due_on: string;
  planned_cents: string;
  actual_cents: string | null;
  realized_on: string | null;
  version: number;
  installment_number: number;
  installment_count: number;
};
export type OfflineInvoice = {
  id: string;
  card_id: string;
  card_name: string;
  closing_day: number;
  due_day: number;
  invoice_month: string;
  due_on: string;
  payment_status: 'open' | 'paid' | 'needs_review';
  status: 'open' | 'late' | 'paid' | 'needs_review';
  actual_cents: string | null;
  paid_on: string | null;
  payment_method_id: string | null;
  payment_method_name: string | null;
  updated_by_user_id: string;
  version: number;
  planned_cents: string;
  installment_count: number;
  entries: OfflineInvoiceEntry[];
};
export type OfflineOperationKind = 'create' | 'update' | 'delete';
export type OfflineSyncConflict = {
  reason: 'version_mismatch' | 'server_deleted' | 'id_collision' | 'idempotency_key_reused' | 'state_mismatch';
  serverEntry: OfflineEntry | null;
};
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
export type OfflineCardOperation = {
  operationId: string;
  scope: string;
  userId: string;
  spaceId: string;
  cardId: string;
  kind: 'create' | 'update';
  baseVersion: number | null;
  payload: Record<string, unknown>;
  queuedAt: string;
  conflict?: { reason: OfflineSyncConflict['reason']; serverCard: OfflineCard | null };
};
export type OfflinePurchaseOperation = {
  operationId: string;
  scope: string;
  userId: string;
  spaceId: string;
  purchaseId: string;
  kind: 'create' | 'update' | 'delete';
  baseVersion: number | null;
  payload: Record<string, unknown> | null;
  queuedAt: string;
  conflict?: { reason: OfflineSyncConflict['reason']; serverPurchase: OfflinePurchase | null };
};
export type OfflineInvoiceOperation = {
  operationId: string;
  scope: string;
  userId: string;
  spaceId: string;
  cardId: string;
  invoiceMonth: string;
  kind: 'pay' | 'reverse';
  baseVersion: number;
  payload: Record<string, unknown> | null;
  queuedAt: string;
  conflict?: {
    reason: 'version_mismatch' | 'server_deleted' | 'idempotency_key_reused' | 'state_mismatch';
    serverInvoice: OfflineInvoice | null;
  };
};
export type OfflineWorkspaceSnapshot = {
  entries: OfflineEntry[];
  categories: OfflineCategory[];
  paymentMethods: OfflinePaymentMethod[];
  cards: OfflineCard[];
  cardMembers: OfflineCardMember[];
  operations: OfflineOperation[];
  cardOperations: OfflineCardOperation[];
  purchases: OfflinePurchase[];
  purchaseOperations: OfflinePurchaseOperation[];
  invoices: OfflineInvoice[];
  invoiceOperations: OfflineInvoiceOperation[];
  lastSyncedAt: string | null;
};

type ScopedRecord = { key: string; scope: string };
type StoredEntry = ScopedRecord & { entry: OfflineEntry; isLocal: boolean };
type StoredCatalog = ScopedRecord & { categories: OfflineCategory[]; paymentMethods: OfflinePaymentMethod[] };
type StoredCard = ScopedRecord & { card: OfflineCard };
type StoredCardMembers = ScopedRecord & { members: OfflineCardMember[] };
type StoredMetadata = ScopedRecord & { lastSyncedAt: string | null };
type StoredOperation = OfflineOperation & { key: string };
type StoredCardOperation = OfflineCardOperation & { key: string };
type StoredPurchase = ScopedRecord & { purchase: OfflinePurchase };
type StoredPurchaseOperation = OfflinePurchaseOperation & { key: string };
type StoredInvoice = ScopedRecord & { invoice: OfflineInvoice };
type StoredInvoiceOperation = OfflineInvoiceOperation & { key: string };
type StoredSnapshot = ScopedRecord & { path: string; data: unknown };
type StoredDeviceSession = ScopedRecord & { user: OfflineUser; verifiedAt: string };
type StoredDeviceLogout = ScopedRecord & { userId: string; spaceId: string; markedAt: string };

const databaseName = 'conta-clara-offline';
const databaseVersion = 5;
const deviceSessionKey = '@last-authenticated-user';
const deviceLogoutKey = '@offline-logout';
export const offlineSessionLeaseMs = 7 * 24 * 60 * 60 * 1000;
const storeNames = [
  'entries',
  'catalogs',
  'operations',
  'metadata',
  'snapshots',
  'creditCards',
  'cardMembers',
  'cardOperations',
  'purchases',
  'purchaseOperations',
  'cardInvoices',
  'invoiceOperations',
] as const;
type StoreName = (typeof storeNames)[number];
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
          if (typeof record.entry.version !== 'number')
            cursor.update({ ...record, entry: { ...record.entry, version: 1 } } satisfies StoredEntry);
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
  const [
    entries,
    catalogs,
    operations,
    metadata,
    cards,
    cardMembers,
    cardOperations,
    purchases,
    purchaseOperations,
    invoices,
    invoiceOperations,
  ] = await Promise.all([
    scopedValues<StoredEntry>(transaction, 'entries', scopeKey),
    requestValue(transaction.objectStore('catalogs').get(scopeKey) as IDBRequest<StoredCatalog | undefined>),
    scopedValues<StoredOperation>(transaction, 'operations', scopeKey),
    requestValue(transaction.objectStore('metadata').get(scopeKey) as IDBRequest<StoredMetadata | undefined>),
    scopedValues<StoredCard>(transaction, 'creditCards', scopeKey),
    requestValue(transaction.objectStore('cardMembers').get(scopeKey) as IDBRequest<StoredCardMembers | undefined>),
    scopedValues<StoredCardOperation>(transaction, 'cardOperations', scopeKey),
    scopedValues<StoredPurchase>(transaction, 'purchases', scopeKey),
    scopedValues<StoredPurchaseOperation>(transaction, 'purchaseOperations', scopeKey),
    scopedValues<StoredInvoice>(transaction, 'cardInvoices', scopeKey),
    scopedValues<StoredInvoiceOperation>(transaction, 'invoiceOperations', scopeKey),
    done,
  ]);

  return {
    entries: entries.map((record) => record.entry),
    categories: catalogs?.categories ?? [],
    paymentMethods: catalogs?.paymentMethods ?? [],
    cards: cards.map((record) => record.card),
    cardMembers: cardMembers?.members ?? [],
    operations: operations
      .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))
      .map(({ key: _key, ...operation }) => operation),
    cardOperations: cardOperations
      .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))
      .map(({ key: _key, ...operation }) => operation),
    purchases: purchases.map((record) => record.purchase),
    purchaseOperations: purchaseOperations
      .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))
      .map(({ key: _key, ...operation }) => operation),
    invoices: invoices.map((record) => record.invoice),
    invoiceOperations: invoiceOperations
      .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))
      .map(({ key: _key, ...operation }) => operation),
    lastSyncedAt: metadata?.lastSyncedAt ?? null,
  };
}

export async function saveOfflineCatalogs(
  scope: OfflineScope,
  categories: OfflineCategory[],
  paymentMethods: OfflinePaymentMethod[],
  now = new Date().toISOString(),
) {
  const database = await openDatabase();
  const key = offlineScopeKey(scope);
  const transaction = database.transaction(['catalogs', 'metadata'], 'readwrite');
  transaction.objectStore('catalogs').put({ key, scope: key, categories, paymentMethods } satisfies StoredCatalog);
  transaction.objectStore('metadata').put({ key, scope: key, lastSyncedAt: now } satisfies StoredMetadata);
  await transactionDone(transaction);
}

export async function saveOfflineCards(
  scope: OfflineScope,
  cards: OfflineCard[],
  members: OfflineCardMember[],
  now = new Date().toISOString(),
) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction(['creditCards', 'cardMembers', 'cardOperations', 'metadata'], 'readwrite');
  const operations = transaction.objectStore('cardOperations').index('scope').getAll(scopeKey) as IDBRequest<StoredCardOperation[]>;
  operations.onsuccess = () => {
    const protectedIds = new Set(operations.result.map((operation) => operation.cardId));
    const cardStore = transaction.objectStore('creditCards');
    for (const card of cards) {
      if (!protectedIds.has(card.id)) {
        cardStore.put({ key: recordKey(scope, card.id), scope: scopeKey, card } satisfies StoredCard);
      }
    }
    transaction.objectStore('cardMembers').put({ key: scopeKey, scope: scopeKey, members } satisfies StoredCardMembers);
    transaction.objectStore('metadata').put({ key: scopeKey, scope: scopeKey, lastSyncedAt: now } satisfies StoredMetadata);
  };
  await transactionDone(transaction);
}

function cardPayload(card: OfflineCard) {
  return {
    name: card.name,
    holderUserId: card.holder_user_id,
    closingDay: card.closing_day,
    dueDay: card.due_day,
    archived: Boolean(card.archived_at),
  };
}

export async function queueOfflineCardChange(
  scope: OfflineScope,
  card: OfflineCard,
  kind: 'create' | 'update',
  now = new Date().toISOString(),
) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, card.id);
  const transaction = database.transaction(['creditCards', 'cardOperations'], 'readwrite');
  const operationStore = transaction.objectStore('cardOperations');
  const previous = operationStore.get(key) as IDBRequest<StoredCardOperation | undefined>;
  previous.onsuccess = () => {
    const prior = previous.result;
    const operationKind = prior?.kind === 'create' ? 'create' : kind;
    operationStore.put({
      key,
      scope: scopeKey,
      userId: scope.userId,
      spaceId: scope.spaceId,
      cardId: card.id,
      operationId: prior?.operationId ?? crypto.randomUUID(),
      kind: operationKind,
      baseVersion: prior ? prior.baseVersion : operationKind === 'create' ? null : card.version,
      payload: cardPayload(card),
      queuedAt: prior?.queuedAt ?? now,
      ...(prior?.conflict ? { conflict: prior.conflict } : {}),
    } satisfies StoredCardOperation);
    transaction.objectStore('creditCards').put({ key, scope: scopeKey, card } satisfies StoredCard);
  };
  await transactionDone(transaction);
}

export async function markOfflineCardConflict(
  scope: OfflineScope,
  sentOperation: OfflineCardOperation,
  conflict: NonNullable<OfflineCardOperation['conflict']>,
) {
  const database = await openDatabase();
  const transaction = database.transaction(['cardOperations'], 'readwrite');
  const store = transaction.objectStore('cardOperations');
  const request = store.get(recordKey(scope, sentOperation.cardId)) as IDBRequest<StoredCardOperation | undefined>;
  request.onsuccess = () => {
    const current = request.result;
    if (current?.operationId === sentOperation.operationId && current.baseVersion === sentOperation.baseVersion) {
      store.put({ ...current, conflict } satisfies StoredCardOperation);
    }
  };
  await transactionDone(transaction);
}

export async function acknowledgeOfflineCardOperation(
  scope: OfflineScope,
  sentOperation: OfflineCardOperation,
  result: { card?: OfflineCard },
) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, sentOperation.cardId);
  const transaction = database.transaction(['creditCards', 'cardOperations', 'metadata'], 'readwrite');
  const cardStore = transaction.objectStore('creditCards');
  const operationStore = transaction.objectStore('cardOperations');
  const currentRequest = operationStore.get(key) as IDBRequest<StoredCardOperation | undefined>;
  const localCardRequest = cardStore.get(key) as IDBRequest<StoredCard | undefined>;
  let currentOperation: StoredCardOperation | undefined;
  let localCard: StoredCard | undefined;
  let completedReads = 0;
  const finish = () => {
    completedReads += 1;
    if (completedReads < 2 || !currentOperation || currentOperation.operationId !== sentOperation.operationId) return;
    const unchanged =
      currentOperation.kind === sentOperation.kind &&
      currentOperation.baseVersion === sentOperation.baseVersion &&
      JSON.stringify(currentOperation.payload) === JSON.stringify(sentOperation.payload);
    if (unchanged) {
      operationStore.delete(key);
      if (result.card) cardStore.put({ key, scope: scopeKey, card: result.card } satisfies StoredCard);
    } else if (result.card) {
      if (currentOperation.kind === 'create') currentOperation.kind = 'update';
      currentOperation.baseVersion = result.card.version;
      currentOperation.operationId = crypto.randomUUID();
      delete currentOperation.conflict;
      operationStore.put(currentOperation);
      if (localCard) cardStore.put({ ...localCard, card: { ...localCard.card, version: result.card.version } } satisfies StoredCard);
    }
    transaction
      .objectStore('metadata')
      .put({ key: scopeKey, scope: scopeKey, lastSyncedAt: new Date().toISOString() } satisfies StoredMetadata);
  };
  currentRequest.onsuccess = () => {
    currentOperation = currentRequest.result;
    finish();
  };
  localCardRequest.onsuccess = () => {
    localCard = localCardRequest.result;
    finish();
  };
  await transactionDone(transaction);
}

export async function resolveOfflineCardConflict(scope: OfflineScope, operationId: string, choice: 'local' | 'server') {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction(['creditCards', 'cardOperations'], 'readwrite');
  const cardStore = transaction.objectStore('creditCards');
  const operationStore = transaction.objectStore('cardOperations');
  const operationsRequest = operationStore.index('scope').getAll(scopeKey) as IDBRequest<StoredCardOperation[]>;
  operationsRequest.onsuccess = () => {
    const operation = operationsRequest.result.find((item) => item.operationId === operationId && item.conflict);
    if (!operation) return;
    const key = recordKey(scope, operation.cardId);
    const serverCard = operation.conflict!.serverCard;
    if (choice === 'server') {
      operationStore.delete(key);
      if (serverCard) cardStore.put({ key, scope: scopeKey, card: serverCard } satisfies StoredCard);
      else cardStore.delete(key);
      return;
    }

    if (!serverCard || operation.conflict!.reason === 'id_collision') {
      const localRequest = cardStore.get(key) as IDBRequest<StoredCard | undefined>;
      localRequest.onsuccess = () => {
        if (!localRequest.result) return;
        const newCardId = crypto.randomUUID();
        const newKey = recordKey(scope, newCardId);
        const card = { ...localRequest.result.card, id: newCardId, version: 1 };
        cardStore.delete(key);
        cardStore.put({ key: newKey, scope: scopeKey, card } satisfies StoredCard);
        operationStore.delete(key);
        operationStore.put({
          ...operation,
          key: newKey,
          cardId: newCardId,
          operationId: crypto.randomUUID(),
          kind: 'create',
          baseVersion: null,
          conflict: undefined,
        } satisfies StoredCardOperation);
      };
      return;
    }

    operationStore.put({
      ...operation,
      operationId: crypto.randomUUID(),
      baseVersion: serverCard.version,
      conflict: undefined,
    } satisfies StoredCardOperation);
    const localRequest = cardStore.get(key) as IDBRequest<StoredCard | undefined>;
    localRequest.onsuccess = () => {
      if (localRequest.result)
        cardStore.put({ ...localRequest.result, card: { ...localRequest.result.card, version: serverCard.version } } satisfies StoredCard);
    };
  };
  await transactionDone(transaction);
}

function purchaseAsEntry(purchase: OfflinePurchase, installment: OfflinePurchaseInstallment): OfflineEntry {
  return {
    id: installment.id,
    kind: 'expense',
    description: installment.description,
    category_id: installment.category_id,
    category_name: installment.category_name,
    competence_on: installment.invoice_on,
    due_on: installment.due_on,
    planned_cents: installment.planned_cents,
    actual_cents: installment.actual_cents,
    realized_on: installment.realized_on,
    payment_method_id: null,
    payment_method_name: null,
    notes: null,
    created_by_user_id: installment.created_by_user_id,
    updated_by_user_id: installment.updated_by_user_id,
    status: installment.status,
    card_purchase_id: purchase.id,
    installment_number: installment.installment_number,
    installment_count: installment.installment_count,
    version: installment.version,
  };
}

export async function saveOfflinePurchases(scope: OfflineScope, purchases: OfflinePurchase[], now = new Date().toISOString()) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction(['purchases', 'purchaseOperations', 'entries', 'operations', 'metadata'], 'readwrite');
  const purchaseOperationsRequest = transaction.objectStore('purchaseOperations').index('scope').getAll(scopeKey) as IDBRequest<
    StoredPurchaseOperation[]
  >;
  const entryOperationsRequest = transaction.objectStore('operations').index('scope').getAll(scopeKey) as IDBRequest<StoredOperation[]>;
  const cachedPurchasesRequest = transaction.objectStore('purchases').index('scope').getAll(scopeKey) as IDBRequest<StoredPurchase[]>;
  const purchaseStore = transaction.objectStore('purchases');
  const entryStore = transaction.objectStore('entries');
  let completed = 0;
  const save = () => {
    completed += 1;
    if (completed < 3) return;
    const protectedPurchases = new Set(purchaseOperationsRequest.result.map((operation) => operation.purchaseId));
    const protectedEntries = new Set(entryOperationsRequest.result.map((operation) => operation.entryId));
    for (const purchase of purchases) {
      if (protectedPurchases.has(purchase.id)) continue;
      const previous = cachedPurchasesRequest.result.find((record) => record.purchase.id === purchase.id)?.purchase;
      purchaseStore.put({ key: recordKey(scope, purchase.id), scope: scopeKey, purchase } satisfies StoredPurchase);
      const installmentIds = new Set(purchase.installments.map((installment) => installment.id));
      for (const installment of purchase.installments) {
        const entry = purchaseAsEntry(purchase, installment);
        if (!protectedEntries.has(entry.id))
          entryStore.put({ key: recordKey(scope, entry.id), scope: scopeKey, entry, isLocal: false } satisfies StoredEntry);
      }
      for (const installment of previous?.installments ?? []) {
        if (!installmentIds.has(installment.id) && !protectedEntries.has(installment.id))
          entryStore.delete(recordKey(scope, installment.id));
      }
    }
    transaction.objectStore('metadata').put({ key: scopeKey, scope: scopeKey, lastSyncedAt: now } satisfies StoredMetadata);
  };
  purchaseOperationsRequest.onsuccess = save;
  entryOperationsRequest.onsuccess = save;
  cachedPurchasesRequest.onsuccess = save;
  transaction.objectStore('metadata').put({ key: scopeKey, scope: scopeKey, lastSyncedAt: now } satisfies StoredMetadata);
  await transactionDone(transaction);
}

export async function queueOfflinePurchaseChange(
  scope: OfflineScope,
  purchase: OfflinePurchase,
  kind: 'create' | 'update',
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, purchase.id);
  const transaction = database.transaction(['purchases', 'purchaseOperations', 'entries'], 'readwrite');
  const operationStore = transaction.objectStore('purchaseOperations');
  const previousRequest = operationStore.get(key) as IDBRequest<StoredPurchaseOperation | undefined>;
  const previousPurchaseRequest = transaction.objectStore('purchases').get(key) as IDBRequest<StoredPurchase | undefined>;
  let previous: StoredPurchaseOperation | undefined;
  let previousPurchase: StoredPurchase | undefined;
  let reads = 0;
  const apply = () => {
    reads += 1;
    if (reads < 2) return;
    const operationKind = previous?.kind === 'create' ? 'create' : kind;
    operationStore.put({
      key,
      scope: scopeKey,
      userId: scope.userId,
      spaceId: scope.spaceId,
      purchaseId: purchase.id,
      operationId: previous?.operationId ?? crypto.randomUUID(),
      kind: operationKind,
      baseVersion: previous ? previous.baseVersion : operationKind === 'create' ? null : purchase.version,
      payload,
      queuedAt: previous?.queuedAt ?? now,
      ...(previous?.conflict ? { conflict: previous.conflict } : {}),
    } satisfies StoredPurchaseOperation);
    transaction.objectStore('purchases').put({ key, scope: scopeKey, purchase } satisfies StoredPurchase);
    const entries = transaction.objectStore('entries');
    const newIds = new Set(purchase.installments.map((installment) => installment.id));
    for (const installment of previousPurchase?.purchase.installments ?? [])
      if (!newIds.has(installment.id)) entries.delete(recordKey(scope, installment.id));
    for (const installment of purchase.installments) {
      const entry = purchaseAsEntry(purchase, installment);
      entries.put({ key: recordKey(scope, entry.id), scope: scopeKey, entry, isLocal: true } satisfies StoredEntry);
    }
  };
  previousRequest.onsuccess = () => {
    previous = previousRequest.result;
    apply();
  };
  previousPurchaseRequest.onsuccess = () => {
    previousPurchase = previousPurchaseRequest.result;
    apply();
  };
  await transactionDone(transaction);
}

export async function queueOfflinePurchaseDelete(scope: OfflineScope, purchase: OfflinePurchase, now = new Date().toISOString()) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, purchase.id);
  const transaction = database.transaction(['purchases', 'purchaseOperations', 'entries'], 'readwrite');
  const operations = transaction.objectStore('purchaseOperations');
  const previousRequest = operations.get(key) as IDBRequest<StoredPurchaseOperation | undefined>;
  previousRequest.onsuccess = () => {
    const previous = previousRequest.result;
    const entries = transaction.objectStore('entries');
    if (previous?.kind === 'create') {
      operations.delete(key);
      transaction.objectStore('purchases').delete(key);
      for (const installment of purchase.installments) entries.delete(recordKey(scope, installment.id));
      return;
    }
    const kept = purchase.installments.filter((installment) => installment.actual_cents !== null);
    for (const installment of purchase.installments)
      if (installment.actual_cents === null) entries.delete(recordKey(scope, installment.id));
    const canceled = { ...purchase, canceled_at: now, installments: kept };
    operations.put({
      key,
      scope: scopeKey,
      userId: scope.userId,
      spaceId: scope.spaceId,
      purchaseId: purchase.id,
      operationId: previous?.operationId ?? crypto.randomUUID(),
      kind: 'delete',
      baseVersion: previous?.baseVersion ?? purchase.version,
      payload: null,
      queuedAt: previous?.queuedAt ?? now,
    } satisfies StoredPurchaseOperation);
    transaction.objectStore('purchases').put({ key, scope: scopeKey, purchase: canceled } satisfies StoredPurchase);
  };
  await transactionDone(transaction);
}

export async function markOfflinePurchaseConflict(
  scope: OfflineScope,
  sentOperation: OfflinePurchaseOperation,
  conflict: NonNullable<OfflinePurchaseOperation['conflict']>,
) {
  const database = await openDatabase();
  const transaction = database.transaction(['purchaseOperations'], 'readwrite');
  const store = transaction.objectStore('purchaseOperations');
  const request = store.get(recordKey(scope, sentOperation.purchaseId)) as IDBRequest<StoredPurchaseOperation | undefined>;
  request.onsuccess = () => {
    const current = request.result;
    if (current?.operationId === sentOperation.operationId && current.baseVersion === sentOperation.baseVersion)
      store.put({ ...current, conflict } satisfies StoredPurchaseOperation);
  };
  await transactionDone(transaction);
}

export async function acknowledgeOfflinePurchaseOperation(
  scope: OfflineScope,
  sentOperation: OfflinePurchaseOperation,
  result: { purchase?: OfflinePurchase },
) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, sentOperation.purchaseId);
  const transaction = database.transaction(['purchases', 'purchaseOperations', 'entries', 'metadata'], 'readwrite');
  const operationStore = transaction.objectStore('purchaseOperations');
  const purchaseStore = transaction.objectStore('purchases');
  const currentRequest = operationStore.get(key) as IDBRequest<StoredPurchaseOperation | undefined>;
  const localRequest = purchaseStore.get(key) as IDBRequest<StoredPurchase | undefined>;
  let current: StoredPurchaseOperation | undefined;
  let local: StoredPurchase | undefined;
  let reads = 0;
  const finish = () => {
    reads += 1;
    if (reads < 2 || current?.operationId !== sentOperation.operationId) return;
    const unchanged =
      current.kind === sentOperation.kind &&
      current.baseVersion === sentOperation.baseVersion &&
      JSON.stringify(current.payload) === JSON.stringify(sentOperation.payload);
    if (unchanged) operationStore.delete(key);
    else if (result.purchase) {
      if (current.kind === 'create') current.kind = 'update';
      current.baseVersion = result.purchase.version;
      current.operationId = crypto.randomUUID();
      delete current.conflict;
      operationStore.put(current);
    }
    if (result.purchase) {
      const purchase = unchanged || !local ? result.purchase : { ...local.purchase, version: result.purchase.version };
      purchaseStore.put({ key, scope: scopeKey, purchase } satisfies StoredPurchase);
      const entryStore = transaction.objectStore('entries');
      for (const installment of result.purchase.installments) {
        const localInstallment = purchase.installments.find((item) => item.id === installment.id);
        const saved = localInstallment && !unchanged ? localInstallment : installment;
        const entry = purchaseAsEntry(purchase, saved);
        entryStore.put({ key: recordKey(scope, entry.id), scope: scopeKey, entry, isLocal: !unchanged } satisfies StoredEntry);
      }
    }
    transaction
      .objectStore('metadata')
      .put({ key: scopeKey, scope: scopeKey, lastSyncedAt: new Date().toISOString() } satisfies StoredMetadata);
  };
  currentRequest.onsuccess = () => {
    current = currentRequest.result;
    finish();
  };
  localRequest.onsuccess = () => {
    local = localRequest.result;
    finish();
  };
  await transactionDone(transaction);
}

export async function resolveOfflinePurchaseConflict(scope: OfflineScope, operationId: string, choice: 'local' | 'server') {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction(['purchases', 'purchaseOperations', 'entries'], 'readwrite');
  const purchaseStore = transaction.objectStore('purchases');
  const operationStore = transaction.objectStore('purchaseOperations');
  const request = operationStore.index('scope').getAll(scopeKey) as IDBRequest<StoredPurchaseOperation[]>;
  request.onsuccess = () => {
    const operation = request.result.find((item) => item.operationId === operationId && item.conflict);
    if (!operation) return;
    const key = recordKey(scope, operation.purchaseId);
    const serverPurchase = operation.conflict!.serverPurchase;
    const localRequest = purchaseStore.get(key) as IDBRequest<StoredPurchase | undefined>;
    localRequest.onsuccess = () => {
      const local = localRequest.result?.purchase;
      if (choice === 'server') {
        operationStore.delete(key);
        const entries = transaction.objectStore('entries');
        for (const installment of local?.installments ?? []) entries.delete(recordKey(scope, installment.id));
        if (serverPurchase) {
          purchaseStore.put({ key, scope: scopeKey, purchase: serverPurchase } satisfies StoredPurchase);
          for (const installment of serverPurchase.installments) {
            const entry = purchaseAsEntry(serverPurchase, installment);
            entries.put({ key: recordKey(scope, entry.id), scope: scopeKey, entry, isLocal: false } satisfies StoredEntry);
          }
        } else purchaseStore.delete(key);
        return;
      }
      if (!local) return;
      if (operation.kind === 'delete' && !serverPurchase) {
        operationStore.delete(key);
        purchaseStore.delete(key);
        for (const installment of local.installments) transaction.objectStore('entries').delete(recordKey(scope, installment.id));
        return;
      }
      const recreateLocal =
        !serverPurchase ||
        operation.conflict!.reason === 'id_collision' ||
        (operation.conflict!.reason === 'server_deleted' && operation.kind !== 'delete');
      if (recreateLocal) {
        const newId = crypto.randomUUID();
        const purchase = {
          ...local,
          id: newId,
          version: 1,
          installments: local.installments.map((item) => ({ ...item, id: crypto.randomUUID(), version: 1 })),
        };
        const payload = operation.payload as { purchase: Record<string, unknown>; installments: Array<Record<string, unknown>> } | null;
        if (payload)
          payload.installments = payload.installments.map((item) => ({
            ...item,
            id:
              purchase.installments.find((installment) => installment.installment_number === Number(item.installmentNumber))?.id ??
              crypto.randomUUID(),
          }));
        purchaseStore.delete(key);
        operationStore.delete(key);
        purchaseStore.put({ key: recordKey(scope, newId), scope: scopeKey, purchase } satisfies StoredPurchase);
        operationStore.put({
          ...operation,
          key: recordKey(scope, newId),
          purchaseId: newId,
          operationId: crypto.randomUUID(),
          kind: 'create',
          baseVersion: null,
          payload,
          conflict: undefined,
        } satisfies StoredPurchaseOperation);
        const entries = transaction.objectStore('entries');
        for (const installment of local.installments) entries.delete(recordKey(scope, installment.id));
        for (const installment of purchase.installments) {
          const entry = purchaseAsEntry(purchase, installment);
          entries.put({ key: recordKey(scope, entry.id), scope: scopeKey, entry, isLocal: true } satisfies StoredEntry);
        }
        return;
      }
      operationStore.put({
        ...operation,
        operationId: crypto.randomUUID(),
        baseVersion: serverPurchase.version,
        conflict: undefined,
      } satisfies StoredPurchaseOperation);
      purchaseStore.put({ key, scope: scopeKey, purchase: { ...local, version: serverPurchase.version } } satisfies StoredPurchase);
    };
  };
  await transactionDone(transaction);
}

function offlineInvoiceKey(cardId: string, invoiceMonth: string) {
  return `${cardId}:${invoiceMonth.slice(0, 7)}`;
}

function optimisticallyApplyInvoice(
  invoice: OfflineInvoice,
  kind: 'pay' | 'reverse',
  payload: Record<string, unknown> | null,
): OfflineInvoice {
  if (kind === 'reverse')
    return {
      ...invoice,
      status: 'open',
      payment_status: 'open',
      actual_cents: null,
      paid_on: null,
      payment_method_id: null,
      payment_method_name: null,
      entries: invoice.entries.map((entry) => ({ ...entry, actual_cents: null, realized_on: null })),
    };
  const actualCents = String(payload?.actualCents ?? invoice.planned_cents);
  const plannedTotal = invoice.entries.reduce((sum, entry) => sum + BigInt(entry.planned_cents), 0n);
  const actualTotal = BigInt(actualCents);
  let allocated = 0n;
  const entries = invoice.entries.map((entry, index) => {
    const share =
      index === invoice.entries.length - 1 ? actualTotal - allocated : (actualTotal * BigInt(entry.planned_cents)) / plannedTotal;
    allocated += share;
    return { ...entry, actual_cents: share.toString(), realized_on: String(payload?.paidOn ?? '') };
  });
  return {
    ...invoice,
    status: 'paid',
    payment_status: 'paid',
    actual_cents: actualCents,
    paid_on: String(payload?.paidOn ?? ''),
    payment_method_id: typeof payload?.paymentMethodId === 'string' ? payload.paymentMethodId : null,
    payment_method_name: typeof payload?.paymentMethodName === 'string' ? payload.paymentMethodName : null,
    entries,
  };
}

export async function saveOfflineInvoices(scope: OfflineScope, invoices: OfflineInvoice[], now = new Date().toISOString()) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction(['cardInvoices', 'invoiceOperations', 'metadata'], 'readwrite');
  const invoiceStore = transaction.objectStore('cardInvoices');
  const operationRequest = transaction.objectStore('invoiceOperations').index('scope').getAll(scopeKey) as IDBRequest<
    StoredInvoiceOperation[]
  >;
  const cachedRequest = invoiceStore.index('scope').getAll(scopeKey) as IDBRequest<StoredInvoice[]>;
  let reads = 0;
  const save = () => {
    reads += 1;
    if (reads < 2) return;
    const pending = new Set(operationRequest.result.map((operation) => offlineInvoiceKey(operation.cardId, operation.invoiceMonth)));
    const responseKeys = new Set(invoices.map((invoice) => offlineInvoiceKey(invoice.card_id, invoice.invoice_month)));
    for (const previous of cachedRequest.result) {
      const key = offlineInvoiceKey(previous.invoice.card_id, previous.invoice.invoice_month);
      if (!pending.has(key) && !responseKeys.has(key)) invoiceStore.delete(previous.key);
    }
    for (const invoice of invoices) {
      if (!pending.has(offlineInvoiceKey(invoice.card_id, invoice.invoice_month))) {
        invoiceStore.put({
          key: recordKey(scope, offlineInvoiceKey(invoice.card_id, invoice.invoice_month)),
          scope: scopeKey,
          invoice,
        } satisfies StoredInvoice);
      }
    }
    transaction.objectStore('metadata').put({ key: scopeKey, scope: scopeKey, lastSyncedAt: now } satisfies StoredMetadata);
  };
  operationRequest.onsuccess = save;
  cachedRequest.onsuccess = save;
  await transactionDone(transaction);
}

export async function queueOfflineInvoiceChange(
  scope: OfflineScope,
  invoice: OfflineInvoice,
  kind: 'pay' | 'reverse',
  payload: Record<string, unknown> | null,
  now = new Date().toISOString(),
) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const invoiceId = offlineInvoiceKey(invoice.card_id, invoice.invoice_month);
  const key = recordKey(scope, invoiceId);
  const transaction = database.transaction(['cardInvoices', 'invoiceOperations'], 'readwrite');
  const operationStore = transaction.objectStore('invoiceOperations');
  const previousRequest = operationStore.get(key) as IDBRequest<StoredInvoiceOperation | undefined>;
  previousRequest.onsuccess = () => {
    const previous = previousRequest.result;
    operationStore.put({
      key,
      scope: scopeKey,
      userId: scope.userId,
      spaceId: scope.spaceId,
      cardId: invoice.card_id,
      invoiceMonth: invoice.invoice_month.slice(0, 7),
      operationId: previous?.operationId ?? crypto.randomUUID(),
      kind,
      baseVersion: previous?.baseVersion ?? invoice.version,
      payload,
      queuedAt: previous?.queuedAt ?? now,
    } satisfies StoredInvoiceOperation);
    transaction.objectStore('cardInvoices').put({
      key,
      scope: scopeKey,
      invoice: optimisticallyApplyInvoice(invoice, kind, payload),
    } satisfies StoredInvoice);
  };
  await transactionDone(transaction);
}

export async function markOfflineInvoiceConflict(
  scope: OfflineScope,
  sentOperation: OfflineInvoiceOperation,
  conflict: NonNullable<OfflineInvoiceOperation['conflict']>,
) {
  const database = await openDatabase();
  const transaction = database.transaction(['invoiceOperations'], 'readwrite');
  const store = transaction.objectStore('invoiceOperations');
  const request = store.get(recordKey(scope, offlineInvoiceKey(sentOperation.cardId, sentOperation.invoiceMonth))) as IDBRequest<
    StoredInvoiceOperation | undefined
  >;
  request.onsuccess = () => {
    const current = request.result;
    if (current?.operationId === sentOperation.operationId && current.baseVersion === sentOperation.baseVersion)
      store.put({ ...current, conflict } satisfies StoredInvoiceOperation);
  };
  await transactionDone(transaction);
}

export async function acknowledgeOfflineInvoiceOperation(
  scope: OfflineScope,
  sentOperation: OfflineInvoiceOperation,
  result: { invoice?: OfflineInvoice },
) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const key = recordKey(scope, offlineInvoiceKey(sentOperation.cardId, sentOperation.invoiceMonth));
  const transaction = database.transaction(['cardInvoices', 'invoiceOperations', 'metadata'], 'readwrite');
  const operationStore = transaction.objectStore('invoiceOperations');
  const invoiceStore = transaction.objectStore('cardInvoices');
  const currentRequest = operationStore.get(key) as IDBRequest<StoredInvoiceOperation | undefined>;
  const localRequest = invoiceStore.get(key) as IDBRequest<StoredInvoice | undefined>;
  let current: StoredInvoiceOperation | undefined;
  let local: StoredInvoice | undefined;
  let reads = 0;
  const finish = () => {
    reads += 1;
    if (reads < 2 || current?.operationId !== sentOperation.operationId) return;
    const unchanged =
      current.kind === sentOperation.kind &&
      current.baseVersion === sentOperation.baseVersion &&
      JSON.stringify(current.payload) === JSON.stringify(sentOperation.payload);
    if (unchanged) operationStore.delete(key);
    else if (result.invoice) {
      current.baseVersion = result.invoice.version;
      current.operationId = crypto.randomUUID();
      delete current.conflict;
      operationStore.put(current);
    }
    if (result.invoice)
      invoiceStore.put({
        key,
        scope: scopeKey,
        invoice: unchanged || !local ? result.invoice : { ...local.invoice, version: result.invoice.version },
      } satisfies StoredInvoice);
    transaction
      .objectStore('metadata')
      .put({ key: scopeKey, scope: scopeKey, lastSyncedAt: new Date().toISOString() } satisfies StoredMetadata);
  };
  currentRequest.onsuccess = () => {
    current = currentRequest.result;
    finish();
  };
  localRequest.onsuccess = () => {
    local = localRequest.result;
    finish();
  };
  await transactionDone(transaction);
}

export async function resolveOfflineInvoiceConflict(scope: OfflineScope, operationId: string, choice: 'local' | 'server') {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction(['cardInvoices', 'invoiceOperations'], 'readwrite');
  const invoiceStore = transaction.objectStore('cardInvoices');
  const operationStore = transaction.objectStore('invoiceOperations');
  const request = operationStore.index('scope').getAll(scopeKey) as IDBRequest<StoredInvoiceOperation[]>;
  request.onsuccess = () => {
    const operation = request.result.find((item) => item.operationId === operationId && item.conflict);
    if (!operation) return;
    const key = recordKey(scope, offlineInvoiceKey(operation.cardId, operation.invoiceMonth));
    const serverInvoice = operation.conflict!.serverInvoice;
    if (choice === 'server') {
      operationStore.delete(key);
      if (serverInvoice) invoiceStore.put({ key, scope: scopeKey, invoice: serverInvoice } satisfies StoredInvoice);
      else invoiceStore.delete(key);
      return;
    }
    if (!serverInvoice) return;
    if (operation.kind === 'pay' && serverInvoice.payment_status === 'paid')
      operation.payload = { ...operation.payload, replacePaid: true };
    operationStore.put({
      ...operation,
      operationId: crypto.randomUUID(),
      baseVersion: serverInvoice.version,
      conflict: undefined,
    } satisfies StoredInvoiceOperation);
    const localRequest = invoiceStore.get(key) as IDBRequest<StoredInvoice | undefined>;
    localRequest.onsuccess = () => {
      if (localRequest.result)
        invoiceStore.put({
          ...localRequest.result,
          invoice: { ...localRequest.result.invoice, version: serverInvoice.version },
        } satisfies StoredInvoice);
    };
  };
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

export async function queueOfflineEntryChange(
  scope: OfflineScope,
  entry: OfflineEntry,
  kind: Exclude<OfflineOperationKind, 'delete'>,
  now = new Date().toISOString(),
) {
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
      baseVersion: prior ? prior.baseVersion : operationKind === 'create' ? null : (entry.version ?? 1),
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
    else
      operationStore.put({
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
    if (current?.operationId === sentOperation.operationId && current.baseVersion === sentOperation.baseVersion)
      store.put({ ...current, conflict } satisfies StoredOperation);
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
    const unchanged =
      currentOperation.kind === sentOperation.kind &&
      currentOperation.baseVersion === sentOperation.baseVersion &&
      JSON.stringify(currentOperation.payload) === JSON.stringify(sentOperation.payload);

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
      if (localEntry)
        entryStore.put({
          ...localEntry,
          entry: { ...localEntry.entry, version: result.entry.version ?? 1 },
          isLocal: true,
        } satisfies StoredEntry);
    } else if (result.deleted && currentOperation.kind === 'delete') {
      operationStore.delete(key);
      entryStore.delete(key);
    } else if (result.deleted && localEntry) {
      const newEntryId = crypto.randomUUID();
      const newKey = recordKey(scope, newEntryId);
      entryStore.delete(key);
      entryStore.put({
        ...localEntry,
        key: newKey,
        entry: { ...localEntry.entry, id: newEntryId, version: undefined },
        isLocal: true,
      } satisfies StoredEntry);
      operationStore.delete(key);
      operationStore.put({
        ...currentOperation,
        key: newKey,
        entryId: newEntryId,
        operationId: crypto.randomUUID(),
        kind: 'create',
        baseVersion: null,
        conflict: undefined,
      } satisfies StoredOperation);
    }
    transaction
      .objectStore('metadata')
      .put({ key: scopeKey, scope: scopeKey, lastSyncedAt: new Date().toISOString() } satisfies StoredMetadata);
  };
  currentRequest.onsuccess = () => {
    currentOperation = currentRequest.result;
    finish();
  };
  localEntryRequest.onsuccess = () => {
    localEntry = localEntryRequest.result;
    finish();
  };
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
      operationStore.put({
        ...operation,
        operationId: crypto.randomUUID(),
        kind: 'update',
        baseVersion: serverEntry.version ?? 1,
        conflict: undefined,
      } satisfies StoredOperation);
      const localRequest = entryStore.get(key) as IDBRequest<StoredEntry | undefined>;
      localRequest.onsuccess = () => {
        if (localRequest.result)
          entryStore.put({
            ...localRequest.result,
            entry: { ...localRequest.result.entry, version: serverEntry.version ?? 1 },
            isLocal: true,
          } satisfies StoredEntry);
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
        operationStore.put({
          ...operation,
          key: newKey,
          entryId: newEntryId,
          operationId: crypto.randomUUID(),
          kind: 'create',
          baseVersion: null,
          conflict: undefined,
        } satisfies StoredOperation);
      };
      return;
    }
    operationStore.put({
      ...operation,
      operationId: crypto.randomUUID(),
      baseVersion: serverEntry.version ?? 1,
      conflict: undefined,
    } satisfies StoredOperation);
    if (operation.kind !== 'delete') {
      const localRequest = entryStore.get(key) as IDBRequest<StoredEntry | undefined>;
      localRequest.onsuccess = () => {
        if (localRequest.result)
          entryStore.put({
            ...localRequest.result,
            entry: { ...localRequest.result.entry, version: serverEntry.version ?? 1 },
            isLocal: true,
          } satisfies StoredEntry);
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
  const session = await requestValue(
    transaction.objectStore('metadata').get(deviceSessionKey) as IDBRequest<StoredDeviceSession | undefined>,
  );
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
  const snapshot = await requestValue(
    transaction.objectStore('snapshots').get(recordKey(scope, path)) as IDBRequest<StoredSnapshot | undefined>,
  );
  await done;
  return snapshot ? (snapshot.data as T) : null;
}

export async function clearOfflineWorkspace(scope: OfflineScope) {
  const database = await openDatabase();
  const scopeKey = offlineScopeKey(scope);
  const transaction = database.transaction([...storeNames], 'readwrite');
  const done = transactionDone(transaction);
  const scopedStores: StoreName[] = [
    'entries',
    'operations',
    'snapshots',
    'creditCards',
    'cardOperations',
    'purchases',
    'purchaseOperations',
    'cardInvoices',
    'invoiceOperations',
  ];
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
  transaction.objectStore('cardMembers').delete(scopeKey);
  const metadata = transaction.objectStore('metadata');
  metadata.delete(scopeKey);
  const rememberedUser = metadata.get(deviceSessionKey) as IDBRequest<StoredDeviceSession | undefined>;
  rememberedUser.onsuccess = () => {
    if (rememberedUser.result?.user.id === scope.userId && rememberedUser.result.user.spaceId === scope.spaceId)
      metadata.delete(deviceSessionKey);
  };
  await Promise.all([...deletes, done]);
}
