import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, AuthGate } from '../auth/auth-gate';
import { NewTransactionPage, TransactionsPage } from '../pages/entries-pages';
import { DashboardPage } from '../pages/pages';
import { currentMonthInputValue } from '../lib/finance';
import { OfflineWorkspaceProvider } from './offline-context';
import {
  clearOfflineWorkspace,
  isOfflineLogoutMarked,
  loadOfflineSnapshot,
  loadRememberedOfflineUser,
  loadOfflineWorkspace,
  markOfflineConflict,
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
    id,
    kind: 'expense',
    description,
    category_id: 'offline-category',
    category_name: 'Moradia',
    competence_on: `${currentMonthInputValue()}-01`,
    due_on: '2099-12-31',
    planned_cents: '12345',
    actual_cents: null,
    realized_on: null,
    payment_method_id: 'offline-method',
    payment_method_name: 'Pix',
    notes: null,
    created_by_user_id: authUser.id,
    updated_by_user_id: authUser.id,
    status: 'pending',
  };
}

function offlinePage(scope: OfflineScope, path: string) {
  const scopedUser = { ...authUser, id: scope.userId, spaceId: scope.spaceId };
  return render(
    <OfflineWorkspaceProvider scope={scope}>
      <AuthContext.Provider value={{ user: scopedUser, csrfToken }}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/lancamentos" element={<TransactionsPage />} />
            <Route path="/lancamentos/novo" element={<NewTransactionPage />} />
            <Route path="/lancamentos/:id/editar" element={<NewTransactionPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </OfflineWorkspaceProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

async function seed(scope: OfflineScope, entries: OfflineEntry[] = [entry()]) {
  await saveOfflineCatalogs(
    scope,
    [{ id: 'offline-category', name: 'Moradia', kind: 'expense', expense_class: 'fixed', archived_at: null }],
    [{ id: 'offline-method', name: 'Pix', archived_at: null }],
  );
  await saveOfflineEntries(scope, entries);
}

beforeAll(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `generated-offline-${++generatedId}`) });
});

afterAll(() => vi.unstubAllGlobals());

