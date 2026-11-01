-- Minus stock report: include zero on-hand SKUs (stock <= 0) with status label.

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

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  PERFORM public.require_store_access(p_store_id);

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.stock ASC, r.product_name), '[]'::jsonb)
    FROM (
      SELECT
        spi.product_id,
        spi.store_id,
        public.erp_report_product_code(
          p.id,
          p.barcode,
          pv.product_code,
          pv.barcode
        ) AS product_code,
        p.barcode AS product_barcode,
        p.name AS product_name,
        c.name AS category_name,
        b.name AS brand_name,
        s.name AS store_name,
        ROUND(spi.stock, 2) AS stock,
        CASE
          WHEN spi.stock < 0 THEN ROUND(ABS(spi.stock), 2)
          ELSE 0
        END AS shortage_qty,
        CASE
          WHEN spi.stock < 0 THEN
            ROUND(ABS(spi.stock) * COALESCE(spi.purchase_price, p.purchase_price, 0), 2)
          ELSE 0
        END AS shortage_cost,
        ROUND(COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(spi.sales_price, p.price, 0), 2) AS sales_price,
        ROUND(spi.stock * COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS stock_purchase_value,
        ROUND(spi.stock * COALESCE(spi.sales_price, p.price, 0), 2) AS stock_sales_value,
        CASE
          WHEN spi.stock < 0 THEN 'Minus stock'::text
          ELSE 'Zero stock'::text
        END AS stock_status
      FROM public.store_product_inventory spi
      JOIN public.products p ON p.id = spi.product_id
      JOIN public.stores s ON s.id = spi.store_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN LATERAL (
        SELECT v.product_code, v.barcode
        FROM public.product_variants v
        WHERE v.product_id = p.id
        ORDER BY v.created_at ASC, v.id ASC
        LIMIT 1
      ) pv ON true
      WHERE spi.stock <= 0
        AND spi.store_id = p_store_id
        AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
    ) r
  );
END;
$$;

COMMIT;
