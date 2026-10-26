-- SQL editor / service_role: get_erp_profit_and_loss must not require auth.uid() staff JWT.

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
  v_cogs jsonb;
  v_expense jsonb;
  v_income_total numeric := 0;
  v_cogs_total numeric := 0;
  v_operating_total numeric := 0;
BEGIN
  PERFORM public.erp_require_staff_or_service_role();

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  IF current_user NOT IN ('postgres', 'supabase_admin')
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
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
      AND public.erp_resolved_journal_store_id(je.id) = p_store_id
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)) > 0.001
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb),
         COALESCE(SUM(r.amount), 0)
  INTO v_cogs, v_cogs_total
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
    WHERE je.status = 'posted'
      AND a.is_active = true
      AND (
        (t.account_category = 'Expense' AND t.name = 'Cost of Goods Sold')
        OR a.code = 'COST_OF_GOODS_SOLD'
      )
      AND public.erp_resolved_journal_store_id(je.id) = p_store_id
      AND (
        je.transaction_date BETWEEN p_date_from AND p_date_to
        OR (
          jel.credit_amount > 0.001
          AND je.source_entity_type IN ('credit_note', 'credit_note_cogs_backfill')
          AND EXISTS (
            SELECT 1
            FROM public.erp_credit_notes cn
            WHERE cn.id = je.source_entity_id
              AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
          )
        )
      )
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.001
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb),
         COALESCE(SUM(r.amount), 0)
  INTO v_expense, v_operating_total
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
      AND t.name <> 'Cost of Goods Sold'
      AND a.code <> 'COST_OF_GOODS_SOLD'
      AND a.is_active = true
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND public.erp_resolved_journal_store_id(je.id) = p_store_id
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.001
  ) r;

  RETURN jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'store_id', p_store_id,
    'income', v_income,
    'cogs', v_cogs,
    'expenses', v_expense,
    'total_income', ROUND(v_income_total, 2),
    'total_cogs', ROUND(v_cogs_total, 2),
    'gross_profit', ROUND(v_income_total - v_cogs_total, 2),
    'total_expenses', ROUND(v_operating_total, 2),
    'total_operating_expenses', ROUND(v_operating_total, 2),
    'net_profit', ROUND(v_income_total - v_cogs_total - v_operating_total, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_profit_and_loss(date, date, uuid) TO postgres;

COMMIT;
