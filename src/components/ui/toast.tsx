import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, Info, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '../../lib/utils';

type ToastItem = { id: number; message: string; variant: 'success' | 'info' };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

/** Anuncia o resultado de uma ação concluída sem deslocar o conteúdo. Exige um `<Toaster />` montado. */
export function toast(message: string, variant: ToastItem['variant'] = 'success') {
  items = [...items, { id: nextId++, message, variant }];
  emit();
}

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function Toaster() {
  const current = useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  );
  return (
    <ToastPrimitive.Provider label="Notificação" duration={6000}>
      {current.map((item) => {
        const Icon = item.variant === 'success' ? CheckCircle2 : Info;
        return (
          <ToastPrimitive.Root
            key={item.id}
            type="foreground"
            onOpenChange={(open) => {
              if (!open) dismiss(item.id);
            }}
            className={cn(
              'flex items-start gap-3 rounded-xl border bg-card p-4 text-sm shadow-lg',
              item.variant === 'success' ? 'border-success-border' : 'border-info-border',
            )}
          >
            <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', item.variant === 'success' ? 'text-success' : 'text-info')} />
            <ToastPrimitive.Description className="min-w-0 flex-1 leading-6 text-foreground">{item.message}</ToastPrimitive.Description>
            <ToastPrimitive.Close
              aria-label="Fechar notificação"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X aria-hidden="true" className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 m-0 grid list-none gap-2 outline-none sm:left-auto sm:right-6 sm:w-96 lg:bottom-6" />
    </ToastPrimitive.Provider>
  );
}
