import { cloneElement, type InputHTMLAttributes, type ReactElement } from 'react';
import { cn } from '../../lib/utils';

/** Aparência compartilhada por campos de texto, seleção e texto longo. */
export const fieldControlClassName =
  'flex min-h-11 w-full rounded-xl border border-input bg-card px-3.5 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70';

export function Input({ className, 'aria-invalid': invalid, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input aria-invalid={invalid} className={cn(fieldControlClassName, className)} {...props} />;
}

type FieldControlProps = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean };

export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<FieldControlProps>;
}) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {cloneElement(children, { id, 'aria-describedby': descriptionId, 'aria-invalid': Boolean(error) })}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {!error && hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
