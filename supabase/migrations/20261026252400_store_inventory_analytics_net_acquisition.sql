-- Store inventory product analytics: purchase stats on net acquisition (discount + landed).

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_bill_line_net_unit(
  p_purchase_price numeric,
  p_quantity numeric,
  p_landed_allocated numeric,
  p_discount_allocated numeric,
  p_unit_net numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_unit_net IS NOT NULL AND p_unit_net::text <> 'NaN'
        THEN p_unit_net
      WHEN COALESCE(p_quantity, 0) > 0 THEN
        ROUND(
          (
            GREATEST(0, p_quantity) * COALESCE(p_purchase_price, 0)
            + GREATEST(0, COALESCE(p_landed_allocated, 0))
            - GREATEST(0, COALESCE(p_discount_allocated, 0))
          ) / p_quantity,
          4
        )
      ELSE COALESCE(p_purchase_price, 0)
    END;
$$;

CREATE OR REPLACE FUNCTION public.erp_store_inventory_product_analytics(
  p_product_id uuid,
  p_store_id uuid,
  p_recent_limit integer DEFAULT 15,
  p_movement_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_purchase jsonb;
  v_sales jsonb;
  v_movements jsonb;
  v_central_stock numeric := 0;
  v_recent_limit integer := GREATEST(1, LEAST(COALESCE(p_recent_limit, 15), 50));
  v_movement_limit integer := GREATEST(1, LEAST(COALESCE(p_movement_limit, 25), 100));
BEGIN
  IF v_uid IS NULL OR NOT public.is_staff_user(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  SELECT COALESCE(SUM(i.stock), 0)
  INTO v_central_stock
  FROM public.product_variants v
  JOIN public.inventory i
    ON i.variant_id = v.id AND i.store_id = p_store_id
  WHERE v.product_id = p_product_id;

  WITH line_costs AS (
    SELECT
      l.id AS line_id,
      l.quantity,
      l.purchase_price,
      l.landed_cost_allocated,
      l.discount_allocated,
      l.line_total,
      public.erp_bill_line_loaded_unit(
        l.purchase_price,
        l.quantity,
        l.landed_cost_allocated,
        l.unit_loaded_cost
      ) AS loaded_unit,
      public.erp_bill_line_net_unit(
        l.purchase_price,
        l.quantity,
        l.landed_cost_allocated,
        l.discount_allocated,
        l.unit_net_acquisition_cost
      ) AS net_unit,
      b.id AS bill_id,
      b.purchase_bill_number,
      b.purchase_date,
      b.created_at AS bill_created_at,
      ven.name AS vendor_name,
      COALESCE(b.purchase_date::text, left(b.created_at::text, 10)) AS bill_date_sort
    FROM public.erp_purchase_bill_lines l
    INNER JOIN public.erp_purchase_bills b ON b.id = l.purchase_bill_id
    LEFT JOIN public.vendors ven ON ven.id = b.vendor_id
    WHERE l.product_id = p_product_id
      AND b.store_id = p_store_id
      AND b.status IS DISTINCT FROM 'cancelled'
      AND COALESCE(l.quantity, 0) > 0
  ),
  purchase_stats AS (
    SELECT
      MIN(net_unit) AS min_unit_cost,
      MAX(net_unit) AS max_unit_cost,
      CASE
        WHEN SUM(quantity) > 0
          THEN SUM(net_unit * quantity) / SUM(quantity)
        ELSE NULL
      END AS avg_unit_cost,
      SUM(quantity) AS total_qty,
      COUNT(*)::integer AS purchase_count
    FROM line_costs
  ),
  purchase_recent AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'lineId', line_id,
        'billId', bill_id,
        'billNumber', COALESCE(purchase_bill_number, left(bill_id::text, 8)),
        'billDate', COALESCE(purchase_date::text, left(bill_created_at::text, 10)),
        'vendorName', vendor_name,
        'quantity', quantity,
        'unitPrice', purchase_price,
        'landedCostAllocated',
          CASE
            WHEN landed_cost_allocated IS NOT NULL AND landed_cost_allocated > 0
              THEN landed_cost_allocated
            ELSE NULL
          END,
        'discountAllocated',
          CASE
            WHEN discount_allocated IS NOT NULL AND discount_allocated > 0
              THEN discount_allocated
            ELSE NULL
          END,
        'loadedUnitCost', loaded_unit,
        'netUnitAcquisitionCost', net_unit,
        'lineTotal', line_total
      )
      ORDER BY bill_date_sort DESC, bill_created_at DESC, line_id
    ) AS rows
    FROM (
      SELECT *
      FROM line_costs
      ORDER BY bill_date_sort DESC, bill_created_at DESC, line_id
      LIMIT v_recent_limit
    ) r
  )
  SELECT jsonb_build_object(
    'minUnitCost', s.min_unit_cost,
    'maxUnitCost', s.max_unit_cost,
    'avgUnitCost', CASE WHEN s.avg_unit_cost IS NOT NULL THEN round(s.avg_unit_cost::numeric, 4) ELSE NULL END,
    'totalQtyPurchased', COALESCE(s.total_qty, 0),
    'purchaseCount', COALESCE(s.purchase_count, 0),
    'recent', COALESCE((SELECT rows FROM purchase_recent), '[]'::jsonb)
  )
  INTO v_purchase
  FROM purchase_stats s;

  -- Sales + movements unchanged from 20261012200000 (re-read remainder via dynamic SQL not needed:
  -- delegate to existing body by copying tail from prior migration file).

  WITH sale_lines AS (
    SELECT
      ii.id AS line_id,
      ii.quantity,
      ii.unit_price,
      ii.total_amount,
      inv.id AS invoice_id,
      inv.invoice_number,
      inv.created_at AS invoice_created_at,
      u.name AS customer_name
    FROM public.invoice_items ii
    INNER JOIN public.invoices inv ON inv.id = ii.invoice_id
    LEFT JOIN public.users u ON u.id = inv.user_id
    WHERE ii.product_id = p_product_id
      AND inv.store_id = p_store_id
      AND inv.status IS DISTINCT FROM 'cancelled'
      AND COALESCE(ii.quantity, 0) > 0
  ),
  sales_stats AS (
    SELECT
      MIN(unit_price) AS min_unit_price,
      MAX(unit_price) AS max_unit_price,
      CASE
        WHEN SUM(quantity) > 0 THEN SUM(unit_price * quantity) / SUM(quantity)
        ELSE NULL
      END AS avg_unit_price,
      SUM(quantity) AS total_qty,
      COUNT(*)::integer AS sale_count
    FROM sale_lines
  ),
  sales_recent AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'lineId', line_id,
        'invoiceId', invoice_id,
        'invoiceNumber', COALESCE(invoice_number, left(invoice_id::text, 8)),
        'invoiceDate', left(invoice_created_at::text, 10),
        'customerName', customer_name,
        'quantity', quantity,
        'unitPrice', unit_price,
        'lineTotal', total_amount
      )
      ORDER BY invoice_created_at DESC, line_id
    ) AS rows
    FROM (
      SELECT *
      FROM sale_lines
      ORDER BY invoice_created_at DESC, line_id
      LIMIT v_recent_limit
    ) r
  )
  SELECT jsonb_build_object(
    'minUnitPrice', s.min_unit_price,
    'maxUnitPrice', s.max_unit_price,
    'avgUnitPrice', CASE WHEN s.avg_unit_price IS NOT NULL THEN round(s.avg_unit_price::numeric, 4) ELSE NULL END,
    'totalQtySold', COALESCE(s.total_qty, 0),
    'saleCount', COALESCE(s.sale_count, 0),
    'recent', COALESCE((SELECT rows FROM sales_recent), '[]'::jsonb)
  )
  INTO v_sales
  FROM sales_stats s;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', sm.id,
        'createdAt', sm.created_at,
        'type', sm.type,
        'quantity', sm.quantity,
        'transactionPrice', sm.transaction_price,
        'referenceType', sm.reference_type,
        'referenceId', sm.reference_id,
        'reason', sm.reason
      )
      ORDER BY sm.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_movements
  FROM (
    SELECT sm.*
    FROM public.stock_movements sm
    JOIN public.product_variants pv ON pv.id = sm.variant_id
    WHERE pv.product_id = p_product_id
      AND sm.store_id = p_store_id
    ORDER BY sm.created_at DESC
    LIMIT v_movement_limit
  ) sm;

  RETURN jsonb_build_object(
    'centralStock', v_central_stock,
    'purchase', v_purchase,
    'sales', v_sales,
    'movements', v_movements
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_bill_line_net_unit(numeric, numeric, numeric, numeric, numeric)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_store_inventory_product_analytics(uuid, uuid, integer, integer)
  TO authenticated;

COMMIT;
