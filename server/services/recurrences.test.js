import { describe, expect, it } from 'vitest';
import { listCompetenceMonths, recurrenceDueDate } from './recurrences.js';

describe('monthly recurrence calendar rules', () => {
  it('creates months through the rule end or current competence across year boundaries', () => {
    expect(listCompetenceMonths('2024-11-01', '2025-02-01', '2025-12-01')).toEqual([
      '2024-11-01', '2024-12-01', '2025-01-01', '2025-02-01',
    ]);
    expect(listCompetenceMonths('2025-01-01', null, '2025-03-01')).toEqual([
      '2025-01-01', '2025-02-01', '2025-03-01',
    ]);
    expect(listCompetenceMonths('2026-11-01', null, '2026-10-01')).toEqual([]);
  });

  it('clamps due day 31 to the last valid day of short and leap-year months', () => {
    expect(recurrenceDueDate('2024-02-01', 31)).toBe('2024-02-29');
    expect(recurrenceDueDate('2025-02-01', 31)).toBe('2025-02-28');
    expect(recurrenceDueDate('2026-04-01', 31)).toBe('2026-04-30');
    expect(recurrenceDueDate('2026-03-01', 15)).toBe('2026-03-15');
    expect(recurrenceDueDate('2026-03-01', null)).toBeNull();
  });
});
