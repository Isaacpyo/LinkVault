# LinkVault

[![CI](https://github.com/Isaacpyo/LinkVault/actions/workflows/ci.yml/badge.svg)](https://github.com/Isaacpyo/LinkVault/actions/workflows/ci.yml)

**Live demo: https://linkvault.temitopeagbola.com** — click **Try the demo**, no sign-up.

LinkVault is a bookmark manager that remembers what pages _said_, not just what they were called. A Manifest V3
Chrome extension saves the current tab with one click (plus optional tags, collection and "read later"); a Node.js API
fetches the page behind an SSRF guard, extracts the readable article with Mozilla Readability and indexes it in
OpenSearch; and a React web app searches the full text with highlighted snippets, filters by tags and collections, and
keeps your reading list available offline through a service worker.

<p align="center">
  <img src="docs/screenshots/search.png" alt="Search results with highlighted snippets, tag facets and collections" width="820">
</p>

| Offline reader (network disabled)                                                            | Mobile (375 px)                                                         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| <img src="docs/screenshots/reader-offline.png" alt="Reader view served offline" width="520"> | <img src="docs/screenshots/mobile.png" alt="Mobile layout" width="220"> |

## Features

- **One-click saving** from the Chrome extension: clicking the toolbar icon saves the tab immediately; the popup then
  adds tags, a collection or "read later", shows extraction progress and can undo. Right-click any page or link, or
  press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>.
- **Readable-text extraction**: the API fetches the page (or uses the HTML the extension captured for logged-in /
  JavaScript-heavy pages), runs Readability on a script-less jsdom document and sanitizes the article with DOMPurify.
- **Full-text search** across titles, tags, URLs and page text: English stemming, `"phrases"`, `-exclusions`,
  `prefix*`, field boosts, highlighted title and body snippets, tag facets, collection filters, sort and pagination.
- **Tags and collections**: AND-ed tag filters from the sidebar, facets or the cards; collections with colours;
  deleting a collection keeps its bookmarks (they move to Unsorted).
- **Read later, offline**: marking an article "read later" stores a copy in Cache Storage. A Workbox service worker
  precaches the app shell and serves the reader and the reading list with no network.
- **Idempotent saves**: URLs are normalized (tracking params, fragments, trailing slashes…), so saving the same page
  twice merges tags instead of creating a duplicate.
- **Try the demo**: every visitor gets a private, seeded sandbox that deletes itself after 24 hours.
- **Free-tier aware**: the API sleeps on Render's free plan, so the web app and extension show a _"Waking up the
  server…"_ notice and retry idempotent requests while it boots.
- Loading, empty and error states everywhere; responsive down to 375 px; labelled controls, visible focus rings,
  native `<dialog>` modals, skip link and live regions.

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    EXT["Chrome extension (MV3)<br/>popup · background worker · content script"]
    WEB["React web app (Vite PWA)<br/>search · tags · collections · reader"]
    SW["Service worker<br/>app shell + read-later cache"]
    WEB <--> SW
  end

  subgraph Render["Render free web service"]
    API["Node.js API (Fastify)<br/>auth · bookmarks · collections · search"]
    Q["Ingest queue<br/>SSRF-guarded fetch → Readability → DOMPurify"]
    API --> Q
  end

  OS[("OpenSearch<br/>(Bonsai)<br/>users · collections · bookmarks")]
  SITES(("Web pages"))

  EXT -- "POST /bookmarks (+ optional captured HTML)" --> API
  WEB -- "REST + bearer token" --> API
  EXT <-. "Connect extension (content script, same origin only)" .-> WEB
  API -- "search, CRUD (refresh=wait_for)" --> OS
  Q -- "fetch (public IPs only)" --> SITES
  Q -- "index text + reader HTML" --> OS
```

| Path              | What it is                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `apps/api`        | Fastify + TypeScript API, OpenSearch store, in-memory store, ingest pipeline, demo seeding. |
| `apps/web`        | React 19 + Vite + Tailwind CSS PWA with a custom Workbox service worker.                    |
| `apps/extension`  | Chrome extension (Manifest V3) built with Vite: popup, options, background, content script. |
| `packages/shared` | Zod schemas (`@linkvault/shared/schemas`), DTO types, URL normalization and tag parsing.    |
| `e2e`             | Playwright smoke test of the main flow, with a local fixture site.                          |
| `docs/PLAN.md`    | The design notes written before building.                                                   |

**How a save flows:** `POST /bookmarks` normalizes the URL, derives a deterministic id from `(user, URL)`, stores the
bookmark as `pending` and returns immediately. An in-process queue (bounded concurrency, one retry for transient
failures, pending jobs resumed on boot) fetches the page, extracts and sanitizes it, and updates the document to
`ready` or `failed` with a human-readable reason. The UI polls while anything is pending.

**Data model:** OpenSearch is the only datastore. Users use `sha256(email)` as document id so `op_type=create` is a
race-free unique-email constraint; bookmarks use `sha256(userId + normalizedUrl)` so saves are idempotent. Every query
is scoped by `userId` inside the store layer. A `Store` interface has two implementations — OpenSearch and an
in-memory engine (stemming, AND/phrase/exclusion/prefix queries, boosts, highlight fragments) — and one contract test
suite runs against both.

**Search highlighting without XSS:** highlights use private-use Unicode characters as pre/post tags; the API converts
fragments to `{ text, highlight }` segments and the web app renders them as React nodes. No HTML from a page ever
reaches `innerHTML` except the reader view, which is sanitized on the server and again in the browser.

## Stack and substitutions

| Requested                | Used                                                      | Why                                                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elasticsearch            | **OpenSearch** (Bonsai free tier; 2.17 locally and in CI) | The listed swap. Same query DSL (`simple_query_string`, highlighting, aggregations, `update_by_query`); Bonsai offers a free hosted cluster, and the official `opensearchproject/opensearch` image runs in compose and CI. |
| Chrome Web Store listing | **Zip on a GitHub Release**, loaded unpacked              | The listed swap. `release-extension.yml` builds and attaches `linkvault-extension-v<version>.zip` on every extension change merged to `main`.                                                                              |
| React web app            | React 19 SPA on **Vite** (replaces the Next.js stub)      | The app is a client-side PWA talking to a separate API; Vite gives a static build Netlify serves as-is, and `vite-plugin-pwa` makes the custom service worker straightforward.                                             |
| Node.js API              | Node 22 + **Fastify** + TypeScript                        | Fast, schema-friendly, and `fastify.inject` makes route tests cheap.                                                                                                                                                       |
| (no relational DB)       | OpenSearch as the system of record                        | The stack lists only OpenSearch. Deterministic ids cover the two invariants this domain has (unique email, one bookmark per URL per user) and keep the free-tier footprint to one data service. See trade-offs below.      |

## Run it locally

Prerequisites: Node 22.12+ and npm 10+; Docker for the full stack.

### Everything in Docker (one command)

```bash
docker compose up --build
```

| Service    | URL                               |
| ---------- | --------------------------------- |
| Web app    | http://localhost:8080             |
| API        | http://localhost:4000 (`/health`) |
| OpenSearch | http://localhost:9200             |

Sign in with the seeded account **demo@linkvault.local / linkvault-demo**, or click **Try the demo**.

### Development mode (hot reload)

```bash
npm install
cp .env.example .env              # optional: set OPENSEARCH_URL=http://localhost:9200 to persist
docker compose up -d opensearch   # optional: without it the API uses the in-memory store
npm run dev                       # API on :4000 and web app on :5173
```

With no `OPENSEARCH_URL` the API runs on the in-memory store, so the whole app works with zero infrastructure (data
resets on restart and the UI says so). `npm run seed` adds the local demo account to OpenSearch.

### Load the extension

1. Build it for your environment:
   - Local: `VITE_API_URL=http://localhost:4000 VITE_WEB_URL=http://localhost:5173 npm run build -w @linkvault/extension -- --mode development`
     (development builds also connect to the web app on `localhost:5173`, `4173` and `8080`).
   - Production: download `linkvault-extension-v*.zip` from
     [GitHub Releases](https://github.com/Isaacpyo/LinkVault/releases/latest) and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select `apps/extension/dist`
   (or the unzipped folder).
3. In the web app go to **Settings → Connect extension**, or sign in from the popup. Click the toolbar icon on any page.

The API and web app URLs can be changed later on the extension's options page.

## Tests and quality checks

```bash
npm run lint           # ESLint (typescript-eslint, type-aware promise rules, react-hooks)
npm run format:check   # Prettier
npm run typecheck      # strict TypeScript in every workspace
npm test               # Vitest: shared, API, web, extension
npm run test:e2e       # Playwright (builds and starts API, web app and a fixture site)

# Also run the store contract suite against a real OpenSearch:
OPENSEARCH_TEST_URL=http://localhost:9200 npm test -w @linkvault/api
# Run e2e against OpenSearch instead of the in-memory store:
E2E_OPENSEARCH_URL=http://localhost:9200 npm run test:e2e
```

What is covered:

- **API**: URL normalization, tag parsing, the SSRF guard (private ranges, IPv4-mapped IPv6, decimal/hex IP tricks,
  redirect re-validation), the fetcher (redirects, size cap, content types, timeouts) against a local server,
  Readability extraction and sanitization, charset sniffing, query building, highlight parsing, the in-memory search
  engine, the store contract (both backends), and every route through `fastify.inject` — auth, demo sandboxes,
  idempotent saves, ingest success/failure/retry, tenant isolation, validation, CORS.
- **Web**: API client retry/wake logic, highlight rendering (including HTML in page text), tag input, bookmark card
  states, demo login and form errors.
- **Extension**: manifest permissions, settings storage, the connect-message trust check, API retries, and the popup's
  one-click save → edit flow with a mocked `chrome.*`.
- **E2E**: demo login → full-text search with highlights → AND-ed tag facets → saving a real page (fetched from a
  fixture server, extracted, indexed, searchable) → read later → reader and reading list **offline** → collections
  on a 375 px viewport with no horizontal scroll.

CI (`.github/workflows/ci.yml`) runs lint, format, typecheck, unit tests with an OpenSearch service container, build,
the extension zip (as an artifact) and the Playwright suite against OpenSearch on every push and pull request.

## Deploy

All free tiers. The Netlify site and DNS already exist; only the API and the search cluster need creating.

1. **OpenSearch on Bonsai** — create a free cluster at [bonsai.io](https://bonsai.io) (choose OpenSearch, a region near
   Frankfurt if available). Copy the full access URL (`https://user:password@xxxx.bonsaisearch.net`). The API creates
   its indices on first boot.
2. **API on Render** — Dashboard → **New → Blueprint** → pick this repository. `render.yaml` creates the
   `linkvault-api` free Docker web service with a generated `JWT_SECRET`. Set `OPENSEARCH_URL` when prompted. After the
   first deploy, check `https://<service>.onrender.com/health` shows `"backend":"opensearch"`. If Render assigns a URL
   other than `https://linkvault-api.onrender.com`, use yours in the next steps.
3. **Web app on Netlify** — the existing site builds from `netlify.toml` (root install, `npm run build -w
@linkvault/web`, publishes `apps/web/dist`). Set `VITE_API_URL` to the Render URL and redeploy.
4. **Extension** — merging to `main` runs `release-extension.yml`, which publishes `extension-v0.1.0` with the zip. If
   the API or web URLs differ from the defaults, set repository variables `EXTENSION_API_URL` / `EXTENSION_WEB_URL` and
   re-run the workflow.

Render's free instances sleep after ~15 minutes without traffic and take up to a minute to wake; the web app pings
`/health` on load so the server starts waking while you read the login page.

## Environment variables

Every variable is documented in [`.env.example`](.env.example). The ones that matter in production:

| Variable                         | Where           | Purpose                                                                                           |
| -------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `OPENSEARCH_URL`                 | Render          | OpenSearch URL with credentials. Without it the API falls back to the in-memory store.            |
| `JWT_SECRET`                     | Render          | ≥ 32 characters; generated by the blueprint. Required when `NODE_ENV=production`.                 |
| `CORS_ORIGINS`                   | Render          | Allowed web origins (comma-separated). Extension origins are allowed separately.                  |
| `TRUST_PROXY`                    | Render          | `true` behind Render's proxy so rate limits see real client IPs.                                  |
| `OPENSEARCH_INDEX_PREFIX`        | Render          | Index name prefix (default `linkvault`).                                                          |
| `DEMO_ENABLED`, `DEMO_TTL_HOURS` | Render          | Demo sandboxes on/off and their lifetime (default 24 h).                                          |
| `VITE_API_URL`                   | Netlify (build) | API base URL baked into the web app.                                                              |
| `VITE_API_URL`, `VITE_WEB_URL`   | Extension build | Defaults baked into the extension (repo variables `EXTENSION_API_URL`/`EXTENSION_WEB_URL` in CI). |
| `ALLOW_PRIVATE_FETCH`            | dev/e2e only    | Disables the SSRF guard so local fixture pages can be fetched. **Never** set in production.       |

## API

All routes except `/health` and `/auth/{register,login,demo}` need `Authorization: Bearer <token>`. Errors use one
envelope: `{ "error": { "code", "message", "details?" } }`.

| Method           | Path                            | Description                                                                                                                                                                                  |
| ---------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET              | `/health`                       | Status, backend (`opensearch`/`memory`), persistence, version.                                                                                                                               |
| POST             | `/auth/register`, `/auth/login` | Email + password → `{ token, user }`.                                                                                                                                                        |
| POST             | `/auth/demo`                    | Creates a seeded sandbox that expires after 24 h.                                                                                                                                            |
| GET              | `/auth/me`                      | Current user.                                                                                                                                                                                |
| GET              | `/library/summary`              | Totals, read-later/unsorted/pending counts, tag cloud.                                                                                                                                       |
| GET              | `/bookmarks`                    | Search: `q`, `tags` (repeat or comma list, AND), `collectionId` (`none` = unsorted), `readLater`, `status`, `sort`, `page`, `pageSize`. Returns hits with highlight segments and tag facets. |
| POST             | `/bookmarks`                    | Save `{ url, title?, tags?, collectionId?, readLater?, html? }` — 201 new, 200 merged into existing.                                                                                         |
| GET              | `/bookmarks/lookup?url=`        | Is this URL already saved?                                                                                                                                                                   |
| GET/PATCH/DELETE | `/bookmarks/:id`                | Read, update (`title`, `tags`, `collectionId`, `readLater`) or delete.                                                                                                                       |
| GET              | `/bookmarks/:id/content`        | Sanitized reader HTML (also the offline cache key).                                                                                                                                          |
| POST             | `/bookmarks/:id/refetch`        | Re-run extraction.                                                                                                                                                                           |
| GET/POST         | `/collections`                  | List (with counts) / create.                                                                                                                                                                 |
| PATCH/DELETE     | `/collections/:id`              | Rename/recolour / delete (bookmarks move to Unsorted).                                                                                                                                       |

## Security notes

- **SSRF**: only http(s) on ports 80/443; internal hostnames and private, loopback, link-local, CGNAT, multicast and
  reserved ranges (including IPv4-mapped IPv6) are refused. The check runs inside the socket's DNS lookup, so the
  address that is validated is the address that is connected to (no DNS-rebinding window); redirects are followed
  manually and each hop re-validated; 10 s timeout and 5 MB cap.
- **Untrusted HTML**: jsdom never executes page scripts or loads subresources; reader HTML is sanitized with DOMPurify
  on the server and again in the browser; search highlights never carry HTML; the Netlify and nginx configs send a
  strict Content-Security-Policy (`script-src 'self'`, `style-src 'self'`, `frame-ancestors 'none'`).
- **Auth**: bcrypt password hashes, constant-time-ish login (a dummy hash is compared for unknown emails), HS256 JWTs
  with issuer/audience checks, per-route rate limits (login 10/min, register and demo 5/min per IP).
- **Tenant isolation** lives in the store layer and is covered by tests for both backends.
- **Extension**: `activeTab` instead of host permissions; the content script runs only on the web app origin and the
  background worker checks both the sender's extension id and origin before accepting a session; capturing page HTML
  is opt-in.

## Trade-offs and known limitations

- **Session tokens in `localStorage`.** The web app and API are on different sites, where cookies would be third-party
  and blocked; bearer tokens avoid that at the cost of exposure to injected script, mitigated by the CSP and
  sanitization above. Tokens are stateless and cannot be revoked before expiry (7 days; demo tokens expire with their
  sandbox).
- **In-process ingest queue.** A crash loses in-flight work until the next boot re-queues `pending` bookmarks. Upstash
  Redis + BullMQ is the natural upgrade.
- **OpenSearch as the only datastore.** No transactions or relational constraints; fine for single-owner documents,
  but billing/teams features would justify Postgres as the system of record with OpenSearch as a derived index.
- **Free-tier limits.** Bonsai's free plan caps storage, so extracted text is truncated at 50,000 characters and reader
  HTML at 100,000; Render's free instance sleeps; rate limits are per instance.
- **Extension distribution** is "load unpacked" from a GitHub Release; a Chrome Web Store listing would add review and
  auto-updates.
