import { Router } from 'express';
import { pool } from '../db.js';
import { getToyyibPayConfig } from '../config/toyyibpay.js';
import { ORDER_STATUSES, isAllowedOrderStatus } from '../constants/orderStatus.js';
import { GATEWAY_TOYYIBPAY } from '../constants/paymentGateways.js';
import { createToyyibBill } from '../services/toyyibpayService.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

function parseItemsJson(row) {
  const raw = row.items;
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Fold normalized order_item rows into FE `{ product, quantity, shippingDetails[] }[]`. */
function buildOrderItemsFromRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const pid = r.product_id || `legacy:${r.product_name}`;
    if (!map.has(pid)) {
      map.set(pid, {
        product: {
          id: r.product_id || '',
          name: r.product_name,
          category: '',
          price: Number(r.unit_price),
          image: r.product_image || '',
          description: '',
          orderCount: 0,
        },
        quantity: 0,
        shippingDetails: [],
      });
    }
    const agg = map.get(pid);
    const q = Number(r.quantity) || 1;
    agg.quantity += q;
    for (let i = 0; i < q; i += 1) {
      agg.shippingDetails.push({
        address: r.delivery_address || '',
        hasGiftCard: Boolean(r.needs_giftcard),
        giftMessage: r.giftcard_message || '',
        preferredDeliveryDate: r.preferred_delivery_date || '',
      });
    }
  }
  return [...map.values()];
}

function lineProductId(line) {
  const raw = line.productId ?? line.product?.id;
  return raw != null && String(raw).trim() !== '' ? String(raw).trim() : null;
}

/** Expand `{ productId, quantity }` JSON into FE `{ product, quantity, shippingDetails }` via DB. */
async function enrichSlimOrderItems(parsed, pool) {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }
  const needsDb = parsed.some((x) => x && !x.product && lineProductId(x));
  if (!needsDb) {
    return parsed;
  }
  const ids = [...new Set(parsed.map(lineProductId).filter(Boolean))];
  if (ids.length === 0) {
    return parsed;
  }
  const result = await pool.query(
    `SELECT p.id, p.name, c.name AS category, c.id::text AS category_id,
            p.price, p.image, p.description, p.seasonal, p.exclusive, p.limited, p.order_count
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.id = ANY($1::varchar[])`,
    [ids],
  );
  const map = new Map(result.rows.map((r) => [r.id, r]));
  return parsed.map((line) => {
    if (line.product) {
      return line;
    }
    const pid = lineProductId(line);
    const r = pid ? map.get(pid) : null;
    const product = r
      ? {
          id: r.id,
          name: r.name,
          category: r.category,
          categoryId: r.category_id,
          price: Number(r.price),
          image: r.image,
          description: r.description,
          seasonal: r.seasonal,
          exclusive: r.exclusive,
          limited: r.limited,
          orderCount: r.order_count,
        }
      : {
          id: pid || '',
          name: 'Unavailable product',
          category: '',
          price: 0,
          image: '',
          description: '',
          orderCount: 0,
        };
    return {
      product,
      quantity: Math.max(1, Number(line.quantity) || 1),
      shippingDetails: line.shippingDetails,
    };
  });
}

async function itemsForOrder(row, pool) {
  const orderId = row.id;
  let lines = null;
  try {
    lines = await pool.query(
      `SELECT product_id, product_name, product_image, unit_price, quantity,
              needs_giftcard, giftcard_message, delivery_address, preferred_delivery_date
       FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`,
      [orderId],
    );
  } catch (e) {
    if (e.code === '42P01') {
      return enrichSlimOrderItems(parseItemsJson(row), pool);
    }
    if (e.code === '42703') {
      try {
        lines = await pool.query(
          `SELECT product_id, product_name, product_image, unit_price, quantity,
                  needs_giftcard, giftcard_message
           FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`,
          [orderId],
        );
      } catch (e2) {
        if (e2.code === '42P01') {
          return enrichSlimOrderItems(parseItemsJson(row), pool);
        }
        throw e2;
      }
    } else {
      throw e;
    }
  }
  if (lines && lines.rows.length > 0) {
    return buildOrderItemsFromRows(lines.rows);
  }
  return enrichSlimOrderItems(parseItemsJson(row), pool);
}

