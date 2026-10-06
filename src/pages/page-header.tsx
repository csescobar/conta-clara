import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div className="grid gap-1.5"><p className="text-sm font-medium text-primary">{eyebrow}</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p></div>{action}</header>;
}
