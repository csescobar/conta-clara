import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './button';

const overlayClassName = 'fixed inset-0 z-40 bg-foreground/40';
const contentClassName =
  'fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-xl outline-none sm:p-6';

export const Dialog = DialogPrimitive.Root;
export const DialogClose = DialogPrimitive.Close;

/** Conteúdo modal: prende o foco, fecha com Esc e devolve o foco ao gatilho. */
export function DialogContent({ className, children, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClassName} />
      <DialogPrimitive.Content className={cn(contentClassName, 'max-w-lg', className)} {...props}>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="grid gap-1">
      <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="text-sm leading-6 text-muted-foreground">{description}</DialogPrimitive.Description>
      ) : null}
    </div>
  );
}

export function DialogFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex flex-col-reverse gap-2 *:w-full sm:flex-row sm:justify-end sm:*:w-auto', className)} {...props} />;
}

export const AlertDialog = AlertDialogPrimitive.Root;

/** Confirmação que exige escolha explícita; clicar fora não fecha. */
export function AlertDialogContent({
  title,
  description,
  cancelLabel,
  confirmLabel,
  destructive = false,
  busy = false,
  focusConfirm = false,
  onConfirm,
  onCloseAutoFocus,
}: {
  title: ReactNode;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  /** Foca a confirmação ao abrir; por padrão o foco começa em cancelar. Use só em ações não destrutivas. */
  focusConfirm?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className={overlayClassName} />
      <AlertDialogPrimitive.Content
        className={cn(contentClassName, 'max-w-md gap-4')}
        onOpenAutoFocus={(event) => {
          if (focusConfirm && !destructive) {
            event.preventDefault();
            confirmRef.current?.focus();
          }
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="grid gap-1">
          <AlertDialogPrimitive.Title className="text-lg font-semibold">{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="text-sm leading-6 text-muted-foreground">
            {description}
          </AlertDialogPrimitive.Description>
        </div>
        <DialogFooter>
          <AlertDialogPrimitive.Cancel asChild>
            <Button type="button" variant="outline" disabled={busy}>
              {cancelLabel}
            </Button>
          </AlertDialogPrimitive.Cancel>
          <Button ref={confirmRef} type="button" variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}
