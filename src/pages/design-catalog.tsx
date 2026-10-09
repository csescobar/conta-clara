import { ArrowDownLeft, ArrowUpRight, CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ActionToolbar } from '../components/finance/action-toolbar';
import { DataTable } from '../components/finance/data-table';
import { EntryAmount, EntryList, EntryRow } from '../components/finance/entry-row';
import { FilterBar } from '../components/finance/filter-bar';
import { MonthNavigator } from '../components/finance/month-navigator';
import { StatCard } from '../components/finance/stat-card';
import { Alert } from '../components/ui/alert';
import { StatusBadge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '../components/ui/dialog';
import { EmptyState, LoadingState } from '../components/ui/feedback';
import { ChartsSkeleton, ListSkeleton, TextSkeleton } from '../components/ui/skeleton';
import { Checkbox, DateField, MoneyInput, MonthField, RadioGroup, Select, Textarea } from '../components/ui/form-controls';
import { FormField, Input } from '../components/ui/input';
import { MoneyValue } from '../components/ui/money-value';
import { ToastHost } from '../components/ui/toast-host';
import { toast } from '../components/ui/toast-store';
import { contrastRatio } from '../lib/contrast';
import { cn } from '../lib/utils';
import { baseTokens, contrastPairs, stateNames, stateParts } from '../lib/design-tokens';
import { AppearanceSettings } from './appearance-settings';
import { PageHeader } from './page-header';

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div>
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function useTokenValues(names: string[]) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    setValues(Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(`--${name}`).trim()])));
    // As cores vêm do CSS; a lista de nomes é constante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return values;
}

function Swatch({ token, value }: { token: string; value?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
      <span aria-hidden="true" className="size-9 shrink-0 rounded-lg border border-border" style={{ background: `var(--${token})` }} />
      <span className="grid min-w-0 text-xs leading-5">
        <code className="truncate font-semibold">--{token}</code>
        <span className="text-muted-foreground">{value ?? ''}</span>
      </span>
    </li>
  );
}

// Classes escritas por extenso: o Tailwind só gera o CSS de nomes que aparecem literalmente no código.
const stateClasses = {
  success: { panel: 'border-success-border bg-success-surface', text: 'text-success', badge: 'bg-success-soft text-success' },
  warning: { panel: 'border-warning-border bg-warning-surface', text: 'text-warning', badge: 'bg-warning-soft text-warning' },
  destructive: {
    panel: 'border-destructive-border bg-destructive-surface',
    text: 'text-destructive',
    badge: 'bg-destructive-soft text-destructive',
  },
  info: { panel: 'border-info-border bg-info-surface', text: 'text-info', badge: 'bg-info-soft text-info' },
} as const;

