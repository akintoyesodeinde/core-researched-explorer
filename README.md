# CORE Research Explorer

Responsive Angular application for searching scientific publications via CORE API v3, exploring paper metadata, and visualizing publication-year distributions across retrieved results.

Live requests flow through a lightweight Node.js backend-for-frontend (BFF) proxy so the CORE API key remains strictly server-side and is never exposed in browser bundles.

## Features

- **Boolean Research Search:** Supports Boolean keyword expressions (e.g., `drone AND (package OR delivery)`), quoted phrases, and fielded queries with client- and server-side validation.
- **Configurable Retrieval Count & Bounded Pagination:** Users can retrieve `10`, `20`, or `50` papers per page and navigate across bounded result pages (up to offset `1000`), with automatic request cancellation (`switchMap`) to prevent stale overwrites.
- **Research Paper Cards:** Displays mapped title, authors, publication year, publisher, expandable/collapsible abstracts, and validated external links (`View source`, `Download`, `DOI`) with safe `rel="noopener noreferrer"` attributes. Missing metadata is omitted cleanly.
- **Publication-Year Analytics:** Lazy-loaded Apache ECharts SVG bar chart aggregating publication years across the retrieved set, clearly labeled for retrieved-set scope and excluded missing/invalid years, with year range and DOI coverage summaries.
- **Interactive Cross-Filtering & Sorting:** Click any chart bar or open the accessible data table to filter papers by publication year, and sort retrieved papers by relevance, newest first, or oldest first.
- **Shareable Search URLs:** Synchronizes active search query, limit, and offset to URL query parameters (`?q=...&limit=...&offset=...`) for direct linking and reload restoration.
- **Resilient Error Handling:** Distinguishes `401/403` auth errors, `429` rate limits (including `Retry-After` guidance), `503` missing server credentials, `504`/client timeouts, and network failures with clear retry paths.

## Project Structure

```text
core-research-explorer/
├── src/app/
│   ├── core/
│   │   ├── api/            # Typed CORE API client and defensive response mapper
│   │   └── models/         # Internal ResearchPaper & configuration interfaces
│   ├── features/
│   │   ├── analytics/      # Lazy-loaded Apache ECharts publication-year chart
│   │   └── research-search/# Signal-based ResearchStore with RxJS cancellation
│   └── shared/utils/       # Boolean query validation & pure year aggregation
├── server/
│   ├── core-proxy.mjs      # Server-side CORE API v3 proxy (/api/core/works, /health)
│   ├── core-proxy.spec.mjs # Node test runner suite for proxy validation & errors
│   └── dev.mjs             # Concurrent local launcher for proxy + Angular dev server
├── e2e/                    # Playwright end-to-end specifications
└── proxy.conf.json         # Angular dev proxy forwarding /api/core -> 127.0.0.1:3000
```

## Prerequisites

- Node.js 22+ (verified on Node.js 24)
- npm
- A CORE API v3 key from <https://core.ac.uk/services/api>

## Setup & Configuration

```bash
cd core-research-explorer
npm install
```

Copy `.env.example` to an untracked `.env` file inside `core-research-explorer/` and set your CORE API key:

```env
CORE_API_KEY=your_core_api_key_here
CORE_PORT=3000
CORE_REQUEST_TIMEOUT_MS=10000
```

`.env` is excluded by `.gitignore`. Never commit API keys or embed them in Angular source or environment files.

## Running Locally

From `core-research-explorer/`:

```bash
npm start
```

Open <http://127.0.0.1:4200/>. The proxy health check is available at <http://127.0.0.1:3000/health> and reports `{ "status": "ok", "coreConfigured": true | false }` without revealing the key.

To start processes separately:

```bash
npm run start:server
npm run start:client
```

## Verification, Testing & Build

Run from `core-research-explorer/`:

```bash
npm run lint        # ESLint + Angular template accessibility checks
npm run test:all    # Angular Vitest unit/component tests + Node proxy server tests
npm run test:e2e    # Playwright E2E suite (intercepted responses; no live quota consumed)
npm run build       # Strict production bundle build
```

## Production Deployment

Serve the built Angular assets (`dist/core-research-explorer/browser`) and `server/core-proxy.mjs` behind the same HTTPS public origin, routing `/api/core/*` and `/health` to the Node proxy and injecting `CORE_API_KEY` via your hosting provider's secret manager.

## Known Limitations

- Live search availability depends on a valid server-side CORE API key, upstream quota, and CORE service uptime.
- Requests are bounded to `50` papers per page and maximum offset `1000` to keep payloads responsive and protect upstream rate limits.
- Publication-year charts and summary metrics represent the currently retrieved result set rather than aggregate statistics across the entire CORE corpus.
