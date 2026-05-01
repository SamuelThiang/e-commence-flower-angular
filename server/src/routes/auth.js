import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { authErrorBody } from '../utils/apiError.js';

const router = Router();

function googleOAuthClient() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!id) return null;
  return new OAuth2Client(id);
}

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

/** Registration: digits only, 9–15 characters (no spaces, +, or symbols). */
function validateRegisterPhone(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { ok: false, body: authErrorBody('Phone number is required', 'phone') };
  }
  if (!/^\d{9,15}$/.test(trimmed)) {
    return {
      ok: false,
      body: authErrorBody(
        'Phone must be 9–15 digits only (numbers only, no spaces or symbols).',
        'phone',
      ),
    };
  }
  return { ok: true, phone: trimmed, digits: trimmed };
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
  const { email, password, firstName, lastName, phone: phoneRaw } = req.body || {};
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
  const phoneCheck = validateRegisterPhone(phoneRaw);
  if (!phoneCheck.ok) {
    return res.status(400).json(phoneCheck.body);
  }
  const { phone, digits: phoneDigits } = phoneCheck;

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

    const dupPhone = await pool.query(
      `SELECT 1 FROM users
       WHERE phone <> ''
         AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $1
       LIMIT 1`,
      [phoneDigits],
    );
    if (dupPhone.rowCount > 0) {
      return res
        .status(409)
        .json(authErrorBody('This phone number is already registered.', 'phone'));
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, phone, role`,
      [emailNorm, hash, displayName, phone],
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
    if (!row.password_hash) {
      return res
        .status(401)
        .json(
          authErrorBody(
            'This account uses Google sign-in. Use “Sign in with Google”.',
            'password',
          ),
        );
    }
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
 * POST /api/auth/google — body `{ credential }` (GIS JWT). Creates user or logs in / links Google to existing email.
 */
router.post('/google', async (req, res) => {
  const client = googleOAuthClient();
  const credential = req.body?.credential;
  if (!client || !process.env.GOOGLE_CLIENT_ID?.trim()) {
    return res
      .status(503)
      .json(
        authErrorBody(
          'Google sign-in is not configured on the server.',
          undefined,
          { kind: 'system' },
        ),
      );
  }
  if (!credential || typeof credential !== 'string') {
    return res
      .status(400)
      .json(authErrorBody('Missing Google credential.', undefined, { kind: 'system' }));
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (e) {
    console.error(e);
    return res
      .status(401)
      .json(authErrorBody('Invalid or expired Google sign-in.', undefined, { kind: 'token' }));
  }

  if (!payload?.email || !payload.sub) {
    return res
      .status(400)
      .json(authErrorBody('Google did not return an email.', undefined, { kind: 'system' }));
  }
  if (payload.email_verified !== true) {
    return res
      .status(403)
      .json(authErrorBody('Google email is not verified.', undefined, { kind: 'system' }));
  }

  const emailNorm = payload.email.toLowerCase().trim();
  const displayName = String(
    payload.name ||
      `${payload.given_name || ''} ${payload.family_name || ''}`.trim() ||
      emailNorm.split('@')[0],
  ).slice(0, 255);
  const sub = payload.sub;

  try {
    const bySub = await pool.query(
      `SELECT id, email, display_name, phone, role FROM users WHERE google_sub = $1`,
      [sub],
    );
    if (bySub.rowCount > 0) {
      const user = mapUserRow(bySub.rows[0]);
      return res.json({ token: signToken(user), user });
    }

    const byEmail = await pool.query(
      `SELECT id, email, password_hash, display_name, phone, role, google_sub FROM users WHERE email = $1`,
      [emailNorm],
    );
    if (byEmail.rowCount > 0) {
      const row = byEmail.rows[0];
      if (row.google_sub && row.google_sub !== sub) {
        return res
          .status(409)
          .json(
            authErrorBody(
              'This email is already linked to a different Google account.',
              'email',
            ),
          );
      }
      if (!row.google_sub) {
        await pool.query(`UPDATE users SET google_sub = $1 WHERE id = $2`, [sub, row.id]);
      }
      const refreshed = await pool.query(
        `SELECT id, email, display_name, phone, role FROM users WHERE id = $1`,
        [row.id],
      );
      const user = mapUserRow(refreshed.rows[0]);
      return res.json({ token: signToken(user), user });
    }

    const ins = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, google_sub)
       VALUES ($1, NULL, $2, $3)
       RETURNING id, email, display_name, phone, role`,
      [emailNorm, displayName, sub],
    );
    const user = mapUserRow(ins.rows[0]);
    return res.status(201).json({ token: signToken(user), user });
  } catch (e) {
    if (e.code === '23505') {
      return res
        .status(409)
        .json(authErrorBody('Account conflict for this Google user.', 'email'));
    }
    if (e.code === '42703') {
      return res.status(500).json({
        message:
          'Database missing google_oauth columns — run: npm run db:migrate-004',
        kind: 'system',
      });
    }
    console.error(e);
    return res
      .status(500)
      .json(authErrorBody('Google sign-in failed', undefined, { kind: 'system' }));
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
    if (!row.password_hash) {
      return res
        .status(401)
        .json(authErrorBody('This account has no password set.', 'password'));
    }
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
