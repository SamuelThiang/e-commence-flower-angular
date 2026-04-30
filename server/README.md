# Flower e-commerce API (Express + PostgreSQL)

## Prerequisites

- Node.js 18+
- PostgreSQL — either **local** (database `ecommerce_florist_db` created by you) or **[Neon](https://neon.tech)** (serverless Postgres; no local install)

## Neon (hosted Postgres)

1. Create a project and branch in the [Neon console](https://console.neon.tech).
2. Copy the **connection string** (usually labeled “psql” or “Node”) into `server/.env` as **`DATABASE_URL`**:

   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```

   The API enables TLS automatically when `DATABASE_URL` is set (unless `sslmode=disable` appears in the URL).

3. From `server/`, run schema + migrations + seed (same commands as below). Neon creates the logical database for you; use the database name from your connection string.

For CLI-based setup you can also run `npx neonctl@latest init` ([Neon CLI](https://neon.com/docs/reference/cli-install.md)).

## Setup

1. Copy environment file and edit credentials (do not commit `.env`):

   ```bash
   cd server
   copy .env.example .env
   ```

   **Neon:** set `DATABASE_URL` from the dashboard.

   **Local Postgres:** leave `DATABASE_URL` unset; set `DATABASE_PASSWORD`, and optionally `DATABASE_USER` if not `postgres`.

   Always set `JWT_SECRET` (long random string) for production.

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

   **Order refactor** (`order_items`, `payments`, `inventory`, `cart`, `cart_items` — see `db/migration_001_order_items_payments_inventory_cart.sql`):

   ```bash
   npm run db:migrate-001
   ```

   **Cart line dates + per-line order shipping** (`preferred_delivery_date` on `cart_items`, shipping columns on `order_items`):

   ```bash
   npm run db:migrate-002
   ```

   **`orders.items` JSONB missing** (error: column `items` does not exist — e.g. table created without it or column was dropped):

   ```bash
   npm run db:migrate-003
   ```

   **Google Sign-In** (`google_sub` on `users`, nullable `password_hash` for OAuth-only accounts):

   ```bash
   npm run db:migrate-004
   ```

   Do **not** rely on `npm run db:init` to fix an existing database: `CREATE TABLE IF NOT EXISTS` leaves old tables unchanged. Use migrations or manual `ALTER TABLE` instead.

   After you copy existing JSON lines into `order_items`, drop the legacy column:

   ```sql
   ALTER TABLE orders DROP COLUMN IF EXISTS items;
   ```

   Until the API writes `order_items` / reads from them, keep the `items` column.

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

### Google Sign-In (setup checklist)

1. [Google Cloud Console](https://console.cloud.google.com/) → select or create a project.
2. **APIs & Services** → **OAuth consent screen** → User type **External** → add app name, support email, save. Add scopes `email`, `profile`, `openid` if prompted.
3. **Credentials** → **Create credentials** → **OAuth client ID** → Application type **Web application**.
4. **Authorized JavaScript origins**:  
   `http://localhost:4200` and your production site `https://YOUR-APP.vercel.app` (no trailing slash).
5. **Authorized redirect URIs**: not required for the GIS button flow (popup-less credential); you may leave empty or add `http://localhost:4200` if the console requires one.
6. Copy the **Client ID** (`*.apps.googleusercontent.com`).
7. **Railway** (API): set variable **`GOOGLE_CLIENT_ID`** = that client ID (same string everywhere).
8. **Angular** `src/environments/environment.prod.ts` (and local `environment.ts` for dev): set **`googleClientId`** to the **same** client ID.
9. Run **`npm run db:migrate-004`** on Neon (from `server/`) so `users.google_sub` exists and `password_hash` can be null for Google-only users.

## Endpoints (summary)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/register` | No |
| POST | `/api/auth/login` | No |
| POST | `/api/auth/google` | No — body `{ "credential" }` (Google Identity Services JWT); creates user or signs in |
| POST | `/api/auth/admin-token` | No — body `{ "email", "password" }`; **admin only**; returns JWT for tools (e.g. image upload) |
| GET | `/api/auth/me` | Bearer JWT |
| PATCH | `/api/users/me` | Bearer |
| GET | `/api/addresses` | Bearer |
| GET | `/api/addresses?defaultOnly=true` | Bearer |
| POST | `/api/addresses` | Bearer |
| PATCH | `/api/addresses/:id/default` | Bearer |
| GET | `/api/orders` | Bearer |
| POST | `/api/orders` | Bearer |
| GET | `/api/cart` | Bearer |
| POST | `/api/cart/items` | Bearer |
| PATCH | `/api/cart/items/:lineId` | Bearer |
| DELETE | `/api/cart/items/:lineId` | Bearer |
| DELETE | `/api/cart/all` | Bearer |
| POST | `/api/cart/merge` | Bearer |
| GET | `/api/products` | No |
| GET | `/api/products/:id` | No |
| POST | `/api/products/:id/image` | Admin (JWT **or** `X-Admin-Upload-Key` — see below) |
| GET | `/api/categories` | No |

### Product image upload (`POST /api/products/:id/image`)

- **Body:** `multipart/form-data` with file field **`image`** (JPEG, PNG, WebP, or GIF; max 5 MB).
- **Auth (either):**
  - Bearer JWT for a user whose `users.role` is **`admin`** — promote with  
    `UPDATE users SET role = 'admin' WHERE email = 'you@example.com';`
  - Or set **`ADMIN_UPLOAD_KEY`** in `.env` / Railway and send header **`X-Admin-Upload-Key`** with the same value (no JWT).
- **Response:** JSON product with **`image`** as a **relative path** (e.g. `/uploads/products/1.png`). The Angular app resolves it using **`environment.mediaBaseUrl`** (CDN/S3) when set, otherwise the API origin without `/api`. The DB does **not** store the Railway hostname so URLs stay portable across deploys.

Example (upload key):

```bash
curl -X POST -H "X-Admin-Upload-Key: YOUR_SECRET" -F "image=@./photo.jpg" https://YOUR_API/api/products/1/image
```

**Railway note:** The container filesystem is usually **ephemeral**; redeploys can delete uploaded files. For durable hosting use object storage (S3, Cloudinary, etc.) or attach a **Railway volume** and point uploads at that path.

## Tables

- **users** — accounts (bcrypt password optional if Google-only; **`google_sub`** for OAuth link)
- **addresses** — shipping addresses per user
- **categories** — catalog categories (`slug`, `name`, `sort_order`, **`product_count`** maintained by DB triggers on `products`)
- **products** — catalog (`category_id` → `categories`)
- **orders** — placed orders (`ordered_at`, optional legacy `items` JSONB; prefer **`order_items`** + **`payments`**)
- **order_items** — line items per order (gift-card fields per line)
- **payments** — payment attempts / sandbox gateway audit trail
- **inventory** — stock per product (`quantity`, `reserved_quantity`)
- **cart** / **cart_items** — persisted cart per user (gift-card fields mirror order lines)
- **shop_weekly_hours** — optional; one row per weekday: store open/close and optional delivery dispatch window
- **shop_hours_exceptions** — optional; specific dates (closed or custom hours + note)
