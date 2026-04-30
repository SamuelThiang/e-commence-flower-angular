import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path: server/uploads/products */
export const PRODUCT_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'products');

export function ensureProductUploadDir() {
  fs.mkdirSync(PRODUCT_UPLOAD_DIR, { recursive: true });
}
