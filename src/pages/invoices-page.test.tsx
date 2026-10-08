import { IDBFactory } from 'fake-indexeddb';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { OfflineWorkspaceProvider } from '../offline/offline-context';
import { loadOfflineWorkspace, saveOfflineInvoices, type OfflineInvoice, type OfflineScope } from '../offline/offline-store';
import { currentMonthInputValue } from '../lib/finance';
import { InvoicesPage } from './invoices-page';
import { Toaster } from '../components/ui/toast';

const user = { id: 'invoice-page-user', name: 'Membro', email: 'member@example.test', role: 'member', spaceId: 'invoice-page-space' };
const scope: OfflineScope = { userId: user.id, spaceId: user.spaceId };
const month = currentMonthInputValue();

function fixture(status: OfflineInvoice['status'] = 'open'): OfflineInvoice {
  return {
    id: 'invoice-page-id', card_id: 'invoice-page-card', card_name: 'Cartão da família', closing_day: 25, due_day: 5,
    invoice_month: `${month}-01`, due_on: `${month}-05`, payment_status: status === 'paid' ? 'paid' : status === 'needs_review' ? 'needs_review' : 'open',
    status, actual_cents: status === 'paid' ? '301' : null, paid_on: status === 'paid' ? `${month}-05` : null,
    payment_method_id: null, payment_method_name: null, updated_by_user_id: user.id, version: status === 'paid' ? 2 : 1,
    planned_cents: '334', installment_count: 1,
    entries: [{ id: 'invoice-page-entry', description: 'Compra fictícia (1/1)', purchase_description: 'Compra fictícia', category_name: 'Casa', invoice_on: `${month}-01`, due_on: `${month}-05`, planned_cents: '334', actual_cents: status === 'paid' ? '301' : null, realized_on: status === 'paid' ? `${month}-05` : null, version: status === 'paid' ? 2 : 1, installment_number: 1, installment_count: 1 }],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function renderPage() {
  return render(<MemoryRouter><AuthContext.Provider value={{ user, csrfToken: 'csrf-invoice-page' }}><OfflineWorkspaceProvider scope={scope}><InvoicesPage /><Toaster /></OfflineWorkspaceProvider></AuthContext.Provider></MemoryRouter>);
}

beforeAll(() => { vi.stubGlobal('indexedDB', new IDBFactory()); });
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('invoices page', () => {
  it('lists invoice installments and syncs an explicit full payment with its effective date', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    let serverInvoice = fixture();
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/invoices' && !init?.method) return jsonResponse({ invoices: [serverInvoice] });
      if (input === '/api/catalog/payment-methods' && !init?.method) return jsonResponse({ paymentMethods: [{ id: 'pix-method', name: 'Pix', archived_at: null }] });
      if (input === '/api/sync/operations' && init?.method === 'POST') {
        const operation = JSON.parse(String(init.body)) as { entity: string; cardId: string; invoiceMonth: string; kind: string; payload: { actualCents: number; paidOn: string; paymentMethodId: string | null } };
        expect(operation).toMatchObject({ entity: 'invoice', cardId: serverInvoice.card_id, invoiceMonth: month, kind: 'pay' });
        serverInvoice = { ...serverInvoice, status: 'paid', payment_status: 'paid', actual_cents: String(operation.payload.actualCents), paid_on: operation.payload.paidOn, payment_method_id: operation.payload.paymentMethodId, payment_method_name: 'Pix', version: 2 };
        return jsonResponse({ status: 'applied', invoice: serverInvoice });
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const userEventInstance = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Compra fictícia')).toBeInTheDocument();
    expect(screen.getByText(/Parcela 1\/1/)).toBeInTheDocument();
    await userEventInstance.click(screen.getByRole('button', { name: 'Quitar fatura' }));
    expect(screen.getByRole('dialog', { name: 'Quitar fatura' })).toBeInTheDocument();
    await userEventInstance.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quitar fatura' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Quitar fatura' })).toHaveFocus();
    await userEventInstance.click(screen.getByRole('button', { name: 'Quitar fatura' }));
    await userEventInstance.clear(screen.getByLabelText('Valor efetivamente pago'));
    await userEventInstance.type(screen.getByLabelText('Valor efetivamente pago'), '3,01');
    await userEventInstance.clear(screen.getByLabelText('Data do pagamento'));
    await userEventInstance.type(screen.getByLabelText('Data do pagamento'), '09/10/2026');
    await userEventInstance.selectOptions(screen.getByLabelText('Forma de pagamento (opcional)'), 'pix-method');
    await userEventInstance.click(screen.getByRole('button', { name: 'Confirmar quitação' }));

    await waitFor(() => expect(screen.getByText('Quitada')).toBeInTheDocument());
    expect(screen.getByText(/Quitada por/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/sync/operations', expect.objectContaining({ method: 'POST' }));
    const sent = JSON.parse(String(fetchMock.mock.calls.find(([input]) => input === '/api/sync/operations')?.[1]?.body));
    expect(sent.payload).toMatchObject({ actualCents: 301, paidOn: '2026-10-09', paymentMethodId: 'pix-method' });
  });

  it('requires confirmation and queues a reversal offline in the scoped workspace', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const paidInvoice = fixture('paid');
    await saveOfflineInvoices(scope, [paidInvoice]);
    const userEventInstance = userEvent.setup();
    renderPage();
    await userEventInstance.click(await screen.findByRole('button', { name: 'Desfazer quitação' }));
    expect(screen.getByRole('alertdialog', { name: 'Desfazer quitação?' })).toBeInTheDocument();
    await userEventInstance.click(screen.getByRole('button', { name: 'Confirmar estorno' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quitar fatura' })).toBeInTheDocument());
    expect(screen.getByText('Estorno salvo neste aparelho. Ele será sincronizado quando a conexão voltar.')).toBeInTheDocument();
    expect(screen.getByText('Pendente neste aparelho')).toBeInTheDocument();
    const snapshot = await loadOfflineWorkspace(scope);
    expect(snapshot.invoiceOperations).toHaveLength(1);
    expect(snapshot.invoiceOperations[0]).toMatchObject({ cardId: 'invoice-page-card', invoiceMonth: month, kind: 'reverse', baseVersion: 2 });
    expect(snapshot.invoices[0]).toMatchObject({ status: 'open', payment_status: 'open', actual_cents: null });
  });
});
