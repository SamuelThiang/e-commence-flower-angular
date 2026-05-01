import { pool } from '../db.js';

/** After `requireAuth` — allows only `users.role = 'admin'`. */
export async function requireAdmin(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [
      req.userId,
    ]);
    if (rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Authorization check failed' });
  }
}
