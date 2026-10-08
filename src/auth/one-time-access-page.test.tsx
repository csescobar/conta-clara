import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OneTimeAccessPage } from './one-time-access-page';

const token = 'A'.repeat(43);
const csrfToken = 'csrf-one-time-link';

function renderRoute(path: string, purpose: 'invite' | 'password-reset') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={purpose === 'invite' ? '/ativar/:token' : '/redefinir-senha/:token'}
          element={<OneTimeAccessPage purpose={purpose} />}
        />
        <Route path="/" element={<p>Conta Clara aberta</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

afterEach(() => vi.unstubAllGlobals());

describe('one-time access pages', () => {
  it('activates a valid invitation and sends the entered name and password with CSRF protection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }))
      .mockResolvedValueOnce(jsonResponse({ valid: true, email: 'membro@example.test' }))
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'member-id' } }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderRoute(`/ativar/${token}`, 'invite');

    await user.type(await screen.findByRole('textbox', { name: 'Seu nome' }), 'Pessoa convidada');
    await user.type(screen.getByLabelText('Nova senha'), 'senha-ativacao-ficticia-123');
    await user.type(screen.getByLabelText('Confirme a senha'), 'senha-ativacao-ficticia-123');
    await user.click(screen.getByRole('button', { name: 'Ativar acesso' }));

    expect(await screen.findByText('Conta Clara aberta')).toBeInTheDocument();
    const post = fetchMock.mock.calls[2];
    expect(post?.[0]).toBe('/api/auth/accept-invite');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      token,
      displayName: 'Pessoa convidada',
      password: 'senha-ativacao-ficticia-123',
    });
    expect(post?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': csrfToken });
  });

  it('rejects mismatched reset passwords before sending a request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }))
      .mockResolvedValueOnce(jsonResponse({ valid: true, email: 'membro@example.test' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderRoute(`/redefinir-senha/${token}`, 'password-reset');

    await user.type(await screen.findByLabelText('Nova senha'), 'senha-nova-ficticia-123');
    await user.type(screen.getByLabelText('Confirme a senha'), 'senha-diferente-ficticia-456');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('As senhas não coincidem.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
