import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/feedback';
import { MoneyValue } from '../components/ui/money-value';
import { formatBrazilianMoney, formatCompactBrazilianMoney } from '../lib/finance';
import { Select } from '../components/ui/form-controls';
import { DataTable, type DataColumn, type DataRow } from '../components/finance/data-table';

export type ChartSummary = { incomeCents: string; expenseCents: string; investmentCents: string; resultCents: string };
export type ExpenseCategoryChartEntry = { categoryId: string | null; categoryName: string; plannedCents: string; realizedCents: string };

type ChartPoint = {
  label: string;
  plannedCents: string;
  realizedCents: string;
  planned: number;
  realized: number;
};

type CategoryFilter = 'both' | 'planned' | 'realized';

function chartValue(cents: string) {
  return Number(BigInt(cents)) / 100;
}

function formatAxisValue(value: number) {
  return formatCompactBrazilianMoney(Math.round(value * 100));
}

function tooltipRows(mode: CategoryFilter, point: Pick<ChartPoint, 'plannedCents' | 'realizedCents'>) {
  if (mode === 'planned') return [['Previsto', point.plannedCents]] as const;
  if (mode === 'realized') return [['Realizado', point.realizedCents]] as const;
  return [
    ['Previsto', point.plannedCents],
    ['Realizado', point.realizedCents],
  ] as const;
}

function ChartTooltip({ active, payload, label, mode = 'both' }: TooltipContentProps & { mode?: CategoryFilter }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ChartPoint;
  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-semibold">{label}</p>
      {tooltipRows(mode, point).map(([name, cents]) => (
        <p key={name} className="text-muted-foreground">
          {name}:{' '}
          <span className="font-medium text-foreground">
            <MoneyValue cents={cents} />
          </span>
        </p>
      ))}
    </div>
  );
}

function ChartDataTable({ title, data, mode = 'both' }: { title: string; data: ChartPoint[]; mode?: CategoryFilter }) {
  const columns: DataColumn[] = [
    { id: 'label', header: 'Grupo', width: mode === 'both' ? 'w-[34%]' : 'w-[40%]' },
    ...(mode !== 'realized'
      ? [{ id: 'planned', header: 'Previsto', align: 'right' as const, width: mode === 'both' ? 'w-[33%]' : 'w-[60%]' }]
      : []),
    ...(mode !== 'planned'
      ? [{ id: 'realized', header: 'Realizado', align: 'right' as const, width: mode === 'both' ? 'w-[33%]' : 'w-[60%]' }]
      : []),
  ];
  const rows: DataRow[] = data.map((point) => ({
    id: point.label,
    cells: {
      label: point.label,
      planned: <MoneyValue cents={point.plannedCents} />,
      realized: <MoneyValue cents={point.realizedCents} />,
    },
  }));
  return (
    <details className="min-w-0 rounded-xl border border-border px-3 py-2 text-sm">
      <summary
        className={
          'cursor-pointer font-medium text-primary focus-visible:rounded focus-visible:outline-2 ' +
          'focus-visible:outline-offset-2 focus-visible:outline-ring'
        }
      >
        Ver dados em tabela
      </summary>
      <DataTable caption={title} columns={columns} rows={rows} compact />
    </details>
  );
}

