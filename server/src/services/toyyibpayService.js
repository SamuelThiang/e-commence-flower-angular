/**
 * ToyyibPay gateway: Create Bill + callback hash verification.
 * Swap or add another service (e.g. ipay88Service.js) behind the same controller pattern.
 * @see https://toyyibpay.com/apireference/
 */
import crypto from 'crypto';
import {
  getToyyibPayConfig,
  primaryFrontendOrigin,
  toyyibPayPaymentPageBase,
} from '../config/toyyibpay.js';

/** Alphanumeric, spaces, underscores only; max length (ToyyibPay rules). */
export function sanitizeToyyibText(value, maxLen) {
  const s = String(value ?? '')
    .replace(/[^a-zA-Z0-9 _]/g, '_')
    .trim()
    .slice(0, maxLen);
  return s || 'NA';
}

function normalizeMsg(v) {
  if (v == null) return '';
  if (Array.isArray(v)) {
    return v.map(normalizeMsg).filter(Boolean).join('; ');
  }
  return String(v).trim();
}

function extractBillCodeDeep(parsed, depth = 0) {
  if (depth > 8 || parsed == null) return null;
  if (typeof parsed === 'string' || typeof parsed === 'number') return null;
  if (Array.isArray(parsed)) {
    for (const x of parsed) {
      const c = extractBillCodeDeep(x, depth + 1);
      if (c) return c;
    }
    return null;
  }
  if (typeof parsed === 'object') {
    const raw =
      parsed.BillCode ?? parsed.billCode ?? parsed.BILLCODE ?? parsed.bill_code;
    if (raw != null && raw !== '') {
      const s = String(raw).trim();
      if (s.length > 0) return s;
    }
    for (const k of Object.keys(parsed)) {
      const c = extractBillCodeDeep(parsed[k], depth + 1);
      if (c) return c;
    }
  }
  return null;
}

function collectToyyibMessages(parsed, depth = 0, out = []) {
  if (depth > 8 || parsed == null) return out;
  if (typeof parsed === 'string') {
    if (parsed.trim()) out.push(parsed.trim());
    return out;
  }
  if (Array.isArray(parsed)) {
    for (const x of parsed) collectToyyibMessages(x, depth + 1, out);
    return out;
  }
  if (typeof parsed === 'object') {
    const keys = [
      'Msg',
      'msg',
      'Message',
      'message',
      'Error',
      'error',
      'result',
      'Result',
      'statusText',
      'reason',
    ];
    for (const k of keys) {
      if (k in parsed) {
        const m = normalizeMsg(parsed[k]);
        if (m) out.push(m);
      }
    }
    const st = parsed.status ?? parsed.Status;
    const stLower = st != null ? String(st).toLowerCase() : '';
    if (stLower === 'fail') {
      out.push('status=fail');
    }
    if (stLower === 'error') {
      const em =
        parsed.message ?? parsed.Message ?? parsed.Msg ?? parsed.msg;
      if (em) {
        out.push(normalizeMsg(em));
      } else {
        out.push('status=error');
      }
    }
    for (const v of Object.values(parsed)) {
      collectToyyibMessages(v, depth + 1, out);
    }
  }
  return out;
}

function describeToyyibFailure(parsed, rawText, httpStatus) {
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    String(parsed.status ?? parsed.Status ?? '').toLowerCase() === 'error'
  ) {
    const m =
      parsed.message ??
      parsed.Message ??
      parsed.Msg ??
      parsed.msg;
    if (m) {
      return normalizeMsg(m);
    }
  }
  const msgs = collectToyyibMessages(parsed);
  const uniq = [...new Set(msgs)].filter(Boolean);
  let s = uniq.join(' — ');
  if (!s && rawText) {
    const t = rawText.trim();
    if (t.length > 0) {
      s = t.replace(/\s+/g, ' ').slice(0, 500);
    }
  }
  if (!s) {
    s = 'No BillCode in JSON response (check User Secret Key + Category Code on dev.toyyibpay.com)';
  }
  if (httpStatus && httpStatus !== 200) {
    s = `HTTP ${httpStatus}: ${s}`;
  }
  return s;
}

/** Helps UI/debug — ToyyibPay error messages are often in Msg / status:error */
function formatCreateBillUserMessage(detail, rawText) {
  if (!rawText?.trim()) return detail;
  const excerpt = rawText.replace(/\s+/g, ' ').trim().slice(0, 450);
  if (!excerpt || detail.includes(excerpt.slice(0, 80))) return detail;
  return `${detail} — Raw: ${excerpt}`;
}

function resolveBillEmail(opts) {
  const fromAccount = (opts.billEmail || '').trim();
  if (fromAccount) return fromAccount;
  const fb = process.env.TOYYIBPAY_FALLBACK_EMAIL?.trim();
  if (fb) return fb;
  return '';
}

function resolveBillPhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length >= 9 && digits.length <= 15) return digits;
  return '0123456789';
}

/**
 * MD5(userSecretKey + status + order_id + refno + "ok") — ToyyibPay callback verification.
 * @see https://toyyibpay.com/apireference/ Callback Parameter
 */
