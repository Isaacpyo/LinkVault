import { isSaveableUrl } from '@linkvault/shared';
import { createApi } from './lib/api';
import { allowedWebOrigins, isConnectMessage, isTrustedSender } from './lib/messages';
import { getSession, getSettings, saveSettings, setSession } from './lib/storage';
import { capturePageHtml } from './lib/tabs';

/**
 * Extension service worker: context menus, the keyboard shortcut and the
 * session hand-off from the web app. Listeners are registered synchronously at
 * top level, as MV3 requires (the worker is woken per event).
 */

const MENU_PAGE = 'linkvault-save-page';
const MENU_LINK = 'linkvault-save-link';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_PAGE, title: 'Save page to LinkVault', contexts: ['page'] });
    chrome.contextMenus.create({ id: MENU_LINK, title: 'Save link to LinkVault', contexts: ['link'] });
  });
});

async function flashBadge(text: string, color: string, title: string) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title });
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: '' });
    void chrome.action.setTitle({ title: 'Save to LinkVault' });
  }, 3_000);
}

async function quickSave(url: string | undefined, title: string | undefined, tabId?: number) {
  if (!url || !isSaveableUrl(url)) {
    await flashBadge('!', '#dc2626', 'This page cannot be saved');
    return;
  }
  const [session, settings] = await Promise.all([getSession(), getSettings()]);
  if (!session) {
    await flashBadge('?', '#d97706', 'Sign in: click the LinkVault icon');
    return;
  }
  await flashBadge('…', '#4f46e5', 'Saving to LinkVault…');
  try {
    const html = settings.capturePage ? await capturePageHtml(tabId) : undefined;
    const api = createApi({ baseUrl: settings.apiUrl, token: session.token });
    const { created } = await api.save({ url, ...(title && { title }), ...(html && { html }) });
    await flashBadge('✓', '#16a34a', created ? 'Saved to LinkVault' : 'Already in LinkVault');
  } catch (error) {
    await flashBadge('!', '#dc2626', error instanceof Error ? error.message : 'Could not save');
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_LINK) void quickSave(info.linkUrl, info.selectionText || undefined);
  else if (info.menuItemId === MENU_PAGE) void quickSave(tab?.url ?? info.pageUrl, tab?.title, tab?.id);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'save-page') void quickSave(tab?.url, tab?.title, tab?.id);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (response: { ok: boolean }) => void) => {
  if (!isConnectMessage(message)) return false;
  const origins = allowedWebOrigins(chrome.runtime.getManifest());
  if (!isTrustedSender(sender, chrome.runtime.id, origins)) {
    sendResponse({ ok: false });
    return false;
  }
  const webUrl = sender.origin ?? new URL(sender.url ?? '').origin;
  void (async () => {
    await setSession({ token: message.token, email: message.email });
    await saveSettings({ apiUrl: message.apiUrl, webUrl });
    sendResponse({ ok: true });
  })();
  return true; // async response
});
