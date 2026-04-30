import crypto from 'crypto';
import { pool } from '../db.js';
import { requireAuth } from './requireAuth.js';

function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Either `X-Admin-Upload-Key` matching env `ADMIN_UPLOAD_KEY`, or Bearer JWT for a user with `role = admin`.
 */
export function productImageUploadAuth(req, res, next) {
  const envKey = process.env.ADMIN_UPLOAD_KEY?.trim();
  const sent = req.headers['x-admin-upload-key'];
  if (envKey && typeof sent === 'string' && secureCompare(sent, envKey)) {
    next();
    return;
  }
  requireAuth(req, res, async () => {
    try {
      const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [
        req.userId,
      ]);
      if (!rows[0] || rows[0].role !== 'admin') {
        res.status(403).json({
          error:
            'Admin role required, or set ADMIN_UPLOAD_KEY and send header X-Admin-Upload-Key',
        });
        return;
      }
      next();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  });
}
