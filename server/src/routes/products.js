import fs from 'fs';
import path from 'path';
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

function publicUploadsBase(req) {
  const configured = process.env.PUBLIC_API_BASE_URL?.replace(/\/$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

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

  };

}

/**
 * POST /api/products/:id/image
 * Multipart field name: `image`. Auth: admin JWT, or X-Admin-Upload-Key when ADMIN_UPLOAD_KEY is set.
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

      const url = `${publicUploadsBase(req)}/uploads/products/${encodeURIComponent(filename)}`;

      await pool.query(`UPDATE products SET image = $1 WHERE id = $2`, [
        url,
        productId,
      ]);

      const result = await pool.query(
        `SELECT p.id, p.name, c.name AS category, c.id::text AS category_id,
                p.price, p.image, p.description,
                p.seasonal, p.exclusive, p.limited, p.order_count
         FROM products p
         JOIN categories c ON c.id = p.category_id
         WHERE p.id = $1`,
        [productId],
      );
      return res.json(mapProduct(result.rows[0]));
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to update product image' });
    }
  },
);

/** GET /api/products */

router.get('/', async (_req, res) => {

  try {

    const result = await pool.query(

      `SELECT p.id, p.name, c.name AS category, c.id::text AS category_id,

              p.price, p.image, p.description,

              p.seasonal, p.exclusive, p.limited, p.order_count

       FROM products p

       JOIN categories c ON c.id = p.category_id

       ORDER BY p.id`,

    );

    return res.json(result.rows.map(mapProduct));

  } catch (e) {

    console.error(e);

    return res.status(500).json({ error: 'Failed to load products' });

  }

});



/** GET /api/products/:id */

router.get('/:id', async (req, res) => {

  try {

    const result = await pool.query(

      `SELECT p.id, p.name, c.name AS category, c.id::text AS category_id,

              p.price, p.image, p.description,

              p.seasonal, p.exclusive, p.limited, p.order_count

       FROM products p

       JOIN categories c ON c.id = p.category_id

       WHERE p.id = $1`,

      [req.params.id],

    );

    if (result.rowCount === 0) {

      return res.status(404).json({ error: 'Product not found' });

    }

    return res.json(mapProduct(result.rows[0]));

  } catch (e) {

    console.error(e);

    return res.status(500).json({ error: 'Failed to load product' });

  }

});



export default router;

