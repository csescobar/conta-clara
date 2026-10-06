import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './pages';

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function emptyDashboard(month: string) {
  const zero = { incomeCents: '0', expenseCents: '0', investmentCents: '0', resultCents: '0' };
  return { month: `${month}-01`, planned: zero, realized: zero, upcoming: { count: 0, entries: [] }, overdue: { count: 0, entries: [] } };
}

function renderPage() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

afterEach(() => vi.unstubAllGlobals());

describe('financial dashboard', () => {
  it('compares competence totals with realization dates and keeps contributions separate', async () => {
    const december = {
      month: '2025-12-01',
      planned: { incomeCents: '105000', expenseCents: '30000', investmentCents: '10000', resultCents: '65000' },
      realized: { incomeCents: '12000', expenseCents: '28000', investmentCents: '0', resultCents: '-16000' },
      upcoming: { count: 1, entries: [{ id: 'soon', description: 'Energia', competence_on: '2025-12-01', due_on: '2025-12-18', planned_cents: '9990' }] },
      overdue: { count: 1, entries: [{ id: 'late', description: 'Internet atrasada', competence_on: '2025-11-01', due_on: '2025-11-18', planned_cents: '5490' }] },
    };
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      const month = new URL(input, window.location.origin).searchParams.get('month') ?? '2026-10';
      return response(month === '2025-12' ? december : emptyDashboard(month));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    const monthInput = screen.getByLabelText('Mês do painel');
    fireEvent.change(monthInput, { target: { value: '2025-12' } });
    const incomeRow = await screen.findByRole('row', { name: /Receitas/ });
    expect(screen.getByText('Dezembro de 2025')).toBeInTheDocument();
    expect(within(incomeRow).getByText(/1\.050,00/)).toBeInTheDocument();
    expect(within(incomeRow).getByText(/120,00/)).toBeInTheDocument();

    const expenseRow = screen.getByRole('row', { name: /Despesas/ });
    expect(within(expenseRow).getByText(/300,00/)).toBeInTheDocument();
    expect(within(expenseRow).getByText(/280,00/)).toBeInTheDocument();
    const investmentRow = screen.getByRole('row', { name: /Aportes/ });
    expect(within(investmentRow).getByText(/100,00/)).toBeInTheDocument();
    expect(within(investmentRow).getAllByRole('cell')[1]).toHaveTextContent('0,00');
    const resultRow = screen.getByRole('row', { name: /Resultado do período/ });
    expect(within(resultRow).getByText(/650,00/)).toBeInTheDocument();
    expect(within(resultRow).getByText(/-R\$.*160,00/)).toBeInTheDocument();
    expect(screen.getByText('Energia')).toBeInTheDocument();
    expect(screen.getByText('Internet atrasada')).toBeInTheDocument();
    expect(screen.getByText(/não representa o saldo de uma conta bancária/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard?month=2025-12', { credentials: 'same-origin', cache: 'no-store' });
  });

  it('shows zeros for an empty month and moves backward across a year boundary', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      const month = new URL(input, window.location.origin).searchParams.get('month') ?? '2026-01';
      return response(emptyDashboard(month));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    const monthInput = screen.getByLabelText('Mês do painel');
    fireEvent.change(monthInput, { target: { value: '2026-01' } });
    await screen.findByRole('table', { name: 'Valores previstos e realizados em Janeiro de 2026' });
    await user.tab();
    expect(screen.getByRole('button', { name: 'Mês anterior' })).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(monthInput).toHaveValue('2025-12'));
    expect(await screen.findByRole('table', { name: 'Valores previstos e realizados em Dezembro de 2025' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Nenhuma conta próxima' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Nenhuma conta atrasada' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard?month=2025-12', { credentials: 'same-origin', cache: 'no-store' });
  });
});
