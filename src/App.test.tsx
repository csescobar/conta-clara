import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const signedInState = {
  initialized: true,
  user: { id: 'demo-user', name: 'Pessoa de exemplo', email: 'demo@example.test', role: 'admin', spaceId: 'demo-space' },
  csrfToken: 'csrf-demo',
};
const demoMember = { id: 'demo-user', name: 'Pessoa de exemplo', email: 'demo@example.test', role: 'admin', is_active: true };

async function renderSignedInApp() {
  render(<App />);
  await screen.findByRole('heading', { name: 'Visão geral' });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string | URL | Request) => {
    const path = String(input);
    const body = path === '/api/auth/state' ? signedInState : path === '/api/members' ? { members: [demoMember] } : path === '/api/members/invitations' ? { invitations: [] } : {};
    return { ok: true, json: async () => body };
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('application navigation and preview screens', () => {
  it('shows the monthly dashboard with fictional financial examples', async () => {
    await renderSignedInApp();

    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByText('Outubro de 2026')).toBeInTheDocument();
    expect(screen.getAllByText(/7\.800,00/)).toHaveLength(2);
    expect(screen.getByText(/dados fictícios/i)).toBeInTheDocument();
  });

  it('opens the saved transaction list from the main navigation', async () => {
    const user = userEvent.setup();
    await renderSignedInApp();

    const mainNav = screen.getByRole('navigation', { name: /^Navegação principal$/ });
    await user.click(within(mainNav).getByRole('link', { name: 'Lançamentos' }));
    expect(screen.getByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Filtrar lançamentos' })).toBeInTheDocument();
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
    expect(screen.getAllByText('Pessoa de exemplo')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Gerar convite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link para redefinir senha' })).toBeInTheDocument();
  });
});
