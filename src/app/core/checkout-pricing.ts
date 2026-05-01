import type { CheckoutSettings } from './checkout-settings.service';

export function roundMoneyMyr(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Mirrors server `computeOrderPricing` for cart / checkout display */
export function computeOrderPricing(
  subtotal: number,
  deliveryOption: 'delivery' | 'pickup',
  settings: Pick<
    CheckoutSettings,
    'priorityCourierFeeMyr' | 'sstServiceTaxRatePercent' | 'taxBase'
  >,
): { subtotal: number; shipping: number; tax: number; total: number } {
  const fee = settings.priorityCourierFeeMyr;
  const shipping =
    deliveryOption === 'pickup' ? 0 : roundMoneyMyr(fee);
  const ratePct = settings.sstServiceTaxRatePercent;
  const rate =
    settings.taxBase === 'none' || ratePct <= 0 ? 0 : ratePct / 100;

  let taxBaseAmount = 0;
  switch (settings.taxBase) {
    case 'none':
      break;
    case 'subtotal':
      taxBaseAmount = subtotal;
      break;
    case 'subtotal_and_delivery':
      taxBaseAmount = subtotal + shipping;
      break;
    case 'delivery_only':
      taxBaseAmount = shipping;
      break;
    default:
      taxBaseAmount = subtotal;
  }

  const tax = rate <= 0 ? 0 : roundMoneyMyr(taxBaseAmount * rate);
  const sub = roundMoneyMyr(subtotal);
  const total = roundMoneyMyr(sub + shipping + tax);
  return { subtotal: sub, shipping, tax, total };
}
