import { ArrowUpRight, Plus } from 'lucide-react';
import { StatusBadge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState, ErrorState, LoadingState } from './components/ui/feedback';
import { FormField, Input } from './components/ui/input';
import { MoneyValue } from './components/ui/money-value';

export default function App() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-10 sm:px-8 sm:py-14">
      <header className="grid gap-3">
        <p className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-semibold tracking-wide text-accent-foreground">PRÉVIA DO SISTEMA VISUAL</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Finanças com mais clareza.</h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">Uma linguagem visual leve, acolhedora e fácil de ler em qualquer tela.</p>
      </header>

      <section aria-labelledby="summary-title" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-sm font-medium text-muted-foreground">Componentes financeiros</p><h2 id="summary-title" className="text-xl font-semibold">Resumo de exemplo</h2></div>
          <Button type="button"><Plus aria-hidden="true" className="size-4" />Ação principal</Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardDescription>Disponível neste mês</CardDescription><CardTitle className="text-3xl"><MoneyValue cents={428590} /></CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <StatusBadge status="paid" />
              <span className="inline-flex items-center gap-1 text-sm font-medium text-success"><ArrowUpRight aria-hidden="true" className="size-4" />8% sobre o mês anterior</span>
            </CardContent>
          </Card>
          <Card><CardHeader><CardDescription>Próxima conta</CardDescription><CardTitle>Internet Giga Mais</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3"><MoneyValue cents={9990} /><StatusBadge status="pending" /></CardContent></Card>
        </div>
      </section>

      <section aria-labelledby="components-title" className="grid gap-4">
        <div><p className="text-sm font-medium text-muted-foreground">Formulários e estados</p><h2 id="components-title" className="text-xl font-semibold">Exemplos acessíveis</h2></div>
        <Card><CardContent className="grid gap-6 md:grid-cols-2">
          <FormField id="example-description" label="Descrição" hint="Exemplo de ajuda associada ao campo."><Input placeholder="Ex.: mercado" /></FormField>
          <FormField id="example-invalid" label="Valor previsto" error="Informe um valor válido."><Input inputMode="decimal" placeholder="R$ 0,00" /></FormField>
        </CardContent></Card>
        <div className="grid gap-4 md:grid-cols-3">
          <EmptyState title="Nenhum lançamento" description="Quando houver itens neste período, eles aparecerão aqui." />
          <LoadingState label="Carregando resumo" />
          <ErrorState title="Não foi possível carregar" description="Tente novamente quando a conexão estiver disponível." />
        </div>
        <div className="flex flex-wrap gap-2"><StatusBadge status="paid" /><StatusBadge status="pending" /><StatusBadge status="late" /></div>
      </section>
    </main>
  );
}
