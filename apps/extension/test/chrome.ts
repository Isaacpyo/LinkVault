import { vi } from 'vitest';

/** Minimal in-memory stand-in for the chrome.* APIs the extension uses. */
export function installChromeMock(
  options: { tab?: Partial<chrome.tabs.Tab> | null; manifest?: Partial<chrome.runtime.Manifest> } = {},
) {
  const store: Record<string, unknown> = {};
  const chromeMock = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(store, items)),
        remove: vi.fn(async (key: string) => void delete store[key]),
      },
    },
    tabs: {
      query: vi.fn(async () =>
        options.tab === null
          ? []
          : [{ id: 7, url: 'https://example.com/article', title: 'An article', ...options.tab }],
      ),
      create: vi.fn(async () => ({})),
    },
    scripting: { executeScript: vi.fn(async () => [{ result: '<html><body>captured</body></html>' }]) },
    runtime: {
      id: 'ext-id',
      getManifest: () => ({ manifest_version: 3, name: 'LinkVault', version: '0.1.0', ...options.manifest }),
      openOptionsPage: vi.fn(async () => {}),
    },
  };
  vi.stubGlobal('chrome', chromeMock);
  return { chrome: chromeMock, store };
}
