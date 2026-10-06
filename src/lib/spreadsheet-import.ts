import * as XLSX from 'xlsx';

export type ImportKind = 'income' | 'expense' | 'investment';
export type ImportLocale = 'en_US' | 'pt_BR';

export type SpreadsheetImportEntry = {
  id: string;
  sourceSheet: string;
  sourceRow: number;
  kind: ImportKind;
  description: string;
  sourceCategory: string | null;
  sourcePaymentMethod: string | null;
  competenceOn: string;
  dueOn: string | null;
  plannedCents: number;
  actualCents: number | null;
  realizedOn: string | null;
  notes: string | null;
  warning: string | null;
};

export type SkippedSpreadsheetRow = {
  sourceSheet: string;
  sourceRow: number;
  description: string;
  reason: string;
};

export type SpreadsheetImportPreview = {
  entries: SpreadsheetImportEntry[];
  skipped: SkippedSpreadsheetRow[];
};

const ACCOUNT_SHEET = 'Contas e Vencimentos';
const CASH_FLOW_SHEET = 'Fluxo de Caixa Mensal';
const MAX_IMPORT_ENTRIES = 500;
const accountHeaders = {
  description: 'Descrição da Conta',
  category: 'Categoria',
  dueDay: 'Dia de Vencimento',
  amount: 'Valor Previsto (R$)',
  paymentMethod: 'Forma de Pagamento',
  status: 'Status',
  paidOn: 'Data de Pagamento',
  notes: 'Observações',
} as const;
const cashFlowHeaders = {
  month: 'Mês',
  income: 'Receitas Previstas',
} as const;
const monthNames = new Map([
  ['january', 1], ['jan', 1], ['janeiro', 1], ['jan.', 1],
  ['february', 2], ['feb', 2], ['fevereiro', 2], ['feb.', 2],
  ['march', 3], ['mar', 3], ['março', 3], ['marco', 3], ['mar.', 3],
  ['april', 4], ['apr', 4], ['abril', 4], ['apr.', 4],
  ['may', 5], ['maio', 5],
  ['june', 6], ['jun', 6], ['junho', 6], ['jun.', 6],
  ['july', 7], ['jul', 7], ['julho', 7], ['jul.', 7],
  ['august', 8], ['aug', 8], ['agosto', 8], ['aug.', 8],
  ['september', 9], ['sep', 9], ['setembro', 9], ['sep.', 9],
  ['october', 10], ['oct', 10], ['outubro', 10], ['oct.', 10],
  ['november', 11], ['nov', 11], ['novembro', 11], ['nov.', 11],
  ['december', 12], ['dec', 12], ['dezembro', 12], ['dec.', 12],
]);

function normalizeLabel(value: unknown) {
  return String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US');
}

function cellAt(sheet: XLSX.WorkSheet, row: number, column: number) {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined;
}

function readRows(sheet: XLSX.WorkSheet) {
  if (!sheet['!ref']) return [] as Array<Array<XLSX.CellObject | undefined>>;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (range.e.r + 1 > 10_000 || range.e.c + 1 > 50) throw new Error('A planilha excede o limite de 10.000 linhas ou 50 colunas por aba.');
  return Array.from({ length: range.e.r - range.s.r + 1 }, (_, rowOffset) =>
    Array.from({ length: range.e.c - range.s.c + 1 }, (_, columnOffset) => cellAt(sheet, range.s.r + rowOffset, range.s.c + columnOffset)),
  );
}

function columnMap(rows: Array<Array<XLSX.CellObject | undefined>>, required: Record<string, string>) {
  const headers = rows[0] ?? [];
  const indexByName = new Map(headers.map((cell, index) => [normalizeLabel(cell?.v), index]));
  const result: Record<string, number> = {};
  for (const [key, label] of Object.entries(required)) {
    const index = indexByName.get(normalizeLabel(label));
    if (index === undefined) throw new Error(`A coluna “${label}” não foi encontrada.`);
    result[key] = index;
  }
  return result;
}

function cellText(cell: XLSX.CellObject | undefined) {
  const value = cell?.v;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function nonEmpty(row: Array<XLSX.CellObject | undefined>) {
  return row.some((cell) => cell && cell.v !== null && cell.v !== undefined && String(cell.v).trim() !== '');
}

function parseMoney(cell: XLSX.CellObject | undefined, locale: ImportLocale): number | null {
  const value = cell?.v;
  if (typeof value === 'number') {
    const cents = Math.round(value * 100);
    return Number.isSafeInteger(cents) && cents > 0 && Math.abs(value * 100 - cents) < 1e-7 ? cents : null;
  }
  if (typeof value !== 'string') return null;
  let text = value.trim().replace(/[\s\u00a0]/g, '').replace(/^(?:R\$|US\$|\$)/i, '');
  if (!text) return null;
  if (locale === 'en_US') {
    if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(text)) return null;
    text = text.replaceAll(',', '');
  } else {
    if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(text)) return null;
    text = text.replaceAll('.', '').replace(',', '.');
  }
  const [whole, fractional = ''] = text.split('.');
  try {
    const cents = BigInt(whole) * 100n + BigInt(fractional.padEnd(2, '0'));
    return cents > 0n && cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
  } catch {
    return null;
  }
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

