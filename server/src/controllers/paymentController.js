/**
 * HTTP handlers for `/api/payments/*`.
 * Gateway-specific logic stays in services (e.g. toyyibpayService.js); DB updates stay here or move to repositories later.
 */
import { pool } from '../db.js';
import { getToyyibPayConfig } from '../config/toyyibpay.js';
import {
  fetchBillTransactions,
  verifyToyyibCallbackHash,
} from '../services/toyyibpayService.js';
import { GATEWAY_TOYYIBPAY } from '../constants/paymentGateways.js';

/**
 * ToyyibPay server-side callback (POST urlencoded body).
 * @see https://toyyibpay.com/apireference/ — Callback Parameter
 */
export async function postToyyibPayCallback(req, res) {
  const cfg = getToyyibPayConfig();
  if (!cfg) {
    return res.status(503).send('DISABLED');
  }

  const body = req.body || {};
  const hash = String(body.hash ?? '');

  if (!verifyToyyibCallbackHash(cfg.userSecretKey, body, hash)) {
    console.warn('ToyyibPay callback: invalid hash', {
      orderId: body.order_id,
      billcode: body.billcode,
    });
    return res.status(400).send('INVALID_HASH');
  }

  const status = String(body.status ?? '');
  const orderId = String(body.order_id ?? '');
  const payload = { ...body, receivedAt: new Date().toISOString() };
  const patch = JSON.stringify({ callback: payload });

  try {
    if (status === '1') {
      await pool.query(
        `UPDATE payments
         SET status = 'completed',
             paid_at = COALESCE(paid_at, now()),
             gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $1::jsonb
         WHERE order_id = $2 AND gateway = $3`,
        [patch, orderId, GATEWAY_TOYYIBPAY],
      );
      await pool.query(
        `UPDATE orders SET status = 'Processing'
         WHERE id = $1 AND status = 'Failed'`,
        [orderId],
      );
    } else if (status === '3') {
      await pool.query(
        `UPDATE payments
         SET status = 'failed',
             gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $1::jsonb
         WHERE order_id = $2 AND gateway = $3`,
        [patch, orderId, GATEWAY_TOYYIBPAY],
      );
      await pool.query(`UPDATE orders SET status = 'Failed' WHERE id = $1`, [
        orderId,
      ]);
    } else {
      await pool.query(
        `UPDATE payments
         SET gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $1::jsonb
         WHERE order_id = $2 AND gateway = $3`,
        [patch, orderId, GATEWAY_TOYYIBPAY],
      );
    }

    return res.status(200).send('RECEIPT_OK');
  } catch (e) {
    console.error(e);
    return res.status(500).send('ERR');
  }
}

/**
 * Return URL with status_id=3 — callback often never hits localhost; verify bill is not paid, then mark payment failed.
 */
