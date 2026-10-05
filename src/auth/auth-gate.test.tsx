import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthGate } from './auth-gate';

const admin = { id: 'admin-id', name: 'Pessoa de teste', email: 'pessoa@example.test', role: 'admin', spaceId: 'space-id' };
const csrfToken = 'csrf-integration-token';

function renderGate() {
  render(<MemoryRouter><AuthGate><p>Conteúdo privado</p></AuthGate></MemoryRouter>);
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

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
});
