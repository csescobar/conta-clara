import type { ReactNode } from 'react';
import { Card, CardContent } from '../ui/card';

/** Indicador do painel: rótulo, valor em destaque e uma explicação curta. */
export function StatCard({ title, value, description }: { title: string; value: ReactNode; description: string }) {
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:p-5">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold tracking-tight sm:text-display">{value}</p>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
