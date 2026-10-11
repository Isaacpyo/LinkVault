/**
 * Bridge to the LinkVault Chrome extension. Its content script runs only on the
 * web app's origin, marks the page with a data attribute and relays a
 * window.postMessage from this page to the extension's background worker.
 */
export const EXTENSION_ATTRIBUTE = 'data-linkvault-extension';
const MESSAGE_SOURCE = 'linkvault-web';
const REPLY_SOURCE = 'linkvault-extension';

export function isExtensionInstalled(): boolean {
  return document.documentElement.hasAttribute(EXTENSION_ATTRIBUTE);
}

/** Hands the current session to the extension. Resolves true once the extension confirms. */
export function connectExtension(session: { token: string; apiUrl: string; email: string }, timeoutMs = 3_000) {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve(false);
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; type?: string; ok?: boolean } | null;
      if (data?.source !== REPLY_SOURCE || data.type !== 'CONNECT_RESULT') return;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(data.ok === true);
    }
    window.addEventListener('message', onMessage);
    window.postMessage({ source: MESSAGE_SOURCE, type: 'CONNECT', ...session }, window.location.origin);
  });
}
