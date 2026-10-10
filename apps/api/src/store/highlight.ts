import type { HighlightSegment } from '@linkvault/shared';

/**
 * Private-use code points used as highlight pre/post tags. They never appear in
 * indexed text (stripped by `stripMarkers`), so fragments can be split safely and
 * rendered as plain text — no HTML ever travels to the client.
 */
export const HIGHLIGHT_PRE = '';
export const HIGHLIGHT_POST = '';

const MARKERS = /[]/g;

export const stripMarkers = (text: string) => text.replace(MARKERS, '');

/** Splits a highlighted fragment into plain/highlighted segments, merging adjacent runs. */
export function parseHighlight(fragment: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  const push = (text: string, highlight: boolean) => {
    if (!text) return;
    const last = segments.at(-1);
    if (last && last.highlight === highlight) last.text += text;
    else segments.push({ text, highlight });
  };
  let rest = fragment;
  while (rest.length) {
    const start = rest.indexOf(HIGHLIGHT_PRE);
    if (start === -1) {
      push(stripMarkers(rest), false);
      break;
    }
    push(stripMarkers(rest.slice(0, start)), false);
    const end = rest.indexOf(HIGHLIGHT_POST, start + 1);
    if (end === -1) {
      push(stripMarkers(rest.slice(start + 1)), false);
      break;
    }
    push(stripMarkers(rest.slice(start + 1, end)), true);
    rest = rest.slice(end + 1);
  }
  return segments;
}

/** True when the segments contain at least one highlighted run. */
export const hasHighlight = (segments: HighlightSegment[]) => segments.some((s) => s.highlight);
