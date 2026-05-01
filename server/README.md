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

   **Checkout pricing** (`shop_checkout_settings` — priority courier fee MYR, SST-style estimated tax rate, tax base, UI labels; API `GET /api/checkout-settings`, server recomputes order totals from DB prices + these settings):

   ```bash
   npm run db:migrate-007
   ```

   **Product detail gallery** (`product_gallery_images` — extra photos per product; primary cover stays `products.image`; admin `POST /api/products/:id/gallery`):

   ```bash
   npm run db:migrate-008
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

**Order statuses** (column `orders.status`): **`Failed`** (unpaid or FPX declined — retry payment), **`Processing`** (paid — shop preparing), **`In Transit`** (courier delivery), **`Ready`** (self-pickup ready), **`Completed`** (done). Legacy **`Delivered`** → **`Completed`** (**`npm run db:migrate-005`**). If you still have **`Awaiting payment`** from an older build, run **`npm run db:migrate-006`**.

Payment code layout (gateway-agnostic entrypoint, ToyyibPay isolated): `src/routes/paymentRoutes.js` → `src/controllers/paymentController.js` → `src/services/toyyibpayService.js` (+ `src/config/toyyibpay.js`, `src/constants/paymentGateways.js`). Add another gateway by creating `ipay88Service.js` (or similar) and wiring routes/controllers without changing order placement.

### ToyyibPay (sandbox / production)

Official API reference: [toyyibpay.com/apireference](https://toyyibpay.com/apireference/) (Create Bill, callback hash, return URL query params, Get Bill Transactions).

1. Register at [dev.toyyibpay.com](https://dev.toyyibpay.com/) (sandbox) or [toyyibpay.com](https://toyyibpay.com/) (live).
2. In the dashboard, create a **Category** and copy **Category Code** and your **User Secret Key**.
3. In `server/.env` set:
   - `TOYYIBPAY_ENABLED=true`
   - `TOYYIBPAY_USER_SECRET_KEY=...`
   - `TOYYIBPAY_CATEGORY_CODE=...`
   - `TOYYIBPAY_API_BASE=https://dev.toyyibpay.com` (sandbox) or `https://toyyibpay.com` (production)
   - `FRONTEND_ORIGIN=http://localhost:4200` (first origin is used for the customer **return** URL: `/checkout/payment-return`)
   - Optional `TOYYIBPAY_CALLBACK_URL=https://YOUR_PUBLIC_HOST/api/payments/toyyibpay/callback` — **server-side** callback (ToyyibPay cannot POST to `localhost`; use a tunnel such as ngrok for local testing, or rely on return URL + manual status checks for quick sandbox trials).

When enabled, **POST /api/orders** saves the order as **`Failed`** (pending FPX), inserts a `payments` row, creates a ToyyibPay bill, and returns JSON `{ ..., "payment": { "paymentUrl", "billCode" } }`. The Angular checkout redirects the browser to `paymentUrl`. After payment, ToyyibPay redirects the shopper back with query params; the optional callback verifies an **MD5** hash and moves the order to **`Processing`** when `status=1`. FPX failure (`status=3`) sets the order to **`Failed`**.

On **localhost**, ToyyibPay **cannot** POST to your callback URL — **`sync-return`** on **`/checkout/payment-return`** confirms payment via **Get Bill Transactions** and moves **`Failed` → `Processing`** like the callback.

