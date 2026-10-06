import { describe, expect, it } from 'vitest';
import { formatBrazilianDate, formatBrazilianMonth, formatBrazilianMoney, parseBrazilianCents, parseBrazilianDate } from './finance';

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
