import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_URL } from '../playwright.config';

async function startDemo(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /try the demo/i }).click();
  await expect(page.getByRole('heading', { name: 'All bookmarks' })).toBeVisible();
  await expect(page.getByText('14 bookmarks')).toBeVisible();
}

test('demo → full-text search → tag filters → save a page → read later → offline reader', async ({ page, context }) => {
  await startDemo(page);

  // Full-text search: "rebinding" only appears in the body of one article.
  const search = page.getByRole('searchbox', { name: 'Search your library' });
  await search.fill('rebinding');
  await expect(page.getByRole('heading', { name: 'Results for “rebinding”' })).toBeVisible();
  const ssrf = page.getByRole('article').filter({ hasText: 'Server Side Request Forgery' });
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(ssrf.locator('mark', { hasText: /rebinding/i }).first()).toBeVisible();

  // Tag filters are AND-ed; facets narrow the result set.
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('heading', { name: 'All bookmarks' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('link', { name: /Filter by tag search/ })
    .click();
  await expect(page.getByText('3 bookmarks')).toBeVisible();
  await page.getByRole('button', { name: /Narrow to tag ranking/ }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('Okapi BM25');

  // Save a real page: the API fetches it, runs Readability and indexes the text.
  await page.getByRole('button', { name: 'Save a link' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a link' });
  await dialog.getByLabel('URL').fill(`${FIXTURE_URL}/quokka.html`);
  await dialog.getByLabel('Tags').fill('wildlife,');
  await dialog.getByRole('button', { name: 'Save link' }).click();
  await expect(page.getByText(/Saved — extracting the page text/)).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('link', { name: /All bookmarks/ })
    .click();
  const card = page.getByRole('article').filter({ hasText: 'Quokka' });
  await expect(card.getByRole('heading')).toHaveText('Field Notes: The Quokka of Rottnest Island', { timeout: 30_000 });
  await expect(card.getByRole('button', { name: '#wildlife' })).toBeVisible();

  // Its body text is now searchable, with highlighted snippets.
  await search.fill('nocturnal marsupial');
  await expect(card.locator('mark', { hasText: /nocturnal/i })).toBeVisible();

  // Read later stores an offline copy; the reader shows the sanitized article.
  await card.getByRole('button', { name: /^Read later/ }).click();
  await expect(page.getByText(/saved for offline/)).toBeVisible();
  await card.getByRole('link', { name: /^Read “Field Notes/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Field Notes: The Quokka of Rottnest Island');
  await expect(page.getByText(/feeding or touching them is prohibited/)).toBeVisible();

  // Offline: the service worker serves the app shell and the cached article.
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("You're offline.")).toBeVisible();
  await expect(page.getByText(/feeding or touching them is prohibited/)).toBeVisible();
  await page.goto('/reading-list');
  await expect(page.getByText('Showing the copies saved on this device.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Quokka/ })).toBeVisible();
  await context.setOffline(false);
});

test('collections work on a 375px-wide screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await startDemo(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Navigation' }).getByRole('button', { name: 'New collection' }).click();
  const create = page.getByRole('dialog', { name: 'New collection' });
  await create.getByLabel('Name').fill('To share');
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Collection created')).toBeVisible();

  const card = page.getByRole('article').filter({ hasText: 'Web Vitals' });
  await card.getByRole('button', { name: 'Edit “Web Vitals”' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit bookmark' });
  await edit.getByLabel('Collection').selectOption({ label: 'To share' });
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Bookmark updated')).toBeVisible();

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('link', { name: /To share/ })
    .click();
  await expect(page.getByRole('heading', { name: 'To share' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('Web Vitals');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
