export function parseBrazilianCents(value: string, allowZero = false): number | null {
  const normalized = value
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '');
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

export const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';

export type MoneySignDisplay = 'auto' | 'always' | 'exceptZero';

function toCents(cents: number | string | bigint): bigint {
  if (typeof cents === 'bigint') return cents;
  if (typeof cents === 'number') {
    if (!Number.isSafeInteger(cents)) throw new RangeError('O valor deve ser informado em centavos inteiros.');
    return BigInt(cents);
  }
  if (!/^-?\d+$/.test(cents.trim())) throw new RangeError('O valor deve ser informado em centavos inteiros.');
  return BigInt(cents.trim());
}

const wholeReais = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Formata centavos inteiros (número, string ou BigInt) em reais sem perder precisão. */
export function formatBrazilianMoney(
  cents: number | string | bigint,
  { signDisplay = 'auto' }: { signDisplay?: MoneySignDisplay } = {},
): string {
  const value = toCents(cents);
  const absolute = value < 0n ? -value : value;
  const sign = value < 0n ? '-' : value > 0n && signDisplay !== 'auto' ? '+' : '';
  return `${sign}R$\u00a0${wholeReais.format(absolute / 100n)},${(absolute % 100n).toString().padStart(2, '0')}`;
}

/** Valor em reais sem o símbolo, para preencher campos (ex.: "1.234,56"). */
export function formatBrazilianAmount(cents: number | string | bigint): string {
  return formatBrazilianMoney(cents).replace(/^(-?)R\$\u00a0/, '$1');
}

const compactReais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

/** Formato abreviado para eixos e espaços reduzidos; não usar quando o valor exato for necessário. */
export function formatCompactBrazilianMoney(cents: number | string | bigint): string {
  return compactReais.format(Number(toCents(cents)) / 100);
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

/** Soma `offset` meses a uma competência AAAA-MM (aceita negativos). */
export function shiftMonth(value: string, offset: number): string {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

const weekdayNames = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' });

/** Dia da semana de uma data civil AAAA-MM-DD, em minúsculas (ex.: "sábado"). */
export function brazilianWeekday(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return weekdayNames.format(new Date(Date.UTC(year, month - 1, day)));
}

/** Rótulo de um grupo por vencimento: "Sábado, 15/11/2026" ou "Sem vencimento". */
export function formatDueDateGroup(value: string | null): string {
  if (!value) return 'Sem vencimento';
  const weekday = brazilianWeekday(value);
  return `${weekday.slice(0, 1).toLocaleUpperCase('pt-BR')}${weekday.slice(1)}, ${formatBrazilianDate(value)}`;
}

/** Agrupa por data de vencimento em ordem crescente, deixando "sem vencimento" por último; mantém a ordem dentro de cada grupo. */
export function groupByDueDate<Item extends { due_on: string | null }>(items: Item[]): Array<{ dueOn: string | null; items: Item[] }> {
  const groups = new Map<string | null, Item[]>();
  for (const item of items) {
    const key = item.due_on ? item.due_on.slice(0, 10) : null;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left === right ? 0 : left === null ? 1 : right === null ? -1 : left.localeCompare(right)))
    .map(([dueOn, grouped]) => ({ dueOn, items: grouped }));
}

const monthNames = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
const monthYearNames = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Nome do mês (1–12) em minúsculas, como "outubro". */
export function brazilianMonthName(month: number): string {
  return monthNames.format(new Date(Date.UTC(2000, month - 1, 1)));
}

/** Competência por extenso com inicial maiúscula, como "Outubro de 2026". */
export function formatBrazilianMonthLong(value: string): string {
  const [year, month] = value.slice(0, 7).split('-').map(Number);
  const label = monthYearNames.format(new Date(Date.UTC(year, month - 1, 1)));
  return `${label.slice(0, 1).toLocaleUpperCase('pt-BR')}${label.slice(1)}`;
}

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: BRAZIL_TIME_ZONE });

/** Data e hora de um instante (ISO com fuso) no horário de Brasília; `null` se inválido. */
export function formatBrazilianDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateTime.format(date);
}

const calendarParts = new Intl.DateTimeFormat('en', { timeZone: BRAZIL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Data civil atual em America/Sao_Paulo, no formato AAAA-MM-DD. */
export function currentSaoPauloDate(date = new Date()): string {
  const parts = Object.fromEntries(calendarParts.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function currentBrazilianDate(date = new Date()): string {
  return formatBrazilianDate(currentSaoPauloDate(date));
}

export function currentMonthInputValue(date = new Date()): string {
  return currentSaoPauloDate(date).slice(0, 7);
}
