-- ecommerce_florist_db — run once (see server/README.md)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS addresses (
  id VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  label VARCHAR(255) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_default ON addresses (user_id, is_default)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  product_count INTEGER NOT NULL DEFAULT 0 CHECK (product_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories (slug);

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(32) PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  price NUMERIC(10, 2) NOT NULL,
  image TEXT NOT NULL,
  description TEXT NOT NULL,
  seasonal BOOLEAN NOT NULL DEFAULT false,
  exclusive BOOLEAN NOT NULL DEFAULT false,
  limited BOOLEAN NOT NULL DEFAULT false,
  order_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(32) NOT NULL,
  items JSONB NOT NULL,
  total NUMERIC(12, 2) NOT NULL,
  preferred_delivery_date VARCHAR(64),
  delivery_option VARCHAR(16) NOT NULL DEFAULT 'delivery'
);

CREATE INDEX IF NOT EXISTS idx_orders_user_ordered ON orders (user_id, ordered_at DESC);

-- Keep categories.product_count aligned with products (INSERT/UPDATE/DELETE)
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

-- Weekly recurring shop hours + delivery dispatch window (ISO: Mon=1 … Sun=7)
CREATE TABLE IF NOT EXISTS shop_weekly_hours (
  day_of_week SMALLINT PRIMARY KEY CHECK (day_of_week >= 1 AND day_of_week <= 7),
  is_open BOOLEAN NOT NULL DEFAULT false,
  open_time TIME,
  close_time TIME,
  delivery_dispatch_start TIME,
  delivery_dispatch_end TIME,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exceptions for specific calendar dates (holiday closed or custom hours)
CREATE TABLE IF NOT EXISTS shop_hours_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_date DATE NOT NULL UNIQUE,
  override_type VARCHAR(16) NOT NULL CHECK (override_type IN ('closed', 'custom')),
  open_time TIME,
  close_time TIME,
  delivery_dispatch_start TIME,
  delivery_dispatch_end TIME,
  note VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_hours_exceptions_date ON shop_hours_exceptions (exception_date);
