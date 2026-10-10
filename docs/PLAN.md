# LinkVault — build plan

> Status: this is the plan written before building the MVP. The README describes what shipped.

## Starting point

The repository contained a 10-file Next.js landing-page stub (`frontend/app/page.tsx`, a generic README and a
Next.js-flavoured `netlify.toml`). None of it is reusable: it has no persistence, no API and the copy describes a
different product ("auto-categorizes using AI"). It is deleted.

## Goal

A small but genuinely working bookmark manager with full-text search:

1. A **Chrome extension (Manifest V3)** saves the current tab with one click, optional tags, collection and
   "read later" flag.
2. A **Node.js API** fetches the page, extracts readable text with Mozilla **Readability**, sanitizes it and indexes it
   into **OpenSearch**.
3. A **React web app** searches the library with highlighted snippets, filters by tags and collections, and caches
   "read later" articles for offline reading through a **service worker**.

## Architecture

```
apps/
  api/        Fastify + TypeScript. Auth, bookmarks, collections, search, ingest queue.
  web/        React 19 + Vite + Tailwind. PWA with a custom Workbox service worker.
  extension/  MV3 extension built with Vite (popup, options page, background worker, content script).
packages/
  shared/     Zod schemas, DTO types and pure helpers (URL normalization, tag parsing) used by all three apps.
e2e/          Playwright smoke test of the main flow.
```

### Data model (OpenSearch is the only datastore)

The stack lists OpenSearch and nothing else, so it is the system of record rather than a secondary index. Three
indices, all prefixed by `OPENSEARCH_INDEX_PREFIX`:

| Index         | `_id`                           | Notes                                                                                        |
| ------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| `users`       | sha256(lower(email))            | `op_type=create` gives a race-free unique-email constraint.                                  |
| `collections` | random UUID                     | Per-user; deleting one unassigns its bookmarks via `update_by_query`.                        |
| `bookmarks`   | sha256(userId + normalized URL) | Deterministic id makes saves idempotent: re-saving a URL merges tags instead of duplicating. |

Every query is filtered by `userId` inside the store layer, so tenant isolation does not depend on route code
remembering to add a filter. Writes use `refresh: wait_for` so the UI reads its own writes.

The trade-off: no relational constraints or transactions. For this domain (single-owner documents, no cross-document
invariants beyond "unique email" and "one doc per URL per user", both solved with deterministic ids) that is
acceptable and keeps the free-tier footprint to one service. A `Store` interface isolates the rest of the code from
the backend, so adding Postgres as the system of record later is a contained change.

### Store backends

`SEARCH_BACKEND=opensearch|memory`. The memory backend implements the same interface (including a small BM25-ish
scorer and snippet highlighter) so unit tests, the e2e test and local dev work without credentials. A shared
"store contract" test suite runs against both backends; CI runs it against a real OpenSearch service container.

### Ingest pipeline

`POST /bookmarks` stores the bookmark as `pending` and returns immediately. An in-process queue (concurrency 2) then:

1. Validates the URL against an **SSRF guard**: http(s) only, standard ports, DNS resolved and every address checked
   against private/loopback/link-local/metadata ranges _at connect time_ (undici `lookup` hook, which also defeats DNS
   rebinding), redirects followed manually and re-validated, 10 s timeout, 5 MB body cap, HTML content types only.
2. Runs Readability on a script-less jsdom document, sanitizes the article HTML with DOMPurify, derives plain text,
   excerpt, word count and reading time.
3. Updates the document to `ready` (or `failed` with a reason). Pending jobs are re-queued on boot.

The extension can optionally send the page HTML as the user sees it (logged-in or JS-rendered pages); the same
extractor and sanitizer run on it.

### Search

`simple_query_string` (supports `"phrases"`, `-exclusion`, `a | b`) over `title^3, tags^2, excerpt^1.5, content,
siteName, url` with the English analyzer, `AND` as default operator. Tags and collection are `term` filters (tags are
AND-ed). Highlights use private-use Unicode markers as pre/post tags; the API converts fragments to
`{ text, highlight }` segments so the web app renders them as React nodes and never injects HTML. Tag facets are a
`terms` aggregation over the current result set.

### Auth

Email + password (bcrypt) and stateless HS256 JWTs sent as `Authorization: Bearer`. Web and API live on different
sites (Netlify vs Render), so cookies would be third-party and blocked by modern browsers; bearer tokens avoid that.
The token lives in `localStorage` (web) and `chrome.storage.local` (extension) — the XSS exposure is mitigated with a
strict CSP and by never rendering untrusted HTML without DOMPurify.

**Try the demo** creates an isolated sandbox account per visitor, seeded with collections and pre-extracted bookmarks,
which expires after 24 h (a cleanup job deletes it). Visitors cannot vandalize each other's demo.

**Extension sign-in**: email/password in the popup, or "Connect extension" in the web app, which hands the session
to the extension through a content script that only runs on the web app's origin. The popup's "Open library" hands
the session back to the web app through a URL fragment that is removed from history immediately.

### Offline "read later"

Marking a bookmark _read later_ in the web app fetches its reader content and stores it in a dedicated Cache Storage
bucket. The service worker precaches the app shell, serves SPA navigations offline and answers reader-content
requests network-first with that cache as the fallback. A _Reading list_ page enumerates the cache, so it works with
no network at all. Logging out clears the cache.

### Free-tier hosting

| Piece          | Host                          | Notes                                                      |
| -------------- | ----------------------------- | ---------------------------------------------------------- |
| Web app        | Netlify (existing site)       | `netlify.toml` builds `apps/web`.                          |
| API            | Render free web service       | `render.yaml` blueprint, Docker runtime. Sleeps when idle. |
| Search / store | Bonsai OpenSearch (free tier) | Same query DSL as Elasticsearch.                           |
| Extension      | GitHub Release zip            | Built by a workflow; loaded unpacked.                      |

Render's free instances sleep after ~15 minutes idle. The web app pings `/health` on load and shows a "Waking the
server…" banner when a request is slow; idempotent requests retry through 502/503/504 while it boots. The popup
does the same.

## Quality bar

- Strict TypeScript everywhere, zod validation at every API boundary, consistent error envelope.
- Loading / empty / error states, responsive to 375 px, labelled controls, visible focus rings, native `<dialog>`.
- Unit tests: URL normalization, tag parsing, SSRF guard, extraction + sanitization, query building, highlight parsing,
  memory search, store contract (both backends), API routes via `fastify.inject`, key web components, extension helpers.
- Playwright: demo login → search with highlights → tag filter → save a URL (real fetch + Readability) → read later →
  reader works offline.
- CI: install, lint, format check, typecheck, unit tests (with an OpenSearch service container), build, e2e.

## Known limits / tech debt (accepted for the MVP)

- In-process ingest queue: a crash loses in-flight work until the next boot re-queues `pending` docs. A real queue
  (e.g. Upstash Redis + BullMQ) is the upgrade path.
- Stateless JWTs cannot be revoked before expiry.
- Rate limiting is per instance (in memory). Fine for one free instance.
- Bonsai's free tier caps storage, so extracted text is truncated to 50k characters and reader HTML to 100k.
