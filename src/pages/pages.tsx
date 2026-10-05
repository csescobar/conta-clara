import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, CirclePlus, Download, Filter, Plus, ReceiptText, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/feedback';
import { FormField, Input } from '../components/ui/input';
import { MoneyValue } from '../components/ui/money-value';

const transactions = [
  { id: 1, title: 'Salário', category: 'Renda', date: '5 out', cents: 780000, kind: 'income' as const, status: 'paid' as const },
  { id: 2, title: 'Aluguel', category: 'Moradia', date: '5 out', cents: -180000, kind: 'expense' as const, status: 'paid' as const },
  { id: 3, title: 'Internet Giga Mais', category: 'Moradia', date: '10 out', cents: -9990, kind: 'expense' as const, status: 'pending' as const },
  { id: 4, title: 'Aporte mensal', category: 'Investimentos', date: '12 out', cents: -50000, kind: 'investment' as const, status: 'pending' as const },
];

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div className="grid gap-1.5"><p className="text-sm font-medium text-primary">{eyebrow}</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p></div>{action}</header>;
}

function SummaryCard({ title, cents, detail, tone = 'default' }: { title: string; cents: number; detail: string; tone?: 'default' | 'positive' }) {
  return <Card><CardContent className="grid gap-3 p-4 sm:p-5"><p className="text-sm font-medium text-muted-foreground">{title}</p><p className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]"><MoneyValue cents={cents} /></p><p className={`text-xs leading-5 ${tone === 'positive' ? 'text-success' : 'text-muted-foreground'}`}>{detail}</p></CardContent></Card>;
}

function TransactionRows({ compact = false }: { compact?: boolean }) {
  return <div className="divide-y divide-border">
    {transactions.slice(0, compact ? 3 : undefined).map((item) => {
      const Icon = item.kind === 'income' ? ArrowDownLeft : item.kind === 'investment' ? RefreshCw : ArrowUpRight;
      return <div key={item.id} className="flex min-w-0 items-center gap-3 py-3.5 first:pt-0 last:pb-0 sm:gap-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.kind === 'income' ? 'bg-[#e8f5ed] text-success' : item.kind === 'investment' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}><Icon aria-hidden="true" className="size-[18px]" /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.category} · {item.date}</p></div>
        <div className="grid shrink-0 justify-items-end gap-1"><p className={`text-sm font-semibold tabular-nums ${item.kind === 'income' ? 'text-success' : 'text-foreground'}`}><MoneyValue cents={item.cents} /></p>{!compact && <StatusBadge status={item.status} />}</div>
      </div>;
    })}
  </div>;
}

export function DashboardPage() {
  return <>
    <PageHeader eyebrow="Outubro de 2026" title="Visão geral" description="Aqui está um resumo das finanças da família neste mês." action={<Button asChild><Link to="/lancamentos/novo"><Plus aria-hidden="true" className="size-4" />Adicionar lançamento</Link></Button>} />
    <section aria-label="Resumo do mês" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard title="Saldo previsto" cents={238212} detail="Receitas menos despesas e aportes" tone="positive" />
      <SummaryCard title="Receitas confirmadas" cents={780000} detail="1 entrada neste mês" />
      <SummaryCard title="Despesas pagas" cents={346247} detail="8 pagamentos confirmados" />
      <SummaryCard title="Contas em aberto" cents={145541} detail="3 vencem nos próximos 7 dias" />
    </section>
    <div className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <Card><CardHeader className="flex-row items-start justify-between gap-3"><div className="grid gap-1"><CardTitle>Próximas contas</CardTitle><CardDescription>Veja o que vence em breve.</CardDescription></div><CalendarDays aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" /></CardHeader><CardContent className="grid gap-1">
        {[{ name: 'Internet Giga Mais', date: '10 de outubro', cents: 9990, status: 'pending' as const }, { name: 'Energia Light', date: '10 de outubro', cents: 7249, status: 'pending' as const }, { name: 'Cartão Santander', date: '14 de outubro', cents: 128302, status: 'pending' as const }].map((bill) => <div key={bill.name} className="flex min-w-0 items-center gap-3 border-b border-border py-3 last:border-0 last:pb-0"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{bill.name}</p><p className="mt-0.5 text-xs text-muted-foreground">Vence em {bill.date}</p></div><div className="grid shrink-0 justify-items-end gap-1"><p className="text-sm font-semibold tabular-nums"><MoneyValue cents={bill.cents} /></p><StatusBadge status={bill.status} /></div></div>)}
        <Link to="/lancamentos" className="mt-3 inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Ver todos os lançamentos<ChevronRight aria-hidden="true" className="size-4" /></Link>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Movimentações recentes</CardTitle><CardDescription>Entradas, despesas e aportes de exemplo.</CardDescription></CardHeader><CardContent><TransactionRows compact /></CardContent></Card>
    </div>
    <p className="mt-5 rounded-xl border border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">Esta é uma demonstração com dados fictícios. Nenhum valor foi salvo.</p>
  </>;
}

