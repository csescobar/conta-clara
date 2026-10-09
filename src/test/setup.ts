import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// A suíte roda dezenas de arquivos em paralelo; o limite padrão de 1 s das esperas causava falhas intermitentes sob carga.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());

// O jsdom não implementa a captura de ponteiro nem a rolagem usadas pelo Radix (toast, seletores).
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
}
