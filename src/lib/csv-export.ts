export type CsvFinancialEntry = {
  kind: 'income' | 'expense' | 'investment';
  description: string;
  category_name: string | null;
  competence_on: string;
  due_on: string | null;
  planned_cents: string | number;
  actual_cents: string | number | null;
  realized_on: string | null;
  payment_method_name: string | null;
  status: 'pending' | 'late' | 'paid';
  notes: string | null;
  card_name?: string | null;
  invoice_month?: string | null;
  installment_number?: number | null;
  installment_count?: number | null;
  invoice_status?: 'open' | 'paid' | 'needs_review' | null;
};

const headers = [
  'Tipo',
  'Descrição',
  'Categoria',
  'Competência (AAAA-MM-DD)',
  'Vencimento (AAAA-MM-DD)',
  'Valor previsto (R$)',
  'Valor realizado (R$)',
  'Realizado em (AAAA-MM-DD)',
  'Forma de pagamento',
  'Situação',
  'Observações',
  'Cartão',
  'Fatura (MM/AAAA)',
  'Parcela',
  'Situação da fatura',
];
const kindLabels = { income: 'Receita', expense: 'Despesa', investment: 'Aporte' } as const;
const statusLabels = { pending: 'Em aberto', late: 'Atrasado', paid: 'Pago' } as const;
const invoiceStatusLabels = { open: 'Em aberto', paid: 'Quitada', needs_review: 'Revisar quitação' } as const;

function centsAsDecimal(value: string | number | null) {
  if (value === null) return '';
  const cents = BigInt(value);
  const sign = cents < 0n ? '-' : '';
  const absoluteCents = cents < 0n ? -cents : cents;
  return `${sign}${absoluteCents / 100n}.${(absoluteCents % 100n).toString().padStart(2, '0')}`;
}

function safeText(value: string | null) {
  if (value === null) return '';
  // O caractere nulo é intencional: planilhas o ignoram antes de interpretar uma fórmula.
  // eslint-disable-next-line no-control-regex
  return /^[\s\u0000\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvField(value: string, text = false) {
  const safeValue = text ? safeText(value) : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function serializeEntriesCsv(entries: readonly CsvFinancialEntry[]) {
  const rows = entries.map((entry) => [
    kindLabels[entry.kind],
    entry.description,
    entry.category_name ?? '',
    entry.competence_on,
    entry.due_on ?? '',
    centsAsDecimal(entry.planned_cents),
    centsAsDecimal(entry.actual_cents),
    entry.realized_on ?? '',
    entry.payment_method_name ?? '',
    statusLabels[entry.status],
    entry.notes ?? '',
    entry.card_name ?? '',
    entry.invoice_month ? `${entry.invoice_month.slice(5, 7)}/${entry.invoice_month.slice(0, 4)}` : '',
    entry.installment_number && entry.installment_count ? `${entry.installment_number}/${entry.installment_count}` : '',
    entry.invoice_status ? invoiceStatusLabels[entry.invoice_status] : '',
  ]);
  return `\uFEFF${[headers.map((header) => csvField(header)).join(';'), ...rows.map((row) => row.map((value, index) => csvField(value, [0, 1, 2, 8, 9, 10, 11, 14].includes(index))).join(';'))].join('\r\n')}\r\n`;
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function entriesCsvFilename(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `conta-clara-lancamentos-${month}.csv` : 'conta-clara-lancamentos.csv';
}
