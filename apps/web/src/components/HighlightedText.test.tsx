import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HighlightedText } from './HighlightedText';

describe('HighlightedText', () => {
  it('wraps highlighted segments in <mark>', () => {
    const { container } = render(
      <p>
        <HighlightedText
          segments={[
            { text: 'the ', highlight: false },
            { text: 'flamingo', highlight: true },
            { text: ' test', highlight: false },
          ]}
        />
      </p>,
    );
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(container.querySelector('mark')).toHaveTextContent('flamingo');
    expect(container).toHaveTextContent('the flamingo test');
  });

  it('renders markup in page text as plain text', () => {
    const { container } = render(
      <HighlightedText segments={[{ text: '<img src=x onerror=alert(1)>', highlight: true }]} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>');
  });
});
