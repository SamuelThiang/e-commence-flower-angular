-- Extra product photos for the storefront detail gallery (primary cover stays on products.image).

CREATE TABLE IF NOT EXISTS product_gallery_images (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  VARCHAR(32)    NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  image       TEXT           NOT NULL,
  sort_order  INTEGER        NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_gallery_images_product_sort
  ON product_gallery_images (product_id, sort_order ASC, created_at ASC);
