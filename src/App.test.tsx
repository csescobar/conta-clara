import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('application navigation and preview screens', () => {
  it('shows the monthly dashboard with fictional financial examples', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByText('Outubro de 2026')).toBeInTheDocument();
    expect(screen.getAllByText(/7\.800,00/)).toHaveLength(2);
    expect(screen.getByText(/dados fictícios/i)).toBeInTheDocument();
  });

  it('navigates to the transaction preview from the main navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const mainNav = screen.getByRole('navigation', { name: /^Navegação principal$/ });
    await user.click(within(mainNav).getByRole('link', { name: 'Lançamentos' }));
    expect(screen.getByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
    expect(screen.getByText(/não grava nem importa dados/i)).toBeInTheDocument();
  });

  it('makes the mobile navigation and the inactive demo form clear', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('navigation', { name: /^Navegação principal móvel$/ })).toBeInTheDocument();
    const mobileNav = screen.getByRole('navigation', { name: /^Navegação principal móvel$/ });
    await user.click(within(mobileNav).getByRole('link', { name: 'Recorrências' }));
    expect(screen.getByRole('heading', { name: 'Recorrências' })).toBeInTheDocument();

    await user.click(within(mobileNav).getByRole('link', { name: 'Visão geral' }));
    await user.click(screen.getByRole('link', { name: 'Adicionar lançamento' }));
    expect(screen.getByRole('heading', { name: 'Adicionar lançamento' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Vencimento' })).toHaveAttribute('placeholder', 'DD/MM/AAAA');
    expect(screen.getByRole('button', { name: /salvar lançamento/i })).toBeDisabled();
    expect(screen.getByText(/não são salvos nesta versão/i)).toBeInTheDocument();
  });

  it('opens the shared settings preview without implying that settings are persisted', async () => {
    const user = userEvent.setup();
    render(<App />);
    const mainNav = screen.getByRole('navigation', { name: /^Navegação principal$/ });

    await user.click(within(mainNav).getByRole('link', { name: 'Configurações' }));
    expect(screen.getByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
    expect(screen.getAllByText(/próxima etapa/i)).toHaveLength(3);
    expect(screen.getByText(/nenhuma configuração ou convite é alterado/i)).toBeInTheDocument();
  });
});
