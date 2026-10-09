import { useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Download, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../auth/auth-gate';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState, LoadingState } from '../components/ui/feedback';
import { FormField, Input } from '../components/ui/input';
import {
  currentBrazilianDate,
  currentMonthInputValue,
  formatBrazilianAmount,
  formatBrazilianDate,
  formatBrazilianMonth,
  parseBrazilianCents,
  parseBrazilianDate,
} from '../lib/finance';
import { downloadCsv, entriesCsvFilename, serializeEntriesCsv } from '../lib/csv-export';
import {
  filterOfflineEntries,
  isAuthenticationFailure,
  isNetworkFailure,
  makeOfflineEntry,
  mergeOfflineEntries,
  useOfflineWorkspace,
} from '../offline/offline-context';
import type { OfflineEntry, OfflineWorkspaceSnapshot } from '../offline/offline-store';
import { PageHeader } from './page-header';
import { MoneyValue } from '../components/ui/money-value';
import { Select, Textarea, RadioGroup, DateField, MonthField, MoneyInput } from '../components/ui/form-controls';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import { Alert } from '../components/ui/alert';
import { ActionToolbar } from '../components/finance/action-toolbar';
import { EntryAmount, EntryList, EntryRow } from '../components/finance/entry-row';
import { FilterBar } from '../components/finance/filter-bar';
import { ListSkeleton } from '../components/ui/skeleton';
import { toast } from '../components/ui/toast-store';

type EntryKind = 'income' | 'expense' | 'investment';
type EntryStatus = 'pending' | 'late' | 'paid';
type Category = { id: string; name: string; kind: EntryKind; expense_class: 'fixed' | 'variable' | null; archived_at: string | null };
type PaymentMethod = { id: string; name: string; archived_at: string | null };
type Entry = OfflineEntry;

type ApiResponse = {
  error?: string;
  entries?: Entry[];
  entry?: Entry;
  categories?: Category[];
  paymentMethods?: PaymentMethod[];
  conflict?: boolean;
  serverEntry?: Entry | null;
};
const kindLabels: Record<EntryKind, string> = { income: 'Receita', expense: 'Despesa', investment: 'Aporte' };
const statusLabels: Record<EntryStatus, string> = { pending: 'Em aberto', late: 'Atrasado', paid: 'Pago' };
const emptyOfflineSnapshot: OfflineWorkspaceSnapshot = {
  entries: [],
  categories: [],
  paymentMethods: [],
  cards: [],
  cardMembers: [],
  operations: [],
  cardOperations: [],
  purchases: [],
  purchaseOperations: [],
  invoices: [],
  invoiceOperations: [],
  lastSyncedAt: null,
};

async function readApi(response: Response): Promise<ApiResponse> {
  if (response.status === 204) return {};
  return response.json() as Promise<ApiResponse>;
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <FormField id={id} label={label}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </FormField>
  );
}

const kindOptions = [
  ['income', 'Receita'],
  ['expense', 'Despesa'],
  ['investment', 'Aporte'],
] as const;

function EntryActions({
  entry,
  busy,
  confirmationBlocked,
  syncing,
  conflict,
  onConfirm,
  onUndo,
  onDelete,
}: {
  entry: Entry;
  busy: boolean;
  confirmationBlocked: boolean;
  syncing: boolean;
  conflict: boolean;
  onConfirm: () => void;
  onUndo: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      {entry.actual_cents === null ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || confirmationBlocked}
          aria-label={`Confirmar ${entry.description}`}
          onClick={onConfirm}
        >
          <CalendarDays aria-hidden="true" className="size-4" />
          Confirmar
        </Button>
      ) : entry.card_purchase_id ? (
        <span className="self-center px-2 text-xs text-muted-foreground">Parcela paga</span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy || confirmationBlocked}
          aria-label={`Desfazer confirmação ${entry.description}`}
          onClick={onUndo}
        >
          Desfazer confirmação
        </Button>
      )}
      {entry.card_purchase_id ? (
        <Button asChild size="sm" variant="ghost">
          <Link to="/compras">Gerenciar compra</Link>
        </Button>
      ) : conflict ? (
        <Button type="button" size="sm" variant="ghost" disabled aria-label={`Editar ${entry.description}`}>
          <Pencil aria-hidden="true" className="size-4" />
          Editar
        </Button>
      ) : (
        <Button asChild size="sm" variant="ghost">
          <Link aria-label={`Editar ${entry.description}`} to={`/lancamentos/${entry.id}/editar`}>
            <Pencil aria-hidden="true" className="size-4" />
            Editar
          </Link>
        </Button>
      )}
      {!entry.card_purchase_id && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy || syncing || conflict}
          aria-label={`Excluir ${entry.description}`}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Excluir
        </Button>
      )}
    </>
  );
}

