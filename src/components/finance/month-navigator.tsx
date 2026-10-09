import { ChevronLeft, ChevronRight } from 'lucide-react';
import { shiftMonth } from '../../lib/finance';
import { Button } from '../ui/button';
import { MonthField } from '../ui/form-controls';
import { ActionToolbar } from './action-toolbar';

/** Seleção de competência com botões de mês anterior e próximo. `value` e `onChange` usam AAAA-MM. */
export function MonthNavigator({ value, onChange, label }: { value: string; onChange: (month: string) => void; label: string }) {
  return (
    <ActionToolbar>
      <Button type="button" size="icon" variant="outline" aria-label="Mês anterior" onClick={() => onChange(shiftMonth(value, -1))}>
        <ChevronLeft aria-hidden="true" className="size-4" />
      </Button>
      <MonthField
        aria-label={label}
        required
        className="w-[7.5rem] text-center"
        value={value}
        onChange={(next) => {
          if (next) onChange(next);
        }}
      />
      <Button type="button" size="icon" variant="outline" aria-label="Próximo mês" onClick={() => onChange(shiftMonth(value, 1))}>
        <ChevronRight aria-hidden="true" className="size-4" />
      </Button>
    </ActionToolbar>
  );
}
