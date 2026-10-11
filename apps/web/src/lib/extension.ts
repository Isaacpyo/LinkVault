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

export type ConnectResult = { ok: true } | { ok: false; reason: 'no-response' | 'api-mismatch' | 'rejected' };

/** Hands the current session to the extension and reports what it answered. */
export function connectExtension(session: { token: string; apiUrl: string; email: string }, timeoutMs = 3_000) {
  return new Promise<ConnectResult>((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve({ ok: false, reason: 'no-response' });
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; type?: string; ok?: boolean; reason?: string } | null;
      if (data?.source !== REPLY_SOURCE || data.type !== 'CONNECT_RESULT') return;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (data.ok === true) resolve({ ok: true });
      else resolve({ ok: false, reason: data.reason === 'api-mismatch' ? 'api-mismatch' : 'rejected' });
    }
    window.addEventListener('message', onMessage);
    window.postMessage({ source: MESSAGE_SOURCE, type: 'CONNECT', ...session }, window.location.origin);
  });
}
