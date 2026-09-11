import { sqliteTable, integer, text, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const products = sqliteTable('products', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  price: integer('price').notNull(),
  stock: integer('stock').notNull(),
}, t => [check('products_price_positive', sql`${t.price} > 0`), check('products_stock_nonnegative', sql`${t.stock} >= 0`)]);

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  requestKey: text('request_key').notNull().unique(),
  payload: text('payload').notNull(),
  total: integer('total').notNull(),
  createdAt: text('created_at').notNull(),
});

export const orderItems = sqliteTable('order_items', {
  orderId: text('order_id').notNull().references(() => orders.id),
  productId: integer('product_id').notNull().references(() => products.id),
  name: text('name').notNull(),
  quantity: integer('quantity').notNull(),
  price: integer('price').notNull(),
}, t => [primaryKey({ columns: [t.orderId, t.productId] }), check('order_items_quantity_positive', sql`${t.quantity} > 0`)]);
