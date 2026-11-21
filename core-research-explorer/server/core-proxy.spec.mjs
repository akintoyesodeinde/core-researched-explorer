import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createCoreProxyServer } from './core-proxy.mjs';

const openServers = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function startServer(options) {
  const server = createCoreProxyServer(options);
  openServers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

describe('CORE proxy', () => {
  it('reports health status without exposing the API key', async () => {
    const unconfiguredUrl = await startServer({ apiKey: '   ' });
    const unconfiguredResponse = await fetch(`${unconfiguredUrl}/health`);
    assert.equal(unconfiguredResponse.status, 200);
    assert.deepEqual(await unconfiguredResponse.json(), {
      status: 'ok',
      coreConfigured: false,
    });

    const configuredUrl = await startServer({ apiKey: 'secret-key' });
    const configuredResponse = await fetch(`${configuredUrl}/health`);
    const bodyText = await configuredResponse.text();
    assert.equal(configuredResponse.status, 200);
    assert.deepEqual(JSON.parse(bodyText), {
      status: 'ok',
      coreConfigured: true,
    });
    assert.equal(bodyText.includes('secret-key'), false);
  });

  it('fails safely when the API key is missing or whitespace', async () => {
    const baseUrl = await startServer({ apiKey: '   ' });
    const response = await fetch(`${baseUrl}/api/core/works?q=drone&limit=10&offset=0`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.code, 'CORE_API_KEY_MISSING');
  });

  it('forwards validated parameters, bounded offset, and server-side authorization', async () => {
    let receivedUrl;
    let receivedAuthorization;
    const baseUrl = await startServer({
      apiKey: '  test-key  ',
      fetchImpl: async (url, options) => {
        receivedUrl = new URL(url);
        receivedAuthorization = options.headers.authorization;
        return new Response(JSON.stringify({ totalHits: 100, results: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const query = 'drone AND (package OR delivery)';
    const response = await fetch(
      `${baseUrl}/api/core/works?q=${encodeURIComponent(query)}&limit=20&offset=40`,
    );

    assert.equal(response.status, 200);
    assert.equal(receivedUrl.searchParams.get('q'), query);
    assert.equal(receivedUrl.searchParams.get('limit'), '20');
    assert.equal(receivedUrl.searchParams.get('offset'), '40');
    assert.equal(receivedAuthorization, 'Bearer test-key');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  });

  it('rejects out-of-range result limits and offsets before contacting CORE', async () => {
    let fetchCalled = false;
    const baseUrl = await startServer({
      apiKey: 'test-key',
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response('{}');
      },
    });

    const invalidLimit = await fetch(`${baseUrl}/api/core/works?q=drone&limit=51&offset=0`);
    const zeroLimit = await fetch(`${baseUrl}/api/core/works?q=drone&limit=0&offset=0`);
    const oversizedOffset = await fetch(`${baseUrl}/api/core/works?q=drone&limit=10&offset=1001`);
    const negativeOffset = await fetch(`${baseUrl}/api/core/works?q=drone&limit=10&offset=-5`);
    const emptyQuery = await fetch(`${baseUrl}/api/core/works?q=%20%20&limit=10&offset=0`);
    const longQuery = await fetch(
      `${baseUrl}/api/core/works?q=${'a'.repeat(501)}&limit=10&offset=0`,
    );

    assert.equal(invalidLimit.status, 400);
    assert.equal(zeroLimit.status, 400);
    assert.equal(oversizedOffset.status, 400);
    assert.equal(negativeOffset.status, 400);
    assert.equal(emptyQuery.status, 400);
    assert.equal(longQuery.status, 400);
    assert.equal(fetchCalled, false);
  });

  it('returns 404 for unknown routes and 405 for unsupported methods', async () => {
    const baseUrl = await startServer({ apiKey: 'test-key' });

    const notFound = await fetch(`${baseUrl}/api/unknown`);
    const methodNotAllowed = await fetch(`${baseUrl}/api/core/works?q=drone`, { method: 'POST' });

    assert.equal(notFound.status, 404);
    assert.equal(methodNotAllowed.status, 405);
    assert.equal(methodNotAllowed.headers.get('allow'), 'GET');
  });

  it('preserves Retry-After headers on 429 and normalizes non-JSON upstream errors', async () => {
    const baseUrl = await startServer({
      apiKey: 'test-key',
      fetchImpl: async () =>
        new Response('<html><body>Too Many Requests</body></html>', {
          status: 429,
          headers: {
            'content-type': 'text/html',
            'retry-after': '45',
          },
        }),
    });

    const response = await fetch(`${baseUrl}/api/core/works?q=drone&limit=10&offset=0`);
    const body = await response.json();

    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '45');
    assert.match(body.error, /unexpected non-JSON/i);
  });

  it('maps upstream timeouts to 504 and network errors to 502', async () => {
    const timeoutUrl = await startServer({
      apiKey: 'test-key',
      fetchImpl: async () => {
        const timeoutError = new Error('timed out');
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      },
    });
    const timeoutResponse = await fetch(`${timeoutUrl}/api/core/works?q=drone`);
    assert.equal(timeoutResponse.status, 504);

    const networkUrl = await startServer({
      apiKey: 'test-key',
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const networkResponse = await fetch(`${networkUrl}/api/core/works?q=drone`);
    assert.equal(networkResponse.status, 502);
  });
});
