import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, Info, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { dismissToast, getToasts, subscribeToasts } from './toast-store';

export function Toaster() {
  const current = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  return (
    <ToastPrimitive.Provider label="Notificação" duration={6000} swipeDirection="right">
      {current.map((item) => {
        const Icon = item.variant === 'success' ? CheckCircle2 : Info;
        return (
          <ToastPrimitive.Root
            key={item.id}
            type="background"
            duration={item.action ? 12000 : 6000}
            onOpenChange={(open) => {
              if (!open) dismissToast(item.id);
            }}
            className={cn(
              'flex items-start gap-3 rounded-xl border bg-card p-4 text-sm shadow-lg',
              item.variant === 'success' ? 'border-success-border' : 'border-info-border',
            )}
          >
            <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', item.variant === 'success' ? 'text-success' : 'text-info')} />
            <div className="grid min-w-0 flex-1 gap-2">
              <ToastPrimitive.Description className="leading-6 text-foreground">{item.message}</ToastPrimitive.Description>
              {item.action && (
                <ToastPrimitive.Action altText={`${item.action.label}: ${item.message}`} asChild>
                  <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => void item.action?.onClick()}>
                    {item.action.label}
                  </Button>
                </ToastPrimitive.Action>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Fechar notificação"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X aria-hidden="true" className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport
        label="Notificações ({hotkey})"
        className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 m-0 grid list-none gap-2 outline-none sm:left-auto sm:right-6 sm:w-96 lg:bottom-6"
      />
    </ToastPrimitive.Provider>
  );
}
