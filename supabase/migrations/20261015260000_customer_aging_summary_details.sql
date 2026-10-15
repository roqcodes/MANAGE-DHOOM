-- Drill-down: open invoices for one customer (from Aging Summary).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging_summary_customer_details(
  p_customer_id uuid,
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
  v_customer_name text;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

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
      public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) AS age_days,
      ROUND(i.total_amount, 2) AS invoice_amount,
      ROUND(COALESCE(i.credits_applied, 0), 2) AS credit,
      ROUND(COALESCE(i.balance_due, 0), 2) AS payment_balance
    FROM public.invoices i
    WHERE i.user_id = p_customer_id
      AND i.status <> 'cancelled'
      AND ABS(COALESCE(i.balance_due, 0)) > 0.001
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
  ) r;

  RETURN jsonb_build_object(
    'customer_id', p_customer_id,
    'customer_name', v_customer_name,
    'as_of', p_as_of,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_summary_customer_details(uuid, date, uuid) TO authenticated;

COMMIT;
