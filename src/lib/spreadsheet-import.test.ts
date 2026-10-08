import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseSpreadsheetImport } from './spreadsheet-import';

function makeWorkbook({ accountRows = [], cashFlowRows = [] }: { accountRows?: unknown[][]; cashFlowRows?: unknown[][] } = {}) {
  const workbook = XLSX.utils.book_new();
  const accounts = XLSX.utils.aoa_to_sheet([
    [
      'Descrição da Conta',
      'Categoria',
      'Dia de Vencimento',
      'Valor Previsto (R$)',
      'Forma de Pagamento',
      'Status',
      'Data de Pagamento',
      'Observações',
    ],
    ...accountRows,
  ]);
  const cashFlow = XLSX.utils.aoa_to_sheet([
    ['Mês', 'Receitas Previstas', 'Despesas Fixas', 'Despesas Variáveis', 'Total de Saídas', 'Saldo Projetado'],
    ...cashFlowRows,
  ]);
  XLSX.utils.book_append_sheet(workbook, accounts, 'Contas e Vencimentos');
  XLSX.utils.book_append_sheet(workbook, cashFlow, 'Fluxo de Caixa Mensal');
  return workbook;
}

function toBytes(workbook: XLSX.WorkBook) {
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
}

describe('parseSpreadsheetImport', () => {
  it('parses en_US currency, uses the reviewed year, clamps due days, and leaves the source unchanged', () => {
    const bytes = toBytes(
      makeWorkbook({
        accountRows: [['Seguro fictício', 'Casa', 31, '$1,234.56', 'Cartão', 'Pago', '2/3', 'Conta de teste']],
        cashFlowRows: [
          ['January', 2500.25, { t: 'n', f: 'SUM(C2:D2)', v: 3100 }, 600, { t: 'n', f: 'C2+D2', v: 600 }, { t: 'n', f: 'B2-E2', v: 1900 }],
        ],
      }),
    );
    const originalBytes = bytes.slice();

    const preview = parseSpreadsheetImport(bytes, { year: 2026, expenseMonth: 2, locale: 'en_US' });

    expect(bytes).toEqual(originalBytes);
    expect(preview.entries).toEqual([
      expect.objectContaining({
        kind: 'expense',
        description: 'Seguro fictício',
        sourceCategory: 'Casa',
        sourcePaymentMethod: 'Cartão',
        competenceOn: '2026-02-01',
        dueOn: '2026-02-28',
        plannedCents: 123456,
        actualCents: 123456,
        realizedOn: '2026-02-03',
        notes: 'Conta de teste',
        warning: expect.stringContaining('não informa o ano'),
      }),
      expect.objectContaining({
        kind: 'income',
        description: 'Receita prevista de janeiro',
        competenceOn: '2026-01-01',
        plannedCents: 250025,
      }),
    ]);
    expect(preview.skipped).toEqual([]);
  });

  it('does not create entries from calculated income or totals and reports invalid rows', () => {
    const workbook = makeWorkbook({
      accountRows: [
        ['Conta com cálculo', 'Casa', 4, 450, 'Pix', 'Em aberto', '', ''],
        ['Valor inválido', 'Casa', 8, 'não é valor', 'Pix', 'Em aberto', '', ''],
      ],
      cashFlowRows: [
        ['February', { t: 'n', f: 'SUM(B3:B8)', v: 1250 }, 400, 100, 500, 750],
        ['March', 'valor inválido', 400, 100, 500, 750],
      ],
    });
    const accounts = workbook.Sheets['Contas e Vencimentos'];
    const formulaCell = XLSX.utils.encode_cell({ r: 1, c: 3 });
    accounts[formulaCell] = { t: 'n', f: '100+200', v: 300 };

    const preview = parseSpreadsheetImport(toBytes(workbook), { year: 2026, expenseMonth: 2, locale: 'en_US' });

    expect(preview.entries).toEqual([]);
    expect(preview.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceRow: 2, reason: expect.stringContaining('fórmula') }),
        expect.objectContaining({ sourceRow: 3, reason: expect.stringContaining('valor previsto') }),
        expect.objectContaining({ sourceSheet: 'Fluxo de Caixa Mensal', reason: expect.stringContaining('fórmula') }),
        expect.objectContaining({
          sourceSheet: 'Fluxo de Caixa Mensal',
          sourceRow: 3,
          reason: expect.stringContaining('valor precisa ser positivo'),
        }),
      ]),
    );
  });

  it('reads Brazilian separators when explicitly selected', () => {
    const preview = parseSpreadsheetImport(
      toBytes(
        makeWorkbook({
          accountRows: [['Despesa fictícia', '', 4, '1.234,56', '', 'Em aberto', '', '']],
        }),
      ),
      { year: 2026, expenseMonth: 3, locale: 'pt_BR' },
    );
    expect(preview.entries[0]?.plannedCents).toBe(123456);
  });

  it('rejects malformed workbooks and workbooks without both required tabs', () => {
    expect(() => parseSpreadsheetImport(new Uint8Array([1, 2, 3]), { year: 2026, expenseMonth: 1 })).toThrow(/XLSX válido/);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Mês', 'Receitas Previstas']]), 'Outra aba');
    expect(() => parseSpreadsheetImport(toBytes(workbook), { year: 2026, expenseMonth: 1 })).toThrow(/precisa conter as abas/);
  });
});
