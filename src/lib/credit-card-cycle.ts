/** Returns a card cycle date in a calendar month, clamping 29–31 to that month's last day. */
export function creditCardCycleDate(month: string, day: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError('Informe um mês válido e um dia entre 1 e 31.');
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || monthNumber < 1 || monthNumber > 12) throw new RangeError('Informe um mês válido e um dia entre 1 e 31.');
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lastDay = monthNumber === 2 ? (leapYear ? 29 : 28) : [4, 6, 9, 11].includes(monthNumber) ? 30 : 31;
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
