-- Receivables: show customers with any balance (credit/debit), opening-only, and unallocated payments.
-- Invoice totals align with customer list: all non-cancelled invoices (store filter when set).

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_receivables_customer_visible(
  p_opening_balance numeric,
  p_invoice_balance_sum numeric,
  p_unallocated_payments numeric
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    ABS(COALESCE(p_opening_balance, 0) + COALESCE(p_invoice_balance_sum, 0)) > 0.001
    OR COALESCE(p_unallocated_payments, 0) > 0.001;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_customer_balance_report(
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
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.total_receivable DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      u.id AS customer_id,
      u.name AS customer_name,
      u.phone,
      u.email,
      ROUND(COALESCE(u.opening_balance, 0) + COALESCE(SUM(i.balance_due), 0), 2) AS total_receivable,
      COUNT(i.id) FILTER (WHERE ABS(i.balance_due) > 0.001) AS open_invoices
    FROM public.users u
    LEFT JOIN public.invoices i ON i.user_id = u.id
      AND i.status <> 'cancelled'
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(p.unallocated_amount), 0) AS unallocated
      FROM public.erp_customer_payments p
      WHERE p.user_id = u.id
        AND p.unallocated_amount > 0.001
        AND (p_store_id IS NULL OR p.store_id = p_store_id)
    ) pay ON true
    WHERE public.erp_report_is_customer_role(u.role)
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.phone ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
      )
    GROUP BY u.id, u.name, u.phone, u.email, u.opening_balance, pay.unallocated
    HAVING public.erp_receivables_customer_visible(
      u.opening_balance,
      SUM(i.balance_due),
      pay.unallocated
    )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging(
  p_as_of date DEFAULT CURRENT_DATE,
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
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.customer_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      u.id AS customer_id,
      u.name AS customer_name,
      ROUND(COALESCE(u.opening_balance, 0), 2) AS opening_balance_due,
      ROUND(COALESCE(SUM(i.balance_due) FILTER (
        WHERE public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) = 0
      ), 0), 2) AS bucket_current,
      ROUND(COALESCE(SUM(i.balance_due) FILTER (
        WHERE public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 1 AND 15
      ), 0), 2) AS bucket_1_15,
      ROUND(COALESCE(SUM(i.balance_due) FILTER (
        WHERE public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 16 AND 30
      ), 0), 2) AS bucket_16_30,
      ROUND(COALESCE(SUM(i.balance_due) FILTER (
        WHERE public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 31 AND 45
      ), 0), 2) AS bucket_31_45,
      ROUND(COALESCE(SUM(i.balance_due) FILTER (
        WHERE public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) > 45
      ), 0), 2) AS bucket_over_45,
      ROUND(COALESCE(pay.unallocated, 0), 2) AS available_credit,
      ROUND(COALESCE(SUM(GREATEST(0, i.amount_paid + i.credits_applied - i.total_amount)), 0), 2) AS invoice_over_paid,
      ROUND(COALESCE(u.opening_balance, 0) + COALESCE(SUM(i.balance_due), 0), 2) AS total_due
    FROM public.users u
    LEFT JOIN public.invoices i ON i.user_id = u.id
      AND i.status NOT IN ('cancelled', 'pending')
      AND ABS(i.balance_due) > 0.001
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(p.unallocated_amount), 0) AS unallocated
      FROM public.erp_customer_payments p
      WHERE p.user_id = u.id
        AND p.unallocated_amount > 0.001
        AND (p_store_id IS NULL OR p.store_id = p_store_id)
    ) pay ON true
    WHERE public.erp_report_is_customer_role(u.role)
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.phone ILIKE '%' || v_search || '%'
      )
    GROUP BY u.id, u.name, u.opening_balance, pay.unallocated
    HAVING public.erp_receivables_customer_visible(
      u.opening_balance,
      SUM(i.balance_due),
      pay.unallocated
    )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging_summary_counts(
  p_as_of date DEFAULT CURRENT_DATE,
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
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.customer_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      u.id AS customer_id,
      u.name AS customer_name,
      COUNT(i.id) FILTER (
        WHERE public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) = 0
      ) AS bucket_current,
      COUNT(i.id) FILTER (
        WHERE public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 1 AND 15
      ) AS bucket_1_15,
      COUNT(i.id) FILTER (
        WHERE public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 16 AND 30
      ) AS bucket_16_30,
      COUNT(i.id) FILTER (
        WHERE public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 31 AND 45
      ) AS bucket_31_45,
      COUNT(i.id) FILTER (
        WHERE public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) > 45
      ) AS bucket_over_45,
      COUNT(i.id) AS total_invoices
    FROM public.users u
    LEFT JOIN public.invoices i ON i.user_id = u.id
      AND i.status NOT IN ('cancelled', 'pending')
      AND ABS(i.balance_due) > 0.001
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(p.unallocated_amount), 0) AS unallocated
      FROM public.erp_customer_payments p
      WHERE p.user_id = u.id
        AND p.unallocated_amount > 0.001
        AND (p_store_id IS NULL OR p.store_id = p_store_id)
    ) pay ON true
    WHERE public.erp_report_is_customer_role(u.role)
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.phone ILIKE '%' || v_search || '%'
      )
    GROUP BY u.id, u.name, u.opening_balance, pay.unallocated
    HAVING public.erp_receivables_customer_visible(
      u.opening_balance,
      SUM(i.balance_due),
      pay.unallocated
    )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging_details(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
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
      ROUND(i.balance_due, 2) AS balance_due
    FROM public.invoices i
    JOIN public.users u ON u.id = i.user_id
    LEFT JOIN public.stores s ON s.id = i.store_id
    WHERE public.erp_report_is_customer_role(u.role)
      AND i.status <> 'cancelled'
      AND ABS(i.balance_due) > 0.001
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
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_receivables_customer_visible(numeric, numeric, numeric) TO authenticated;

COMMIT;
