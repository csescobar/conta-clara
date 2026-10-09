import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-2xl border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-5 pb-0', className)} {...props} />;
}

/**
 * Título de cartão. O padrão é `h2`, para cartões logo abaixo do título da página (`h1`); use `as="h3"`
 * quando o cartão estiver sob outro `h2`, para manter a ordem dos níveis.
 */
export function CardTitle({
  className,
  children,
  as: Heading = 'h2',
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' }) {
  return (
    <Heading className={cn('text-base font-semibold tracking-tight', className)} {...props}>
      {children}
    </Heading>
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm leading-6 text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}
