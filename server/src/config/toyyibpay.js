/**
 * ToyyibPay (Malaysia) — sandbox: use https://dev.toyyibpay.com with dev credentials
 * (replace toyyibpay.com in API URLs). @see https://toyyibpay.com/apireference/
 */

export function isToyyibPayEnabled() {
  const v = process.env.TOYYIBPAY_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** First origin when FRONTEND_ORIGIN is comma-separated. */
export function primaryFrontendOrigin() {
  const raw = process.env.FRONTEND_ORIGIN || 'http://localhost:4200';
  return raw.split(',')[0].trim() || 'http://localhost:4200';
}

/**
 * @returns {null | { userSecretKey: string, categoryCode: string, apiBase: string }}
 */
export function getToyyibPayConfig() {
  if (!isToyyibPayEnabled()) return null;
  const userSecretKey = process.env.TOYYIBPAY_USER_SECRET_KEY?.trim();
  const categoryCode = process.env.TOYYIBPAY_CATEGORY_CODE?.trim();
  const apiBase = (
    process.env.TOYYIBPAY_API_BASE || 'https://dev.toyyibpay.com'
  ).replace(/\/$/, '');
  if (!userSecretKey || !categoryCode) {
    console.warn(
      'ToyyibPay: TOYYIBPAY_ENABLED is set but USER_SECRET_KEY or CATEGORY_CODE is missing — skipping gateway.',
    );
    return null;
  }
  return { userSecretKey, categoryCode, apiBase };
}

export function toyyibPayPaymentPageBase(cfg) {
  return cfg.apiBase.replace(/\/?$/, '');
}
