import { Inbox, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

/** O título é `h3` por padrão (dentro de um cartão com título `h2`); use `as="h2"` logo abaixo do título da página. */
export function EmptyState({
  title,
  description,
  action,
  as: Heading = 'h3',
}: {
  title: string;
  description: string;
  action?: ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <section
      role="status"
      aria-label={title}
      className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-9 text-center"
    >
      <Inbox aria-hidden="true" className="mb-1 size-7 text-muted-foreground" />
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
