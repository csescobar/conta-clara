import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { FormField, Input } from '../components/ui/input';

type Purpose = 'invite' | 'password-reset';
type LinkPreview = { valid: boolean; email?: string };

export function OneTimeAccessPage({ purpose }: { purpose: Purpose }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [authResponse, previewResponse] = await Promise.all([
          fetch('/api/auth/state', { credentials: 'same-origin' }),
          fetch(`/api/auth/${purpose === 'invite' ? 'invites' : 'password-resets'}/${encodeURIComponent(token ?? '')}`, { credentials: 'same-origin' }),
        ]);
        if (!authResponse.ok || !previewResponse.ok) throw new Error('Não foi possível verificar este link.');
        const [authState, linkPreview] = await Promise.all([authResponse.json(), previewResponse.json() as Promise<LinkPreview>]);
        if (active) {
          setCsrfToken(authState.csrfToken as string);
          setPreview(linkPreview);
        }
      } catch {
        if (active) setError('Não foi possível verificar este link. Confira a conexão e tente novamente.');
      }
    }
    void load();
    return () => { active = false; };
  }, [purpose, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    try {
      const acceptingInvite = purpose === 'invite';
      const response = await fetch(`/api/auth/${acceptingInvite ? 'accept-invite' : 'password-reset'}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(acceptingInvite ? { token, displayName: name.trim(), password } : { token, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível concluir o acesso.');
      navigate('/', { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível conectar ao servidor.');
    } finally {
      setBusy(false);
    }
  }

  const title = purpose === 'invite' ? 'Ativar convite' : 'Redefinir senha';
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="grid w-full max-w-md gap-5">
        <div className="grid gap-2 text-center"><p className="text-sm font-semibold text-primary">Conta Clara</p><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="text-sm leading-6 text-muted-foreground">{purpose === 'invite' ? 'Defina seu nome e senha para acessar as finanças compartilhadas.' : 'Escolha uma nova senha para sua conta.'}</p></div>
        <Card>
          <CardHeader><CardTitle>{preview?.valid ? title : 'Link indisponível'}</CardTitle><CardDescription>{preview?.valid ? preview.email : 'Os links são de uso único e expiram.'}</CardDescription></CardHeader>
          {preview?.valid && <CardContent><form onSubmit={submit} className="grid gap-4">
            {purpose === 'invite' && <FormField id="invite-name" label="Seu nome"><Input autoComplete="name" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></FormField>}
            <FormField id="new-password" label="Nova senha" hint="Use pelo menos 12 caracteres."><Input type="password" autoComplete="new-password" required minLength={12} maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} /></FormField>
            <FormField id="confirm-password" label="Confirme a senha"><Input type="password" autoComplete="new-password" required minLength={12} maxLength={1024} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></FormField>
            {error && <p role="alert" className="rounded-xl bg-[#fdecec] px-3.5 py-3 text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || !csrfToken} className="w-full">{busy ? 'Aguarde…' : purpose === 'invite' ? 'Ativar acesso' : 'Salvar nova senha'}</Button>
          </form></CardContent>}
        </Card>
        {error && !preview?.valid && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
        {preview && !preview.valid && <p role="alert" className="text-center text-sm text-destructive">Este link é inválido, expirou ou já foi utilizado. Peça um novo link ao administrador.</p>}
      </div>
    </main>
  );
}
