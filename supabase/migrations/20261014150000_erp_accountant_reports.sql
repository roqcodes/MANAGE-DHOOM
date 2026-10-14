-- Accountant reports: account transactions, general ledger summary (all accounts).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_general_ledger_summary(
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
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      a.id AS account_id,
      a.code AS account_code,
      a.name AS account_name,
      t.account_category,
      t.name AS account_type_name,
      ROUND(COALESCE(SUM(jel.credit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND je.transaction_date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
      ), 0), 2) AS period_credit,
      ROUND(COALESCE(SUM(jel.debit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND je.transaction_date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
      ), 0), 2) AS period_debit,
      ROUND(
        COALESCE(a.opening_balance, 0)
        + COALESCE(SUM(jel.debit_amount) FILTER (
            WHERE je.id IS NOT NULL
              AND je.transaction_date <= p_date_to
              AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
          ), 0)
        - COALESCE(SUM(jel.credit_amount) FILTER (
            WHERE je.id IS NOT NULL
              AND je.transaction_date <= p_date_to
              AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
          ), 0),
        2
      ) AS balance
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted'
    WHERE a.is_active = true
    GROUP BY a.id, a.code, a.name, t.account_category, t.name, a.opening_balance
    HAVING ABS(
      COALESCE(SUM(jel.debit_amount) FILTER (
        WHERE je.id IS NOT NULL AND je.transaction_date BETWEEN p_date_from AND p_date_to
      ), 0)
      + COALESCE(SUM(jel.credit_amount) FILTER (
        WHERE je.id IS NOT NULL AND je.transaction_date BETWEEN p_date_from AND p_date_to
      ), 0)
    ) > 0.001
       OR ABS(
         COALESCE(a.opening_balance, 0)
         + COALESCE(SUM(jel.debit_amount) FILTER (
             WHERE je.id IS NOT NULL AND je.transaction_date <= p_date_to
           ), 0)
         - COALESCE(SUM(jel.credit_amount) FILTER (
             WHERE je.id IS NOT NULL AND je.transaction_date <= p_date_to
           ), 0)
       ) > 0.001
  ) r;

  RETURN jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'store_id', p_store_id,
    'rows', v_rows,
    'total_credit', COALESCE((
      SELECT ROUND(SUM((row ->> 'period_credit')::numeric), 2)
      FROM jsonb_array_elements(v_rows) row
    ), 0),
    'total_debit', COALESCE((
      SELECT ROUND(SUM((row ->> 'period_debit')::numeric), 2)
      FROM jsonb_array_elements(v_rows) row
    ), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_account_transaction_report(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_account_type_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number, r.line_order),
      '[]'::jsonb
    )
    FROM (
      SELECT
        jel.id AS line_id,
        je.transaction_date,
        je.journal_number AS transaction_number,
        COALESCE(st.name, '—') AS store_name,
        a.name AS account_name,
        t.name AS account_type_name,
        COALESCE(NULLIF(TRIM(jel.description), ''), NULLIF(TRIM(je.description), ''), '—') AS transaction_details,
        INITCAP(REPLACE(COALESCE(je.source_entity_type, 'journal'), '_', ' ')) AS transaction_type,
        COALESCE(
          NULLIF(TRIM(je.description), ''),
          je.journal_number
        ) AS reference_number,
        ROUND(jel.debit_amount, 2) AS debit_amount,
        ROUND(jel.credit_amount, 2) AS credit_amount,
        jel.line_order
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      JOIN public.accounts a ON a.id = jel.account_id
      JOIN public.account_types t ON t.id = a.account_type_id
      LEFT JOIN public.stores st ON st.id = je.store_id
      WHERE je.status = 'posted'
        AND je.transaction_date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
        AND (p_account_id IS NULL OR jel.account_id = p_account_id)
        AND (p_account_type_id IS NULL OR a.account_type_id = p_account_type_id)
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_general_ledger_summary(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_account_transaction_report(date, date, uuid, uuid, uuid) TO authenticated;

COMMIT;
