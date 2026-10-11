import type { HighlightSegment } from '@linkvault/shared';

/**
 * Renders search highlights as React nodes. The API sends `{ text, highlight }`
 * segments rather than HTML, so page content can never inject markup here.
 */
export function HighlightedText({ segments }: { segments: HighlightSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.highlight ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>,
      )}
    </>
  );
}
