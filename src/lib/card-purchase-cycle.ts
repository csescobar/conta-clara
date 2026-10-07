import { creditCardCycleDate } from './credit-card-cycle';

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function nextInvoiceMonth(purchaseOn: string, closingDay: number, dueDay: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseOn) || !Number.isInteger(closingDay) || !Number.isInteger(dueDay)) {
    throw new RangeError('Informe uma data de compra e um ciclo de cartão válidos.');
  }
  let closeMonth = purchaseOn.slice(0, 7);
  let closingOn = creditCardCycleDate(closeMonth, closingDay);
  if (closingOn < purchaseOn) {
    closeMonth = shiftMonth(closeMonth, 1);
    closingOn = creditCardCycleDate(closeMonth, closingDay);
  }
  const dueInCloseMonth = creditCardCycleDate(closeMonth, dueDay);
  const invoiceMonth = dueInCloseMonth > closingOn ? closeMonth : shiftMonth(closeMonth, 1);
  return `${invoiceMonth}-01`;
}

export function installmentAmounts(totalCents: number, count: number) {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || !Number.isInteger(count) || count < 1 || count > 120 || totalCents < count) {
    throw new RangeError('O valor deve comportar ao menos um centavo por parcela.');
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function invoiceMonthForInstallment(firstInvoiceOn: string, number: number) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(firstInvoiceOn) || !Number.isInteger(number) || number < 1 || number > 120) {
    throw new RangeError('Informe a primeira fatura e o número da parcela.');
  }
  return `${shiftMonth(firstInvoiceOn.slice(0, 7), number - 1)}-01`;
}
