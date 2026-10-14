-- Purchase reports: by item (purchases + inbound transfers) and by vendor (expenses, bills, credits).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_purchase_by_item_report(
  p_date_from date,
  p_date_to date,
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.item_name), '[]'::jsonb)
    FROM (
      SELECT
        p.id AS product_id,
        p.name AS item_name,
        COALESCE(c.name, '—') AS category_name,
        COALESCE(b.name, 'General Item Brand') AS brand_name,
        ROUND(COALESCE(pu.purchase_qty, 0), 2) AS purchase_qty,
        ROUND(COALESCE(tr.transfer_qty, 0), 2) AS transfer_qty,
        ROUND(COALESCE(pu.purchase_qty, 0) + COALESCE(tr.transfer_qty, 0), 2) AS total_qty,
        ROUND(COALESCE(pu.purchase_value, 0), 2) AS purchase_value,
        ROUND(COALESCE(tr.transfer_value, 0), 2) AS transfer_value,
        ROUND(COALESCE(pu.purchase_value, 0) + COALESCE(tr.transfer_value, 0), 2) AS total_value,
        ROUND(
          CASE
            WHEN COALESCE(pu.purchase_qty, 0) > 0 THEN pu.purchase_value / pu.purchase_qty
            ELSE 0
          END,
          2
        ) AS avg_purchase_cost
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN LATERAL (
        SELECT
          SUM(pbl.quantity) AS purchase_qty,
          SUM(pbl.line_total) AS purchase_value
        FROM public.erp_purchase_bill_lines pbl
        JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
        LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
        WHERE COALESCE(pbl.product_id, pv.product_id) = p.id
          AND pb.purchase_date BETWEEN p_date_from AND p_date_to
          AND pb.status IN ('finalized', 'partial', 'paid')
          AND (p_store_id IS NULL OR pb.store_id = p_store_id)
      ) pu ON true
      LEFT JOIN LATERAL (
        SELECT
          SUM(stl.quantity) AS transfer_qty,
          SUM(COALESCE(stl.line_total, stl.quantity * COALESCE(stl.transfer_price, 0))) AS transfer_value
        FROM public.erp_store_transfer_lines stl
        JOIN public.erp_store_transfers st ON st.id = stl.transfer_id
        JOIN public.product_variants pv ON pv.id = stl.variant_id
        WHERE pv.product_id = p.id
          AND st.transfer_date BETWEEN p_date_from AND p_date_to
          AND st.status IN ('completed', 'approved')
          AND (p_store_id IS NULL OR st.to_store_id = p_store_id)
      ) tr ON true
      WHERE (p_brand_id IS NULL OR p.brand_id = p_brand_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (
          COALESCE(pu.purchase_qty, 0) <> 0
          OR COALESCE(tr.transfer_qty, 0) <> 0
        )
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_purchase_by_vendor_report(
  p_date_from date,
  p_date_to date,
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.vendor_name), '[]'::jsonb)
    FROM (
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        COALESCE(exp.expense_count, 0)::bigint AS expense_count,
        COALESCE(bill.bill_count, 0)::bigint AS bill_count,
        COALESCE(cred.vendor_credit_count, 0)::bigint AS vendor_credit_count,
        ROUND(COALESCE(exp.expense_amount, 0), 2) AS expense_amount,
        ROUND(COALESCE(bill.bill_amount, 0), 2) AS bill_amount,
        ROUND(COALESCE(exp.expense_amount, 0) + COALESCE(bill.bill_amount, 0), 2) AS total
      FROM public.vendors v
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS expense_count,
          SUM(e.total_amount) AS expense_amount
        FROM public.erp_expenses e
        WHERE e.vendor_id = v.id
          AND e.expense_date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR e.store_id = p_store_id)
      ) exp ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS bill_count,
          SUM(pb.total_amount) AS bill_amount
        FROM public.erp_purchase_bills pb
        WHERE pb.vendor_id = v.id
          AND pb.purchase_date BETWEEN p_date_from AND p_date_to
          AND pb.status IN ('finalized', 'partial', 'paid')
          AND (p_store_id IS NULL OR pb.store_id = p_store_id)
      ) bill ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS vendor_credit_count
        FROM public.erp_vendor_credits vc
        WHERE vc.vendor_id = v.id
          AND vc.credit_date BETWEEN p_date_from AND p_date_to
          AND vc.status IN ('issued', 'applied')
          AND (p_store_id IS NULL OR vc.store_id = p_store_id)
      ) cred ON true
      WHERE v.is_active IS DISTINCT FROM false
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_purchase_by_item_report(date, date, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_purchase_by_vendor_report(date, date, uuid) TO authenticated;

COMMIT;