export function TransactionsPage() {
  return <>
    <PageHeader eyebrow="Movimentações" title="Lançamentos" description="Acompanhe entradas, despesas e aportes da família." action={<Button asChild><Link to="/lancamentos/novo"><Plus aria-hidden="true" className="size-4" />Adicionar lançamento</Link></Button>} />
    <section className="grid gap-4">
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Outubro de 2026</CardTitle><CardDescription>4 lançamentos de demonstração</CardDescription></div><div className="flex gap-2"><Button variant="outline" size="sm" type="button" disabled><Filter aria-hidden="true" className="size-4" />Filtros em breve</Button><Button variant="outline" size="sm" type="button" disabled><Download aria-hidden="true" className="size-4" />Exportar em breve</Button></div></div></CardHeader><CardContent><TransactionRows /></CardContent></Card>
      <EmptyState title="Os dados são exemplos" description="Quando o armazenamento estiver conectado, seus lançamentos aparecerão nesta lista. Por enquanto, esta tela não grava nem importa dados." />
    </section>
  </>;
}

export function NewTransactionPage() {
  return <>
    <PageHeader eyebrow="Lançamentos" title="Adicionar lançamento" description="Este formulário demonstra como será o cadastro." />
    <Card className="max-w-2xl"><CardContent className="grid gap-5 p-5 sm:p-7">
      <p className="rounded-xl bg-secondary px-4 py-3 text-sm leading-6 text-secondary-foreground">Prévia: os campos abaixo não são salvos nesta versão.</p>
      <FormField id="entry-title" label="Descrição"><Input placeholder="Ex.: conta de luz" /></FormField>
      <fieldset className="grid gap-2"><legend className="text-sm font-medium">Tipo</legend><div className="flex flex-wrap gap-2">{['Receita', 'Despesa', 'Aporte'].map((kind, index) => <label key={kind} className="cursor-pointer"><input className="peer sr-only" type="radio" name="entry-kind" defaultChecked={index === 1} /><span className="inline-flex min-h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground peer-checked:border-primary peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">{kind}</span></label>)}</div></fieldset>
      <div className="grid gap-5 sm:grid-cols-2"><FormField id="entry-amount" label="Valor previsto"><Input inputMode="decimal" placeholder="R$ 0,00" /></FormField><FormField id="entry-date" label="Vencimento" hint="Dia/mês/ano"><Input inputMode="numeric" placeholder="DD/MM/AAAA" /></FormField></div>
      <FormField id="entry-category" label="Categoria"><Input placeholder="Ex.: Moradia" /></FormField>
      <div><Button type="button" disabled><CirclePlus aria-hidden="true" className="size-4" />Salvar lançamento (em breve)</Button><p className="mt-2 text-xs text-muted-foreground">O formulário só ficará ativo quando a API e o banco estiverem prontos.</p></div>
    </CardContent></Card>
  </>;
}

export function RecurrencesPage() {
  return <>
    <PageHeader eyebrow="Planejamento" title="Recorrências" description="Contas que se repetem ajudam a preparar os próximos meses." action={<Button type="button" disabled><Plus aria-hidden="true" className="size-4" />Nova regra (em breve)</Button>} />
    <section className="grid gap-3 md:grid-cols-2">
      {[{ name: 'Aluguel', detail: 'Todo dia 5 · Moradia', cents: 180000 }, { name: 'Internet Giga Mais', detail: 'Todo dia 10 · Moradia', cents: 9990 }, { name: 'Faculdade', detail: 'Todo dia 20 · Educação', cents: 47785 }].map((rule) => <Card key={rule.name}><CardContent className="flex items-center gap-3 p-4 sm:p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><RefreshCw aria-hidden="true" className="size-[18px]" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{rule.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{rule.detail}</p></div><MoneyValue cents={rule.cents} className="shrink-0 text-sm font-semibold" /></CardContent></Card>)}
    </section>
    <p className="mt-5 rounded-xl border border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">Exemplos fictícios. As regras ainda não geram lançamentos.</p>
  </>;
}

export function SettingsPage() {
  const settings = [
    { Icon: UsersRound, title: 'Pessoas', detail: 'Convide membros para compartilhar o mesmo espaço financeiro.' },
    { Icon: ShieldCheck, title: 'Privacidade e acesso', detail: 'Cada pessoa terá seu próprio login e permissões compartilhadas.' },
    { Icon: ReceiptText, title: 'Preferências financeiras', detail: 'Categorias, formas de pagamento e preferências de exibição.' },
  ];
  return <>
    <PageHeader eyebrow="Seu espaço" title="Configurações" description="Preferências e acesso ao espaço financeiro compartilhado." />
    <section className="grid gap-3 md:grid-cols-2">{settings.map(({ Icon, title, detail }) => <Card key={title}><CardContent className="flex gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><Icon aria-hidden="true" className="size-5" /></span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p><p className="mt-3 text-xs font-medium text-primary">Disponível em uma próxima etapa</p></div></CardContent></Card>)}</section>
    <p className="mt-5 rounded-xl border border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">Esta tela é somente uma prévia. Nenhuma configuração ou convite é alterado.</p>
  </>;
}
