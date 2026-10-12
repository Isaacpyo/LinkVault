/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

/** Must match READ_LATER_CACHE in src/lib/offline.ts (the page writes, the worker reads). */
const READ_LATER_CACHE = 'linkvault-read-later-v1';
/** How long to wait for the network before answering a reader request from the offline copy. */
const NETWORK_TIMEOUT_MS = 4_000;

void self.skipWaiting();
clientsClaim();

// App shell: hashed build assets, precached at install.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigations work offline by serving the precached index.html.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

/**
 * Reader content (`GET <api>/bookmarks/:id/content`): network first, so edits
 * show up, falling back to the read-later copy when offline, when the API
 * errors, or when it is too slow (e.g. a sleeping free-tier server). Fresh
 * responses refresh an existing offline copy, keeping it current.
 */
registerRoute(
  ({ url, request }) => request.method === 'GET' && /\/bookmarks\/[^/]+\/content$/.test(url.pathname),
  async ({ request }) => {
    const cache = await caches.open(READ_LATER_CACHE);
    const cached = await cache.match(request, { ignoreVary: true });

    const network = fetch(request).then(async (response) => {
      if (response.ok && cached) {
        const article = (await response.clone().json()) as Record<string, unknown>;
        await cache.put(
          request.url,
          new Response(JSON.stringify({ ...article, cachedAt: new Date().toISOString() }), {
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return response;
    });

    if (!cached) return network;
    // If the timeout wins, a later network failure is expected and should not be reported.
    network.catch(() => {});

    const timeout = new Promise<Response>((resolve) => setTimeout(() => resolve(cached.clone()), NETWORK_TIMEOUT_MS));
    try {
      const response = await Promise.race([network, timeout]);
      return response.ok ? response : cached;
    } catch {
      return cached;
    }
  },
);
