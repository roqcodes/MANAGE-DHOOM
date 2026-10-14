-- Inventory reports: enriched stock report and stock transfer report.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_item_stock_report(
  p_store_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_stock_level text DEFAULT 'all'
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
        spi.product_id,
        COALESCE(p.barcode, p.id::text) AS product_code,
        p.name AS product_name,
        c.name AS category_name,
        b.name AS brand_name,
        s.name AS store_name,
        spi.store_id,
        ROUND(COALESCE(spi.stock, 0), 2) AS stock,
        ROUND(COALESCE(spi.stock, 0), 2) AS available_stock,
        ROUND(COALESCE(inb.incoming_qty, 0), 2) AS incoming_qty,
        ROUND(COALESCE(spi.stock, 0) + COALESCE(inb.incoming_qty, 0), 2) AS expected_stock,
        ROUND(COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(spi.sales_price, p.price, 0), 2) AS sales_price,
        ROUND(COALESCE(spi.stock, 0) * COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS stock_purchase_value,
        ROUND(COALESCE(spi.stock, 0) * COALESCE(spi.sales_price, p.price, 0), 2) AS stock_sales_value,
        CASE
          WHEN COALESCE(spi.stock, 0) <= 0 THEN 'Out of stock'
          WHEN COALESCE(spi.stock, 0) < 5 THEN 'Low stock'
          ELSE 'In stock'
        END AS stock_status
      FROM public.store_product_inventory spi
      JOIN public.products p ON p.id = spi.product_id
      JOIN public.stores s ON s.id = spi.store_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN LATERAL (
        SELECT SUM(GREATEST(0, pending.pending_qty)) AS incoming_qty
        FROM (
          SELECT GREATEST(0, poi.quantity - COALESCE(poi.accepted_qty, 0)) AS pending_qty
          FROM public.purchase_order_items poi
          JOIN public.purchase_orders po ON po.id = poi.po_id
          LEFT JOIN public.product_variants pv ON pv.id = poi.variant_id
          WHERE COALESCE(poi.product_id, pv.product_id) = spi.product_id
            AND po.store_id = spi.store_id
            AND po.status NOT IN ('cancelled', 'closed', 'fully_received')
          UNION ALL
          SELECT GREATEST(0, pbl.quantity - COALESCE(pbl.accepted_qty, 0))
          FROM public.erp_purchase_bill_lines pbl
          JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
          LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
          WHERE COALESCE(pbl.product_id, pv.product_id) = spi.product_id
            AND pb.store_id = spi.store_id
            AND pb.status = 'draft'
            AND pb.legacy_stock_via_bill = false
        ) pending
      ) inb ON true
      WHERE (p_store_id IS NULL OR spi.store_id = p_store_id)
        AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (
          p_stock_level = 'all'
          OR (p_stock_level = 'in_stock' AND COALESCE(spi.stock, 0) > 0)
          OR (p_stock_level = 'out_of_stock' AND COALESCE(spi.stock, 0) <= 0)
          OR (p_stock_level = 'low_stock' AND COALESCE(spi.stock, 0) > 0 AND COALESCE(spi.stock, 0) < 5)
        )
        AND (
          p_stock_level = 'out_of_stock'
          OR COALESCE(spi.stock, 0) <> 0
          OR COALESCE(inb.incoming_qty, 0) <> 0
        )
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_stock_transfer_report(
  p_date_from date,
  p_date_to date,
  p_from_store_id uuid DEFAULT NULL,
  p_to_store_id uuid DEFAULT NULL,
  p_status text DEFAULT 'all'
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.request_date DESC), '[]'::jsonb)
    FROM (
      SELECT
        tr.id,
        tr.request_date,
        tr.request_number,
        COALESCE(u.name, '—') AS requested_by,
        fs.name AS from_store,
        ts.name AS to_store,
        COALESCE(line.requested_qty, 0) AS requested_qty,
        COALESCE(line.approved_qty, 0) AS approved_qty,
        COALESCE(line.received_qty, 0) AS received_qty,
        ROUND(COALESCE(line.requested_value, 0), 2) AS requested_items_price,
        tr.status,
        ROUND(COALESCE(line.requested_value, 0), 2) AS payment_amount,
        ROUND(
          CASE WHEN tr.status IN ('completed', 'transfer_completed', 'approved') THEN COALESCE(line.requested_value, 0) ELSE 0 END,
          2
        ) AS payment_paid,
        ROUND(
          COALESCE(line.requested_value, 0)
          - CASE WHEN tr.status IN ('completed', 'transfer_completed', 'approved') THEN COALESCE(line.requested_value, 0) ELSE 0 END,
          2
        ) AS payment_balance
      FROM public.erp_transfer_requests tr
      JOIN public.stores fs ON fs.id = tr.from_store_id
      JOIN public.stores ts ON ts.id = tr.to_store_id
      LEFT JOIN public.users u ON u.id = tr.created_by
      LEFT JOIN LATERAL (
        SELECT
          SUM(l.quantity) AS requested_qty,
          SUM(CASE WHEN tr.status NOT IN ('rejected', 'cancelled', 'draft') THEN l.quantity ELSE 0 END) AS approved_qty,
          COALESCE((
            SELECT SUM(stl.quantity)
            FROM public.erp_store_transfers st
            JOIN public.erp_store_transfer_lines stl ON stl.transfer_id = st.id
            WHERE st.request_id = tr.id
              AND st.status IN ('completed', 'approved')
          ), 0) AS received_qty,
          SUM(l.quantity * COALESCE(l.transfer_price, 0)) AS requested_value
        FROM public.erp_transfer_request_lines l
        WHERE l.request_id = tr.id
      ) line ON true
      WHERE tr.request_date BETWEEN p_date_from AND p_date_to
        AND (p_from_store_id IS NULL OR tr.from_store_id = p_from_store_id)
        AND (p_to_store_id IS NULL OR tr.to_store_id = p_to_store_id)
        AND (p_status = 'all' OR tr.status = p_status)
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_item_stock_report(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_stock_transfer_report(date, date, uuid, uuid, text) TO authenticated;

COMMIT;
