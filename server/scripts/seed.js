import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { slugify } from './slugify.js';
import { createPgPoolOptions } from '../src/pgPoolConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const productsPath = path.join(__dirname, '..', 'data', 'products.json');
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

const pool = new pg.Pool(createPgPoolOptions());

async function ensureCategoryId(client, name, sortOrder) {
  const found = await client.query(`SELECT id FROM categories WHERE name = $1`, [name]);
  if (found.rowCount > 0) {
    return found.rows[0].id;
  }

  const baseSlug = slugify(name);
  let n = 0;
  for (;;) {
    const slug = n === 0 ? baseSlug : `${baseSlug}-${n}`;
    try {
      const ins = await client.query(
        `INSERT INTO categories (slug, name, sort_order) VALUES ($1, $2, $3) RETURNING id`,
        [slug, name, sortOrder],
      );
      return ins.rows[0].id;
    } catch (e) {
      if (e.code === '23505') {
        n++;
        continue;
      }
      throw e;
    }
  }
}

async function run() {
  const client = await pool.connect();
  try {
    const categoryNames = [...new Set(products.map((p) => p.category).filter(Boolean))];
    const categoryIdByName = new Map();

    let sortOrder = 0;
    for (const name of categoryNames) {
      const id = await ensureCategoryId(client, name, sortOrder++);
      categoryIdByName.set(name, id);
    }

    for (const p of products) {
      const categoryId = categoryIdByName.get(p.category);
      if (!categoryId) {
        throw new Error(`Missing category mapping for product ${p.id}: ${p.category}`);
      }
      await client.query(
        `INSERT INTO products (id, name, category_id, price, image, description,
           seasonal, exclusive, limited, order_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category_id = EXCLUDED.category_id,
           price = EXCLUDED.price,
           image = EXCLUDED.image,
           description = EXCLUDED.description,
           seasonal = EXCLUDED.seasonal,
           exclusive = EXCLUDED.exclusive,
           limited = EXCLUDED.limited,
           order_count = EXCLUDED.order_count`,
        [
          p.id,
          p.name,
          categoryId,
          p.price,
          p.image,
          p.description,
          !!p.seasonal,
          !!p.exclusive,
          !!p.limited,
          p.orderCount ?? 0,
        ],
      );
    }
    console.log(
      `Seeded ${categoryNames.length} categories and ${products.length} products.`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
