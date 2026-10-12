import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_PRE } from '../store/highlight.js';
import { cleanText, extractArticle, MAX_CONTENT_CHARS, textToHtml } from './extract.js';

const fixture = readFileSync(new URL('../../test/fixtures/article.html', import.meta.url));
const URL_ = 'https://blog.example.com/posts/tiny-search-engine';

describe('extractArticle', () => {
  const article = extractArticle({ body: fixture, url: URL_, contentType: 'text/html; charset=utf-8' });

  it('extracts title, site name, language and excerpt', () => {
    expect(article.title).toBe('Building a Tiny Search Engine');
    expect(article.siteName).toBe('Example Engineering');
    expect(article.lang).toBe('en');
    expect(article.excerpt).toBe('How inverted indexes, analyzers and BM25 fit together.');
  });

  it('keeps article text and drops navigation, scripts and footer', () => {
    expect(article.content).toContain('inverted index');
    expect(article.content).toContain('flamingo');
    expect(article.content).not.toContain('window.tracking');
    expect(article.content).not.toContain('Copyright Example Engineering');
    // Paragraphs are separated by blank lines; newlines from HTML source formatting become spaces.
    expect(article.content).toMatch(/even across millions of documents, because a query[^\n]*\n\nBefore terms/);
    expect(article.content.split('\n\n')[0]).not.toContain('\n');
  });

  it('counts words and estimates reading time', () => {
    expect(article.wordCount).toBeGreaterThan(150);
    expect(article.readingMinutes).toBe(1);
  });

  it('sanitizes the reader HTML', () => {
    const html = article.contentHtml ?? '';
    expect(html).toContain('<p>');
    expect(html).not.toMatch(/<script|<iframe|<style|onerror|javascript:/i);
    // Relative URLs are resolved against the page URL; links open safely in a new tab.
    expect(html).toContain('src="https://blog.example.com/images/diagram.png"');
    expect(html).toContain('href="https://blog.example.com/docs/analyzers"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('still extracts text from short pages without an article element', () => {
    const result = extractArticle({
      body: '<html><head><title>Status</title><script>var x = 1;</script></head><body><div>All systems operational</div></body></html>',
      url: 'https://status.example.com',
    });
    expect(result.title).toBe('Status');
    expect(result.content).toContain('All systems operational');
    expect(result.content).not.toContain('var x');
  });

  it('handles plain-text pages', () => {
    const result = extractArticle({
      body: 'Line one\n\nLine <two>',
      url: 'https://example.com/rfc.txt',
      contentType: 'text/plain',
    });
    expect(result.content).toBe('Line one\n\nLine <two>');
    expect(result.contentHtml).toBe('<p>Line one</p>\n<p>Line &lt;two&gt;</p>');
  });

  it('decodes legacy charsets declared in the page', () => {
    const latin1 = Buffer.from(
      '<html><head><meta charset="iso-8859-1"><title>Caf\xe9</title></head><body><p>Cr\xe8me br\xfbl\xe9e</p></body></html>',
      'latin1',
    );
    const result = extractArticle({ body: latin1, url: 'https://example.fr', contentType: 'text/html' });
    expect(result.title).toBe('Café');
    expect(result.content).toContain('Crème brûlée');
  });

  it('truncates very long content and strips highlight markers', () => {
    const huge = `<html><body><article>${`<p>${'word '.repeat(200)}${HIGHLIGHT_PRE}</p>`.repeat(80)}</article></body></html>`;
    const result = extractArticle({ body: huge, url: 'https://example.com/long' });
    expect(result.content.length).toBeLessThanOrEqual(MAX_CONTENT_CHARS + 1);
    expect(result.content).not.toContain(HIGHLIGHT_PRE);
  });
});

describe('cleanText', () => {
  it('collapses whitespace but keeps paragraph breaks', () => {
    expect(cleanText('  a   b \n\n\n\n  c\t d  ')).toBe('a b\n\nc d');
  });
});

describe('textToHtml', () => {
  it('escapes HTML and wraps paragraphs', () => {
    expect(textToHtml('<b>x</b>\n\ny & z')).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>\n<p>y &amp; z</p>');
  });
});
