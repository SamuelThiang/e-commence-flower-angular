import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

async function ensureCart(client, userId) {
  const existing = await client.query(
    `SELECT id FROM cart WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  const ins = await client.query(
    `INSERT INTO cart (user_id) VALUES ($1) RETURNING id`,
    [userId],
  );
  return ins.rows[0].id;
}

function mapCartLine(row) {
  return {
    lineId: row.line_id,
    productId: row.product_id,
    quantity: row.quantity,
    preferredDeliveryDate: row.preferred_delivery_date,
    needsGiftcard: row.needs_giftcard,
    giftcardMessage: row.giftcard_message || '',
    product: {
      id: row.product_id,
      name: row.name,
      category: row.category,
      categoryId: row.category_id,
      price: Number(row.price),
      image: row.image,
      description: row.description,
      seasonal: row.seasonal,
      exclusive: row.exclusive,
      limited: row.limited,
      orderCount: row.order_count,
    },
  };
}

async function loadCartPayload(client, userId) {
  const cartId = await ensureCart(client, userId);
  const result = await client.query(
    `SELECT ci.id AS line_id, ci.product_id, ci.quantity, ci.preferred_delivery_date,
            ci.needs_giftcard, ci.giftcard_message,
            p.name, c.name AS category, c.id::text AS category_id,
            p.price, p.image, p.description, p.seasonal, p.exclusive, p.limited, p.order_count
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE ci.cart_id = $1
     ORDER BY ci.created_at ASC`,
    [cartId],
  );
  return {
    cartId,
    items: result.rows.map(mapCartLine),
  };
}

/** GET /api/cart */
router.get('/', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const payload = await loadCartPayload(client, req.userId);
    return res.json(payload);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load cart' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/cart/items
 * Body: { productId, preferredDeliveryDate, quantityDelta?, quantity?,
 *         needsGiftcard?, giftcardMessage? }
 */
router.post('/items', requireAuth, async (req, res) => {
  const body = req.body || {};
  const productId = body.productId;
  const preferredDeliveryDate = String(body.preferredDeliveryDate || '').trim();
  if (!productId || !preferredDeliveryDate) {
    return res.status(400).json({ error: 'productId and preferredDeliveryDate are required' });
  }

  const hasAbsolute = body.quantity != null && body.quantity !== '';
  const delta =
    body.quantityDelta != null && body.quantityDelta !== ''
      ? Number(body.quantityDelta)
      : null;
  const absolute = hasAbsolute ? Math.max(1, Number(body.quantity)) : null;

  const needsGiftcard =
    body.needsGiftcard !== undefined ? Boolean(body.needsGiftcard) : false;
  const giftcardMessage =
    typeof body.giftcardMessage === 'string' ? body.giftcardMessage : '';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cartId = await ensureCart(client, req.userId);

    const prod = await client.query(
      `SELECT id FROM products WHERE id = $1`,
      [productId],
    );
    if (prod.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const existing = await client.query(
      `SELECT id, quantity, needs_giftcard, giftcard_message FROM cart_items
       WHERE cart_id = $1 AND product_id = $2 AND preferred_delivery_date = $3`,
      [cartId, productId, preferredDeliveryDate],
    );

    let newQty;
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (absolute != null) {
        newQty = absolute;
      } else if (delta != null && !Number.isNaN(delta)) {
        newQty = Math.max(1, row.quantity + delta);
      } else {
        newQty = row.quantity + 1;
      }
      await client.query(`UPDATE cart_items SET quantity = $1 WHERE id = $2`, [
        newQty,
        row.id,
      ]);
    } else {
      newQty =
        absolute != null
          ? absolute
          : delta != null && !Number.isNaN(delta)
            ? Math.max(1, delta)
            : 1;
      await client.query(
        `INSERT INTO cart_items (
           cart_id, product_id, quantity, preferred_delivery_date,
           needs_giftcard, giftcard_message)
         VALUES ($1, $2, $3, $4, $5, NULLIF(trim($6), ''))`,
        [cartId, productId, newQty, preferredDeliveryDate, needsGiftcard, giftcardMessage],
      );
    }

    await client.query('COMMIT');
    const payload = await loadCartPayload(pool, req.userId);
    return res.status(201).json(payload);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Failed to update cart' });
  } finally {
    client.release();
  }
});

/** DELETE /api/cart/all — must be registered before /items/:lineId */
router.delete('/all', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM cart WHERE user_id = $1)`,
      [req.userId],
    );
    const payload = await loadCartPayload(client, req.userId);
    return res.json(payload);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to clear cart' });
  } finally {
    client.release();
  }
});

