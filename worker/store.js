export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const seedRows = [
  [1, 'Perfume Acqua', 'Perfumes', 'Una nota fresca para todos los días. Presentación de muestra.', 2500000, 12],
  [2, 'Camisa Blanca', 'Ropa', 'El básico que combina con todo. Talle único de demostración.', 1500000, 20],
  [3, 'Jeans Azul', 'Ropa', 'Denim clásico de corte recto. Talle único de demostración.', 3000000, 15],
  [4, 'Zapatillas Urban', 'Calzado', 'Líneas simples para la ciudad. Talle único de demostración.', 5000000, 8]
];

export function createD1Store(db) {
  if (!db) throw new Error('D1 binding DB is missing');
  async function seed() {
    // Data seeding is separate from the schema migrations. Never replenish sold stock.
    await db.batch(seedRows.map(row => db.prepare('INSERT OR IGNORE INTO products (id, name, category, description, price, stock) VALUES (?, ?, ?, ?, ?, ?)').bind(...row)));
  }
  async function list({ q = '', category = '', sort = 'featured' } = {}) {
    const ordering = { featured: 'id ASC', 'price-asc': 'price ASC, id ASC', 'price-desc': 'price DESC, id ASC' };
    if (!Object.hasOwn(ordering, sort)) throw new ApiError(400, 'Orden no válido.');
    await seed();
    return (await db.prepare(`SELECT * FROM products WHERE instr(lower(name || ' ' || description), lower(?)) > 0 AND (? = '' OR category = ?) ORDER BY ${ordering[sort]}`).bind(q, category, category).all()).results;
  }
  async function receipt(order, replayed) {
    const items = (await db.prepare('SELECT product_id AS id, name, quantity, price FROM order_items WHERE order_id = ? ORDER BY product_id').bind(order.id).all()).results;
    return { id: order.id, total: order.total, currency: 'ARS', createdAt: order.created_at, items, replayed };
  }
  async function checkout(body, key) {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new ApiError(400, 'Falta una clave de pedido válida.');
    if (!body || !Array.isArray(body.items) || !body.items.length || body.items.length > 20) throw new ApiError(400, 'Agregá entre 1 y 20 productos.');
    const items = body.items.map(p => {
      if (!p || !Number.isSafeInteger(p.id) || p.id < 1 || !Number.isSafeInteger(p.quantity) || p.quantity < 1 || p.quantity > 20) throw new ApiError(400, 'Cantidad o producto no válido.');
      return { id: p.id, quantity: p.quantity };
    }).sort((a, b) => a.id - b.id);
    if (new Set(items.map(p => p.id)).size !== items.length) throw new ApiError(400, 'Hay productos repetidos.');
    const payload = JSON.stringify(items);
    async function previous() {
      const order = await db.prepare('SELECT * FROM orders WHERE request_key = ?').bind(key).first();
      if (!order) return null;
      if (order.payload !== payload) throw new ApiError(409, 'La clave ya corresponde a otro pedido.');
      return receipt(order, true);
    }
    const replay = await previous();
    if (replay) return replay;
    await seed();
    const rows = await db.batch(items.map(p => db.prepare('SELECT * FROM products WHERE id = ?').bind(p.id)));
    const lines = rows.map((result, index) => {
      const p = result.results[0], item = items[index];
      if (!p) throw new ApiError(404, 'Uno de los productos ya no existe.');
      if (p.stock < item.quantity) throw new ApiError(409, `Stock insuficiente para ${p.name}. Actualizá el carrito.`);
      return { ...p, quantity: item.quantity };
    });
    const order = { id: crypto.randomUUID(), total: lines.reduce((sum, p) => sum + p.price * p.quantity, 0), created_at: new Date().toISOString() };
    const statements = [db.prepare('INSERT INTO orders (id, request_key, payload, total, created_at) VALUES (?, ?, ?, ?, ?)').bind(order.id, key, payload, order.total, order.created_at)];
    for (const p of lines) {
      // The DB CHECK(stock >= 0) protects against concurrent overselling.
      // D1 batch rolls back the entire batch if any statement fails.
      statements.push(db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').bind(p.quantity, p.id));
      statements.push(db.prepare('INSERT INTO order_items (order_id, product_id, name, quantity, price) VALUES (?, ?, ?, ?, ?)').bind(order.id, p.id, p.name, p.quantity, p.price));
    }
    try { await db.batch(statements); }
    catch (error) {
      // A parallel retry may have committed while this request read the catalog.
      const saved = await previous();
      if (saved) return saved;
      const message = String(error.message) + String(error.cause?.message || '');
      if (message.includes('products_stock_nonnegative')) throw new ApiError(409, 'El stock cambió. Actualizá el carrito y volvé a intentar.');
      throw error;
    }
    return receipt(order, false);
  }
  return { list, checkout };
}
