import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createD1Store } from '../worker/store.js';
import { createHandler } from '../worker/index.js';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_normal_makkari.sql', import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const db = {
    prepare(sql) {
      const statement = { sql, args: [], bind(...args) { this.args = args; return this; },
        async first() { return sqlite.prepare(sql).get(...this.args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...this.args) }; }
      }; return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(s => ({ results: sqlite.prepare(s.sql).all(...s.args), success: true }));
        sqlite.exec('COMMIT'); return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  return { db, sqlite, store: createD1Store(db) };
}
test('hosted catalog seeds once, persists stock, ignores submitted prices and retries safely', async t => {
  const { store } = fixture(t);
  assert.equal((await store.list()).length, 4);
  const body = { items: [{ id: 1, quantity: 2, price: 1 }] }, key = crypto.randomUUID();
  const first = await store.checkout(body, key);
  assert.equal(first.total, 5000000);
  assert.equal((await store.list())[0].stock, 10);
  assert.equal((await store.checkout(body, key)).id, first.id);
  await assert.rejects(store.checkout({ items: [{ id: 1, quantity: 3 }] }, key), { status: 409 });
});
test('concurrent hosted purchases cannot oversell and failed batches leave no partial order', async t => {
  const { store, sqlite } = fixture(t);
  await store.list();
  const results = await Promise.allSettled([1, 2].map(() => store.checkout({ items: [{ id: 4, quantity: 6 }] }, crypto.randomUUID())));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal((await store.list())[3].stock, 2);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM orders').get().n, 1);
});
test('concurrent identical hosted requests commit once', async t => {
  const { store, sqlite } = fixture(t); await store.list();
  const key = crypto.randomUUID(), body = { items: [{ id: 2, quantity: 1 }] };
  const results = await Promise.all([store.checkout(body, key), store.checkout(body, key)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM orders').get().n, 1);
  assert.equal((await store.list())[1].stock, 19);
});
test('Worker routes serve catalog and reject cross-origin, malformed and oversized orders', async t => {
  const { db } = fixture(t), handler = createHandler({ '/': { body: '<h1>Colmena</h1>', type: 'text/html' } });
  const call = (path, options) => handler(new Request('https://market.test' + path, options), { DB: db });
  assert.equal((await call('/')).status, 200);
  assert.equal((await call('/api/health')).status, 200);
  assert.equal((await (await call('/api/products')).json()).products.length, 4);
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ items: [{ id: 3, quantity: 1 }] }) };
  assert.equal((await call('/api/orders', options)).status, 201);
  assert.equal((await call('/api/orders', options)).status, 200);
  assert.equal((await call('/api/orders', { ...options, headers: { ...options.headers, Origin: 'https://other.test' } })).status, 403);
  assert.equal((await call('/api/orders', { ...options, body: '{' })).status, 400);
  assert.equal((await call('/api/orders', { ...options, body: 'a'.repeat(17000) })).status, 413);
  assert.equal((await call('/server/store.js')).status, 404);
});
