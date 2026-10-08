import * as XLSX from 'xlsx';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { SpreadsheetImportPage } from './spreadsheet-import-page';

const auth = {
  user: { id: 'member-id', name: 'Membro', email: 'member@example.test', role: 'member', spaceId: 'space-id' },
  csrfToken: 'csrf-import-test',
};
const categories = [
  { id: 'investment-category', name: 'Aporte teste', kind: 'investment', archived_at: null },
  { id: 'income-category', name: 'Renda teste', kind: 'income', archived_at: null },
];
const paymentMethods = [{ id: 'payment-method', name: 'Pix teste', archived_at: null }];

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function workbookFile({ paidDate = '2/3' } = {}) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
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
      ['Aporte fictício', 'Aporte teste', 31, '$20.00', 'Pix teste', 'Pago', paidDate, 'Nota sintética'],
    ]),
    'Contas e Vencimentos',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Mês', 'Receitas Previstas', 'Despesas Fixas', 'Despesas Variáveis', 'Total de Saídas', 'Saldo Projetado'],
      ['January', '$100.00', '$30.00', '$10.00', '$40.00', '$60.00'],
    ]),
    'Fluxo de Caixa Mensal',
  );
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const file = new File([bytes], 'modelo-sintetico.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.slice(0) });
  return file;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/importar']}>
      <AuthContext.Provider value={auth}>
        <Routes>
          <Route path="/importar" element={<SpreadsheetImportPage />} />
          <Route path="/lancamentos" element={<h1>Lançamentos</h1>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('spreadsheet import page', () => {
  it('shows a review, requires explicit confirmation, and sends mapped entries only after confirmation', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/catalog/categories') return response({ categories });
      if (input === '/api/catalog/payment-methods') return response({ paymentMethods });
      if (input === '/api/imports' && init?.method === 'POST') return response({ batch: { item_count: 2 } }, 201);
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    const file = workbookFile();
    await user.upload(screen.getByLabelText('Arquivo XLSX'), file);
    fireEvent.change(screen.getByLabelText('Ano para datas sem ano'), { target: { value: '2026' } });
    await user.selectOptions(screen.getByLabelText('Competência das contas'), '2');
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));

    expect(await screen.findByRole('heading', { name: '2. Revise o que será importado' })).toBeInTheDocument();
    expect(
      screen.getByText('A data não informa o ano; foi usado 2026. A data também pode ser lida como dia/mês; confira a interpretação.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revisar e confirmar 2 lançamentos/ })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Revisei as 1 datas sinalizadas/ }));
    await user.click(screen.getByRole('button', { name: /Revisar e confirmar 2 lançamentos/ }));
    expect(screen.getByRole('alertdialog', { name: 'Confirmar importação' })).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Confirmar e importar' });
    const backButton = screen.getByRole('button', { name: 'Voltar à revisão' });
    expect(confirmButton).toHaveFocus();
    await user.tab();
    expect(backButton).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Confirmar e importar' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => input === '/api/imports' && init?.method === 'POST')).toBe(false);

    await user.click(screen.getByRole('button', { name: /Revisar e confirmar 2 lançamentos/ }));
    await user.click(screen.getByRole('button', { name: 'Confirmar e importar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('2 lançamentos foram importados');
    const importCall = fetchMock.mock.calls.find(([input, init]) => input === '/api/imports' && init?.method === 'POST');
    expect(importCall?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-import-test' });
    expect(JSON.parse(String(importCall?.[1]?.body))).toEqual({
      entries: [
        expect.objectContaining({
          kind: 'investment',
          description: 'Aporte fictício',
          categoryId: 'investment-category',
          competenceOn: '2026-02-01',
          dueOn: '2026-02-28',
          plannedCents: 2000,
          actualCents: 2000,
          realizedOn: '2026-02-03',
          paymentMethodId: 'payment-method',
        }),
        expect.objectContaining({
          kind: 'income',
          description: 'Receita prevista de janeiro',
          categoryId: null,
          competenceOn: '2026-01-01',
          plannedCents: 10000,
        }),
      ],
    });
    expect(screen.getByRole('link', { name: 'Ver lançamentos' })).toHaveAttribute('href', '/lancamentos');
  });

  it('reports a duplicate batch without replacing the preview', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/catalog/categories') return response({ categories });
      if (input === '/api/catalog/payment-methods') return response({ paymentMethods });
      if (input === '/api/imports' && init?.method === 'POST')
        return response({ error: 'Este mesmo lote já foi importado para este espaço.' }, 409);
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.upload(screen.getByLabelText('Arquivo XLSX'), workbookFile({ paidDate: '2/25/2026' }));
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    await screen.findByRole('heading', { name: '2. Revise o que será importado' });
    await user.click(screen.getByRole('button', { name: /Revisar e confirmar 2 lançamentos/ }));
    await user.click(screen.getByRole('button', { name: 'Confirmar e importar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este mesmo lote já foi importado para este espaço.');
    expect(screen.getByRole('heading', { name: '2. Revise o que será importado' })).toBeInTheDocument();
  });
});
