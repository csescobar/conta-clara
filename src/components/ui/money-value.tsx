export function formatBRL(cents: number) {
  if (!Number.isSafeInteger(cents)) throw new RangeError('O valor deve ser informado em centavos inteiros.');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function MoneyValue({ cents, className = '' }: { cents: number; className?: string }) {
  return <span className={`tabular-nums ${className}`.trim()}>{formatBRL(cents)}</span>;
}
