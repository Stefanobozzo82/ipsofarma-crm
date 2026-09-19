const { test } = require('node:test');
const assert = require('node:assert/strict');
const { corsForRequest } = require('../supabase/functions/_shared/cors.ts');
const origins = 'https://crm.example.test, http://localhost:8080';
const request = origin => new Request('https://edge.example.test', {
  headers: origin === undefined ? {} : { Origin: origin },
});

test('CORS accepts exact configured development and production origins', () => {
  for (const origin of ['https://crm.example.test', 'http://localhost:8080']) {
    const result = corsForRequest(request(origin), origins);
    assert.equal(result.allowed, true);
    assert.equal(result.headers['Access-Control-Allow-Origin'], origin);
    assert.equal(result.headers.Vary, 'Origin');
    assert.match(result.headers['Access-Control-Allow-Headers'], /x-client-info/);
  }
});
test('CORS rejects lookalike hosts, different ports, opaque and arbitrary origins', () => {
  for (const origin of ['https://crm.example.test.evil.test', 'https://evil.test',
    'http://localhost:8081', 'http://crm.example.test', 'null']) {
    const result = corsForRequest(request(origin), origins);
    assert.equal(result.allowed, false);
    assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  }
});
test('missing configuration fails closed for browser calls', () => {
  assert.equal(corsForRequest(request('https://crm.example.test'), '').allowed, false);
});
test('wildcard, URLs with paths and credentials cannot broaden access', () => {
  for (const config of ['*', 'https://crm.example.test/path', 'https://user@crm.example.test', 'null']) {
    assert.equal(corsForRequest(request('https://crm.example.test'), config).allowed, false);
  }
});
test('server requests without Origin proceed to normal authentication without ACAO', () => {
  const result = corsForRequest(request(), '');
  assert.equal(result.allowed, true);
  assert.deepEqual(result.headers, { Vary: 'Origin' });
});
test('headers are isolated per request (no cross-origin state leakage)', () => {
  corsForRequest(request('https://crm.example.test'), origins);
  assert.equal(corsForRequest(request('https://evil.test'), origins).headers['Access-Control-Allow-Origin'], undefined);
});
