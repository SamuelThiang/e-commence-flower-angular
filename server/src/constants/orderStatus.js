/**
 * Canonical `orders.status` values (DB + API).
 * Lifecycle: Failed (unpaid / FPX declined) → Processing → In Transit | Ready → Completed
 */
export const ORDER_STATUSES = [
  'Failed',
  'Processing',
  'In Transit',
  'Ready',
  'Completed',
];

export function isAllowedOrderStatus(value) {
  return ORDER_STATUSES.includes(String(value ?? '').trim());
}
