/**
 * Runs only on the LinkVault web app's origin (see manifest content_scripts).
 * Marks the page so the app can offer "Connect extension", and relays that
 * request to the background worker. Must stay import-free: content scripts are
 * classic scripts.
 */
const ATTRIBUTE = 'data-linkvault-extension';

document.documentElement.setAttribute(ATTRIBUTE, chrome.runtime.getManifest().version);

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data as {
    source?: string;
    type?: string;
    token?: unknown;
    email?: unknown;
    apiUrl?: unknown;
  } | null;
  if (data?.source !== 'linkvault-web' || data.type !== 'CONNECT') return;
  chrome.runtime.sendMessage(
    { type: 'CONNECT', token: data.token, email: data.email, apiUrl: data.apiUrl },
    (response?: { ok?: boolean; reason?: string }) => {
      window.postMessage(
        {
          source: 'linkvault-extension',
          type: 'CONNECT_RESULT',
          ok: response?.ok === true && !chrome.runtime.lastError,
          reason: response?.reason,
        },
        window.location.origin,
      );
    },
  );
});
