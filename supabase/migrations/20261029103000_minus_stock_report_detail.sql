-- Minus stock: catalog-style product codes + detail drill-down (invoices that drove negative).

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_report_product_code(
  p_product_id uuid,
  p_product_barcode text,
  p_variant_code text,
  p_variant_barcode text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(BTRIM(p_variant_code), ''),
    NULLIF(BTRIM(p_variant_barcode), ''),
    NULLIF(BTRIM(p_product_barcode), ''),
    'PRD-' || upper(substr(p_product_id::text, 1, 8))
  );
$$;

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
        ROUND(ABS(spi.stock), 2) AS shortage_qty,
        ROUND(ABS(spi.stock) * COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS shortage_cost,
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
      LEFT JOIN LATERAL (
        SELECT v.product_code, v.barcode
        FROM public.product_variants v
        WHERE v.product_id = p.id
        ORDER BY v.created_at ASC, v.id ASC
        LIMIT 1
      ) pv ON true
      WHERE spi.stock < 0
        AND spi.store_id = p_store_id
        AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_minus_stock_detail(
  p_store_id uuid,
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Store and product are required';
  END IF;

  PERFORM public.require_store_access(p_store_id);

  SELECT jsonb_build_object(
    'product_id', spi.product_id,
    'store_id', spi.store_id,
    'product_code', public.erp_report_product_code(
      p.id,
      p.barcode,
      pv.product_code,
      pv.barcode
    ),
    'product_barcode', NULLIF(BTRIM(p.barcode), ''),
    'product_name', p.name,
    'category_name', c.name,
    'brand_name', b.name,
    'store_name', s.name,
    'current_stock', ROUND(spi.stock, 2),
    'opening_stock_before_negative', ROUND(COALESCE(fn.stock_before, spi.stock), 2),
    'first_negative_at', fn.first_at,
    'latest_invoice_id', li.invoice_id,
    'invoices', COALESCE(inv.invoices, '[]'::jsonb)
  )
  INTO v_payload
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
  LEFT JOIN LATERAL (
    SELECT
      o.created_at AS first_at,
      (o.balance_after - o.quantity) AS stock_before
    FROM (
      SELECT
        sm.created_at,
        sm.id,
        sm.quantity,
        sm.balance_after
      FROM public.stock_movements sm
      WHERE sm.store_id = p_store_id
        AND sm.product_id = p_product_id
        AND sm.balance_after IS NOT NULL
        AND sm.balance_after < 0
      ORDER BY sm.created_at ASC, sm.id ASC
      LIMIT 1
    ) o
  ) fn ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'invoice_id', x.invoice_id,
          'invoice_number', x.invoice_number,
          'invoice_status', x.invoice_status,
          'salesman_name', x.salesman_name,
          'issued_at', x.issued_at,
          'movement_at', x.movement_at,
          'quantity', ROUND(x.quantity, 2),
          'unit_price', ROUND(COALESCE(x.unit_price, 0), 2),
          'line_amount', ROUND(ABS(x.quantity) * COALESCE(x.unit_price, 0), 2),
          'balance_after', ROUND(x.balance_after, 2)
        )
        ORDER BY x.movement_at ASC, x.movement_id ASC
      ),
      '[]'::jsonb
    ) AS invoices
    FROM (
      SELECT
        sm.id AS movement_id,
        sm.created_at AS movement_at,
        sm.quantity,
        sm.transaction_price AS unit_price,
        sm.balance_after,
        i.id AS invoice_id,
        i.invoice_number,
        i.status AS invoice_status,
        COALESCE(NULLIF(BTRIM(sp.full_name), ''), 'Unassigned') AS salesman_name,
        COALESCE(i.issued_at, i.created_at) AS issued_at
      FROM public.stock_movements sm
      JOIN public.invoices i ON i.id = sm.reference_id
      LEFT JOIN public.erp_employees sp ON sp.id = i.sales_person_id
      WHERE sm.store_id = p_store_id
        AND sm.product_id = p_product_id
        AND sm.reference_type = 'invoice'
        AND sm.type = 'sale'
        AND sm.quantity < 0
        AND (
          fn.first_at IS NULL
          OR sm.created_at >= fn.first_at
        )
    ) x
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT x.invoice_id
    FROM (
      SELECT sm.reference_id AS invoice_id
      FROM public.stock_movements sm
      WHERE sm.store_id = p_store_id
        AND sm.product_id = p_product_id
        AND sm.reference_type = 'invoice'
        AND sm.type = 'sale'
        AND sm.quantity < 0
        AND (
          fn.first_at IS NULL
          OR sm.created_at >= fn.first_at
        )
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT 1
    ) x
  ) li ON true
  WHERE spi.store_id = p_store_id
    AND spi.product_id = p_product_id
    AND spi.stock < 0;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Product is not on minus stock for this store';
  END IF;

  RETURN v_payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_report_product_code(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_minus_stock_detail(uuid, uuid) TO authenticated;

COMMIT;
