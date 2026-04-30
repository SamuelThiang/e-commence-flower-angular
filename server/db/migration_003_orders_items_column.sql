-- Restore legacy JSON snapshot column expected by the API when older DBs dropped it
-- or created `orders` without `items` before `schema.sql` included it.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
