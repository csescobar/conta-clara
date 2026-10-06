import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const manifestPath = resolve(process.cwd(), 'public/manifest.webmanifest');
const workerPath = resolve(process.cwd(), 'src/pwa/service-worker.js');

describe('PWA shell', () => {
  it('declares a standalone Portuguese app and valid install icons', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name: string;
      lang: string;
      display: string;
      icons: Array<{ src: string; sizes: string; purpose: string }>;
    };

    expect(manifest).toMatchObject({ name: 'Conta Clara', lang: 'pt-BR', display: 'standalone' });
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512', purpose: 'any' }),
      expect.objectContaining({ src: '/icons/icon-512-maskable.png', sizes: '512x512', purpose: 'maskable' }),
    ]));

    for (const icon of manifest.icons) {
      const png = readFileSync(resolve(process.cwd(), `public${icon.src}`));
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(Number.parseInt(icon.sizes.split('x')[0], 10));
      expect(png.readUInt32BE(20)).toBe(Number.parseInt(icon.sizes.split('x')[1], 10));
    }
  });

  it('pre-caches the built shell, bypasses API responses, and preserves unrelated caches on update', async () => {
    const handlers: Record<string, (event: any) => void> = {};
    const store = new Map<string, Map<string, Response>>();
    const addedUrls = new Map<string, string[]>();
    const keyFor = (request: string | { url: string }) => typeof request === 'string'
      ? request
      : new URL(request.url).pathname;

    function createCache(name: string) {
      if (!store.has(name)) store.set(name, new Map());
      return {
        async addAll(urls: string[]) {
          addedUrls.set(name, urls);
          for (const url of urls) store.get(name)!.set(url, new Response(`cached ${url}`));
        },
        async match(request: string | { url: string }) {
          return store.get(name)!.get(keyFor(request))?.clone();
        },
        async put(request: string | { url: string }, response: Response) {
          store.get(name)!.set(keyFor(request), response.clone());
        },
      };
    }

    store.set('conta-clara-shell-previous', new Map());
    store.set('analytics-cache', new Map());
    const caches = {
      open: vi.fn(async (name: string) => createCache(name)),
      keys: vi.fn(async () => [...store.keys()]),
      delete: vi.fn(async (name: string) => store.delete(name)),
      async match(request: string | { url: string }) {
        for (const entries of store.values()) {
          const cached = entries.get(keyFor(request));
          if (cached) return cached.clone();
        }
        return undefined;
      },
    };
    const fetch = vi.fn(async (request: string | { url: string }) => new Response(`network ${keyFor(request)}`));
    const self = {
      location: { origin: 'https://conta-clara.local' },
      clients: { claim: vi.fn(async () => undefined) },
      addEventListener: (type: string, handler: (event: any) => void) => { handlers[type] = handler; },
    };

    const source = readFileSync(workerPath, 'utf8')
      .replaceAll('__PWA_BUILD_ID__', 'test-build')
      .replace('__PWA_PRECACHE_URLS__', JSON.stringify([
        '/', '/assets/app.js', '/assets/app.css', '/manifest.webmanifest', '/icons/icon-192.png',
      ]));
    vm.runInNewContext(source, { self, caches, fetch, URL, Response, Promise });

    let installPromise!: Promise<void>;
    handlers.install({ waitUntil: (promise: Promise<void>) => { installPromise = promise; } });
    await installPromise;
    expect(addedUrls.get('conta-clara-shell-test-build')).toContain('/assets/app.js');
    expect(addedUrls.get('conta-clara-shell-test-build')).toContain('/');

    let apiResponded = false;
    handlers.fetch({
      request: { method: 'GET', url: 'https://conta-clara.local/api/auth/state', mode: 'cors' },
      respondWith: () => { apiResponded = true; },
    });
    expect(apiResponded).toBe(false);
    expect(fetch).not.toHaveBeenCalled();

    let activationPromise!: Promise<void>;
    handlers.activate({ waitUntil: (promise: Promise<void>) => { activationPromise = promise; } });
    await activationPromise;
    expect(store.has('conta-clara-shell-previous')).toBe(false);
    expect(store.has('analytics-cache')).toBe(true);
    expect(self.clients.claim).toHaveBeenCalledOnce();
  });

  it('serves only the cached app shell for offline navigation', async () => {
    const handlers: Record<string, (event: any) => void> = {};
    const store = new Map([[
      'conta-clara-shell-test-build',
      new Map([['/', new Response('<main>Conta Clara</main>')]]),
    ]]);
    const caches = {
      open: async (name: string) => ({
        async addAll() {},
        async match(request: string | { url: string }) {
          const key = typeof request === 'string' ? request : new URL(request.url).pathname;
          return store.get(name)?.get(key)?.clone();
        },
        async put() {},
      }),
      async match(request: string | { url: string }) {
        const key = typeof request === 'string' ? request : new URL(request.url).pathname;
        return store.get('conta-clara-shell-test-build')?.get(key)?.clone();
      },
    };
    const self = {
      location: { origin: 'https://conta-clara.local' },
      clients: { claim: async () => undefined },
      addEventListener: (type: string, handler: (event: any) => void) => { handlers[type] = handler; },
    };
    const fetch = vi.fn(async () => { throw new TypeError('offline'); });
    const source = readFileSync(workerPath, 'utf8')
      .replaceAll('__PWA_BUILD_ID__', 'test-build')
      .replace('__PWA_PRECACHE_URLS__', '[]');
    vm.runInNewContext(source, { self, caches, fetch, URL, Response, Promise });

    let navigationResponse!: Promise<Response>;
    handlers.fetch({
      request: { method: 'GET', url: 'https://conta-clara.local/activity', mode: 'navigate' },
      respondWith: (promise: Promise<Response>) => { navigationResponse = promise; },
    });
    expect(await (await navigationResponse).text()).toContain('Conta Clara');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
