import { AlertTriangle, Inbox, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <section role="status" aria-label={title} className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-9 text-center">
      <Inbox aria-hidden="true" className="mb-1 size-7 text-muted-foreground" />
      <h3 className="font-semibold">{title}</h3>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {action}
    </section>
  );
}

export function LoadingState({ label = 'Carregando dados' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm font-medium text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-primary motion-reduce:animate-none" />
      {label}
    </div>
  );
}

export function ErrorState({ title, description }: { title: string; description: string }) {
  return (
    <section role="alert" aria-label={title} className="flex items-start gap-3 rounded-2xl border border-destructive-border bg-destructive-surface p-5">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="grid gap-1">
        <h3 className="font-semibold text-destructive">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}
