import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { MoneyValue, type MoneyTone } from '../ui/money-value';
import { StatusBadge, type FinancialStatus } from '../ui/badge';

/** Lista de linhas. `busy` indica recarga em segundo plano: mantém o conteúdo, atenua e avisa leitores de tela. */
export function EntryList({ children, className, busy = false }: { children: ReactNode; className?: string; busy?: boolean }) {
  return (
    <ul aria-busy={busy || undefined} className={cn('divide-y divide-border transition-opacity', busy && 'opacity-60', className)}>
      {children}
    </ul>
  );
}

const iconTones = {
  income: 'bg-success-soft text-success',
  accent: 'bg-accent text-accent-foreground',
  neutral: 'bg-muted text-muted-foreground',
} as const;

export type EntryIconTone = keyof typeof iconTones;

const densities = {
  compact: 'py-3',
  default: 'py-3.5',
  roomy: 'py-4',
} as const;

/**
 * Linha de uma lista financeira: ícone opcional, título, detalhes, bloco de valores, ações e
 * conteúdo extra em largura total (formulários ou detalhes). Renderiza um `<li>`.
 */
export function EntryRow({
  icon: Icon,
  iconTone = 'accent',
  title,
  meta,
  aside,
  actions,
  children,
  density = 'default',
  wrapTitle = false,
  className,
}: {
  icon?: LucideIcon;
  iconTone?: EntryIconTone;
  title: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  density?: keyof typeof densities;
  /** Permite que títulos longos quebrem em vez de serem cortados. */
  wrapTitle?: boolean;
  className?: string;
}) {
  return (
    <li className={cn('flex min-w-0 flex-wrap items-center gap-3 first:pt-0 last:pb-0 sm:gap-4', densities[density], className)}>
      {Icon && (
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', iconTones[iconTone])}>
          <Icon aria-hidden="true" className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', !wrapTitle && 'truncate')}>{title}</p>
        {meta && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{meta}</p>}
      </div>
      {aside}
      {actions && <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto">{actions}</div>}
      {children}
    </li>
  );
}

/** Bloco de valores à direita da linha: valor principal, valor secundário opcional e situação. */
export function EntryAmount({
  cents,
  tone = 'neutral',
  caption,
  status,
  statusLabel,
}: {
  cents: number | string | bigint;
  tone?: MoneyTone;
  caption?: ReactNode;
  status?: FinancialStatus;
  statusLabel?: string;
}) {
  return (
    <div className="grid shrink-0 justify-items-end gap-1">
      <p className="text-sm font-semibold">
        <MoneyValue cents={cents} tone={tone} />
      </p>
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      {status && <StatusBadge status={status} aria-label={statusLabel} />}
    </div>
  );
}