**Troubleshooting “missing BillCode” / payment link failed:** ToyyibPay returned JSON **without** `BillCode` — usually wrong **User Secret Key**, wrong **Category Code** (must be the **Category Code** from *Create Category* / dashboard, **not** a bill code), inactive category, or validation (email/amount). Use **[dev.toyyibpay.com](https://dev.toyyibpay.com/)** credentials only with `TOYYIBPAY_API_BASE=https://dev.toyyibpay.com`. Set **`TOYYIBPAY_FALLBACK_EMAIL`** if needed. **Restart the API** after changing `.env` (`npm run dev` in `server/` auto-restarts on file save; plain `npm start` does not). Check the terminal for `[ToyyibPay createBill] failed — full response:` — the checkout dialog also appends a **Raw:** excerpt from ToyyibPay.

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
| POST | `/api/orders` | Bearer — **`total` in body is ignored**; server sums **`products.price`** × qty + courier fee + estimated SST from **`shop_checkout_settings`** |
| GET | `/api/checkout-settings` | No — courier fee MYR, SST rate %, tax base, labels for cart/checkout |
| PATCH | `/api/orders/:id/status` | Bearer + **admin** `users.role` — body `{ "status" }`; allowed: `Failed`, `Processing`, `In Transit`, `Ready`, `Completed` |
| POST | `/api/payments/toyyibpay/callback` | No — form body from ToyyibPay (set `TOYYIBPAY_CALLBACK_URL` to this path on a public URL; **localhost cannot receive this**) |
| POST | `/api/payments/toyyibpay/sync-return` | Bearer — body `{ billCode, orderId }`; verifies payment via ToyyibPay **Get Bill Transactions** (used after Return URL on dev/local) |
| GET | `/api/cart` | Bearer |
| POST | `/api/cart/items` | Bearer |
| PATCH | `/api/cart/items/:lineId` | Bearer |
| DELETE | `/api/cart/items/:lineId` | Bearer |
| DELETE | `/api/cart/all` | Bearer |
| POST | `/api/cart/merge` | Bearer |
| GET | `/api/products` | No |
| POST | `/api/products` | Admin — JSON **`{ id, name, categoryId \| categorySlug, price, description, image?, seasonal?, exclusive?, limited? }`**; then **`POST …/:id/image`** for file upload |
| GET | `/api/products/:id` | No |
| POST | `/api/products/:id/image` | Admin — multipart **`image`**; sets primary **`products.image`** (detail hero + listings) |
| POST | `/api/products/:id/gallery` | Admin — multipart **`image`**; appends one extra detail-gallery file (`id_g_<uuid>.ext`, stored in **`product_gallery_images`**) |
| POST | `/api/products/:id/gallery-url` | Admin — JSON **`{ "image": "https://..." }`** (or **`imageUrl`** / **`url`**); stores full URL (e.g. Cloudinary) in **`product_gallery_images`** — no file upload |
| DELETE | `/api/products/:id/gallery/:galleryRowId` | Admin — removes one gallery row by **`galleryRowId`** (UUID from DB); does **not** change primary image |
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

**Extra detail photos** (`POST /api/products/:id/gallery`, same auth): multipart field **`image`** — call once per file. The storefront detail page shows **primary** (`…/image`) as the large image and as the **first** thumbnail, then each gallery upload as additional thumbnails.

```bash
curl -X POST -H "X-Admin-Upload-Key: YOUR_SECRET" -F "image=@./detail2.jpg" https://YOUR_API/api/products/1/gallery
```

**Gallery via CDN URL** (`POST /api/products/:id/gallery-url`): JSON body, same admin auth — full URL is saved in **`product_gallery_images.image`** (Angular resolves absolute URLs as-is).

```bash
curl -X POST -H "X-Admin-Upload-Key: YOUR_SECRET" -H "Content-Type: application/json" \
  -d "{\"image\":\"https://res.cloudinary.com/your-cloud/image/upload/v123/sample.webp\"}" \
  https://YOUR_API/api/products/1/gallery-url
```

**Railway note:** The container filesystem is usually **ephemeral**; redeploys can delete uploaded files. For durable hosting use object storage (S3, Cloudinary, etc.) or attach a **Railway volume** and point uploads at that path.

## Tables

- **users** — accounts (bcrypt password optional if Google-only; **`google_sub`** for OAuth link)
- **addresses** — shipping addresses per user
- **categories** — catalog categories (`slug`, `name`, `sort_order`, **`product_count`** maintained by DB triggers on `products`)
- **products** — catalog (`category_id` → `categories`)
- **product_gallery_images** — optional extra photos for product detail (`product_id`, `image`, `sort_order`); primary listing image remains **`products.image`**
- **orders** — placed orders (`ordered_at`, optional legacy `items` JSONB; prefer **`order_items`** + **`payments`**)
- **order_items** — line items per order (gift-card fields per line)
- **payments** — payment attempts / sandbox gateway audit trail
- **inventory** — stock per product (`quantity`, `reserved_quantity`)
- **cart** / **cart_items** — persisted cart per user (gift-card fields mirror order lines)
- **shop_checkout_settings** — singleton (`id = 1`): **priority_courier_fee_myr**, **sst_service_tax_rate_percent**, **tax_base** (`subtotal` \| `subtotal_and_delivery` \| `delivery_only` \| `none`), **courier_fee_label**, **tax_display_label** — adjust in SQL (no admin UI yet)
- **shop_weekly_hours** — optional; one row per weekday: store open/close and optional delivery dispatch window
- **shop_hours_exceptions** — optional; specific dates (closed or custom hours + note)
