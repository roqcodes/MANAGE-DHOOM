-- Fix item stock reports: product_variants uses `price`, not `sales_price`.
-- Store-level prices live on store_inventory.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_item_stock_report(
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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.product_name), '[]'::jsonb)
    FROM (
      SELECT
        pv.id AS variant_id,
        p.name AS product_name,
        pv.name AS variant_name,
        pv.barcode,
        s.name AS store_name,
        si.store_id,
        ROUND(COALESCE(si.stock, 0), 2) AS stock,
        ROUND(COALESCE(si.reserved_stock, 0), 2) AS reserved_stock,
        ROUND(COALESCE(si.stock, 0) - COALESCE(si.reserved_stock, 0), 2) AS available_stock,
        ROUND(COALESCE(si.purchase_price, pv.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(si.sales_price, pv.price, 0), 2) AS sales_price
      FROM public.store_inventory si
      JOIN public.product_variants pv ON pv.id = si.variant_id
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.stores s ON s.id = si.store_id
      WHERE (p_store_id IS NULL OR si.store_id = p_store_id)
        AND COALESCE(si.stock, 0) <> 0
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_store_wise_stock_report()
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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.store_name), '[]'::jsonb)
    FROM (
      SELECT
        s.id AS store_id,
        s.name AS store_name,
        COUNT(DISTINCT si.variant_id) AS sku_count,
        ROUND(COALESCE(SUM(si.stock), 0), 2) AS total_stock,
        ROUND(COALESCE(SUM(si.reserved_stock), 0), 2) AS total_reserved,
        ROUND(
          COALESCE(SUM(si.stock * COALESCE(si.purchase_price, pv.purchase_price, 0)), 0),
          2
        ) AS stock_value_at_cost
      FROM public.stores s
      LEFT JOIN public.store_inventory si ON si.store_id = s.id
      LEFT JOIN public.product_variants pv ON pv.id = si.variant_id
      GROUP BY s.id, s.name
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_item_stock_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_store_wise_stock_report() TO authenticated;

COMMIT;
