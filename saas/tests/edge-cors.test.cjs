const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { corsForRequest } = require('../supabase/functions/_shared/cors.ts');

for (const endpoint of ['ai-proxy', 'stripe-checkout']) {
  test(`${endpoint}: real handler rejects unwanted origins before auth/provider work`, async () => {
    let handler;
    const source = fs.readFileSync(path.join(__dirname, `../supabase/functions/${endpoint}/index.ts`), 'utf8')
      .replace(/^import .*;\r?\n/gm, '');
    vm.runInNewContext(stripTypeScriptTypes(source), {
      Request, Response, URLSearchParams,
      corsForRequest: req => corsForRequest(req, 'https://crm.example.test'),
      createClient: () => assert.fail('preflight/rejected requests must not access Supabase'),
      fetch: () => assert.fail('preflight/rejected requests must not reach provider'),
      Deno: { serve: callback => { handler = callback; } },
    });
    for (const method of ['OPTIONS', 'POST']) {
      const response = await handler(new Request('https://edge.example.test', {
        method, headers: { Origin: 'https://evil.test' },
      }));
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    }
    const preflight = await handler(new Request('https://edge.example.test', {
      method: 'OPTIONS', headers: { Origin: 'https://crm.example.test' },
    }));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://crm.example.test');
    const unauthenticated = await handler(new Request('https://edge.example.test', {
      method: 'POST', headers: { Origin: 'https://crm.example.test' },
    }));
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get('Access-Control-Allow-Origin'), 'https://crm.example.test');
  });
}
