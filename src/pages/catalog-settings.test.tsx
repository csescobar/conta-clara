import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { CatalogSettings } from './catalog-settings';

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderCatalogSettings() {
  const user = { id: 'member-id', name: 'Membro', email: 'membro@example.test', role: 'member', spaceId: 'space-id' };
  return render(
    <AuthContext.Provider value={{ user, csrfToken: 'csrf-catalog-test' }}>
      <CatalogSettings />
    </AuthContext.Provider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('shared catalog settings', () => {
  it('lets a member create, edit, archive, and restore a category', async () => {
    const categories: Array<{
      id: string;
      name: string;
      kind: string;
      expense_class: string;
      archived_at: string | null;
      expenseClass?: string;
    }> = [{ id: 'category-id', name: 'Moradia', kind: 'expense', expense_class: 'fixed', archived_at: null }];
    const methods: Array<{ id: string; name: string; archived_at: string | null }> = [
      { id: 'method-id', name: 'Transferência', archived_at: null },
    ];
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/catalog/categories?includeArchived=true' && !init?.method) return response({ categories });
      if (input === '/api/catalog/payment-methods?includeArchived=true' && !init?.method) return response({ paymentMethods: methods });
      if (input === '/api/catalog/categories' && init?.method === 'POST') {
        const category = { id: 'new-category', ...JSON.parse(String(init.body)), expense_class: 'variable', archived_at: null };
        categories.push(category);
        return response({ category }, 201);
      }
      if (input === '/api/catalog/categories/new-category' && init?.method === 'PUT') {
        Object.assign(categories[1], JSON.parse(String(init.body)), { expense_class: JSON.parse(String(init.body)).expenseClass });
        return response({ category: categories[1] });
      }
      if (input === '/api/catalog/categories/new-category/archive' && init?.method === 'POST') {
        categories[1].archived_at = '2026-10-05T00:00:00.000Z';
        return response({}, 204);
      }
      if (input === '/api/catalog/categories/new-category/restore' && init?.method === 'POST') {
        categories[1].archived_at = null;
        return response({}, 204);
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderCatalogSettings();

    expect(await screen.findByRole('heading', { name: 'Categorias' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Nome da categoria' }), 'Alimentação');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Classificação' }), 'variable');
    await user.click(screen.getByRole('button', { name: 'Adicionar categoria' }));
    expect(await screen.findByText('Alimentação')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar categoria Alimentação' }));
    const nameField = screen.getByRole('textbox', { name: 'Nome da categoria' });
    await user.clear(nameField);
    await user.type(nameField, 'Mercado');
    await user.click(screen.getByRole('button', { name: 'Salvar categoria' }));
    expect(await screen.findByText('Mercado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Arquivar categoria Mercado' }));
    const categoryList = screen.getByLabelText('Lista de categorias');
    expect(await within(categoryList).findByText('Arquivada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurar categoria Mercado' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restaurar categoria Mercado' }));
    expect(await screen.findByRole('button', { name: 'Arquivar categoria Mercado' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => input === '/api/catalog/categories' && init?.method === 'POST')).toBe(true);
  });

  it('lets a member create and manage shared payment methods', async () => {
    const categories = [{ id: 'category-id', name: 'Moradia', kind: 'expense', expense_class: 'fixed', archived_at: null }];
    const methods: Array<{ id: string; name: string; archived_at: string | null }> = [
      { id: 'method-id', name: 'Transferência', archived_at: null },
    ];
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/catalog/categories?includeArchived=true' && !init?.method) return response({ categories });
      if (input === '/api/catalog/payment-methods?includeArchived=true' && !init?.method) return response({ paymentMethods: methods });
      if (input === '/api/catalog/payment-methods' && init?.method === 'POST') {
        const method = { id: 'new-method', ...JSON.parse(String(init.body)), archived_at: null };
        methods.push(method);
        return response({ paymentMethod: method }, 201);
      }
      if (input === '/api/catalog/payment-methods/new-method' && init?.method === 'PUT') {
        Object.assign(methods[1], JSON.parse(String(init.body)));
        return response({ paymentMethod: methods[1] });
      }
      if (input === '/api/catalog/payment-methods/new-method/archive' && init?.method === 'POST') {
        methods[1].archived_at = '2026-10-05T00:00:00.000Z';
        return response({}, 204);
      }
      if (input === '/api/catalog/payment-methods/new-method/restore' && init?.method === 'POST') {
        methods[1].archived_at = null;
        return response({}, 204);
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderCatalogSettings();

    await user.type(screen.getByRole('textbox', { name: 'Nome da forma de pagamento' }), 'Pix');
    await user.click(screen.getByRole('button', { name: 'Adicionar forma' }));
    expect(await screen.findByText('Pix')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar forma de pagamento Pix' }));
    const nameField = screen.getByRole('textbox', { name: 'Nome da forma de pagamento' });
    await user.clear(nameField);
    await user.type(nameField, 'Pix instantâneo');
    await user.click(screen.getByRole('button', { name: 'Salvar forma' }));
    expect(await screen.findByText('Pix instantâneo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Arquivar forma de pagamento Pix instantâneo' }));
    expect(await screen.findByRole('button', { name: 'Restaurar forma de pagamento Pix instantâneo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restaurar forma de pagamento Pix instantâneo' }));
    expect(await screen.findByRole('button', { name: 'Arquivar forma de pagamento Pix instantâneo' })).toBeInTheDocument();
  });
});
