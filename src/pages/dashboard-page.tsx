import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/feedback';
import { currentMonthInputValue, shiftMonth, formatBrazilianDate, formatBrazilianMonthLong } from '../lib/finance';
import type { ChartSummary, ExpenseCategoryChartEntry } from './dashboard-charts';
import { PageHeader } from './page-header';
import { isAuthenticationFailure, isNetworkFailure, useOfflineWorkspace } from '../offline/offline-context';
import { MoneyValue } from '../components/ui/money-value';
import { Alert } from '../components/ui/alert';
import { ActionToolbar } from '../components/finance/action-toolbar';
import { DataTable, type DataRow } from '../components/finance/data-table';
import { EntryAmount, EntryList, EntryRow } from '../components/finance/entry-row';
import { MonthNavigator } from '../components/finance/month-navigator';
import { StatCard } from '../components/finance/stat-card';
import { ChartsSkeleton, DashboardSkeleton, SkeletonRegion } from '../components/ui/skeleton';

const DashboardCharts = lazy(() => import('./dashboard-charts').then(({ DashboardCharts: charts }) => ({ default: charts })));

type DashboardEntry = { id: string; description: string; competence_on: string; due_on: string; planned_cents: string };
type DashboardData = {
  month: string;
  planned: ChartSummary;
  realized: ChartSummary;
  charts: { expensesByCategory: ExpenseCategoryChartEntry[] };
  upcoming: { count: number; entries: DashboardEntry[] };
  overdue: { count: number; entries: DashboardEntry[] };
};
type DashboardApiResponse = DashboardData & { error?: string };

function comparisonRows(dashboard: DashboardData): DataRow[] {
  const line = (id: string, label: string, planned: string, realized: string, emphasis = false): DataRow => ({
    id,
    emphasis,
    cells: { label, planned: <MoneyValue cents={planned} />, realized: <MoneyValue cents={realized} /> },
  });
  return [
    line('income', 'Receitas', dashboard.planned.incomeCents, dashboard.realized.incomeCents),
    line('expense', 'Despesas', dashboard.planned.expenseCents, dashboard.realized.expenseCents),
    line('investment', 'Aportes', dashboard.planned.investmentCents, dashboard.realized.investmentCents),
    line('result', 'Resultado do período', dashboard.planned.resultCents, dashboard.realized.resultCents, true),
  ];
}

function DashboardMetric({ title, cents, description }: { title: string; cents: string; description: string }) {
  return <StatCard title={title} value={<MoneyValue cents={cents} tone="balance" />} description={description} />;
}

function DashboardEntryList({ entries, overdue = false }: { entries: DashboardEntry[]; overdue?: boolean }) {
  return (
    <EntryList>
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          density="compact"
          title={entry.description}
          meta={<span className={overdue ? 'text-destructive' : undefined}>Vence em {formatBrazilianDate(entry.due_on)}</span>}
          aside={<EntryAmount cents={entry.planned_cents} status={overdue ? 'late' : undefined} />}
        />
      ))}
    </EntryList>
  );
}

