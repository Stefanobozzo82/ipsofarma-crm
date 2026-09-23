const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(error = null) {
  const calls = [];
  const rows = [{ id: 'movement', prodotti: { cod: 'A', descr: 'Product' }, depositi: { nome: 'Main' } }];
  const query = {
    select(value) { calls.push(['select', value]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    order(column, options) { calls.push(['order', column, options.ascending]); return this; },
    async limit(value) { calls.push(['limit', value]); return { data: rows, error }; },
  };
  const window = { supabase: { createClient: () => ({
    from(table) { calls.push(['from', table]); return query; },
  }) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/app/store.js'), 'utf8'), { window });
  return { store: window.SaasStore, calls, rows };
}

test('recent movements disambiguate both relationships and preserve tenant, ordering and response shape', async () => {
  const f = fixture();
  const result = await f.store.listMovimentiRecenti('company-a', 7);
  assert.equal(result, f.rows);
  assert.equal(result[0].prodotti.cod, 'A');
  assert.equal(result[0].depositi.nome, 'Main');
  assert.deepEqual(f.calls, [
    ['from', 'movimenti_magazzino'],
    ['select', '*, prodotti!movimenti_magazzino_prodotto_id_fkey(cod, descr), depositi!movimenti_magazzino_deposito_id_fkey(nome)'],
    ['eq', 'company_id', 'company-a'],
    ['order', 'created_at', false],
    ['limit', 7],
  ]);
});

test('recent movements keep the default limit and propagate query failures', async () => {
  const error = new Error('query unavailable');
  const f = fixture(error);
  await assert.rejects(f.store.listMovimentiRecenti('company-b'), error);
  assert.deepEqual(f.calls.at(-1), ['limit', 20]);
});
