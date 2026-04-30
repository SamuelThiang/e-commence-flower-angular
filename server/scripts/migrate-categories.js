/**
 * One-time migration: legacy products.category (text) -> categories table + products.category_id.
 * Safe to run multiple times (no-op if already migrated).
 */
import pg from 'pg';
import { slugify } from './slugify.js';
import { createPgPoolOptions } from '../src/pgPoolConfig.js';

const pool = new pg.Pool(createPgPoolOptions());

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows.length > 0;
}

async function migrate() {
  const client = await pool.connect();
  try {
    const hasLegacyCategory = await columnExists(client, 'products', 'category');

    if (!hasLegacyCategory) {
      console.log(
        'Skip migration: no legacy column products.category (schema already uses category_id).',
      );
      return;
    }

    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories (slug);`,
    );

    const { rows: distinctNames } = await client.query(`
      SELECT DISTINCT TRIM(category) AS name FROM products
      WHERE category IS NOT NULL AND TRIM(category) <> ''
    `);

    let sortOrder = 0;
    for (const row of distinctNames) {
      const name = row.name;
      const baseSlug = slugify(name);
      let n = 0;
      for (;;) {
        const trySlug = n === 0 ? baseSlug : `${baseSlug}-${n}`;
        try {
          await client.query(
            `INSERT INTO categories (slug, name, sort_order) VALUES ($1, $2, $3)`,
            [trySlug, name, sortOrder++],
          );
          break;
        } catch (e) {
          if (e.code === '23505') {
            n++;
            continue;
          }
          throw e;
        }
      }
    }

    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID;
    `);

    await client.query(`
      UPDATE products p
      SET category_id = c.id
      FROM categories c
      WHERE TRIM(p.category) = c.name AND p.category_id IS NULL;
    `);

    const { rows: orphans } = await client.query(
      `SELECT id, category FROM products WHERE category_id IS NULL`,
    );
    if (orphans.length > 0) {
      throw new Error(
        `Migration failed: ${orphans.length} product(s) could not map category: ${JSON.stringify(orphans)}`,
      );
    }

    await client.query(`
      ALTER TABLE products DROP COLUMN IF EXISTS category;
    `);

    await client.query(`
      ALTER TABLE products ALTER COLUMN category_id SET NOT NULL;
    `);

    await client.query(
      `ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_id_fkey;`,
    );
    await client.query(`
      ALTER TABLE products ADD CONSTRAINT products_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
    `);

    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);`,
    );

    await client.query(`
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS product_count INTEGER NOT NULL DEFAULT 0;
    `);
    await client.query(`
      UPDATE categories c
      SET product_count = (
        SELECT COUNT(*)::integer FROM products p WHERE p.category_id = c.id
      );
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION maintain_category_product_count()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          UPDATE categories SET product_count = product_count + 1 WHERE id = NEW.category_id;
          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          UPDATE categories
          SET product_count = GREATEST(0, product_count - 1)
          WHERE id = OLD.category_id;
          RETURN OLD;
        ELSIF TG_OP = 'UPDATE' THEN
          IF OLD.category_id IS DISTINCT FROM NEW.category_id THEN
            UPDATE categories
            SET product_count = GREATEST(0, product_count - 1)
            WHERE id = OLD.category_id;
            UPDATE categories SET product_count = product_count + 1 WHERE id = NEW.category_id;
          END IF;
          RETURN NEW;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await client.query(
      `DROP TRIGGER IF EXISTS trg_products_maintain_category_count ON products;`,
    );
    await client.query(`
      CREATE TRIGGER trg_products_maintain_category_count
        AFTER INSERT OR UPDATE OR DELETE ON products
        FOR EACH ROW
        EXECUTE PROCEDURE maintain_category_product_count();
    `);

    await client.query('COMMIT');
    console.log('Migration completed: categories table linked to products.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    process.exitCode = 1;
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
