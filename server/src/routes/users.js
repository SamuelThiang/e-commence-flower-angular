import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

/** PATCH /api/users/me */
router.patch('/me', requireAuth, async (req, res) => {
  const { phone, displayName } = req.body || {};
  const updates = [];
  const values = [];
  let i = 1;
  if (phone !== undefined) {
    updates.push(`phone = $${i++}`);
    values.push(String(phone));
  }
  if (displayName !== undefined) {
    updates.push(`display_name = $${i++}`);
    values.push(String(displayName));
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  values.push(req.userId);
  try {
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${i}
       RETURNING id, email, display_name, phone, role`,
      values,
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const row = result.rows[0];
    return res.json({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      phone: row.phone || '',
      role: row.role,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Update failed' });
  }
});

export default router;
