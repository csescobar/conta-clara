import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { currentMonthInputValue } from '../lib/finance';
import { NewTransactionPage, TransactionsPage } from './entries-pages';

const auth = { user: { id: 'member-id', name: 'Membro', email: 'member@example.test', role: 'member', spaceId: 'space-id' }, csrfToken: 'csrf-entry-test' };
const categories = [
  { id: 'expense-category', name: 'Moradia', kind: 'expense', expense_class: 'fixed' },
  { id: 'income-category', name: 'Renda', kind: 'income', expense_class: null },
];
const methods = [{ id: 'payment-method', name: 'Pix' }];

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderPage(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AuthContext.Provider value={auth}><Routes><Route path="/lancamentos" element={<TransactionsPage />} /><Route path="/lancamentos/novo" element={<NewTransactionPage />} /><Route path="/lancamentos/:id/editar" element={<NewTransactionPage />} /></Routes></AuthContext.Provider></MemoryRouter>);
}

afterEach(() => vi.unstubAllGlobals());

describe('financial entry pages', () => {
  it('validates Brazilian dates and saves whole cents using active shared references', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/catalog/categories') return response({ categories });
      if (input === '/api/catalog/payment-methods') return response({ paymentMethods: methods });
      if (input.startsWith('/api/entries?')) return response({ entries: [] });
      if (input === '/api/entries' && init?.method === 'POST') return response({ entry: { id: 'entry-id' } }, 201);
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage('/lancamentos/novo');

    await user.type(await screen.findByRole('textbox', { name: 'Descrição' }), 'Conta de energia');
    await user.type(screen.getByRole('textbox', { name: /Valor previsto/ }), '1.234,56');
    await user.type(screen.getByRole('textbox', { name: 'Vencimento' }), '31/02/2026');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'expense-category');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Forma de pagamento' }), 'payment-method');
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/DD\/MM\/AAAA/);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);

    const dueDate = screen.getByRole('textbox', { name: 'Vencimento' });
    await user.clear(dueDate);
    await user.type(dueDate, '28/02/2026');
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));
    expect(await screen.findByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
    const create = fetchMock.mock.calls.find(([input, init]) => input === '/api/entries' && init?.method === 'POST');
    expect(JSON.parse(String(create?.[1]?.body))).toMatchObject({
      kind: 'expense', description: 'Conta de energia', categoryId: 'expense-category',
      competenceOn: `${currentMonthInputValue()}-01`, dueOn: '2026-02-28', plannedCents: 123456,
      paymentMethodId: 'payment-method', notes: null,
    });
    expect(create?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-entry-test' });
  });

  it('filters the shared list and deletes an entry after confirmation', async () => {
    const archivedCategory = { id: 'old-category', name: 'Categoria antiga', kind: 'expense', expense_class: 'fixed', archived_at: '2026-01-01' };
    const entry = {
      id: 'entry-id', kind: 'expense', description: 'Conta de energia', category_id: 'expense-category', category_name: 'Moradia',
      competence_on: `${currentMonthInputValue()}-01`, due_on: '2026-10-10', planned_cents: '123456', actual_cents: null,
      realized_on: null, payment_method_id: null, payment_method_name: null, notes: null,
      created_by_user_id: 'member-id', updated_by_user_id: 'member-id', status: 'pending',
    };
    let hasEntry = true;
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/catalog/categories?includeArchived=true') return response({ categories: [...categories, archivedCategory] });
      if (input.startsWith('/api/entries?')) return response({ entries: hasEntry ? [entry] : [] });
      if (input === '/api/entries/entry-id' && init?.method === 'DELETE') {
        hasEntry = false;
        return response({}, 204);
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = userEvent.setup();
    renderPage('/lancamentos');

    expect(await screen.findByText('Conta de energia')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Categoria antiga (arquivada)' })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'expense-category');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'pending');
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => input === `/api/entries?month=${currentMonthInputValue()}&categoryId=expense-category&status=pending`)).toBe(true));
    expect(screen.getByRole('link', { name: 'Editar Conta de energia' })).toHaveAttribute('href', '/lancamentos/entry-id/editar');

    await user.click(screen.getByRole('button', { name: 'Excluir Conta de energia' }));
    expect(window.confirm).toHaveBeenCalledWith('Excluir “Conta de energia”? Esta ação não pode ser desfeita.');
    expect(await screen.findByRole('status', { name: 'Nenhum lançamento encontrado' })).toBeInTheDocument();
    const remove = fetchMock.mock.calls.find(([input, init]) => input === '/api/entries/entry-id' && init?.method === 'DELETE');
    expect(remove?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-entry-test' });
  });

  it('keeps an archived category and payment method on the entry being edited', async () => {
    const archivedCategory = { id: 'archived-category', name: 'Antiga', kind: 'expense', expense_class: 'fixed', archived_at: '2026-01-01' };
    const archivedMethod = { id: 'archived-method', name: 'Cheque', archived_at: '2026-01-01' };
    const entry = {
      id: 'entry-id', kind: 'expense', description: 'Conta antiga', category_id: archivedCategory.id, category_name: archivedCategory.name,
      competence_on: `${currentMonthInputValue()}-01`, due_on: null, planned_cents: '1234', actual_cents: null,
      realized_on: null, payment_method_id: archivedMethod.id, payment_method_name: archivedMethod.name, notes: null,
      created_by_user_id: 'member-id', updated_by_user_id: 'member-id', status: 'pending',
    };
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/catalog/categories?includeArchived=true') return response({ categories: [...categories, archivedCategory] });
      if (input === '/api/catalog/payment-methods?includeArchived=true') return response({ paymentMethods: [...methods, archivedMethod] });
      if (input === '/api/entries/entry-id' && !init?.method) return response({ entry });
      if (input === '/api/entries/entry-id' && init?.method === 'PUT') return response({ entry });
      if (input.startsWith('/api/entries?')) return response({ entries: [] });
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage('/lancamentos/entry-id/editar');

    const categoryField = await screen.findByRole('combobox', { name: 'Categoria' });
    const methodField = screen.getByRole('combobox', { name: 'Forma de pagamento' });
    expect(categoryField).toHaveValue('archived-category');
    expect(within(categoryField).getByRole('option', { name: 'Antiga (arquivada)' })).toBeInTheDocument();
    expect(methodField).toHaveValue('archived-method');
    expect(within(methodField).getByRole('option', { name: 'Cheque (arquivada)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const update = fetchMock.mock.calls.find(([input, init]) => input === '/api/entries/entry-id' && init?.method === 'PUT');
    expect(JSON.parse(String(update?.[1]?.body))).toMatchObject({ categoryId: 'archived-category', paymentMethodId: 'archived-method' });
  });
});
