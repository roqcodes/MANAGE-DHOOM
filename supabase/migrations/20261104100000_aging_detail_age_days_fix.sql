-- Aging detail reports: Age (days) = days from invoice/bill date to as-of.
-- Bucket summaries keep erp_*_days_past_due (days past due date).

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_invoice_aging_days(
  p_as_of date,
  p_invoice_date date
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_invoice_date IS NULL THEN 0
    ELSE GREATEST(0, p_as_of - p_invoice_date)
  END;
$$;

CREATE OR REPLACE FUNCTION public.erp_purchase_bill_aging_days(
  p_as_of date,
  p_bill_date date
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_bill_date IS NULL THEN 0
    ELSE GREATEST(0, p_as_of - p_bill_date)
  END;
$$;

COMMENT ON FUNCTION public.erp_invoice_aging_days(date, date) IS
  'Days from invoice date to as-of (line-level aging detail reports).';
COMMENT ON FUNCTION public.erp_purchase_bill_aging_days(date, date) IS
  'Days from purchase bill date to as-of (line-level aging detail reports).';

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging_details(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_age_min integer DEFAULT NULL,
  p_age_max integer DEFAULT NULL,
  p_salesman_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(BTRIM(p_search), '');
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.invoice_date DESC, r.invoice_number), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      COALESCE(i.issued_at::date, i.created_at::date) AS invoice_date,
      i.invoice_number,
      s.name AS store_name,
      'Invoice'::text AS document_type,
      i.status,
      u.name AS customer_name,
      COALESCE(sp.name, 'Unassigned') AS salesman_name,
      public.erp_invoice_aging_days(
        p_as_of,
        COALESCE(i.issued_at::date, i.created_at::date)
      ) AS age_days,
      ROUND(i.total_amount, 2) AS amount,
      ROUND(COALESCE(i.credits_applied, 0), 2) AS applied_credit,
      ROUND(COALESCE(i.balance_due, 0), 2) AS balance_due
    FROM public.invoices i
    JOIN public.users u ON u.id = i.user_id
    LEFT JOIN public.stores s ON s.id = i.store_id
    LEFT JOIN public.erp_salesmen sp ON sp.id = i.sales_person_id
    WHERE public.erp_report_is_customer_role(u.role)
      AND i.status IN ('issued', 'partial', 'paid', 'overdue')
      AND ABS(COALESCE(i.balance_due, 0)) > 0.001
      AND i.store_id = p_store_id
      AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
      AND (
        p_date_from IS NULL
        OR COALESCE(i.issued_at::date, i.created_at::date) >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR COALESCE(i.issued_at::date, i.created_at::date) <= p_date_to
      )
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR i.invoice_number ILIKE '%' || v_search || '%'
      )
      AND public.erp_report_age_in_range(
        public.erp_invoice_aging_days(
          p_as_of,
          COALESCE(i.issued_at::date, i.created_at::date)
        ),
        p_age_min,
        p_age_max
      )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging_summary_customer_details(
  p_customer_id uuid,
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_salesman_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT u.name
  INTO v_customer_name
  FROM public.users u
  WHERE u.id = p_customer_id
    AND public.erp_report_is_customer_role(u.role);

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.due_date, r.invoice_number), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      i.invoice_number,
      COALESCE(i.issued_at::date, i.created_at::date) AS invoice_date,
      COALESCE(i.due_date::date, i.created_at::date) AS due_date,
      public.erp_invoice_aging_days(
        p_as_of,
        COALESCE(i.issued_at::date, i.created_at::date)
      ) AS age_days,
      ROUND(i.total_amount, 2) AS invoice_amount,
      ROUND(COALESCE(i.credits_applied, 0), 2) AS credit,
      ROUND(COALESCE(i.balance_due, 0), 2) AS payment_balance
    FROM public.invoices i
    WHERE i.user_id = p_customer_id
      AND i.status IN ('issued', 'partial', 'paid', 'overdue')
      AND ABS(COALESCE(i.balance_due, 0)) > 0.001
      AND i.store_id = p_store_id
      AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
  ) r;

  RETURN jsonb_build_object(
    'customer_id', p_customer_id,
    'customer_name', v_customer_name,
    'as_of', p_as_of,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_aging_details(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_age_min integer DEFAULT NULL,
  p_age_max integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(BTRIM(p_search), '');
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.bill_date DESC, r.purchase_bill_number), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      b.purchase_date::date AS bill_date,
      b.purchase_bill_number,
      s.name AS store_name,
      b.status,
      v.name AS vendor_name,
      public.erp_purchase_bill_aging_days(p_as_of, b.purchase_date::date) AS age_days,
      ROUND(b.total_amount, 2) AS amount,
      ROUND(COALESCE(b.credits_applied, 0), 2) AS applied_credit,
      ROUND(COALESCE(b.balance_due, 0), 2) AS balance_due
    FROM public.erp_purchase_bills b
    JOIN public.vendors v ON v.id = b.vendor_id
    LEFT JOIN public.stores s ON s.id = b.store_id
    WHERE v.is_active IS DISTINCT FROM false
      AND b.status IN ('finalized', 'partial', 'paid')
      AND ABS(COALESCE(b.balance_due, 0)) > 0.001
      AND b.store_id = p_store_id
      AND (
        p_date_from IS NULL OR b.purchase_date::date >= p_date_from
      )
      AND (
        p_date_to IS NULL OR b.purchase_date::date <= p_date_to
      )
      AND (
        v_search IS NULL
        OR v.name ILIKE '%' || v_search || '%'
        OR b.purchase_bill_number ILIKE '%' || v_search || '%'
      )
      AND public.erp_report_age_in_range(
        public.erp_purchase_bill_aging_days(p_as_of, b.purchase_date::date),
        p_age_min,
        p_age_max
      )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_aging_summary_vendor_details(
  p_vendor_id uuid,
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_name text;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT v.name
  INTO v_vendor_name
  FROM public.vendors v
  WHERE v.id = p_vendor_id
    AND v.is_active IS DISTINCT FROM false;

  IF v_vendor_name IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.due_date, r.purchase_bill_number), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      b.purchase_bill_number,
      b.purchase_date::date AS bill_date,
      COALESCE(b.due_date::date, b.purchase_date::date) AS due_date,
      public.erp_purchase_bill_aging_days(p_as_of, b.purchase_date::date) AS age_days,
      ROUND(b.total_amount, 2) AS bill_amount,
      ROUND(COALESCE(b.credits_applied, 0), 2) AS credit,
      ROUND(COALESCE(b.balance_due, 0), 2) AS payment_balance
    FROM public.erp_purchase_bills b
    WHERE b.vendor_id = p_vendor_id
      AND b.status IN ('finalized', 'partial', 'paid')
      AND ABS(COALESCE(b.balance_due, 0)) > 0.001
      AND b.store_id = p_store_id
  ) r;

  RETURN jsonb_build_object(
    'vendor_id', p_vendor_id,
    'vendor_name', v_vendor_name,
    'as_of', p_as_of,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_invoice_aging_days(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_purchase_bill_aging_days(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
