import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { SettingsPage } from './pages';

const csrfToken = 'csrf-members-test';
const members = [{ id: 'admin-id', name: 'Administradora', email: 'admin@example.test', role: 'admin' }];
const fakeToken = 'A'.repeat(43);

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function renderSettings(role: 'admin' | 'member') {
  const user = { id: 'user-id', name: 'Pessoa de teste', email: 'pessoa@example.test', role, spaceId: 'space-id' };
  return render(<MemoryRouter><AuthContext.Provider value={{ user, csrfToken }}><SettingsPage /></AuthContext.Provider></MemoryRouter>);
}

afterEach(() => vi.unstubAllGlobals());

describe('member settings', () => {
  it('lets an administrator create an invitation link and displays it for handoff', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/members') return response({ members });
      if (input === '/api/members/invitations' && !init?.method) return response({ invitations: [] });
      if (input === '/api/members/invitations' && init?.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ invitation: { id: 'invite-id', email: 'membro@example.test' }, activationPath: `/ativar/${fakeToken}` }) };
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderSettings('admin');

    await user.type(await screen.findByRole('textbox', { name: 'E-mail da pessoa' }), 'Membro@example.test');
    await user.click(screen.getByRole('button', { name: 'Gerar convite' }));

    const linkField = await screen.findByRole('textbox', { name: 'Link de acesso' });
    expect(linkField).toHaveValue(`${window.location.origin}/ativar/${fakeToken}`);
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/members/invitations');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ email: 'Membro@example.test' });
    expect(post?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': csrfToken });
    expect(screen.getByText(/não será enviado por e-mail/i)).toBeInTheDocument();
  });

  it('shows the roster to a member but hides administrator-only access controls', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      if (input === '/api/members') return response({ members: [{ ...members[0], role: 'member' }] });
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderSettings('member');

    expect(await screen.findByText('Administradora')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerar convite' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link para redefinir senha' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
