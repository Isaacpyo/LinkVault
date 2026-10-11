import { isSaveableUrl } from '@linkvault/shared';

export interface CurrentTab {
  id: number | undefined;
  url: string;
  title: string;
  favIconUrl: string | undefined;
  saveable: boolean;
}

/** Upper bound for captured HTML; larger pages are fetched by the server instead. */
export const MAX_CAPTURE_CHARS = 2_900_000;

export async function getCurrentTab(): Promise<CurrentTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  return {
    id: tab.id,
    url: tab.url,
    title: tab.title ?? tab.url,
    favIconUrl: tab.favIconUrl,
    saveable: isSaveableUrl(tab.url),
  };
}

/**
 * Reads the page HTML as rendered in this tab (activeTab + scripting). Useful
 * for pages behind a login or rendered by JavaScript. Returns undefined when not
 * permitted or too large.
 */
export async function capturePageHtml(tabId: number | undefined): Promise<string | undefined> {
  if (tabId === undefined) return undefined;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML,
    });
    const html = result?.result;
    return typeof html === 'string' && html.length <= MAX_CAPTURE_CHARS ? html : undefined;
  } catch {
    return undefined;
  }
}
