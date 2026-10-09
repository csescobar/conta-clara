export type ToastItem = { id: number; message: string; variant: 'success' | 'info' };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

/** Anuncia o resultado de uma ação concluída sem deslocar o conteúdo. Exige um `ToastHost` montado. */
export function toast(message: string, variant: ToastItem['variant'] = 'success') {
  items = [...items, { id: nextId++, message, variant }];
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
