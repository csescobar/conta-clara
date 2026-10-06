import { useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, CirclePlus, Copy, Download, Filter, Mail, Plus, ReceiptText, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../auth/auth-gate';
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
  const auth = useContext(AuthContext);
  const isAdmin = auth?.user.role === 'admin';
  const [members, setMembers] = useState<Array<{ id: string; name: string; email: string; role: string; is_active: boolean }> | null>(null);
  const [invitations, setInvitations] = useState<Array<{ id: string; email: string; status: string; expires_at: string }> | null>(null);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<{ path: string; label: string; expires: string } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const memberResponse = await fetch('/api/members', { credentials: 'same-origin' });
    if (!memberResponse.ok) throw new Error('Não foi possível carregar as pessoas deste espaço.');
    const memberResult = await memberResponse.json();
    setMembers(memberResult.members);
    if (isAdmin) {
      const inviteResponse = await fetch('/api/members/invitations', { credentials: 'same-origin' });
      if (!inviteResponse.ok) throw new Error('Não foi possível carregar os convites.');
      const inviteResult = await inviteResponse.json();
      setInvitations(inviteResult.invitations);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as pessoas.'));
  }, [load]);

  async function postAction(path: string, body?: Record<string, string>) {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': auth?.csrfToken ?? '', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Não foi possível concluir a operação.');
    return result;
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await postAction('/api/members/invitations', { email });
      setLink({ path: result.activationPath, label: `Convite para ${result.invitation.email}`, expires: 'Este link expira em 48 horas e pode ser usado uma única vez.' });
      setEmail('');
      setCopied(false);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível criar o convite.');
    } finally {
      setBusy(false);
    }
  }

  async function manageInvitation(id: string, action: 'reissue' | 'revoke') {
    setError('');
    setBusy(true);
    try {
      if (action === 'reissue') {
        const result = await postAction(`/api/members/invitations/${id}/reissue`);
        setLink({ path: result.activationPath, label: `Novo convite para ${result.invitation.email}`, expires: 'Este link expira em 48 horas e pode ser usado uma única vez.' });
        setCopied(false);
      } else {
        await postAction(`/api/members/invitations/${id}/revoke`);
      }
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível atualizar o convite.');
    } finally {
      setBusy(false);
    }
  }

  async function createResetLink(member: { id: string; email: string }) {
    setError('');
    setBusy(true);
    try {
      const result = await postAction(`/api/members/${member.id}/password-reset`);
      setLink({ path: result.resetPath, label: `Redefinição de senha para ${member.email}`, expires: 'Este link expira em 1 hora e pode ser usado uma única vez.' });
      setCopied(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível gerar o link.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivateMember(member: { id: string; name: string }) {
    if (!window.confirm(`Desativar o acesso de ${member.name}? As sessões ativas serão encerradas.`)) return;
    setError('');
    setBusy(true);
    try {
      await postAction(`/api/members/${member.id}/deactivate`);
      setLink(null);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível desativar o acesso.');
    } finally {
      setBusy(false);
    }
  }

  async function reactivateMember(member: { id: string }) {
    setError('');
    setBusy(true);
    try {
      await postAction(`/api/members/${member.id}/reactivate`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível reativar o acesso.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(new URL(link.path, window.location.origin).toString());
      setCopied(true);
    } catch {
      setError('A cópia automática não está disponível. Selecione o link abaixo e copie-o.');
    }
  }

  const linkValue = link ? new URL(link.path, window.location.origin).toString() : '';
  const statusText: Record<string, string> = { pending: 'Pendente', accepted: 'Ativado', revoked: 'Revogado', expired: 'Expirado' };
  return <>
    <PageHeader eyebrow="Seu espaço" title="Configurações" description="Pessoas e acessos ao espaço financeiro compartilhado." />
    {error && <p role="alert" className="mb-5 rounded-xl bg-[#fdecec] px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
    <section aria-labelledby="members-heading" className="grid gap-4">
      <Card><CardHeader><CardTitle id="members-heading"><span className="flex items-center gap-2"><UsersRound aria-hidden="true" className="size-5 text-primary" />Pessoas</span></CardTitle><CardDescription>Todos usam seu próprio acesso e compartilham as finanças deste espaço.</CardDescription></CardHeader><CardContent className="grid gap-4">
        {members === null ? <p className="text-sm text-muted-foreground">Carregando pessoas…</p> : members.length ? <ul className="divide-y divide-border">{members.map((member) => <li key={member.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.name}</p><p className="truncate text-xs text-muted-foreground">{member.email}</p></div><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{member.role === 'admin' ? 'Administrador' : 'Membro'}</span>{!member.is_active && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Acesso desativado</span>}{isAdmin && member.is_active && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void createResetLink(member)}><ShieldCheck aria-hidden="true" className="size-4" />Link para redefinir senha</Button>}{isAdmin && member.is_active && member.role === 'member' && <Button type="button" variant="destructive" size="sm" disabled={busy} aria-label={`Desativar acesso de ${member.name}`} onClick={() => void deactivateMember(member)}>Desativar acesso</Button>}{isAdmin && !member.is_active && member.role === 'member' && <Button type="button" variant="outline" size="sm" disabled={busy} aria-label={`Reativar acesso de ${member.name}`} onClick={() => void reactivateMember(member)}>Reativar acesso</Button>}</li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum membro encontrado.</p>}
      </CardContent></Card>

      {isAdmin && <Card><CardHeader><CardTitle><span className="flex items-center gap-2"><Mail aria-hidden="true" className="size-5 text-primary" />Convidar pessoa</span></CardTitle><CardDescription>Gere um link local para a pessoa definir o próprio nome e senha. O link vale por 48 horas.</CardDescription></CardHeader><CardContent className="grid gap-5">
        <form onSubmit={createInvitation} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1"><FormField id="invite-email" label="E-mail da pessoa"><Input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></FormField></div><Button type="submit" disabled={busy}><Plus aria-hidden="true" className="size-4" />Gerar convite</Button></form>
        {link && <div className="grid gap-2 rounded-xl border border-primary/30 bg-accent/40 p-4"><p className="text-sm font-semibold">{link.label}</p><p className="text-xs text-muted-foreground">{link.expires} Copie e entregue o link à pessoa; ele não será enviado por e-mail.</p><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Link de acesso" readOnly value={linkValue} onFocus={(event) => event.currentTarget.select()} /><Button type="button" variant="outline" onClick={() => void copyLink()}><Copy aria-hidden="true" className="size-4" />{copied ? 'Copiado' : 'Copiar link'}</Button></div></div>}
        <div className="grid gap-2">{invitations === null ? <p className="text-sm text-muted-foreground">Carregando convites…</p> : invitations.length ? invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center gap-3 border-t border-border pt-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{invitation.email}</p><p className="text-xs text-muted-foreground">{statusText[invitation.status] ?? invitation.status} · expira {new Date(invitation.expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p></div>{invitation.status !== 'accepted' && <><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void manageInvitation(invitation.id, 'reissue')}><RefreshCw aria-hidden="true" className="size-4" />Reemitir</Button>{invitation.status === 'pending' && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void manageInvitation(invitation.id, 'revoke')}>Invalidar</Button>}</>}</div>) : <p className="text-sm text-muted-foreground">Nenhum convite emitido.</p>}</div>
      </CardContent></Card>}

      <Card><CardContent className="flex gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><ReceiptText aria-hidden="true" className="size-5" /></span><div><h2 className="font-semibold">Preferências financeiras</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Categorias e formas de pagamento estarão disponíveis em uma próxima etapa.</p></div></CardContent></Card>
    </section>
  </>;
}
