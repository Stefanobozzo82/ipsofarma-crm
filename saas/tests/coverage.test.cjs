const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/app/cascade.js'), 'utf8'), context);
const cascade = context.window.SaasCascade;
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(customerRows, supplierOrders, links = { ofIds: ['OF-1'] }) {
  let orders = clone(supplierOrders);
  let sequence = 1;
  const writes = [];
  const customer = { id: 'customer-id', num: 'OC-1', righe: clone(customerRows), ...links };
  const store = {
    async loadCollection(type, companyId) {
      assert.equal(type, 'ordiniFornitore');
      assert.equal(companyId, 'company-id');
      return clone(orders);
    },
    async searchProdotti(companyId, cod) {
      assert.equal(companyId, 'company-id');
      return [{ cod, fornitoreId: 'supplier-id', listinoAcq: 7, iva: 22 }];
    },
    async nextNumber() { return `NEW-${sequence++}`; },
    async saveDoc(type, doc, companyId) {
      assert.equal(companyId, 'company-id');
      const saved = clone(doc);
      writes.push({ type, doc: saved });
      if (type === 'ordiniFornitore') {
        orders = orders.filter(order => order.num !== saved.num).concat(saved);
      }
      return saved;
    },
  };
  return { customer, store, writes };
}

const row = (qty, cod = 'A') => ({ cod, qty, descr: `Product ${cod}`, prezzo: 10 });
const supplier = (qty, num = 'OF-1', cod = 'A') => ({
  id: `id-${num}`, num, fornitoreId: 'supplier-id', righe: [row(qty, cod)],
});

for (const [label, covered, expected] of [
  ['zero', 0, 100], ['partial', 20, 80], ['complete', 100, 0], ['excessive', 120, 0],
]) {
  test(`${label} supplier coverage generates only the outstanding quantity`, async () => {
    const f = fixture([row(100)], [supplier(covered)]);
    const before = clone(f.customer);
    const state = await cascade.statoOrdineFornitore(f.store, 'company-id', f.customer);
    assert.equal(state.done, expected === 0);
    const result = await cascade.generaOrdiniFornitore(f.store, 'company-id', f.customer);
    if (expected) {
      assert.equal(result.updated.length, 1);
      assert.equal(result.updated[0].righe[1].qty, expected);
      const retry = await cascade.generaOrdiniFornitore(f.store, 'company-id', result.ordine);
      assert.equal(retry.updated.length, 0);
      assert.equal(retry.created.length, 0);
    } else {
      assert.equal(f.writes.length, 0);
    }
    assert.deepEqual(f.customer, before, 'coverage must not mutate the customer order');
  });
}

test('multiple linked supplier orders contribute once, unlinked orders contribute nothing', async () => {
  const f = fixture([row(100)], [supplier(20), supplier(30, 'OF-2'), supplier(1000, 'OTHER')],
    { ofIds: ['OF-1', 'OF-1', 'OF-2'] });
  const result = await cascade.generaOrdiniFornitore(f.store, 'company-id', f.customer);
  assert.equal(result.updated[0].righe[1].qty, 50);
});

test('duplicate customer and supplier rows allocate coverage once in customer row order', async () => {
  const of = supplier(5);
  of.righe.push(row(3));
  const f = fixture([{ ...row(6), descr: 'first' }, { ...row(6), descr: 'second' }], [of]);
  const result = await cascade.generaOrdiniFornitore(f.store, 'company-id', f.customer);
  assert.equal(result.updated[0].righe.length, 3);
  assert.equal(result.updated[0].righe[2].qty, 4);
  assert.equal(result.updated[0].righe[2].descr, 'second');
  assert.equal((await cascade.statoOrdineFornitore(f.store, 'company-id', result.ordine)).done, true);
});

test('legacy singular ofId remains a document number and stale links cannot mark coverage complete', async () => {
  const f = fixture([row(10)], [supplier(3)], { ofId: 'OF-1' });
  const result = await cascade.generaOrdiniFornitore(f.store, 'company-id', f.customer);
  assert.equal(result.updated[0].righe[1].qty, 7);
  assert.deepEqual(clone(result.ordine.ofIds), ['OF-1']);
  const stale = fixture([row(10)], [], { ofId: 'DELETED' });
  assert.equal((await cascade.statoOrdineFornitore(stale.store, 'company-id', stale.customer)).done, false);
  const created = await cascade.generaOrdiniFornitore(stale.store, 'company-id', stale.customer);
  assert.equal(created.created[0].righe[0].qty, 10);
});

test('coverage is isolated per code and delivered customer quantity does not replace purchasing coverage', async () => {
  const f = fixture([{ ...row(10), qtyEv: 10 }, row(5, 'B')], [supplier(100, 'OF-1', 'B')]);
  const result = await cascade.generaOrdiniFornitore(f.store, 'company-id', f.customer);
  assert.equal(result.updated[0].righe[1].cod, 'A');
  assert.equal(result.updated[0].righe[1].qty, 10);
});

test('numeric legacy quantities work and nonpositive or invalid coverage does not hide missing stock', async () => {
  const of = supplier('2.5');
  of.righe.push(row(-10), row('invalid'), row(0));
  const f = fixture([row('10.5'), row(0), row(-1)], [of]);
  const result = await cascade.generaOrdiniFornitore(f.store, 'company-id', f.customer);
  assert.equal(result.updated[0].righe.at(-1).qty, 8);
});

test('new supplier orders preserve duplicated rows and a second invocation is a no-op', async () => {
  const f = fixture([row(4), row(6)], [], {});
  const result = await cascade.generaOrdiniFornitore(f.store, 'company-id', f.customer);
  assert.deepEqual(clone(result.created[0].righe.map(r => r.qty)), [4, 6]);
  assert.equal(result.created[0].ocId, 'OC-1', 'retain the existing historical link convention');
  const retry = await cascade.generaOrdiniFornitore(f.store, 'company-id', result.ordine);
  assert.equal(retry.created.length, 0);
  assert.equal(retry.updated.length, 0);
});

test('fractional coverage creates no rounding-only residual and preserves small real quantities', async () => {
  const f = fixture([row(0.1), row(0.2)], [supplier(0.3)]);
  assert.equal((await cascade.statoOrdineFornitore(f.store, 'company-id', f.customer)).done, true);
  await cascade.generaOrdiniFornitore(f.store, 'company-id', f.customer);
  assert.equal(f.writes.length, 0);
  const tiny = fixture([row(1e-12)], [supplier(0)]);
  const result = await cascade.generaOrdiniFornitore(tiny.store, 'company-id', tiny.customer);
  assert.equal(result.updated[0].righe[1].qty, 1e-12);
});
