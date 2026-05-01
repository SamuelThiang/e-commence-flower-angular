-- Rename lifecycle labels: Delivered → Completed; enforce allowed order statuses.
-- Run from server/: npm run db:migrate-005

BEGIN;

UPDATE orders SET status = 'Completed' WHERE status = 'Delivered';
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
