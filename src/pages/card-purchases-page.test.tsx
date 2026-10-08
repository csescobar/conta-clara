import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { OfflineWorkspaceProvider } from '../offline/offline-context';
import type { OfflineCard, OfflineCategory, OfflinePurchase } from '../offline/offline-store';
import { CardPurchasesPage } from './card-purchases-page';

const user = { id: 'purchase-page-user', name: 'Membro', email: 'member@example.test', role: 'member', spaceId: 'purchase-page-space' };
const scope = { userId: user.id, spaceId: user.spaceId };
let generatedId = 0;

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function card(id: string): OfflineCard {
  return {
    id,
    name: 'Cartão da família',
    holder_user_id: user.id,
    holder_name: user.name,
    closing_day: 25,
    due_day: 5,
    archived_at: null,
    created_by_user_id: user.id,
    updated_by_user_id: user.id,
    version: 1,
  };
}

const categories: OfflineCategory[] = [{ id: 'expense-home', name: 'Casa', kind: 'expense', expense_class: 'variable', archived_at: null }];

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ user, csrfToken: 'csrf-purchase-page' }}>
        <OfflineWorkspaceProvider scope={scope}>
          <CardPurchasesPage />
        </OfflineWorkspaceProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

beforeAll(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `purchase-page-id-${++generatedId}`) });
});
afterAll(() => vi.unstubAllGlobals());

describe('card purchases page', () => {
  it('plans a purchase on the closing day, splits cents, and syncs it as one expense series', async () => {
    let saved: OfflinePurchase | null = null;
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/purchases' && !init?.method) return jsonResponse({ purchases: saved ? [saved] : [] });
      if (input === '/api/cards?includeArchived=true' && !init?.method) return jsonResponse({ cards: [card('card-primary')] });
      if (input === '/api/catalog/categories' && !init?.method) return jsonResponse({ categories });
      if (input === '/api/sync/operations' && init?.method === 'POST') {
        const operation = JSON.parse(String(init.body)) as {
          entity: string;
          purchaseId: string;
          payload: { purchase: Record<string, unknown>; installments: Array<Record<string, unknown>> };
        };
        expect(operation.entity).toBe('purchase');
        const p = operation.payload.purchase;
        saved = {
          id: operation.purchaseId,
          card_id: String(p.cardId),
          card_name: 'Cartão da família',
          description: String(p.description),
          category_id: String(p.categoryId),
          category_name: 'Casa',
          purchase_on: String(p.purchaseOn),
          first_invoice_on: String(p.firstInvoiceOn),
          total_cents: String(p.totalCents),
          installment_count: Number(p.installmentCount),
          canceled_at: null,
          created_by_user_id: user.id,
          updated_by_user_id: user.id,
          version: 1,
          installments: operation.payload.installments.map((item) => ({
            id: String(item.id),
            description: `${String(p.description)} (${String(item.installmentNumber)}/${String(p.installmentCount)})`,
            category_id: String(p.categoryId),
            category_name: 'Casa',
            invoice_on: String(item.invoiceOn),
            due_on: `${String(item.invoiceOn).slice(0, 7)}-05`,
            planned_cents: String(item.plannedCents),
            actual_cents: null,
            realized_on: null,
            created_by_user_id: user.id,
            updated_by_user_id: user.id,
            version: 1,
            installment_number: Number(item.installmentNumber),
            installment_count: Number(p.installmentCount),
            status: 'pending',
          })),
        };
        return jsonResponse({ status: 'applied', operationId: 'operation-fixture', purchase: saved });
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const userEventInstance = userEvent.setup();
    renderPage();

    await userEventInstance.click(await screen.findByRole('button', { name: 'Nova compra' }));
    await userEventInstance.selectOptions(screen.getByRole('combobox', { name: 'Cartão' }), 'card-primary');
    await userEventInstance.selectOptions(screen.getByRole('combobox', { name: 'Categoria de despesa' }), 'expense-home');
    await userEventInstance.type(screen.getByRole('textbox', { name: 'Descrição' }), 'Compra fictícia');
    fireEvent.change(screen.getByLabelText('Data da compra'), { target: { value: '2026-10-25' } });
    await userEventInstance.type(screen.getByRole('textbox', { name: 'Valor total (R$)' }), '10,01');
    await userEventInstance.clear(screen.getByRole('spinbutton', { name: 'Quantidade de parcelas' }));
    await userEventInstance.type(screen.getByRole('spinbutton', { name: 'Quantidade de parcelas' }), '3');
    expect(screen.getByLabelText('Primeira fatura')).toHaveValue('11/2026');
    const saveButton = screen.getByRole('button', { name: 'Salvar compra' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await userEventInstance.click(saveButton);

    expect(await screen.findByText(/3 parcelas · 0 pagas/)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.map(([input]) => input)).toContain('/api/sync/operations'));
    const savedPurchase = saved as OfflinePurchase | null;
    expect(savedPurchase).toMatchObject({ first_invoice_on: '2026-11-01', total_cents: '1001', installment_count: 3 });
    expect(savedPurchase?.installments.map((item) => item.planned_cents)).toEqual(['334', '334', '333']);
    expect(savedPurchase?.installments.map((item) => item.invoice_on)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sync/operations', expect.objectContaining({ method: 'POST' })));
  });
});
