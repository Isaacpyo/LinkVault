/** Message the content script relays from the web app ("Connect extension"). */
export interface ConnectMessage {
  type: 'CONNECT';
  token: string;
  email: string;
  apiUrl: string;
}

export function isConnectMessage(value: unknown): value is ConnectMessage {
  const m = value as Partial<ConnectMessage> | null;
  return (
    !!m &&
    m.type === 'CONNECT' &&
    typeof m.token === 'string' &&
    m.token.length > 10 &&
    typeof m.email === 'string' &&
    typeof m.apiUrl === 'string' &&
    /^https?:\/\//.test(m.apiUrl)
  );
}

/** Origins allowed to hand a session to the extension: exactly those the content script runs on. */
export function allowedWebOrigins(manifest: chrome.runtime.Manifest): string[] {
  return (manifest.content_scripts ?? [])
    .flatMap((script) => script.matches ?? [])
    .map((pattern) => pattern.replace(/\/\*$/, ''));
}

/**
 * The API a connect message may switch the extension to: the build default or the one
 * already configured. Anything else could redirect future saves to another server.
 */
export function acceptsApiUrl(apiUrl: string, allowed: { defaultApiUrl: string; currentApiUrl: string }): boolean {
  const normalized = apiUrl.replace(/\/+$/, '');
  return normalized === allowed.defaultApiUrl || normalized === allowed.currentApiUrl;
}

export function isTrustedSender(sender: chrome.runtime.MessageSender, extensionId: string, origins: string[]): boolean {
  if (sender.id !== extensionId) return false;
  const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : undefined);
  return origin !== undefined && origins.includes(origin);
}