export function TransactionsPage() {
  const [confirm, confirmDialog] = useConfirmDialog();
  const auth = useContext(AuthContext);
  const offline = useOfflineWorkspace();
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const offlineOperationKey =
    offline?.operations.map((operation) => `${operation.operationId}:${operation.conflict?.reason ?? ''}`).join('|') ?? '';
  const [month, setMonth] = useState(currentMonthInputValue());
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [loading, setLoading] = useState(true);
  const [busyEntryId, setBusyEntryId] = useState('');
  const [confirmingEntryId, setConfirmingEntryId] = useState('');
  const [actualAmount, setActualAmount] = useState('');
  const [actualDate, setActualDate] = useState(() => currentBrazilianDate());
  const [error, setError] = useState('');

  const selectedFiltersRef = useRef('');
  selectedFiltersRef.current = `${month}|${categoryId}|${status}`;
  const loadEntries = useCallback(async () => {
    const filtersKey = `${month}|${categoryId}|${status}`;
    // Uma resposta lenta de filtros anteriores não pode substituir a lista dos filtros atuais.
    const superseded = () => selectedFiltersRef.current !== filtersKey;
    setLoading(true);
    setError('');
    const currentOffline = offlineRef.current;
    const filters = { month, categoryId, status };
    if (currentOffline && !currentOffline.online) {
      setEntries(filterOfflineEntries(currentOffline.entries, filters));
      setLoading(false);
      return;
    }
    try {
      const query = new URLSearchParams();
      if (month) query.set('month', month);
      if (categoryId) query.set('categoryId', categoryId);
      if (status) query.set('status', status);
      const response = await fetch(`/api/entries?${query.toString()}`, { credentials: 'same-origin' });
      const result = await readApi(response);
      if (superseded()) return;
      if (!response.ok) {
        if (currentOffline && isAuthenticationFailure(response)) currentOffline.invalidateSession();
        throw new Error(result.error ?? 'Não foi possível carregar os lançamentos.');
      }
      const serverEntries = result.entries ?? [];
      await currentOffline?.cacheEntries(serverEntries);
      if (superseded()) return;
      if (currentOffline) currentOffline.setOnline(true);
      setEntries(mergeOfflineEntries(serverEntries, currentOffline ?? emptyOfflineSnapshot, filters, false));
    } catch (loadError) {
      if (currentOffline && currentOffline.supported && isNetworkFailure(loadError, currentOffline.online)) {
        currentOffline.setOnline(navigator.onLine && !(loadError instanceof TypeError));
        const snapshot = await currentOffline.refresh();
        if (superseded()) return;
        setEntries(filterOfflineEntries(snapshot.entries, filters));
        if (!snapshot.entries.length) setError('Ainda não há lançamentos salvos neste aparelho. Conecte-se uma vez para carregá-los.');
      } else {
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os lançamentos.');
      }
    } finally {
      if (!superseded()) setLoading(false);
    }
  }, [month, categoryId, status]);

  useEffect(() => {
    let active = true;
    const currentOffline = offlineRef.current;
    async function loadCategories() {
      if (currentOffline && !currentOffline.online) {
        setCategories(currentOffline.categories);
        return;
      }
      try {
        const response = await fetch('/api/catalog/categories?includeArchived=true', { credentials: 'same-origin' });
        const result = await readApi(response);
        if (!response.ok) {
          if (currentOffline && isAuthenticationFailure(response)) currentOffline.invalidateSession();
          throw new Error(result.error ?? 'Não foi possível carregar as categorias para os filtros.');
        }
        const loadedCategories = result.categories ?? [];
        if (active) setCategories(loadedCategories);
        await currentOffline?.cacheCatalogs(loadedCategories, currentOffline.paymentMethods);
        currentOffline?.setOnline(true);
      } catch (loadError) {
        if (currentOffline && currentOffline.supported && isNetworkFailure(loadError, currentOffline.online)) {
          currentOffline.setOnline(navigator.onLine && !(loadError instanceof TypeError));
          const snapshot = await currentOffline.refresh();
          if (active) setCategories(snapshot.categories);
        } else if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as categorias para os filtros.');
        }
      }
    }
    void loadCategories();
    return () => {
      active = false;
    };
  }, [offline?.online, offline?.ready]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries, offline?.online, offline?.pendingCount, offline?.ready, offlineOperationKey]);

  async function deleteEntry(entry: Entry) {
    if (
      !(await confirm({
        title: `Excluir “${entry.description}”?`,
        description: 'Esta ação não pode ser desfeita.',
        confirmLabel: 'Excluir lançamento',
        destructive: true,
      }))
    )
      return;
    setBusyEntryId(entry.id);
    setError('');
    const currentOffline = offlineRef.current;
    const queueDelete = async () => {
      if (!currentOffline?.supported) throw new Error('O armazenamento offline não está disponível neste navegador.');
      await currentOffline.queueDelete(entry);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      toast('Exclusão salva neste aparelho. Ela será sincronizada quando a conexão voltar.');
    };
    try {
      if (currentOffline && (!currentOffline.online || currentOffline.pendingCount > 0)) {
        await queueDelete();
        return;
      }
      const response = await fetch(`/api/entries/${entry.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': auth?.csrfToken ?? '', 'X-Entry-Version': String(entry.version ?? 1) },
      });
      const result = await readApi(response);
      if (!response.ok) {
        if (currentOffline && isAuthenticationFailure(response)) currentOffline.invalidateSession();
        if (response.status === 409 && result.conflict && currentOffline?.supported) {
          await queueDelete();
          return;
        }
        throw new Error(result.error ?? 'Não foi possível excluir o lançamento.');
      }
      await currentOffline?.removeCachedEntry(entry.id);
      currentOffline?.setOnline(true);
      await loadEntries();
      // Sem desfazer: recriar o lançamento geraria outro registro e perderia a autoria e o histórico do original.
      toast('Lançamento excluído.');
    } catch (deleteError) {
      if (currentOffline && currentOffline.supported && isNetworkFailure(deleteError, currentOffline.online)) {
        currentOffline.setOnline(navigator.onLine && !(deleteError instanceof TypeError));
        try {
          await queueDelete();
        } catch (queueError) {
          setError(queueError instanceof Error ? queueError.message : 'Não foi possível guardar a exclusão offline.');
        }
      } else {
        setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir o lançamento.');
      }
    } finally {
      setBusyEntryId('');
    }
  }

  function startConfirmation(entry: Entry) {
    setConfirmingEntryId(entry.id);
    setActualAmount(formatBrazilianAmount(entry.planned_cents));
    setActualDate(currentBrazilianDate());
    setError('');
  }

  async function confirmEntry(event: FormEvent<HTMLFormElement>, entry: Entry) {
    event.preventDefault();
    setError('');
    const actualCents = parseBrazilianCents(actualAmount, true);
    if (actualCents === null) {
      setError('Informe um valor realizado em reais, com até duas casas decimais.');
      return;
    }
    const realizedOn = parseBrazilianDate(actualDate);
    if (!realizedOn) {
      setError('Informe a data de realização no formato DD/MM/AAAA.');
      return;
    }
    setBusyEntryId(entry.id);
    try {
      const response = await fetch(`/api/entries/${entry.id}/confirm`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': auth?.csrfToken ?? '',
          'X-Entry-Version': String(entry.version ?? 1),
        },
        body: JSON.stringify({ actualCents, realizedOn }),
      });
      const result = await readApi(response);
      if (!response.ok) {
        if (offlineRef.current && isAuthenticationFailure(response)) offlineRef.current.invalidateSession();
        throw new Error(result.error ?? 'Não foi possível confirmar o lançamento.');
      }
      setConfirmingEntryId('');
      await loadEntries();
      toast('Lançamento confirmado.', {
        action: { label: 'Desfazer', onClick: () => void undoConfirmationRequest(entry, 'A confirmação foi desfeita.') },
      });
    } catch (confirmationError) {
      if (offlineRef.current && confirmationError instanceof TypeError) offlineRef.current.setOnline(false);
      setError(confirmationError instanceof Error ? confirmationError.message : 'Não foi possível confirmar o lançamento.');
    } finally {
      setBusyEntryId('');
    }
  }

  /** Desfaz a confirmação no servidor e recarrega a lista; usa a versão mais recente do lançamento. */
  async function undoConfirmationRequest(entry: Entry, successMessage: string) {
    const latest = entriesRef.current.find((item) => item.id === entry.id) ?? entry;
    setBusyEntryId(entry.id);
    setError('');
    try {
      const response = await fetch(`/api/entries/${entry.id}/confirm`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': auth?.csrfToken ?? '', 'X-Entry-Version': String(latest.version ?? 1) },
      });
      const result = await readApi(response);
      if (!response.ok) {
        if (offlineRef.current && isAuthenticationFailure(response)) offlineRef.current.invalidateSession();
        throw new Error(result.error ?? 'Não foi possível desfazer a confirmação.');
      }
      await loadEntries();
      toast(successMessage);
    } catch (undoError) {
      if (offlineRef.current && undoError instanceof TypeError) offlineRef.current.setOnline(false);
      setError(undoError instanceof Error ? undoError.message : 'Não foi possível desfazer a confirmação.');
    } finally {
      setBusyEntryId('');
    }
  }

  async function undoConfirmation(entry: Entry) {
    if (
      !(await confirm({
        title: `Desfazer a confirmação de “${entry.description}”?`,
        description: 'O lançamento voltará a ficar em aberto ou atrasado.',
        confirmLabel: 'Desfazer confirmação',
        cancelLabel: 'Manter confirmação',
      }))
    )
      return;
    await undoConfirmationRequest(entry, 'A confirmação foi desfeita.');
  }

  const confirmationBlocked = Boolean(offline && (!offline.online || offline.pendingCount > 0 || offline.syncing));

  return (
    <>
      {confirmDialog}
      <PageHeader
        eyebrow="Movimentações"
        title="Lançamentos"
        description="Acompanhe receitas, despesas e aportes do espaço compartilhado."
        action={
          <ActionToolbar>
            <Button
              type="button"
              variant="outline"
              disabled={loading || entries.length === 0}
              onClick={() => downloadCsv(serializeEntriesCsv(entries), entriesCsvFilename(month))}
            >
              <Download aria-hidden="true" className="size-4" />
              Exportar CSV
            </Button>
            <Button asChild variant="outline">
              <Link to="/importar">
                <Upload aria-hidden="true" className="size-4" />
                Importar planilha
              </Link>
            </Button>
            <Button asChild>
              <Link to="/lancamentos/novo">
                <Plus aria-hidden="true" className="size-4" />
                Adicionar lançamento
              </Link>
            </Button>
          </ActionToolbar>
        }
      />
      {error && <Alert className="mb-4">{error}</Alert>}
      <section className="grid gap-4">
        <FilterBar title="Filtrar lançamentos" description="Escolha competência, categoria ou situação.">
          <FormField id="entries-month" label="Competência">
            <MonthField value={month} onChange={setMonth} />
          </FormField>
          <SelectField id="entries-category" label="Categoria" value={categoryId} onChange={setCategoryId}>
            <option value="">Todas as categorias</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.archived_at ? ' (arquivada)' : ''}
              </option>
            ))}
          </SelectField>
          <SelectField id="entries-status" label="Situação" value={status} onChange={setStatus}>
            <option value="">Todas as situações</option>
            <option value="pending">Em aberto</option>
            <option value="late">Atrasado</option>
            <option value="paid">Pago</option>
          </SelectField>
        </FilterBar>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Movimentações</CardTitle>
              <CardDescription>
                {loading
                  ? 'Carregando lançamentos…'
                  : `${entries.length} ${entries.length === 1 ? 'lançamento encontrado' : 'lançamentos encontrados'}`}
              </CardDescription>
            </div>
            <CalendarDays aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading && entries.length === 0 ? (
              <ListSkeleton label="Carregando lançamentos" rows={4} />
            ) : entries.length ? (
              <EntryList busy={loading}>
                {entries.map((entry) => {
                  const pendingOperation = offline?.operations.find((operation) => operation.entryId === entry.id);
                  return (
                    <EntryRow
                      key={entry.id}
                      icon={entry.kind === 'income' ? ArrowDownLeft : entry.kind === 'investment' ? RefreshCw : ArrowUpRight}
                      iconTone={entry.kind === 'income' ? 'income' : entry.kind === 'investment' ? 'accent' : 'neutral'}
                      title={entry.description}
                      meta={
                        <>
                          {kindLabels[entry.kind]} · {entry.category_name ?? 'Sem categoria'} · Competência{' '}
                          {formatBrazilianMonth(entry.competence_on)} · Vencimento {formatBrazilianDate(entry.due_on)}
                          {entry.realized_on ? ` · Realizado ${formatBrazilianDate(entry.realized_on)}` : ''}
                          {pendingOperation && <span className="ml-1 font-semibold text-warning">· Pendente neste aparelho</span>}
                        </>
                      }
                      aside={
                        <EntryAmount
                          cents={entry.actual_cents ?? entry.planned_cents}
                          tone={entry.kind === 'income' ? 'income' : 'expense'}
                          caption={
                            entry.actual_cents !== null && (
                              <>
                                Previsto <MoneyValue cents={entry.planned_cents} />
                              </>
                            )
                          }
                          status={entry.status}
                          statusLabel={`Situação: ${statusLabels[entry.status]}`}
                        />
                      }
                      actions={
                        <EntryActions
                          entry={entry}
                          busy={busyEntryId === entry.id}
                          confirmationBlocked={confirmationBlocked}
                          syncing={Boolean(offline?.syncing)}
                          conflict={Boolean(pendingOperation?.conflict)}
                          onConfirm={() => startConfirmation(entry)}
                          onUndo={() => void undoConfirmation(entry)}
                          onDelete={() => void deleteEntry(entry)}
                        />
                      }
                    >
                      {confirmingEntryId === entry.id && (
                        <form
                          aria-label={`Confirmar lançamento ${entry.description}`}
                          onSubmit={(event) => void confirmEntry(event, entry)}
                          className="grid w-full gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
                        >
                          <FormField id={`actual-amount-${entry.id}`} label="Valor realizado (R$)">
                            <MoneyInput required allowZero value={actualAmount} onChange={setActualAmount} />
                          </FormField>
                          <FormField id={`actual-date-${entry.id}`} label="Data de realização" hint="DD/MM/AAAA">
                            <DateField required value={actualDate} onChange={setActualDate} />
                          </FormField>
                          <Button type="submit" size="sm" disabled={busyEntryId === entry.id || confirmationBlocked}>
                            {busyEntryId === entry.id ? 'Salvando…' : 'Salvar realização'}
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingEntryId('')}>
                            Cancelar
                          </Button>
                        </form>
                      )}
                    </EntryRow>
                  );
                })}
              </EntryList>
            ) : (
              <EmptyState
                title="Nenhum lançamento encontrado"
                description="Ajuste os filtros ou adicione a primeira movimentação deste período."
                action={
                  <Button asChild>
                    <Link to="/lancamentos/novo">
                      <Plus aria-hidden="true" className="size-4" />
                      Adicionar lançamento
                    </Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

export function NewTransactionPage() {
  const auth = useContext(AuthContext);
  const offline = useOfflineWorkspace();
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const offlineOperationKey =
    offline?.operations.map((operation) => `${operation.operationId}:${operation.conflict?.reason ?? ''}`).join('|') ?? '';
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [kind, setKind] = useState<EntryKind>('expense');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [month, setMonth] = useState(currentMonthInputValue());
  const [dueOn, setDueOn] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const formEditedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const currentOffline = offlineRef.current;
    function applyCachedForm(entry: Entry | undefined, cachedCategories: Category[], cachedMethods: PaymentMethod[]) {
      setCategories(cachedCategories.filter((category) => !category.archived_at || category.id === entry?.category_id));
      setPaymentMethods(cachedMethods.filter((method) => !method.archived_at || method.id === entry?.payment_method_id));
      // Recargas por mudança de conexão não apagam o que a pessoa já alterou no formulário.
      if (formEditedRef.current) return;
      setBaseVersion(entry?.version ?? null);
      if (entry) {
        setKind(entry.kind);
        setDescription(entry.description);
        setCategoryId(entry.category_id ?? '');
        setMonth(entry.competence_on.slice(0, 7));
        setDueOn(entry.due_on ? formatBrazilianDate(entry.due_on) : '');
        setAmount(formatBrazilianAmount(entry.planned_cents));
        setPaymentMethodId(entry.payment_method_id ?? '');
        setNotes(entry.notes ?? '');
      }
    }
    async function loadForm() {
      if (!formEditedRef.current) setLoading(true);
      setError('');
      const localEntry = id ? currentOffline?.entries.find((entry) => entry.id === id) : undefined;
      const hasPendingLocalVersion = Boolean(id && currentOffline?.operations.some((operation) => operation.entryId === id));
      if (currentOffline && (!currentOffline.online || hasPendingLocalVersion)) {
        if (id && !localEntry) {
          if (active) setError('Este lançamento ainda não foi carregado neste aparelho. Conecte-se antes de editá-lo.');
        } else {
          applyCachedForm(localEntry, currentOffline.categories, currentOffline.paymentMethods);
        }
        if (active) setLoading(false);
        return;
      }
      try {
        const responses = await Promise.all([
          fetch(`/api/catalog/categories${id ? '?includeArchived=true' : ''}`, { credentials: 'same-origin' }),
          fetch(`/api/catalog/payment-methods${id ? '?includeArchived=true' : ''}`, { credentials: 'same-origin' }),
          ...(id ? [fetch(`/api/entries/${id}`, { credentials: 'same-origin' })] : []),
        ]);
        const results = await Promise.all(responses.map(readApi));
        const failedIndex = responses.findIndex((response) => !response.ok);
        if (failedIndex >= 0) {
          if (currentOffline && isAuthenticationFailure(responses[failedIndex]!)) currentOffline.invalidateSession();
          throw new Error(results[failedIndex]?.error ?? 'Não foi possível carregar o formulário.');
        }
        const entry = results[2]?.entry;
        const loadedCategories = results[0].categories ?? [];
        const loadedMethods = results[1].paymentMethods ?? [];
        if (active) applyCachedForm(entry, loadedCategories, loadedMethods);
        await currentOffline?.cacheCatalogs(loadedCategories, loadedMethods);
        if (entry) await currentOffline?.cacheEntries([entry]);
        currentOffline?.setOnline(true);
      } catch (loadError) {
        if (currentOffline && currentOffline.supported && isNetworkFailure(loadError, currentOffline.online)) {
          currentOffline.setOnline(navigator.onLine && !(loadError instanceof TypeError));
          const snapshot = await currentOffline.refresh();
          const cachedEntry = id ? snapshot.entries.find((entry) => entry.id === id) : undefined;
          if (id && !cachedEntry) {
            if (active) setError('Este lançamento ainda não foi carregado neste aparelho. Conecte-se antes de editá-lo.');
          } else {
            if (active) applyCachedForm(cachedEntry, snapshot.categories, snapshot.paymentMethods);
          }
        } else if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o formulário.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadForm();
    return () => {
      active = false;
    };
  }, [id, offline?.online, offline?.ready, offlineOperationKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setError('Informe o mês de competência.');
      return;
    }
    const plannedCents = parseBrazilianCents(amount);
    if (plannedCents === null) {
      setError('Informe um valor maior que zero, em reais e com até duas casas decimais.');
      return;
    }
    const normalizedDueOn = dueOn.trim() ? parseBrazilianDate(dueOn) : null;
    if (dueOn.trim() && !normalizedDueOn) {
      setError('Informe o vencimento como uma data válida no formato DD/MM/AAAA.');
      return;
    }
    setBusy(true);
    const currentOffline = offlineRef.current;
    const payload = {
      kind,
      description,
      categoryId: categoryId || null,
      competenceOn: `${month}-01`,
      dueOn: normalizedDueOn,
      plannedCents,
      paymentMethodId: paymentMethodId || null,
      notes: notes.trim() || null,
      baseVersion: editing ? (baseVersion ?? 1) : undefined,
    };

    async function saveOffline() {
      if (!currentOffline?.supported) throw new Error('O armazenamento offline não está disponível neste navegador.');
      const previous = editing ? currentOffline.entries.find((entry) => entry.id === id) : undefined;
      if (editing && !previous) throw new Error('Este lançamento não está salvo neste aparelho. Conecte-se antes de editá-lo.');
      const localEntry = makeOfflineEntry(
        {
          id: id ?? crypto.randomUUID(),
          userId: auth?.user.id ?? '',
          ...payload,
        },
        categories,
        paymentMethods,
        previous,
      );
      await currentOffline.queueChange(localEntry, editing ? 'update' : 'create');
      toast('Lançamento salvo neste aparelho. Ele será sincronizado quando a conexão voltar.');
      navigate('/lancamentos');
    }

    try {
      if (currentOffline && (!currentOffline.online || currentOffline.pendingCount > 0)) {
        await saveOffline();
        return;
      }
      if (currentOffline && !currentOffline.supported && !currentOffline.online) {
        throw new Error('O armazenamento offline não está disponível neste navegador.');
      }
      const response = await fetch(editing ? `/api/entries/${id}` : '/api/entries', {
        method: editing ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth?.csrfToken ?? '' },
        body: JSON.stringify(payload),
      });
      const result = await readApi(response);
      if (!response.ok) {
        if (currentOffline && isAuthenticationFailure(response)) currentOffline.invalidateSession();
        if (response.status === 409 && result.conflict && currentOffline?.supported) {
          await saveOffline();
          return;
        }
        throw new Error(result.error ?? 'Não foi possível salvar o lançamento.');
      }
      if (result.entry) await currentOffline?.cacheEntries([result.entry]);
      currentOffline?.setOnline(true);
      toast(editing ? 'Alterações salvas.' : 'Lançamento salvo.');
      navigate('/lancamentos');
    } catch (saveError) {
      if (currentOffline && currentOffline.supported && isNetworkFailure(saveError, currentOffline.online)) {
        currentOffline.setOnline(navigator.onLine && !(saveError instanceof TypeError));
        try {
          await saveOffline();
        } catch (offlineError) {
          setError(offlineError instanceof Error ? offlineError.message : 'Não foi possível guardar o lançamento offline.');
        }
      } else {
        setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o lançamento.');
      }
    } finally {
      setBusy(false);
    }
  }

  const activeCategories = categories.filter((category) => category.kind === kind);
  if (loading)
    return (
      <>
        <PageHeader
          eyebrow="Lançamentos"
          title={editing ? 'Editar lançamento' : 'Adicionar lançamento'}
          description="Carregando os cadastros compartilhados."
        />
        <LoadingState label="Carregando formulário" />
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow="Lançamentos"
        title={editing ? 'Editar lançamento' : 'Adicionar lançamento'}
        description="Registre a previsão no espaço financeiro compartilhado."
      />
      <Card className="max-w-3xl">
        <CardContent className="grid gap-5 p-5 sm:p-7">
          {error && <Alert>{error}</Alert>}
          <form
            onSubmit={submit}
            onChange={() => {
              formEditedRef.current = true;
            }}
            className="grid gap-5"
          >
            <RadioGroup
              legend="Tipo"
              name="entry-kind"
              value={kind}
              options={kindOptions}
              onChange={(value) => {
                setKind(value);
                if (categories.find((category) => category.id === categoryId)?.kind !== value) setCategoryId('');
              }}
            />
            <FormField id="entry-title" label="Descrição">
              <Input
                required
                maxLength={200}
                autoComplete="off"
                placeholder="Ex.: conta de luz"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </FormField>
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField id="entry-category" label="Categoria" value={categoryId} onChange={setCategoryId}>
                <option value="">Sem categoria</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.archived_at ? ' (arquivada)' : ''}
                  </option>
                ))}
              </SelectField>
              <FormField id="entry-competence" label="Mês de competência">
                <MonthField required value={month} onChange={setMonth} />
              </FormField>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField id="entry-amount" label="Valor previsto (R$)" hint="Ex.: 1.234,56">
                <MoneyInput required value={amount} onChange={setAmount} />
              </FormField>
              <FormField id="entry-due-date" label="Vencimento" hint="Opcional · DD/MM/AAAA">
                <DateField value={dueOn} onChange={setDueOn} />
              </FormField>
            </div>
            <SelectField id="entry-payment-method" label="Forma de pagamento" value={paymentMethodId} onChange={setPaymentMethodId}>
              <option value="">Não definida</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                  {method.archived_at ? ' (arquivada)' : ''}
                </option>
              ))}
            </SelectField>
            <FormField id="entry-notes" label="Observações">
              <Textarea maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || offline?.syncing}>
                <Plus aria-hidden="true" className="size-4" />
                {busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar lançamento'}
              </Button>
              <Button asChild type="button" variant="outline">
                <Link to="/lancamentos">Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
