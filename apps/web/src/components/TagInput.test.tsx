import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TagInput } from './TagInput';

function Harness({ initial = [] as string[] }) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <label htmlFor="tags">Tags</label>
      <TagInput id="tags" value={tags} onChange={setTags} />
      <output data-testid="value">{tags.join('|')}</output>
    </>
  );
}

describe('TagInput', () => {
  it('adds normalized tags on Enter and comma, ignoring duplicates', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Tags');
    await user.type(input, '#React{Enter}web perf,react,');
    expect(screen.getByTestId('value')).toHaveTextContent('react|web-perf');
  });

  it('removes tags with Backspace or the remove button', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['a', 'b', 'c']} />);
    await user.type(screen.getByLabelText('Tags'), '{Backspace}');
    expect(screen.getByTestId('value')).toHaveTextContent('a|b');
    await user.click(screen.getByRole('button', { name: 'Remove tag a' }));
    expect(screen.getByTestId('value')).toHaveTextContent(/^b$/);
  });
});
