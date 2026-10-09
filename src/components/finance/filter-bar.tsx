import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/** Cartão de filtros com título e campos em grade: uma coluna no celular e `columns` a partir de `sm`. */
export function FilterBar({
  title,
  description,
  columns = 3,
  children,
}: {
  title: string;
  description: string;
  columns?: 2 | 3 | 4;
  children: ReactNode;
}) {
  const grid = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[columns];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={cn('grid gap-3', grid)}>{children}</CardContent>
    </Card>
  );
}
