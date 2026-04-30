import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const serverRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let envLoaded = false;

/** Loads `server/.env` then default cwd `.env` (idempotent). */
export function loadServerEnv() {
  if (envLoaded) return;
  dotenv.config({ path: path.join(serverRoot, '.env') });
  dotenv.config();
  envLoaded = true;
}

/**
 * pg v8 warns when `sslmode=require` (etc.) is parsed without libpq-compat flags.
 * Neon URLs typically include `sslmode=require`; append `uselibpqcompat=true` per upstream guidance.
 * @see https://github.com/brianc/node-postgres/issues/3326
 */
function databaseUrlWithLibpqCompat(url) {
  if (!url || /(?:^|[?&])uselibpqcompat=/i.test(url)) return url;
  if (!/(?:^|[?&])sslmode=(?:require|prefer|verify-ca)\b/i.test(url)) return url;
  return url.includes('?') ? `${url}&uselibpqcompat=true` : `${url}?uselibpqcompat=true`;
}

/**
 * Options for `pg.Pool` — uses `DATABASE_URL` when set (e.g. Neon), else discrete vars.
 * Neon requires TLS; we enable it unless the URL explicitly disables SSL.
 */
export function createPgPoolOptions() {
  loadServerEnv();
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (rawUrl) {
    const url = databaseUrlWithLibpqCompat(rawUrl);
    const ssl = /sslmode=disable/i.test(url) ? false : { rejectUnauthorized: false };
    return { connectionString: url, ssl };
  }
  const ssl =
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;
  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    database: process.env.DATABASE_NAME || 'ecommerce_florist_db',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD,
    ssl,
  };
}
