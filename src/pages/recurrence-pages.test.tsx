import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { RecurrenceFormPage, RecurrencesPage } from './recurrence-pages';

const auth = { user: { id: 'member-id', name: 'Membro', email: 'member@example.test', role: 'member', spaceId: 'space-id' }, csrfToken: 'csrf-recurrence-test' };
const categories = [{ id: 'expense-category', name: 'Moradia', kind: 'expense', archived_at: null }];
const paymentMethods = [{ id: 'payment-method', name: 'Pix', archived_at: null }];

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderPages(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AuthContext.Provider value={auth}><Routes>
    <Route path="/recorrencias" element={<RecurrencesPage />} />
    <Route path="/recorrencias/novo" element={<RecurrenceFormPage />} />
  </Routes></AuthContext.Provider></MemoryRouter>);
}

afterEach(() => vi.unstubAllGlobals());

describe('monthly recurrence pages', () => {
  it('creates a monthly expense and serializes the month, due day, and cents', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/catalog/categories') return response({ categories });
      if (input === '/api/catalog/payment-methods') return response({ paymentMethods });
      if (input === '/api/recurrences' && init?.method === 'POST') return response({ rule: { id: 'rule-id' } }, 201);
      if (input === '/api/recurrences') return response({ rules: [] });
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPages('/recorrencias/novo');

    await user.type(await screen.findByRole('textbox', { name: 'Descrição' }), 'Conta de energia');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'expense-category');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Forma de pagamento' }), 'payment-method');
    fireEvent.change(screen.getByLabelText('Mês de início'), { target: { value: '2024-01' } });
    await user.type(screen.getByRole('spinbutton', { name: 'Dia de vencimento' }), '31');
    await user.type(screen.getByRole('textbox', { name: 'Valor previsto (R$)' }), '1.234,56');
    await user.click(screen.getByRole('button', { name: 'Criar regra' }));

    expect(await screen.findByRole('heading', { name: 'Recorrências' })).toBeInTheDocument();
    const create = fetchMock.mock.calls.find(([input, init]) => input === '/api/recurrences' && init?.method === 'POST');
    expect(JSON.parse(String(create?.[1]?.body))).toMatchObject({
      kind: 'expense', description: 'Conta de energia', categoryId: 'expense-category',
      paymentMethodId: 'payment-method', startCompetenceOn: '2024-01-01', endCompetenceOn: null,
      dueDay: 31, plannedCents: 123456, notes: null,
    });
    expect(create?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-recurrence-test' });
  });

  it('validates a reversed end month before sending the rule', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      if (input === '/api/catalog/categories') return response({ categories });
      if (input === '/api/catalog/payment-methods') return response({ paymentMethods });
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPages('/recorrencias/novo');

    await user.type(await screen.findByRole('textbox', { name: 'Descrição' }), 'Conta de energia');
    fireEvent.change(screen.getByLabelText('Mês de início'), { target: { value: '2026-10' } });
    fireEvent.change(screen.getByLabelText('Mês de término'), { target: { value: '2026-09' } });
    await user.type(screen.getByRole('textbox', { name: 'Valor previsto (R$)' }), '100,00');
    await user.click(screen.getByRole('button', { name: 'Criar regra' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('O término deve ser igual ou posterior ao início.');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('archives an active rule and keeps archived rules visible', async () => {
    const rule = {
      id: 'rule-id', kind: 'expense', description: 'Aluguel', category_id: 'expense-category', category_name: 'Moradia',
      payment_method_id: null, payment_method_name: null, start_competence_on: '2026-01-01', end_competence_on: null,
      due_day: 5, planned_cents: '180000', notes: null, archived_at: null, occurrence_count: 3,
    };
    let currentRule: Omit<typeof rule, 'archived_at'> & { archived_at: string | null } = { ...rule };
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/recurrences' && !init?.method) return response({ rules: [currentRule] });
      if (input === '/api/recurrences/rule-id/archive' && init?.method === 'POST') {
        currentRule = { ...currentRule, archived_at: '2026-10-05T12:00:00.000Z' };
        return response({}, 204);
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = userEvent.setup();
    renderPages('/recorrencias');

    expect(await screen.findByText('Aluguel')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Arquivar regra Aluguel' }));
    await waitFor(() => expect(screen.getByText('Aluguel (arquivada)')).toBeInTheDocument());
    expect(window.confirm).toHaveBeenCalledWith('Arquivar a regra “Aluguel”? Os lançamentos já gerados serão mantidos.');
    const archive = fetchMock.mock.calls.find(([input]) => input === '/api/recurrences/rule-id/archive');
    expect(archive?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-recurrence-test' });
  });
});
