import { describe, expect, it } from 'vitest';
import {
  brazilianMonthName, currentBrazilianDate, currentMonthInputValue, currentSaoPauloDate, formatBrazilianDate, formatBrazilianDateTime,
  formatBrazilianMonth, formatBrazilianMonthLong, formatBrazilianMoney, formatCompactBrazilianMoney, parseBrazilianCents, parseBrazilianDate,
} from './finance';

describe('Brazilian money and date input', () => {
  it.each([
    ['R$ 1.234,56', 123456],
    ['1234,5', 123450],
    ['12', 1200],
  ])('parses %s into whole cents', (value, expected) => {
    expect(parseBrazilianCents(value)).toBe(expected);
  });

  it.each(['0,00', '-1,00', '12.34', '1,234', 'R$ abc', '90071992547410,00'])('rejects invalid or unsafe amount %s', (value) => {
    expect(parseBrazilianCents(value)).toBeNull();
  });

  it('allows a zero realized amount while planned entries remain positive', () => {
    expect(parseBrazilianCents('0,00', true)).toBe(0);
    expect(parseBrazilianCents('0,00')).toBeNull();
  });

  it('checks calendar dates and formats dates and cents for Brazil', () => {
    expect(parseBrazilianDate('29/02/2024')).toBe('2024-02-29');
    expect(parseBrazilianDate('29/02/2025')).toBeNull();
    expect(parseBrazilianDate('31/04/2026')).toBeNull();
    expect(formatBrazilianDate('2026-10-05')).toBe('05/10/2026');
    expect(formatBrazilianMonth('2026-10-01')).toBe('10/2026');
    expect(formatBrazilianMoney('145600')).toBe('R$ 1.456,00');
  });
});

describe('single Brazilian formatting source', () => {
  it.each([
    [0, 'R$\u00a00,00'],
    [5, 'R$\u00a00,05'],
    [-2500, '-R$\u00a025,00'],
    ['145600', 'R$\u00a01.456,00'],
    ['-145601', '-R$\u00a01.456,01'],
    [12345678901234567890n, 'R$\u00a0123.456.789.012.345.678,90'],
    ['9007199254740993', 'R$\u00a090.071.992.547.409,93'],
  ])('formats %s cents exactly', (cents, expected) => {
    expect(formatBrazilianMoney(cents)).toBe(expected);
  });

  it('matches the platform currency format for safe values', () => {
    const intl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    for (const cents of [0, 1, 99, 100, -1, 123456, -98765432]) expect(formatBrazilianMoney(cents)).toBe(intl.format(cents / 100));
  });

  it('shows an explicit sign only when asked and never for zero', () => {
    expect(formatBrazilianMoney(2500, { signDisplay: 'always' })).toBe('+R$\u00a025,00');
    expect(formatBrazilianMoney(-2500, { signDisplay: 'exceptZero' })).toBe('-R$\u00a025,00');
    expect(formatBrazilianMoney(0, { signDisplay: 'always' })).toBe('R$\u00a00,00');
  });

  it.each([25.5, Number.MAX_SAFE_INTEGER + 2, '12,50', '1e3', ''])('rejects non-integer cents %s', (cents) => {
    expect(() => formatBrazilianMoney(cents)).toThrow(RangeError);
  });

  it('abbreviates large values for compact spaces', () => {
    expect(formatCompactBrazilianMoney(123456789)).toMatch(/^R\$\s1,2\smi$/);
    expect(formatCompactBrazilianMoney('150000')).toMatch(/^R\$\s1,5\smil$/);
  });

  it('names months and competences in Portuguese', () => {
    expect(brazilianMonthName(1)).toBe('janeiro');
    expect(brazilianMonthName(12)).toBe('dezembro');
    expect(formatBrazilianMonthLong('2026-03')).toBe('Março de 2026');
    expect(formatBrazilianMonthLong('2026-10-01')).toBe('Outubro de 2026');
  });

  it('formats instants and the current calendar day in São Paulo time', () => {
    expect(formatBrazilianDateTime('2026-10-09T02:30:00.000Z')).toBe('08/10/2026, 23:30');
    expect(formatBrazilianDateTime('não é data')).toBeNull();
    expect(formatBrazilianDateTime(null)).toBeNull();
    const lateEveningInBrazil = new Date('2026-11-01T02:30:00.000Z');
    expect(currentSaoPauloDate(lateEveningInBrazil)).toBe('2026-10-31');
    expect(currentBrazilianDate(lateEveningInBrazil)).toBe('31/10/2026');
    expect(currentMonthInputValue(lateEveningInBrazil)).toBe('2026-10');
  });
});
