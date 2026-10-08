import { ChevronDown } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { formatBrazilianAmount, parseBrazilianCents } from '../../lib/finance';
import { cn } from '../../lib/utils';
import { Input, fieldControlClassName } from './input';

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(fieldControlClassName, 'appearance-none pr-10', className)} {...props}>{children}</select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export function Textarea({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(fieldControlClassName, 'py-3 leading-6', className)} {...props} />;
}

export function Checkbox({ className, children, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { children: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 text-sm leading-6', className)}>
      <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" {...props} />
      <span>{children}</span>
    </label>
  );
}

export function RadioGroup<Value extends string>({ legend, name, value, options, onChange }: {
  legend: string;
  name: string;
  value: Value;
  options: ReadonlyArray<readonly [Value, string]>;
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([optionValue, label]) => (
          <label key={optionValue} className="cursor-pointer">
            <input className="peer sr-only" type="radio" name={name} value={optionValue} checked={value === optionValue} onChange={() => onChange(optionValue)} />
            <span className="inline-flex min-h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground peer-checked:border-primary peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type MaskedFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: string; onChange: (value: string) => void };

function digitsOf(value: string, limit: number) {
  return value.replace(/\D/g, '').slice(0, limit);
}

/** Máscara DD/MM/AAAA; uma data ISO colada ou preenchida (AAAA-MM-DD) é convertida. */
export function maskBrazilianDate(value: string) {
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const digits = digitsOf(value, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
}

/** Campo de data no formato brasileiro. O valor é o texto DD/MM/AAAA, validado pelo formulário. */
export function DateField({ value, onChange, placeholder = 'DD/MM/AAAA', ...props }: MaskedFieldProps) {
  return <Input inputMode="numeric" autoComplete="off" maxLength={10} placeholder={placeholder} value={value} onChange={(event) => onChange(maskBrazilianDate(event.target.value))} {...props} />;
}

function monthDisplay(isoMonth: string) {
  const match = isoMonth.match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : '';
}

/** Interpreta MM/AAAA (ou AAAA-MM) e devolve AAAA-MM, ou `null` se incompleto ou inválido. */
export function parseMonthInput(value: string): string | null {
  const iso = value.trim().match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const match = value.trim().match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  return match ? `${match[2]}-${match[1]}` : null;
}

/**
 * Campo de competência com máscara MM/AAAA. Recebe e entrega AAAA-MM; enquanto o texto está
 * incompleto, o valor anterior é mantido e, ao sair do campo, o texto volta ao último mês válido.
 * Apagar o campo entrega uma string vazia.
 */
export function MonthField({ value, onChange, onBlur, placeholder = 'MM/AAAA', ...props }: MaskedFieldProps) {
  const [text, setText] = useState(() => monthDisplay(value));
  useEffect(() => {
    setText((current) => (parseMonthInput(current) === value ? current : monthDisplay(value)));
  }, [value]);

  function change(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const parsedIso = parseMonthInput(raw);
    const digits = digitsOf(raw, 6);
    const masked = parsedIso ? monthDisplay(parsedIso) : [digits.slice(0, 2), digits.slice(2)].filter(Boolean).join('/');
    setText(masked);
    const parsed = parseMonthInput(masked);
    if (parsed) onChange(parsed);
    else if (!masked) onChange('');
  }

  const incomplete = Boolean(text) && !parseMonthInput(text);
  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      maxLength={7}
      placeholder={placeholder}
      value={text}
      onChange={change}
      onBlur={(event) => { if (incomplete) setText(monthDisplay(value)); onBlur?.(event); }}
      {...props}
    />
  );
}

/**
 * Campo de valor em reais. O texto aceita vírgula e separador de milhar; ao sair do campo, um valor
 * válido é normalizado (ex.: "1234,5" → "1.234,50"). `onCentsChange` recebe centavos inteiros ou `null`.
 */
export function MoneyInput({ value, onChange, onCentsChange, onBlur, allowZero = false, className, placeholder = '0,00', ...props }: MaskedFieldProps & { onCentsChange?: (cents: number | null) => void; allowZero?: boolean }) {
  function update(next: string) {
    onChange(next);
    onCentsChange?.(parseBrazilianCents(next, allowZero));
  }
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        className={cn('pl-10 tabular-nums', className)}
        value={value}
        onChange={(event) => update(event.target.value)}
        onBlur={(event) => {
          const cents = parseBrazilianCents(value, allowZero);
          if (cents !== null) update(formatBrazilianAmount(cents));
          onBlur?.(event);
        }}
        {...props}
      />
    </div>
  );
}
