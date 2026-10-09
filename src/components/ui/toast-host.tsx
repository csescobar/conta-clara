import { lazy, Suspense, useState, useSyncExternalStore } from 'react';
import { getToasts, subscribeToasts } from './toast-store';

// O componente visual (Radix) só é baixado quando o primeiro aviso aparece.
const Toaster = lazy(() => import('./toast').then(({ Toaster: component }) => ({ default: component })));

/** Ponto de montagem dos avisos temporários; fica no layout do app e na página do catálogo. */
export function ToastHost() {
  const hasToasts = useSyncExternalStore(
    subscribeToasts,
    () => getToasts().length > 0,
    () => false,
  );
  const [activated, setActivated] = useState(false);
  if (hasToasts && !activated) setActivated(true);
  return activated ? (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  ) : null;
}
