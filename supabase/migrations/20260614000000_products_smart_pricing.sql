-- Mode B: per-product smart pricing assist (admin-only; customer pays list price).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS use_smart_pricing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.use_smart_pricing IS
  'When true, admin sees vendor-cost + margin suggestions. Customer checkout always uses variant list price + central stock.';

-- One pricing rule row per product (upsert assumes single row).
CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_product_id_unique
  ON public.pricing_rules (product_id);
