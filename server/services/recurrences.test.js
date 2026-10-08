import { describe, expect, it } from 'vitest';
import { listCompetenceMonths, recurrenceDueDate, recurrenceHorizonMonth } from './recurrences.js';

describe('monthly recurrence calendar rules', () => {
  it('creates months through the rule end or current competence across year boundaries', () => {
    expect(listCompetenceMonths('2024-11-01', '2025-02-01', '2025-12-01')).toEqual([
      '2024-11-01',
      '2024-12-01',
      '2025-01-01',
      '2025-02-01',
    ]);
    expect(listCompetenceMonths('2025-01-01', null, '2025-03-01')).toEqual(['2025-01-01', '2025-02-01', '2025-03-01']);
    expect(listCompetenceMonths('2026-11-01', null, '2026-10-01')).toEqual([]);
  });

  it('projects the current competence and the next 12 months', () => {
    expect(recurrenceHorizonMonth('2026-10-01')).toBe('2027-10-01');
    expect(listCompetenceMonths('2026-10-01', null, recurrenceHorizonMonth('2026-10-01'))).toHaveLength(13);
    expect(recurrenceHorizonMonth('2026-11-01')).toBe('2027-11-01');
    expect(recurrenceHorizonMonth('2026-10-01', 0)).toBe('2026-10-01');
    expect(() => recurrenceHorizonMonth('2026-10-02')).toThrow(TypeError);
    expect(() => recurrenceHorizonMonth('2026-10-01', -1)).toThrow(TypeError);
  });

  it('clamps due day 31 to the last valid day of short and leap-year months', () => {
    expect(recurrenceDueDate('2024-02-01', 31)).toBe('2024-02-29');
    expect(recurrenceDueDate('2025-02-01', 29)).toBe('2025-02-28');
    expect(recurrenceDueDate('2025-02-01', 30)).toBe('2025-02-28');
    expect(recurrenceDueDate('2025-02-01', 31)).toBe('2025-02-28');
    expect(recurrenceDueDate('2026-04-01', 30)).toBe('2026-04-30');
    expect(recurrenceDueDate('2026-04-01', 31)).toBe('2026-04-30');
    expect(recurrenceDueDate('2026-03-01', 15)).toBe('2026-03-15');
    expect(recurrenceDueDate('2026-03-01', null)).toBeNull();
  });
});
