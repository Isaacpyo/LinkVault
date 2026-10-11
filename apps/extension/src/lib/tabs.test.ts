import { describe, expect, it } from 'vitest';
import { fitsCaptureLimit, MAX_CAPTURE_BYTES } from './tabs';

describe('fitsCaptureLimit', () => {
  it('measures UTF-8 bytes, not characters', () => {
    expect(fitsCaptureLimit('a'.repeat(MAX_CAPTURE_BYTES))).toBe(true);
    // 3 bytes per CJK character: half the character budget already exceeds the byte limit.
    expect(fitsCaptureLimit('漢'.repeat(MAX_CAPTURE_BYTES / 2))).toBe(false);
  });
});
