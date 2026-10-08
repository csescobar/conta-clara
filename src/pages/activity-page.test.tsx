import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityPage } from './activity-page';

const baseSnapshot = {
  kind: 'expense',
  description: 'Conta de luz',
  categoryName: 'Moradia',
  competenceOn: '2026-10-01',
  dueOn: '2026-10-10',
  plannedCents: '12000',
  actualCents: null,
  realizedOn: null,
  paymentMethodName: 'Pix',
};

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

afterEach(() => vi.unstubAllGlobals());

describe('shared activity history', () => {
  it('shows authors, actions, and saved snapshots as read-only history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          events: [
            {
              id: '4',
              entry_id: 'entry-id',
              actor_user_id: 'member-id',
              actor_name: 'Ana',
              action: 'deleted',
              entry_kind: 'expense',
              entry_description: 'Conta de luz',
              occurred_at: '2026-10-05T13:15:00.000Z',
              details: { before: { ...baseSnapshot, actualCents: '11000', realizedOn: '2026-11-02' } },
            },
            {
              id: '3',
              entry_id: 'entry-id',
              actor_user_id: 'admin-id',
              actor_name: 'César',
              action: 'confirmed',
              entry_kind: 'expense',
              entry_description: 'Conta de luz',
              occurred_at: '2026-10-05T12:15:00.000Z',
              details: { before: baseSnapshot, after: { ...baseSnapshot, actualCents: '11000', realizedOn: '2026-11-02' } },
            },
            {
              id: '2',
              entry_id: 'entry-id',
              actor_user_id: 'admin-id',
              actor_name: 'César',
              action: 'updated',
              entry_kind: 'expense',
              entry_description: 'Conta de luz',
              occurred_at: '2026-10-05T11:15:00.000Z',
              details: { before: baseSnapshot, after: { ...baseSnapshot, plannedCents: '12500' } },
            },
            {
              id: '1',
              entry_id: 'entry-id',
              actor_user_id: 'member-id',
              actor_name: 'Ana',
              action: 'created',
              entry_kind: 'expense',
              entry_description: 'Conta de luz',
              occurred_at: '2026-10-05T10:15:00.000Z',
              details: { after: baseSnapshot },
            },
          ],
        }),
      ),
    );
    render(<ActivityPage />);

    expect(await screen.findAllByText('Ana')).toHaveLength(2);
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent(/Ana.*excluiu despesa.*Conta de luz/i);
    expect(items[0]).toHaveTextContent(/Último valor previsto.*Realizado/);
    expect(items[1]).toHaveTextContent(/César.*confirmou despesa.*Conta de luz/i);
    expect(items[1]).toHaveTextContent(/Realizado R\$[\s\u00a0]*110,00 em 02\/11\/2026/);
    expect(items[2]).toHaveTextContent(/César.*editou despesa.*Conta de luz/i);
    expect(items[2]).toHaveTextContent(/Previsto: R\$[\s\u00a0]*120,00 → R\$[\s\u00a0]*125,00/);
    expect(items[3]).toHaveTextContent(/Ana.*cadastrou despesa.*Conta de luz/i);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('loads older history pages without duplicating or replacing recent events', async () => {
    const event = (id: string, description: string) => ({
      id,
      entry_id: `entry-${id}`,
      actor_user_id: 'member-id',
      actor_name: 'Ana',
      action: 'created',
      entry_kind: 'expense',
      entry_description: description,
      occurred_at: '2026-10-05T13:15:00.000Z',
      details: { after: { ...baseSnapshot, description } },
    });
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      if (input === '/api/activity') return jsonResponse({ events: [event('2', 'Evento recente')], hasMore: true, nextOffset: 1 });
      if (input === '/api/activity?offset=1')
        return jsonResponse({ events: [event('1', 'Evento anterior')], hasMore: false, nextOffset: 2 });
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ActivityPage />);

    expect(await screen.findByText(/Evento recente/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Carregar atividades anteriores' }));
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/Evento recente/);
    expect(items[1]).toHaveTextContent(/Evento anterior/);
    expect(screen.queryByRole('button', { name: 'Carregar atividades anteriores' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual(['/api/activity', '/api/activity?offset=1']);
  });
});
