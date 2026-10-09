import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { ToastHost } from '../components/ui/toast-host';
import { currentMonthInputValue } from '../lib/finance';
import { CatalogSettings } from './catalog-settings';
import { TransactionsPage } from './entries-pages';

const auth = {
  user: { id: 'member-id', name: 'Membro', email: 'member@example.test', role: 'member', spaceId: 'space-id' },
  csrfToken: 'csrf-feedback',
};

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-id',
  kind: 'expense',
  description: 'Conta de energia fictícia',
  category_id: 'expense-category',
  category_name: 'Moradia',
  competence_on: `${currentMonthInputValue()}-01`,
  due_on: '2026-10-10',
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

function renderEntries() {
  return render(
    <MemoryRouter initialEntries={['/lancamentos']}>
      <AuthContext.Provider value={auth}>
        <Routes>
          <Route path="/lancamentos" element={<TransactionsPage />} />
          <Route path="/lancamentos/novo" element={<p>Formulário de novo lançamento</p>} />
        </Routes>
        <ToastHost />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('entries list feedback', () => {
  it('shows a skeleton while loading, then the list, without ever showing a spinner message', async () => {
    let release: (value: unknown) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.startsWith('/api/catalog/categories')) return response({ categories: [] });
        if (input.startsWith('/api/entries?'))
          return new Promise((resolve) => {
            release = resolve;
          });
        throw new Error(`Unexpected request: ${input}`);
      }),
    );
    renderEntries();

    expect(await screen.findByRole('status', { name: 'Carregando lançamentos' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Conta de energia fictícia')).not.toBeInTheDocument();

    release(response({ entries: [entry()] }));
    expect(await screen.findByText('Conta de energia fictícia')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Carregando lançamentos' })).not.toBeInTheDocument();
  });

  it('explains how to start and offers the action when there are no entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.startsWith('/api/catalog/categories')) return response({ categories: [] });
        if (input.startsWith('/api/entries?')) return response({ entries: [] });
        throw new Error(`Unexpected request: ${input}`);
      }),
    );
    renderEntries();

    const empty = await screen.findByRole('status', { name: 'Nenhum lançamento encontrado' });
    expect(within(empty).getByText(/adicione a primeira movimentação/)).toBeInTheDocument();
    expect(within(empty).getByRole('link', { name: 'Adicionar lançamento' })).toHaveAttribute('href', '/lancamentos/novo');
  });
});

describe('entries action feedback', () => {
  it('announces a deletion without offering undo, because the original cannot be recreated', async () => {
    let entries = [entry()];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        if (input.startsWith('/api/catalog/categories')) return response({ categories: [] });
        if (input.startsWith('/api/entries?')) return response({ entries });
        if (input === '/api/entries/entry-id' && init?.method === 'DELETE') {
          entries = [];
          return response({}, 204);
        }
        throw new Error(`Unexpected request: ${input}`);
      }),
    );
    const user = userEvent.setup();
    renderEntries();

    await user.click(await screen.findByRole('button', { name: 'Excluir Conta de energia fictícia' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir lançamento' }));

    expect(await screen.findByText('Lançamento excluído.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument();
  });

  it('confirms a payment with an undo that restores the entry, keeping focus where it was', async () => {
    let current = entry();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        if (input.startsWith('/api/catalog/categories')) return response({ categories: [] });
        if (input.startsWith('/api/entries?')) return response({ entries: [current] });
        if (input === '/api/entries/entry-id/confirm' && init?.method === 'POST') {
          calls.push('confirm');
          current = entry({ actual_cents: '10000', realized_on: '2026-10-09', status: 'paid', version: 2 });
          return response({ entry: current });
        }
        if (input === '/api/entries/entry-id/confirm' && init?.method === 'DELETE') {
          calls.push(`undo version ${(init.headers as Record<string, string>)['X-Entry-Version']}`);
          current = entry({ version: 3 });
          return response({ entry: current });
        }
        throw new Error(`Unexpected request: ${input}`);
      }),
    );
    const user = userEvent.setup();
    renderEntries();

    await user.click(await screen.findByRole('button', { name: 'Confirmar Conta de energia fictícia' }));
    await user.click(screen.getByRole('button', { name: 'Salvar realização' }));
    expect(await screen.findByText('Lançamento confirmado.')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Desfazer' }));
    expect(await screen.findByText('A confirmação foi desfeita.')).toBeInTheDocument();
    // O desfazer usa a versão mais recente do lançamento (2), não a que a tela tinha antes de confirmar (1).
    expect(calls).toEqual(['confirm', 'undo version 2']);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar Conta de energia fictícia' })).toBeInTheDocument());
  });
});

describe('shared catalog feedback', () => {
  it('archives a category with an undo that restores it, and shows skeletons and empty guidance', async () => {
    let archivedAt: string | null = null;
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        if (input === '/api/catalog/categories?includeArchived=true')
          return response({
            categories: [{ id: 'category-id', name: 'Casa', kind: 'expense', expense_class: 'fixed', archived_at: archivedAt }],
          });
        if (input === '/api/catalog/payment-methods?includeArchived=true') return response({ paymentMethods: [] });
        if (input === '/api/catalog/categories/category-id/archive' && init?.method === 'POST') {
          calls.push('archive');
          archivedAt = '2026-10-09T00:00:00.000Z';
          return response({}, 204);
        }
        if (input === '/api/catalog/categories/category-id/restore' && init?.method === 'POST') {
          calls.push('restore');
          archivedAt = null;
          return response({}, 204);
        }
        throw new Error(`Unexpected request: ${input}`);
      }),
    );
    const user = userEvent.setup();
    render(
      <AuthContext.Provider value={auth}>
        <CatalogSettings />
        <ToastHost />
      </AuthContext.Provider>,
    );

    expect(screen.getByRole('status', { name: 'Carregando categorias' })).toBeInTheDocument();
    expect(await screen.findByRole('status', { name: 'Nenhuma forma de pagamento cadastrada' })).toHaveTextContent(/formulário acima/);

    await user.click(await screen.findByRole('button', { name: 'Arquivar categoria Casa' }));
    expect(await screen.findByText('A categoria foi arquivada.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(await screen.findByText('A categoria foi restaurada.')).toBeInTheDocument();
    expect(calls).toEqual(['archive', 'restore']);
  });
});
