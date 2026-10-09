import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { ActionMenu } from '../components/ui/action-menu';
import { currentMonthInputValue } from '../lib/finance';
import { TransactionsPage } from './entries-pages';

const auth = {
  user: { id: 'member-id', name: 'Membro', email: 'member@example.test', role: 'member', spaceId: 'space-id' },
  csrfToken: 'csrf-hierarchy',
};

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

const entry = (id: string, description: string, dueOn: string | null, overrides: Record<string, unknown> = {}) => ({
  id,
  kind: 'expense',
  description,
  category_id: 'expense-category',
  category_name: 'Moradia',
  competence_on: `${currentMonthInputValue()}-01`,
  due_on: dueOn,
  planned_cents: '10000',
  actual_cents: null,
  realized_on: null,
  payment_method_id: null,
  payment_method_name: null,
  notes: null,
  created_by_user_id: 'member-id',
  updated_by_user_id: 'member-id',
  status: 'pending',
  version: 1,
  ...overrides,
});

function renderEntries(entries: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.startsWith('/api/catalog/categories')) return response({ categories: [] });
      if (input.startsWith('/api/entries?')) return response({ entries });
      if (input === '/api/entries/luz' && init?.method === 'DELETE') return response({}, 204);
      throw new Error(`Unexpected request: ${input}`);
    }),
  );
  return render(
    <MemoryRouter initialEntries={['/lancamentos']}>
      <AuthContext.Provider value={auth}>
        <Routes>
          <Route path="/lancamentos" element={<TransactionsPage />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('entries grouped by due date', () => {
  it('shows one headed group per due date, in date order, with entries without a due date last', async () => {
    renderEntries([
      entry('agua', 'Água', '2026-10-20'),
      entry('luz', 'Luz', '2026-10-05'),
      entry('sem', 'Anuidade sem data', null),
      entry('gas', 'Gás', '2026-10-20'),
    ]);

    await screen.findByText('Luz');
    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['Segunda-feira, 05/10/2026', 'Terça-feira, 20/10/2026', 'Sem vencimento']);

    const second = screen.getByRole('region', { name: 'Terça-feira, 20/10/2026' });
    expect(
      within(second)
        .getAllByRole('listitem')
        .map((item) => within(item).getByText(/^(Água|Gás)$/).textContent),
    ).toEqual(['Água', 'Gás']);
    expect(within(screen.getByRole('region', { name: 'Sem vencimento' })).getByText('Anuidade sem data')).toBeInTheDocument();
  });

  it('does not repeat the due date or the competence inside each row', async () => {
    renderEntries([entry('luz', 'Luz', '2026-10-05')]);

    const row = (await screen.findByText('Luz')).closest('li');
    expect(row).not.toHaveTextContent(/Vencimento|Competência/);
    expect(row).toHaveTextContent('Despesa · Moradia');
  });
});

describe('compact row details', () => {
  it('starts the details of a paid entry with its realization date so a short line never hides it', async () => {
    renderEntries([entry('paga', 'Conta paga', '2026-10-05', { actual_cents: '10000', realized_on: '2026-10-09', status: 'paid' })]);

    const row = (await screen.findByText('Conta paga')).closest('li');
    expect(row).toHaveTextContent('Realizado 09/10/2026 · Despesa · Moradia');
    expect(within(row as HTMLElement).getByText(/Realizado 09\/10\/2026/)).toHaveClass('truncate');
  });
});

describe('secondary actions menu', () => {
  it('keeps every action reachable from the row menu and returns focus to its button', async () => {
    const user = userEvent.setup();
    renderEntries([entry('luz', 'Luz', '2026-10-05')]);

    const trigger = await screen.findByRole('button', { name: 'Mais ações para Luz' });
    await user.click(trigger);
    const menu = await screen.findByRole('menu', { name: 'Mais ações para Luz' });
    expect(within(menu).getByRole('menuitem', { name: 'Editar' })).toHaveAttribute('href', '/lancamentos/luz/editar');
    expect(within(menu).getByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('opens with the keyboard, moves with arrows and runs the destructive action only after confirmation, then restores focus', async () => {
    const user = userEvent.setup();
    renderEntries([entry('luz', 'Luz', '2026-10-05')]);

    const trigger = await screen.findByRole('button', { name: 'Mais ações para Luz' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Editar' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Excluir' })).toHaveFocus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Excluir “Luz”?');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('offers undo of a confirmation for paid entries and links to the purchase for card installments', async () => {
    const user = userEvent.setup();
    renderEntries([
      entry('paga', 'Conta paga', '2026-10-05', { actual_cents: '10000', realized_on: '2026-10-05', status: 'paid' }),
      entry('parcela', 'Parcela do cartão', '2026-10-06', {
        actual_cents: '5000',
        realized_on: '2026-10-06',
        status: 'paid',
        card_purchase_id: 'compra',
      }),
    ]);

    await user.click(await screen.findByRole('button', { name: 'Mais ações para Conta paga' }));
    const paidMenu = await screen.findByRole('menu');
    expect(within(paidMenu).getByRole('menuitem', { name: 'Desfazer confirmação' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Mais ações para Parcela do cartão' }));
    const installmentMenu = await screen.findByRole('menu');
    expect(within(installmentMenu).getByRole('menuitem', { name: 'Gerenciar compra' })).toHaveAttribute('href', '/compras');
    expect(within(installmentMenu).queryByRole('menuitem', { name: 'Excluir' })).not.toBeInTheDocument();
    expect(screen.getByText(/Parcela paga/)).toBeInTheDocument();
  });
});

describe('ActionMenu', () => {
  it('disables unavailable items and does not run them', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ActionMenu
          label="Mais ações"
          items={[
            { id: 'locked', label: 'Bloqueada', onSelect, disabled: true },
            { id: 'ok', label: 'Disponível', onSelect },
          ]}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    expect(await screen.findByRole('menuitem', { name: 'Bloqueada' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('menuitem', { name: 'Bloqueada' }));
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(screen.getByRole('menuitem', { name: 'Disponível' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
  });
});