type ParsedDate = { date: string; warning: string | null };

function parseDate(cell: XLSX.CellObject | undefined, year: number, locale: ImportLocale): ParsedDate | null {
  const value = cell?.v;
  if (value instanceof Date && Number.isFinite(value.valueOf())) {
    const date = isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
    return date ? { date, warning: null } : null;
  }
  if (typeof value === 'number') {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (!decoded) return null;
    const date = isoDate(decoded.y, decoded.m, decoded.d);
    return date ? { date, warning: null } : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (isoMatch) {
    const date = isoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    return date ? { date, warning: null } : null;
  }
  const match = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/.exec(text);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const hasYear = Boolean(match[3]);
  let parsedYear = match[3] ? Number(match[3]) : year;
  if (parsedYear < 100) parsedYear += 2000;
  const month = locale === 'en_US' ? first : second;
  const day = locale === 'en_US' ? second : first;
  const date = isoDate(parsedYear, month, day);
  if (!date) return null;
  const ambiguous = first <= 12 && second <= 12 && first !== second;
  const warnings = [
    !hasYear ? `A data não informa o ano; foi usado ${year}.` : '',
    ambiguous ? `A data também pode ser lida como ${locale === 'en_US' ? 'dia/mês' : 'mês/dia'}; confira a interpretação.` : '',
  ].filter(Boolean);
  return { date, warning: warnings.join(' ') || null };
}

function parseMonth(cell: XLSX.CellObject | undefined) {
  const value = cell?.v;
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value.getMonth() + 1;
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 1 && value <= 12) return value;
    if (value < 30_000) return null;
    const date = XLSX.SSF.parse_date_code(value);
    return date && date.m >= 1 && date.m <= 12 ? date.m : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim().toLocaleLowerCase('en-US');
  const numeric = /^(\d{1,2})(?:[/-]\d{2,4})?$/.exec(text);
  if (numeric) {
    const month = Number(numeric[1]);
    return month >= 1 && month <= 12 ? month : null;
  }
  const normalized = normalizeLabel(text);
  for (const [name, month] of monthNames) {
    if (normalized === normalizeLabel(name)) return month;
    if (normalized.startsWith(`${normalizeLabel(name)} `)) return month;
  }
  return null;
}

function dueDate(year: number, month: number, day: number) {
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return isoDate(year, month, Math.min(day, finalDay));
}

function paidStatus(value: string) {
  return new Set(['pago', 'paga', 'quitado', 'quitada', 'realizado', 'realizada', 'paid', 'confirmed']).has(normalizeLabel(value));
}

function knownStatus(value: string) {
  const normalized = normalizeLabel(value);
  return !normalized || new Set(['pago', 'paga', 'quitado', 'quitada', 'realizado', 'realizada', 'paid', 'confirmed', 'pendente', 'em aberto', 'aberto', 'aberta', 'a vencer', 'nao pago', 'nao paga', 'unpaid', 'pending']).has(normalized);
}

function hasFormula(row: Array<XLSX.CellObject | undefined>, columns: number[]) {
  return columns.some((column) => Boolean(row[column]?.f));
}

function rowAt(rows: Array<Array<XLSX.CellObject | undefined>>, index: number) {
  return rows[index] ?? [];
}