/** PATCH /api/cart/items/:lineId */
router.patch('/items/:lineId', requireAuth, async (req, res) => {
  const { lineId } = req.params;
  const body = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cartId = await ensureCart(client, req.userId);

    const line = await client.query(
      `SELECT ci.id, ci.product_id, ci.quantity, ci.preferred_delivery_date
       FROM cart_items ci
       WHERE ci.id = $1 AND ci.cart_id = $2`,
      [lineId, cartId],
    );
    if (line.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cart line not found' });
    }

    const row = line.rows[0];
    let nextDate =
      body.preferredDeliveryDate != null
        ? String(body.preferredDeliveryDate).trim()
        : row.preferred_delivery_date;

    if (
      body.preferredDeliveryDate != null &&
      nextDate !== row.preferred_delivery_date
    ) {
      const conflict = await client.query(
        `SELECT id, quantity FROM cart_items
         WHERE cart_id = $1 AND product_id = $2 AND preferred_delivery_date = $3 AND id <> $4`,
        [cartId, row.product_id, nextDate, lineId],
      );
      if (conflict.rows.length > 0) {
        const other = conflict.rows[0];
        await client.query(
          `UPDATE cart_items SET quantity = $1 WHERE id = $2`,
          [other.quantity + row.quantity, other.id],
        );
        await client.query(`DELETE FROM cart_items WHERE id = $1`, [lineId]);
        await client.query('COMMIT');
        const payload = await loadCartPayload(pool, req.userId);
        return res.json(payload);
      }
      await client.query(
        `UPDATE cart_items SET preferred_delivery_date = $1 WHERE id = $2`,
        [nextDate, lineId],
      );
    }

    if (body.quantity != null) {
      const q = Math.max(1, Number(body.quantity));
      await client.query(`UPDATE cart_items SET quantity = $1 WHERE id = $2`, [
        q,
        lineId,
      ]);
    }

    if (body.needsGiftcard !== undefined || body.giftcardMessage !== undefined) {
      const ng =
        body.needsGiftcard !== undefined ? Boolean(body.needsGiftcard) : undefined;
      const gm =
        typeof body.giftcardMessage === 'string' ? body.giftcardMessage : undefined;

      if (ng !== undefined && gm !== undefined) {
        await client.query(
          `UPDATE cart_items SET needs_giftcard = $1,
             giftcard_message = CASE WHEN $1 THEN NULLIF(trim($2), '') ELSE NULL END
           WHERE id = $3`,
          [ng, gm, lineId],
        );
      } else if (ng !== undefined) {
        await client.query(
          `UPDATE cart_items SET needs_giftcard = $1,
             giftcard_message = CASE WHEN $1 THEN giftcard_message ELSE NULL END
           WHERE id = $2`,
          [ng, lineId],
        );
      } else if (gm !== undefined) {
        await client.query(
          `UPDATE cart_items SET giftcard_message = NULLIF(trim($1), '') WHERE id = $2`,
          [gm, lineId],
        );
      }
    }

    await client.query('COMMIT');
    const payload = await loadCartPayload(pool, req.userId);
    return res.json(payload);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Failed to update cart line' });
  } finally {
    client.release();
  }
});

/** DELETE /api/cart/items/:lineId */
router.delete('/items/:lineId', requireAuth, async (req, res) => {
  const { lineId } = req.params;
  const client = await pool.connect();
  try {
    const cartId = await ensureCart(client, req.userId);
    const del = await client.query(
      `DELETE FROM cart_items ci
       USING cart c
       WHERE ci.id = $1 AND ci.cart_id = c.id AND c.user_id = $2`,
      [lineId, req.userId],
    );
    if (del.rowCount === 0) {
      return res.status(404).json({ error: 'Cart line not found' });
    }
    const payload = await loadCartPayload(client, req.userId);
    return res.json(payload);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to remove cart line' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/cart/merge — add guest lines into server cart (after login)
 */
router.post('/merge', requireAuth, async (req, res) => {
  const raw = req.body?.items;
  if (!Array.isArray(raw)) {
    return res.status(400).json({ error: 'items array required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cartId = await ensureCart(client, req.userId);

    for (const entry of raw) {
      const productId = entry.productId || entry.product?.id;
      const preferredDeliveryDate = String(
        entry.preferredDeliveryDate || '',
      ).trim();
      const qty = Math.max(1, Number(entry.quantity) || 1);
      const needsGiftcard = Boolean(entry.needsGiftcard);
      const giftcardMessage =
        typeof entry.giftcardMessage === 'string' ? entry.giftcardMessage : '';

      if (!productId || !preferredDeliveryDate) continue;

      const prod = await client.query(`SELECT id FROM products WHERE id = $1`, [
        productId,
      ]);
      if (prod.rowCount === 0) continue;

      const existing = await client.query(
        `SELECT id, quantity FROM cart_items
         WHERE cart_id = $1 AND product_id = $2 AND preferred_delivery_date = $3`,
        [cartId, productId, preferredDeliveryDate],
      );
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE cart_items SET quantity = $1,
             needs_giftcard = $2, giftcard_message = NULLIF(trim($3), '')
           WHERE id = $4`,
          [
            existing.rows[0].quantity + qty,
            needsGiftcard,
            giftcardMessage,
            existing.rows[0].id,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO cart_items (
             cart_id, product_id, quantity, preferred_delivery_date,
             needs_giftcard, giftcard_message)
           VALUES ($1, $2, $3, $4, $5, NULLIF(trim($6), ''))`,
          [
            cartId,
            productId,
            qty,
            preferredDeliveryDate,
            needsGiftcard,
            giftcardMessage,
          ],
        );
      }
    }

    await client.query('COMMIT');
    const payload = await loadCartPayload(pool, req.userId);
    return res.json(payload);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Failed to merge cart' });
  } finally {
    client.release();
  }
});

export default router;
