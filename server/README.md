# Flower e-commerce API (Express + PostgreSQL)

## Prerequisites

- Node.js 18+
- PostgreSQL with database `ecommerce_florist_db` already created

## Setup

1. Copy environment file and edit credentials (do not commit `.env`):

   ```bash
   cd server
   copy .env.example .env
   ```

   Set `DATABASE_PASSWORD`, `JWT_SECRET` (long random string), and optionally `DATABASE_USER` if not `postgres`.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create tables:

   ```bash
   npm run db:init
   ```

   **Upgrading** an older database that still has `products.category` (text) instead of `products.category_id`:

   ```bash
   npm run db:migrate-categories
   ```

   **Adding `categories.product_count`** (and triggers) on a DB created before that column existed:

   ```bash
   npm run db:patch-product-count
   ```

   **Shop hours tables only** (optional; `shop_weekly_hours` + `shop_hours_exceptions`):

   ```bash
   npm run db:shop-hours
   ```

4. Seed categories and products (from `data/products.json`):

   ```bash
   npm run seed
   ```

5. Start the API:

   ```bash
   npm start
   ```

   Dev with auto-restart: `npm run dev`

API base URL: `http://localhost:3000/api`

## Endpoints (summary)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/register` | No |
| POST | `/api/auth/login` | No |
| GET | `/api/auth/me` | Bearer JWT |
| PATCH | `/api/users/me` | Bearer |
| GET | `/api/addresses` | Bearer |
| GET | `/api/addresses?defaultOnly=true` | Bearer |
| POST | `/api/addresses` | Bearer |
| PATCH | `/api/addresses/:id/default` | Bearer |
| GET | `/api/orders` | Bearer |
| POST | `/api/orders` | Bearer |
| GET | `/api/products` | No |
| GET | `/api/products/:id` | No |
| GET | `/api/categories` | No |

## Tables

- **users** — accounts (bcrypt password, profile)
- **addresses** — shipping addresses per user
- **categories** — catalog categories (`slug`, `name`, `sort_order`, **`product_count`** maintained by DB triggers on `products`)
- **products** — catalog (`category_id` → `categories`)
- **orders** — placed orders (`items` stored as JSONB)
- **shop_weekly_hours** — optional; one row per weekday: store open/close and optional delivery dispatch window
- **shop_hours_exceptions** — optional; specific dates (closed or custom hours + note)
