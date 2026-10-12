/**
 * Renders the SVG logo to the PNG sizes needed by the PWA manifest and the
 * Chrome extension. Uses Playwright's Chromium, already a dev dependency.
 *   node scripts/render-icons.mjs
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(resolve(root, 'apps/web/public/favicon.svg'), 'utf8');

const targets = [
  ...[192, 512].map((size) => ({ size, out: `apps/web/public/icons/icon-${size}.png` })),
  ...[16, 32, 48, 128].map((size) => ({ size, out: `apps/extension/public/icons/icon-${size}.png` })),
];

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
for (const { size, out } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  const file = resolve(root, out);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`wrote ${out}`);
}
await browser.close();
