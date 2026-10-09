import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type DataColumn = {
  id: string;
  header: string;
  align?: 'left' | 'right';
  /** Largura (classe Tailwind) usada com `fixed`, ex.: `w-[34%]`. */
  width?: string;
};

export type DataRow = { id: string; cells: Record<string, ReactNode>; emphasis?: boolean };

/**
 * Tabela de valores com legenda, cabeçalhos de coluna e de linha (a primeira coluna). Com `compact`
 * usa colunas de largura fixa, quebra o rótulo e reduz o respiro para caber em 320 px sem rolagem
 * horizontal; sem ela, a tabela rola dentro do próprio contêiner se necessário.
 */
export function DataTable({
  caption,
  columns,
  rows,
  compact = false,
  minWidth,
}: {
  caption: string;
  columns: DataColumn[];
  rows: DataRow[];
  compact?: boolean;
  /** Largura mínima (classe Tailwind) da tabela não compacta, ex.: `min-w-[28rem]`. */
  minWidth?: string;
}) {
  // Uma região que rola na horizontal precisa ser alcançável pelo teclado; só vira parada de Tab quando transborda.
  const container = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => setScrollable(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);

  const last = columns.length - 1;
  const padding = (index: number) =>
    compact
      ? index === 0
        ? 'py-2 pr-1.5 sm:pr-3'
        : index === last
          ? 'py-2 pl-1.5 sm:pl-3'
          : 'px-1.5 py-2 sm:px-3'
      : index === 0
        ? 'py-3 pr-4'
        : index === last
          ? 'py-3 pl-4'
          : 'px-4 py-3';
  const cell = (index: number, column: DataColumn) =>
    cn(
      padding(index),
      column.align === 'right' && 'text-right',
      index > 0 && compact && 'whitespace-nowrap',
      index === 0 && compact && 'break-words',
    );

  return (
    <div
      ref={container}
      className={cn(
        'overflow-x-auto',
        compact && 'mt-3 min-w-0',
        scrollable && 'rounded-lg focus-visible:outline-2 focus-visible:outline-ring',
      )}
      {...(scrollable ? { role: 'region', 'aria-label': caption, tabIndex: 0 } : {})}
    >
      <table className={cn('w-full', compact ? 'table-fixed text-xs sm:text-sm' : cn('border-collapse text-sm', minWidth))}>
        <caption className="sr-only">{caption}</caption>
        {compact && columns.some((column) => column.width) && (
          <colgroup>
            {columns.map((column) => (
              <col key={column.id} className={column.width} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {columns.map((column, index) => (
              <th key={column.id} scope="col" className={cn(cell(index, column), 'font-medium')}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.emphasis ? 'bg-muted/40' : 'border-b border-border last:border-0'}>
              {columns.map((column, index) =>
                index === 0 ? (
                  <th
                    key={column.id}
                    scope="row"
                    className={cn(cell(index, column), 'text-left', row.emphasis ? 'font-semibold' : 'font-medium')}
                  >
                    {row.cells[column.id]}
                  </th>
                ) : (
                  <td key={column.id} className={cn(cell(index, column), 'tabular-nums', row.emphasis && 'font-semibold')}>
                    {row.cells[column.id]}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
