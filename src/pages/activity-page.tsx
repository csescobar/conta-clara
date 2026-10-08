import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState, LoadingState } from '../components/ui/feedback';
import { formatBrazilianDate, formatBrazilianDateTime, formatBrazilianMonth, formatBrazilianMoney } from '../lib/finance';
import { PageHeader } from './page-header';
import { Alert } from '../components/ui/alert';

type EntryKind = 'income' | 'expense' | 'investment';
type Snapshot = {
  kind: EntryKind;
  description: string;
  categoryName: string | null;
  competenceOn: string;
  dueOn: string | null;
  plannedCents: string | null;
  actualCents: string | null;
  realizedOn: string | null;
  paymentMethodName: string | null;
};
type Action = 'created' | 'updated' | 'confirmed' | 'unconfirmed' | 'deleted';
type ActivityEvent = {
  id: string;
  entry_id: string;
  actor_name: string;
  action: Action;
  entry_kind: EntryKind;
  entry_description: string;
  occurred_at: string;
  details: { before?: Snapshot; after?: Snapshot };
};
type ApiResponse = { error?: string; events?: ActivityEvent[]; hasMore?: boolean; nextOffset?: number };

const kindNames: Record<EntryKind, string> = { income: 'receita', expense: 'despesa', investment: 'aporte' };
const actionWords: Record<Action, string> = {
  created: 'cadastrou',
  updated: 'editou',
  confirmed: 'confirmou',
  unconfirmed: 'desfez a confirmação de',
  deleted: 'excluiu',
};

function snapshotSummary(event: ActivityEvent): string {
  const { before, after } = event.details;
  if (event.action === 'created' && after) {
    return `Previsto ${formatBrazilianMoney(after.plannedCents ?? '0')} · Competência ${formatBrazilianMonth(after.competenceOn)} · Vencimento ${formatBrazilianDate(after.dueOn)}`;
  }
  if (event.action === 'confirmed' && after) {
    return `Realizado ${formatBrazilianMoney(after.actualCents ?? '0')} em ${formatBrazilianDate(after.realizedOn)} · Previsto ${formatBrazilianMoney(after.plannedCents ?? '0')}`;
  }
  if (event.action === 'unconfirmed' && before) {
    return `Confirmação desfeita · O valor realizado era ${formatBrazilianMoney(before.actualCents ?? '0')} em ${formatBrazilianDate(before.realizedOn)}`;
  }
  if (event.action === 'deleted' && before) {
    return `Exclusão registrada · Último valor previsto ${formatBrazilianMoney(before.plannedCents ?? '0')}${before.actualCents !== null ? ` · Realizado ${formatBrazilianMoney(before.actualCents)}` : ''}`;
  }
  if (event.action === 'updated' && before && after) {
    const changes: string[] = [];
    if (before.description !== after.description) changes.push(`Descrição: ${before.description} → ${after.description}`);
    if (before.plannedCents !== after.plannedCents) changes.push(`Previsto: ${formatBrazilianMoney(before.plannedCents ?? '0')} → ${formatBrazilianMoney(after.plannedCents ?? '0')}`);
    if (before.competenceOn !== after.competenceOn) changes.push(`Competência: ${formatBrazilianMonth(before.competenceOn)} → ${formatBrazilianMonth(after.competenceOn)}`);
    if (before.dueOn !== after.dueOn) changes.push(`Vencimento: ${formatBrazilianDate(before.dueOn)} → ${formatBrazilianDate(after.dueOn)}`);
    if (before.categoryName !== after.categoryName) changes.push(`Categoria: ${before.categoryName ?? 'Sem categoria'} → ${after.categoryName ?? 'Sem categoria'}`);
    if (before.paymentMethodName !== after.paymentMethodName) changes.push(`Pagamento: ${before.paymentMethodName ?? 'Não definido'} → ${after.paymentMethodName ?? 'Não definido'}`);
    if (before.actualCents !== after.actualCents || before.realizedOn !== after.realizedOn) changes.push('Dados de realização atualizados');
    return changes.length ? changes.join(' · ') : 'Dados do lançamento atualizados.';
  }
  return 'Atividade financeira registrada.';
}

export function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/activity', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as ApiResponse;
        if (!response.ok) throw new Error(result.error ?? 'Não foi possível carregar o histórico.');
        if (active) {
          setEvents(result.events ?? []);
          setHasMore(result.hasMore ?? false);
          setNextOffset(result.nextOffset ?? result.events?.length ?? 0);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o histórico.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const response = await fetch(`/api/activity?offset=${nextOffset}`, { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível carregar o histórico.');
      setEvents((current) => [...current, ...(result.events ?? [])]);
      setHasMore(result.hasMore ?? false);
      setNextOffset(result.nextOffset ?? nextOffset + (result.events?.length ?? 0));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o histórico.');
    } finally {
      setLoadingMore(false);
    }
  }

  return <>
    <PageHeader eyebrow="Transparência" title="Histórico" description="Veja quem cadastrou, alterou, confirmou ou removeu lançamentos do espaço compartilhado." />
    {error && <Alert className="mb-4">{error}</Alert>}
    <Card>
      <CardHeader><CardTitle>Atividade recente</CardTitle><CardDescription>Histórico somente para consulta, com as alterações mais recentes primeiro.</CardDescription></CardHeader>
      <CardContent>
        {loading ? <LoadingState label="Carregando histórico" /> : events.length ? <><ol className="divide-y divide-border">{events.map((event) => <li key={event.id} className="flex gap-3 py-4 first:pt-0 last:pb-0 sm:gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><History aria-hidden="true" className="size-[18px]" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm leading-6"><span className="font-semibold">{event.actor_name}</span> {actionWords[event.action]} {kindNames[event.entry_kind]} <span className="font-semibold">“{event.entry_description}”</span></p><p className="mt-1 text-xs leading-5 text-muted-foreground">{formatBrazilianDateTime(event.occurred_at)}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{snapshotSummary(event)}</p></div>
        </li>)}</ol>{hasMore && <div className="flex justify-center pt-5"><Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Carregando…' : 'Carregar atividades anteriores'}</Button></div>}</> : <EmptyState title="Nenhuma alteração registrada" description="Quando alguém cadastrar ou atualizar um lançamento, a atividade aparecerá aqui." />}
      </CardContent>
    </Card>
  </>;
}
