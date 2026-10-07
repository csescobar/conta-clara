import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { currentMonthInputValue } from './lib/finance';

const signedInState = {
  initialized: true,
  user: { id: 'demo-user', name: 'Pessoa de exemplo', email: 'demo@example.test', role: 'admin', spaceId: 'demo-space' },
  csrfToken: 'csrf-demo',
};
const demoMember = { id: 'demo-user', name: 'Pessoa de exemplo', email: 'demo@example.test', role: 'admin', is_active: true };
const demoDashboard = {
  month: `${currentMonthInputValue()}-01`,
  planned: { incomeCents: '780000', expenseCents: '346247', investmentCents: '50000', resultCents: '383753' },
  realized: { incomeCents: '780000', expenseCents: '346247', investmentCents: '50000', resultCents: '383753' },
  charts: { expensesByCategory: [{ categoryId: 'demo-home', categoryName: 'Moradia', plannedCents: '180000', realizedCents: '180000' }] },
  upcoming: { count: 0, entries: [] }, overdue: { count: 0, entries: [] },
};

async function renderSignedInApp() {
  render(<App />);
  await screen.findByRole('heading', { name: 'Visão geral' });
  await screen.findByRole('table', { name: /Valores previstos e realizados/ });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string | URL | Request) => {
    const path = String(input);
    const body = path === '/api/auth/state' ? signedInState : path.startsWith('/api/dashboard?') ? demoDashboard : path === '/api/members' ? { members: [demoMember] } : path === '/api/members/invitations' ? { invitations: [] } : {};
    return { ok: true, json: async () => body };
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('application navigation and preview screens', () => {
  it('shows the monthly dashboard with data from its summary endpoint', async () => {
    await renderSignedInApp();

    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mês do painel')).toHaveValue(currentMonthInputValue());
    const summaryTable = await screen.findByRole('table', { name: /Valores previstos e realizados/ });
    const incomeCells = within(within(summaryTable).getByRole('row', { name: /Receitas/ })).getAllByRole('cell');
    expect(incomeCells[0]).toHaveTextContent(/7\.800,00/);
    expect(incomeCells[1]).toHaveTextContent(/7\.800,00/);
    expect(screen.getByText(/não representa o saldo de uma conta bancária/i)).toBeInTheDocument();
  });

  it('opens the saved transaction list from the main navigation', async () => {
    const user = userEvent.setup();
    await renderSignedInApp();

    const mainNav = screen.getByRole('navigation', { name: /^Navegação principal$/ });
    await user.click(within(mainNav).getByRole('link', { name: 'Lançamentos' }));
    expect(screen.getByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Filtrar lançamentos' })).toBeInTheDocument();
  });

  it('opens the read-only shared history from the main navigation', async () => {
    const user = userEvent.setup();
    await renderSignedInApp();

    const mainNav = screen.getByRole('navigation', { name: /^Navegação principal$/ });
    await user.click(within(mainNav).getByRole('link', { name: 'Histórico' }));
    expect(await screen.findByRole('heading', { name: 'Histórico' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Nenhuma alteração registrada' })).toBeInTheDocument();
  });

  it('makes the mobile navigation and active entry form clear', async () => {
    const user = userEvent.setup();
    await renderSignedInApp();

    expect(screen.getByRole('navigation', { name: /^Navegação principal móvel$/ })).toBeInTheDocument();
    const mobileNav = screen.getByRole('navigation', { name: /^Navegação principal móvel$/ });
    await user.click(within(mobileNav).getByRole('link', { name: 'Recorrências' }));
    expect(screen.getByRole('heading', { name: 'Recorrências' })).toBeInTheDocument();

    await user.click(within(mobileNav).getByRole('link', { name: 'Visão geral' }));
    await user.click(screen.getByRole('link', { name: 'Adicionar lançamento' }));
    expect(screen.getByRole('heading', { name: 'Adicionar lançamento' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Vencimento' })).toHaveAttribute('placeholder', 'DD/MM/AAAA');
    expect(screen.getByRole('button', { name: 'Salvar lançamento' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toBeInTheDocument();
  });

  it('opens member settings with admin controls and the current household roster', async () => {
    const user = userEvent.setup();
    await renderSignedInApp();
    const mainNav = screen.getByRole('navigation', { name: /^Navegação principal$/ });

    await user.click(within(mainNav).getByRole('link', { name: 'Configurações' }));
    expect(screen.getByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Pessoas' })).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByText('Pessoa de exemplo')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Gerar convite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link para redefinir senha' })).toBeInTheDocument();
  });
});
