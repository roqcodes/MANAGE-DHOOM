-- Faster ILIKE / prefix product picker search (name + barcode).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name extensions.gin_trgm_ops)
  WHERE is_active = true AND item_type = 'goods';

CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm
  ON public.products USING gin (barcode extensions.gin_trgm_ops)
  WHERE is_active = true AND item_type = 'goods' AND barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_active_goods_name
  ON public.products (name text_pattern_ops)
  WHERE is_active = true AND item_type = 'goods';
