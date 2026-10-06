import { ArrowLeftRight, History, House, LogOut, Repeat2, Settings, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Button } from './ui/button';
import type { AuthUser } from '../auth/auth-page';
import { cn } from '../lib/utils';

const links = [
  { to: '/', label: 'Visão geral', Icon: House, end: true },
  { to: '/lancamentos', label: 'Lançamentos', Icon: ArrowLeftRight, end: false },
  { to: '/recorrencias', label: 'Recorrências', Icon: Repeat2, end: false },
  { to: '/historico', label: 'Histórico', Icon: History, end: false },
  { to: '/configuracoes', label: 'Configurações', Icon: Settings, end: false },
];

function Brand() {
  return (
    <Link to="/" className="flex w-fit items-center gap-3 rounded-lg text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
      <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><WalletCards aria-hidden="true" className="size-5" /></span>
      <span className="grid"><span className="font-semibold tracking-tight">Conta Clara</span><span className="text-xs text-muted-foreground">Finanças da família</span></span>
    </Link>
  );
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav aria-label={mobile ? 'Navegação principal móvel' : 'Navegação principal'} className={mobile ? 'grid grid-cols-5' : 'grid gap-1'}>
      {links.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => cn(
            'flex items-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            mobile ? 'min-h-14 flex-col justify-center gap-1 px-1 text-[0.68rem]' : 'min-h-11 gap-3 px-3',
            isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.9} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppLayout({ user, onLogout, notice, children }: { user: AuthUser; onLogout: () => void; notice?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-card px-4 py-3 font-medium text-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Pular para o conteúdo principal</a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card px-5 py-7 lg:flex">
        <Brand />
        <div className="mt-10"><p className="mb-3 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Menu</p><Navigation /></div>
        <div className="mt-auto grid gap-3 rounded-2xl bg-secondary p-4"><div><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div><Button type="button" variant="outline" size="sm" onClick={onLogout}><LogOut aria-hidden="true" className="size-4" />Sair</Button></div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex min-h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-8 lg:hidden">
          <Brand />
          <Button type="button" variant="ghost" size="icon" aria-label="Sair de Conta Clara" onClick={onLogout}><LogOut aria-hidden="true" className="size-5" /></Button>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-28 pt-7 sm:px-8 sm:pt-10 lg:px-10 lg:pb-12">
          {notice && <p role="alert" className="mb-5 rounded-xl bg-[#fdecec] px-4 py-3 text-sm font-medium text-destructive">{notice}</p>}
          {children}
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden">
        <Navigation mobile />
      </div>
    </div>
  );
}
