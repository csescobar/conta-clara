import {
  ArrowLeftRight,
  CreditCard,
  Ellipsis,
  FileText,
  History,
  House,
  LogOut,
  RefreshCw,
  Repeat2,
  Settings,
  WalletCards,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { ToastHost } from './ui/toast-host';
import type { AuthUser } from '../auth/auth-page';
import { cn } from '../lib/utils';
import { useOfflineWorkspace } from '../offline/offline-context';
import { formatBrazilianDateTime } from '../lib/finance';
import { Alert } from './ui/alert';

const SyncConflicts = lazy(() => import('./sync-conflicts'));

const links = [
  { to: '/', label: 'Visão geral', Icon: House, end: true },
  // O hífen opcional permite quebrar a palavra no menu móvel de 320 px sem reduzir o texto abaixo de 12 px.
  { to: '/lancamentos', label: 'Lançamentos', mobileLabel: 'Lança\u00admentos', Icon: ArrowLeftRight, end: false },
  { to: '/compras', label: 'Compras', Icon: CreditCard, end: false },
  { to: '/faturas', label: 'Faturas', Icon: FileText, end: false },
  { to: '/recorrencias', label: 'Recorrências', Icon: Repeat2, end: false },
  { to: '/historico', label: 'Histórico', Icon: History, end: false },
  { to: '/configuracoes', label: 'Configurações', Icon: Settings, end: false },
];

function Brand() {
  return (
    <Link
      to="/"
      className="flex w-fit items-center gap-3 rounded-lg text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
        <WalletCards aria-hidden="true" className="size-5" />
      </span>
      <span className="grid">
        <span className="font-semibold tracking-tight">Conta Clara</span>
        <span className="text-xs text-muted-foreground">Finanças da família</span>
      </span>
    </Link>
  );
}

function Navigation() {
  return (
    <nav aria-label="Navegação principal" className="grid gap-1">
      {links.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              'min-h-11 gap-3 px-3',
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.9} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

const mobilePrimaryLinks = links.slice(0, 4);
const mobileItemClassName =
  'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-center text-xs font-medium leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const mobileMoreLinks = links.slice(4);

function MobileNavigation() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const activeMoreLink = mobileMoreLinks.find(({ to }) => location.pathname === to || location.pathname.startsWith(`${to}/`));

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;

    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    };
    const dismissOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setMoreOpen(false);
    };

    document.addEventListener('keydown', dismissOnEscape);
    document.addEventListener('pointerdown', dismissOnOutsidePress);
    return () => {
      document.removeEventListener('keydown', dismissOnEscape);
      document.removeEventListener('pointerdown', dismissOnOutsidePress);
    };
  }, [moreOpen]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
    >
      <nav aria-label="Navegação principal móvel" className="grid grid-cols-5">
        {mobilePrimaryLinks.map(({ to, label, mobileLabel, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={mobileLabel ? label : undefined}
            className={({ isActive }) =>
              cn(
                mobileItemClassName,
                isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.9} />
            <span className="max-w-full break-words">{mobileLabel ?? label}</span>
          </NavLink>
        ))}
        <button
          ref={moreButtonRef}
          type="button"
          aria-label={activeMoreLink ? `Mais páginas, página atual: ${activeMoreLink.label}` : 'Mais páginas'}
          aria-controls="mobile-more-links"
          aria-expanded={moreOpen}
          aria-current={activeMoreLink ? 'page' : undefined}
          onClick={() => setMoreOpen((open) => !open)}
          className={cn(
            mobileItemClassName,
            moreOpen || activeMoreLink ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Ellipsis aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.9} />
          <span>Mais</span>
        </button>
      </nav>
      <nav
        id="mobile-more-links"
        aria-label="Mais páginas"
        hidden={!moreOpen}
        className={cn(
          'absolute bottom-full right-2 mb-2 w-[min(15rem,calc(100vw-1rem))] rounded-2xl border border-border bg-card p-2 shadow-xl',
          moreOpen ? 'block' : 'hidden',
        )}
      >
        {mobileMoreLinks.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => {
              setMoreOpen(false);
              moreButtonRef.current?.focus();
            }}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.9} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function AppLayout({
  user,
  csrfToken,
  onLogout,
  notice,
  children,
}: {
  user: AuthUser;
  csrfToken: string;
  onLogout: () => void;
  notice?: string;
  children: ReactNode;
}) {
  const offline = useOfflineWorkspace();
  const lastUpdated = formatBrazilianDateTime(offline?.lastSyncedAt);
  const offlineMessage = !offline?.supported
    ? 'Este navegador não permite armazenar dados para uso offline.'
    : !offline.ready
      ? 'Preparando os dados offline deste usuário…'
      : !offline.online
        ? `Sem conexão de rede${offline.pendingCount ? ` · ${offline.pendingCount} ${offline.pendingCount === 1 ? 'alteração pendente' : 'alterações pendentes'}` : ''}.`
        : offline.syncing
          ? `Sincronizando ${offline.pendingCount} ${offline.pendingCount === 1 ? 'alteração' : 'alterações'}…`
          : offline.pendingCount
            ? `Rede conectada · ${offline.pendingCount} ${offline.pendingCount === 1 ? 'alteração aguarda' : 'alterações aguardam'} sincronização.`
            : 'Rede conectada · nenhuma alteração pendente.';
  const conflicts = offline?.operations.filter((operation) => operation.conflict) ?? [];
  const cardConflicts = offline?.cardOperations.filter((operation) => operation.conflict) ?? [];
  const purchaseConflicts = offline?.purchaseOperations.filter((operation) => operation.conflict) ?? [];
  const invoiceConflicts = offline?.invoiceOperations.filter((operation) => operation.conflict) ?? [];

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-card px-4 py-3 font-medium text-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Pular para o conteúdo principal
      </a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card px-5 py-7 lg:flex">
        <Brand />
        <div className="mt-10">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Menu</p>
          <Navigation />
        </div>
        <div className="mt-auto grid gap-3 rounded-2xl bg-secondary p-4">
          <div>
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onLogout}>
            <LogOut aria-hidden="true" className="size-4" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex min-h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-8 lg:hidden">
          <Brand />
          <Button type="button" variant="ghost" size="icon" aria-label="Sair de Conta Clara" onClick={onLogout}>
            <LogOut aria-hidden="true" className="size-5" />
          </Button>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-28 pt-7 sm:px-8 sm:pt-10 lg:px-10 lg:pb-12">
          {notice && <Alert className="mb-5">{notice}</Alert>}
          {offline && (
            <div
              role="status"
              aria-live="polite"
              className={`mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 text-xs leading-5 ${offline.online && offline.pendingCount === 0 ? 'border-border bg-card text-muted-foreground' : 'border-warning-border bg-warning-surface text-warning'}`}
            >
              <span>{offlineMessage}</span>
              {lastUpdated && (
                <span>
                  Última atualização online: <time dateTime={offline.lastSyncedAt ?? undefined}>{lastUpdated}</time>
                </span>
              )}
              {offline.pendingCount > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={(typeof navigator !== 'undefined' && !navigator.onLine) || offline.syncing || !csrfToken}
                  onClick={() => {
                    offline.setOnline(true);
                    void offline.sync(csrfToken);
                  }}
                >
                  <RefreshCw aria-hidden="true" className={`size-3.5 ${offline.syncing ? 'animate-spin' : ''}`} />
                  Sincronizar agora
                </Button>
              )}
            </div>
          )}
          {offline && (conflicts.length > 0 || cardConflicts.length > 0 || purchaseConflicts.length > 0 || invoiceConflicts.length > 0) && (
            <Suspense fallback={null}>
              <SyncConflicts offline={offline} csrfToken={csrfToken} />
            </Suspense>
          )}
          {offline?.syncError && <Alert className="mb-5">{offline.syncError}</Alert>}
          {children}
        </main>
      </div>

      <MobileNavigation />
      <ToastHost />
    </div>
  );
}
