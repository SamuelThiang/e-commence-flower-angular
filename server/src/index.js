import express from 'express';

import cors from 'cors';

import dotenv from 'dotenv';



import authRoutes from './routes/auth.js';

import usersRoutes from './routes/users.js';

import addressesRoutes from './routes/addresses.js';

import ordersRoutes from './routes/orders.js';

import cartRoutes from './routes/cart.js';

import productsRoutes from './routes/products.js';

import categoriesRoutes from './routes/categories.js';



dotenv.config();

/** Comma-separated list, e.g. `https://app.vercel.app,http://localhost:4200` */
function allowedOrigins() {
  const raw = process.env.FRONTEND_ORIGIN || 'http://localhost:4200';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const app = express();

const port = Number(process.env.PORT) || 3000;

app.use(
  cors({
    origin(origin, cb) {
      const allowed = allowedOrigins();
      if (!origin) {
        cb(null, true);
        return;
      }
      if (allowed.includes(origin)) {
        cb(null, true);
        return;
      }
      console.warn(`CORS rejected origin="${origin}" allow FRONTEND_ORIGIN=${JSON.stringify(allowed)}`);
      cb(null, false);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '10mb' }));



app.get('/api/health', (_req, res) => {

  res.json({ ok: true });

});



app.use('/api/auth', authRoutes);

app.use('/api/users', usersRoutes);

app.use('/api/addresses', addressesRoutes);

app.use('/api/orders', ordersRoutes);

app.use('/api/cart', cartRoutes);

app.use('/api/products', productsRoutes);

app.use('/api/categories', categoriesRoutes);



app.use((err, _req, res, _next) => {

  console.error(err);

  res.status(500).json({ error: 'Internal server error' });

});



app.listen(port, () => {

  console.log(`API listening on http://localhost:${port}`);

});

