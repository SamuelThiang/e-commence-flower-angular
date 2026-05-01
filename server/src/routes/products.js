import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { Router } from 'express';

import { PRODUCT_UPLOAD_DIR } from '../config/uploads.js';
import { pool } from '../db.js';
import { productImageUploadAuth } from '../middleware/productImageUploadAuth.js';

const router = Router();

const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
  },
});

function removeExistingProductImageFiles(productId) {
  let names;
  try {
    names = fs.readdirSync(PRODUCT_UPLOAD_DIR);
  } catch {
    return;
  }
  for (const name of names) {
    if (path.parse(name).name === productId) {
      try {
        fs.unlinkSync(path.join(PRODUCT_UPLOAD_DIR, name));
      } catch {
        /* ignore */
      }
    }
  }
}

function normalizeGalleryImages(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x) => typeof x === 'string' && x.trim() !== '');
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p)
        ? p.filter((x) => typeof x === 'string' && x.trim() !== '')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    categoryId: row.category_id,
    price: Number(row.price),
    image: row.image,
    description: row.description,
    seasonal: row.seasonal,
    exclusive: row.exclusive,
    limited: row.limited,
    orderCount: row.order_count,
    galleryImages: normalizeGalleryImages(row.gallery_images),
  };
}

const PRODUCT_SELECT_BASE = `SELECT p.id, p.name, c.name AS category, c.id::text AS category_id,
              p.price, p.image, p.description,
              p.seasonal, p.exclusive, p.limited, p.order_count`;

/** Detail + upload responses include ordered gallery paths (not the primary `image`). */
async function fetchProductMappedWithGallery(clientOrPool, productId) {
  const result = await clientOrPool.query(
    `${PRODUCT_SELECT_BASE},
              COALESCE(
                (SELECT json_agg(pi.image ORDER BY pi.sort_order ASC, pi.created_at ASC)
                 FROM product_gallery_images pi WHERE pi.product_id = p.id),
                '[]'::json
              ) AS gallery_images
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1`,
    [productId],
  );
  if (result.rowCount === 0) return null;
  return mapProduct(result.rows[0]);
}

function unlinkUploadBasename(relativePath) {
  if (
    relativePath == null ||
    typeof relativePath !== 'string' ||
    !relativePath.includes('/uploads/products/')
  ) {
    return;
  }
  const base = path.basename(relativePath);
  if (!base || base.includes('..')) return;
  try {
    fs.unlinkSync(path.join(PRODUCT_UPLOAD_DIR, base));
  } catch {
    /* ignore */
  }
}

/**
 * POST /api/products/:id/image
 * Multipart field name: `image`. Sets primary cover (`products.image`). Auth: admin JWT or X-Admin-Upload-Key.
 */
router.post(
  '/:id/image',
  productImageUploadAuth,
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      if (err) {
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Missing file field "image"' });
      }
      next();
    });
  },
  async (req, res) => {
    const productId = req.params.id;
    const file = req.file;
    try {
      const exists = await pool.query(`SELECT 1 FROM products WHERE id = $1`, [
        productId,
      ]);
      if (exists.rowCount === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const mime = file.mimetype.toLowerCase();
      const ext =
        MIME_TO_EXT[mime] ||
        (() => {
          const raw = path.extname(file.originalname || '').toLowerCase();
          return ALLOWED_IMAGE_EXT.has(raw) ? raw : '.jpg';
        })();
      const filename = `${productId}${ext}`;

      removeExistingProductImageFiles(productId);

      const diskPath = path.join(PRODUCT_UPLOAD_DIR, filename);
      fs.writeFileSync(diskPath, file.buffer);

      const relativeImagePath = `/uploads/products/${filename}`;

      await pool.query(`UPDATE products SET image = $1 WHERE id = $2`, [
        relativeImagePath,
        productId,
      ]);

      const mapped = await fetchProductMappedWithGallery(pool, productId);
      return res.json(mapped);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to update product image' });
    }
  },
);

/**
 * POST /api/products/:id/gallery
 * Multipart field name: `image`. Appends one extra detail-gallery photo (filename `id_g_<uuid>.ext`). Admin auth same as primary upload.
 */
router.post(
  '/:id/gallery',
  productImageUploadAuth,
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      if (err) {
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Missing file field "image"' });
      }
      next();
    });
  },
  async (req, res) => {
    const productId = req.params.id;
    const file = req.file;
    try {
      const exists = await pool.query(`SELECT 1 FROM products WHERE id = $1`, [
        productId,
      ]);
      if (exists.rowCount === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const mime = file.mimetype.toLowerCase();
      const ext =
        MIME_TO_EXT[mime] ||
        (() => {
          const raw = path.extname(file.originalname || '').toLowerCase();
          return ALLOWED_IMAGE_EXT.has(raw) ? raw : '.jpg';
        })();
      const filename = `${productId}_g_${randomUUID()}${ext}`;
      const diskPath = path.join(PRODUCT_UPLOAD_DIR, filename);
      fs.writeFileSync(diskPath, file.buffer);
      const relativeImagePath = `/uploads/products/${filename}`;

      await pool.query(
        `INSERT INTO product_gallery_images (product_id, image, sort_order)
         VALUES (
           $1,
           $2,
           (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM product_gallery_images WHERE product_id = $1)
         )`,
        [productId, relativeImagePath],
      );

      const mapped = await fetchProductMappedWithGallery(pool, productId);
      return res.json(mapped);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to add gallery image' });
    }
  },
);

/**
 * DELETE /api/products/:id/gallery/:galleryRowId
 * Removes one gallery row and its file from disk (not the primary `products.image`).
 */
router.delete(
  '/:id/gallery/:galleryRowId',
  productImageUploadAuth,
  async (req, res) => {
    const productId = req.params.id;
    const galleryRowId = req.params.galleryRowId;
    try {
      const sel = await pool.query(
        `SELECT id, image FROM product_gallery_images WHERE id = $1::uuid AND product_id = $2`,
        [galleryRowId, productId],
      );
      if (sel.rowCount === 0) {
        return res.status(404).json({ error: 'Gallery image not found' });
      }
      unlinkUploadBasename(sel.rows[0].image);
      await pool.query(`DELETE FROM product_gallery_images WHERE id = $1::uuid`, [
        galleryRowId,
      ]);
      const mapped = await fetchProductMappedWithGallery(pool, productId);
      return res.json(mapped);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to delete gallery image' });
    }
  },
);

/** GET /api/products */
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `${PRODUCT_SELECT_BASE}
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ORDER BY p.id`,
    );
    return res.json(result.rows.map((row) => mapProduct({ ...row, gallery_images: [] })));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load products' });
  }
});

/** GET /api/products/:id */
router.get('/:id', async (req, res) => {
  try {
    const mapped = await fetchProductMappedWithGallery(pool, req.params.id);
    if (!mapped) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.json(mapped);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load product' });
  }
});

export default router;
