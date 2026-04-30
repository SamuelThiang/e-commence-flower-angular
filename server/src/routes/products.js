import { Router } from 'express';

import { pool } from '../db.js';



const router = Router();



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

