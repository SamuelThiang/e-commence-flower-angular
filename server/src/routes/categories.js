import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

/** GET /api/categories — list categories with product counts (for admin / filters) */
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id::text AS id, c.slug, c.name, c.sort_order,
              c.product_count::int AS product_count
       FROM categories c
       ORDER BY c.sort_order ASC, c.name ASC`,
    );
    return res.json(result.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load categories' });
  }
});

export default router;
