export function parseBrazilianCents(value: string, allowZero = false): number | null {
  const normalized = value.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  const match = normalized.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  if (!match) return null;
  const whole = Number(match[1].replace(/\./g, ''));
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) && (allowZero ? cents >= 0 : cents > 0) ? cents : null;
}

export function parseBrazilianDate(value: string): string | null {
  const match = value.trim().match(/^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

export function formatBrazilianDate(value: string | null): string {
  if (!value) return 'Sem vencimento';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function formatBrazilianMonth(value: string): string {
  const [year, month] = value.slice(0, 7).split('-');
  return `${month}/${year}`;
}

export function currentBrazilianDate(date = new Date()): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function formatBrazilianMoney(cents: number | string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents) / 100);
}

export function currentMonthInputValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
