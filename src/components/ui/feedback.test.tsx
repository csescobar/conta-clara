import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { EmptyState } from './feedback';
import { ChartsSkeleton, DashboardSkeleton, ListSkeleton, TextSkeleton } from './skeleton';
import { ToastHost } from './toast-host';
import { toast } from './toast-store';

describe('loading skeletons', () => {
  it('announce what is loading once and hide the decorative blocks from assistive technology', () => {
    const { container } = render(<ListSkeleton label="Carregando lançamentos" rows={3} />);

    const region = screen.getByRole('status', { name: 'Carregando lançamentos' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Carregando lançamentos');
    expect(container.querySelector('ul')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('pulse only when the person has not asked for reduced motion', () => {
    const { container } = render(<TextSkeleton label="Carregando cartões" lines={2} />);

    const blocks = container.querySelectorAll('[aria-hidden="true"]');
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block).toHaveClass('motion-safe:animate-pulse');
      expect(block.className).not.toMatch(/(^|\s)animate-pulse/);
    }
  });

  it('keep the dashboard structure: four indicators, a table card and two charts', () => {
    const { container } = render(<DashboardSkeleton label="Carregando painel financeiro" />);

    expect(screen.getByRole('status', { name: 'Carregando painel financeiro' })).toBeInTheDocument();
    // 4 indicadores + cartão da tabela + 2 gráficos
    expect(container.querySelectorAll('section')).toHaveLength(7);
  });

  it('reserve the chart height while the chart bundle loads', () => {
    const { container } = render(<ChartsSkeleton />);

    expect(container.querySelectorAll('.h-72')).toHaveLength(2);
  });
});

describe('empty state', () => {
  it('explains how to start and offers the available action', () => {
    render(
      <EmptyState
        title="Nenhuma compra de cartão registrada"
        description="Cadastre uma compra à vista ou parcelada."
        action={<Button>Nova compra</Button>}
      />,
    );

    expect(screen.getByRole('status', { name: 'Nenhuma compra de cartão registrada' })).toBeInTheDocument();
    expect(screen.getByText('Cadastre uma compra à vista ou parcelada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova compra' })).toBeInTheDocument();
  });

  it('has a compact version for lists inside settings', () => {
    render(<EmptyState compact title="Nenhum cartão cadastrado" description="Use o formulário acima." />);

    expect(screen.getByRole('status', { name: 'Nenhum cartão cadastrado' })).toHaveClass('py-5');
  });
});

describe('toast with undo', () => {
  it('announces politely, offers the action, runs it once and does not take focus', async () => {
    const user = userEvent.setup();
    const undo = vi.fn();
    render(
      <>
        <Button>Ação anterior</Button>
        <ToastHost />
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Ação anterior' });
    trigger.focus();

    act(() => toast('A categoria “Casa” foi arquivada.', { action: { label: 'Desfazer', onClick: undo } }));

    expect(await screen.findByText('A categoria “Casa” foi arquivada.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/foi arquivada/));
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(trigger).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(undo).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('A categoria “Casa” foi arquivada.')).not.toBeInTheDocument());
  });

  it('shows plain confirmations without an action button', async () => {
    render(<ToastHost />);

    act(() => toast('Lançamento salvo.'));

    expect(await screen.findByText('Lançamento salvo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar notificação' })).toBeInTheDocument();
  });
});
