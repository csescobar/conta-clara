import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { ToastHost } from '../components/ui/toast-host';
import { expectNoAccessibilityViolations } from '../test/axe';
import DesignCatalogPage from './design-catalog';
import { NewTransactionPage, TransactionsPage } from './entries-pages';

const auth = {
  user: { id: 'member-id', name: 'Membro', email: 'member@example.test', role: 'member', spaceId: 'space-id' },
  csrfToken: 'csrf-a11y',
};
const categories = [{ id: 'expense-category', name: 'Moradia', kind: 'expense', expense_class: 'fixed' }];
const entry = {
  id: 'entry-id',
  kind: 'expense',
  description: 'Conta de energia fictícia',
  category_id: 'expense-category',
  category_name: 'Moradia',
  competence_on: '2026-10-01',
  due_on: '2026-10-18',
  planned_cents: '123456',
  actual_cents: null,
  realized_on: null,
  payment_method_id: null,
  payment_method_name: null,
  notes: null,
  created_by_user_id: 'member-id',
  updated_by_user_id: 'member-id',
  status: 'pending',
  version: 1,
};

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      if (input.startsWith('/api/catalog/categories')) return response({ categories });
      if (input.startsWith('/api/catalog/payment-methods')) return response({ paymentMethods: [] });
      if (input.startsWith('/api/entries?')) return response({ entries: [entry] });
      throw new Error(`Unexpected request: ${input}`);
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('accessibility (axe)', () => {
  it('has no violations in the design system catalog', async () => {
    const { container } = render(
      <MemoryRouter>
        <DesignCatalogPage />
        <ToastHost />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Catálogo do design system' })).toBeInTheDocument();
    await expectNoAccessibilityViolations(container);
  });

  it('has no violations in the open confirmation dialog of the catalog', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DesignCatalogPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Pedir confirmação' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Excluir lançamento' })).toBeInTheDocument();
    await expectNoAccessibilityViolations(dialog);
  });

  it('has no violations in the entries list and the entry form', async () => {
    stubApi();
    const { container } = render(
      <MemoryRouter initialEntries={['/lancamentos']}>
        <AuthContext.Provider value={auth}>
          <Routes>
            <Route path="/lancamentos" element={<TransactionsPage />} />
            <Route path="/lancamentos/:id/editar" element={<NewTransactionPage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Conta de energia fictícia')).toBeInTheDocument();
    await expectNoAccessibilityViolations(container);

    await userEvent.setup().click(screen.getByRole('link', { name: 'Editar Conta de energia fictícia' }));
    expect(await screen.findByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
    await expectNoAccessibilityViolations(container);
  });
});
