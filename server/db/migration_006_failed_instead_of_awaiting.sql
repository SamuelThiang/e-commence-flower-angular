-- Replace legacy `Awaiting payment` with `Failed` (run if you already applied older migration_005).
-- From server/: npm run db:migrate-006

BEGIN;

UPDATE orders SET status = 'Failed' WHERE status = 'Awaiting payment';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'Failed',
  'Processing',
  'In Transit',
  'Ready',
  'Completed'
));

COMMIT;