async function syncToyyibPayReturnFailure(req, res) {
  const cfg = getToyyibPayConfig();
  if (!cfg) {
    return res.status(503).json({ error: 'ToyyibPay is not enabled' });
  }

  const billCode = String(req.body?.billCode ?? '').trim();
  const orderId = String(req.body?.orderId ?? '').trim();
  if (!billCode || !orderId) {
    return res.status(400).json({ error: 'billCode and orderId are required' });
  }

  try {
    const ord = await pool.query(
      `SELECT id, status FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, req.userId],
    );
    if (ord.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const pay = await pool.query(
      `SELECT id, status FROM payments
       WHERE order_id = $1 AND gateway = $2 AND transaction_id = $3`,
      [orderId, GATEWAY_TOYYIBPAY, billCode],
    );
    if (pay.rowCount === 0) {
      return res.status(404).json({
        error: 'No payment row for this bill — order id or bill code mismatch',
      });
    }

    const payStatus = pay.rows[0].status;
    if (payStatus === 'completed') {
      return res.json({
        synced: false,
        message: 'Payment already recorded as successful — check My orders.',
      });
    }
    if (payStatus === 'failed') {
      return res.json({
        synced: true,
        alreadyCompleted: true,
        message: 'Payment status already updated.',
      });
    }

    let tx = await fetchBillTransactions(billCode, '1');
    if (!tx.paid && !tx.parseError && tx.rows.length === 0) {
      tx = await fetchBillTransactions(billCode, '');
    }
    if (tx.parseError) {
      return res.status(502).json({
        synced: false,
        error: 'ToyyibPay returned non-JSON',
      });
    }
    if (tx.paid) {
      return res.status(409).json({
        error:
          'ToyyibPay reports this bill as paid — open My orders to refresh.',
      });
    }

    const patch = JSON.stringify({
      syncReturnFailure: {
        at: new Date().toISOString(),
        returnStatusId: '3',
        rows: tx.rows,
      },
    });

    await pool.query(
      `UPDATE payments
       SET status = 'failed',
           gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $1::jsonb
       WHERE order_id = $2 AND gateway = $3 AND transaction_id = $4
         AND status <> 'completed'`,
      [patch, orderId, GATEWAY_TOYYIBPAY, billCode],
    );
    await pool.query(
      `UPDATE orders SET status = 'Failed'
       WHERE id = $1
         AND status NOT IN ('Processing', 'In Transit', 'Ready', 'Completed')`,
      [orderId],
    );

    return res.json({ synced: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Sync failed' });
  }
}

/**
 * After ToyyibPay redirect (Return URL), the browser hits the SPA — server callback never ran on localhost.
 * Verify payment via official Get Bill Transactions API, then align DB with callback behaviour.
 * Body may include `returnStatusId: '3'` to record failure (same auth as success sync).
 */
export async function postToyyibPaySyncReturn(req, res) {
  const returnStatusId = String(req.body?.returnStatusId ?? '').trim();
  if (returnStatusId === '3') {
    return syncToyyibPayReturnFailure(req, res);
  }

  const cfg = getToyyibPayConfig();
  if (!cfg) {
    return res.status(503).json({ error: 'ToyyibPay is not enabled' });
  }

  const billCode = String(req.body?.billCode ?? '').trim();
  const orderId = String(req.body?.orderId ?? '').trim();
  if (!billCode || !orderId) {
    return res.status(400).json({ error: 'billCode and orderId are required' });
  }

  try {
    const ord = await pool.query(
      `SELECT id, status FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, req.userId],
    );
    if (ord.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const pay = await pool.query(
      `SELECT id, status FROM payments
       WHERE order_id = $1 AND gateway = $2 AND transaction_id = $3`,
      [orderId, GATEWAY_TOYYIBPAY, billCode],
    );
    if (pay.rowCount === 0) {
      return res.status(404).json({
        error: 'No payment row for this bill — order id or bill code mismatch',
      });
    }

    if (ord.rows[0].status !== 'Failed') {
      return res.json({
        synced: true,
        alreadyCompleted: true,
        message: 'Order status already updated',
      });
    }

    let tx = await fetchBillTransactions(billCode, '1');
    if (!tx.paid && !tx.parseError && tx.rows.length === 0) {
      tx = await fetchBillTransactions(billCode, '');
    }
    if (tx.parseError) {
      return res.status(502).json({
        synced: false,
        error: 'ToyyibPay returned non-JSON',
      });
    }
    if (!tx.paid) {
      return res.json({
        synced: false,
        message:
          'ToyyibPay has no successful transaction for this bill yet (status may still be pending).',
      });
    }

    const patch = JSON.stringify({
      syncReturn: {
        at: new Date().toISOString(),
        rows: tx.rows,
      },
    });

    await pool.query(
      `UPDATE payments
       SET status = 'completed',
           paid_at = COALESCE(paid_at, now()),
           gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $1::jsonb
       WHERE order_id = $2 AND gateway = $3 AND transaction_id = $4`,
      [patch, orderId, GATEWAY_TOYYIBPAY, billCode],
    );
    await pool.query(
      `UPDATE orders SET status = 'Processing'
       WHERE id = $1 AND status = 'Failed'`,
      [orderId],
    );

    return res.json({ synced: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Sync failed' });
  }
}
