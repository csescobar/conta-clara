import { useCallback, useContext, useEffect, useRef, useState, type FormEvent } from 'react';
import { Archive, CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../auth/auth-gate';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState, LoadingState } from '../components/ui/feedback';
import { FormField, Input } from '../components/ui/input';
import { currentMonthInputValue, formatBrazilianAmount, parseBrazilianCents } from '../lib/finance';
import { PageHeader } from './page-header';
import { MoneyValue } from '../components/ui/money-value';
import { Select, Textarea, RadioGroup, MonthField, MoneyInput } from '../components/ui/form-controls';

type EntryKind = 'income' | 'expense' | 'investment';
type RecurrenceRule = {
  id: string;
  kind: EntryKind;
  description: string;
  category_id: string | null;
  category_name: string | null;
  payment_method_id: string | null;
  payment_method_name: string | null;
  start_competence_on: string;
  end_competence_on: string | null;
  due_day: number | null;
  planned_cents: string;
  notes: string | null;
  archived_at: string | null;
  occurrence_count: number;
};
type Category = { id: string; name: string; kind: EntryKind; archived_at: string | null };
type PaymentMethod = { id: string; name: string; archived_at: string | null };
type ApiResponse = { error?: string; rules?: RecurrenceRule[]; rule?: RecurrenceRule; categories?: Category[]; paymentMethods?: PaymentMethod[] };
const kindLabels: Record<EntryKind, string> = { income: 'Receita', expense: 'Despesa', investment: 'Aporte' };

async function readApi(response: Response): Promise<ApiResponse> {
  if (response.status === 204) return {};
  return response.json() as Promise<ApiResponse>;
}

function recurrencePeriod(rule: RecurrenceRule) {
  const start = rule.start_competence_on.slice(0, 7).split('-').reverse().join('/');
  const end = rule.end_competence_on?.slice(0, 7).split('-').reverse().join('/') ?? 'Sem término';
  return `${start} – ${end}`;
}

export function RecurrencesPage() {
  const auth = useContext(AuthContext);
  const [rules, setRules] = useState<RecurrenceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/recurrences', { credentials: 'same-origin', cache: 'no-store' });
      const result = await readApi(response);
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível carregar as regras.');
      setRules(result.rules ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as regras.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRules(); }, [loadRules]);

  async function archiveRule(rule: RecurrenceRule) {
    if (!window.confirm(`Arquivar a regra “${rule.description}”? Os lançamentos já gerados serão mantidos.`)) return;
    setBusyId(rule.id);
    try {
      const response = await fetch(`/api/recurrences/${rule.id}/archive`, {
        method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': auth?.csrfToken ?? '' },
      });
      const result = await readApi(response);
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível arquivar a regra.');
      await loadRules();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Não foi possível arquivar a regra.');
    } finally {
      setBusyId('');
    }
  }

  const activeCount = rules.filter((rule) => !rule.archived_at).length;
  return <>
    <PageHeader eyebrow="Planejamento" title="Recorrências" description="Gere lançamentos mensais automaticamente e ajuste cada ocorrência quando precisar." action={<Button asChild><Link to="/recorrencias/novo"><Plus aria-hidden="true" className="size-4" />Nova regra</Link></Button>} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
    <Card>
      <CardHeader><CardTitle>Regras mensais</CardTitle><CardDescription>{activeCount} {activeCount === 1 ? 'regra ativa' : 'regras ativas'} · os lançamentos gerados aparecem em Lançamentos.</CardDescription></CardHeader>
      <CardContent>
        {loading ? <LoadingState label="Carregando regras de recorrência" /> : rules.length ? <ul className="divide-y divide-border">{rules.map((rule) => <li key={rule.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0 sm:gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><RefreshCw aria-hidden="true" className="size-[18px]" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{rule.description}{rule.archived_at ? ' (arquivada)' : ''}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{kindLabels[rule.kind]} · {rule.category_name ?? 'Sem categoria'} · {rule.due_day ? `Dia ${rule.due_day}` : 'Sem vencimento'} · {recurrencePeriod(rule)} · {rule.occurrence_count} {rule.occurrence_count === 1 ? 'ocorrência' : 'ocorrências'}</p></div>
          <p className="shrink-0 text-sm font-semibold tabular-nums"><MoneyValue cents={rule.planned_cents} /></p>
          {!rule.archived_at && <div className="flex w-full justify-end gap-1 sm:w-auto"><Button asChild size="sm" variant="ghost"><Link aria-label={`Editar regra ${rule.description}`} to={`/recorrencias/${rule.id}/editar`}>Editar</Link></Button><Button type="button" size="sm" variant="ghost" disabled={busyId === rule.id} aria-label={`Arquivar regra ${rule.description}`} onClick={() => void archiveRule(rule)}><Archive aria-hidden="true" className="size-4" />Arquivar</Button></div>}
        </li>)}</ul> : <EmptyState title="Nenhuma regra mensal" description="Crie uma regra para gerar os lançamentos mensais que se repetem." action={<Button asChild><Link to="/recorrencias/novo"><Plus aria-hidden="true" className="size-4" />Nova regra</Link></Button>} />}
      </CardContent>
    </Card>
    <p className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">Cada regra projeta até 13 competências: o mês atual e os próximos 12. Ao alterar ou arquivar uma regra, o sistema atualiza ou retira projeções futuras automáticas ainda em aberto. Competências atuais ou passadas, pagamentos, ajustes individuais e exclusões manuais são preservados. Depois desse horizonte, novas projeções recorrentes não são garantidas.</p>
  </>;
}

const kindOptions = [['income', 'Receita'], ['expense', 'Despesa'], ['investment', 'Aporte']] as const;

export function RecurrenceFormPage() {
  const auth = useContext(AuthContext);
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [kind, setKind] = useState<EntryKind>('expense');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [startMonth, setStartMonth] = useState(currentMonthInputValue());
  const [endMonth, setEndMonth] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [amount, setAmount] = useState('');
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
          ...(id ? [fetch(`/api/recurrences/${id}`, { credentials: 'same-origin' })] : []),
        ]);
        const results = await Promise.all(responses.map(readApi));
        if (responses.some((response) => !response.ok)) throw new Error(results.find((_, index) => !responses[index].ok)?.error ?? 'Não foi possível carregar a regra.');
        const rule = results[2]?.rule;
        if (rule?.archived_at) throw new Error('Regras arquivadas não podem ser editadas.');
        setCategories((results[0].categories ?? []).filter((category) => !category.archived_at || category.id === rule?.category_id));
        setPaymentMethods((results[1].paymentMethods ?? []).filter((method) => !method.archived_at || method.id === rule?.payment_method_id));
        if (rule) {
          setKind(rule.kind);
          setDescription(rule.description);
          setCategoryId(rule.category_id ?? '');
          setPaymentMethodId(rule.payment_method_id ?? '');
          setStartMonth(rule.start_competence_on.slice(0, 7));
          setEndMonth(rule.end_competence_on?.slice(0, 7) ?? '');
          setDueDay(rule.due_day?.toString() ?? '');
          setAmount(formatBrazilianAmount(rule.planned_cents));
          setNotes(rule.notes ?? '');
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a regra.');
      } finally {
        setLoading(false);
      }
    }
    void loadForm();
  }, [id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) || (endMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth))) {
      setError('Informe meses de início e término válidos.');
      return;
    }
    if (endMonth && endMonth < startMonth) {
      setError('O término deve ser igual ou posterior ao início.');
      return;
    }
    const numericDueDay = dueDay ? Number(dueDay) : null;
    if (numericDueDay !== null && (!Number.isInteger(numericDueDay) || numericDueDay < 1 || numericDueDay > 31)) {
      setError('Informe um dia de vencimento entre 1 e 31.');
      return;
    }
    const plannedCents = parseBrazilianCents(amount);
    if (plannedCents === null) {
      setError('Informe um valor maior que zero, em reais e com até duas casas decimais.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(editing ? `/api/recurrences/${id}` : '/api/recurrences', {
        method: editing ? 'PUT' : 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth?.csrfToken ?? '' },
        body: JSON.stringify({
          kind, description, categoryId: categoryId || null, paymentMethodId: paymentMethodId || null,
          startCompetenceOn: `${startMonth}-01`, endCompetenceOn: endMonth ? `${endMonth}-01` : null,
          dueDay: numericDueDay, plannedCents, notes: notes.trim() || null,
        }),
      });
      const result = await readApi(response);
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível salvar a regra.');
      // Quem já saiu do formulário durante o salvamento não deve ser levado de volta às regras.
      if (mountedRef.current) navigate('/recorrencias');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a regra.');
    } finally {
      setBusy(false);
    }
  }

  const activeCategories = categories.filter((category) => category.kind === kind);
  if (loading) return <><PageHeader eyebrow="Recorrências" title={editing ? 'Editar regra mensal' : 'Nova regra mensal'} description="Carregando os cadastros compartilhados." /><LoadingState label="Carregando regra mensal" /></>;

  return <>
    <PageHeader eyebrow="Recorrências" title={editing ? 'Editar regra mensal' : 'Nova regra mensal'} description="Defina a despesa, receita ou aporte que deve se repetir a cada mês." />
    <Card className="max-w-3xl"><CardContent className="grid gap-5 p-5 sm:p-7">
      {error && <p role="alert" className="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
      <form onSubmit={submit} className="grid gap-5">
        <RadioGroup legend="Tipo" name="recurrence-kind" value={kind} options={kindOptions} onChange={(value) => { setKind(value); if (categories.find((category) => category.id === categoryId)?.kind !== value) setCategoryId(''); }} />
        <FormField id="recurrence-description" label="Descrição"><Input id="recurrence-description" required maxLength={200} autoComplete="off" placeholder="Ex.: conta de internet" value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="recurrence-category" label="Categoria"><Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Sem categoria</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.archived_at ? ' (arquivada)' : ''}</option>)}</Select></FormField>
          <FormField id="recurrence-payment-method" label="Forma de pagamento"><Select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}><option value="">Não definida</option>{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}{method.archived_at ? ' (arquivada)' : ''}</option>)}</Select></FormField>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="recurrence-start" label="Mês de início"><MonthField required value={startMonth} onChange={setStartMonth} /></FormField>
          <FormField id="recurrence-end" label="Mês de término" hint="Opcional"><MonthField value={endMonth} onChange={setEndMonth} /></FormField>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="recurrence-due-day" label="Dia de vencimento" hint="Opcional · dias 29–31 ajustam ao último dia do mês"><Input id="recurrence-due-day" type="number" min={1} max={31} step={1} inputMode="numeric" placeholder="Ex.: 31" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></FormField>
          <FormField id="recurrence-amount" label="Valor previsto (R$)" hint="Ex.: 1.234,56"><MoneyInput required value={amount} onChange={setAmount} /></FormField>
        </div>
        <FormField id="recurrence-notes" label="Observações"><Textarea maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></FormField>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}><CalendarDays aria-hidden="true" className="size-4" />{busy ? 'Salvando…' : editing ? 'Salvar regra' : 'Criar regra'}</Button><Button asChild type="button" variant="outline"><Link to="/recorrencias">Cancelar</Link></Button></div>
      </form>
    </CardContent></Card>
  </>;
}
