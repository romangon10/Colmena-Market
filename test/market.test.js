import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';

function fixture(t) { const store = createStore(); t.after(() => store.close()); return store; }

test('filters category, searches name and orders by price', t => {
  const store = fixture(t);
  assert.equal(store.list().length, 4);
  assert.deepEqual(store.list({ category: 'Ropa', sort: 'price-desc' }).map(x => x.id), [3, 2]);
  assert.equal(store.list({ q: 'CAMISA' })[0].id, 2);
  assert.equal(store.list({ q: "' OR 1=1 --" }).length, 0);
  assert.throws(() => store.list({ sort: 'price; DROP TABLE products' }), { status: 400 });
});
test('server prices override submitted prices; stock decreases', t => {
  const store = fixture(t);
  const order = store.checkout({ items: [{ id: 1, quantity: 2, price: 1 }], total: 1 }, randomUUID());
  assert.equal(order.total, 5000000);
  assert.equal(store.list()[0].stock, 10);
  assert.equal(order.items[0].quantity, 2);
});
test('replayed request returns same receipt and does not decrement twice', t => {
  const store = fixture(t), key = randomUUID(), body = { items: [{ id: 4, quantity: 1 }] };
  const a = store.checkout(body, key), b = store.checkout(body, key);
  assert.equal(a.id, b.id);
  assert.equal(b.replayed, true);
  assert.equal(store.list()[3].stock, 7);
  assert.throws(() => store.checkout({ items: [{ id: 4, quantity: 2 }] }, key), { status: 409 });
});
test('invalid and duplicate quantities rejected without stock changes', t => {
  const store = fixture(t);
  for (const items of [[], [{ id: 1, quantity: -1 }], [{ id: 1, quantity: 0.5 }], [{ id: 1, quantity: '2' }], [{ id: 1, quantity: 1 }, { id: 1, quantity: 1 }]]) {
    assert.throws(() => store.checkout({ items }, randomUUID()), { status: 400 });
  }
  assert.equal(store.list()[0].stock, 12);
});
test('insufficient stock rolls back the entire multi-product order', t => {
  const store = fixture(t);
  assert.throws(() => store.checkout({ items: [{ id: 1, quantity: 1 }, { id: 4, quantity: 9 }] }, randomUUID()), { status: 409 });
  assert.equal(store.list()[0].stock, 12);
  assert.equal(store.list()[3].stock, 8);
});
test('unknown products fail without consuming stock', t => {
  const store = fixture(t);
  assert.throws(() => store.checkout({ items: [{ id: 1, quantity: 1 }, { id: 999, quantity: 1 }] }, randomUUID()), { status: 404 });
  assert.equal(store.list()[0].stock, 12);
});
test('orders and stock survive database reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'colmena-'));
  const path = join(dir, 'market.sqlite');
  let store;
  try {
    store = createStore(path);
    const body = { items: [{ id: 2, quantity: 3 }] }, key = randomUUID();
    const order = store.checkout(body, key);
    store.close(); store = createStore(path);
    assert.equal(store.list()[1].stock, 17);
    assert.equal(store.checkout(body, key).id, order.id);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('HTTP API validates JSON, prevents cross-site orders and serves only public files', async t => {
  const store = fixture(t), app = createApp(store);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const response = await fetch(base + '/api/products');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).products.length, 4);
  for (const path of ['/server/store.js', '/data/market.sqlite', '/package.json']) assert.equal((await fetch(base + path)).status, 404);
  const malformed = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const blocked = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: '{}' });
  assert.equal(blocked.status, 403);
  const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() };
  const body = JSON.stringify({ items: [{ id: 1, quantity: 1 }] });
  assert.equal((await fetch(base + '/api/orders', { method: 'POST', headers, body })).status, 201);
  assert.equal((await fetch(base + '/api/orders', { method: 'POST', headers, body })).status, 200);
  const html = await fetch(base);
  assert.match(await html.text(), /script.js/);
  assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
