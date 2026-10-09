import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Conjunto de ações de uma página ou seção; quebra de linha em tela estreita. */
export function ActionToolbar({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}