export function verifyToyyibCallbackHash(userSecretKey, body, receivedHash) {
  const status = String(body?.status ?? '');
  const orderId = String(body?.order_id ?? '');
  const refno = String(body?.refno ?? '');
  const expected = crypto
    .createHash('md5')
    .update(`${userSecretKey}${status}${orderId}${refno}ok`)
    .digest('hex');
  const got = String(receivedHash ?? '').trim();
  return Boolean(got && got === expected);
}

/**
 * @param {object} opts
 * @param {string} opts.orderId
 * @param {number} opts.amountMyr
 * @param {string} opts.billTo
 * @param {string} opts.billEmail
 * @param {string} [opts.billPhone]
 * @returns {Promise<{ billCode: string, paymentUrl: string, rawText: string }>}
 */
export async function createToyyibBill(opts) {
  const cfg = getToyyibPayConfig();
  if (!cfg) {
    throw Object.assign(new Error('ToyyibPay is not configured'), {
      code: 'TOYYIBPAY_CONFIG',
    });
  }

  const billEmail = resolveBillEmail(opts);
  if (!billEmail) {
    throw Object.assign(
      new Error(
        'ToyyibPay: missing customer email. Ensure the account has an email, or set TOYYIBPAY_FALLBACK_EMAIL in server/.env',
      ),
      { code: 'TOYYIBPAY_EMAIL' },
    );
  }

  const amountCents = Math.max(1, Math.round(Number(opts.amountMyr) * 100));
  const callbackUrl = process.env.TOYYIBPAY_CALLBACK_URL?.trim();
  const returnUrl = `${primaryFrontendOrigin()}/checkout/payment-return`;

  const billName = sanitizeToyyibText(`Order ${opts.orderId}`, 30);
  const billDescription = sanitizeToyyibText(`Payment for ${opts.orderId}`, 100);
  const billPhone = resolveBillPhone(opts.billPhone);
  const billToTrim = (opts.billTo || '').trim();
  const billTo = billToTrim ? sanitizeToyyibText(billToTrim, 100) : '';

  const fields = {
    userSecretKey: cfg.userSecretKey,
    categoryCode: cfg.categoryCode,
    billName,
    billDescription,
    billPriceSetting: '1',
    billPayorInfo: '1',
    billAmount: String(amountCents),
    billReturnUrl: returnUrl,
    billExternalReferenceNo: opts.orderId,
    billEmail,
    billPhone,
    billPaymentChannel: '0',
    billSplitPayment: '0',
    billSplitPaymentArgs: '',
  };

  if (billTo) {
    fields.billTo = billTo;
  }

  if (callbackUrl) {
    fields.billCallbackUrl = callbackUrl;
  }

  const apiUrl = `${cfg.apiBase}/index.php/api/createBill`;

  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v);
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    body: fd,
  });

  const rawText = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw Object.assign(
      new Error(
        `ToyyibPay createBill: non-JSON response HTTP ${res.status}: ${rawText.slice(0, 200)}`,
      ),
      { code: 'TOYYIBPAY_RESPONSE', rawText, httpStatus: res.status },
    );
  }

  const billCode = extractBillCodeDeep(parsed);
  if (!billCode) {
    const detail = describeToyyibFailure(parsed, rawText, res.status);
    const msg = formatCreateBillUserMessage(detail, rawText);
    console.error('[ToyyibPay createBill] failed — full response:', {
      httpStatus: res.status,
      apiUrl,
      rawLength: rawText?.length,
      rawHead: rawText?.slice(0, 1200),
      parsed,
    });
    throw Object.assign(new Error(`ToyyibPay createBill: ${msg}`), {
      code: 'TOYYIBPAY_BILLCODE',
      parsed,
      rawText,
      httpStatus: res.status,
    });
  }

  const base = toyyibPayPaymentPageBase(cfg);
  const paymentUrl = `${base}/${billCode}`;
  return { billCode, paymentUrl, rawText };
}

/**
 * Get Bill Transactions — verify payment without relying on server callback (localhost-safe).
 * @see https://toyyibpay.com/apireference/ — billpaymentStatus 1 = successful
 * @param {string} billCode
 * @param {string} [billpaymentStatus] pass `'1'` to filter successful rows only
 */
export async function fetchBillTransactions(billCode, billpaymentStatus) {
  const cfg = getToyyibPayConfig();
  if (!cfg) {
    throw Object.assign(new Error('ToyyibPay is not configured'), {
      code: 'TOYYIBPAY_CONFIG',
    });
  }
  const fd = new FormData();
  fd.append('billCode', billCode);
  if (billpaymentStatus != null && String(billpaymentStatus).trim() !== '') {
    fd.append('billpaymentStatus', String(billpaymentStatus));
  }
  const url = `${cfg.apiBase}/index.php/api/getBillTransactions`;
  const res = await fetch(url, {
    method: 'POST',
    body: fd,
  });
  const rawText = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      paid: false,
      rows: [],
      rawText,
      httpStatus: res.status,
      parseError: true,
    };
  }
  const rows = Array.isArray(parsed) ? parsed : [];
  const paid = rows.some((r) => String(r?.billpaymentStatus) === '1');
  return { paid, rows, rawText, httpStatus: res.status };
}