function ColorSection() {
  const stateTokens = stateNames.flatMap((state) => stateParts.map((part) => `${state}${part}`));
  const all = [...baseTokens, 'destructive-foreground', ...stateTokens];
  const values = useTokenValues(all);
  return (
    <Section
      id="catalog-colors"
      title="Cores"
      description="Tokens semânticos de src/styles.css. Use classes geradas por eles, nunca hexadecimais."
    >
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {baseTokens.map((token) => (
          <Swatch key={token} token={token} value={values[token]} />
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        {stateNames.map((state) => (
          <div key={state} className={cn('grid gap-2 rounded-xl border p-4', stateClasses[state].panel)}>
            <p className={cn('text-sm font-semibold', stateClasses[state].text)}>{state}</p>
            <p className="text-sm leading-6">
              Texto em <code>{state}</code> sobre <code>{state}-surface</code>, com borda <code>{state}-border</code>.
            </p>
            <span className={cn('w-fit rounded-full px-2.5 py-1 text-xs font-semibold', stateClasses[state].badge)}>{state}-soft</span>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle as="h3">Contraste dos pares</CardTitle>
          <CardDescription>
            Texto: mínimo 4,5:1. Contorno de componente e gráficos: mínimo 3:1. Verificado também em testes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Razão de contraste por par de tokens"
            minWidth="min-w-[32rem]"
            columns={[
              { id: 'pair', header: 'Par' },
              { id: 'kind', header: 'Tipo' },
              { id: 'ratio', header: 'Razão', align: 'right' },
            ]}
            rows={contrastPairs.map((pair) => {
              const foreground = values[pair.foreground];
              const background = values[pair.background];
              let ratio: number | null = null;
              try {
                ratio = foreground && background ? contrastRatio(foreground, background) : null;
              } catch {
                // Valor que não é uma cor hexadecimal: mostra a razão como indisponível em vez de quebrar a página.
              }
              return {
                id: pair.label,
                cells: {
                  pair: pair.label,
                  kind: `${pair.kind} (${pair.minimum}:1)`,
                  ratio: ratio === null ? '…' : `${ratio.toFixed(2).replace('.', ',')}:1 ${ratio >= pair.minimum ? '✓' : '✗'}`,
                },
              };
            })}
          />
        </CardContent>
      </Card>
    </Section>
  );
}

const typeScale = [
  ['text-xs', 'Metadados, rótulos curtos e menu móvel · 12 px'],
  ['text-sm', 'Corpo e controles · 14 px'],
  ['text-base', 'Títulos de cartão · 16 px'],
  ['text-lg', 'Títulos de diálogo e seção · 18 px'],
  ['text-2xl', 'Título de página no celular · 24 px'],
  ['text-display', 'Indicadores do painel · 28 px'],
] as const;

function TypographySection() {
  return (
    <Section id="catalog-type" title="Tipografia" description="Fontes de sistema e a escala de tamanhos. Nenhum texto abaixo de 12 px.">
      <ul className="grid gap-2">
        {typeScale.map(([name, usage]) => (
          <li key={name} className="flex flex-wrap items-baseline gap-x-4 border-b border-border pb-2">
            <code className="w-28 shrink-0 text-xs text-muted-foreground">{name}</code>
            <span className={`${name} font-semibold tabular-nums`}>R$ 1.234,56</span>
            <span className="text-sm text-muted-foreground">{usage}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ButtonsSection() {
  return (
    <Section
      id="catalog-buttons"
      title="Botões e selos"
      description="Variantes, tamanhos e estados dos botões; situação sempre com texto e ícone."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button>Principal</Button>
        <Button variant="secondary">Secundário</Button>
        <Button variant="outline">Contorno</Button>
        <Button variant="ghost">Discreto</Button>
        <Button variant="destructive">Destrutivo</Button>
        <Button disabled>Desabilitado</Button>
        <Button size="sm" variant="outline">
          Pequeno
        </Button>
        <Button size="lg">Grande</Button>
        <Button size="icon" variant="outline" aria-label="Adicionar">
          <Plus aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status="paid" />
        <StatusBadge status="pending" />
        <StatusBadge status="late" />
      </div>
    </Section>
  );
}

function MessagesSection() {
  const [confirm, confirmDialog] = useConfirmDialog();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  return (
    <Section
      id="catalog-messages"
      title="Mensagens e sobreposições"
      description="Alertas inline, diálogos, confirmação destrutiva e avisos temporários."
    >
      <div className="grid gap-3">
        <Alert variant="destructive" title="Não foi possível salvar">
          Verifique a conexão e tente novamente.
        </Alert>
        <Alert variant="warning">Esta ação afeta lançamentos já pagos.</Alert>
        <Alert variant="success">Backup verificado com sucesso.</Alert>
        <Alert variant="info">Cada regra projeta o mês atual e os próximos 12.</Alert>
      </div>
      <ActionToolbar label="Exemplos de sobreposição">
        <Button variant="outline" onClick={() => setDialogOpen(true)}>
          Abrir diálogo
        </Button>
        <Button
          variant="outline"
          onClick={async () =>
            setAnswer(
              (await confirm({
                title: 'Excluir “Conta fictícia”?',
                description: 'Esta ação não pode ser desfeita.',
                confirmLabel: 'Excluir lançamento',
                destructive: true,
              }))
                ? 'confirmado'
                : 'cancelado',
            )
          }
        >
          Pedir confirmação
        </Button>
        <Button variant="outline" onClick={() => toast('Compra salva. Será sincronizada quando houver conexão.')}>
          Mostrar aviso
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast('A categoria “Casa” foi arquivada.', {
              action: { label: 'Desfazer', onClick: () => toast('A categoria foi restaurada.') },
            })
          }
        >
          Aviso com desfazer
        </Button>
        {answer && (
          <span role="status" className="text-sm text-muted-foreground">
            Resposta: {answer}
          </span>
        )}
      </ActionToolbar>
      {confirmDialog}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader title="Quitar fatura" description="Registre o total da quitação integral, em reais." />
          <FormField id="catalog-dialog-amount" label="Valor efetivamente pago">
            <MoneyInput value="1.234,56" onChange={() => undefined} />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Confirmar quitação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function FieldsSection() {
  const [text, setText] = useState('Conta de luz fictícia');
  const [amount, setAmount] = useState('1.234,56');
  const [date, setDate] = useState('15/11/2026');
  const [month, setMonth] = useState('2026-11');
  const [kind, setKind] = useState<'income' | 'expense' | 'investment'>('expense');
  const [checked, setChecked] = useState(false);
  return (
    <Section
      id="catalog-fields"
      title="Campos de formulário"
      description="Rótulo visível, ajuda e erro ligados ao campo; datas, competências e valores no formato brasileiro."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="catalog-text" label="Descrição" hint="Ex.: conta de luz">
          <Input value={text} onChange={(event) => setText(event.target.value)} />
        </FormField>
        <FormField id="catalog-error" label="Descrição com erro" error="Informe uma descrição.">
          <Input defaultValue="" />
        </FormField>
        <FormField id="catalog-disabled" label="Campo desabilitado">
          <Input disabled defaultValue="Somente leitura" />
        </FormField>
        <FormField id="catalog-select" label="Categoria">
          <Select defaultValue="">
            <option value="">Sem categoria</option>
            <option value="housing">Moradia fictícia</option>
          </Select>
        </FormField>
        <FormField id="catalog-amount" label="Valor previsto (R$)" hint="Ex.: 1.234,56">
          <MoneyInput value={amount} onChange={setAmount} />
        </FormField>
        <FormField id="catalog-date" label="Vencimento" hint="DD/MM/AAAA">
          <DateField value={date} onChange={setDate} />
        </FormField>
        <FormField id="catalog-month" label="Competência" hint="MM/AAAA">
          <MonthField value={month} onChange={setMonth} />
        </FormField>
        <FormField id="catalog-notes" label="Observações">
          <Textarea defaultValue="" />
        </FormField>
      </div>
      <RadioGroup
        legend="Tipo"
        name="catalog-kind"
        value={kind}
        options={[
          ['income', 'Receita'],
          ['expense', 'Despesa'],
          ['investment', 'Aporte'],
        ]}
        onChange={setKind}
      />
      <Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)}>
        Revisei as datas sinalizadas na prévia.
      </Checkbox>
    </Section>
  );
}

function FinanceSection() {
  const [month, setMonth] = useState('2026-11');
  return (
    <Section
      id="catalog-finance"
      title="Composição financeira"
      description="Valores, listas, indicadores, filtros e tabelas das telas do app."
    >
      <div className="flex flex-wrap gap-4 text-sm">
        <MoneyValue cents={123456} />
        <MoneyValue cents={123456} tone="income" signDisplay="always" />
        <MoneyValue cents={-5000} tone="balance" />
        <MoneyValue cents={0} tone="balance" />
        <MoneyValue cents="123456789" compact />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          title="Resultado previsto"
          value={<MoneyValue cents="337655" tone="balance" />}
          description="Receitas − despesas − aportes"
        />
        <StatCard title="Resultado realizado" value={<MoneyValue cents="-12000" tone="balance" />} description="Pela data efetiva" />
      </div>
      <Card>
        <CardContent className="pt-5">
          <EntryList>
            <EntryRow
              icon={ArrowUpRight}
              iconTone="neutral"
              title="Conta de luz fictícia"
              meta="Despesa · Moradia · Competência 11/2026 · Vencimento 15/11/2026"
              aside={<EntryAmount cents={12345} tone="expense" status="pending" statusLabel="Situação: Pendente" />}
              actions={
                <>
                  <Button size="sm" variant="outline">
                    <CalendarDays aria-hidden="true" className="size-4" />
                    Confirmar
                  </Button>
                  <Button size="sm" variant="ghost">
                    Editar
                  </Button>
                </>
              }
            />
            <EntryRow
              icon={ArrowDownLeft}
              iconTone="income"
              title="Salário fictício"
              meta="Receita · Renda · Realizado 05/11/2026"
              aside={<EntryAmount cents={350000} tone="income" caption="Previsto R$ 3.400,00" status="paid" statusLabel="Situação: Pago" />}
            />
            <EntryRow
              icon={RefreshCw}
              title="Aporte mensal com um nome de descrição bastante longo para mostrar o corte do título"
              meta="Aporte · Reserva"
              aside={<EntryAmount cents={50000} status="late" statusLabel="Situação: Atrasado" />}
            />
          </EntryList>
        </CardContent>
      </Card>
      <FilterBar title="Filtrar lançamentos" description="Escolha competência, categoria ou situação.">
        <FormField id="catalog-filter-month" label="Competência">
          <MonthField value={month} onChange={setMonth} />
        </FormField>
        <FormField id="catalog-filter-status" label="Situação">
          <Select defaultValue="">
            <option value="">Todas as situações</option>
            <option value="paid">Pago</option>
          </Select>
        </FormField>
      </FilterBar>
      <MonthNavigator label="Mês do catálogo" value={month} onChange={setMonth} />
      <DataTable
        caption="Previsto e realizado de exemplo"
        columns={[
          { id: 'label', header: 'Movimentação' },
          { id: 'planned', header: 'Previsto', align: 'right' },
          { id: 'realized', header: 'Realizado', align: 'right' },
        ]}
        rows={[
          { id: 'a', cells: { label: 'Receitas', planned: <MoneyValue cents={350000} />, realized: <MoneyValue cents={350000} /> } },
          {
            id: 'b',
            emphasis: true,
            cells: { label: 'Resultado', planned: <MoneyValue cents={337655} />, realized: <MoneyValue cents={337655} /> },
          },
        ]}
      />
      <DataTable
        caption="Tabela compacta de exemplo"
        compact
        columns={[
          { id: 'label', header: 'Grupo', width: 'w-[34%]' },
          { id: 'planned', header: 'Previsto', align: 'right', width: 'w-[33%]' },
          { id: 'realized', header: 'Realizado', align: 'right', width: 'w-[33%]' },
        ]}
        rows={[
          {
            id: 'a',
            cells: { label: 'Moradia fictícia', planned: <MoneyValue cents={123456} />, realized: <MoneyValue cents={120000} /> },
          },
        ]}
      />
    </Section>
  );
}

function StatesSection() {
  return (
    <Section
      id="catalog-states"
      title="Estados"
      description="Esqueletos de carregamento com a mesma estrutura do conteúdo, estados vazios com orientação e ação."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <EmptyState
          title="Nenhum lançamento encontrado"
          description="Ajuste os filtros ou adicione a primeira movimentação."
          action={<Button>Adicionar lançamento</Button>}
        />
        <EmptyState compact title="Nenhuma categoria cadastrada" description="Use o formulário acima para criar a primeira categoria." />
        <LoadingState label="Carregando (indicador simples)" />
        <TextSkeleton label="Carregando categorias" />
      </div>
      <Card>
        <CardContent className="pt-5">
          <ListSkeleton label="Carregando lançamentos" rows={3} />
        </CardContent>
      </Card>
      <ChartsSkeleton />
    </Section>
  );
}

/** Referência viva do design system. Disponível apenas em desenvolvimento ou em builds com VITE_DESIGN_CATALOG=true. */
export default function DesignCatalogPage() {
  return (
    <main id="main-content" className="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-8 sm:px-8">
      <PageHeader
        eyebrow="Design system"
        title="Catálogo do design system"
        description="Tokens, componentes e estados com dados fictícios. Esta página não existe no build de produção."
      />
      <AppearanceSettings />
      <ColorSection />
      <TypographySection />
      <ButtonsSection />
      <MessagesSection />
      <FieldsSection />
      <FinanceSection />
      <StatesSection />
      <ToastHost />
    </main>
  );
}
