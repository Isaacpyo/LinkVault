import type { CollectionColor } from '@linkvault/shared';

/**
 * Demo library. Summaries are original text written for this project (not copies
 * of the linked pages); they stand in for what the extractor would store so the
 * demo works instantly and offline.
 */

export interface SeedCollection {
  key: string;
  name: string;
  color: CollectionColor;
}

export interface SeedBookmark {
  url: string;
  title: string;
  siteName: string;
  byline?: string;
  tags: string[];
  collection?: string;
  readLater?: boolean;
  daysAgo: number;
  paragraphs: string[];
}

export const SEED_COLLECTIONS: SeedCollection[] = [
  { key: 'frontend', name: 'Frontend', color: 'sky' },
  { key: 'search', name: 'Search engineering', color: 'violet' },
  { key: 'design', name: 'Design & UX', color: 'pink' },
];

export const SEED_BOOKMARKS: SeedBookmark[] = [
  {
    url: 'https://react.dev/learn/you-might-not-need-an-effect',
    title: 'You Might Not Need an Effect',
    siteName: 'React',
    tags: ['react', 'javascript', 'state'],
    collection: 'frontend',
    daysAgo: 1,
    paragraphs: [
      'Effects are an escape hatch for synchronizing a component with something outside React, such as a network connection, a browser API or a third-party widget. When there is no external system involved, an effect is usually the wrong tool and makes code slower and harder to follow.',
      'Derived values are the most common case. If a value can be calculated from existing props or state, calculate it during rendering instead of copying it into state from an effect. Expensive calculations can be memoized with useMemo rather than cached in state.',
      'Resetting state when a prop changes is better done by giving the component a key, so React treats it as a new instance. Responding to a user event belongs in the event handler that caused it, not in an effect that watches for the resulting state change.',
      'Data fetching is a legitimate use of effects, but it needs cleanup to ignore stale responses and avoid race conditions. In practice a framework or a caching library handles fetching, deduplication and caching better than hand-written effects.',
    ],
  },
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API',
    title: 'Service Worker API',
    siteName: 'MDN Web Docs',
    tags: ['pwa', 'offline', 'javascript'],
    collection: 'frontend',
    readLater: true,
    daysAgo: 2,
    paragraphs: [
      'A service worker is a script that the browser runs in the background, separate from the page. It acts as a programmable network proxy: it can intercept requests made by the pages it controls and decide whether to answer them from the network, from a cache, or with a synthetic response.',
      'Service workers are event driven. They are installed, activated and then woken up for fetch, push and sync events. Because they can be terminated at any time, they cannot rely on global state and must persist anything important in Cache Storage or IndexedDB.',
      'The Cache API stores request and response pairs. Common strategies include cache first for versioned static assets, network first for content that should be fresh but still available offline, and stale-while-revalidate for content where speed matters more than freshness.',
      'Service workers only run on secure origins (HTTPS or localhost), and their scope is limited to the path they are served from. Updating a worker installs the new version alongside the old one; it takes control once all pages using the previous version have closed, unless it calls skipWaiting.',
    ],
  },
  {
    url: 'https://web.dev/articles/vitals',
    title: 'Web Vitals',
    siteName: 'web.dev',
    tags: ['performance', 'metrics'],
    collection: 'frontend',
    daysAgo: 4,
    paragraphs: [
      'Web Vitals is an initiative that defines a small set of user-centric metrics for the quality of experience on the web. The core metrics measure loading, interactivity and visual stability, the three things users notice most.',
      'Largest Contentful Paint measures how long it takes for the main content to render; a good score is within 2.5 seconds. Interaction to Next Paint measures how quickly the page responds visually to clicks, taps and key presses throughout its lifetime. Cumulative Layout Shift measures unexpected movement of content while the page is in use.',
      'The metrics should be assessed at the 75th percentile of real page loads, split by mobile and desktop, because lab tests on a fast laptop rarely reflect what users experience on mid-range phones and slow networks.',
      'Typical fixes include serving appropriately sized images, preloading the hero resource, breaking up long JavaScript tasks, reserving space for images and embeds with explicit dimensions, and avoiding layout-shifting web fonts.',
    ],
  },
  {
    url: 'https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3',
    title: 'What is Manifest V3?',
    siteName: 'Chrome for Developers',
    tags: ['browser-extensions', 'chrome', 'security'],
    daysAgo: 6,
    paragraphs: [
      'Manifest V3 is the current version of the Chrome extension platform. It focuses on security, privacy and performance, and changes several long-standing extension APIs.',
      'Background pages are replaced by extension service workers. They start when an event they listen to fires and are shut down when idle, so extensions must store state in chrome.storage instead of global variables, and register listeners synchronously at the top level of the script.',
      'Remotely hosted code is no longer allowed: all logic must ship inside the extension package, which makes reviews meaningful. Network request blocking moves to the declarativeNetRequest API, where the browser applies rules without exposing request contents to the extension.',
      'The activeTab permission is encouraged over broad host permissions. It grants temporary access to the current tab only after the user invokes the extension, for example by clicking its toolbar button or a context menu item.',
    ],
  },
  {
    url: 'https://opensearch.org/docs/latest/query-dsl/full-text/simple-query-string/',
    title: 'Simple query string queries',
    siteName: 'OpenSearch Documentation',
    tags: ['opensearch', 'search', 'query-dsl'],
    collection: 'search',
    daysAgo: 3,
    paragraphs: [
      'The simple_query_string query parses a compact search syntax typed by end users and searches one or more fields. Unlike query_string it never throws on invalid syntax; malformed parts are ignored, which makes it safe to expose directly in a search box.',
      'Supported operators include + for AND, | for OR, - for negation, double quotes for phrase search, a trailing * for prefix queries, parentheses for precedence and ~N for fuzziness or phrase slop. The flags parameter restricts which operators are enabled.',
      'Fields can be boosted with the caret syntax, for example title^3, so matches in a title score higher than matches in body text. The default_operator setting controls whether terms without an explicit operator must all match (and) or any can match (or).',
      'Because the query is analyzed per field, the same text is stemmed with the English analyzer for prose fields while keyword fields such as tags only match exact values.',
    ],
  },
  {
    url: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/highlighting.html',
    title: 'Highlighting search results',
    siteName: 'Elastic Docs',
    tags: ['search', 'elasticsearch', 'highlighting'],
    collection: 'search',
    daysAgo: 5,
    paragraphs: [
      'Highlighters return fragments of the matching fields with the query terms wrapped in tags, so a results page can show why each document matched. The unified highlighter is the default and works from the stored text, postings or term vectors.',
      'Fragment size and the number of fragments control how much context is returned. Setting number_of_fragments to zero returns the whole field highlighted, which suits short fields such as titles.',
      'Pre and post tags are configurable. When highlighted text is rendered as HTML, the raw field content must be escaped first, otherwise the stored text itself becomes an injection vector. Using an html encoder, or neutral marker characters converted to elements on the client, avoids that problem.',
      'require_field_match limits highlighting to fields that the query actually matched, which keeps snippets relevant when one query searches many fields.',
    ],
  },
  {
    url: 'https://en.wikipedia.org/wiki/Okapi_BM25',
    title: 'Okapi BM25',
    siteName: 'Wikipedia',
    tags: ['search', 'information-retrieval', 'ranking'],
    collection: 'search',
    readLater: true,
    daysAgo: 9,
    paragraphs: [
      'BM25 is a ranking function used by search engines to estimate how relevant a document is to a query. It is the default similarity in Lucene, and therefore in OpenSearch and Elasticsearch.',
      'The score combines term frequency, inverse document frequency and document length. Repeating a term raises the score with diminishing returns, controlled by the parameter k1. Rare terms contribute more than common ones. Long documents are penalized relative to the average length, controlled by the parameter b.',
      'Compared with classic TF-IDF, the saturation of term frequency means that keyword stuffing has limited effect, and the length normalization keeps short, focused documents competitive with long ones.',
      'Field boosts and query structure are layered on top: a match in a boosted title field multiplies that clause, and bool queries sum the scores of matching clauses.',
    ],
  },
  {
    url: 'https://github.com/mozilla/readability',
    title: 'Readability.js — standalone version of the Firefox Reader View',
    siteName: 'GitHub',
    tags: ['javascript', 'parsing', 'reader-view'],
    collection: 'search',
    daysAgo: 12,
    paragraphs: [
      'Readability is the library behind the Firefox Reader View. Given a DOM document it scores candidate elements by text density, link density and class names, picks the most likely article container and returns a cleaned version of it.',
      'The parse result includes the title, byline, site name, language, an excerpt, the article HTML and its plain text content. Relative links and image sources are resolved to absolute URLs against the document base.',
      'On a server it is typically paired with jsdom. Scripts should not be executed while parsing untrusted pages, and the returned HTML should still be passed through a sanitizer such as DOMPurify before being shown to users, since Readability is not a security boundary.',
      'A helper, isProbablyReaderable, gives a quick estimate of whether a page contains an article at all, which is useful for deciding whether to offer a reader mode.',
    ],
  },
  {
    url: 'https://owasp.org/www-community/attacks/Server_Side_Request_Forgery',
    title: 'Server Side Request Forgery',
    siteName: 'OWASP',
    tags: ['security', 'ssrf', 'backend'],
    readLater: true,
    daysAgo: 7,
    paragraphs: [
      'Server-side request forgery happens when an application fetches a URL supplied by a user and an attacker points it at an internal resource. The request then originates from inside the trust boundary, reaching admin interfaces, internal APIs or cloud metadata endpoints that are not exposed to the internet.',
      'Link previews, webhooks, PDF renderers and bookmark fetchers are classic targets because fetching arbitrary URLs is their purpose. Blocklists of hostnames are easy to bypass with alternative IP encodings, redirects and DNS records that resolve to private addresses.',
      'Robust defenses resolve the hostname, reject loopback, private, link-local and reserved ranges, and pin the connection to the validated address so DNS rebinding cannot swap it afterwards. Redirects must be followed manually and each hop validated again.',
      'Further layers include restricting schemes and ports, limiting response size and time, and running the fetcher in a network segment without access to sensitive services.',
    ],
  },
  {
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/',
    title: 'Dialog (Modal) Pattern',
    siteName: 'WAI-ARIA Authoring Practices Guide',
    tags: ['accessibility', 'design', 'html'],
    collection: 'design',
    daysAgo: 10,
    paragraphs: [
      'A modal dialog is a window overlaid on the page that makes the content underneath inert. Keyboard focus moves into the dialog when it opens, stays trapped inside while it is open and returns to the element that opened it when it closes.',
      'Escape closes the dialog. Tab and Shift+Tab cycle through the focusable elements inside it. The dialog needs an accessible name, usually by referencing its visible heading, and may reference a description.',
      'The native HTML dialog element opened with showModal provides most of this behavior: it makes the rest of the page inert, handles Escape, and exposes the correct role to assistive technology.',
      'Initial focus should go to the first interactive element, or to a static element at the top when the dialog contains long content, so screen reader users do not miss the beginning.',
    ],
  },
  {
    url: 'https://lawsofux.com/hicks-law/',
    title: "Hick's Law",
    siteName: 'Laws of UX',
    tags: ['design', 'ux', 'psychology'],
    collection: 'design',
    daysAgo: 15,
    paragraphs: [
      "Hick's Law states that the time it takes to make a decision increases with the number and complexity of the choices. Every extra option adds cognitive load, especially when options are similar.",
      'Interfaces can reduce decision time by highlighting a recommended option, breaking complex tasks into smaller steps, and progressively disclosing advanced features instead of showing everything at once.',
      'The law is not an argument for removing capability. Search, filtering and good grouping let people narrow large sets quickly, which is why a bookmark manager with thousands of links depends on fast search and tags rather than deep folder trees.',
    ],
  },
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout',
    title: 'CSS grid layout',
    siteName: 'MDN Web Docs',
    tags: ['css', 'layout', 'responsive'],
    collection: 'design',
    daysAgo: 20,
    paragraphs: [
      'CSS grid layout is a two-dimensional layout system: it controls rows and columns at the same time, while flexbox lays items out along a single axis.',
      'Tracks are defined with grid-template-columns and grid-template-rows using lengths, percentages and the fr unit, which distributes the remaining space. The repeat function with auto-fill or auto-fit and minmax builds responsive grids that add or remove columns without media queries.',
      'Items can be placed by line numbers, named lines or named template areas, and gap sets consistent spacing between tracks. Subgrid lets nested grids align to the tracks of their parent.',
    ],
  },
  {
    url: 'https://martinfowler.com/articles/feature-toggles.html',
    title: 'Feature Toggles (aka Feature Flags)',
    siteName: 'martinfowler.com',
    byline: 'Pete Hodgson',
    tags: ['architecture', 'deployment', 'testing'],
    daysAgo: 25,
    paragraphs: [
      'Feature toggles let teams change system behavior without deploying new code. They decouple deployment from release, so unfinished work can be merged to the main branch and shipped dark.',
      'Toggles fall into categories with different lifetimes and dynamism: release toggles are short-lived and static, experiment toggles route users into cohorts, ops toggles act as kill switches, and permission toggles gate features for particular users.',
      'Each toggle adds a branch to test and a piece of inventory to manage. Keeping the number small, putting toggle decisions behind a single abstraction and removing release toggles promptly prevents them from turning into permanent complexity.',
    ],
  },
  {
    url: 'https://12factor.net/config',
    title: 'III. Config — The Twelve-Factor App',
    siteName: 'The Twelve-Factor App',
    tags: ['architecture', 'devops', 'configuration'],
    daysAgo: 30,
    paragraphs: [
      'An app’s config is everything that varies between deploys: credentials for backing services, hostnames, and per-environment settings. The twelve-factor methodology stores config in environment variables, strictly separated from code.',
      'A useful test is whether the codebase could be made open source at any moment without leaking credentials. Config files checked into the repository fail that test; environment variables pass it.',
      'Environment variables are granular and orthogonal rather than grouped into named environments, which scales better as the number of deploys grows. Validating them at startup, and failing fast with a clear message, turns misconfiguration into an obvious error instead of a subtle runtime bug.',
    ],
  },
];
