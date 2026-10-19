-- Aging Details (receivables / payables): optional filter by days past due.

BEGIN;

DROP FUNCTION IF EXISTS public.get_erp_customer_aging_details(date, uuid, date, date, text);
DROP FUNCTION IF EXISTS public.get_erp_vendor_aging_details(date, uuid, date, date, text);

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging_details(
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

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

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
      public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) AS age_days,
      ROUND(i.total_amount, 2) AS amount,
      ROUND(COALESCE(i.credits_applied, 0), 2) AS applied_credit,
      ROUND(COALESCE(i.balance_due, 0), 2) AS balance_due
    FROM public.invoices i
    JOIN public.users u ON u.id = i.user_id
    LEFT JOIN public.stores s ON s.id = i.store_id
    WHERE public.erp_report_is_customer_role(u.role)
      AND i.status <> 'cancelled'
      AND ABS(COALESCE(i.balance_due, 0)) > 0.001
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
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
        public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
        p_age_min,
        p_age_max
      )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
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

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.bill_date DESC, r.purchase_bill_number), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      b.purchase_date::date AS bill_date,
      b.purchase_bill_number,
      s.name AS store_name,
      b.status,
      v.name AS vendor_name,
      public.erp_purchase_bill_days_past_due(
        p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
      ) AS age_days,
      ROUND(b.total_amount, 2) AS amount,
      ROUND(COALESCE(b.credits_applied, 0), 2) AS applied_credit,
      ROUND(COALESCE(b.balance_due, 0), 2) AS balance_due
    FROM public.erp_purchase_bills b
    JOIN public.vendors v ON v.id = b.vendor_id
    LEFT JOIN public.stores s ON s.id = b.store_id
    WHERE v.is_active IS DISTINCT FROM false
      AND b.status IN ('finalized', 'partial', 'paid')
      AND ABS(COALESCE(b.balance_due, 0)) > 0.001
      AND (p_store_id IS NULL OR b.store_id = p_store_id)
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
        public.erp_purchase_bill_days_past_due(
          p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
        ),
        p_age_min,
        p_age_max
      )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_details(date, uuid, date, date, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging_details(date, uuid, date, date, text, integer, integer) TO authenticated;

COMMIT;
