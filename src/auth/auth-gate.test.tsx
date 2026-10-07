import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGate } from './auth-gate';
import { clearOfflineWorkspace, loadOfflineWorkspace, queueOfflineInvoiceChange, saveOfflineInvoices, type OfflineInvoice, type OfflineScope } from '../offline/offline-store';

const admin = { id: 'admin-id', name: 'Pessoa de teste', email: 'pessoa@example.test', role: 'admin', spaceId: 'space-id' };
const csrfToken = 'csrf-integration-token';

function renderGate() {
  render(<MemoryRouter><AuthGate><p>Conteúdo privado</p></AuthGate></MemoryRouter>);
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

const indexedDb = new IDBFactory();

beforeEach(() => vi.stubGlobal('indexedDB', indexedDb));
afterEach(() => vi.unstubAllGlobals());

describe('authentication interface', () => {
  it('submits the one-time administrator setup and opens the shared application', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ initialized: false, user: null, csrfToken }))
      .mockResolvedValueOnce(jsonResponse({ user: admin }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderGate();

    await user.type(await screen.findByRole('textbox', { name: 'Seu nome' }), '  Pessoa de teste  ');
    await user.type(screen.getByRole('textbox', { name: 'E-mail' }), 'pessoa@example.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-segura-123');
    await user.click(screen.getByRole('button', { name: 'Criar meu acesso' }));

    expect(await screen.findByText('Conteúdo privado')).toBeInTheDocument();
    const setupCall = fetchMock.mock.calls[1];
    expect(setupCall?.[0]).toBe('/api/auth/setup');
    expect(JSON.parse(String(setupCall?.[1]?.body))).toEqual({ displayName: 'Pessoa de teste', email: 'pessoa@example.test', password: 'senha-segura-123' });
    expect(setupCall?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': csrfToken });
  });

  it('shows the generic server message for invalid login credentials', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ initialized: true, user: null, csrfToken }))
      .mockResolvedValueOnce(jsonResponse({ error: 'E-mail ou senha inválidos.' }, false)));
    const user = userEvent.setup();
    renderGate();

    await user.type(await screen.findByRole('textbox', { name: 'E-mail' }), 'pessoa@example.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-incorreta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
  });

  it('ends the session and returns to the login screen', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ initialized: true, user: admin, csrfToken }))
      .mockResolvedValueOnce({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderGate();

    await user.click(await screen.findByRole('button', { name: 'Sair de Conta Clara' }));

    expect(await screen.findByRole('heading', { name: 'Boas-vindas de volta' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/logout');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': csrfToken });
  });

  it('keeps a failed logout visible to the user', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ initialized: true, user: admin, csrfToken }))
      .mockResolvedValueOnce(jsonResponse({}, false)));
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: 'Sair de Conta Clara' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível encerrar a sessão.'));
  });

  it('warns before clearing an unsynchronized invoice payment on logout', async () => {
    const scope: OfflineScope = { userId: admin.id, spaceId: admin.spaceId };
    const invoice: OfflineInvoice = {
      id: 'logout-invoice', card_id: 'logout-card', card_name: 'Cartão fictício', closing_day: 25, due_day: 5,
      invoice_month: '2026-11-01', due_on: '2026-11-05', payment_status: 'open', status: 'open',
      actual_cents: null, paid_on: null, payment_method_id: null, payment_method_name: null,
      updated_by_user_id: admin.id, version: 1, planned_cents: '100', installment_count: 1,
      entries: [{ id: 'logout-entry', description: 'Despesa fictícia (1/1)', purchase_description: 'Despesa fictícia', category_name: 'Casa', invoice_on: '2026-11-01', due_on: '2026-11-05', planned_cents: '100', actual_cents: null, realized_on: null, version: 1, installment_number: 1, installment_count: 1 }],
    };
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await clearOfflineWorkspace(scope);
    await saveOfflineInvoices(scope, [invoice]);
    await queueOfflineInvoiceChange(scope, invoice, 'pay', { actualCents: 100, paidOn: '2026-11-05', paymentMethodId: null });
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ initialized: true, user: admin, csrfToken }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderGate();

    await user.click(await screen.findByRole('button', { name: 'Sair de Conta Clara' }));

    await waitFor(() => expect(confirmation).toHaveBeenCalledWith('Há 1 alteração sem sincronização. Sair e descartar essas alterações locais?'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await loadOfflineWorkspace(scope)).invoiceOperations).toHaveLength(1);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await clearOfflineWorkspace(scope);
  });
});
