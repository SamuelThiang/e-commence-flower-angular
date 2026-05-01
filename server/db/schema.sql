-- ecommerce_florist_db — run once on a fresh database (see server/README.md)
-- For an existing database use: db/migration_001_order_items_payments_inventory_cart.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- SHARED UTILITY
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  google_sub    VARCHAR(255),
  display_name  VARCHAR(255) NOT NULL DEFAULT '',
  phone         VARCHAR(64)  NOT NULL DEFAULT '',
  role          VARCHAR(32)  NOT NULL DEFAULT 'user',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- ADDRESSES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS addresses (
  id         VARCHAR(64)  PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  address    TEXT         NOT NULL,
  label      VARCHAR(255) NOT NULL,
  is_default BOOLEAN      NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id      ON addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_default ON addresses (user_id, is_default)
  WHERE is_default = true;

-- ─────────────────────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  sort_order    INTEGER      NOT NULL DEFAULT 0,
  product_count INTEGER      NOT NULL DEFAULT 0 CHECK (product_count >= 0),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories (slug);

-- ─────────────────────────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id          VARCHAR(32)    PRIMARY KEY,
  name        TEXT           NOT NULL,
  category_id UUID           NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  price       NUMERIC(10, 2) NOT NULL,
  image       TEXT           NOT NULL,
  description TEXT           NOT NULL,
  seasonal    BOOLEAN        NOT NULL DEFAULT false,
  exclusive   BOOLEAN        NOT NULL DEFAULT false,
  limited     BOOLEAN        NOT NULL DEFAULT false,
  order_count INTEGER        NOT NULL DEFAULT 0,  -- running popularity counter
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);

-- Keep categories.product_count in sync with products rows
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
  FOR EACH ROW EXECUTE PROCEDURE maintain_category_product_count();

-- ─────────────────────────────────────────────────────────────
-- INVENTORY
-- One row per product.
-- available stock = quantity - reserved_quantity
-- reserved_quantity increases when a pending order is placed,
-- decreases when payment succeeds or order is cancelled.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          VARCHAR(32) NOT NULL UNIQUE REFERENCES products (id) ON DELETE CASCADE,
  quantity            INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity   INTEGER     NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  low_stock_threshold INTEGER     NOT NULL DEFAULT 5,  -- alert when available <= this
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_inventory_updated_at ON inventory;
CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- ORDERS
-- One row = one completed checkout session.
-- Delivery snapshot columns (address, recipient) are copied from
-- the user's selected address at checkout time.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id                      VARCHAR(64)    PRIMARY KEY,
  user_id                 UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status                  VARCHAR(32)    NOT NULL DEFAULT 'Processing'
                          CHECK (status IN (
                            'Failed',
                            'Processing',
                            'In Transit',
                            'Ready',
                            'Completed'
                          )),
  total                   NUMERIC(12, 2) NOT NULL,
  delivery_option         VARCHAR(16)    NOT NULL DEFAULT 'delivery',
  preferred_delivery_date VARCHAR(64),
  -- `ordered_at` + `items` kept for current API; prefer `created_at` + `order_items` going forward
  ordered_at              TIMESTAMPTZ    NOT NULL DEFAULT now(),
  items                   JSONB          NOT NULL DEFAULT '[]'::jsonb,
  -- Snapshot of delivery destination at checkout time
  delivery_address        TEXT,
  recipient_name          VARCHAR(255),
  recipient_phone         VARCHAR(64),
  notes                   TEXT,
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_ordered ON orders (user_id, ordered_at DESC);

-- ─────────────────────────────────────────────────────────────
-- ORDER ITEMS
-- One row per product line within an order.
-- Product details are snapshotted so the record is accurate
-- even if the product is later edited or removed.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_items (
  id                       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 VARCHAR(64)    NOT NULL REFERENCES orders   (id) ON DELETE CASCADE,
  product_id               VARCHAR(32)             REFERENCES products (id) ON DELETE SET NULL,
  -- Snapshotted at order time
  product_name             TEXT           NOT NULL,
  product_image            TEXT           NOT NULL DEFAULT '',
  unit_price               NUMERIC(10, 2) NOT NULL,
  quantity                 INTEGER        NOT NULL CHECK (quantity > 0),
  subtotal                 NUMERIC(12, 2) NOT NULL,  -- unit_price × quantity
  -- Gift card
  needs_giftcard           BOOLEAN        NOT NULL DEFAULT false,
  giftcard_message         TEXT,                     -- NULL when needs_giftcard = false
  delivery_address         TEXT,
  preferred_delivery_date  VARCHAR(64),
  created_at               TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);

