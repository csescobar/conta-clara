import type { ReactNode } from 'react';
import { Card, CardContent } from '../ui/card';

/**
 * Indicador do painel: rótulo, valor em destaque e uma explicação curta. No celular vira uma linha compacta (texto à
 * esquerda, valor à direita), para os quatro indicadores caberem antes da tabela e dos gráficos; a partir de `sm`
 * é um cartão vertical com o valor em tamanho de destaque.
 */
export function StatCard({ title, value, description }: { title: string; value: ReactNode; description: string }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 p-4 sm:grid-cols-1 sm:gap-3 sm:p-5">
        <p className="col-start-1 text-sm font-medium text-muted-foreground">{title}</p>
        <p className="col-start-2 row-span-2 row-start-1 text-xl font-semibold tracking-tight sm:col-start-1 sm:row-span-1 sm:row-start-auto sm:text-display">
          {value}
        </p>
        <p className="col-start-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
