/**
 * Smoke-check DB connectivity (Neon or local), migrations shape, and seed counts.
 * Usage: npm run db:verify  (from server/)
 */
import { pool } from '../src/db.js';

const EXPECTED_TABLES = [
  'addresses',
  'cart',
  'cart_items',
  'categories',
  'inventory',
  'order_items',
  'orders',
  'payments',
  'products',
  'users',
];

async function main() {
  const { rows: ver } = await pool.query('SELECT version() AS v');
  console.log('Connected:', ver[0].v.split(',')[0]);

  const { rows: tables } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const names = tables.map((r) => r.tablename);
  console.log(`Public tables (${names.length}):`, names.join(', '));

  const have = new Set(names);
  const missing = EXPECTED_TABLES.filter((t) => !have.has(t));
  if (missing.length) {
    console.warn('Missing tables:', missing.join(', '));
  } else {
    console.log('Expected tables from schema + migrations 001–003: OK');
  }

  const [{ n: categories }] = (await pool.query('SELECT COUNT(*)::int AS n FROM categories')).rows;
  const [{ n: products }] = (await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows;
  console.log(`Seed check — categories: ${categories}, products: ${products}`);
  if (categories === 0 || products === 0) {
    console.warn('Run npm run seed if you expected catalog data.');
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
