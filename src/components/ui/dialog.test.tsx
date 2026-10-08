import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { useConfirmDialog } from './dialog';
import { toast, Toaster } from './toast';

function DeleteButton() {
  const [confirm, confirmDialog] = useConfirmDialog();
  const [result, setResult] = useState('');
  return <>
    <Button onClick={async () => setResult(String(await confirm({ title: 'Excluir “Conta fictícia”?', description: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir lançamento', destructive: true })))}>Excluir</Button>
    <output aria-label="resultado">{result}</output>
    {confirmDialog}
  </>;
}

describe('confirmation dialog', () => {
  it('traps focus, closes with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<DeleteButton />);
    const trigger = screen.getByRole('button', { name: 'Excluir' });

    await user.click(trigger);
    const dialog = await screen.findByRole('alertdialog', { name: 'Excluir “Conta fictícia”?' });
    expect(dialog).toHaveAccessibleDescription('Esta ação não pode ser desfeita.');
    const cancel = within(dialog).getByRole('button', { name: 'Cancelar' });
    const destroy = within(dialog).getByRole('button', { name: 'Excluir lançamento' });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(destroy).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('resultado')).toHaveTextContent('false');
    expect(trigger).toHaveFocus();
  });

  it('resolves true only when the destructive action is chosen', async () => {
    const user = userEvent.setup();
    render(<DeleteButton />);

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir lançamento' }));
    expect(await screen.findByLabelText('resultado')).toHaveTextContent('true');
  });
});

describe('toast', () => {
  it('announces a completed action and can be dismissed', async () => {
    const user = userEvent.setup();
    render(<Toaster />);

    act(() => toast('Compra salva.'));
    expect(await screen.findByText('Compra salva.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Compra salva\./));
    await user.click(screen.getByRole('button', { name: 'Fechar notificação' }));
    await waitFor(() => expect(screen.queryByText('Compra salva.')).not.toBeInTheDocument());
  });
});
