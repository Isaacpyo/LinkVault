import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_POST as POST, HIGHLIGHT_PRE as PRE, parseHighlight, stripMarkers } from './highlight.js';

describe('parseHighlight', () => {
  it('splits a fragment into plain and highlighted segments', () => {
    expect(parseHighlight(`the ${PRE}quick${POST} brown ${PRE}fox${POST}`)).toEqual([
      { text: 'the ', highlight: false },
      { text: 'quick', highlight: true },
      { text: ' brown ', highlight: false },
      { text: 'fox', highlight: true },
    ]);
  });

  it('merges adjacent highlighted runs', () => {
    expect(parseHighlight(`${PRE}full${POST}${PRE}text${POST} search`)).toEqual([
      { text: 'fulltext', highlight: true },
      { text: ' search', highlight: false },
    ]);
  });

  it('treats HTML in the text as plain text', () => {
    const segments = parseHighlight(`<script>alert(1)</script> ${PRE}match${POST}`);
    expect(segments[0]).toEqual({ text: '<script>alert(1)</script> ', highlight: false });
  });

  it('tolerates an unterminated marker', () => {
    expect(parseHighlight(`a ${PRE}b`)).toEqual([{ text: 'a b', highlight: false }]);
  });

  it('returns no segments for an empty fragment', () => {
    expect(parseHighlight('')).toEqual([]);
  });
});

describe('stripMarkers', () => {
  it('removes marker characters from indexed text', () => {
    expect(stripMarkers(`x${PRE}y${POST}z`)).toBe('xyz');
  });
});
