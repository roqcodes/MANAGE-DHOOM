-- Product list metrics without loading every variant/inventory row into Node.
-- Index for store-scoped item-transaction ledger.

BEGIN;

CREATE INDEX IF NOT EXISTS stock_movements_store_created_at_idx
  ON public.stock_movements (store_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_admin_product_catalog_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_active integer := 0;
  v_uncategorized integer := 0;
  v_categories integer := 0;
  v_out_of_stock integer := 0;
  v_inventory_value numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE p.is_active IS TRUE)::int,
    COUNT(*) FILTER (WHERE p.category_id IS NULL)::int
  INTO v_total, v_active, v_uncategorized
  FROM public.products p;

  SELECT COUNT(*)::int INTO v_categories FROM public.categories;

  SELECT COUNT(*)::int INTO v_out_of_stock
  FROM public.products p
  LEFT JOIN (
    SELECT pv.product_id, SUM(COALESCE(inv.stock, 0)) AS qty
    FROM public.product_variants pv
    LEFT JOIN public.inventory inv ON inv.variant_id = pv.id
    GROUP BY pv.product_id
  ) stock ON stock.product_id = p.id
  WHERE COALESCE(stock.qty, 0) < 1;

  SELECT COALESCE(SUM(COALESCE(inv.stock, 0) * COALESCE(pv.price, 0)), 0)
  INTO v_inventory_value
  FROM public.inventory inv
  INNER JOIN public.product_variants pv ON pv.id = inv.variant_id
  WHERE COALESCE(inv.stock, 0) > 0;

  RETURN jsonb_build_object(
    'total', v_total,
    'active', v_active,
    'inactive', GREATEST(0, v_total - v_active),
    'categories_count', v_categories,
    'uncategorized', v_uncategorized,
    'out_of_stock', v_out_of_stock,
    'inventory_value', v_inventory_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_product_catalog_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_product_catalog_stats() TO authenticated;

COMMIT;
