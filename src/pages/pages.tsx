import { lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Mail, Plus, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../auth/auth-gate';
import { StatusBadge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState, LoadingState } from '../components/ui/feedback';
import { FormField, Input } from '../components/ui/input';
import { currentMonthInputValue, formatBrazilianDate, formatBrazilianDateTime, formatBrazilianMonthLong } from '../lib/finance';
import type { ChartSummary, ExpenseCategoryChartEntry } from './dashboard-charts';
import { CatalogSettings } from './catalog-settings';
import { CardSettings } from './card-settings';
import { BackupSettings } from './backup-settings';
import { PageHeader } from './page-header';
import { isAuthenticationFailure, isNetworkFailure, useOfflineWorkspace } from '../offline/offline-context';
import { MoneyValue } from '../components/ui/money-value';
import { MonthField } from '../components/ui/form-controls';
import { useConfirmDialog } from '../components/ui/dialog';
import { Alert } from '../components/ui/alert';

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

function moveMonth(value: string, offset: number) {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

function DashboardMetric({ title, cents, description }: { title: string; cents: string; description: string }) {
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:p-5">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold tracking-tight sm:text-display">
          <MoneyValue cents={cents} tone="balance" />
        </p>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function DashboardEntryList({ entries, overdue = false }: { entries: DashboardEntry[]; overdue?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {entries.map((entry) => (
        <li key={entry.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0 sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{entry.description}</p>
            <p className={`mt-0.5 text-xs ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              Vence em {formatBrazilianDate(entry.due_on)}
            </p>
          </div>
          <div className="grid shrink-0 justify-items-end gap-1">
            <p className="text-sm font-semibold tabular-nums">
              <MoneyValue cents={entry.planned_cents} />
            </p>
            {overdue && <StatusBadge status="late" />}
          </div>
        </li>
      ))}
    </ul>
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Mês anterior"
                onClick={() => setMonth((value) => moveMonth(value, -1))}
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </Button>
              <MonthField
                aria-label="Mês do painel"
                required
                className="w-[7.5rem] text-center"
                value={month}
                onChange={(value) => {
                  if (value) setMonth(value);
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Próximo mês"
                onClick={() => setMonth((value) => moveMonth(value, 1))}
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <Button asChild>
              <Link to="/lancamentos/novo">
                <Plus aria-hidden="true" className="size-4" />
                Adicionar lançamento
              </Link>
            </Button>
          </div>
        }
      />
      {error && <Alert className="mb-4">{error}</Alert>}
      {loading && !dashboard ? (
        <LoadingState label="Carregando painel financeiro" />
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
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <caption className="sr-only">Valores previstos e realizados em {heading}</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-3 pr-4 font-medium">
                        Movimentação
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        Previsto
                      </th>
                      <th scope="col" className="py-3 pl-4 text-right font-medium">
                        Realizado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['Receitas', dashboard.planned.incomeCents, dashboard.realized.incomeCents],
                        ['Despesas', dashboard.planned.expenseCents, dashboard.realized.expenseCents],
                        ['Aportes', dashboard.planned.investmentCents, dashboard.realized.investmentCents],
                      ] as const
                    ).map(([label, planned, realized]) => (
                      <tr key={label} className="border-b border-border last:border-0">
                        <th scope="row" className="py-3 pr-4 text-left font-medium">
                          {label}
                        </th>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <MoneyValue cents={planned} />
                        </td>
                        <td className="py-3 pl-4 text-right tabular-nums">
                          <MoneyValue cents={realized} />
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/40">
                      <th scope="row" className="py-3 pr-4 text-left font-semibold">
                        Resultado do período
                      </th>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        <MoneyValue cents={dashboard.planned.resultCents} />
                      </td>
                      <td className="py-3 pl-4 text-right font-semibold tabular-nums">
                        <MoneyValue cents={dashboard.realized.resultCents} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Suspense fallback={<LoadingState label="Carregando gráficos financeiros" />}>
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
              {month > moveMonth(currentMonthInputValue(), 12)
                ? 'O mês selecionado está além desse horizonte: lançamentos manuais continuam consultáveis, mas novas projeções recorrentes não são garantidas.'
                : 'Cada mês do painel é salvo no aparelho quando aberto online; os demais meses precisam de conexão para serem carregados.'}
            </p>
          </div>
        )
      )}
    </>
  );
}

export function SettingsPage() {
  const [confirm, confirmDialog] = useConfirmDialog();
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
      setLink({
        path: result.activationPath,
        label: `Convite para ${result.invitation.email}`,
        expires: 'Este link expira em 48 horas e pode ser usado uma única vez.',
      });
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
        setLink({
          path: result.activationPath,
          label: `Novo convite para ${result.invitation.email}`,
          expires: 'Este link expira em 48 horas e pode ser usado uma única vez.',
        });
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
      setLink({
        path: result.resetPath,
        label: `Redefinição de senha para ${member.email}`,
        expires: 'Este link expira em 1 hora e pode ser usado uma única vez.',
      });
      setCopied(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível gerar o link.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivateMember(member: { id: string; name: string }) {
    if (
      !(await confirm({
        title: `Desativar o acesso de ${member.name}?`,
        description: 'As sessões ativas serão encerradas.',
        confirmLabel: 'Desativar acesso',
        destructive: true,
      }))
    )
      return;
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
  return (
    <>
      {confirmDialog}
      <PageHeader eyebrow="Seu espaço" title="Configurações" description="Pessoas e acessos ao espaço financeiro compartilhado." />
      {error && <Alert className="mb-5">{error}</Alert>}
      <section aria-labelledby="members-heading" className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle id="members-heading">
              <span className="flex items-center gap-2">
                <UsersRound aria-hidden="true" className="size-5 text-primary" />
                Pessoas
              </span>
            </CardTitle>
            <CardDescription>Todos usam seu próprio acesso e compartilham as finanças deste espaço.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {members === null ? (
              <p className="text-sm text-muted-foreground">Carregando pessoas…</p>
            ) : members.length ? (
              <ul className="divide-y divide-border">
                {members.map((member) => (
                  <li key={member.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{member.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                      {member.role === 'admin' ? 'Administrador' : 'Membro'}
                    </span>
                    {!member.is_active && (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Acesso desativado</span>
                    )}
                    {isAdmin && member.is_active && (
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void createResetLink(member)}>
                        <ShieldCheck aria-hidden="true" className="size-4" />
                        Link para redefinir senha
                      </Button>
                    )}
                    {isAdmin && member.is_active && member.role === 'member' && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        aria-label={`Desativar acesso de ${member.name}`}
                        onClick={() => void deactivateMember(member)}
                      >
                        Desativar acesso
                      </Button>
                    )}
                    {isAdmin && !member.is_active && member.role === 'member' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        aria-label={`Reativar acesso de ${member.name}`}
                        onClick={() => void reactivateMember(member)}
                      >
                        Reativar acesso
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum membro encontrado.</p>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Mail aria-hidden="true" className="size-5 text-primary" />
                  Convidar pessoa
                </span>
              </CardTitle>
              <CardDescription>Gere um link local para a pessoa definir o próprio nome e senha. O link vale por 48 horas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <form onSubmit={createInvitation} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <FormField id="invite-email" label="E-mail da pessoa">
                    <Input
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </FormField>
                </div>
                <Button type="submit" disabled={busy}>
                  <Plus aria-hidden="true" className="size-4" />
                  Gerar convite
                </Button>
              </form>
              {link && (
                <div className="grid gap-2 rounded-xl border border-primary/30 bg-accent/40 p-4">
                  <p className="text-sm font-semibold">{link.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {link.expires} Copie e entregue o link à pessoa; ele não será enviado por e-mail.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input aria-label="Link de acesso" readOnly value={linkValue} onFocus={(event) => event.currentTarget.select()} />
                    <Button type="button" variant="outline" onClick={() => void copyLink()}>
                      <Copy aria-hidden="true" className="size-4" />
                      {copied ? 'Copiado' : 'Copiar link'}
                    </Button>
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                {invitations === null ? (
                  <p className="text-sm text-muted-foreground">Carregando convites…</p>
                ) : invitations.length ? (
                  invitations.map((invitation) => (
                    <div key={invitation.id} className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{invitation.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {statusText[invitation.status] ?? invitation.status} · expira {formatBrazilianDateTime(invitation.expires_at)}
                        </p>
                      </div>
                      {invitation.status !== 'accepted' && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void manageInvitation(invitation.id, 'reissue')}
                          >
                            <RefreshCw aria-hidden="true" className="size-4" />
                            Reemitir
                          </Button>
                          {invitation.status === 'pending' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => void manageInvitation(invitation.id, 'revoke')}
                            >
                              Invalidar
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum convite emitido.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {isAdmin && <BackupSettings />}

        <CardSettings />

        <div className="xl:col-span-1">
          <CatalogSettings />
        </div>
      </section>
    </>
  );
}
