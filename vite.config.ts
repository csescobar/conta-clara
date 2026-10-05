import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
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
