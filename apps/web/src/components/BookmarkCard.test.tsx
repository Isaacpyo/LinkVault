import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Bookmark, SearchHit } from '@linkvault/shared';
import { fakeFetch, renderWithProviders } from '../test/utils';
import { BookmarkCard } from './BookmarkCard';

const bookmark = (overrides: Partial<Bookmark> = {}): Bookmark => ({
  id: 'b1',
  url: 'https://example.com/post',
  domain: 'example.com',
  title: 'A post about caching',
  excerpt: 'An excerpt',
  siteName: 'Example',
  byline: null,
  lang: 'en',
  tags: ['web', 'perf'],
  collectionId: null,
  readLater: false,
  status: 'ready',
  error: null,
  wordCount: 900,
  readingMinutes: 4,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  fetchedAt: new Date().toISOString(),
  ...overrides,
});

function renderCard(hit: SearchHit, routes = {}) {
  const onTagClick = vi.fn();
  const { impl, calls } = fakeFetch(routes);
  renderWithProviders(
    <BookmarkCard
      hit={hit}
      collection={undefined}
      activeTags={['web']}
      onTagClick={onTagClick}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
    { fetchImpl: impl },
  );
  return { onTagClick, calls };
}

describe('BookmarkCard', () => {
  it('shows highlighted title and snippets for search hits', () => {
    renderCard({
      bookmark: bookmark(),
      titleSegments: [
        { text: 'A post about ', highlight: false },
        { text: 'caching', highlight: true },
      ],
      snippets: [
        [
          { text: 'strategies for ', highlight: false },
          { text: 'caching', highlight: true },
        ],
      ],
    });
    expect(screen.getAllByText('caching', { selector: 'mark' })).toHaveLength(2);
    expect(screen.queryByText('An excerpt')).not.toBeInTheDocument();
    expect(within(screen.getByRole('heading', { level: 3 })).getByRole('link')).toHaveAttribute(
      'href',
      'https://example.com/post',
    );
    expect(screen.getByRole('link', { name: /Read “A post about caching”/ })).toHaveAttribute('href', '/read/b1');
  });

  it('shows extraction progress for pending bookmarks and hides the reader link', () => {
    renderCard({ bookmark: bookmark({ status: 'pending', excerpt: null }), titleSegments: null, snippets: [] });
    expect(screen.getByText(/extracting text/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Read “/ })).not.toBeInTheDocument();
  });

  it('explains failures and retries extraction', async () => {
    const user = userEvent.setup();
    const { calls } = renderCard(
      {
        bookmark: bookmark({ status: 'failed', error: 'The site responded with HTTP 403' }),
        titleSegments: null,
        snippets: [],
      },
      { 'POST /bookmarks/b1/refetch': () => ({ status: 202, body: { bookmark: bookmark({ status: 'pending' }) } }) },
    );
    expect(screen.getByText(/HTTP 403/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(calls).toContainEqual(expect.objectContaining({ method: 'POST', path: '/bookmarks/b1/refetch' }));
  });

  it('marks active tags and reports tag clicks', async () => {
    const user = userEvent.setup();
    const { onTagClick } = renderCard({ bookmark: bookmark(), titleSegments: null, snippets: [] });
    expect(screen.getByRole('button', { name: '#web' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '#perf' }));
    expect(onTagClick).toHaveBeenCalledWith('perf');
  });

  it('toggles read later through the API', async () => {
    const user = userEvent.setup();
    const { calls } = renderCard(
      { bookmark: bookmark(), titleSegments: null, snippets: [] },
      {
        'PATCH /bookmarks/b1': () => ({ body: { bookmark: bookmark({ readLater: true }) } }),
        'GET /bookmarks/b1/content': () => ({
          body: { id: 'b1', title: 't', url: 'https://example.com/post', contentHtml: '<p>x</p>' },
        }),
      },
    );
    await user.click(screen.getByRole('button', { name: /read later/i }));
    expect(calls).toContainEqual({ method: 'PATCH', path: '/bookmarks/b1', body: { readLater: true } });
    expect(await screen.findByText(/added to your reading list/i)).toBeInTheDocument();
  });
});
