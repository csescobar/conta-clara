import { describe, expect, it } from 'vitest';
import { installmentAmounts, invoiceMonthForInstallment, nextInvoiceMonth } from './card-purchase-cycle';

describe('card purchase invoice planning', () => {
  it('uses the close on purchase day, or the next cycle after closing', () => {
    expect(nextInvoiceMonth('2026-10-25', 25, 5)).toBe('2026-11-01');
    expect(nextInvoiceMonth('2026-10-26', 25, 5)).toBe('2026-12-01');
    expect(nextInvoiceMonth('2026-10-10', 25, 31)).toBe('2026-10-01');
  });

  it('clamps closing and due dates in short months and advances across years', () => {
    expect(nextInvoiceMonth('2026-02-28', 31, 5)).toBe('2026-03-01');
    expect(invoiceMonthForInstallment('2026-11-01', 3)).toBe('2027-01-01');
  });

  it('allocates remainder cents to the first installments', () => {
    expect(installmentAmounts(1001, 3)).toEqual([334, 334, 333]);
    expect(installmentAmounts(999, 1)).toEqual([999]);
    expect(() => installmentAmounts(2, 3)).toThrow(RangeError);
  });
});
