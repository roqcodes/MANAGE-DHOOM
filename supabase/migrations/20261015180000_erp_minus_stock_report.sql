-- Minus (negative) store stock report.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_minus_stock_report(
  p_store_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.stock ASC, r.product_name), '[]'::jsonb)
    FROM (
      SELECT
        spi.product_id,
        spi.store_id,
        COALESCE(p.barcode, p.id::text) AS product_code,
        p.name AS product_name,
        c.name AS category_name,
        b.name AS brand_name,
        s.name AS store_name,
        ROUND(spi.stock, 2) AS stock,
        ROUND(ABS(spi.stock), 2) AS shortage_qty,
        ROUND(COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(spi.sales_price, p.price, 0), 2) AS sales_price,
        ROUND(spi.stock * COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS stock_purchase_value,
        ROUND(spi.stock * COALESCE(spi.sales_price, p.price, 0), 2) AS stock_sales_value,
        'Minus stock'::text AS stock_status
      FROM public.store_product_inventory spi
      JOIN public.products p ON p.id = spi.product_id
      JOIN public.stores s ON s.id = spi.store_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      WHERE spi.stock < 0
        AND (p_store_id IS NULL OR spi.store_id = p_store_id)
        AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_minus_stock_report(uuid, uuid, uuid) TO authenticated;

COMMIT;