export function DashboardPage() {
  const offline = useOfflineWorkspace();
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const [month, setMonth] = useState(currentMonthInputValue());
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const currentOffline = offlineRef.current;
    const path = `/api/dashboard?month=${month}`;
    async function loadDashboard() {
      if (currentOffline && !currentOffline.online) {
        const cached = await currentOffline.getSnapshot<DashboardData>(path).catch(() => null);
        if (active) {
          if (cached) setDashboard(cached);
          else {
            setDashboard(null);
            setError('Este mês ainda não foi carregado neste aparelho. Conecte-se para consultar o painel.');
          }
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
        const result = (await response.json()) as DashboardApiResponse;
        if (!response.ok) {
          if (currentOffline && isAuthenticationFailure(response)) currentOffline.invalidateSession();
          throw new Error(result.error ?? 'Não foi possível carregar o painel.');
        }
        if (active) setDashboard(result);
        await currentOffline?.cacheSnapshot(path, result);
        currentOffline?.setOnline(true);
      } catch (loadError) {
        if (currentOffline && isNetworkFailure(loadError, currentOffline.online)) {
          currentOffline.setOnline(navigator.onLine && !(loadError instanceof TypeError));
          const cached = await currentOffline.getSnapshot<DashboardData>(path).catch(() => null);
          if (active) {
            if (cached) setDashboard(cached);
            else {
              setDashboard(null);
              setError('Este mês ainda não foi carregado neste aparelho. Conecte-se para consultar o painel.');
            }
          }
        } else if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o painel.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadDashboard();
    return () => {
      active = false;
    };
  }, [month, offline?.online]);

  const heading = formatBrazilianMonthLong(month);
  return (
    <>
      <PageHeader
        eyebrow={heading}
        title="Visão geral"
        description="Compare o previsto por competência com os valores efetivamente realizados."
        action={
          <ActionToolbar>
            <MonthNavigator label="Mês do painel" value={month} onChange={setMonth} />
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
      {loading && !dashboard ? (
        <DashboardSkeleton label="Carregando painel financeiro" />
      ) : (
        dashboard && (
          <div aria-busy={loading}>
            <section aria-label={`Resumo de ${heading}`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DashboardMetric
                title="Resultado previsto"
                cents={dashboard.planned.resultCents}
                description="Receitas − despesas − aportes por competência"
              />
              <DashboardMetric
                title="Resultado realizado"
                cents={dashboard.realized.resultCents}
                description="Pagamentos e recebimentos pela data efetiva"
              />
              <DashboardMetric
                title="Aportes previstos"
                cents={dashboard.planned.investmentCents}
                description="Separados das despesas do período"
              />
              <DashboardMetric title="Aportes realizados" cents={dashboard.realized.investmentCents} description="Confirmados neste mês" />
            </section>
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Previsto e realizado</CardTitle>
                <CardDescription>
                  O previsto usa a competência do lançamento; o realizado usa o mês em que o pagamento ou recebimento ocorreu.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  caption={`Valores previstos e realizados em ${heading}`}
                  minWidth="min-w-[28rem]"
                  columns={[
                    { id: 'label', header: 'Movimentação' },
                    { id: 'planned', header: 'Previsto', align: 'right' },
                    { id: 'realized', header: 'Realizado', align: 'right' },
                  ]}
                  rows={comparisonRows(dashboard)}
                />
              </CardContent>
            </Card>
            <Suspense
              fallback={
                <SkeletonRegion label="Carregando gráficos financeiros">
                  <ChartsSkeleton />
                </SkeletonRegion>
              }
            >
              <DashboardCharts
                monthLabel={heading}
                planned={dashboard.planned}
                realized={dashboard.realized}
                expensesByCategory={dashboard.charts.expensesByCategory}
              />
            </Suspense>
            <section aria-label="Contas a acompanhar" className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle>Próximas contas</CardTitle>
                    <CardDescription>{dashboard.upcoming.count} despesas em aberto com vencimento nos próximos 7 dias</CardDescription>
                  </div>
                  <CalendarDays aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {dashboard.upcoming.entries.length ? (
                    <>
                      <DashboardEntryList entries={dashboard.upcoming.entries} />
                      {dashboard.upcoming.count > dashboard.upcoming.entries.length && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Mostrando {dashboard.upcoming.entries.length} de {dashboard.upcoming.count}.{' '}
                          <Link to="/lancamentos" className="font-semibold text-primary hover:underline">
                            Ver lançamentos
                          </Link>
                        </p>
                      )}
                    </>
                  ) : (
                    <EmptyState title="Nenhuma conta próxima" description="Não há despesas em aberto vencendo nos próximos 7 dias." />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Contas atrasadas</CardTitle>
                  <CardDescription>{dashboard.overdue.count} despesas em aberto com vencimento anterior a hoje</CardDescription>
                </CardHeader>
                <CardContent>
                  {dashboard.overdue.entries.length ? (
                    <>
                      <DashboardEntryList entries={dashboard.overdue.entries} overdue />
                      {dashboard.overdue.count > dashboard.overdue.entries.length && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Mostrando {dashboard.overdue.entries.length} de {dashboard.overdue.count}.{' '}
                          <Link to="/lancamentos" className="font-semibold text-primary hover:underline">
                            Ver lançamentos
                          </Link>
                        </p>
                      )}
                    </>
                  ) : (
                    <EmptyState title="Nenhuma conta atrasada" description="Todas as despesas vencidas deste espaço foram resolvidas." />
                  )}
                </CardContent>
              </Card>
            </section>
            <p className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
              O resultado do período resume lançamentos previstos ou realizados. Não representa o saldo de uma conta bancária.
            </p>
            <p className="mt-2 rounded-xl border border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
              Regras recorrentes projetam o mês atual e os próximos 12 meses.{' '}
              {month > shiftMonth(currentMonthInputValue(), 12)
                ? 'O mês selecionado está além desse horizonte: lançamentos manuais continuam consultáveis, mas novas projeções recorrentes não são garantidas.'
                : 'Cada mês do painel é salvo no aparelho quando aberto online; os demais meses precisam de conexão para serem carregados.'}
            </p>
          </div>
        )
      )}
    </>
  );
}
