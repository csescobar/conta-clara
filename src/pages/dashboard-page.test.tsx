import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentMonthInputValue } from '../lib/finance';
import { DashboardPage } from './pages';

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function emptyDashboard(month: string) {
  const zero = { incomeCents: '0', expenseCents: '0', investmentCents: '0', resultCents: '0' };
  return { month: `${month}-01`, planned: zero, realized: zero, charts: { expensesByCategory: [] }, upcoming: { count: 0, entries: [] }, overdue: { count: 0, entries: [] } };
}

function renderPage() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: { width: 640, height: 320 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  });
});

describe('financial dashboard', () => {
  it('compares competence totals with realization dates and keeps contributions separate', async () => {
    const december = {
      month: '2025-12-01',
      planned: { incomeCents: '105000', expenseCents: '30000', investmentCents: '10000', resultCents: '65000' },
      realized: { incomeCents: '12000', expenseCents: '40000', investmentCents: '0', resultCents: '-28000' },
      charts: { expensesByCategory: [
        { categoryId: 'home', categoryName: 'Moradia', plannedCents: '30000', realizedCents: '28000' },
        { categoryId: 'food', categoryName: 'Alimentação', plannedCents: '0', realizedCents: '12000' },
      ] },
      upcoming: { count: 1, entries: [{ id: 'soon', description: 'Energia', competence_on: '2025-12-01', due_on: '2025-12-18', planned_cents: '9990' }] },
      overdue: { count: 1, entries: [{ id: 'late', description: 'Internet atrasada', competence_on: '2025-11-01', due_on: '2025-11-18', planned_cents: '5490' }] },
    };
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      const month = new URL(input, window.location.origin).searchParams.get('month') ?? '2026-10';
      return response(month === '2025-12' ? december : emptyDashboard(month));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    const monthInput = screen.getByLabelText('Mês do painel');
    fireEvent.change(monthInput, { target: { value: '2025-12' } });
    const monthlySummaryTable = await screen.findByRole('table', { name: /Valores previstos e realizados/ });
    const incomeRow = await within(monthlySummaryTable).findByRole('row', { name: /Receitas/ });
    expect(screen.getByText('Dezembro de 2025')).toBeInTheDocument();
    expect(within(incomeRow).getByText(/1\.050,00/)).toBeInTheDocument();
    expect(within(incomeRow).getByText(/120,00/)).toBeInTheDocument();

    const expenseRow = within(monthlySummaryTable).getByRole('row', { name: /Despesas/ });
    expect(within(expenseRow).getByText(/300,00/)).toBeInTheDocument();
    expect(within(expenseRow).getByText(/400,00/)).toBeInTheDocument();
    const investmentRow = within(monthlySummaryTable).getByRole('row', { name: /Aportes/ });
    expect(within(investmentRow).getByText(/100,00/)).toBeInTheDocument();
    expect(within(investmentRow).getAllByRole('cell')[1]).toHaveTextContent('0,00');
    const resultRow = within(monthlySummaryTable).getByRole('row', { name: /Resultado do período/ });
    expect(within(resultRow).getByText(/650,00/)).toBeInTheDocument();
    expect(within(resultRow).getByText(/-R\$.*280,00/)).toBeInTheDocument();
    expect(screen.getByText('Energia')).toBeInTheDocument();
    expect(screen.getByText('Internet atrasada')).toBeInTheDocument();
    expect(screen.getByText(/não representa o saldo de uma conta bancária/i)).toBeInTheDocument();
    expect(await screen.findByText(/2 categorias; previsto R\$\s+300,00, realizado R\$\s+400,00/i)).toBeInTheDocument();
    const charts = await screen.findAllByRole('application');
    expect(charts).toHaveLength(2);
    expect(charts[0]).toHaveAttribute('tabindex', '0');
    charts[0].focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(screen.getAllByRole('status').some((status) => status.textContent?.includes('Previsto:'))).toBe(true));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Valores do gráfico por categoria' }), 'realized');
    expect(screen.getByText(/Total realizado: R\$\s+400,00/)).toBeInTheDocument();
    await user.click(screen.getAllByText('Ver dados em tabela')[1]);
    const categoryTable = screen.getByRole('table', { name: 'Despesas por categoria em Dezembro de 2025' });
    expect(within(categoryTable).getByRole('columnheader', { name: 'Realizado' })).toBeInTheDocument();
    expect(within(categoryTable).queryByRole('columnheader', { name: 'Previsto' })).not.toBeInTheDocument();
    expect(within(categoryTable).getByRole('row', { name: /Moradia/ })).toHaveTextContent(/280,00/);
    expect(within(categoryTable).getByRole('row', { name: /Alimentação/ })).toHaveTextContent(/120,00/);
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
    expect(screen.getByRole('status', { name: 'Sem movimentações neste mês' })).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Mês anterior' })).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(monthInput).toHaveValue('2025-12'));
    expect(await screen.findByRole('table', { name: 'Valores previstos e realizados em Dezembro de 2025' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Nenhuma conta próxima' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Nenhuma conta atrasada' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Sem despesas no mês' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard?month=2025-12', { credentials: 'same-origin', cache: 'no-store' });
  });

  it('announces an API error instead of leaving the dashboard in a loading state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Falha no painel.' }, 503)));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha no painel.');
  });

  it('shows an empty state when the selected category series has no realized values', async () => {
    const month = currentMonthInputValue();
    const dashboard = {
      ...emptyDashboard(month),
      planned: { incomeCents: '0', expenseCents: '2500', investmentCents: '0', resultCents: '-2500' },
      charts: { expensesByCategory: [{ categoryId: 'utilities', categoryName: 'Utilidades', plannedCents: '2500', realizedCents: '0' }] },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(dashboard)));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('combobox', { name: 'Valores do gráfico por categoria' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Valores do gráfico por categoria' }), 'realized');
    expect(screen.getByRole('status', { name: 'Sem despesas realizadas neste mês' })).toBeInTheDocument();
  });
});
