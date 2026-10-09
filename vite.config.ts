import { configDefaults, defineConfig } from 'vitest/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function pwaServiceWorker() {
  return {
    name: 'conta-clara-pwa-service-worker',
    apply: 'build' as const,
    generateBundle(
      this: { emitFile: (asset: { type: 'asset'; fileName: string; source: string }) => void },
      _options: unknown,
      bundle: Record<string, { type: string; source?: string | Uint8Array; code?: string }>,
    ) {
      const buildFiles = Object.keys(bundle).sort();
      const workerTemplate = readFileSync(resolve(import.meta.dirname, 'src/pwa/service-worker.js'), 'utf8');
      const buildHash = createHash('sha256');
      buildHash.update(readFileSync(resolve(import.meta.dirname, 'index.html')));
      buildHash.update(workerTemplate);
      for (const fileName of buildFiles) {
        const output = bundle[fileName];
        buildHash.update(fileName);
        buildHash.update(output.type === 'chunk' ? (output.code ?? '') : (output.source ?? ''));
      }
      const assets = buildFiles.filter((fileName) => fileName.startsWith('assets/')).map((fileName) => `/${fileName}`);
      const publicAssets = [
        'public/manifest.webmanifest',
        'public/icons/icon.svg',
        'public/icons/icon-192.png',
        'public/icons/icon-512.png',
        'public/icons/icon-512-maskable.png',
      ];
      for (const publicAsset of publicAssets) buildHash.update(readFileSync(resolve(import.meta.dirname, publicAsset)));
      const buildId = buildHash.digest('hex').slice(0, 12);
      const source = workerTemplate
        .replaceAll('__PWA_BUILD_ID__', buildId)
        .replace(
          '__PWA_PRECACHE_URLS__',
          JSON.stringify([
            '/',
            ...assets,
            '/manifest.webmanifest',
            '/icons/icon.svg',
            '/icons/icon-192.png',
            '/icons/icon-512.png',
            '/icons/icon-512-maskable.png',
          ]),
        );

      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pwaServiceWorker()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // Telas e gráficos carregam sob demanda e a suíte roda em paralelo: 5 s por teste era curto sob carga.
    testTimeout: 15_000,
    clearMocks: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001',
        changeOrigin: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest, request) => {
            // Preserve the browser-visible host so the API can validate Origin for CSRF.
            if (request.headers.host) proxyRequest.setHeader('host', request.headers.host);
          });
        },
      },
    },
  },
});
