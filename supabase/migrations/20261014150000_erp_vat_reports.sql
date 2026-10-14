-- VAT return summary (by store) and transaction-level details for reporting.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_vat_return_summary_report(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(BTRIM(p_search), '');
  v_amounts record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  SELECT * INTO v_amounts
  FROM public.compute_erp_vat_return_amounts(p_store_id, p_date_from, p_date_to);

  RETURN jsonb_build_object(
    'sales_by_store',
    COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.store_name)
      FROM (
        SELECT
          s.id AS store_id,
          s.name AS store_name,
          ROUND(COALESCE(inv.taxable_sales, 0), 2) AS standard_rated_sales,
          ROUND(COALESCE(cn.credit_adjustment, 0), 2) AS credit_adjustment,
          ROUND(
            COALESCE(inv.tax_amount, 0) - COALESCE(cn.tax_adjustment, 0),
            2
          ) AS tax_amount
        FROM public.stores s
        LEFT JOIN LATERAL (
          SELECT
            SUM(i.subtotal) AS taxable_sales,
            SUM(i.gst_amount) AS tax_amount
          FROM public.invoices i
          WHERE i.store_id = s.id
            AND i.status IN ('issued', 'partial', 'paid', 'overdue')
            AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
        ) inv ON true
        LEFT JOIN LATERAL (
          SELECT
            SUM(cn.subtotal) AS credit_adjustment,
            SUM(cn.tax_amount) AS tax_adjustment
          FROM public.erp_credit_notes cn
          WHERE cn.store_id = s.id
            AND cn.status IN ('issued', 'applied')
            AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
        ) cn ON true
        WHERE s.is_active IS DISTINCT FROM false
          AND (p_store_id IS NULL OR s.id = p_store_id)
          AND (
            v_search IS NULL
            OR s.name ILIKE '%' || v_search || '%'
          )
          AND (
            COALESCE(inv.taxable_sales, 0) <> 0
            OR COALESCE(cn.credit_adjustment, 0) <> 0
            OR COALESCE(inv.tax_amount, 0) <> 0
            OR COALESCE(cn.tax_adjustment, 0) <> 0
            OR p_store_id IS NOT NULL
          )
      ) r
    ), '[]'::jsonb),
    'purchases_by_store',
    COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.store_name)
      FROM (
        SELECT
          s.id AS store_id,
          s.name AS store_name,
          ROUND(COALESCE(pb.taxable_purchases, 0), 2) AS standard_rated_purchases,
          ROUND(COALESCE(vc.vendor_credit_adjustment, 0), 2) AS vendor_credit_adjustment,
          ROUND(
            COALESCE(pb.tax_amount, 0) - COALESCE(vc.tax_adjustment, 0),
            2
          ) AS tax_amount
        FROM public.stores s
        LEFT JOIN LATERAL (
          SELECT
            SUM(b.subtotal) AS taxable_purchases,
            SUM(b.tax_amount) AS tax_amount
          FROM public.erp_purchase_bills b
          WHERE b.store_id = s.id
            AND b.status IN ('finalized', 'partial', 'paid')
            AND b.purchase_date BETWEEN p_date_from AND p_date_to
        ) pb ON true
        LEFT JOIN LATERAL (
          SELECT
            SUM(vc.subtotal) AS vendor_credit_adjustment,
            SUM(vc.tax_amount) AS tax_adjustment
          FROM public.erp_vendor_credits vc
          WHERE vc.store_id = s.id
            AND vc.status IN ('issued', 'applied')
            AND vc.credit_date BETWEEN p_date_from AND p_date_to
        ) vc ON true
        WHERE s.is_active IS DISTINCT FROM false
          AND (p_store_id IS NULL OR s.id = p_store_id)
          AND (
            v_search IS NULL
            OR s.name ILIKE '%' || v_search || '%'
          )
          AND (
            COALESCE(pb.taxable_purchases, 0) <> 0
            OR COALESCE(vc.vendor_credit_adjustment, 0) <> 0
            OR COALESCE(pb.tax_amount, 0) <> 0
            OR COALESCE(vc.tax_adjustment, 0) <> 0
            OR p_store_id IS NOT NULL
          )
      ) r
    ), '[]'::jsonb),
    'net_vat',
    jsonb_build_object(
      'due_tax', ROUND(v_amounts.output_tax, 2),
      'recoverable_tax', ROUND(v_amounts.input_tax, 2),
      'net_payable', ROUND(v_amounts.total_tax_payable, 2),
      'net_reclaimable', ROUND(GREATEST(0, v_amounts.input_tax - v_amounts.output_tax), 2)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vat_return_details_report(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(BTRIM(p_search), '');
  v_amounts record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  SELECT * INTO v_amounts
  FROM public.compute_erp_vat_return_amounts(p_store_id, p_date_from, p_date_to);

  RETURN jsonb_build_object(
    'output_lines',
    COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number)
      FROM (
        SELECT
          u.name AS party_name,
          u.trn AS party_trn,
          COALESCE(i.issued_at::date, i.created_at::date) AS transaction_date,
          i.invoice_number::text AS transaction_number,
          'Invoice'::text AS transaction_type,
          s.name AS store_name,
          ROUND(i.subtotal, 2) AS taxable_amount,
          ROUND(i.gst_amount, 2) AS vat_amount,
          CASE
            WHEN i.subtotal > 0 THEN ROUND(100.0 * i.gst_amount / i.subtotal, 2)
            ELSE NULL
          END AS vat_percentage
        FROM public.invoices i
        JOIN public.users u ON u.id = i.user_id
        LEFT JOIN public.stores s ON s.id = i.store_id
        WHERE i.status IN ('issued', 'partial', 'paid', 'overdue')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
          AND (
            v_search IS NULL
            OR u.name ILIKE '%' || v_search || '%'
            OR u.trn ILIKE '%' || v_search || '%'
            OR i.invoice_number::text ILIKE '%' || v_search || '%'
            OR s.name ILIKE '%' || v_search || '%'
          )
        UNION ALL
        SELECT
          u.name AS party_name,
          u.trn AS party_trn,
          cn.credit_note_date AS transaction_date,
          cn.credit_note_number::text AS transaction_number,
          'Credit Note'::text AS transaction_type,
          s.name AS store_name,
          ROUND(cn.subtotal, 2) AS taxable_amount,
          ROUND(cn.tax_amount, 2) AS vat_amount,
          CASE
            WHEN cn.subtotal > 0 THEN ROUND(100.0 * cn.tax_amount / cn.subtotal, 2)
            ELSE NULL
          END AS vat_percentage
        FROM public.erp_credit_notes cn
        JOIN public.users u ON u.id = cn.user_id
        LEFT JOIN public.stores s ON s.id = cn.store_id
        WHERE cn.status IN ('issued', 'applied')
          AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR cn.store_id = p_store_id)
          AND (
            v_search IS NULL
            OR u.name ILIKE '%' || v_search || '%'
            OR u.trn ILIKE '%' || v_search || '%'
            OR cn.credit_note_number::text ILIKE '%' || v_search || '%'
            OR s.name ILIKE '%' || v_search || '%'
          )
      ) r
    ), '[]'::jsonb),
    'input_lines',
    COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number)
      FROM (
        SELECT
          v.name AS party_name,
          v.trn AS party_trn,
          b.purchase_date AS transaction_date,
          b.purchase_bill_number::text AS transaction_number,
          'Purchase Bill'::text AS transaction_type,
          s.name AS store_name,
          ROUND(b.subtotal, 2) AS taxable_amount,
          ROUND(b.tax_amount, 2) AS vat_amount,
          CASE
            WHEN b.subtotal > 0 THEN ROUND(100.0 * b.tax_amount / b.subtotal, 2)
            ELSE NULL
          END AS vat_percentage
        FROM public.erp_purchase_bills b
        JOIN public.vendors v ON v.id = b.vendor_id
        LEFT JOIN public.stores s ON s.id = b.store_id
        WHERE b.status IN ('finalized', 'partial', 'paid')
          AND b.purchase_date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR b.store_id = p_store_id)
          AND (
            v_search IS NULL
            OR v.name ILIKE '%' || v_search || '%'
            OR v.trn ILIKE '%' || v_search || '%'
            OR b.purchase_bill_number::text ILIKE '%' || v_search || '%'
            OR s.name ILIKE '%' || v_search || '%'
          )
        UNION ALL
        SELECT
          v.name AS party_name,
          v.trn AS party_trn,
          vc.credit_date AS transaction_date,
          vc.credit_number::text AS transaction_number,
          'Vendor Credit'::text AS transaction_type,
          s.name AS store_name,
          ROUND(vc.subtotal, 2) AS taxable_amount,
          ROUND(vc.tax_amount, 2) AS vat_amount,
          CASE
            WHEN vc.subtotal > 0 THEN ROUND(100.0 * vc.tax_amount / vc.subtotal, 2)
            ELSE NULL
          END AS vat_percentage
        FROM public.erp_vendor_credits vc
        JOIN public.vendors v ON v.id = vc.vendor_id
        LEFT JOIN public.stores s ON s.id = vc.store_id
        WHERE vc.status IN ('issued', 'applied')
          AND vc.credit_date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR vc.store_id = p_store_id)
          AND (
            v_search IS NULL
            OR v.name ILIKE '%' || v_search || '%'
            OR v.trn ILIKE '%' || v_search || '%'
            OR vc.credit_number ILIKE '%' || v_search || '%'
            OR s.name ILIKE '%' || v_search || '%'
          )
      ) r
    ), '[]'::jsonb),
    'net_vat',
    jsonb_build_object(
      'due_tax', ROUND(v_amounts.output_tax, 2),
      'recoverable_tax', ROUND(v_amounts.input_tax, 2),
      'net_payable', ROUND(v_amounts.total_tax_payable, 2),
      'net_reclaimable', ROUND(GREATEST(0, v_amounts.input_tax - v_amounts.output_tax), 2)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_vat_return_summary_report(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vat_return_details_report(date, date, uuid, text) TO authenticated;

COMMIT;
