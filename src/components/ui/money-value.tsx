import type { HTMLAttributes } from 'react';
import { formatBrazilianMoney, formatCompactBrazilianMoney, type MoneySignDisplay } from '../../lib/finance';
import { cn } from '../../lib/utils';

export type MoneyTone = 'neutral' | 'income' | 'expense' | 'investment' | 'balance';

const toneClassName: Record<Exclude<MoneyTone, 'balance'>, string> = {
  neutral: '',
  income: 'text-success',
  expense: 'text-foreground',
  investment: 'text-accent-foreground',
};

type MoneyValueProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  cents: number | string | bigint;
  /** `balance` usa a cor de sucesso para zero ou positivo e de erro para negativo. */
  tone?: MoneyTone;
  signDisplay?: MoneySignDisplay;
  /** Abrevia o valor (ex.: "R$ 1,2 mil") e mantém o valor exato no título. */
  compact?: boolean;
};

export function MoneyValue({ cents, tone = 'neutral', signDisplay, compact = false, className, ...props }: MoneyValueProps) {
  const exact = formatBrazilianMoney(cents, { signDisplay });
  const toneClass = tone === 'balance' ? (BigInt(cents) < 0n ? 'text-destructive' : 'text-success') : toneClassName[tone];
  return (
    <span className={cn('tabular-nums', toneClass, className)} title={compact ? exact : undefined} {...props}>
      {compact ? formatCompactBrazilianMoney(cents) : exact}
    </span>
  );
}
