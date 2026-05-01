-- Shop-wide checkout pricing (Malaysia-oriented).
--
-- SST (Sales and Service Tax) replaced GST in 2018. Service tax applies to
-- prescribed services at rates set by law (commonly 6% historically; some
-- sectors differ). Sales tax on goods is often embedded earlier in the supply
-- chain — this table lets you model an *estimated* checkout line (rate + base)
-- for customer-facing totals; confirm applicability with your tax advisor.
--
-- tax_base:
--   subtotal              — rate × sum of line items (before courier)
--   subtotal_and_delivery — rate × (subtotal + courier fee), when delivery selected
--   delivery_only         — rate × courier fee only (pickup → 0 tax from this line)
--   none                  — no estimated tax line (rate ignored)
--
-- Adjust amounts and labels in this row (id = 1) without redeploying the app.

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
