import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

function mapAddress(row) {
  return {
    id: row.id,
    address: row.address,
    label: row.label,
    isDefault: row.is_default,
    uid: row.user_id,
  };
}

/** GET /api/addresses?defaultOnly=true */
router.get('/', requireAuth, async (req, res) => {
  const defaultOnly = req.query.defaultOnly === 'true';
  try {
    let result;
    if (defaultOnly) {
      result = await pool.query(
        `SELECT id, user_id, address, label, is_default FROM addresses
         WHERE user_id = $1 AND is_default = true LIMIT 1`,
        [req.userId],
      );
    } else {
      result = await pool.query(
        `SELECT id, user_id, address, label, is_default FROM addresses
         WHERE user_id = $1 ORDER BY is_default DESC, id`,
        [req.userId],
      );
    }
    const rows = result.rows.map(mapAddress);
    return res.json(defaultOnly ? rows[0] ?? null : rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load addresses' });
  }
});

/** POST /api/addresses */
router.post('/', requireAuth, async (req, res) => {
  const { id, address, label } = req.body || {};
  if (!address || !label) {
    return res.status(400).json({ error: 'address and label are required' });
  }
  const addrId = id || `ADDR-${Date.now()}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS c FROM addresses WHERE user_id = $1`,
      [req.userId],
    );
    const isFirst = countRes.rows[0].c === 0;
    await client.query(
      `INSERT INTO addresses (id, user_id, address, label, is_default)
       VALUES ($1, $2, $3, $4, $5)`,
      [addrId, req.userId, address, label, isFirst],
    );
    await client.query('COMMIT');
    const inserted = await pool.query(
      `SELECT id, user_id, address, label, is_default FROM addresses WHERE id = $1`,
      [addrId],
    );
    return res.status(201).json(mapAddress(inserted.rows[0]));
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Failed to save address' });
  } finally {
    client.release();
  }
});

/** PATCH /api/addresses/:id/default — set as sole default */
router.patch('/:id/default', requireAuth, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const own = await client.query(
      `SELECT id FROM addresses WHERE id = $1 AND user_id = $2`,
      [id, req.userId],
    );
    if (own.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Address not found' });
    }
    await client.query(
      `UPDATE addresses SET is_default = false WHERE user_id = $1`,
      [req.userId],
    );
    await client.query(
      `UPDATE addresses SET is_default = true WHERE id = $1 AND user_id = $2`,
      [id, req.userId],
    );
    await client.query('COMMIT');
    const list = await pool.query(
      `SELECT id, user_id, address, label, is_default FROM addresses
       WHERE user_id = $1 ORDER BY is_default DESC, id`,
      [req.userId],
    );
    return res.json(list.rows.map(mapAddress));
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Failed to update default' });
  } finally {
    client.release();
  }
});

export default router;
