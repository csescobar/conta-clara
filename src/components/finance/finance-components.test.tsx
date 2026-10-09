import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoneyValue } from '../ui/money-value';
import { ActionToolbar } from './action-toolbar';
import { DataTable } from './data-table';
import { EntryAmount, EntryList, EntryRow } from './entry-row';
import { FilterBar } from './filter-bar';
import { MonthNavigator } from './month-navigator';
import { StatCard } from './stat-card';

describe('EntryRow', () => {
  it('shows title, details, amounts, status and actions in one list item', () => {
    render(
      <EntryList>
        <EntryRow
          icon={Wallet}
          title="Conta de luz fictícia"
          meta="Despesa · Moradia"
          aside={<EntryAmount cents={12345} caption="Previsto R$ 100,00" status="late" statusLabel="Situação: Atrasado" />}
          actions={<button type="button">Editar</button>}
        >
          <p>Detalhes extras</p>
        </EntryRow>
      </EntryList>,
    );

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Conta de luz fictícia')).toBeInTheDocument();
    expect(within(row).getByText('Despesa · Moradia')).toBeInTheDocument();
    expect(row).toHaveTextContent('R$ 123,45');
    expect(within(row).getByText('Previsto R$ 100,00')).toBeInTheDocument();
    expect(within(row).getByLabelText('Situação: Atrasado')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(within(row).getByText('Detalhes extras')).toBeInTheDocument();
  });

  it('truncates the title by default and lets it wrap on request', () => {
    render(
      <EntryList>
        <EntryRow title="Título curto" />
        <EntryRow title="Título que quebra" wrapTitle />
      </EntryList>,
    );

    expect(screen.getByText('Título curto')).toHaveClass('truncate');
    expect(screen.getByText('Título que quebra')).not.toHaveClass('truncate');
  });
});

describe('StatCard and ActionToolbar', () => {
  it('presents a labelled indicator with its explanation', () => {
    render(<StatCard title="Resultado previsto" value={<MoneyValue cents="-5000" tone="balance" />} description="Receitas − despesas" />);

    expect(screen.getByText('Resultado previsto')).toBeInTheDocument();
    expect(screen.getByText('-R$ 50,00')).toHaveClass('text-destructive');
    expect(screen.getByText('Receitas − despesas')).toBeInTheDocument();
  });

  it('groups actions and names the group when asked', () => {
    render(
      <ActionToolbar label="Ações da página">
        <button type="button">Exportar</button>
      </ActionToolbar>,
    );

    expect(within(screen.getByRole('group', { name: 'Ações da página' })).getByRole('button', { name: 'Exportar' })).toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  it('titles the filters and keeps each field labelled', () => {
    render(
      <FilterBar title="Filtrar lançamentos" description="Escolha o período.">
        <label>
          Situação
          <select>
            <option>Todas</option>
          </select>
        </label>
      </FilterBar>,
    );

    expect(screen.getByRole('heading', { name: 'Filtrar lançamentos' })).toBeInTheDocument();
    expect(screen.getByText('Escolha o período.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Situação' })).toBeInTheDocument();
  });
});

describe('MonthNavigator', () => {
  function Harness({ onChange }: { onChange: (month: string) => void }) {
    const [month, setMonth] = useState('2026-12');
    return (
      <MonthNavigator
        label="Mês do painel"
        value={month}
        onChange={(next) => {
          setMonth(next);
          onChange(next);
        }}
      />
    );
  }

  it('moves between months, crossing the year boundary, and shows MM/AAAA', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const field = screen.getByRole('textbox', { name: 'Mês do painel' });
    expect(field).toHaveValue('12/2026');

    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(onChange).toHaveBeenLastCalledWith('2027-01');
    expect(field).toHaveValue('01/2027');
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11');
  });
});

describe('DataTable', () => {
  const columns = [
    { id: 'label', header: 'Movimentação' },
    { id: 'planned', header: 'Previsto', align: 'right' as const },
  ];

  it('exposes a caption, column headers and row headers to assistive technology', () => {
    render(
      <DataTable
        caption="Valores de outubro"
        columns={columns}
        rows={[
          { id: 'a', cells: { label: 'Receitas', planned: 'R$ 10,00' } },
          { id: 'total', emphasis: true, cells: { label: 'Resultado', planned: 'R$ 4,00' } },
        ]}
      />,
    );

    const table = screen.getByRole('table', { name: 'Valores de outubro' });
    expect(within(table).getByRole('columnheader', { name: 'Previsto' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Receitas' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Resultado' })).toHaveClass('font-semibold');
    expect(within(table).getByRole('cell', { name: 'R$ 4,00' })).toBeInTheDocument();
  });

  it('keeps compact tables fixed-width and wrapping so they fit narrow screens', () => {
    render(
      <DataTable
        caption="Gráfico"
        compact
        columns={[
          { id: 'label', header: 'Grupo', width: 'w-[34%]' },
          { id: 'planned', header: 'Previsto', align: 'right', width: 'w-[66%]' },
        ]}
        rows={[{ id: 'a', cells: { label: 'Categoria com nome muito longo', planned: 'R$ 1.234.567,89' } }]}
      />,
    );

    const table = screen.getByRole('table', { name: 'Gráfico' });
    expect(table).toHaveClass('table-fixed');
    expect(within(table).getByRole('rowheader')).toHaveClass('break-words');
    expect(within(table).getByRole('cell')).toHaveClass('whitespace-nowrap', 'text-right');
  });
});
