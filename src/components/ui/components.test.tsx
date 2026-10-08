import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './badge';
import { Button } from './button';
import { ErrorState, EmptyState, LoadingState } from './feedback';
import { FormField, Input } from './input';
import { MoneyValue } from './money-value';

describe('finance UI components', () => {
  it('shows exact reais with tone, sign and a compact variant that keeps the exact value', () => {
    render(<>
      <MoneyValue cents={2500} data-testid="plain" />
      <MoneyValue cents="-123456" tone="balance" data-testid="balance" />
      <MoneyValue cents={2500} signDisplay="always" tone="income" data-testid="signed" />
      <MoneyValue cents="123456789" compact data-testid="compact" />
    </>);

    expect(screen.getByTestId('plain')).toHaveTextContent('R$ 25,00');
    expect(screen.getByTestId('balance')).toHaveTextContent('-R$ 1.234,56');
    expect(screen.getByTestId('balance')).toHaveClass('text-destructive', 'tabular-nums');
    expect(screen.getByTestId('signed')).toHaveTextContent('+R$ 25,00');
    expect(screen.getByTestId('signed')).toHaveClass('text-success');
    expect(screen.getByTestId('compact')).toHaveTextContent(/^R\$\s1,2\smi$/);
    expect(screen.getByTestId('compact')).toHaveAttribute('title', 'R$\u00a01.234.567,89');
  });

  it('identifies a status with text as well as its color and icon', () => {
    render(<StatusBadge status="late" />);

    expect(screen.getByText('Atrasado')).toBeInTheDocument();
  });

  it('styles each financial status with its semantic state tokens', () => {
    render(<><StatusBadge status="paid" /><StatusBadge status="pending" /><StatusBadge status="late" /></>);

    expect(screen.getByText('Pago')).toHaveClass('bg-success-soft', 'text-success');
    expect(screen.getByText('Pendente')).toHaveClass('bg-warning-soft', 'text-warning');
    expect(screen.getByText('Atrasado')).toHaveClass('bg-destructive-soft', 'text-destructive');
  });

  it('presents errors on the destructive surface tokens', () => {
    render(<ErrorState title="Falha ao carregar" description="Tente novamente." />);

    expect(screen.getByRole('alert', { name: 'Falha ao carregar' })).toHaveClass('border-destructive-border', 'bg-destructive-surface');
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
