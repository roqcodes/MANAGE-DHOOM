-- Minus stock detail: include salesman on invoice rows.

BEGIN;

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

COMMIT;
