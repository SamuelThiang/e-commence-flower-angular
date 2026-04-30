-- Optional: create shop hours tables (no data). For existing DBs: npm run db:shop-hours
-- day_of_week: 1 = Monday … 7 = Sunday (ISO-style).

CREATE TABLE IF NOT EXISTS shop_weekly_hours (
  day_of_week SMALLINT PRIMARY KEY CHECK (day_of_week >= 1 AND day_of_week <= 7),
  is_open BOOLEAN NOT NULL DEFAULT false,
  open_time TIME,
  close_time TIME,
  delivery_dispatch_start TIME,
  delivery_dispatch_end TIME,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
