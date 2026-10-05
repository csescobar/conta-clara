import { AlertCircle, CheckCircle2, Clock3 } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const statusOptions = {
  paid: { label: 'Pago', className: 'bg-[#e8f5ed] text-success', Icon: CheckCircle2 },
  pending: { label: 'Pendente', className: 'bg-[#fbf1d6] text-warning', Icon: Clock3 },
  late: { label: 'Atrasado', className: 'bg-[#fdecec] text-destructive', Icon: AlertCircle },
} as const;

export type FinancialStatus = keyof typeof statusOptions;

export function StatusBadge({ status, className, ...props }: HTMLAttributes<HTMLSpanElement> & { status: FinancialStatus }) {
  const option = statusOptions[status];
  const { Icon } = option;
  return (
    <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', option.className, className)} {...props}>
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
      {option.label}
    </span>
  );
}
