import type { RefObject } from 'react';
import type { ConfirmOptions } from './confirm-dialog';
import { AlertDialog, AlertDialogContent } from './dialog';

export default function ConfirmDialogView({
  options,
  onSettle,
  returnFocusRef,
}: {
  options: ConfirmOptions | null;
  onSettle: (confirmed: boolean) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  return (
    <AlertDialog
      open={Boolean(options)}
      onOpenChange={(open) => {
        if (!open) onSettle(false);
      }}
    >
      {options && (
        <AlertDialogContent
          title={options.title}
          description={options.description}
          cancelLabel={options.cancelLabel ?? 'Cancelar'}
          confirmLabel={options.confirmLabel}
          destructive={options.destructive}
          onConfirm={() => onSettle(true)}
          onCloseAutoFocus={(event) => {
            // Sem um Trigger do Radix, o foco voltaria ao corpo da página; devolve ao botão que pediu a confirmação.
            event.preventDefault();
            if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
            returnFocusRef.current = null;
          }}
        />
      )}
    </AlertDialog>
  );
}
