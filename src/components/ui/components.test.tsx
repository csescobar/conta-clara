import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './badge';
import { Button } from './button';
import { ErrorState, EmptyState, LoadingState } from './feedback';
import { FormField, Input } from './input';
import { formatBRL } from './money-value';

describe('finance UI components', () => {
  it('formats integer cents as Brazilian reais', () => {
    expect(formatBRL(2500)).toBe('R$ 25,00');
    expect(() => formatBRL(25.5)).toThrow(RangeError);
  });

  it('identifies a status with text as well as its color and icon', () => {
    render(<StatusBadge status="late" />);

    expect(screen.getByText('Atrasado')).toBeInTheDocument();
  });

  it('keeps the action reachable by keyboard', async () => {
    const user = userEvent.setup();
    render(<Button>Continuar</Button>);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Continuar' })).toHaveFocus();
  });

  it('associates the visible field label and validation message with the input', () => {
    render(
      <FormField id="amount" label="Valor previsto" error="Informe um valor válido.">
        <Input />
      </FormField>,
    );

    const input = screen.getByRole('textbox', { name: 'Valor previsto' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Informe um valor válido.');
  });

  it('announces empty, loading, and error states to assistive technology', () => {
    render(
      <>
        <EmptyState title="Nada por aqui" description="Inclua seu primeiro item." />
        <LoadingState label="Carregando painel" />
        <ErrorState title="Falha ao carregar" description="Tente novamente." />
      </>,
    );

    expect(screen.getByRole('status', { name: /nada por aqui/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Carregando painel' })).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('alert', { name: /falha ao carregar/i })).toBeInTheDocument();
  });
});
