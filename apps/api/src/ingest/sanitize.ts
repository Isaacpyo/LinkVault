import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('');
const purify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);

purify.addHook('afterSanitizeAttributes', (node) => {
  const el = node as Element;
  if (el.tagName === 'A') {
    const href = el.getAttribute('href') ?? '';
    if (/^https?:/i.test(href)) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    } else if (!href.startsWith('#')) {
      el.removeAttribute('href');
    }
  }
  if (el.tagName === 'IMG') {
    const src = el.getAttribute('src') ?? '';
    if (!/^https?:/i.test(src)) {
      el.remove();
      return;
    }
    el.setAttribute('loading', 'lazy');
    el.setAttribute('referrerpolicy', 'no-referrer');
  }
});

/**
 * Sanitizes Readability output for the reader view: no scripts, styles, forms,
 * frames, event handlers or non-http(s) URLs. The web app sanitizes again
 * client-side (defence in depth).
 */
export function sanitizeArticleHtml(html: string): string {
  return purify.sanitize(html, {
    FORBID_TAGS: [
      'style',
      'script',
      'form',
      'input',
      'button',
      'select',
      'textarea',
      'iframe',
      'object',
      'embed',
      'svg',
      'math',
      'link',
      'meta',
    ],
    FORBID_ATTR: ['style', 'class', 'id', 'srcset', 'sizes'],
    ALLOW_DATA_ATTR: false,
  });
}
