import { describe, expect, it } from 'vitest';
import { creditCardCycleDate } from './credit-card-cycle';

describe('credit card cycle dates', () => {
  it('clamps closing or due days to the last date of short months', () => {
    expect(creditCardCycleDate('2025-02', 31)).toBe('2025-02-28');
    expect(creditCardCycleDate('2024-02', 31)).toBe('2024-02-29');
    expect(creditCardCycleDate('2026-04', 30)).toBe('2026-04-30');
    expect(creditCardCycleDate('2026-04', 1)).toBe('2026-04-01');
  });

  it('rejects malformed months and cycle days', () => {
    expect(() => creditCardCycleDate('2026-13', 5)).toThrow(RangeError);
    expect(() => creditCardCycleDate('2026-02-01', 5)).toThrow(RangeError);
    expect(() => creditCardCycleDate('2026-02', 32)).toThrow(RangeError);
  });
});
