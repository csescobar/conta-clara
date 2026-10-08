import { describe, expect, it } from 'vitest';
import { entriesCsvFilename, serializeEntriesCsv, type CsvFinancialEntry } from './csv-export';

const entry: CsvFinancialEntry = {
  kind: 'expense',
  description: 'Mercado; “São José”',
  category_name: 'Alimentação',
  competence_on: '2026-10-01',
  due_on: '2026-10-18',
  planned_cents: '123456',
  actual_cents: null,
  realized_on: null,
  payment_method_name: 'Cartão de crédito',
  status: 'pending',
  notes: 'Linha um\r\nlinha dois',
};

describe('CSV export', () => {
  it('writes UTF-8 BOM, Portuguese headings, semicolon delimiters, exact decimal values, and ISO dates', () => {
    const csv = serializeEntriesCsv([entry]);

    expect(csv.startsWith('\uFEFF"Tipo";"Descrição";"Categoria"')).toBe(true);
    expect(csv).toContain('"Competência (AAAA-MM-DD)"');
    expect(csv).toContain(
      '"Mercado; “São José”";"Alimentação";"2026-10-01";"2026-10-18";"1234.56";"";"";"Cartão de crédito";"Em aberto";"Linha um\r\nlinha dois"',
    );
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('quotes and neutralizes formula-like text after leading whitespace', () => {
    const csv = serializeEntriesCsv([
      {
        ...entry,
        description: ' =HYPERLINK("https://example.test")',
        category_name: '+CMD()',
        payment_method_name: '\t@SUM(A1:A2)',
        notes: '\u0000=1+1',
      },
    ]);

    expect(csv).toContain('"\' =HYPERLINK(""https://example.test"")"');
    expect(csv).toContain('"\'+CMD()"');
    expect(csv).toContain('"\'\t@SUM(A1:A2)"');
    expect(csv).toContain('"\'\u0000=1+1"');
  });

  it('formats realized zero cents and supports an unfiltered filename', () => {
    const csv = serializeEntriesCsv([{ ...entry, actual_cents: 0, realized_on: '2026-10-19', status: 'paid' }]);
    expect(csv).toContain('"1234.56";"0.00";"2026-10-19"');
    expect(entriesCsvFilename('2026-10')).toBe('conta-clara-lancamentos-2026-10.csv');
    expect(entriesCsvFilename('')).toBe('conta-clara-lancamentos.csv');
  });

  it('adds card invoice details and protects card names from spreadsheet formulas', () => {
    const csv = serializeEntriesCsv([
      {
        ...entry,
        card_name: '=Cartão fictício',
        invoice_month: '2026-11-01',
        installment_number: 2,
        installment_count: 3,
        invoice_status: 'paid',
      },
    ]);
    expect(csv).toContain('"Cartão";"Fatura (MM/AAAA)";"Parcela";"Situação da fatura"');
    expect(csv).toContain('"\'=Cartão fictício";"11/2026";"2/3";"Quitada"');
  });
});
