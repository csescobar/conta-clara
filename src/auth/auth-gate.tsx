import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthPage, type AuthState, type AuthUser } from './auth-page';
import { LoadingState } from '../components/ui/feedback';
import { AppLayout } from '../components/app-layout';
import { OfflineWorkspaceProvider, useOfflineWorkspace } from '../offline/offline-context';
import { clearOfflineLogoutMarker, clearRememberedOfflineUser, isOfflineLogoutMarked, loadRememberedOfflineUser, markOfflineLogout, rememberOfflineUser } from '../offline/offline-store';

export const AuthContext = createContext<{ user: AuthUser; csrfToken: string } | null>(null);

function AuthenticatedLayout({ user, csrfToken, onLogout, notice, children }: {
  user: AuthUser;
  csrfToken: string;
  onLogout: (localOnly: boolean) => Promise<boolean>;
  notice: string;
  children: ReactNode;
}) {
  return <OfflineWorkspaceProvider key={`${user.spaceId}\u0000${user.id}`} scope={{ userId: user.id, spaceId: user.spaceId }}><AuthenticatedSession user={user} csrfToken={csrfToken} onLogout={onLogout} notice={notice}>{children}</AuthenticatedSession></OfflineWorkspaceProvider>;
}

function AuthenticatedSession({ user, csrfToken, notice, onLogout, children }: {
  user: AuthUser;
  csrfToken: string;
  notice: string;
  onLogout: (localOnly: boolean) => Promise<boolean>;
  children: ReactNode;
}) {
  const offline = useOfflineWorkspace();
  const [localNotice, setLocalNotice] = useState('');

  useEffect(() => {
    if (offline?.ready && offline.online && csrfToken) void offline.sync(csrfToken);
  }, [csrfToken, offline?.online, offline?.pendingCount, offline?.ready, offline?.sync]);

  useEffect(() => {
    const syncOnFocus = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine && csrfToken) {
        offline?.setOnline(true);
        void offline?.sync(csrfToken);
      }
    };
    window.addEventListener('focus', syncOnFocus);
    return () => window.removeEventListener('focus', syncOnFocus);
  }, [csrfToken, offline?.setOnline, offline?.sync]);

  async function logout() {
    setLocalNotice('');
    await offline?.sync(csrfToken);
    const currentWorkspace = await offline?.refresh();
    const pendingCount = currentWorkspace?.operations.length ?? 0;
    if (pendingCount && !window.confirm(`Há ${pendingCount} alteração${pendingCount === 1 ? '' : 'ões'} sem sincronização. Sair e descartar essas alterações locais?`)) return;
    const loggedOut = await onLogout(Boolean(offline && !offline.online));
    if (!loggedOut) return;
    try {
      await offline?.clear();
    } catch {
      setLocalNotice('Não foi possível limpar os dados deste usuário neste aparelho. Tente novamente antes de sair.');
    }
  }

  return <AuthContext.Provider value={{ user, csrfToken }}><AppLayout user={user} csrfToken={csrfToken} onLogout={() => void logout()} notice={[notice, localNotice].filter(Boolean).join(' ')}>{children}</AppLayout></AuthContext.Provider>;
}

export function AuthGate({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      const response = await fetch('/api/auth/state', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Não foi possível conectar à API.');
      const authState = await response.json() as AuthState;
      if (authState.user && await isOfflineLogoutMarked(authState.user).catch(() => false)) {
        setState({ ...authState, user: null });
        return;
      }
      setState(authState);
      if (authState.user) void rememberOfflineUser(authState.user).catch(() => undefined);
      else void clearRememberedOfflineUser().catch(() => undefined);
    } catch (loadFailure) {
      if (typeof navigator !== 'undefined' && (!navigator.onLine || loadFailure instanceof TypeError)) {
        const remembered = await loadRememberedOfflineUser().catch(() => null);
        if (remembered) {
          setState({ initialized: true, user: remembered.user, csrfToken: '' });
          return;
        }
      }
      setLoadError('Não foi possível conectar ao servidor local. Confira se ele está em execução e tente novamente.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const revalidate = () => { void refresh(); };
    window.addEventListener('conta-clara:session-expired', revalidate);
    window.addEventListener('online', revalidate);
    window.addEventListener('focus', revalidate);
    return () => {
      window.removeEventListener('conta-clara:session-expired', revalidate);
      window.removeEventListener('online', revalidate);
      window.removeEventListener('focus', revalidate);
    };
  }, [refresh]);

  function acceptLogin(user: AuthUser) {
    void clearOfflineLogoutMarker().catch(() => undefined);
    void rememberOfflineUser(user).catch(() => undefined);
    setState((current) => current ? { ...current, initialized: true, user } : current);
  }

  async function logout(localOnly: boolean): Promise<boolean> {
    if (!state?.user) return false;
    setActionError('');
    try {
      if (localOnly) {
        await markOfflineLogout(state.user!);
        setState({ ...state, user: null });
        return true;
      }
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': state.csrfToken },
      });
      if (!response.ok) throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
      setState({ ...state, user: null });
      return true;
    } catch {
      void rememberOfflineUser(state.user).catch(() => undefined);
      setActionError('Não foi possível encerrar a sessão. Confira a conexão e tente novamente.');
      return false;
    }
  }

  if (!state) {
    if (loadError) {
      return <main className="grid min-h-screen place-items-center px-5"><div className="grid max-w-sm gap-3 text-center"><p role="alert" className="text-sm text-destructive">{loadError}</p><button type="button" onClick={() => void refresh()} className="mx-auto min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Tentar novamente</button></div></main>;
    }
    return <main className="grid min-h-screen place-items-center px-5"><LoadingState label="Conectando ao servidor" /></main>;
  }

  if (!state.user) return <AuthPage initialized={state.initialized} csrfToken={state.csrfToken} onAuthenticated={acceptLogin} />;
  return <AuthenticatedLayout user={state.user} csrfToken={state.csrfToken} onLogout={logout} notice={actionError}>{children ?? <Outlet />}</AuthenticatedLayout>;
}
