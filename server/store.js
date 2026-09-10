import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createStore(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
      description TEXT NOT NULL, price INTEGER NOT NULL CHECK(price > 0),
      stock INTEGER NOT NULL CHECK(stock >= 0)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL,
      payload TEXT NOT NULL, total INTEGER NOT NULL, created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id),
      name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), price INTEGER NOT NULL,
      PRIMARY KEY(order_id, product_id)
    ) STRICT;`);
  const seed = db.prepare('INSERT OR IGNORE INTO products VALUES (?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const p of [
      [1, 'Perfume Acqua', 'Perfumes', 'Una nota fresca para todos los días. Presentación de muestra.', 2500000, 12],
      [2, 'Camisa Blanca', 'Ropa', 'El básico que combina con todo. Talle único de demostración.', 1500000, 20],
      [3, 'Jeans Azul', 'Ropa', 'Denim clásico de corte recto. Talle único de demostración.', 3000000, 15],
      [4, 'Zapatillas Urban', 'Calzado', 'Líneas simples para la ciudad. Talle único de demostración.', 5000000, 8]
    ]) seed.run(...p);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }

  function list({ q = '', category = '', sort = 'featured' } = {}) {
    const ordering = { featured: 'id ASC', 'price-asc': 'price ASC, id ASC', 'price-desc': 'price DESC, id ASC' };
    if (!Object.hasOwn(ordering, sort)) throw new ApiError(400, 'Orden no válido.');
    return db.prepare(`SELECT * FROM products WHERE instr(lower(name || ' ' || description), lower(?)) > 0
      AND (? = '' OR category = ?) ORDER BY ${ordering[sort]}`).all(q, category, category);
  }

  function checkout(body, key) {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new ApiError(400, 'Falta una clave de pedido válida.');
    if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) throw new ApiError(400, 'Agregá entre 1 y 20 productos.');
    const items = body.items.map(item => {
      if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new ApiError(400, 'Cantidad o producto no válido.');
      return { id: item.id, quantity: item.quantity };
    }).sort((a, b) => a.id - b.id);
    if (new Set(items.map(x => x.id)).size !== items.length) throw new ApiError(400, 'Hay productos repetidos.');
    const payload = JSON.stringify(items);
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT * FROM orders WHERE request_key = ?').get(key);
      if (previous) {
        if (previous.payload !== payload) throw new ApiError(409, 'La clave ya corresponde a otro pedido.');
        const result = receipt(previous);
        db.exec('COMMIT');
        return { ...result, replayed: true };
      }
      const lines = items.map(item => {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.id);
        if (!product) throw new ApiError(404, 'Uno de los productos ya no existe.');
        if (product.stock < item.quantity) throw new ApiError(409, `Stock insuficiente para ${product.name}. Actualizá el carrito.`);
        return { ...product, quantity: item.quantity };
      });
      const order = { id: randomUUID(), total: lines.reduce((sum, p) => sum + p.price * p.quantity, 0), created_at: new Date().toISOString() };
      db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?)').run(order.id, key, payload, order.total, order.created_at);
      for (const p of lines) {
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(p.quantity, p.id);
        db.prepare('INSERT INTO order_items VALUES (?, ?, ?, ?, ?)').run(order.id, p.id, p.name, p.quantity, p.price);
      }
      const result = receipt(order);
      db.exec('COMMIT');
      return { ...result, replayed: false };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function receipt(order) {
    return { id: order.id, total: order.total, currency: 'ARS', createdAt: order.created_at,
      items: db.prepare('SELECT product_id AS id, name, quantity, price FROM order_items WHERE order_id = ? ORDER BY product_id').all(order.id) };
  }
  return { list, checkout, close: () => db.close() };
}
