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

/** Absolute Cloudinary/CDN URL or `/uploads/products/...` path */
async function appendGalleryImageRow(poolOrClient, productId, image) {
  const maxRow = await poolOrClient.query(
    `SELECT COALESCE(MAX(sort_order), -1)::int AS m
     FROM product_gallery_images WHERE product_id = $1`,
    [productId],
  );
  const nextOrder = Number(maxRow.rows[0].m) + 1;
  await poolOrClient.query(
    `INSERT INTO product_gallery_images (product_id, image, sort_order)
     VALUES ($1, $2, $3)`,
    [productId, image, nextOrder],
  );
}

/** Accept `image`, `imageUrl`, or `url` — must be http(s). */
function parseRemoteGalleryImageUrl(body) {
  const raw = body?.image ?? body?.imageUrl ?? body?.url;
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length === 0 || s.length > 4096) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return s;
  } catch {
    return null;
  }
}

async function resolveCategoryUuid(poolOrClient, body) {
  const rawId = body.categoryId ?? body.category_id;
  const rawSlug = body.categorySlug ?? body.category_slug;
  if (rawId != null && String(rawId).trim() !== '') {
    const idStr = String(rawId).trim();
    const r = await poolOrClient.query(
      `SELECT id FROM categories WHERE id::text = $1 LIMIT 1`,
      [idStr],
    );
    if (r.rowCount > 0) return r.rows[0].id;
  }
  if (rawSlug != null && String(rawSlug).trim() !== '') {
    const r = await poolOrClient.query(
      `SELECT id FROM categories WHERE slug = $1 LIMIT 1`,
      [String(rawSlug).trim()],
    );
    if (r.rowCount > 0) return r.rows[0].id;
  }
  return null;
}

/**
 * POST /api/products
 * JSON body: admin-only create. Then use POST /api/products/:id/image (and optional /gallery) for uploads.
 */
router.post('/', productImageUploadAuth, async (req, res) => {
  const body = req.body || {};
  const id =
    body.id != null && String(body.id).trim() !== ''
      ? String(body.id).trim().slice(0, 32)
      : '';
  const name = body.name != null ? String(body.name).trim() : '';
  const description =
    body.description != null ? String(body.description).trim() : '';
  const price = Number(body.price);
  const image =
    body.image != null && String(body.image).trim() !== ''
      ? String(body.image).trim()
      : '';
  const seasonal = Boolean(body.seasonal);
  const exclusive = Boolean(body.exclusive);
  const limited = Boolean(body.limited);

  if (!id || !name || !description || !Number.isFinite(price) || price < 0) {
    return res.status(400).json({
      error:
        'Invalid body: need id (max 32 chars), name, description, price (number >= 0), and categoryId or categorySlug',
    });
  }

  try {
    const categoryId = await resolveCategoryUuid(pool, body);
    if (!categoryId) {
      return res.status(400).json({
        error:
          'Unknown category: set categoryId (UUID) or categorySlug (e.g. from GET /api/categories)',
      });
    }

    await pool.query(
      `INSERT INTO products (id, name, category_id, price, image, description,
         seasonal, exclusive, limited, order_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)`,
      [
        id,
        name,
        categoryId,
        price,
        image,
        description,
        seasonal,
        exclusive,
        limited,
      ],
    );

    const mapped = await fetchProductMappedWithGallery(pool, id);
    return res.status(201).json(mapped);
  } catch (e) {
    if (e && e.code === '23505') {
      return res.status(409).json({ error: 'Product id already exists' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to create product' });
  }
});

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
        const ct = String(req.headers['content-type'] || '');
        const rawImg = req.body?.image ?? req.body?.imageUrl ?? req.body?.url;
        const looksLikeUrl =
          typeof rawImg === 'string' && /^https?:\/\//i.test(rawImg.trim());
        if (ct.includes('application/json') || looksLikeUrl) {
          const id = req.params.id;
          return res.status(400).json({
            error:
              'Wrong endpoint for JSON / URLs: use POST /api/products/:id/gallery-url with body { "image": "https://..." }.',
            usePath: `/api/products/${id}/gallery-url`,
          });
        }
        return res.status(400).json({
          error: 'Missing file field "image"',
          hint:
            'Body must be form-data with key "image" (type File). For Cloudinary/HTTPS URLs use POST .../gallery-url and JSON instead.',
        });
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

      await appendGalleryImageRow(pool, productId, relativeImagePath);

      const mapped = await fetchProductMappedWithGallery(pool, productId);
      return res.json(mapped);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to add gallery image' });
    }
  },
);

/**
 * POST /api/products/:id/gallery-url
 * JSON body: `{ "image": "https://..." }` (or `imageUrl` / `url`). Stores full URL in product_gallery_images — no file upload (e.g. Cloudinary).
 */
router.post('/:id/gallery-url', productImageUploadAuth, async (req, res) => {
  const productId = req.params.id;
  const imageUrl = parseRemoteGalleryImageUrl(req.body || {});
  if (!imageUrl) {
    return res.status(400).json({
      error:
        'Provide a JSON body with image (or imageUrl / url): full https URL of the picture',
    });
  }
  try {
    const exists = await pool.query(`SELECT 1 FROM products WHERE id = $1`, [
      productId,
    ]);
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await appendGalleryImageRow(pool, productId, imageUrl);

    const mapped = await fetchProductMappedWithGallery(pool, productId);
    return res.json(mapped);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to add gallery image URL' });
  }
});

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
