-- Adds categories.product_count, backfills from products, and keeps counts in sync via trigger.
-- Safe on DBs that already have the column (ADD COLUMN IF NOT EXISTS skips).
-- Run: npm run db:patch-product-count

ALTER TABLE categories ADD COLUMN IF NOT EXISTS product_count INTEGER NOT NULL DEFAULT 0;

UPDATE categories c
SET product_count = (
  SELECT COUNT(*)::integer FROM products p WHERE p.category_id = c.id
);

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

DROP TRIGGER IF EXISTS trg_products_maintain_category_count ON products;
CREATE TRIGGER trg_products_maintain_category_count
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW
  EXECUTE PROCEDURE maintain_category_product_count();