describe('offline transaction workflow', () => {
  it('caches only dashboard months opened online and asks for a connection for an uncached month', async () => {
    const scope = { userId: 'offline-dashboard-user', spaceId: 'offline-dashboard-space' };
    const currentMonth = currentMonthInputValue();
    const [year, month] = currentMonth.split('-').map(Number);
    const futureMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
    const uncachedMonth = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 7);
    const forecast = {
      month: `${futureMonth}-01`,
      planned: { incomeCents: '0', expenseCents: '15600', investmentCents: '0', resultCents: '-15600' },
      realized: { incomeCents: '0', expenseCents: '0', investmentCents: '0', resultCents: '0' },
      charts: {
        expensesByCategory: [{ categoryId: 'offline-category', categoryName: 'Moradia', plannedCents: '15600', realizedCents: '0' }],
      },
      upcoming: { count: 0, entries: [] },
      overdue: { count: 0, entries: [] },
    };
    const dashboardFor = (selectedMonth: string) =>
      selectedMonth === futureMonth
        ? forecast
        : {
            ...forecast,
            month: `${selectedMonth}-01`,
            planned: { incomeCents: '0', expenseCents: '0', investmentCents: '0', resultCents: '0' },
            charts: { expensesByCategory: [] },
          };
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      const selectedMonth = new URL(path, window.location.origin).searchParams.get('month') ?? currentMonth;
      return jsonResponse(dashboardFor(selectedMonth));
    });
    vi.stubGlobal('fetch', fetchMock);
    offlinePage(scope, '/dashboard');

    const monthInput = await screen.findByLabelText('Mês do painel');
    fireEvent.change(monthInput, { target: { value: futureMonth } });
    const forecastTitle = await screen.findByText('Resultado previsto');
    expect(within(forecastTitle.parentElement as HTMLElement).getByText(/-R\$.*156,00/)).toBeInTheDocument();
    expect(await loadOfflineSnapshot(scope, `/api/dashboard?month=${futureMonth}`)).toEqual(forecast);
    expect(await loadOfflineSnapshot(scope, `/api/dashboard?month=${uncachedMonth}`)).toBeNull();

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(within(forecastTitle.parentElement as HTMLElement).getByText(/-R\$.*156,00/)).toBeInTheDocument());
    fireEvent.change(monthInput, { target: { value: uncachedMonth } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este mês ainda não foi carregado neste aparelho. Conecte-se para consultar o painel.',
    );
    expect(screen.queryByRole('table', { name: /Valores previstos e realizados/ })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(`/api/dashboard?month=${uncachedMonth}`);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('reopens the last verified user and cached entries after launch without a network', async () => {
    const scope: OfflineScope = { userId: 'offline-restore-user', spaceId: 'offline-restore-space' };
    const restoredUser = { ...authUser, id: scope.userId, spaceId: scope.spaceId };
    await seed(scope);
    await rememberOfflineUser(restoredUser);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn(async (_input: string | URL | Request) => {
      throw new TypeError('offline');
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <AuthGate>
          <TransactionsPage />
        </AuthGate>
      </MemoryRouter>,
    );

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
    const fetchMock = vi.fn(async (_input: string | URL | Request) => {
      throw new TypeError('offline');
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/lancamentos']}>
        <AuthGate>
          <Routes>
            <Route path="/lancamentos" element={<TransactionsPage />} />
          </Routes>
        </AuthGate>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
    expect(await screen.findByText('Despesa preservada após recarga')).toBeInTheDocument();
    expect(screen.getByText(/Pendente neste aparelho/)).toBeInTheDocument();
    expect(await loadOfflineWorkspace(scope)).toMatchObject({
      operations: [expect.objectContaining({ entryId: 'offline-reload-entry', kind: 'create' })],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/state');
  });

  it('creates a launch offline without sending it to the API and persists the queue', async () => {
    const scope = { userId: 'offline-create-user', spaceId: 'offline-create-space' };
    await seed(scope);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn(async () => {
      throw new TypeError('offline');
    });
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
    expect(snapshot.operations).toMatchObject([
      expect.objectContaining({
        kind: 'create',
        userId: scope.userId,
        spaceId: scope.spaceId,
        payload: expect.objectContaining({ description: 'Nova conta de internet', plannedCents: 8990 }),
      }),
    ]);
    expect(snapshot.entries.find((item) => item.description === 'Nova conta de internet')?.created_by_user_id).toBe(scope.userId);
  });

  it('retries a lost sync response with the same operation UUID and displays one server entry', async () => {
    const scope: OfflineScope = { userId: 'offline-retry-user', spaceId: 'offline-retry-space' };
    const syncedEntry = { ...entry('offline-retry-entry', 'Despesa sincronizada uma vez'), version: 1 };
    await seed(scope, []);
    await queueOfflineEntryChange(scope, syncedEntry, 'create');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const appliedEntries = new Map<string, OfflineEntry>();
    let loseFirstResponse = true;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/auth/state')
        return jsonResponse({ initialized: true, user: { ...authUser, id: scope.userId, spaceId: scope.spaceId }, csrfToken });
      if (path === '/api/catalog/categories?includeArchived=true') return jsonResponse({ categories: [] });
      if (path.startsWith('/api/entries?')) return jsonResponse({ entries: [...appliedEntries.values()] });
      if (path === '/api/sync/operations') {
        const operation = JSON.parse(String(init?.body)) as { operationId: string; entryId: string };
        const serverEntry = { ...syncedEntry, id: operation.entryId };
        appliedEntries.set(operation.entryId, serverEntry);
        if (loseFirstResponse) {
          loseFirstResponse = false;
          throw new TypeError('response lost after commit');
        }
        return jsonResponse({ status: 'applied', operationId: operation.operationId, entry: serverEntry });
      }
      throw new Error(`Unexpected request ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthGate>
          <TransactionsPage />
        </AuthGate>
      </MemoryRouter>,
    );

    await screen.findByText(/A conexão foi interrompida/);
    const firstAttempt = fetchMock.mock.calls.find(([input]) => String(input) === '/api/sync/operations');
    const firstOperationId = JSON.parse(String(firstAttempt?.[1]?.body)).operationId;
    await user.click(screen.getByRole('button', { name: 'Sincronizar agora' }));

    expect(await screen.findByText('Despesa sincronizada uma vez')).toBeInTheDocument();
    await waitFor(async () => expect((await loadOfflineWorkspace(scope)).operations).toHaveLength(0));
    const attempts = fetchMock.mock.calls.filter(([input]) => String(input) === '/api/sync/operations');
    expect(attempts).toHaveLength(2);
    expect(JSON.parse(String(attempts[1]?.[1]?.body)).operationId).toBe(firstOperationId);
    expect(appliedEntries.size).toBe(1);
  });

  it('revalidates the session and syncs queued changes when connectivity returns', async () => {
    const scope: OfflineScope = { userId: 'offline-reconnect-user', spaceId: 'offline-reconnect-space' };
    const queuedEntry = entry('offline-reconnect-entry', 'Despesa sincronizada ao reconectar');
    await seed(scope, []);
    await queueOfflineEntryChange(scope, queuedEntry, 'create');
    await rememberOfflineUser({ ...authUser, id: scope.userId, spaceId: scope.spaceId });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    let stateReads = 0;
    const applied = new Map<string, OfflineEntry>();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/auth/state') {
        stateReads += 1;
        if (stateReads === 1) throw new TypeError('offline');
        return jsonResponse({ initialized: true, user: { ...authUser, id: scope.userId, spaceId: scope.spaceId }, csrfToken });
      }
      if (path === '/api/sync/operations') {
        const operation = JSON.parse(String(init?.body)) as { operationId: string; entryId: string };
        const serverEntry = { ...queuedEntry, id: operation.entryId, version: 1 };
        applied.set(operation.entryId, serverEntry);
        return jsonResponse({ status: 'applied', operationId: operation.operationId, entry: serverEntry });
      }
      throw new Error(`Unexpected request ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <AuthGate>
          <p>Conteúdo privado</p>
        </AuthGate>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Conteúdo privado')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/sync/operations')).toBe(false);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(async () => expect((await loadOfflineWorkspace(scope)).operations).toHaveLength(0), { timeout: 5000 });
    expect(stateReads).toBe(2);
    expect(applied.size).toBe(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/sync/operations')).toHaveLength(1);
  });

  it('keeps edited form fields when the connection returns during editing', async () => {
    const scope = { userId: 'offline-reconnect-edit-user', spaceId: 'offline-reconnect-edit-space' };
    await seed(scope);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    let online = false;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (!online) throw new TypeError('offline');
      const path = String(input);
      if (path === '/api/catalog/categories?includeArchived=true')
        return jsonResponse({
          categories: [{ id: 'offline-category', name: 'Moradia', kind: 'expense', expense_class: 'fixed', archived_at: null }],
        });
      if (path === '/api/catalog/payment-methods?includeArchived=true')
        return jsonResponse({ paymentMethods: [{ id: 'offline-method', name: 'Pix', archived_at: null }] });
      if (path === '/api/entries/offline-entry') return jsonResponse({ entry: { ...entry(), version: 1 } });
      throw new Error(`Unexpected request ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    offlinePage(scope, '/lancamentos/offline-entry/editar');

    const description = await screen.findByDisplayValue('Conta fictícia');
    await user.clear(description);
    await user.type(description, 'Conta digitada antes de reconectar');
    online = true;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/entries/offline-entry')).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('textbox', { name: 'Descrição' })).toHaveValue('Conta digitada antes de reconectar');
  });

  it('edits and deletes cached entries offline with a persistent final operation per entry', async () => {
    const scope = { userId: 'offline-edit-user', spaceId: 'offline-edit-space' };
    await seed(scope);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn(async () => {
      throw new TypeError('offline');
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    offlinePage(scope, '/lancamentos');

    await user.click(await screen.findByRole('link', { name: 'Editar Conta fictícia' }));
    const description = await screen.findByRole('textbox', { name: 'Descrição' });
    await user.clear(description);
    await user.type(description, 'Conta ajustada offline');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Conta ajustada offline')).toBeInTheDocument();
    expect((await loadOfflineWorkspace(scope)).operations).toMatchObject([
      expect.objectContaining({ kind: 'update', entryId: 'offline-entry' }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Excluir Conta ajustada offline' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir lançamento' }));
    await waitFor(async () =>
      expect((await loadOfflineWorkspace(scope)).operations).toMatchObject([
        expect.objectContaining({ kind: 'delete', entryId: 'offline-entry' }),
      ]),
    );
    expect(screen.queryByText('Conta ajustada offline')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires explicit discard before logout and preserves another user’s local records', async () => {
    const scope: OfflineScope = { userId: authUser.id, spaceId: authUser.spaceId };
    const otherScope: OfflineScope = { userId: 'other-user', spaceId: authUser.spaceId };
    await clearOfflineWorkspace(scope);
    await clearOfflineWorkspace(otherScope);
    await seed(scope, []);
    await seed(otherScope, [entry('other-entry', 'Despesa de outra pessoa')]);
    await queueOfflineEntryChange(scope, entry('queued-entry', 'Nova despesa pendente'), 'create');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === '/api/auth/state') return jsonResponse({ initialized: true, user: authUser, csrfToken });
      if (String(input) === '/api/sync/operations') return jsonResponse({ error: 'API temporariamente indisponível.' }, 503);
      if (String(input) === '/api/auth/logout' && init?.method === 'POST') return { ok: true, status: 204 } as Response;
      throw new Error(`Unexpected request ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthGate>
          <p>Conteúdo privado</p>
        </AuthGate>
      </MemoryRouter>,
    );

    await screen.findByText('Conteúdo privado');
    await screen.findByText(/1 alteração aguarda sincronização/);
    await user.click(screen.getByRole('button', { name: 'Sair de Conta Clara' }));
    const confirmation = await screen.findByRole('alertdialog', { name: 'Sair com alterações não sincronizadas?' });
    expect(confirmation).toHaveAccessibleDescription('Há 1 alteração sem sincronização. Sair e descartar essas alterações locais?');
    await user.click(within(confirmation).getByRole('button', { name: 'Continuar conectado' }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/logout', expect.anything());
    expect((await loadOfflineWorkspace(scope)).operations).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Sair de Conta Clara' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sair e descartar' }));
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
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthGate>
          <p>Conteúdo privado</p>
        </AuthGate>
      </MemoryRouter>,
    );

    await screen.findByText(/1 alteração pendente/);
    await user.click(screen.getByRole('button', { name: 'Sair de Conta Clara' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sair e descartar' }));
    expect(await screen.findByRole('heading', { name: 'Boas-vindas de volta' })).toBeInTheDocument();
    expect(await isOfflineLogoutMarked(localUser)).toBe(true);
    expect((await loadOfflineWorkspace(scope)).operations).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/auth/logout')).toBe(false);

    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'Boas-vindas de volta' })).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument();
  });

  it('presents local and server versions and applies the selected conflict resolution', async () => {
    const localUser = { ...authUser, id: 'offline-conflict-user', spaceId: 'offline-conflict-space' };
    const scope: OfflineScope = { userId: localUser.id, spaceId: localUser.spaceId };
    const localOne = { ...entry('conflict-local-one', 'Alteração local um'), version: 2 };
    const localTwo = { ...entry('conflict-local-two', 'Alteração local dois'), version: 4 };
    const serverOne = { ...localOne, description: 'Versão do servidor um', version: 3 };
    const serverTwo = { ...localTwo, description: 'Versão do servidor dois', version: 5 };
    await seed(scope, [localOne, localTwo]);
    await rememberOfflineUser(localUser);
    await queueOfflineEntryChange(scope, localOne, 'update');
    await queueOfflineEntryChange(scope, localTwo, 'update');
    const before = await loadOfflineWorkspace(scope);
    await markOfflineConflict(scope, before.operations[0]!, { reason: 'version_mismatch', serverEntry: serverOne });
    await markOfflineConflict(scope, before.operations[1]!, { reason: 'version_mismatch', serverEntry: serverTwo });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthGate>
          <p>Conteúdo privado</p>
        </AuthGate>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Escolha como resolver estes conflitos' })).toBeInTheDocument();
    expect(screen.getByText(/Versão do servidor um/)).toBeInTheDocument();
    const keepLocal = screen.getAllByRole('button', { name: 'Usar versão local' })[0]!;
    keepLocal.focus();
    await user.keyboard('{Enter}');
    const afterLocalChoice = await loadOfflineWorkspace(scope);
    expect(afterLocalChoice.operations).toHaveLength(2);
    expect(afterLocalChoice.operations.find((operation) => operation.entryId === localOne.id)).toMatchObject({
      baseVersion: 3,
      kind: 'update',
    });
    expect(afterLocalChoice.operations.find((operation) => operation.entryId === localOne.id)?.conflict).toBeUndefined();
    expect(afterLocalChoice.operations.find((operation) => operation.entryId === localOne.id)?.operationId).not.toBe(
      before.operations[0]?.operationId,
    );
    expect(await screen.findByRole('heading', { name: 'Escolha como resolver este conflito' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Usar versão do servidor' }));
    await waitFor(async () => expect((await loadOfflineWorkspace(scope)).operations).toHaveLength(1));
    const afterServerChoice = await loadOfflineWorkspace(scope);
    expect(afterServerChoice.entries.find((item) => item.id === localOne.id)?.description).toBe('Alteração local um');
    expect(afterServerChoice.entries.find((item) => item.id === localTwo.id)?.description).toBe('Versão do servidor dois');
  });

  it('keeps queued writes when the server expires a session and waits for reauthentication', async () => {
    const scope: OfflineScope = { userId: authUser.id, spaceId: authUser.spaceId };
    await clearOfflineWorkspace(scope);
    await seed(scope, []);
    await queueOfflineEntryChange(scope, entry('queued-expired', 'Edição aguardando login'), 'create');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    let stateReads = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      if (String(input) === '/api/auth/state') {
        stateReads += 1;
        return jsonResponse({ initialized: true, user: stateReads === 1 ? authUser : null, csrfToken });
      }
      if (String(input) === '/api/sync/operations') return jsonResponse({ error: 'Autenticação necessária.' }, 401);
      if (String(input) === '/api/catalog/categories?includeArchived=true') return jsonResponse({ categories: [] });
      if (String(input).startsWith('/api/entries?')) return jsonResponse({ entries: [] });
      throw new Error(`Unexpected request ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <AuthGate>
          <TransactionsPage />
        </AuthGate>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Boas-vindas de volta' })).toBeInTheDocument();
    expect(stateReads).toBe(2);
    expect((await loadOfflineWorkspace(scope)).operations).toMatchObject([
      expect.objectContaining({ entryId: 'queued-expired', kind: 'create' }),
    ]);
    expect(
      fetchMock.mock.calls.filter(([input, init]) => init?.method === 'POST' && String(input) === '/api/sync/operations'),
    ).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([input, init]) => init?.method === 'POST' && String(input).startsWith('/api/entries'))).toBe(false);
  });
});
