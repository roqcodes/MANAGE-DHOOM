-- Customer Balance / aging summaries: list every ERP customer (role null | customer),
-- not only rows with outstanding balance. Optional filter excludes zero balances.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_report_is_customer_role(p_role public.user_role)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_role IS NULL OR p_role::text = 'customer';
$$;

COMMENT ON FUNCTION public.erp_report_is_customer_role(public.user_role) IS
  'Same scope as admin customer list (role.is.null OR role = customer).';

DROP FUNCTION IF EXISTS public.get_erp_customer_balance_report(uuid, text);

CREATE OR REPLACE FUNCTION public.get_erp_customer_balance_report(
  p_store_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_exclude_zero_balance boolean DEFAULT false
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
      u.phone,
      u.email,
      ROUND(COALESCE(u.opening_balance, 0) + COALESCE(SUM(i.balance_due), 0), 2) AS total_receivable,
      COUNT(i.id) FILTER (WHERE ABS(COALESCE(i.balance_due, 0)) > 0.001) AS open_invoices
    FROM public.users u
    LEFT JOIN public.invoices i ON i.user_id = u.id
      AND i.status <> 'cancelled'
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
    WHERE public.erp_report_is_customer_role(u.role)
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.phone ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
      )
    GROUP BY u.id, u.name, u.phone, u.email, u.opening_balance
    HAVING
      NOT COALESCE(p_exclude_zero_balance, false)
      OR public.erp_receivables_customer_visible(
        u.opening_balance,
        SUM(i.balance_due),
        0
      )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_exclude_zero_balance boolean DEFAULT false
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
    HAVING
      NOT COALESCE(p_exclude_zero_balance, false)
      OR public.erp_receivables_customer_visible(
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
  p_search text DEFAULT NULL,
  p_exclude_zero_balance boolean DEFAULT false
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
        WHERE i.id IS NOT NULL
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) = 0
      ) AS bucket_current,
      COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 1 AND 15
      ) AS bucket_1_15,
      COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 16 AND 30
      ) AS bucket_16_30,
      COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 31 AND 45
      ) AS bucket_31_45,
      COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) > 45
      ) AS bucket_over_45,
      COUNT(i.id) FILTER (WHERE i.id IS NOT NULL) AS total_invoices
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
    HAVING
      NOT COALESCE(p_exclude_zero_balance, false)
      OR public.erp_receivables_customer_visible(
        u.opening_balance,
        SUM(i.balance_due),
        pay.unallocated
      )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_customer_balance_report(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging(date, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_summary_counts(date, uuid, text, boolean) TO authenticated;

COMMIT;
