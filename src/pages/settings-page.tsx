import { useCallback, useContext, useEffect, useState, type FormEvent } from 'react';
import { Copy, Mail, Plus, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';
import { AuthContext } from '../auth/auth-gate';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { FormField, Input } from '../components/ui/input';
import { formatBrazilianDateTime } from '../lib/finance';
import { CatalogSettings } from './catalog-settings';
import { CardSettings } from './card-settings';
import { BackupSettings } from './backup-settings';
import { PageHeader } from './page-header';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import { Alert } from '../components/ui/alert';
import { AppearanceSettings } from './appearance-settings';
import { EmptyState } from '../components/ui/feedback';
import { TextSkeleton } from '../components/ui/skeleton';
import { toast } from '../components/ui/toast-store';

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
      toast('Convite gerado. Copie o link e entregue manualmente.');
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
        toast('Novo convite gerado. O link anterior deixou de valer.');
      } else {
        await postAction(`/api/members/invitations/${id}/revoke`);
        // Sem desfazer: um convite invalidado só pode ser substituído por outro, com novo link.
        toast('Convite invalidado.');
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
      toast('Link de redefinição gerado. Copie e entregue manualmente.');
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
      // Sem desfazer: as sessões encerradas não voltam e reativar é uma decisão separada.
      toast('O acesso da pessoa foi desativado.');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível desativar o acesso.');
    } finally {
      setBusy(false);
    }
  }

  async function reactivateMember(member: { id: string; name: string }) {
    setError('');
    setBusy(true);
    try {
      await postAction(`/api/members/${member.id}/reactivate`);
      await load();
      toast('O acesso da pessoa foi reativado.');
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
      <section aria-labelledby="appearance-heading" className="mb-4 grid gap-4">
        <AppearanceSettings />
      </section>
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
              <TextSkeleton label="Carregando pessoas" />
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
              <EmptyState
                compact
                title="Nenhuma pessoa encontrada"
                description="Gere um convite para incluir a primeira pessoa neste espaço."
              />
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
                  <TextSkeleton label="Carregando convites" lines={2} />
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
                  <EmptyState
                    compact
                    title="Nenhum convite emitido"
                    description="Informe o e-mail da pessoa no campo acima para gerar um link de convite."
                  />
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