function ResponsiveFinanceBarChart({
  data,
  title,
  mode = 'both',
  truncateLabels = false,
}: {
  data: ChartPoint[];
  title: string;
  mode?: CategoryFilter;
  truncateLabels?: boolean;
}) {
  const categoryLabel = (value: string) => (truncateLabels && value.length > 17 ? `${value.slice(0, 16)}…` : value);
  return (
    <div className="h-72 min-w-0 w-full sm:h-80" aria-label={title}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          accessibilityLayer
          title={title}
          desc="Gráfico com valores previstos e realizados; os valores exatos estão disponíveis na tabela abaixo."
          margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
        >
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={formatAxisValue}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={104}
            tickFormatter={categoryLabel}
            tick={{ fill: 'var(--foreground)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={(props) => <ChartTooltip {...props} mode={mode} />} cursor={{ fill: 'var(--muted)' }} />
          {mode !== 'realized' && <Bar dataKey="planned" name="Previsto" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={18} />}
          {mode !== 'planned' && (
            <Bar dataKey="realized" name="Realizado" fill="var(--chart-realized)" radius={[0, 4, 4, 0]} maxBarSize={18} />
          )}
          {mode === 'both' && <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '12px' }} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function sumCents(entries: ExpenseCategoryChartEntry[], key: 'plannedCents' | 'realizedCents') {
  return entries.reduce((sum, entry) => sum + BigInt(entry[key]), 0n).toString();
}

function getVisibleCategories(entries: ExpenseCategoryChartEntry[]) {
  if (entries.length <= 6) return entries;
  const visible = entries.slice(0, 5);
  const rest = entries.slice(5);
  return [
    ...visible,
    {
      categoryId: null,
      categoryName: 'Outras categorias',
      plannedCents: sumCents(rest, 'plannedCents'),
      realizedCents: sumCents(rest, 'realizedCents'),
    },
  ];
}

export function DashboardCharts({
  monthLabel,
  planned,
  realized,
  expensesByCategory,
}: {
  monthLabel: string;
  planned: ChartSummary;
  realized: ChartSummary;
  expensesByCategory: ExpenseCategoryChartEntry[];
}) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('both');
  const comparisonData: ChartPoint[] = [
    {
      label: 'Receitas',
      plannedCents: planned.incomeCents,
      realizedCents: realized.incomeCents,
      planned: chartValue(planned.incomeCents),
      realized: chartValue(realized.incomeCents),
    },
    {
      label: 'Despesas',
      plannedCents: planned.expenseCents,
      realizedCents: realized.expenseCents,
      planned: chartValue(planned.expenseCents),
      realized: chartValue(realized.expenseCents),
    },
    {
      label: 'Aportes',
      plannedCents: planned.investmentCents,
      realizedCents: realized.investmentCents,
      planned: chartValue(planned.investmentCents),
      realized: chartValue(realized.investmentCents),
    },
  ];
  const categoryData = getVisibleCategories(expensesByCategory).map((entry) => ({
    label: entry.categoryName,
    plannedCents: entry.plannedCents,
    realizedCents: entry.realizedCents,
    planned: chartValue(entry.plannedCents),
    realized: chartValue(entry.realizedCents),
  }));
  const hasComparison = comparisonData.some((point) => BigInt(point.plannedCents) > 0n || BigInt(point.realizedCents) > 0n);
  const hasCategoryData = categoryData.some((point) =>
    categoryFilter === 'planned'
      ? BigInt(point.plannedCents) > 0n
      : categoryFilter === 'realized'
        ? BigInt(point.realizedCents) > 0n
        : BigInt(point.plannedCents) > 0n || BigInt(point.realizedCents) > 0n,
  );
  const categoryMode: CategoryFilter = categoryFilter;
  const selectedCategoryTotal =
    categoryFilter === 'planned'
      ? sumCents(expensesByCategory, 'plannedCents')
      : categoryFilter === 'realized'
        ? sumCents(expensesByCategory, 'realizedCents')
        : null;
  const topCategory = categoryData[0];

  return (
    <section aria-label="Gráficos financeiros" className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Previsto versus realizado</CardTitle>
          <CardDescription>Valores de {monthLabel}. Aportes aparecem separados das despesas.</CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3">
          {hasComparison ? (
            <>
              <p className="text-xs leading-5 text-muted-foreground">
                Receitas, despesas e aportes lado a lado, conforme a tabela do painel acima.
              </p>
              <ResponsiveFinanceBarChart data={comparisonData} title={`Gráfico previsto versus realizado em ${monthLabel}`} />
              <ChartDataTable title={`Resumo do gráfico previsto e realizado em ${monthLabel}`} data={comparisonData} />
            </>
          ) : (
            <EmptyState
              title="Sem movimentações neste mês"
              description="Não há valores previstos ou realizados para comparar no período selecionado."
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Despesas por categoria</CardTitle>
          <CardDescription>Previsto por competência e realizado pela data efetiva em {monthLabel}.</CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3">
          <label htmlFor="category-chart-filter" className="grid gap-2 text-sm font-medium sm:flex sm:items-center sm:gap-3">
            Valores exibidos
            <Select
              id="category-chart-filter"
              aria-label="Valores do gráfico por categoria"
              className="sm:w-auto"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
            >
              <option value="both">Previsto e realizado</option>
              <option value="planned">Somente previsto</option>
              <option value="realized">Somente realizado</option>
            </Select>
          </label>
          {!hasCategoryData ? (
            <EmptyState
              title={
                categoryFilter === 'planned'
                  ? 'Sem despesas previstas neste mês'
                  : categoryFilter === 'realized'
                    ? 'Sem despesas realizadas neste mês'
                    : 'Sem despesas no mês'
              }
              description={
                categoryFilter === 'planned'
                  ? 'Não há despesas previstas por competência neste período.'
                  : categoryFilter === 'realized'
                    ? 'Não há despesas realizadas neste período.'
                    : 'Não há despesas previstas por competência nem realizadas neste período.'
              }
            />
          ) : (
            <>
              {categoryFilter === 'both' ? (
                <p aria-live="polite" className="text-xs leading-5 text-muted-foreground">
                  {expensesByCategory.length} categorias; previsto {formatBrazilianMoney(sumCents(expensesByCategory, 'plannedCents'))},
                  realizado {formatBrazilianMoney(sumCents(expensesByCategory, 'realizedCents'))}.
                  {topCategory ? ` Maior categoria exibida: ${topCategory.label}.` : ''}
                </p>
              ) : (
                <p aria-live="polite" className="text-xs leading-5 text-muted-foreground">
                  Total {categoryFilter === 'planned' ? 'previsto' : 'realizado'}: {formatBrazilianMoney(selectedCategoryTotal ?? '0')}. Os
                  aportes não entram neste gráfico.
                </p>
              )}
              <ResponsiveFinanceBarChart
                data={categoryData}
                title={`Despesas por categoria em ${monthLabel}`}
                mode={categoryMode}
                truncateLabels
              />
              <ChartDataTable title={`Despesas por categoria em ${monthLabel}`} data={categoryData} mode={categoryMode} />
              {expensesByCategory.length > 6 && (
                <p className="text-xs text-muted-foreground">
                  O gráfico agrupa as categorias menores em “Outras categorias”; a tabela mostra os grupos do gráfico.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
