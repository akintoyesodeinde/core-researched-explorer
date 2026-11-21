# CORE Research Explorer

Angular research discovery application backed by CORE API v3. Live requests pass through a small
server-side proxy so the CORE API key is never included in browser code.

## Prerequisites

- Node.js 22+ (verified on Node.js 24)
- npm
- A CORE API v3 key obtained from <https://core.ac.uk/services/api>

## Configure live CORE search

Copy `.env.example` to an untracked `.env` file and assign your actual CORE API key to `CORE_API_KEY`.
`.env` is ignored by Git. Do not put the key in Angular environment files, frontend source, or a
committed configuration file.

## Run locally

Install dependencies, then start the Angular client and CORE proxy together:

```bash
npm install
npm start
```

Open <http://127.0.0.1:4200/>. The client sends requests to `/api/core/works`; the Angular development
proxy forwards those requests to the local server on port `3000`. The server adds the CORE bearer
token and calls `https://api.core.ac.uk/v3/search/works`.

To run the processes separately:

```bash
npm run start:server
npm run start:client
```

The server health endpoint is available at <http://127.0.0.1:3000/health>. It reports whether a key
is configured without revealing the key.

## Implemented features

- Boolean search form with client- and server-side validation (parentheses, quoted phrases, operators, max length)
- Configurable result count (`10`, `20`, `50`) with automatic refresh on change after an active search
- Bounded pagination (`offset` `0..1000`) with RxJS `switchMap` request cancellation
- Responsive paper cards with expandable/collapsible abstracts and validated HTTP(S) external links
- Interactive lazy-loaded Apache ECharts publication-year distribution chart with retrieved-set scope labeling, year range, DOI coverage, and accessible toggleable data table
- Click-to-filter by publication year, client-side sorting (`Relevance`, `Newest first`, `Oldest first`), and shareable search URLs (`?q=...&limit=...&offset=...`)
- Explicit loading, empty, and error states including `Retry-After` rate-limit guidance and timeout recovery

## Checks

```bash
npm run lint
npm run test:all
npm run test:e2e
npm run build
```

Automated tests intercept HTTP calls with test-owned responses. The running application has no
local or fallback data feed, and tests do not consume the live CORE quota.

## Production deployment

Deploy the Angular build and the server proxy behind the same public origin, route `/api/core/*` to
the proxy, and configure `CORE_API_KEY` in the hosting platform's secret manager. Enforce HTTPS. The
local development proxy is not a production reverse proxy.

## Known limitations

- A successful authenticated CORE response depends on a valid account, key, quota, and current
  upstream availability.
- The application requests at most `50` records per page with bounded pagination up to offset `1000`.
- Publication-year analytics represent the retrieved result set only, not database-wide counts across all CORE matches.
