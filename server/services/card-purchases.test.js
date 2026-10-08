// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calculateFirstInvoiceMonth, parsePurchaseSnapshot, splitInstallmentAmounts } from './card-purchases.js';

describe('card purchase planning', () => {
  it('chooses the close on purchase day and maps closing and due days to the due month', () => {
    expect(calculateFirstInvoiceMonth('2026-10-25', 25, 5)).toBe('2026-11-01');
    expect(calculateFirstInvoiceMonth('2026-10-26', 25, 5)).toBe('2026-12-01');
    expect(calculateFirstInvoiceMonth('2026-10-10', 25, 31)).toBe('2026-10-01');
    expect(calculateFirstInvoiceMonth('2026-02-28', 31, 5)).toBe('2026-03-01');
  });

  it('splits the remainder across the first installments and rejects invalid totals', () => {
    expect(splitInstallmentAmounts(1001, 3)).toEqual([334, 334, 333]);
    expect(splitInstallmentAmounts(100, 1)).toEqual([100]);
    expect(splitInstallmentAmounts(2, 3)).toBeNull();
  });

  it('requires unique installment identifiers and exact cent totals', () => {
    const payload = {
      purchase: {
        cardId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        categoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        description: 'Compra fictícia',
        purchaseOn: '2026-10-25',
        firstInvoiceOn: '2026-11-01',
        totalCents: 1001,
        installmentCount: 3,
      },
      installments: [334, 334, 333].map((plannedCents, index) => ({
        id: `00000000-0000-4000-8000-00000000000${index + 1}`,
        installmentNumber: index + 1,
        plannedCents,
        invoiceOn: ['2026-11-01', '2026-12-01', '2027-01-01'][index],
      })),
    };
    expect(parsePurchaseSnapshot(payload)).toMatchObject({ purchase: { totalCents: 1001, installmentCount: 3 } });
    expect(
      parsePurchaseSnapshot({
        ...payload,
        installments: [...payload.installments.slice(0, 2), { ...payload.installments[2], plannedCents: 332 }],
      }),
    ).toBeNull();
    expect(parsePurchaseSnapshot({ ...payload, installments: [...payload.installments, payload.installments[0]] })).toBeNull();
  });
});
