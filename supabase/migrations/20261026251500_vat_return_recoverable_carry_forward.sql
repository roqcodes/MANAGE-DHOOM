-- Recoverable VAT credit: persist on returns, carry forward from prior filed periods,
-- fix report net_payable flooring, align preview/create/refresh.

BEGIN;

ALTER TABLE public.erp_vat_returns
  ADD COLUMN IF NOT EXISTS recoverable_tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carry_forward_credit numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.erp_vat_returns.recoverable_tax IS
  'VAT credit to carry forward when input (+ prior credit) exceeds output for the period.';
COMMENT ON COLUMN public.erp_vat_returns.carry_forward_credit IS
  'Recoverable balance from the immediately prior filed return applied to this period.';

DROP FUNCTION IF EXISTS public.compute_erp_vat_return_amounts(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_erp_vat_carry_forward_credit(
  p_store_id uuid,
  p_period_start date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT vr.recoverable_tax
      FROM public.erp_vat_returns vr
      WHERE vr.store_id = p_store_id
        AND vr.status = 'filed'
        AND vr.period_end < p_period_start
      ORDER BY vr.period_end DESC, vr.filed_date DESC NULLS LAST, vr.created_at DESC
      LIMIT 1
    ),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.compute_erp_vat_return_amounts(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  OUT output_tax numeric,
  OUT input_tax numeric,
  OUT carry_forward_credit numeric,
  OUT total_tax_payable numeric,
  OUT recoverable_tax numeric
)
RETURNS record
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_output numeric := 0;
  v_output_credits numeric := 0;
  v_input numeric := 0;
  v_input_credits numeric := 0;
  v_carry numeric := 0;
BEGIN
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  IF p_store_id IS NOT NULL THEN
    v_carry := public.get_erp_vat_carry_forward_credit(p_store_id, p_period_start);
  END IF;

  SELECT COALESCE(SUM(gst_amount), 0) INTO v_output
  FROM public.invoices
  WHERE status IN ('issued', 'partial', 'paid', 'overdue')
    AND COALESCE(issued_at::date, created_at::date) BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_output_credits
  FROM public.erp_credit_notes
  WHERE status IN ('issued', 'applied')
    AND credit_note_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_input
  FROM public.erp_purchase_bills
  WHERE status IN ('finalized', 'partial', 'paid')
    AND purchase_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_input_credits
  FROM public.erp_vendor_credits
  WHERE status IN ('issued', 'applied')
    AND credit_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  output_tax := GREATEST(0, v_output - v_output_credits);
  input_tax := GREATEST(0, v_input - v_input_credits);
  carry_forward_credit := GREATEST(0, v_carry);
  total_tax_payable := GREATEST(0, output_tax - input_tax - carry_forward_credit);
  recoverable_tax := GREATEST(0, input_tax + carry_forward_credit - output_tax);
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_erp_vat_return(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  p_requested_by uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amounts record;
BEGIN
  IF NOT public.is_staff_user(p_requested_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id, p_requested_by);
  END IF;

  SELECT * INTO v_amounts
  FROM public.compute_erp_vat_return_amounts(p_store_id, p_period_start, p_period_end);

  RETURN jsonb_build_object(
    'output_tax', v_amounts.output_tax,
    'input_tax', v_amounts.input_tax,
    'carry_forward_credit', v_amounts.carry_forward_credit,
    'total_tax_payable', v_amounts.total_tax_payable,
    'recoverable_tax', v_amounts.recoverable_tax
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_erp_vat_return(
  p_return_id uuid,
  p_refreshed_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return public.erp_vat_returns%ROWTYPE;
  v_amounts record;
  v_paid numeric := 0;
BEGIN
  IF NOT public.is_staff_user(p_refreshed_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_return
  FROM public.erp_vat_returns
  WHERE id = p_return_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return not found';
  END IF;

  IF v_return.status <> 'unfiled' THEN
    RAISE EXCEPTION 'Only unfiled VAT returns can be recalculated';
  END IF;

  IF v_return.store_id IS NOT NULL THEN
    PERFORM public.require_store_access(v_return.store_id, p_refreshed_by);
  END IF;

  SELECT * INTO v_amounts
  FROM public.compute_erp_vat_return_amounts(
    v_return.store_id,
    v_return.period_start,
    v_return.period_end
  );

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_vat_payments
  WHERE vat_return_id = p_return_id;

  UPDATE public.erp_vat_returns
  SET
    output_tax = v_amounts.output_tax,
    input_tax = v_amounts.input_tax,
    carry_forward_credit = v_amounts.carry_forward_credit,
    total_tax_payable = v_amounts.total_tax_payable,
    recoverable_tax = v_amounts.recoverable_tax,
    balance_due = GREATEST(0, v_amounts.total_tax_payable - v_paid),
    updated_at = now()
  WHERE id = p_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_vat_return(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
  v_amounts record;
  v_label text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_id, v_number
  FROM public.erp_next_document_ref('vat_return') AS t;

  v_label := to_char(p_period_start, 'Mon - YYYY');

  SELECT * INTO v_amounts
  FROM public.compute_erp_vat_return_amounts(p_store_id, p_period_start, p_period_end);

  INSERT INTO public.erp_vat_returns (
    id, return_number, period_start, period_end, period_label, store_id,
    output_tax, input_tax, carry_forward_credit, total_tax_payable, recoverable_tax,
    balance_due, notes, created_by
  )
  VALUES (
    v_id, v_number, p_period_start, p_period_end, v_label, p_store_id,
    v_amounts.output_tax, v_amounts.input_tax, v_amounts.carry_forward_credit,
    v_amounts.total_tax_payable, v_amounts.recoverable_tax,
    GREATEST(0, v_amounts.total_tax_payable), COALESCE(p_notes, ''), p_created_by
  );

  RETURN v_id;
END;
$$;

-- Backfill snapshots (no carry chain rewrite for historical filed rows).
UPDATE public.erp_vat_returns vr
SET
  recoverable_tax = GREATEST(0, vr.input_tax - vr.output_tax),
  total_tax_payable = GREATEST(0, vr.output_tax - vr.input_tax),
  balance_due = CASE
    WHEN GREATEST(0, vr.output_tax - vr.input_tax) <= 0 THEN 0
    ELSE vr.balance_due
  END
WHERE vr.recoverable_tax = 0
  AND vr.carry_forward_credit = 0
  AND (vr.input_tax > vr.output_tax OR vr.total_tax_payable < 0);

UPDATE public.erp_vat_returns
SET balance_due = GREATEST(0, balance_due)
WHERE balance_due < 0;

-- VAT summary report: net block from compute (floored payable, explicit reclaimable).
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
  v_sales jsonb;
  v_purchases jsonb;
  v_amounts record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.store_name), '[]'::jsonb)
  INTO v_sales
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
    WHERE s.id = p_store_id
      AND (
        v_search IS NULL
        OR s.name ILIKE '%' || v_search || '%'
      )
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.store_name), '[]'::jsonb)
  INTO v_purchases
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
    WHERE s.id = p_store_id
      AND (
        v_search IS NULL
        OR s.name ILIKE '%' || v_search || '%'
      )
  ) r;

  SELECT * INTO v_amounts
  FROM public.compute_erp_vat_return_amounts(p_store_id, p_date_from, p_date_to);

  RETURN jsonb_build_object(
    'sales_by_store', COALESCE(v_sales, '[]'::jsonb),
    'purchases_by_store', COALESCE(v_purchases, '[]'::jsonb),
    'net_vat',
    jsonb_build_object(
      'due_tax', ROUND(v_amounts.output_tax, 2),
      'recoverable_tax', ROUND(v_amounts.input_tax, 2),
      'carry_forward_applied', ROUND(v_amounts.carry_forward_credit, 2),
      'net_payable', ROUND(v_amounts.total_tax_payable, 2),
      'net_reclaimable', ROUND(v_amounts.recoverable_tax, 2)
    )
  );
END;
$$;

-- Details report: preserve line-level queries; net_vat from compute (carry-forward aware).
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
  v_output jsonb;
  v_input jsonb;
  v_amounts record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number), '[]'::jsonb)
  INTO v_output
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
      AND i.store_id = p_store_id
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
      AND cn.store_id = p_store_id
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.trn ILIKE '%' || v_search || '%'
        OR cn.credit_note_number::text ILIKE '%' || v_search || '%'
        OR s.name ILIKE '%' || v_search || '%'
      )
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number), '[]'::jsonb)
  INTO v_input
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
      AND b.store_id = p_store_id
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
      AND vc.store_id = p_store_id
      AND (
        v_search IS NULL
        OR v.name ILIKE '%' || v_search || '%'
        OR v.trn ILIKE '%' || v_search || '%'
        OR vc.credit_number ILIKE '%' || v_search || '%'
        OR s.name ILIKE '%' || v_search || '%'
      )
  ) r;

  SELECT * INTO v_amounts
  FROM public.compute_erp_vat_return_amounts(p_store_id, p_date_from, p_date_to);

  RETURN jsonb_build_object(
    'output_lines', COALESCE(v_output, '[]'::jsonb),
    'input_lines', COALESCE(v_input, '[]'::jsonb),
    'net_vat',
    jsonb_build_object(
      'due_tax', ROUND(v_amounts.output_tax, 2),
      'recoverable_tax', ROUND(v_amounts.input_tax, 2),
      'carry_forward_applied', ROUND(v_amounts.carry_forward_credit, 2),
      'net_payable', ROUND(v_amounts.total_tax_payable, 2),
      'net_reclaimable', ROUND(v_amounts.recoverable_tax, 2)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_vat_carry_forward_credit(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_erp_vat_return_amounts(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_erp_vat_return(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_erp_vat_return(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_vat_return(uuid, date, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vat_return_summary_report(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vat_return_details_report(date, date, uuid, text) TO authenticated;

COMMIT;