function mapOrderRow(row, items) {
  return {
    id: row.id,
    date: row.ordered_at ? new Date(row.ordered_at).toISOString() : null,
    status: row.status,
    items,
    total: Number(row.total),
    preferredDeliveryDate: row.preferred_delivery_date || undefined,
    deliveryOption: row.delivery_option || 'delivery',
    uid: row.user_id,
  };
}

async function selectOrdersForUser(poolOrClient, userId) {
  try {
    return await poolOrClient.query(
      `SELECT id, user_id, ordered_at, status, items, total,
              preferred_delivery_date, delivery_option
       FROM orders WHERE user_id = $1 ORDER BY ordered_at DESC`,
      [userId],
    );
  } catch (e) {
    if (e.code === '42703') {
      return poolOrClient.query(
        `SELECT id, user_id, ordered_at, status, total,
                preferred_delivery_date, delivery_option
         FROM orders WHERE user_id = $1 ORDER BY ordered_at DESC`,
        [userId],
      );
    }
    throw e;
  }
}

async function selectOrderById(poolOrClient, orderId) {
  try {
    return await poolOrClient.query(
      `SELECT id, user_id, ordered_at, status, items, total,
              preferred_delivery_date, delivery_option
       FROM orders WHERE id = $1`,
      [orderId],
    );
  } catch (e) {
    if (e.code === '42703') {
      return poolOrClient.query(
        `SELECT id, user_id, ordered_at, status, total,
                preferred_delivery_date, delivery_option
         FROM orders WHERE id = $1`,
        [orderId],
      );
    }
    throw e;
  }
}

