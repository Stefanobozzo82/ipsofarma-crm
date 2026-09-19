const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
globalThis.Deno = { env: { get: key => key === 'EDGE_ALLOWED_ORIGINS' ? 'https://app.example' : undefined } };
const { createEmailHandler } = require('../supabase/functions/send-email/handler.ts');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const body = { company_id: A, to: 'customer@example.com', subject: 'Ordine', html: '<p>Ordine</p>' };
function setup(options = {}) {
  const calls = [], queries = [];
  const handler = createEmailHandler({
    env: key => ({ RESEND_API_KEY: 'test-key', RESEND_FROM: 'sender@example.com', PLATFORM_NAME: 'CRM' })[key],
    client: () => ({
      auth: { getUser: async () => ({ data: { user: options.invalidSession ? null : { id: 'user' } }, error: null }) },
      from(table) { return { select() { return this; }, eq(column, id) { queries.push({ table, column, id }); this.id = id; return this; }, async maybeSingle() {
        if (options.databaseError) return { data: null, error: { message: 'offline' } };
        return { error: null, data: this.id !== A ? null : table === 'my_memberships' ? { company_id: A, role: options.role || 'admin' } : { nome: 'Azienda A', settings: { email: 'reply-a@example.com' } } };
      } }; },
    }),
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return new Response('{"id":"test"}', { status: 200 }); },
  });
  const request = (data = body, extra = {}) => handler(new Request('https://edge.example/send-email', {
    method: 'POST', headers: { Authorization: 'Bearer test', Origin: 'https://app.example', 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(data),
  }));
  return { handler, request, calls, queries };
}
test('email identity comes only from the authorized tenant; PDF payload preserved', async () => {
  const s = setup();
  const response = await s.request({ ...body, fromName: 'Impersonated', replyTo: 'evil@example.com', attachmentFilename: 'order.pdf', attachmentBase64: 'cGRm' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://app.example');
  assert.equal(s.calls[0].from, 'Azienda A (tramite CRM) <sender@example.com>');
  assert.equal(s.calls[0].reply_to, 'reply-a@example.com');
  assert.deepEqual(s.calls[0].attachments, [{ filename: 'order.pdf', content: 'cGRm' }]);
  assert.deepEqual(s.queries.map(q => q.id), [A, A]);
});
for (const [title, options, data, expected] of [
  ['cross tenant', {}, { ...body, company_id: B }, 403],
  ['viewer', { role: 'viewer' }, body, 403],
  ['unknown role', { role: 'owner' }, body, 403],
  ['expired session', { invalidSession: true }, body, 401],
  ['database failure', { databaseError: true }, body, 503],
  ['missing tenant', {}, { ...body, company_id: undefined }, 400],
  ['null body', {}, null, 400],
  ['non-string recipient', {}, { ...body, to: {} }, 400],
  ['header injection', {}, { ...body, subject: 'Order\r\nBcc: evil@example.com' }, 400],
]) test(`email refuses ${title} without contacting provider`, async () => {
  const s = setup(options); assert.equal((await s.request(data)).status, expected); assert.equal(s.calls.length, 0);
});
test('operator may send for own tenant', async () => {
  const s = setup({ role: 'operatore' }); assert.equal((await s.request()).status, 200); assert.equal(s.calls.length, 1);
});
test('disallowed origin and preflight never reach provider', async () => {
  const s = setup(); assert.equal((await s.request(body, { Origin: 'https://evil.example' })).status, 403);
  const response = await s.handler(new Request('https://edge.example/send-email', { method: 'OPTIONS', headers: { Origin: 'https://app.example' } }));
  assert.equal(response.status, 204); assert.equal(s.calls.length, 0); assert.equal(s.queries.length, 0);
});
test('actual store wrapper binds explicit tenant and refuses missing tenant', async () => {
  const sent = [];
  const window = { SUPABASE_URL: 'https://edge.example', supabase: { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) } }) } };
  const context = { window, fetch: async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}'); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/app/store.js'), 'utf8'), context);
  await assert.rejects(window.SaasStore.sendEmail(body), /companyId/);
  await window.SaasStore.sendEmail({ ...body, company_id: B }, A);
  assert.equal(sent.length, 1); assert.equal(sent[0].company_id, A);
});
