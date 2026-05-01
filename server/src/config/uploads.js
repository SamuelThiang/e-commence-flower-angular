import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const defaultProductUploadDir = path.join(
  __dirname,
  '..',
  '..',
  'uploads',
  'products',
);

/**
 * Where `POST /api/products/:id/image` and `.../gallery` write files.
 * Set **PRODUCT_UPLOAD_DIR** to an absolute path on a **persistent volume** (Railway, Docker, VPS)
 * so files survive redeploys; default is `server/uploads/products` (often wiped on PaaS rebuilds).
 */
export const PRODUCT_UPLOAD_DIR = (() => {
  const raw = process.env.PRODUCT_UPLOAD_DIR?.trim();
  if (!raw) return defaultProductUploadDir;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
})();

export function ensureProductUploadDir() {
  fs.mkdirSync(PRODUCT_UPLOAD_DIR, { recursive: true });
}
