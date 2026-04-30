import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

function mapOrder(row) {
  return {
    id: row.id,
    date: row.ordered_at ? new Date(row.ordered_at).toISOString() : null,
    status: row.status,
    items: row.items,
    total: Number(row.total),
    preferredDeliveryDate: row.preferred_delivery_date || undefined,
    deliveryOption: row.delivery_option || 'delivery',
    uid: row.user_id,
  };
}

/** GET /api/orders */
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, ordered_at, status, items, total,
              preferred_delivery_date, delivery_option
       FROM orders WHERE user_id = $1 ORDER BY ordered_at DESC`,
      [req.userId],
    );
    return res.json(result.rows.map(mapOrder));
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderedAt = date ? new Date(date) : new Date();
    await client.query(
      `INSERT INTO orders (id, user_id, ordered_at, status, items, total,
         preferred_delivery_date, delivery_option)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        id,
        req.userId,
        orderedAt,
        status || 'Processing',
        JSON.stringify(items),
        total,
        preferredDeliveryDate || null,
        deliveryOption === 'pickup' ? 'pickup' : 'delivery',
      ],
    );

    for (const line of items) {
      const pid = line.product?.id;
      const qty = Number(line.quantity) || 0;
      if (pid && qty > 0) {
        await client.query(
          `UPDATE products SET order_count = order_count + $1 WHERE id = $2`,
          [qty, pid],
        );
      }
    }

    await client.query('COMMIT');
    const saved = await pool.query(
      `SELECT id, user_id, ordered_at, status, items, total,
              preferred_delivery_date, delivery_option
       FROM orders WHERE id = $1`,
      [id],
    );
    return res.status(201).json(mapOrder(saved.rows[0]));
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Order id already exists' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to place order' });
  } finally {
    client.release();
  }
});

export default router;
