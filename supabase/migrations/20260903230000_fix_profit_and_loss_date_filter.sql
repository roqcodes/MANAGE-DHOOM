-- Fix P&L: LEFT JOIN on journal_entries ignored date filters and summed all lines.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_profit_and_loss(
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
DECLARE
  v_income jsonb;
  v_expense jsonb;
  v_income_total numeric := 0;
  v_expense_total numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb),
         COALESCE(SUM(r.amount), 0)
  INTO v_income, v_income_total
  FROM (
    SELECT
      a.code AS account_code,
      a.name AS account_name,
      ROUND(
        COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0),
        2
      ) AS amount
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE t.account_category = 'Income'
      AND a.is_active = true
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND (
        p_store_id IS NULL
        OR je.store_id = p_store_id
        OR je.store_id IS NULL
      )
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)) > 0.001
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb),
         COALESCE(SUM(r.amount), 0)
  INTO v_expense, v_expense_total
  FROM (
    SELECT
      a.code AS account_code,
      a.name AS account_name,
      ROUND(
        COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0),
        2
      ) AS amount
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE t.account_category = 'Expense'
      AND a.is_active = true
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND (
        p_store_id IS NULL
        OR je.store_id = p_store_id
        OR je.store_id IS NULL
      )
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.001
  ) r;

  RETURN jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'store_id', p_store_id,
    'income', v_income,
    'expenses', v_expense,
    'total_income', ROUND(v_income_total, 2),
    'total_expenses', ROUND(v_expense_total, 2),
    'net_profit', ROUND(v_income_total - v_expense_total, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_profit_and_loss(date, date, uuid) TO authenticated;

COMMIT;
