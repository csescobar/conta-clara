import { useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../auth/auth-gate';
import { StatusBadge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState, LoadingState } from '../components/ui/feedback';
import { FormField, Input } from '../components/ui/input';
import { currentBrazilianDate, currentMonthInputValue, formatBrazilianDate, formatBrazilianMonth, formatBrazilianMoney, parseBrazilianCents, parseBrazilianDate } from '../lib/finance';
import { PageHeader } from './page-header';

type EntryKind = 'income' | 'expense' | 'investment';
type EntryStatus = 'pending' | 'late' | 'paid';
type Category = { id: string; name: string; kind: EntryKind; expense_class: 'fixed' | 'variable' | null; archived_at: string | null };
type PaymentMethod = { id: string; name: string; archived_at: string | null };
type Entry = {
  id: string;
  kind: EntryKind;
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
  status: EntryStatus;
};

type ApiResponse = { error?: string; entries?: Entry[]; entry?: Entry; categories?: Category[]; paymentMethods?: PaymentMethod[] };
const kindLabels: Record<EntryKind, string> = { income: 'Receita', expense: 'Despesa', investment: 'Aporte' };
const statusLabels: Record<EntryStatus, string> = { pending: 'Em aberto', late: 'Atrasado', paid: 'Pago' };

async function readApi(response: Response): Promise<ApiResponse> {
  if (response.status === 204) return {};
  return response.json() as Promise<ApiResponse>;
}

function SelectField({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <div className="grid gap-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><select id={id} className="min-h-11 rounded-xl border border-input bg-card px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-ring" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></div>;
}

export function TransactionsPage() {
  const auth = useContext(AuthContext);
  const [month, setMonth] = useState(currentMonthInputValue());
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyEntryId, setBusyEntryId] = useState('');
  const [confirmingEntryId, setConfirmingEntryId] = useState('');
  const [actualAmount, setActualAmount] = useState('');
  const [actualDate, setActualDate] = useState(() => currentBrazilianDate());
  const [error, setError] = useState('');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (month) query.set('month', month);
      if (categoryId) query.set('categoryId', categoryId);
      if (status) query.set('status', status);
      const response = await fetch(`/api/entries?${query.toString()}`, { credentials: 'same-origin' });
      const result = await readApi(response);
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível carregar os lançamentos.');
      setEntries(result.entries ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os lançamentos.');
    } finally {
      setLoading(false);
    }
  }, [month, categoryId, status]);

  useEffect(() => {
    void fetch('/api/catalog/categories?includeArchived=true', { credentials: 'same-origin' })
      .then(readApi)
      .then((result) => setCategories(result.categories ?? []))
      .catch(() => setError('Não foi possível carregar as categorias para os filtros.'));
  }, []);

  useEffect(() => { void loadEntries(); }, [loadEntries]);

  async function deleteEntry(entry: Entry) {
    if (!window.confirm(`Excluir “${entry.description}”? Esta ação não pode ser desfeita.`)) return;
    setBusyEntryId(entry.id);
    setError('');
    try {
      const response = await fetch(`/api/entries/${entry.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': auth?.csrfToken ?? '' },
      });
      const result = await readApi(response);
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível excluir o lançamento.');
      await loadEntries();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir o lançamento.');
    } finally {
      setBusyEntryId('');
    }
  }

  function startConfirmation(entry: Entry) {
    setConfirmingEntryId(entry.id);
    setActualAmount(formatBrazilianMoney(entry.planned_cents));
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
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth?.csrfToken ?? '' },
        body: JSON.stringify({ actualCents, realizedOn }),
      });
      const result = await readApi(response);
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível confirmar o lançamento.');
      setConfirmingEntryId('');
      await loadEntries();
    } catch (confirmationError) {
      setError(confirmationError instanceof Error ? confirmationError.message : 'Não foi possível confirmar o lançamento.');
    } finally {
      setBusyEntryId('');
    }
  }

  async function undoConfirmation(entry: Entry) {
    if (!window.confirm(`Desfazer a confirmação de “${entry.description}”? O lançamento voltará a ficar em aberto ou atrasado.`)) return;
    setBusyEntryId(entry.id);
    setError('');
    try {
      const response = await fetch(`/api/entries/${entry.id}/confirm`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': auth?.csrfToken ?? '' },
      });
      const result = await readApi(response);
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível desfazer a confirmação.');
      await loadEntries();
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : 'Não foi possível desfazer a confirmação.');
    } finally {
      setBusyEntryId('');
    }
  }

  return <>
    <PageHeader eyebrow="Movimentações" title="Lançamentos" description="Acompanhe receitas, despesas e aportes do espaço compartilhado." action={<Button asChild><Link to="/lancamentos/novo"><Plus aria-hidden="true" className="size-4" />Adicionar lançamento</Link></Button>} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-[#fdecec] px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
    <section className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>Filtrar lançamentos</CardTitle><CardDescription>Escolha competência, categoria ou situação.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-2"><label htmlFor="entries-month" className="text-sm font-medium">Competência</label><Input id="entries-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
          <SelectField id="entries-category" label="Categoria" value={categoryId} onChange={setCategoryId}><option value="">Todas as categorias</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.archived_at ? ' (arquivada)' : ''}</option>)}</SelectField>
          <SelectField id="entries-status" label="Situação" value={status} onChange={setStatus}><option value="">Todas as situações</option><option value="pending">Em aberto</option><option value="late">Atrasado</option><option value="paid">Pago</option></SelectField>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Movimentações</CardTitle><CardDescription>{loading ? 'Carregando lançamentos…' : `${entries.length} ${entries.length === 1 ? 'lançamento encontrado' : 'lançamentos encontrados'}`}</CardDescription></div><CalendarDays aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" /></CardHeader>
        <CardContent>
          {loading ? <LoadingState label="Carregando lançamentos" /> : entries.length ? <ul className="divide-y divide-border">{entries.map((entry) => {
            const Icon = entry.kind === 'income' ? ArrowDownLeft : entry.kind === 'investment' ? RefreshCw : ArrowUpRight;
            return <li key={entry.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3.5 first:pt-0 last:pb-0 sm:gap-4">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${entry.kind === 'income' ? 'bg-[#e8f5ed] text-success' : entry.kind === 'investment' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}><Icon aria-hidden="true" className="size-[18px]" /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{entry.description}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{kindLabels[entry.kind]} · {entry.category_name ?? 'Sem categoria'} · Competência {formatBrazilianMonth(entry.competence_on)} · Vencimento {formatBrazilianDate(entry.due_on)}{entry.realized_on ? ` · Realizado ${formatBrazilianDate(entry.realized_on)}` : ''}</p></div>
              <div className="grid shrink-0 justify-items-end gap-1"><p className={`text-sm font-semibold tabular-nums ${entry.kind === 'income' ? 'text-success' : 'text-foreground'}`}>{formatBrazilianMoney(entry.actual_cents ?? entry.planned_cents)}</p>{entry.actual_cents !== null && <p className="text-xs text-muted-foreground">Previsto {formatBrazilianMoney(entry.planned_cents)}</p>}<StatusBadge status={entry.status} aria-label={`Situação: ${statusLabels[entry.status]}`} /></div>
              <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto">{entry.actual_cents === null ? <Button type="button" size="sm" variant="outline" disabled={busyEntryId === entry.id} aria-label={`Confirmar ${entry.description}`} onClick={() => startConfirmation(entry)}><CalendarDays aria-hidden="true" className="size-4" />Confirmar</Button> : <Button type="button" size="sm" variant="ghost" disabled={busyEntryId === entry.id} aria-label={`Desfazer confirmação ${entry.description}`} onClick={() => void undoConfirmation(entry)}>Desfazer confirmação</Button>}<Button asChild size="sm" variant="ghost"><Link aria-label={`Editar ${entry.description}`} to={`/lancamentos/${entry.id}/editar`}><Pencil aria-hidden="true" className="size-4" />Editar</Link></Button><Button type="button" size="sm" variant="ghost" disabled={busyEntryId === entry.id} aria-label={`Excluir ${entry.description}`} onClick={() => void deleteEntry(entry)}><Trash2 aria-hidden="true" className="size-4" />Excluir</Button></div>
              {confirmingEntryId === entry.id && <form aria-label={`Confirmar lançamento ${entry.description}`} onSubmit={(event) => void confirmEntry(event, entry)} className="grid w-full gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"><FormField id={`actual-amount-${entry.id}`} label="Valor realizado (R$)"><Input required inputMode="decimal" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} /></FormField><FormField id={`actual-date-${entry.id}`} label="Data de realização" hint="DD/MM/AAAA"><Input required inputMode="numeric" maxLength={10} value={actualDate} onChange={(event) => setActualDate(event.target.value)} /></FormField><Button type="submit" size="sm" disabled={busyEntryId === entry.id}>{busyEntryId === entry.id ? 'Salvando…' : 'Salvar realização'}</Button><Button type="button" size="sm" variant="outline" onClick={() => setConfirmingEntryId('')}>Cancelar</Button></form>}
            </li>;
          })}</ul> : <EmptyState title="Nenhum lançamento encontrado" description="Ajuste os filtros ou adicione a primeira movimentação deste período." action={<Button asChild><Link to="/lancamentos/novo"><Plus aria-hidden="true" className="size-4" />Adicionar lançamento</Link></Button>} />}
        </CardContent>
      </Card>
    </section>
  </>;
}

export function NewTransactionPage() {
  const auth = useContext(AuthContext);
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

  useEffect(() => {
    async function loadForm() {
      setLoading(true);
      setError('');
      try {
        const responses = await Promise.all([
          fetch(`/api/catalog/categories${id ? '?includeArchived=true' : ''}`, { credentials: 'same-origin' }),
          fetch(`/api/catalog/payment-methods${id ? '?includeArchived=true' : ''}`, { credentials: 'same-origin' }),
          ...(id ? [fetch(`/api/entries/${id}`, { credentials: 'same-origin' })] : []),
        ]);
        const results = await Promise.all(responses.map(readApi));
        if (responses.some((response) => !response.ok)) throw new Error(results.find((_, index) => !responses[index].ok)?.error ?? 'Não foi possível carregar o formulário.');
        const entry = results[2]?.entry;
        setCategories((results[0].categories ?? []).filter((category) => !category.archived_at || category.id === entry?.category_id));
        setPaymentMethods((results[1].paymentMethods ?? []).filter((method) => !method.archived_at || method.id === entry?.payment_method_id));
        if (entry) {
          setKind(entry.kind);
          setDescription(entry.description);
          setCategoryId(entry.category_id ?? '');
          setMonth(entry.competence_on.slice(0, 7));
          setDueOn(entry.due_on ? formatBrazilianDate(entry.due_on) : '');
          setAmount(formatBrazilianMoney(entry.planned_cents));
          setPaymentMethodId(entry.payment_method_id ?? '');
          setNotes(entry.notes ?? '');
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o formulário.');
      } finally {
        setLoading(false);
      }
    }
    void loadForm();
  }, [id]);

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
    try {
      const response = await fetch(editing ? `/api/entries/${id}` : '/api/entries', {
        method: editing ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth?.csrfToken ?? '' },
        body: JSON.stringify({
          kind,
          description,
          categoryId: categoryId || null,
          competenceOn: `${month}-01`,
          dueOn: normalizedDueOn,
          plannedCents,
          paymentMethodId: paymentMethodId || null,
          notes: notes.trim() || null,
        }),
      });
      const result = await readApi(response);
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível salvar o lançamento.');
      navigate('/lancamentos');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o lançamento.');
    } finally {
      setBusy(false);
    }
  }

  const activeCategories = categories.filter((category) => category.kind === kind);
  if (loading) return <><PageHeader eyebrow="Lançamentos" title={editing ? 'Editar lançamento' : 'Adicionar lançamento'} description="Carregando os cadastros compartilhados." /><LoadingState label="Carregando formulário" /></>;

  return <>
    <PageHeader eyebrow="Lançamentos" title={editing ? 'Editar lançamento' : 'Adicionar lançamento'} description="Registre a previsão no espaço financeiro compartilhado." />
    <Card className="max-w-3xl"><CardContent className="grid gap-5 p-5 sm:p-7">
      {error && <p role="alert" className="rounded-xl bg-[#fdecec] px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
      <form onSubmit={submit} className="grid gap-5">
        <fieldset className="grid gap-2"><legend className="text-sm font-medium">Tipo</legend><div className="flex flex-wrap gap-2">{([['income', 'Receita'], ['expense', 'Despesa'], ['investment', 'Aporte']] as const).map(([value, label]) => <label key={value} className="cursor-pointer"><input className="peer sr-only" type="radio" name="entry-kind" value={value} checked={kind === value} onChange={() => { setKind(value); if (categories.find((category) => category.id === categoryId)?.kind !== value) setCategoryId(''); }} /><span className="inline-flex min-h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground peer-checked:border-primary peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">{label}</span></label>)}</div></fieldset>
        <FormField id="entry-title" label="Descrição"><Input required maxLength={200} autoComplete="off" placeholder="Ex.: conta de luz" value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField id="entry-category" label="Categoria" value={categoryId} onChange={setCategoryId}><option value="">Sem categoria</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.archived_at ? ' (arquivada)' : ''}</option>)}</SelectField>
          <div className="grid gap-2"><label htmlFor="entry-competence" className="text-sm font-medium">Mês de competência</label><Input id="entry-competence" required type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="entry-amount" label="Valor previsto (R$)" hint="Ex.: 1.234,56"><Input required inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} /></FormField>
          <FormField id="entry-due-date" label="Vencimento" hint="Opcional · DD/MM/AAAA"><Input inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={dueOn} onChange={(event) => setDueOn(event.target.value)} /></FormField>
        </div>
        <SelectField id="entry-payment-method" label="Forma de pagamento" value={paymentMethodId} onChange={setPaymentMethodId}><option value="">Não definida</option>{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}{method.archived_at ? ' (arquivada)' : ''}</option>)}</SelectField>
        <div className="grid gap-2"><label htmlFor="entry-notes" className="text-sm font-medium">Observações</label><textarea id="entry-notes" maxLength={2000} rows={3} className="w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}><Plus aria-hidden="true" className="size-4" />{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar lançamento'}</Button><Button asChild type="button" variant="outline"><Link to="/lancamentos">Cancelar</Link></Button></div>
      </form>
    </CardContent></Card>
  </>;
}
