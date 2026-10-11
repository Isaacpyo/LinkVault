import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { stripMarkers } from '../store/highlight.js';
import { sanitizeArticleHtml } from './sanitize.js';

export const MAX_CONTENT_CHARS = 50_000;
export const MAX_HTML_CHARS = 100_000;
/**
 * Only this much of Readability's article HTML is sanitized and walked: it is
 * plenty to produce MAX_CONTENT_CHARS of text, and keeps huge pages from costing
 * seconds of CPU on markup that would be truncated anyway.
 */
const MAX_ARTICLE_HTML_CHARS = 400_000;
const MAX_TITLE_CHARS = 300;
const MAX_EXCERPT_CHARS = 300;
const WORDS_PER_MINUTE = 230;

export interface ExtractedArticle {
  title: string | null;
  excerpt: string | null;
  /** Plain text with paragraphs separated by blank lines. */
  content: string;
  contentHtml: string | null;
  siteName: string | null;
  byline: string | null;
  lang: string | null;
  wordCount: number;
  readingMinutes: number;
}

export interface ExtractInput {
  body: Buffer | string;
  url: string;
  contentType?: string | null;
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'LI',
  'UL',
  'OL',
  'PRE',
  'BLOCKQUOTE',
  'TABLE',
  'TR',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'FIGURE',
  'FIGCAPTION',
  'HR',
  'DL',
  'DT',
  'DD',
]);

/** Collapses whitespace inside paragraphs while keeping paragraph breaks. */
export function cleanText(text: string): string {
  return stripMarkers(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Sentinels for line and block breaks while source whitespace is collapsed (not matched by \s).
const LINE_BREAK = '\uE002';
const BLOCK_BREAK = '\uE003';

/**
 * Text content of an element as a reader sees it: source whitespace (including
 * newlines used for formatting the HTML) collapses to single spaces, <br> becomes a
 * newline and block elements are separated by blank lines.
 */
function blockText(root: Element): string {
  const doc = root.ownerDocument;
  for (const br of [...root.querySelectorAll('br')]) br.replaceWith(doc.createTextNode(LINE_BREAK));
  for (const el of [...root.querySelectorAll('*')]) {
    if (BLOCK_TAGS.has(el.tagName)) {
      el.before(doc.createTextNode(BLOCK_BREAK));
      el.after(doc.createTextNode(BLOCK_BREAK));
    }
  }
  const text = (root.textContent ?? '')
    .replace(/\s+/g, ' ')
    .replace(/ ?\uE002 ?/g, '\n')
    .replace(/(?: ?\uE003 ?)+/g, '\n\n');
  return cleanText(text);
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal reader HTML for plain-text pages or articles whose HTML is too large to store. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

const truncate = (text: string, max: number) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.8 ? lastSpace : max).trimEnd()}…`;
};

const countWords = (text: string) => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;

const meta = (doc: Document, ...selectors: string[]) => {
  for (const selector of selectors) {
    const value = doc.querySelector(selector)?.getAttribute('content')?.trim();
    if (value) return value;
  }
  return null;
};

const nullIfEmpty = (value: string | null | undefined) => {
  const trimmed = value ? cleanText(value) : '';
  return trimmed.length ? trimmed : null;
};

/**
 * Extracts the readable article from a page with Mozilla Readability.
 * jsdom runs without scripts, so page JavaScript never executes on the server.
 */
export function extractArticle({ body, url, contentType }: ExtractInput): ExtractedArticle {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase();
  if (mime === 'text/plain') {
    const raw = typeof body === 'string' ? body : body.toString('utf8');
    const content = truncate(cleanText(raw), MAX_CONTENT_CHARS);
    const wordCount = countWords(content);
    return {
      title: null,
      excerpt: nullIfEmpty(truncate(content, MAX_EXCERPT_CHARS)),
      content,
      contentHtml: textToHtml(content),
      siteName: null,
      byline: null,
      lang: null,
      wordCount,
      readingMinutes: Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
    };
  }

  // jsdom sniffs the charset (BOM, Content-Type, <meta charset>) when given bytes.
  const dom = new JSDOM(body, { url, contentType: contentType && mime === 'text/html' ? contentType : 'text/html' });
  try {
    const doc = dom.window.document;
    const lang = doc.documentElement.getAttribute('lang')?.trim().slice(0, 16) || null;
    const ogTitle = meta(doc, 'meta[property="og:title"]', 'meta[name="twitter:title"]');
    const description = meta(doc, 'meta[name="description"]', 'meta[property="og:description"]');
    const ogSiteName = meta(doc, 'meta[property="og:site_name"]', 'meta[name="application-name"]');
    const docTitle = doc.title;

    // Readability mutates the document it parses, so give it a clone.
    const article = new Readability(doc.cloneNode(true) as Document, { charThreshold: 300 }).parse();

    let content = '';
    let contentHtml: string | null = null;
    if (article?.content) {
      // Cutting mid-tag is fine: the sanitizer re-parses and closes open elements.
      const safeHtml = sanitizeArticleHtml(article.content.slice(0, MAX_ARTICLE_HTML_CHARS));
      const container = doc.createElement('div');
      container.innerHTML = safeHtml;
      content = blockText(container);
      contentHtml = safeHtml;
    }
    if (!content && doc.body) {
      for (const el of [...doc.body.querySelectorAll('script,style,noscript,template,svg,nav,header,footer')])
        el.remove();
      content = blockText(doc.body);
      contentHtml = content ? textToHtml(truncate(content, MAX_CONTENT_CHARS)) : null;
    }

    content = truncate(content, MAX_CONTENT_CHARS);
    if (contentHtml && contentHtml.length > MAX_HTML_CHARS) contentHtml = textToHtml(content);

    const wordCount = countWords(content);
    const excerptSource = article?.excerpt || description || content;
    return {
      title: nullIfEmpty(truncate(article?.title || ogTitle || docTitle || '', MAX_TITLE_CHARS)),
      excerpt: nullIfEmpty(truncate(cleanText(excerptSource ?? ''), MAX_EXCERPT_CHARS)),
      content,
      contentHtml,
      siteName: nullIfEmpty(article?.siteName || ogSiteName),
      byline: nullIfEmpty(article?.byline),
      lang: article?.lang?.slice(0, 16) || lang,
      wordCount,
      readingMinutes: Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
    };
  } finally {
    dom.window.close();
  }
}
