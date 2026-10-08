import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, DateField, MoneyInput, MonthField, RadioGroup, Select, Textarea } from './form-controls';
import { FormField } from './input';

function ControlledMonth({ initial = '2026-10', onValue }: { initial?: string; onValue?: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return <><FormField id="month" label="Competência"><MonthField value={value} onChange={(next) => { setValue(next); onValue?.(next); }} /></FormField><output aria-label="mês escolhido">{value}</output></>;
}

describe('form primitives', () => {
  it('links select and textarea to their visible label, hint and error', () => {
    render(<>
      <FormField id="category" label="Categoria" error="Escolha uma categoria."><Select><option value="">Sem categoria</option></Select></FormField>
      <FormField id="notes" label="Observações" hint="Opcional"><Textarea /></FormField>
    </>);

    const select = screen.getByRole('combobox', { name: 'Categoria' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Escolha uma categoria.');
    expect(screen.getByRole('textbox', { name: 'Observações' })).toHaveAccessibleDescription('Opcional');
  });

  it('chooses a radio option with the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RadioGroup legend="Tipo" name="kind" value="expense" options={[['income', 'Receita'], ['expense', 'Despesa']] as const} onChange={onChange} />);

    expect(screen.getByRole('group', { name: 'Tipo' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Despesa' }));
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('income');
  });

  it('toggles a labelled checkbox', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox onChange={onChange}>Revisei as datas</Checkbox>);

    await user.click(screen.getByRole('checkbox', { name: 'Revisei as datas' }));
    expect(onChange).toHaveBeenCalled();
  });

  it('masks Brazilian dates while typing and converts pasted ISO dates', async () => {
    const user = userEvent.setup();
    function ControlledDate() {
      const [value, setValue] = useState('');
      return <FormField id="due" label="Vencimento"><DateField value={value} onChange={setValue} /></FormField>;
    }
    render(<ControlledDate />);
    const field = screen.getByRole('textbox', { name: 'Vencimento' });

    await user.type(field, '05102026');
    expect(field).toHaveValue('05/10/2026');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    await user.clear(field);
    await user.click(field);
    await user.paste('2026-11-30');
    expect(field).toHaveValue('30/11/2026');
  });

  it('shows competences as MM/AAAA and only reports complete months', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledMonth onValue={onValue} />);
    const field = screen.getByRole('textbox', { name: 'Competência' });
    expect(field).toHaveValue('10/2026');

    await user.clear(field);
    expect(onValue).toHaveBeenLastCalledWith('');
    await user.type(field, '1120');
    expect(field).toHaveValue('11/20');
    expect(onValue).toHaveBeenLastCalledWith('');
    await user.type(field, '27');
    expect(field).toHaveValue('11/2027');
    expect(screen.getByLabelText('mês escolhido')).toHaveTextContent('2027-11');
  });

  it('restores the last valid month when an incomplete one is left behind', async () => {
    const user = userEvent.setup();
    render(<ControlledMonth />);
    const field = screen.getByRole('textbox', { name: 'Competência' });

    await user.type(field, '{Backspace}{Backspace}');
    expect(field).toHaveValue('10/20');
    await user.tab();
    expect(field).toHaveValue('10/2026');
    expect(screen.getByLabelText('mês escolhido')).toHaveTextContent('2026-10');
  });

  it('accepts ISO months typed by automation and rejects invalid months', async () => {
    const user = userEvent.setup();
    render(<ControlledMonth />);
    const field = screen.getByRole('textbox', { name: 'Competência' });

    await user.clear(field);
    await user.paste('2027-03');
    expect(field).toHaveValue('03/2027');
    await user.clear(field);
    await user.type(field, '132026');
    expect(screen.getByLabelText('mês escolhido')).toHaveTextContent('');
  });

  it('normalizes reais on blur and reports integer cents', async () => {
    const user = userEvent.setup();
    const onCents = vi.fn();
    function ControlledMoney() {
      const [value, setValue] = useState('');
      return <FormField id="amount" label="Valor previsto (R$)"><MoneyInput value={value} onChange={setValue} onCentsChange={onCents} /></FormField>;
    }
    render(<ControlledMoney />);
    const field = screen.getByRole('textbox', { name: 'Valor previsto (R$)' });

    await user.type(field, '1234,5');
    expect(onCents).toHaveBeenLastCalledWith(123450);
    await user.tab();
    expect(field).toHaveValue('1.234,50');
    await user.clear(field);
    await user.type(field, 'abc');
    expect(onCents).toHaveBeenLastCalledWith(null);
  });
});
