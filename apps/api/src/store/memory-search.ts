import { HIGHLIGHT_POST, HIGHLIGHT_PRE } from './highlight.js';
import { SNIPPET_FRAGMENT_SIZE, SNIPPET_FRAGMENTS } from './queries.js';

/**
 * A deliberately small full-text engine for the in-memory store. It mirrors the
 * parts of the OpenSearch setup the app relies on — English-ish stemming, AND
 * semantics, "phrases", -exclusions, prefix* terms, field boosts and highlighted
 * snippets — so tests and key-less local dev behave like production.
 */

export interface Token {
  term: string;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}]+/gu;

/** Lucene's `_english_` stopword list, as used by the OpenSearch mappings. */
export const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'if',
  'in',
  'into',
  'is',
  'it',
  'no',
  'not',
  'of',
  'on',
  'or',
  'such',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'was',
  'will',
  'with',
]);

/** Very light English stemmer: enough to match "bookmarks" with "bookmark" and "indexing" with "index". */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("'s")) w = w.slice(0, -2);
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (/(?:x|ch|sh|z)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  return w;
}

export function normalizeWord(word: string): string {
  return word.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = normalizeWord(match[0]);
    if (STOPWORDS.has(word)) continue;
    const start = match.index;
    tokens.push({ term: stem(word), start, end: start + match[0].length });
  }
  return tokens;
}

export interface ParsedQuery {
  /** Every required term (phrase words included). */
  terms: string[];
  /** Terms ending in "*" — matched as prefixes. */
  prefixes: string[];
  phrases: string[][];
  excluded: string[];
}

/** Parses the subset of `simple_query_string` syntax the UI documents. */
export function parseQuery(input: string): ParsedQuery {
  const parsed: ParsedQuery = { terms: [], prefixes: [], phrases: [], excluded: [] };
  const phraseRe = /(-?)"([^"]+)"/g;
  let rest = input;
  for (const match of input.matchAll(phraseRe)) {
    const words = tokenize(match[2] ?? '').map((t) => t.term);
    if (match[1] === '-') parsed.excluded.push(...words);
    else if (words.length) {
      parsed.phrases.push(words);
      parsed.terms.push(...words);
    }
    rest = rest.replace(match[0], ' ');
  }
  for (const raw of rest.split(/\s+/)) {
    if (!raw || raw === '|' || raw.toUpperCase() === 'AND' || raw === '+') continue;
    const negative = raw.startsWith('-');
    const isPrefix = raw.endsWith('*');
    const words = tokenize(raw).map((t) => t.term);
    if (!words.length) continue;
    if (negative) parsed.excluded.push(...words);
    else if (isPrefix && words.length === 1) parsed.prefixes.push(normalizeWord(raw.replace(/^[-+]|\*$/g, '')));
    else parsed.terms.push(...words);
  }
  return parsed;
}

export const isEmptyQuery = (q: ParsedQuery) => !q.terms.length && !q.prefixes.length && !q.phrases.length;

export interface SearchableField {
  name: string;
  text: string;
  boost: number;
}

interface FieldIndex {
  field: SearchableField;
  tokens: Token[];
  counts: Map<string, number>;
}

export function indexFields(fields: SearchableField[]): FieldIndex[] {
  return fields.map((field) => {
    const tokens = tokenize(field.text);
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t.term, (counts.get(t.term) ?? 0) + 1);
    return { field, tokens, counts };
  });
}

const termMatches = (token: string, query: ParsedQuery) =>
  query.terms.includes(token) || query.prefixes.some((p) => token.startsWith(p));

function containsPhrase(tokens: Token[], phrase: string[]): boolean {
  outer: for (let i = 0; i + phrase.length <= tokens.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (tokens[i + j]?.term !== phrase[j]) continue outer;
    return true;
  }
  return false;
}

/** True when every required term/prefix/phrase occurs in some field and no excluded term occurs anywhere. */
export function matches(index: FieldIndex[], query: ParsedQuery): boolean {
  const has = (term: string) => index.some((f) => f.counts.has(term));
  const hasPrefix = (prefix: string) => index.some((f) => f.tokens.some((t) => t.term.startsWith(prefix)));
  if (query.excluded.some(has)) return false;
  if (!query.terms.every(has)) return false;
  if (!query.prefixes.every(hasPrefix)) return false;
  return query.phrases.every((phrase) => index.some((f) => containsPhrase(f.tokens, phrase)));
}

/** TF-IDF-style score with field boosts. `docFrequency` maps term -> number of docs containing it. */
export function score(index: FieldIndex[], query: ParsedQuery, docFrequency: Map<string, number>, docCount: number) {
  let total = 0;
  for (const term of query.terms) {
    const idf = Math.log(1 + docCount / Math.max(1, docFrequency.get(term) ?? 1));
    for (const f of index) {
      const tf = f.counts.get(term) ?? 0;
      if (tf) total += f.field.boost * (1 + Math.log(tf)) * idf;
    }
  }
  for (const prefix of query.prefixes) {
    for (const f of index) if (f.tokens.some((t) => t.term.startsWith(prefix))) total += f.field.boost;
  }
  return total;
}

function mark(text: string, tokens: Token[], from: number, to: number): string {
  let out = '';
  let cursor = from;
  for (const t of tokens) {
    if (t.start < from || t.end > to) continue;
    out += text.slice(cursor, t.start) + HIGHLIGHT_PRE + text.slice(t.start, t.end) + HIGHLIGHT_POST;
    cursor = t.end;
  }
  return out + text.slice(cursor, to);
}

/** Whole-field highlight (title/excerpt). Returns null when nothing matched. */
export function highlightWhole(text: string, query: ParsedQuery): string | null {
  const hits = tokenize(text).filter((t) => termMatches(t.term, query));
  return hits.length ? mark(text, hits, 0, text.length) : null;
}

/** Up to `count` non-overlapping fragments of ~`size` characters centred on matches. */
export function highlightFragments(
  text: string,
  query: ParsedQuery,
  size = SNIPPET_FRAGMENT_SIZE,
  count = SNIPPET_FRAGMENTS,
): string[] {
  const hits = tokenize(text).filter((t) => termMatches(t.term, query));
  const fragments: string[] = [];
  let coveredUntil = -1;
  for (const hit of hits) {
    if (fragments.length >= count) break;
    if (hit.start < coveredUntil) continue;
    let start = Math.max(0, hit.start - Math.floor(size / 3));
    if (start > 0) {
      const space = text.indexOf(' ', start);
      if (space !== -1 && space < hit.start) start = space + 1;
    }
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > hit.end) end = space;
    }
    fragments.push(mark(text, hits, start, end).trim());
    coveredUntil = end;
  }
  return fragments;
}
