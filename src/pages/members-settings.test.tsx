import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-gate';
import { SettingsPage } from './pages';

const csrfToken = 'csrf-members-test';
const members = [{ id: 'admin-id', name: 'Administradora', email: 'admin@example.test', role: 'admin', is_active: true }];
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
      if (input === '/api/backups/status') return response({
        runState: 'warning',
        lastAttemptAt: '2026-10-06T06:00:00.000Z',
        lastSuccessAt: '2026-10-05T06:00:00.000Z',
        lastSuccessDate: '2026-10-05',
        lastFailureAt: '2026-10-06T06:00:00.000Z',
        lastFailureCode: 'retention',
        lastFailureMessage: 'O backup novo foi validado, mas a retenção não pôde ser aplicada.',
      });
      if (input === '/api/catalog/categories?includeArchived=true') return response({ categories: [] });
      if (input === '/api/catalog/payment-methods?includeArchived=true') return response({ paymentMethods: [] });
      if (input === '/api/members/invitations' && !init?.method) return response({ invitations: [] });
      if (input === '/api/members/invitations' && init?.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ invitation: { id: 'invite-id', email: 'membro@example.test' }, activationPath: `/ativar/${fakeToken}` }) };
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderSettings('admin');

    expect(await screen.findByText(/Último backup validado:/)).toBeInTheDocument();
    expect(await screen.findByText(/retenção não pôde ser aplicada/i)).toBeInTheDocument();

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
      if (input === '/api/catalog/categories?includeArchived=true') return response({ categories: [] });
      if (input === '/api/catalog/payment-methods?includeArchived=true') return response({ paymentMethods: [] });
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderSettings('member');

    expect(await screen.findByText('Administradora')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerar convite' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link para redefinir senha' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/members/invitations', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/backups/status', expect.anything());
  });

  it('allows an administrator to deactivate a member after confirmation', async () => {
    const currentMembers = [members[0], { id: 'member-id', name: 'Pessoa convidada', email: 'membro@example.test', role: 'member', is_active: true }];
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/members') return response({ members: currentMembers });
      if (input === '/api/backups/status') return response({ runState: 'never', lastAttemptAt: null, lastSuccessAt: null, lastSuccessDate: null, lastFailureAt: null, lastFailureCode: null, lastFailureMessage: null });
      if (input === '/api/catalog/categories?includeArchived=true') return response({ categories: [] });
      if (input === '/api/catalog/payment-methods?includeArchived=true') return response({ paymentMethods: [] });
      if (input === '/api/members/invitations' && !init?.method) return response({ invitations: [] });
      if (input === '/api/members/member-id/deactivate' && init?.method === 'POST') {
        currentMembers[1] = { ...currentMembers[1], is_active: false };
        return { ok: true, status: 204, json: async () => ({}) };
      }
      if (input === '/api/members/member-id/reactivate' && init?.method === 'POST') {
        currentMembers[1] = { ...currentMembers[1], is_active: true };
        return { ok: true, status: 204, json: async () => ({}) };
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = userEvent.setup();
    renderSettings('admin');

    await user.click(await screen.findByRole('button', { name: 'Desativar acesso de Pessoa convidada' }));

    expect(window.confirm).toHaveBeenCalledWith('Desativar o acesso de Pessoa convidada? As sessões ativas serão encerradas.');
    expect(await screen.findByText('Acesso desativado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar acesso de Pessoa convidada' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => input === '/api/members/member-id/deactivate')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Reativar acesso de Pessoa convidada' }));

    expect(await screen.findByRole('button', { name: 'Desativar acesso de Pessoa convidada' })).toBeInTheDocument();
    expect(screen.queryByText('Acesso desativado')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => input === '/api/members/member-id/reactivate')).toBe(true);
  });
});
