import { lazy, Suspense, useCallback, useRef, useState, type ReactNode } from 'react';

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

// O diálogo (Radix) só é baixado na primeira confirmação; depois da primeira visita fica no cache do service worker.
const ConfirmDialogView = lazy(() => import('./confirm-dialog-view'));

/**
 * Substitui `window.confirm` por um diálogo acessível. Renderize o elemento devolvido na tela e
 * aguarde `confirm(...)`, que resolve `true` só quando a pessoa confirma.
 */
export function useConfirmDialog(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [requested, setRequested] = useState(false);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolveRef.current?.(false);
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRequested(true);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const element = requested ? (
    <Suspense fallback={null}>
      <ConfirmDialogView options={options} onSettle={settle} returnFocusRef={returnFocusRef} />
    </Suspense>
  ) : null;
  return [confirm, element];
}
