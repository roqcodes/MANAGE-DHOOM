-- P&L COGS fixes (20261022170000 store-strict regression):
-- 1) Classify COGS by account type name, not a.code = 'COST_OF_GOODS_SOLD' only (legacy COGS-type accounts).
-- 2) Attribute credit_note / credit_note_cogs_backfill journals with je.store_id IS NULL to the credit note store.
-- Store A symptom: total_cogs 940 vs 822.50 (CN-65030 reversal ₹117.50 missing) when invoice/true-up JEs
-- are store-scoped but the credit-note COGS credit is not.

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
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

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
      AND je.store_id = p_store_id
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
    WHERE t.account_category = 'Expense'
      AND t.name = 'Cost of Goods Sold'
      AND a.is_active = true
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND (
        je.store_id = p_store_id
        OR (
          je.store_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.erp_credit_notes cn
            WHERE cn.id = je.source_entity_id
              AND cn.store_id = p_store_id
              AND je.source_entity_type IN ('credit_note', 'credit_note_cogs_backfill')
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
      AND a.is_active = true
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND je.store_id = p_store_id
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

COMMIT;