export function parseSpreadsheetImport(
  input: ArrayBuffer | Uint8Array,
  { year, expenseMonth, locale = 'en_US' }: { year: number; expenseMonth: number; locale?: ImportLocale },
): SpreadsheetImportPreview {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || !Number.isInteger(expenseMonth) || expenseMonth < 1 || expenseMonth > 12) {
    throw new Error('Informe um ano e um mês de competência válidos.');
  }
  const inputBytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (inputBytes.length < 4 || inputBytes[0] !== 0x50 || inputBytes[1] !== 0x4b || inputBytes[2] !== 0x03 || inputBytes[3] !== 0x04) {
    throw new Error('Não foi possível abrir o arquivo. Selecione um XLSX válido exportado do modelo.');
  }
  let workbook: XLSX.WorkBook;
  try {
    const readOnlyCopy = inputBytes.slice();
    workbook = XLSX.read(readOnlyCopy, { type: 'array', cellDates: true, cellFormula: true, WTF: true });
  } catch {
    throw new Error('Não foi possível abrir o arquivo. Selecione um XLSX válido exportado do modelo.');
  }
  if (!workbook.SheetNames.length) throw new Error('Não foi possível abrir o arquivo. Selecione um XLSX válido exportado do modelo.');
  const accountSheet = workbook.Sheets[ACCOUNT_SHEET];
  const cashFlowSheet = workbook.Sheets[CASH_FLOW_SHEET];
  if (!accountSheet || !cashFlowSheet) throw new Error(`O arquivo precisa conter as abas “${ACCOUNT_SHEET}” e “${CASH_FLOW_SHEET}”.`);

  const accountRows = readRows(accountSheet);
  const cashFlowRows = readRows(cashFlowSheet);
  const accountColumns = columnMap(accountRows, accountHeaders);
  const cashFlowColumns = columnMap(cashFlowRows, cashFlowHeaders);
  const entries: SpreadsheetImportEntry[] = [];
  const skipped: SkippedSpreadsheetRow[] = [];
  const expenseCompetence = `${year}-${expenseMonth.toString().padStart(2, '0')}-01`;

  for (let index = 1; index < accountRows.length; index += 1) {
    const row = rowAt(accountRows, index);
    if (!nonEmpty(row)) continue;
    const sourceRow = index + 1;
    const description = cellText(row[accountColumns.description]);
    const addSkipped = (reason: string) => skipped.push({ sourceSheet: ACCOUNT_SHEET, sourceRow, description, reason });
    if (hasFormula(row, Object.values(accountColumns))) {
      addSkipped('A linha contém fórmula e foi ignorada para evitar importar cálculos.');
      continue;
    }
    if (!description) { addSkipped('Informe a descrição da conta.'); continue; }
    if (description.length > 200) { addSkipped('A descrição excede o limite de 200 caracteres.'); continue; }
    const notes = cellText(row[accountColumns.notes]) || null;
    if (notes && notes.length > 2000) { addSkipped('As observações excedem o limite de 2.000 caracteres.'); continue; }
    const amount = parseMoney(row[accountColumns.amount], locale);
    if (!amount) { addSkipped('O valor previsto precisa ser positivo e ter até duas casas decimais.'); continue; }
    const dueDayText = cellText(row[accountColumns.dueDay]);
    const dueDay = /^\d{1,2}$/.test(dueDayText) ? Number(dueDayText) : null;
    if (!dueDay || dueDay < 1 || dueDay > 31) { addSkipped('O dia de vencimento precisa estar entre 1 e 31.'); continue; }
    const status = cellText(row[accountColumns.status]);
    if (!knownStatus(status)) { addSkipped('O status precisa ser “Pago” ou “Em aberto”.'); continue; }
    let actualCents: number | null = null;
    let realizedOn: string | null = null;
    let warning: string | null = null;
    if (paidStatus(status)) {
      const paidOn = parseDate(row[accountColumns.paidOn], year, locale);
      if (!paidOn) { addSkipped('A conta está marcada como paga, mas a data de pagamento não pôde ser interpretada.'); continue; }
      actualCents = amount;
      realizedOn = paidOn.date;
      warning = paidOn.warning;
    }
    entries.push({
      id: `${ACCOUNT_SHEET}:${sourceRow}`,
      sourceSheet: ACCOUNT_SHEET,
      sourceRow,
      kind: 'expense',
      description,
      sourceCategory: cellText(row[accountColumns.category]) || null,
      sourcePaymentMethod: cellText(row[accountColumns.paymentMethod]) || null,
      competenceOn: expenseCompetence,
      dueOn: dueDate(year, expenseMonth, dueDay),
      plannedCents: amount,
      actualCents,
      realizedOn,
      notes,
      warning,
    });
  }

  for (let index = 1; index < cashFlowRows.length; index += 1) {
    const row = rowAt(cashFlowRows, index);
    if (!nonEmpty(row)) continue;
    const sourceRow = index + 1;
    const incomeCell = row[cashFlowColumns.income];
    if (incomeCell?.f) {
      skipped.push({ sourceSheet: CASH_FLOW_SHEET, sourceRow, description: 'Receita prevista', reason: 'A receita é calculada por fórmula e foi ignorada.' });
      continue;
    }
    if (!cellText(incomeCell)) continue;
    const amount = parseMoney(incomeCell, locale);
    if (!amount) {
      skipped.push({ sourceSheet: CASH_FLOW_SHEET, sourceRow, description: 'Receita prevista', reason: 'O valor precisa ser positivo, estar no formato selecionado e ter até duas casas decimais.' });
      continue;
    }
    const month = parseMonth(row[cashFlowColumns.month]);
    if (!month) {
      skipped.push({ sourceSheet: CASH_FLOW_SHEET, sourceRow, description: 'Receita prevista', reason: 'O mês da receita prevista não pôde ser interpretado.' });
      continue;
    }
    const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
    entries.push({
      id: `${CASH_FLOW_SHEET}:${sourceRow}`,
      sourceSheet: CASH_FLOW_SHEET,
      sourceRow,
      kind: 'income',
      description: `Receita prevista de ${monthName}`,
      sourceCategory: null,
      sourcePaymentMethod: null,
      competenceOn: `${year}-${month.toString().padStart(2, '0')}-01`,
      dueOn: null,
      plannedCents: amount,
      actualCents: null,
      realizedOn: null,
      notes: null,
      warning: null,
    });
  }

  if (entries.length > MAX_IMPORT_ENTRIES) throw new Error(`A prévia contém mais de ${MAX_IMPORT_ENTRIES} lançamentos válidos. Divida a importação em lotes menores.`);
  return { entries, skipped };
}
