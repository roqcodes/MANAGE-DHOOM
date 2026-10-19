-- Purchase catalog typeahead: prefill rate = store WAC when set, else product catalog purchase cost.

BEGIN;

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
    CASE
      WHEN spi.purchase_price IS NOT NULL AND spi.purchase_price > 0 THEN spi.purchase_price
      ELSE p.purchase_price
    END,
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
    CASE
      WHEN spi.purchase_price IS NOT NULL AND spi.purchase_price > 0 THEN spi.purchase_price
      ELSE p.purchase_price
    END,
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
    CASE
      WHEN spi.purchase_price IS NOT NULL AND spi.purchase_price > 0 THEN spi.purchase_price
      ELSE p.purchase_price
    END,
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

COMMIT;
