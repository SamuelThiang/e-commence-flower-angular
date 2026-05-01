/** MYR amounts rounded to 2 decimal places (display / payment parity). */
export function roundMoneyMyr(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export const DEFAULT_CHECKOUT_SETTINGS = {
  priorityCourierFeeMyr: 24,
  sstServiceTaxRatePercent: 6,
  taxBase: 'subtotal',
  courierFeeLabel: 'Priority courier (Lalamove)',
  taxDisplayLabel: 'Estimated SST (service tax)',
};

/**
 * @param {number} subtotal
 * @param {'delivery'|'pickup'} deliveryOption
 * @param {typeof DEFAULT_CHECKOUT_SETTINGS & { taxBase: string }} settings
 */
export function computeOrderPricing(subtotal, deliveryOption, settings) {
  const fee = Number(settings.priorityCourierFeeMyr);
  const shipping =
    deliveryOption === 'pickup' ? 0 : roundMoneyMyr(fee);
  const ratePct = Number(settings.sstServiceTaxRatePercent);
  const rate = settings.taxBase === 'none' || ratePct <= 0 ? 0 : ratePct / 100;

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

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<typeof DEFAULT_CHECKOUT_SETTINGS>}
 */
export async function fetchCheckoutSettings(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT priority_courier_fee_myr, sst_service_tax_rate_percent, tax_base,
              courier_fee_label, tax_display_label
       FROM shop_checkout_settings
       WHERE id = 1
       LIMIT 1`,
    );
    if (rows.length === 0) {
      return { ...DEFAULT_CHECKOUT_SETTINGS };
    }
    const r = rows[0];
    return {
      priorityCourierFeeMyr: Number(r.priority_courier_fee_myr),
      sstServiceTaxRatePercent: Number(r.sst_service_tax_rate_percent),
      taxBase: String(r.tax_base),
      courierFeeLabel: String(r.courier_fee_label),
      taxDisplayLabel: String(r.tax_display_label),
    };
  } catch (e) {
    if (e && e.code === '42P01') {
      return { ...DEFAULT_CHECKOUT_SETTINGS };
    }
    throw e;
  }
}
