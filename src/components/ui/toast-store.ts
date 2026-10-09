export type ToastAction = { label: string; onClick: () => void | Promise<void> };
export type ToastItem = { id: number; message: string; variant: 'success' | 'info'; action?: ToastAction };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

/**
 * Anuncia o resultado de uma ação concluída sem deslocar o conteúdo nem tirar o foco. Exige um `ToastHost` montado.
 * `action` oferece desfazer: use somente quando a operação puder ser revertida sem perda de dados ou autoria.
 */
export function toast(message: string, { variant = 'success', action }: { variant?: ToastItem['variant']; action?: ToastAction } = {}) {
  items = [...items, { id: nextId++, message, variant, action }];
  emit();
}

export function dismissToast(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts() {
  return items;
}
