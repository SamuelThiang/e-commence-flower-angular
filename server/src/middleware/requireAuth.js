import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token =
    header && header.startsWith('Bearer ')
      ? header.slice(7)
      : null;
  if (!token) {
    return res.status(401).json({
      message: 'Missing or invalid authorization',
      kind: 'token',
    });
  }
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not set');
      return res
        .status(500)
        .json({ message: 'Server configuration error', kind: 'system' });
    }
    const payload = jwt.verify(token, secret);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    return res
      .status(401)
      .json({ message: 'Invalid or expired token', kind: 'token' });
  }
}
