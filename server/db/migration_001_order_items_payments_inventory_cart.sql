-- ============================================================
-- Migration 001
-- - Add created_at to: products, addresses
-- - Refactor orders: add delivery snapshot cols + created_at
--   (items JSONB kept until existing rows are moved to order_items)
-- - New tables: order_items, payments, inventory, cart, cart_items
-- Run inside a transaction; safe to re-run (IF NOT EXISTS / IF EXISTS guards).
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────
-- 1. products — add created_at
-- ─────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();


-- ─────────────────────────────────────────────
-- 2. addresses — add created_at
-- ─────────────────────────────────────────────
ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();


-- ─────────────────────────────────────────────
-- 3. orders — add delivery snapshot + created_at
--    Keep `items` JSONB for now so no data is lost.
--    After you backfill order_items from items, run the
--    separate drop step at the bottom of this file.
-- ─────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS recipient_phone  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT now();


-- ─────────────────────────────────────────────
-- 4. Shared trigger function: auto-set updated_at
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────
-- 5. order_items
--    One row per product line within an order.
--    unit_price + product_name are snapshotted at order time
--    so the record stays accurate even if the product changes later.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         VARCHAR(64) NOT NULL REFERENCES orders   (id) ON DELETE CASCADE,
  product_id       VARCHAR(32)          REFERENCES products (id) ON DELETE SET NULL,
  -- Snapshot fields (preserved even if product is later edited/deleted)
  product_name     TEXT        NOT NULL,
  product_image    TEXT        NOT NULL DEFAULT '',
  unit_price       NUMERIC(10, 2) NOT NULL,
  quantity         INTEGER     NOT NULL CHECK (quantity > 0),
  subtotal         NUMERIC(12, 2) NOT NULL, -- unit_price × quantity
  -- Gift card
  needs_giftcard   BOOLEAN     NOT NULL DEFAULT false,
  giftcard_message TEXT,                    -- NULL when needs_giftcard = false
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);


-- ─────────────────────────────────────────────
-- 6. payments
--    Stores one payment attempt per order.
--    Multiple rows are allowed per order to handle retries / refunds.
--    Fields designed to work with any payment gateway (Stripe, BillPlz, etc.)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         VARCHAR(64) NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  user_id          UUID        NOT NULL REFERENCES users  (id) ON DELETE RESTRICT,
  amount           NUMERIC(12, 2) NOT NULL,
  currency         VARCHAR(8)  NOT NULL DEFAULT 'MYR',
  -- pending → completed / failed / cancelled; completed → refunded
  status           VARCHAR(32) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  payment_method   VARCHAR(64),          -- e.g. 'fpx', 'credit_card', 'ewallet', 'cod'
  gateway          VARCHAR(64),          -- e.g. 'billplz', 'stripe', 'sandbox'
  transaction_id   VARCHAR(255),         -- gateway's own reference ID
  gateway_response JSONB,                -- raw callback / webhook payload for audit
  paid_at          TIMESTAMPTZ,          -- set when status → 'completed'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX  IF NOT EXISTS idx_payments_order_id      ON payments (order_id);
CREATE INDEX  IF NOT EXISTS idx_payments_user_id       ON payments (user_id);
CREATE INDEX  IF NOT EXISTS idx_payments_status        ON payments (status);
-- transaction_id must be unique when present (partial index ignores NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_id
  ON payments (transaction_id) WHERE transaction_id IS NOT NULL;


-- ─────────────────────────────────────────────
-- 7. inventory
--    One row per product.
--    available_quantity = quantity - reserved_quantity
--    reserved_quantity rises when an order is placed (pending payment)
--    and drops when payment is confirmed or order is cancelled.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          VARCHAR(32) NOT NULL UNIQUE REFERENCES products (id) ON DELETE CASCADE,
  quantity            INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity   INTEGER     NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  low_stock_threshold INTEGER     NOT NULL DEFAULT 5, -- alert when (quantity - reserved_quantity) <= this
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_inventory_updated_at ON inventory;
CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ─────────────────────────────────────────────
-- 8. cart
--    One active cart per user (UNIQUE on user_id).
--    updated_at refreshes whenever cart_items change
--    (handle this in application code or via trigger).
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_cart_updated_at ON cart;
CREATE TRIGGER trg_cart_updated_at
  BEFORE UPDATE ON cart
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ─────────────────────────────────────────────
-- 9. cart_items
--    One row per product inside a cart.
--    Duplicate product in same cart is prevented by the UNIQUE constraint;
--    to increase quantity just UPDATE the existing row.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id          UUID        NOT NULL REFERENCES cart     (id) ON DELETE CASCADE,
  product_id       VARCHAR(32) NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  quantity         INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  -- Gift card (same pattern as order_items)
  needs_giftcard   BOOLEAN     NOT NULL DEFAULT false,
  giftcard_message TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)          -- one row per product per cart
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id    ON cart_items (cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items (product_id);

COMMIT;


-- ============================================================
-- STEP 2 (run AFTER you have backfilled order_items from orders.items):
-- Drop the now-redundant JSONB column from orders.
--
--   ALTER TABLE orders DROP COLUMN IF EXISTS items;
--
-- Do NOT include this in the transaction above because you need
-- to verify the data migration first.
-- ============================================================
