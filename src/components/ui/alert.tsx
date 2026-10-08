import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

const variants = {
  destructive: { className: 'border-destructive-border bg-destructive-soft text-destructive', Icon: AlertCircle, role: 'alert' },
  warning: { className: 'border-warning-border bg-warning-surface text-warning', Icon: AlertTriangle, role: 'alert' },
  success: { className: 'border-success-border bg-success-surface text-success', Icon: CheckCircle2, role: 'status' },
  info: { className: 'border-info-border bg-info-surface text-info', Icon: Info, role: 'status' },
} as const;

export type AlertVariant = keyof typeof variants;

/**
 * Mensagem inline sempre com texto e ícone. Erros e avisos usam `role="alert"`; sucesso e
 * informação usam `role="status"`, anunciados sem interromper a leitura.
 */
export function Alert({ variant = 'destructive', title, children, className, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & { variant?: AlertVariant; title?: ReactNode }) {
  const { className: variantClassName, Icon, role } = variants[variant];
  return (
    <div role={role} className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', variantClassName, className)} {...props}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="grid min-w-0 gap-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn('leading-6', title ? 'text-foreground' : 'font-medium')}>{children}</div>
      </div>
    </div>
  );
}
