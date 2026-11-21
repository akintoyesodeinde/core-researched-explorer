import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const DEFAULT_CORE_URL = 'https://api.core.ac.uk/v3/search/works';
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_LIMIT = 50;
const MAX_OFFSET = 1000;
const MAX_QUERY_LENGTH = 500;

const BASE_SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    ...BASE_SECURITY_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function parseNonNegativeInteger(value, defaultValue) {
  if (value === null) return defaultValue;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isJsonContentType(contentType) {
  return typeof contentType === 'string' && contentType.toLowerCase().includes('json');
}

export function createCoreProxyServer({
  apiKey = process.env.CORE_API_KEY,
  coreUrl = process.env.CORE_API_URL ?? DEFAULT_CORE_URL,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = Number(process.env.CORE_REQUEST_TIMEOUT_MS ?? 10_000),
} = {}) {
  const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';

  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');

    if (requestUrl.pathname === '/health') {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'Method not allowed.' }, { allow: 'GET' });
        return;
      }
      sendJson(response, 200, {
        status: 'ok',
        coreConfigured: Boolean(normalizedApiKey),
      });
      return;
    }

    if (requestUrl.pathname !== '/api/core/works') {
      sendJson(response, 404, { error: 'Route not found.' });
      return;
    }

    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed.' }, { allow: 'GET' });
      return;
    }

    if (!normalizedApiKey) {
      sendJson(response, 503, {
        error: 'CORE live search is not configured on the server.',
        code: 'CORE_API_KEY_MISSING',
      });
      return;
    }

    const query = requestUrl.searchParams.get('q')?.trim() ?? '';
    const limit = parseNonNegativeInteger(requestUrl.searchParams.get('limit'), 10);
    const offset = parseNonNegativeInteger(requestUrl.searchParams.get('offset'), 0);

    if (!query || query.length > MAX_QUERY_LENGTH) {
      sendJson(response, 400, {
        error: `Query must contain between 1 and ${MAX_QUERY_LENGTH} characters.`,
      });
      return;
    }
    if (limit === null || limit < 1 || limit > MAX_LIMIT) {
      sendJson(response, 400, {
        error: `Limit must be an integer between 1 and ${MAX_LIMIT}.`,
      });
      return;
    }
    if (offset === null || offset < 0 || offset > MAX_OFFSET) {
      sendJson(response, 400, {
        error: `Offset must be an integer between 0 and ${MAX_OFFSET}.`,
      });
      return;
    }

    const upstreamUrl = new URL(coreUrl);
    upstreamUrl.searchParams.set('q', query);
    upstreamUrl.searchParams.set('offset', String(offset));
    upstreamUrl.searchParams.set('limit', String(limit));

    try {
      const upstreamResponse = await fetchImpl(upstreamUrl, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${normalizedApiKey}`,
        },
        signal: AbortSignal.timeout(
          Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : 10_000,
        ),
      });
      const body = await upstreamResponse.text();

      if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
        sendJson(response, 502, { error: 'CORE returned a response that was too large.' });
        return;
      }

      const retryAfter = upstreamResponse.headers.get('retry-after');
      const extraHeaders = retryAfter ? { 'retry-after': retryAfter } : {};
      const contentType = upstreamResponse.headers.get('content-type');

      if (!upstreamResponse.ok && contentType && !isJsonContentType(contentType)) {
        sendJson(
          response,
          upstreamResponse.status,
          { error: 'CORE returned an unexpected non-JSON error response.' },
          extraHeaders,
        );
        return;
      }

      response.writeHead(upstreamResponse.status, {
        ...BASE_SECURITY_HEADERS,
        'content-type': 'application/json; charset=utf-8',
        ...extraHeaders,
      });
      response.end(body || '{}');
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      sendJson(response, timedOut ? 504 : 502, {
        error: timedOut ? 'CORE did not respond in time.' : 'CORE could not be reached.',
      });
    }
  });
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  const port = Number(process.env.CORE_PORT ?? 3000);
  const server = createCoreProxyServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`CORE proxy listening on http://127.0.0.1:${port}`);
  });
}
