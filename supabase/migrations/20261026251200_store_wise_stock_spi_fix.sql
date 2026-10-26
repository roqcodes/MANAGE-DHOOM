-- Store-wise stock: aggregate store_product_inventory (not legacy store_inventory).

BEGIN;

DROP FUNCTION IF EXISTS public.get_erp_store_wise_stock_report();
DROP FUNCTION IF EXISTS public.get_erp_store_wise_stock_report(uuid);

CREATE OR REPLACE FUNCTION public.get_erp_store_wise_stock_report(
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  PERFORM public.require_store_access(p_store_id);

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.store_name), '[]'::jsonb)
    FROM (
      SELECT
        s.id AS store_id,
        s.name AS store_name,
        COALESCE(agg.sku_count, 0) AS sku_count,
        ROUND(COALESCE(agg.total_stock, 0), 2) AS total_stock,
        0::numeric AS total_reserved,
        ROUND(COALESCE(agg.stock_value_at_cost, 0), 2) AS stock_value_at_cost
      FROM public.stores s
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT spi.product_id) FILTER (
            WHERE COALESCE(spi.stock, 0) <> 0
          ) AS sku_count,
          SUM(COALESCE(spi.stock, 0)) AS total_stock,
          SUM(
            COALESCE(spi.stock, 0)
            * COALESCE(spi.purchase_price, p.purchase_price, 0)
          ) AS stock_value_at_cost
        FROM public.store_product_inventory spi
        INNER JOIN public.products p
          ON p.id = spi.product_id
         AND p.item_type = 'goods'
        WHERE spi.store_id = s.id
      ) agg ON true
      WHERE s.is_active IS DISTINCT FROM false
      ORDER BY s.name
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_store_wise_stock_report(uuid) TO authenticated;

COMMIT;
