import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { authErrorBody } from '../utils/apiError.js';

const router = Router();

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  return jwt.sign(
    { sub: user.id, email: user.email },
    secret,
    { expiresIn: '7d' },
  );
}

const PASSWORD_MIN_LENGTH = 3;

function isValidPassword(password) {
  if (typeof password !== 'string' || !password) return false;
  if (/\s/.test(password)) return false;
  if (!/^[\x21-\x7E]+$/.test(password)) return false;
  return password.length >= PASSWORD_MIN_LENGTH;
}

function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    phone: row.phone || '',
    role: row.role,
  };
}

/** POST /api/auth/register */
router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body || {};
  if (!String(email || '').trim()) {
    return res.status(400).json(authErrorBody('Email is required', 'email'));
  }
  if (!password) {
    return res.status(400).json(authErrorBody('Password is required', 'password'));
  }
  if (!String(firstName || '').trim()) {
    return res
      .status(400)
      .json(authErrorBody('First name is required', 'firstName'));
  }
  if (!String(lastName || '').trim()) {
    return res
      .status(400)
      .json(authErrorBody('Last name is required', 'lastName'));
  }
  if (!isValidPassword(password)) {
    return res.status(400).json(
      authErrorBody(
        'Password must be at least 3 characters and use only letters, numbers, and symbols (no spaces).',
        'password',
      ),
    );
  }
  const emailNorm = email.toLowerCase().trim();
  const displayName = `${firstName} ${lastName}`.trim();
  try {
    const existing = await pool.query(
      `SELECT 1 FROM users WHERE email = $1 LIMIT 1`,
      [emailNorm],
    );
    if (existing.rowCount > 0) {
      return res
        .status(409)
        .json(authErrorBody('This email already exists!', 'email'));
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, phone, role`,
      [emailNorm, hash, displayName],
    );
    const user = mapUserRow(result.rows[0]);
    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (e) {
    if (e.code === '23505') {
      return res
        .status(409)
        .json(authErrorBody('This email already exists!', 'email'));
    }
    console.error(e);
    return res
      .status(500)
      .json(authErrorBody('Registration failed', undefined, { kind: 'system' }));
  }
});

/** POST /api/auth/login */
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!String(email || '').trim()) {
    return res.status(400).json(authErrorBody('Email is required', 'email'));
  }
  if (!password) {
    return res.status(400).json(authErrorBody('Password is required', 'password'));
  }
  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, display_name, phone, role
       FROM users WHERE email = $1`,
      [email.toLowerCase().trim()],
    );
    if (result.rowCount === 0) {
      return res
        .status(401)
        .json(authErrorBody('No account found for this email.', 'email'));
    }
    const row = result.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return res.status(401).json(authErrorBody('Incorrect password.', 'password'));
    }
    const user = mapUserRow(row);
    const token = signToken(user);
    return res.json({ token, user });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json(authErrorBody('Login failed', undefined, { kind: 'system' }));
  }
});

/**
 * POST /api/auth/admin-token
 * Same JSON body as login (`email`, `password`). Returns a JWT only if the user exists and `role` is `admin`.
 * Use in Postman: Authorization → Bearer Token → paste `token`.
 */
router.post('/admin-token', async (req, res) => {
  const { email, password } = req.body || {};
  if (!String(email || '').trim()) {
    return res.status(400).json(authErrorBody('Email is required', 'email'));
  }
  if (!password) {
    return res.status(400).json(authErrorBody('Password is required', 'password'));
  }
  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, display_name, phone, role
       FROM users WHERE email = $1`,
      [email.toLowerCase().trim()],
    );
    if (result.rowCount === 0) {
      return res
        .status(401)
        .json(authErrorBody('No account found for this email.', 'email'));
    }
    const row = result.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return res.status(401).json(authErrorBody('Incorrect password.', 'password'));
    }
    if (row.role !== 'admin') {
      return res
        .status(403)
        .json(authErrorBody('Admin role required for this token.', 'role'));
    }
    const user = mapUserRow(row);
    const token = signToken(user);
    return res.json({
      token,
      expiresIn: '7d',
      usage: 'Authorization: Bearer <token>',
    });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json(authErrorBody('Token request failed', undefined, { kind: 'system' }));
  }
});

/** GET /api/auth/me */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, display_name, phone, role FROM users WHERE id = $1`,
      [req.userId],
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json(authErrorBody('User not found', undefined, { kind: 'system' }));
    }
    return res.json(mapUserRow(result.rows[0]));
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json(authErrorBody('Failed to load profile', undefined, { kind: 'system' }));
  }
});

export default router;
