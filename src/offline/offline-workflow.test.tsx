import { IDBFactory } from 'fake-indexeddb';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, AuthGate } from '../auth/auth-gate';
import { NewTransactionPage, TransactionsPage } from '../pages/entries-pages';
import { currentMonthInputValue } from '../lib/finance';
import { OfflineWorkspaceProvider } from './offline-context';
import {
  isOfflineLogoutMarked,
  loadRememberedOfflineUser,
  loadOfflineWorkspace,
  queueOfflineEntryChange,
  rememberOfflineUser,
  saveOfflineCatalogs,
  saveOfflineEntries,
  type OfflineEntry,
  type OfflineScope,
} from './offline-store';

const authUser = { id: 'offline-user', name: 'Pessoa offline', email: 'offline@example.test', role: 'admin', spaceId: 'offline-space' };
const csrfToken = 'csrf-offline-test';
let generatedId = 0;

function entry(id = 'offline-entry', description = 'Conta fictícia'): OfflineEntry {
  return {
    id, kind: 'expense', description, category_id: 'offline-category', category_name: 'Moradia',
    competence_on: `${currentMonthInputValue()}-01`, due_on: '2099-12-31', planned_cents: '12345', actual_cents: null,
    realized_on: null, payment_method_id: 'offline-method', payment_method_name: 'Pix', notes: null,
    created_by_user_id: authUser.id, updated_by_user_id: authUser.id, status: 'pending',
  };
}

function offlinePage(scope: OfflineScope, path: string) {
  const scopedUser = { ...authUser, id: scope.userId, spaceId: scope.spaceId };
  return render(<OfflineWorkspaceProvider scope={scope}>
    <AuthContext.Provider value={{ user: scopedUser, csrfToken }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/lancamentos" element={<TransactionsPage />} />
          <Route path="/lancamentos/novo" element={<NewTransactionPage />} />
          <Route path="/lancamentos/:id/editar" element={<NewTransactionPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  </OfflineWorkspaceProvider>);
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

async function seed(scope: OfflineScope, entries: OfflineEntry[] = [entry()]) {
  await saveOfflineCatalogs(scope, [
    { id: 'offline-category', name: 'Moradia', kind: 'expense', expense_class: 'fixed', archived_at: null },
  ], [{ id: 'offline-method', name: 'Pix', archived_at: null }]);
  await saveOfflineEntries(scope, entries);
}

beforeAll(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `generated-offline-${++generatedId}`) });
});

afterAll(() => vi.unstubAllGlobals());

