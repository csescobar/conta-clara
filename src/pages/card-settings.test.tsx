import { IDBFactory } from 'fake-indexeddb';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { OfflineWorkspaceProvider, useOfflineWorkspace } from '../offline/offline-context';
import { loadOfflineWorkspace, queueOfflineCardChange, saveOfflineCards, type OfflineCard, type OfflineScope } from '../offline/offline-store';
import { CardSettings } from './card-settings';

const user = { id: 'card-settings-user', name: 'Pessoa teste', email: 'pessoa@example.test', role: 'member', spaceId: 'card-settings-space' };
const csrfToken = 'csrf-card-settings-test';
const scope: OfflineScope = { userId: user.id, spaceId: user.spaceId };
let generatedId = 0;

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function card(id: string, name: string, version = 1): OfflineCard {
  return {
    id, name, holder_user_id: user.id, holder_name: user.name, closing_day: 25, due_day: 5,
    archived_at: null, created_by_user_id: user.id, updated_by_user_id: user.id, version,
  };
}

function renderCardSettings(offline = false, activeUser = user, activeScope = scope) {
  const content = <AuthContext.Provider value={{ user: activeUser, csrfToken }}><CardSettings /></AuthContext.Provider>;
  return offline
    ? render(<OfflineWorkspaceProvider scope={activeScope}>{content}</OfflineWorkspaceProvider>)
    : render(content);
}

function SyncProbe() {
  const offline = useOfflineWorkspace();
  useEffect(() => {
    if (offline?.ready) void offline.sync(csrfToken);
  }, [offline?.ready, offline?.sync]);
  return <button type="button" onClick={() => void offline?.sync(csrfToken)}>Retomar sincronização</button>;
}

beforeAll(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `card-settings-generated-${++generatedId}`) });
});

afterAll(() => vi.unstubAllGlobals());

