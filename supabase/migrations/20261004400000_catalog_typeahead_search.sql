-- Typeahead for product/customer pickers: prefix + trigram indexes, one SQL round-trip.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_products_active_goods_name_prefix
  ON public.products (name text_pattern_ops)
  WHERE is_active = true AND item_type = 'goods';

CREATE INDEX IF NOT EXISTS idx_products_active_goods_barcode
  ON public.products (barcode)
  WHERE is_active = true AND item_type = 'goods' AND   barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name extensions.gin_trgm_ops)
  WHERE is_active = true AND item_type = 'goods';

CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm
  ON public.products USING gin (barcode extensions.gin_trgm_ops)
  WHERE is_active = true AND item_type = 'goods' AND barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_product_inventory_store_product
  ON public.store_product_inventory (store_id, product_id)
  INCLUDE (stock, sales_price);

CREATE INDEX IF NOT EXISTS idx_users_customer_name_trgm
  ON public.users USING gin (name extensions.gin_trgm_ops)
  WHERE role IS NULL OR role = 'customer';

CREATE INDEX IF NOT EXISTS idx_users_customer_email_trgm
  ON public.users USING gin (email extensions.gin_trgm_ops)
  WHERE role IS NULL OR role = 'customer';

CREATE INDEX IF NOT EXISTS idx_users_customer_phone_trgm
  ON public.users USING gin (phone extensions.gin_trgm_ops)
  WHERE role IS NULL OR role = 'customer';

CREATE OR REPLACE FUNCTION public.erp_search_catalog_products(
  p_query text,
  p_store_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  name text,
  barcode text,
  price numeric,
  purchase_price numeric,
  tax_rate_percent numeric,
  available_stock numeric,
  sales_price numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_q text := btrim(COALESCE(p_query, ''));
  v_escaped text;
  v_prefix text;
  v_contains text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
BEGIN
  IF v_q = '' THEN
    RETURN;
  END IF;

  v_escaped := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_prefix := v_escaped || '%';
  v_contains := '%' || v_escaped || '%';

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.barcode,
    p.price,
    p.purchase_price,
    p.tax_rate_percent,
    COALESCE(spi.stock, 0)::numeric,
    COALESCE(spi.sales_price, p.price)
  FROM public.products p
  LEFT JOIN public.store_product_inventory spi
    ON spi.product_id = p.id
   AND p_store_id IS NOT NULL
   AND spi.store_id = p_store_id
  WHERE p.is_active = true
    AND p.item_type = 'goods'
    AND p.barcode = v_q
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.barcode,
    p.price,
    p.purchase_price,
    p.tax_rate_percent,
    COALESCE(spi.stock, 0)::numeric,
    COALESCE(spi.sales_price, p.price)
  FROM public.products p
  LEFT JOIN public.store_product_inventory spi
    ON spi.product_id = p.id
   AND p_store_id IS NOT NULL
   AND spi.store_id = p_store_id
  WHERE p.is_active = true
    AND p.item_type = 'goods'
    AND (p.name ILIKE v_prefix ESCAPE '\' OR p.barcode ILIKE v_prefix ESCAPE '\')
  ORDER BY p.name
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.barcode,
    p.price,
    p.purchase_price,
    p.tax_rate_percent,
    COALESCE(spi.stock, 0)::numeric,
    COALESCE(spi.sales_price, p.price)
  FROM public.products p
  LEFT JOIN public.store_product_inventory spi
    ON spi.product_id = p.id
   AND p_store_id IS NOT NULL
   AND spi.store_id = p_store_id
  WHERE p.is_active = true
    AND p.item_type = 'goods'
    AND (p.name ILIKE v_contains ESCAPE '\' OR p.barcode ILIKE v_contains ESCAPE '\')
  ORDER BY p.name
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_search_catalog_products(text, uuid, integer) TO authenticated;