/** GET /api/orders */
router.get('/', requireAuth, async (req, res) => {
  try {
    const orders = await selectOrdersForUser(pool, req.userId);

    const out = [];
    for (const row of orders.rows) {
      const items = await itemsForOrder(row, pool);
      out.push(mapOrderRow(row, items));
    }
    return res.json(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load orders' });
  }
});

/** POST /api/orders */
router.post('/', requireAuth, async (req, res) => {
  const body = req.body || {};
  const {
    id,
    date,
    status,
    items,
    total,
    preferredDeliveryDate,
    deliveryOption,
  } = body;
  if (!id || !items || !Array.isArray(items) || total === undefined) {
    return res.status(400).json({ error: 'Invalid order payload' });
  }

  const tp = getToyyibPayConfig();
  const orderStatus = tp ? 'Failed' : status || 'Processing';

  const normalizedLines = [];
  for (const raw of items) {
    const pid = lineProductId(raw);
    if (!pid) {
      return res.status(400).json({
        error: 'Each line needs productId (or legacy product.id)',
      });
    }
    normalizedLines.push({
      productId: pid,
      quantity: Math.max(1, Number(raw.quantity) || 1),
      shippingDetails: Array.isArray(raw.shippingDetails)
        ? raw.shippingDetails
        : [],
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderedAt = date ? new Date(date) : new Date();
    const delOpt = deliveryOption === 'pickup' ? 'pickup' : 'delivery';

    const flatDetails = [];
    for (const item of normalizedLines) {
      const qty = item.quantity;
      const details = item.shippingDetails;
      for (let i = 0; i < qty; i += 1) {
        flatDetails.push(details[i] || details[0] || {});
      }
    }
    const first = flatDetails[0] || {};

    const itemsJson = JSON.stringify(normalizedLines);
    const orderBaseWithItems = [
      id,
      req.userId,
      orderedAt,
      orderStatus,
      itemsJson,
      total,
      preferredDeliveryDate || null,
      delOpt,
    ];
    const orderBaseNoItems = [
      id,
      req.userId,
      orderedAt,
      orderStatus,
      total,
      preferredDeliveryDate || null,
      delOpt,
    ];

    const orderInsertAttempts = [
      {
        sql: `INSERT INTO orders (id, user_id, ordered_at, status, items, total,
               preferred_delivery_date, delivery_option, delivery_address)
              VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        params: [...orderBaseWithItems, first.address || null],
      },
      {
        sql: `INSERT INTO orders (id, user_id, ordered_at, status, items, total,
               preferred_delivery_date, delivery_option)
              VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
        params: orderBaseWithItems,
      },
      {
        sql: `INSERT INTO orders (id, user_id, ordered_at, status, total,
               preferred_delivery_date, delivery_option, delivery_address)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        params: [...orderBaseNoItems, first.address || null],
      },
      {
        sql: `INSERT INTO orders (id, user_id, ordered_at, status, total,
               preferred_delivery_date, delivery_option)
              VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        params: orderBaseNoItems,
      },
    ];

    await client.query('SAVEPOINT sp_order_ins');
    let orderInserted = false;
    for (const attempt of orderInsertAttempts) {
      try {
        await client.query(attempt.sql, attempt.params);
        orderInserted = true;
        break;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_order_ins');
        if (e.code !== '42703') {
          throw e;
        }
      }
    }
    if (!orderInserted) {
      throw Object.assign(new Error('Cannot insert order: schema mismatch'), {
        code: 'ORDER_SCHEMA',
      });
    }
    await client.query('RELEASE SAVEPOINT sp_order_ins');

    let orderItemsUnavailable = false;
    for (const item of normalizedLines) {
      const pid = item.productId;
      const pr = await client.query(
        `SELECT id, name, image, price FROM products WHERE id = $1`,
        [pid],
      );
      if (pr.rowCount === 0) {
        throw Object.assign(new Error('Product not found'), { code: 'PRODUCT' });
      }
      const p = pr.rows[0];
      const unitPrice = Number(p.price);
      const details = Array.isArray(item.shippingDetails)
        ? item.shippingDetails
        : [];
      const qty = Math.max(1, Number(item.quantity) || 1);

      for (let i = 0; i < qty; i += 1) {
        if (orderItemsUnavailable) break;
        const d = details[i] || details[0] || {};
        const subtotal = unitPrice;
        const lineBase = [
          id,
          pid,
          p.name,
          p.image || '',
          unitPrice,
          subtotal,
          Boolean(d.hasGiftCard),
          d.giftMessage || null,
        ];
        await client.query('SAVEPOINT sp_order_item_ins');
        try {
          await client.query(
            `INSERT INTO order_items (
               order_id, product_id, product_name, product_image, unit_price, quantity, subtotal,
               needs_giftcard, giftcard_message, delivery_address, preferred_delivery_date)
             VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10)`,
            [...lineBase, d.address || null, d.preferredDeliveryDate || null],
          );
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT sp_order_item_ins');
          if (e.code === '42P01') {
            orderItemsUnavailable = true;
            await client.query('RELEASE SAVEPOINT sp_order_item_ins');
            break;
          }
          if (e.code === '42703') {
            await client.query(
              `INSERT INTO order_items (
                 order_id, product_id, product_name, product_image, unit_price, quantity, subtotal,
                 needs_giftcard, giftcard_message)
               VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8)`,
              lineBase,
            );
          } else {
            throw e;
          }
        }
        await client.query('RELEASE SAVEPOINT sp_order_item_ins');
      }

      await client.query(
        `UPDATE products SET order_count = order_count + $1 WHERE id = $2`,
        [qty, pid],
      );
    }

    if (tp) {
      await client.query('SAVEPOINT sp_pay_ins');
      try {
        await client.query(
          `INSERT INTO payments (order_id, user_id, amount, currency, status, payment_method, gateway)
           VALUES ($1, $2, $3, 'MYR', 'pending', 'fpx', $4)`,
          [id, req.userId, total, GATEWAY_TOYYIBPAY],
        );
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_pay_ins');
        if (e.code === '42P01') {
          console.warn(
            'payments table missing — run DB migrations; order committed without payment row.',
          );
        } else {
          throw e;
        }
      }
      await client.query('RELEASE SAVEPOINT sp_pay_ins');
    }

    await client.query('SAVEPOINT sp_cart_clear');
    try {
      await client.query(
        `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM cart WHERE user_id = $1)`,
        [req.userId],
      );
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT sp_cart_clear');
      if (e.code !== '42P01') {
        throw e;
      }
    }
    await client.query('RELEASE SAVEPOINT sp_cart_clear');

    await client.query('COMMIT');

    const saved = await selectOrderById(pool, id);
    const row = saved.rows[0];
    const outItems = await itemsForOrder(row, pool);
    const mapped = mapOrderRow(row, outItems);

    let payment = null;
    if (tp) {
      try {
        const ur = await pool.query(
          `SELECT display_name, phone, email FROM users WHERE id = $1`,
          [req.userId],
        );
        const u = ur.rows[0] || {};
        const bill = await createToyyibBill({
          orderId: id,
          amountMyr: Number(total),
          billTo: u.display_name || 'Customer',
          billEmail: req.userEmail || u.email || '',
          billPhone: u.phone || '',
        });
        await pool.query(
          `UPDATE payments
           SET transaction_id = $1,
               gateway_response = $2::jsonb
           WHERE order_id = $3 AND gateway = $4`,
          [
            bill.billCode,
            JSON.stringify({ createBillResponse: bill.rawText }),
            id,
            GATEWAY_TOYYIBPAY,
          ],
        );
        payment = {
          billCode: bill.billCode,
          paymentUrl: bill.paymentUrl,
        };
      } catch (e) {
        console.error('ToyyibPay createBill failed', e);
        payment = {
          error:
            e?.message ||
            'Payment link could not be created. Check My Orders or contact support.',
        };
      }
    }

    return res.status(201).json({ ...mapped, payment });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Order id already exists' });
    }
    if (e.code === 'PRODUCT') {
      return res.status(400).json({ error: 'Unknown product in order' });
    }
    if (e.code === 'ORDER_SCHEMA') {
      return res.status(500).json({
        error: 'Order table does not match API',
        hint: 'Run: npm run db:migrate-003',
      });
    }
    console.error(e);
    const hint =
      e.code === '42703'
        ? 'Database may be missing migrations — run: npm run db:migrate-001 && npm run db:migrate-002'
        : undefined;
    return res.status(500).json({
      error: 'Failed to place order',
      ...(hint && { hint }),
      ...(e.code && { code: e.code }),
      ...(process.env.NODE_ENV !== 'production' &&
        e.message && { detail: e.message }),
    });
  } finally {
    client.release();
  }
});

/** PATCH /api/orders/:id/status — shop admin only (set courier / pickup-ready / completed). */
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const orderId = req.params.id;
  const nextStatus = req.body?.status;
  if (!isAllowedOrderStatus(nextStatus)) {
    return res.status(400).json({
      error: 'Invalid status',
      allowed: ORDER_STATUSES,
    });
  }

  try {
    const upd = await pool.query(
      `UPDATE orders SET status = $1 WHERE id = $2 RETURNING id`,
      [nextStatus.trim(), orderId],
    );
    if (upd.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const saved = await selectOrderById(pool, orderId);
    const row = saved.rows[0];
    const outItems = await itemsForOrder(row, pool);
    return res.json(mapOrderRow(row, outItems));
  } catch (e) {
    if (e.code === '23514') {
      return res.status(400).json({
        error: 'Status not allowed by database constraint',
        allowed: ORDER_STATUSES,
      });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to update order status' });
  }
});

export default router;
