import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthPage, type AuthState, type AuthUser } from './auth-page';
import { LoadingState } from '../components/ui/feedback';
import { AppLayout } from '../components/app-layout';

export const AuthContext = createContext<{ user: AuthUser; csrfToken: string } | null>(null);

export function AuthGate({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      const response = await fetch('/api/auth/state', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Não foi possível conectar à API.');
      setState(await response.json() as AuthState);
    } catch {
      setLoadError('Não foi possível conectar ao servidor local. Confira se ele está em execução e tente novamente.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  function acceptLogin(user: AuthUser) {
    setState((current) => current ? { ...current, initialized: true, user } : current);
  }

  async function logout() {
    if (!state) return;
    setActionError('');
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': state.csrfToken },
      });
      if (!response.ok) throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
      setState({ ...state, user: null });
    } catch {
      setActionError('Não foi possível encerrar a sessão. Confira a conexão e tente novamente.');
    }
  }

  if (!state) {
    if (loadError) {
      return <main className="grid min-h-screen place-items-center px-5"><div className="grid max-w-sm gap-3 text-center"><p role="alert" className="text-sm text-destructive">{loadError}</p><button type="button" onClick={() => void refresh()} className="mx-auto min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Tentar novamente</button></div></main>;
    }
    return <main className="grid min-h-screen place-items-center px-5"><LoadingState label="Conectando ao servidor" /></main>;
  }

  if (!state.user) return <AuthPage initialized={state.initialized} csrfToken={state.csrfToken} onAuthenticated={acceptLogin} />;
  return <AuthContext.Provider value={{ user: state.user, csrfToken: state.csrfToken }}><AppLayout user={state.user} onLogout={() => void logout()} notice={actionError}>{children ?? <Outlet />}</AppLayout></AuthContext.Provider>;
}
