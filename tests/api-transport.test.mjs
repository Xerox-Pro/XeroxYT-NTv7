import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch } from '../src/lib/apiTransport.mjs';

test('auto transport retries a failed config and falls back when a peer serves HTML', async t => {
  const calls = [];
  let configRequests = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(url);
    if (url === '/api/transport-config') {
      configRequests++;
      if (configRequests === 1) return new Response(null, { status: 503 });
      return Response.json({ origins: ['https://bad.example', 'https://live.example'] });
    }
    if (url.startsWith('https://bad.example')) {
      return new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
    }
    return Response.json({ source: url });
  });

  const path = '/api/search?q=music';
  assert.equal((await (await apiFetch(path)).json()).source, path);
  assert.equal((await (await apiFetch(path)).json()).source, 'https://live.example' + path);
  assert.deepEqual(calls, [
    '/api/transport-config', path, '/api/transport-config',
    'https://bad.example' + path, 'https://live.example' + path,
  ]);
});