describe('shared card settings', () => {
  it('lets a member create, edit, archive, and restore shared cards', async () => {
    const cards: OfflineCard[] = [];
    const members = [{ id: user.id, name: user.name, is_active: true }];
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/cards?includeArchived=true' && !init?.method) return jsonResponse({ cards: [...cards] });
      if (input === '/api/members' && !init?.method) return jsonResponse({ members });
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      if (input === '/api/cards' && init?.method === 'POST') {
        const created = { ...card('created-card', String(body.name)), holder_user_id: String(body.holderUserId), closing_day: Number(body.closingDay), due_day: Number(body.dueDay) };
        cards.push(created);
        return jsonResponse({ card: created }, 201);
      }
      if (input === '/api/cards/created-card' && init?.method === 'PUT') {
        Object.assign(cards[0]!, { name: body.name, closing_day: body.closingDay, due_day: body.dueDay, version: 2 });
        return jsonResponse({ card: cards[0] });
      }
      if (input === '/api/cards/created-card/archive' && init?.method === 'POST') {
        Object.assign(cards[0]!, { archived_at: '2026-10-06T00:00:00.000Z', version: 3 });
        return jsonResponse({ card: cards[0] });
      }
      if (input === '/api/cards/created-card/restore' && init?.method === 'POST') {
        Object.assign(cards[0]!, { archived_at: null, version: 4 });
        return jsonResponse({ card: cards[0] });
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const userEventInstance = userEvent.setup();
    renderCardSettings();

    expect(await screen.findByRole('heading', { name: 'Cartões' })).toBeInTheDocument();
    expect(screen.getByText(/não guarda número, validade, CVV ou limite/i)).toBeInTheDocument();
    await userEventInstance.type(screen.getByRole('textbox', { name: 'Apelido do cartão' }), 'Cartão da casa');
    await userEventInstance.selectOptions(screen.getByRole('combobox', { name: 'Titular' }), user.id);
    await userEventInstance.click(screen.getByRole('button', { name: 'Adicionar cartão' }));
    expect(await screen.findByText('Cartão da casa')).toBeInTheDocument();

    await userEventInstance.click(screen.getByRole('button', { name: 'Editar cartão Cartão da casa' }));
    const nickname = screen.getByRole('textbox', { name: 'Apelido do cartão' });
    await userEventInstance.clear(nickname);
    await userEventInstance.type(nickname, 'Cartão principal');
    await userEventInstance.click(screen.getByRole('button', { name: 'Salvar cartão' }));
    expect(await screen.findByText('Cartão principal')).toBeInTheDocument();

    await userEventInstance.click(screen.getByRole('button', { name: 'Arquivar cartão Cartão principal' }));
    expect(await screen.findByText('Arquivado')).toBeInTheDocument();
    await userEventInstance.click(screen.getByRole('button', { name: 'Restaurar cartão Cartão principal' }));
    expect(await screen.findByRole('button', { name: 'Arquivar cartão Cartão principal' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => input === '/api/cards' && init?.method === 'POST')).toBe(true);
  });

  it('queues a new shared card locally while offline without sending it to the API', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await saveOfflineCards(scope, [], [{ id: user.id, name: user.name, is_active: true }]);
    const fetchMock = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    const userEventInstance = userEvent.setup();
    renderCardSettings(true);

    await userEventInstance.type(await screen.findByRole('textbox', { name: 'Apelido do cartão' }), 'Cartão offline');
    await userEventInstance.selectOptions(screen.getByRole('combobox', { name: 'Titular' }), user.id);
    await userEventInstance.click(screen.getByRole('button', { name: 'Adicionar cartão' }));

    expect(await screen.findByText('Cartão offline')).toBeInTheDocument();
    await waitFor(async () => expect((await loadOfflineWorkspace(scope)).cardOperations).toHaveLength(1));
    const snapshot = await loadOfflineWorkspace(scope);
    expect(snapshot.cardOperations[0]).toMatchObject({
      userId: scope.userId, spaceId: scope.spaceId, kind: 'create', baseVersion: null,
      payload: { name: 'Cartão offline', holderUserId: user.id, closingDay: 25, dueDay: 5, archived: false },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('edits and archives a cached card offline, retaining one queued update', async () => {
    const activeUser = { ...user, id: 'card-settings-edit-user', spaceId: 'card-settings-edit-space' };
    const activeScope = { userId: activeUser.id, spaceId: activeUser.spaceId };
    const original = { ...card('cached-card', 'Cartão salvo'), holder_user_id: activeUser.id, holder_name: activeUser.name };
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await saveOfflineCards(activeScope, [original], [{ id: activeUser.id, name: activeUser.name, is_active: true }]);
    const fetchMock = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    const userEventInstance = userEvent.setup();
    renderCardSettings(true, activeUser, activeScope);

    await userEventInstance.click(await screen.findByRole('button', { name: 'Editar cartão Cartão salvo' }));
    const nickname = screen.getByRole('textbox', { name: 'Apelido do cartão' });
    await userEventInstance.clear(nickname);
    await userEventInstance.type(nickname, 'Cartão editado offline');
    await userEventInstance.click(screen.getByRole('button', { name: 'Salvar cartão' }));
    await userEventInstance.click(await screen.findByRole('button', { name: 'Arquivar cartão Cartão editado offline' }));

    expect(await screen.findByText('Arquivado')).toBeInTheDocument();
    const snapshot = await loadOfflineWorkspace(activeScope);
    expect(snapshot.cardOperations).toHaveLength(1);
    expect(snapshot.cardOperations[0]).toMatchObject({ cardId: original.id, kind: 'update', baseVersion: 1 });
    expect(snapshot.cardOperations[0]?.payload).toMatchObject({ name: 'Cartão editado offline', archived: true });
    expect(snapshot.cards[0]?.archived_at).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a card queued after session expiry and replays it once after authentication returns', async () => {
    const activeUser = { ...user, id: 'card-settings-session-user', spaceId: 'card-settings-session-space' };
    const activeScope = { userId: activeUser.id, spaceId: activeUser.spaceId };
    const original = { ...card('session-card', 'Cartão de sessão'), holder_user_id: activeUser.id, holder_name: activeUser.name };
    const local = { ...original, name: 'Cartão após sessão' };
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await saveOfflineCards(activeScope, [local], [{ id: activeUser.id, name: activeUser.name, is_active: true }]);
    await queueOfflineCardChange(activeScope, local, 'update');
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      callCount += 1;
      return callCount === 1
        ? jsonResponse({ error: 'Autenticação necessária.' }, 401)
        : jsonResponse({ status: 'applied', card: { ...local, version: 2 } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSessionExpired = vi.fn();
    window.addEventListener('conta-clara:session-expired', onSessionExpired);
    const userEventInstance = userEvent.setup();
    render(<OfflineWorkspaceProvider scope={activeScope}><SyncProbe /></OfflineWorkspaceProvider>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect((await loadOfflineWorkspace(activeScope)).cardOperations).toHaveLength(1);
    await userEventInstance.click(screen.getByRole('button', { name: 'Retomar sincronização' }));
    await waitFor(async () => expect((await loadOfflineWorkspace(activeScope)).cardOperations).toHaveLength(0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ entity: 'card', cardId: original.id });
    expect((await loadOfflineWorkspace(activeScope)).cards[0]).toMatchObject({ name: 'Cartão após sessão', version: 2 });
    window.removeEventListener('conta-clara:session-expired', onSessionExpired);
  });
});
