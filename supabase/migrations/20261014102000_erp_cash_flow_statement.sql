-- Cash flow statement (indirect method) for Business Overview reports.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_account_balance_as_of(
  p_account_id uuid,
  p_as_of date,
  p_store_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(
    COALESCE(a.opening_balance, 0)
    + COALESCE(SUM(jel.debit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND je.status = 'posted'
          AND je.transaction_date <= p_as_of
          AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
      ), 0)
    - COALESCE(SUM(jel.credit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND je.status = 'posted'
          AND je.transaction_date <= p_as_of
          AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
      ), 0),
    2
  )
  FROM public.accounts a
  LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
  LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE a.id = p_account_id
  GROUP BY a.id, a.opening_balance;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_cash_flow_section(
  p_account_id uuid,
  p_type_name text,
  p_account_name text,
  p_account_code text,
  p_category text,
  p_date_from date,
  p_date_to date,
  p_store_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_category IN ('Income', 'Expense') THEN NULL
    WHEN p_type_name IN ('Cash', 'Bank') THEN NULL
    WHEN p_category = 'AccountsRecievable' THEN 'operating'
    WHEN p_category = 'AccountsPayable' THEN 'operating'
    WHEN p_category = 'Assets' AND p_type_name IN (
      'Stock', 'Other Current Assets', 'Payment Clearing', 'Other Assets'
    ) THEN 'operating'
    WHEN p_category = 'Liability' AND p_type_name IN (
      'Other Current Liability', 'Credit Card', 'Overseas Tax Payable', 'Other Liability'
    ) THEN 'operating'
    WHEN p_category = 'Assets' AND p_type_name = 'Fixed Asset' THEN 'investing'
    WHEN p_category = 'Equity' THEN 'financing'
    WHEN p_category = 'Liability' AND p_type_name = 'Long Term Liability' THEN 'financing'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_cash_flow_statement(
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
  v_start_date date;
  v_pl jsonb;
  v_net_income numeric := 0;
  v_beginning_cash numeric := 0;
  v_ending_cash numeric := 0;
  v_operating jsonb := '[]'::jsonb;
  v_investing jsonb := '[]'::jsonb;
  v_financing jsonb := '[]'::jsonb;
  v_operating_total numeric := 0;
  v_investing_total numeric := 0;
  v_financing_total numeric := 0;
  v_net_change numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  v_start_date := (p_date_from - 1);

  SELECT public.get_erp_profit_and_loss(p_date_from, p_date_to, p_store_id) INTO v_pl;
  v_net_income := COALESCE((v_pl ->> 'net_profit')::numeric, 0);

  SELECT COALESCE(SUM(public.get_erp_account_balance_as_of(a.id, v_start_date, p_store_id)), 0)
  INTO v_beginning_cash
  FROM public.accounts a
  JOIN public.account_types t ON t.id = a.account_type_id
  WHERE a.is_active = true
    AND t.name IN ('Cash', 'Bank');

  SELECT COALESCE(SUM(public.get_erp_account_balance_as_of(a.id, p_date_to, p_store_id)), 0)
  INTO v_ending_cash
  FROM public.accounts a
  JOIN public.account_types t ON t.id = a.account_type_id
  WHERE a.is_active = true
    AND t.name IN ('Cash', 'Bank');

  WITH classified AS (
    SELECT
      a.id,
      a.code AS account_code,
      a.name AS account_name,
      t.name AS account_type_name,
      t.account_category,
      public.get_erp_cash_flow_section(
        a.id, t.name, a.name, a.code, t.account_category,
        p_date_from, p_date_to, p_store_id
      ) AS section,
      public.get_erp_account_balance_as_of(a.id, v_start_date, p_store_id) AS balance_start,
      public.get_erp_account_balance_as_of(a.id, p_date_to, p_store_id) AS balance_end
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    WHERE a.is_active = true
  ),
  effects AS (
    SELECT
      section,
      account_code,
      account_name,
      account_type_name,
      ROUND(
        CASE
          WHEN section IS NULL THEN 0
          WHEN account_category IN ('Assets', 'AccountsRecievable') THEN
            -(balance_end - balance_start)
          ELSE (balance_end - balance_start)
        END,
        2
      ) AS amount
    FROM classified
    WHERE section IS NOT NULL
  )
  SELECT
    COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_type_name, r.account_code) FILTER (WHERE r.section = 'operating'), '[]'::jsonb),
    COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_type_name, r.account_code) FILTER (WHERE r.section = 'investing'), '[]'::jsonb),
    COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_type_name, r.account_code) FILTER (WHERE r.section = 'financing'), '[]'::jsonb)
  INTO v_operating, v_investing, v_financing
  FROM (
    SELECT section, account_code, account_name, account_type_name, amount
    FROM effects
    WHERE ABS(amount) > 0.001
  ) r;

  v_operating_total := v_net_income + COALESCE((
    SELECT SUM((elem ->> 'amount')::numeric)
    FROM jsonb_array_elements(v_operating) elem
  ), 0);

  v_investing_total := COALESCE((
    SELECT SUM((elem ->> 'amount')::numeric)
    FROM jsonb_array_elements(v_investing) elem
  ), 0);

  v_financing_total := COALESCE((
    SELECT SUM((elem ->> 'amount')::numeric)
    FROM jsonb_array_elements(v_financing) elem
  ), 0);

  v_net_change := v_operating_total + v_investing_total + v_financing_total;

  RETURN jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'store_id', p_store_id,
    'beginning_cash', ROUND(v_beginning_cash, 2),
    'ending_cash', ROUND(v_ending_cash, 2),
    'net_income', ROUND(v_net_income, 2),
    'operating', jsonb_build_object(
      'lines', v_operating,
      'total', ROUND(v_operating_total, 2)
    ),
    'investing', jsonb_build_object(
      'lines', v_investing,
      'total', ROUND(v_investing_total, 2)
    ),
    'financing', jsonb_build_object(
      'lines', v_financing,
      'total', ROUND(v_financing_total, 2)
    ),
    'net_change', ROUND(v_net_change, 2),
    'net_change_reconciled', ROUND(v_ending_cash - v_beginning_cash, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_account_balance_as_of(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_cash_flow_statement(date, date, uuid) TO authenticated;

COMMIT;
