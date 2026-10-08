import { useState, type FormEvent } from 'react';
import { LockKeyhole, WalletCards } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { FormField, Input } from '../components/ui/input';
import { Alert } from '../components/ui/alert';

export type AuthUser = { id: string; name: string; email: string; role: string; spaceId: string };
export type AuthState = { initialized: boolean; user: AuthUser | null; csrfToken: string };

export function AuthPage({
  initialized,
  csrfToken,
  onAuthenticated,
}: {
  initialized: boolean;
  csrfToken: string;
  onAuthenticated: (user: AuthUser) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${initialized ? 'login' : 'setup'}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(initialized ? { email, password } : { displayName: name.trim(), email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível entrar.');
      onAuthenticated(result.user as AuthUser);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível conectar ao servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="grid w-full max-w-md gap-5">
        <div className="grid justify-items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <WalletCards aria-hidden="true" className="size-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-primary">Conta Clara</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {initialized ? 'Boas-vindas de volta' : 'Configure o espaço da família'}
            </h1>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            {initialized
              ? 'Entre para ver as finanças compartilhadas.'
              : 'Crie o primeiro acesso de administrador. Você poderá convidar outro membro depois.'}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{initialized ? 'Entrar' : 'Criar acesso de administrador'}</CardTitle>
            <CardDescription>O acesso funciona somente no servidor local da sua casa.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4">
              {!initialized && (
                <FormField id="auth-name" label="Seu nome">
                  <Input autoComplete="name" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} />
                </FormField>
              )}
              <FormField id="auth-email" label="E-mail">
                <Input
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </FormField>
              <FormField id="auth-password" label="Senha" hint={!initialized ? 'Use pelo menos 12 caracteres.' : undefined}>
                <Input
                  type="password"
                  autoComplete={initialized ? 'current-password' : 'new-password'}
                  required
                  minLength={initialized ? undefined : 12}
                  maxLength={1024}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </FormField>
              {error && <Alert>{error}</Alert>}
              <Button type="submit" disabled={busy} className="w-full">
                <LockKeyhole aria-hidden="true" className="size-4" />
                {busy ? 'Aguarde…' : initialized ? 'Entrar' : 'Criar meu acesso'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs leading-5 text-muted-foreground">
          {initialized
            ? 'Cada pessoa usa seu próprio login. Os dados do espaço são compartilhados.'
            : 'Sua senha é armazenada com hash; nunca é salva em texto puro.'}
        </p>
      </div>
    </main>
  );
}