describe('offline transaction workflow', () => {
  it('reopens the last verified user and cached entries after launch without a network', async () => {
    const scope: OfflineScope = { userId: 'offline-restore-user', spaceId: 'offline-restore-space' };
    const restoredUser = { ...authUser, id: scope.userId, spaceId: scope.spaceId };
    await seed(scope);
    await rememberOfflineUser(restoredUser);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn(async (_input: string | URL | Request) => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><AuthGate><TransactionsPage /></AuthGate></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
    expect(await screen.findByText('Conta fictícia')).toBeInTheDocument();
    expect((await loadRememberedOfflineUser())?.user.id).toBe(scope.userId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/state');
  });

  it('restores a queued offline launch after a full app reload', async () => {
    const scope: OfflineScope = { userId: 'offline-reload-user', spaceId: 'offline-reload-space' };
    const restoredUser = { ...authUser, id: scope.userId, spaceId: scope.spaceId };
    await seed(scope, []);
    await queueOfflineEntryChange(scope, entry('offline-reload-entry', 'Despesa preservada após recarga'), 'create');
    await rememberOfflineUser(restoredUser);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn(async (_input: string | URL | Request) => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock);

    render(<MemoryRouter initialEntries={['/lancamentos']}><AuthGate><Routes><Route path="/lancamentos" element={<TransactionsPage />} /></Routes></AuthGate></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
    expect(await screen.findByText('Despesa preservada após recarga')).toBeInTheDocument();
    expect(screen.getByText(/Pendente neste aparelho/)).toBeInTheDocument();
    expect(await loadOfflineWorkspace(scope)).toMatchObject({ operations: [expect.objectContaining({ entryId: 'offline-reload-entry', kind: 'create' })] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/state');
  });

  it('creates a launch offline without sending it to the API and persists the queue', async () => {
    const scope = { userId: 'offline-create-user', spaceId: 'offline-create-space' };
    await seed(scope);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    offlinePage(scope, '/lancamentos/novo');

    await user.type(await screen.findByRole('textbox', { name: 'Descrição' }), 'Nova conta de internet');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'offline-category');
    await user.type(screen.getByRole('textbox', { name: /Valor previsto/ }), '89,90');
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    expect(await screen.findByText('Nova conta de internet')).toBeInTheDocument();
    expect(screen.getByText(/Pendente neste aparelho/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    const snapshot = await loadOfflineWorkspace(scope);
    expect(snapshot.operations).toMatchObject([expect.objectContaining({ kind: 'create', userId: scope.userId, spaceId: scope.spaceId, payload: expect.objectContaining({ description: 'Nova conta de internet', plannedCents: 8990 }) })]);
    expect(snapshot.entries.find((item) => item.description === 'Nova conta de internet')?.created_by_user_id).toBe(scope.userId);
  });

  it('edits and deletes cached entries offline with a persistent final operation per entry', async () => {
    const scope = { userId: 'offline-edit-user', spaceId: 'offline-edit-space' };
    await seed(scope);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    offlinePage(scope, '/lancamentos');

    await user.click(await screen.findByRole('link', { name: 'Editar Conta fictícia' }));
    const description = await screen.findByRole('textbox', { name: 'Descrição' });
    await user.clear(description);
    await user.type(description, 'Conta ajustada offline');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Conta ajustada offline')).toBeInTheDocument();
    expect((await loadOfflineWorkspace(scope)).operations).toMatchObject([expect.objectContaining({ kind: 'update', entryId: 'offline-entry' })]);

    vi.stubGlobal('confirm', vi.fn(() => true));
    await user.click(screen.getByRole('button', { name: 'Excluir Conta ajustada offline' }));
    await waitFor(async () => expect((await loadOfflineWorkspace(scope)).operations).toMatchObject([expect.objectContaining({ kind: 'delete', entryId: 'offline-entry' })]));
    expect(screen.queryByText('Conta ajustada offline')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires explicit discard before logout and preserves another user’s local records', async () => {
    const scope: OfflineScope = { userId: authUser.id, spaceId: authUser.spaceId };
    const otherScope: OfflineScope = { userId: 'other-user', spaceId: authUser.spaceId };
    await seed(scope, []);
    await seed(otherScope, [entry('other-entry', 'Despesa de outra pessoa')]);
    await queueOfflineEntryChange(scope, entry('queued-entry', 'Nova despesa pendente'), 'create');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === '/api/auth/state') return jsonResponse({ initialized: true, user: authUser, csrfToken });
      if (String(input) === '/api/auth/logout' && init?.method === 'POST') return { ok: true, status: 204 } as Response;
      throw new Error(`Unexpected request ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const user = userEvent.setup();
    render(<MemoryRouter><AuthGate><p>Conteúdo privado</p></AuthGate></MemoryRouter>);

    await screen.findByText('Conteúdo privado');
    await screen.findByText(/1 alteração aguarda sincronização/);
    await user.click(screen.getByRole('button', { name: 'Sair de Conta Clara' }));
    expect(confirm).toHaveBeenCalledWith('Há 1 alteração sem sincronização. Sair e descartar essas alterações locais?');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/logout', expect.anything());
    expect((await loadOfflineWorkspace(scope)).operations).toHaveLength(1);

    confirm.mockImplementation(() => true);
    await user.click(screen.getByRole('button', { name: 'Sair de Conta Clara' }));
    expect(await screen.findByRole('heading', { name: 'Boas-vindas de volta' })).toBeInTheDocument();
    await waitFor(async () => expect(await loadOfflineWorkspace(scope)).toMatchObject({ entries: [], operations: [], categories: [] }));
    expect((await loadOfflineWorkspace(otherScope)).entries[0]?.description).toBe('Despesa de outra pessoa');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.anything());
  });

  it('logs out locally offline and does not restore the old cookie identity on reconnect', async () => {
    const localUser = { ...authUser, id: 'offline-logout-user', spaceId: 'offline-logout-space' };
    const scope: OfflineScope = { userId: localUser.id, spaceId: localUser.spaceId };
    await seed(scope, []);
    await queueOfflineEntryChange(scope, entry('offline-logout-entry', 'Rascunho fictício'), 'create');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === '/api/auth/state') return jsonResponse({ initialized: true, user: localUser, csrfToken });
      throw new Error(`Unexpected request ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = userEvent.setup();
    render(<MemoryRouter><AuthGate><p>Conteúdo privado</p></AuthGate></MemoryRouter>);

    await screen.findByText(/1 alteração pendente/);
    await user.click(screen.getByRole('button', { name: 'Sair de Conta Clara' }));
    expect(await screen.findByRole('heading', { name: 'Boas-vindas de volta' })).toBeInTheDocument();
    expect(await isOfflineLogoutMarked(localUser)).toBe(true);
    expect((await loadOfflineWorkspace(scope)).operations).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/auth/logout')).toBe(false);

    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'Boas-vindas de volta' })).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument();
  });

  it('keeps queued writes when the server expires a session and waits for reauthentication', async () => {
    const scope: OfflineScope = { userId: authUser.id, spaceId: authUser.spaceId };
    await seed(scope, []);
    await queueOfflineEntryChange(scope, entry('queued-expired', 'Edição aguardando login'), 'create');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    let stateReads = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      if (String(input) === '/api/auth/state') {
        stateReads += 1;
        return jsonResponse({ initialized: true, user: stateReads === 1 ? authUser : null, csrfToken });
      }
      if (String(input) === '/api/catalog/categories?includeArchived=true') return jsonResponse({ categories: [] });
      if (String(input).startsWith('/api/entries?')) return jsonResponse({ error: 'Autenticação necessária.' }, 401);
      throw new Error(`Unexpected request ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><AuthGate><TransactionsPage /></AuthGate></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Boas-vindas de volta' })).toBeInTheDocument();
    expect(stateReads).toBe(2);
    expect((await loadOfflineWorkspace(scope)).operations).toMatchObject([expect.objectContaining({ entryId: 'queued-expired', kind: 'create' })]);
    expect(fetchMock.mock.calls.some(([input, init]) => init?.method === 'POST' && String(input).startsWith('/api/entries'))).toBe(false);
  });
});
