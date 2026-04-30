-- Per-line delivery date on cart (matches FE: same product, different dates = different lines).
-- Per-line shipping on order_items (flattened units at checkout).

BEGIN;

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS preferred_delivery_date VARCHAR(64);

UPDATE cart_items
SET preferred_delivery_date = to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')
WHERE preferred_delivery_date IS NULL;

ALTER TABLE cart_items
  ALTER COLUMN preferred_delivery_date SET NOT NULL;

ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_cart_id_product_id_key;

DROP INDEX IF EXISTS cart_items_cart_id_product_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product_date
  ON cart_items (cart_id, product_id, preferred_delivery_date);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS preferred_delivery_date VARCHAR(64);

COMMIT;
