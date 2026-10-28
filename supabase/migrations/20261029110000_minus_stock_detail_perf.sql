-- Faster minus-stock detail: targeted indexes + single-pass sale movement scan.

BEGIN;

CREATE INDEX IF NOT EXISTS stock_movements_store_product_sale_invoice_idx
  ON public.stock_movements (store_id, product_id, created_at ASC, id ASC)
  WHERE reference_type = 'invoice'
    AND type = 'sale'
    AND quantity < 0;

CREATE INDEX IF NOT EXISTS stock_movements_store_product_negative_balance_idx
  ON public.stock_movements (store_id, product_id, created_at ASC, id ASC)
  WHERE balance_after IS NOT NULL
    AND balance_after < 0;

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

  WITH first_neg AS (
    SELECT
      sm.created_at AS first_at,
      (sm.balance_after - sm.quantity) AS stock_before
    FROM public.stock_movements sm
    WHERE sm.store_id = p_store_id
      AND sm.product_id = p_product_id
      AND sm.balance_after IS NOT NULL
      AND sm.balance_after < 0
    ORDER BY sm.created_at ASC, sm.id ASC
    LIMIT 1
  ),
  sale_moves AS (
    SELECT
      sm.id AS movement_id,
      sm.created_at AS movement_at,
      sm.quantity,
      sm.transaction_price AS unit_price,
      sm.balance_after,
      sm.reference_id AS invoice_id
    FROM public.stock_movements sm
    WHERE sm.store_id = p_store_id
      AND sm.product_id = p_product_id
      AND sm.reference_type = 'invoice'
      AND sm.type = 'sale'
      AND sm.quantity < 0
  ),
  filtered AS (
    SELECT s.*
    FROM sale_moves s
    LEFT JOIN first_neg fn ON true
    WHERE fn.first_at IS NULL OR s.movement_at >= fn.first_at
  ),
  invoice_rows AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'invoice_id', f.invoice_id,
            'invoice_number', i.invoice_number,
            'invoice_status', i.status,
            'salesman_name', COALESCE(NULLIF(BTRIM(sp.full_name), ''), 'Unassigned'),
            'issued_at', COALESCE(i.issued_at, i.created_at),
            'movement_at', f.movement_at,
            'quantity', ROUND(f.quantity, 2),
            'unit_price', ROUND(COALESCE(f.unit_price, 0), 2),
            'line_amount', ROUND(ABS(f.quantity) * COALESCE(f.unit_price, 0), 2),
            'balance_after', ROUND(f.balance_after, 2)
          )
          ORDER BY f.movement_at ASC, f.movement_id ASC
        )
        FROM filtered f
        JOIN public.invoices i ON i.id = f.invoice_id
        LEFT JOIN public.erp_employees sp ON sp.id = i.sales_person_id
      ),
      '[]'::jsonb
    ) AS invoices
  ),
  latest AS (
    SELECT f.invoice_id
    FROM filtered f
    ORDER BY f.movement_at DESC, f.movement_id DESC
    LIMIT 1
  )
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
    'latest_invoice_id', lat.invoice_id,
    'invoices', COALESCE(ir.invoices, '[]'::jsonb)
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
  LEFT JOIN first_neg fn ON true
  CROSS JOIN invoice_rows ir
  LEFT JOIN latest lat ON true
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
