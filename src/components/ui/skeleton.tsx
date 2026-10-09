import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Card, CardContent, CardHeader } from './card';

/** Bloco decorativo de carregamento; pulsa somente quando a pessoa não pediu movimento reduzido. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('rounded-lg bg-muted motion-safe:animate-pulse', className)} />;
}

/**
 * Região de carregamento anunciada por leitores de tela: o nome acessível e o texto oculto dizem o que carrega,
 * enquanto os blocos visuais ficam escondidos da tecnologia assistiva.
 */
export function SkeletonRegion({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-label={label} aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Linhas de lista com a mesma estrutura das linhas reais (ícone, título, detalhe e valor), para o layout não saltar. */
export function ListSkeleton({ label, rows = 3, icon = true }: { label: string; rows?: number; icon?: boolean }) {
  return (
    <SkeletonRegion label={label}>
      <ul aria-hidden="true" className="divide-y divide-border">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0 sm:gap-4">
            {icon && <Skeleton className="size-10 shrink-0 rounded-xl" />}
            <div className="grid min-w-0 flex-1 gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full max-w-sm" />
            </div>
            <div className="grid shrink-0 justify-items-end gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** Linhas de texto para listas pequenas das configurações. */
export function TextSkeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <SkeletonRegion label={label} className="grid gap-3">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-4', index % 2 ? 'w-1/2' : 'w-3/4')} />
      ))}
    </SkeletonRegion>
  );
}

/** Esqueleto do painel: quatro indicadores, a tabela de comparação e dois gráficos. */
export function DashboardSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label}>
      <div aria-hidden="true">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Card key={index}>
              <CardContent className="grid gap-3 p-4 sm:p-5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-3 w-5/6" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="mt-4">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </CardHeader>
          <CardContent className="grid gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-6 w-full" />
            ))}
          </CardContent>
        </Card>
        <ChartsSkeleton />
      </div>
    </SkeletonRegion>
  );
}

/** Reserva a altura dos dois gráficos enquanto o pacote do Recharts carrega. */
export function ChartsSkeleton() {
  return (
    <div aria-hidden="true" className="mt-4 grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }, (_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full sm:h-80" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