-- ─────────────────────────────────────────────────────────────
-- PAYMENTS
-- Stores every payment attempt for an order.
-- Multiple rows per order are allowed (retries, partial refunds).
-- Fields are gateway-agnostic (Stripe, BillPlz, sandbox, etc.)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         VARCHAR(64)    NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  user_id          UUID           NOT NULL REFERENCES users  (id) ON DELETE RESTRICT,
  amount           NUMERIC(12, 2) NOT NULL,
  currency         VARCHAR(8)     NOT NULL DEFAULT 'MYR',
  -- Lifecycle: pending → completed | failed | cancelled; completed → refunded
  status           VARCHAR(32)    NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  payment_method   VARCHAR(64),          -- 'fpx' | 'credit_card' | 'ewallet' | 'cod'
  gateway          VARCHAR(64),          -- 'billplz' | 'stripe' | 'sandbox'
  transaction_id   VARCHAR(255),         -- gateway's own reference / bill ID
  gateway_response JSONB,                -- raw callback / webhook payload (audit trail)
  paid_at          TIMESTAMPTZ,          -- set when status becomes 'completed'
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX  IF NOT EXISTS idx_payments_order_id   ON payments (order_id);
CREATE INDEX  IF NOT EXISTS idx_payments_user_id    ON payments (user_id);
CREATE INDEX  IF NOT EXISTS idx_payments_status     ON payments (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_id
  ON payments (transaction_id) WHERE transaction_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- CART
-- One active cart per user (enforced by UNIQUE on user_id).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cart (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_cart_updated_at ON cart;
CREATE TRIGGER trg_cart_updated_at
  BEFORE UPDATE ON cart
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- CART ITEMS
-- One row per product + delivery date (same product, different dates = different lines).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cart_items (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id                  UUID        NOT NULL REFERENCES cart     (id) ON DELETE CASCADE,
  product_id               VARCHAR(32) NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  quantity                 INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  preferred_delivery_date  VARCHAR(64) NOT NULL,
  -- Gift card (mirrors order_items so checkout can copy fields directly)
  needs_giftcard           BOOLEAN     NOT NULL DEFAULT false,
  giftcard_message         TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product_date
  ON cart_items (cart_id, product_id, preferred_delivery_date);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id    ON cart_items (cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items (product_id);

-- ─────────────────────────────────────────────────────────────
-- CHECKOUT PRICING (singleton row id = 1; Malaysia SST-style estimates)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shop_checkout_settings (
  id                              SMALLINT PRIMARY KEY DEFAULT 1
                                    CHECK (id = 1),
  priority_courier_fee_myr        NUMERIC(10, 2) NOT NULL DEFAULT 24.00,
  sst_service_tax_rate_percent    NUMERIC(6, 3)  NOT NULL DEFAULT 6.000,
  tax_base                        VARCHAR(32)    NOT NULL DEFAULT 'subtotal'
                                    CHECK (tax_base IN (
                                      'subtotal',
                                      'subtotal_and_delivery',
                                      'delivery_only',
                                      'none'
                                    )),
  courier_fee_label               TEXT           NOT NULL DEFAULT 'Priority courier (Lalamove)',
  tax_display_label               TEXT           NOT NULL DEFAULT 'Estimated SST (service tax)',
  updated_at                      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

INSERT INTO shop_checkout_settings (id)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM shop_checkout_settings WHERE id = 1);

DROP TRIGGER IF EXISTS trg_shop_checkout_settings_updated_at ON shop_checkout_settings;
CREATE TRIGGER trg_shop_checkout_settings_updated_at
  BEFORE UPDATE ON shop_checkout_settings
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- SHOP HOURS (unchanged)
-- ─────────────────────────────────────────────────────────────

-- Weekly recurring shop hours + delivery dispatch window (ISO: Mon=1 … Sun=7)
CREATE TABLE IF NOT EXISTS shop_weekly_hours (
  day_of_week             SMALLINT PRIMARY KEY CHECK (day_of_week >= 1 AND day_of_week <= 7),
  is_open                 BOOLEAN  NOT NULL DEFAULT false,
  open_time               TIME,
  close_time              TIME,
  delivery_dispatch_start TIME,
  delivery_dispatch_end   TIME,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exceptions for specific calendar dates (holiday closed or custom hours)
CREATE TABLE IF NOT EXISTS shop_hours_exceptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_date          DATE        NOT NULL UNIQUE,
  override_type           VARCHAR(16) NOT NULL CHECK (override_type IN ('closed', 'custom')),
  open_time               TIME,
  close_time              TIME,
  delivery_dispatch_start TIME,
  delivery_dispatch_end   TIME,
  note                    VARCHAR(255),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_hours_exceptions_date ON shop_hours_exceptions (exception_date);
