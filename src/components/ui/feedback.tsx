import { Inbox, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** O título é `h3` por padrão (dentro de um cartão com título `h2`); use `as="h2"` logo abaixo do título da página. */
export function EmptyState({
  title,
  description,
  action,
  as: Heading = 'h3',
  compact = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  as?: 'h2' | 'h3';
  /** Versão menor para listas dentro de formulários e configurações. */
  compact?: boolean;
}) {
  return (
    <section
      role="status"
      aria-label={title}
      className={cn(
        'grid justify-items-center gap-2 rounded-2xl border border-dashed border-border bg-card text-center',
        compact ? 'px-4 py-5' : 'px-6 py-9',
      )}
    >
      <Inbox aria-hidden="true" className={cn('text-muted-foreground', compact ? 'size-5' : 'mb-1 size-7')} />
      <Heading className="font-semibold">{title}</Heading>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {action}
    </section>
  );
}

export function LoadingState({ label = 'Carregando dados' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-live="polite"
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm font-medium text-muted-foreground"
    >
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-primary motion-reduce:animate-none" />
      {label}
    </div>
  );
}
