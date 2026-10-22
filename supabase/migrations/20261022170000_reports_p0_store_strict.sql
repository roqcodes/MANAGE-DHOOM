-- P0 report fixes: store-strict GL, TB aliases, CF -Δ + GRNI,
-- sales-by-item SKUs, AR/AP balances, cash day book, payments salesman.

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
    CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END
    + COALESCE(SUM(jel.debit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND je.status = 'posted'
          AND je.transaction_date <= p_as_of
          AND (p_store_id IS NULL OR je.store_id = p_store_id)
      ), 0)
    - COALESCE(SUM(jel.credit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND je.status = 'posted'
          AND je.transaction_date <= p_as_of
          AND (p_store_id IS NULL OR je.store_id = p_store_id)
      ), 0),
    2
  )
  FROM public.accounts a
  LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
  LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE a.id = p_account_id
  GROUP BY a.id, a.store_id, a.opening_balance;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_trial_balance(
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
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      a.id AS account_id,
      a.code AS account_code,
      a.name AS account_name,
      t.account_category,
      t.name AS account_type_name,
      ROUND(
        CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END,
        2
      ) AS opening_balance,
      ROUND(GREATEST((
        CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END
        + COALESCE(SUM(jel.debit_amount) FILTER (
            WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
          ), 0)
        - COALESCE(SUM(jel.credit_amount) FILTER (
            WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
          ), 0)
      ), 0), 2) AS period_debit,
      ROUND(GREATEST((
        CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END
        + COALESCE(SUM(jel.debit_amount) FILTER (
            WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
          ), 0)
        - COALESCE(SUM(jel.credit_amount) FILTER (
            WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
          ), 0)
      ), 0), 2) AS cumulative_debit,
      ROUND(GREATEST(-(
        CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END
        + COALESCE(SUM(jel.debit_amount) FILTER (
            WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
          ), 0)
        - COALESCE(SUM(jel.credit_amount) FILTER (
            WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
          ), 0)
      ), 0), 2) AS period_credit,
      ROUND(GREATEST(-(
        CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END
        + COALESCE(SUM(jel.debit_amount) FILTER (
            WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
          ), 0)
        - COALESCE(SUM(jel.credit_amount) FILTER (
            WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
          ), 0)
      ), 0), 2) AS cumulative_credit,
      ROUND(
        CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END
        + COALESCE(SUM(jel.debit_amount) FILTER (
            WHERE je.id IS NOT NULL
              AND je.transaction_date <= p_as_of
              AND je.store_id = p_store_id
          ), 0)
        - COALESCE(SUM(jel.credit_amount) FILTER (
            WHERE je.id IS NOT NULL
              AND je.transaction_date <= p_as_of
              AND je.store_id = p_store_id
          ), 0),
        2
      ) AS balance
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted'
    WHERE a.is_active = true
      AND (a.store_id IS NULL OR a.store_id = p_store_id)
    GROUP BY a.id, a.code, a.name, t.account_category, t.name, a.store_id, a.opening_balance
    HAVING ABS(
      CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END
      + COALESCE(SUM(jel.debit_amount) FILTER (
          WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
        ), 0)
      - COALESCE(SUM(jel.credit_amount) FILTER (
          WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
        ), 0)
    ) > 0.001
       OR COALESCE(SUM(jel.debit_amount) FILTER (
         WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
       ), 0) > 0
       OR COALESCE(SUM(jel.credit_amount) FILTER (
         WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of AND je.store_id = p_store_id
       ), 0) > 0
  ) r;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'store_id', p_store_id,
    'rows', v_result,
    'total_debit', COALESCE((
      SELECT ROUND(SUM((row ->> 'period_debit')::numeric), 2)
      FROM jsonb_array_elements(v_result) row
    ), 0),
    'total_credit', COALESCE((
      SELECT ROUND(SUM((row ->> 'period_credit')::numeric), 2)
      FROM jsonb_array_elements(v_result) row
    ), 0)
  );
END;
$$;

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
      AND a.code = 'COST_OF_GOODS_SOLD'
      AND a.is_active = true
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND je.store_id = p_store_id
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
      AND a.code <> 'COST_OF_GOODS_SOLD'
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
    'net_profit', ROUND(v_income_total - v_cogs_total - v_operating_total, 2)
  );
END;
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
      'Other Current Liability', 'Credit Card', 'Overseas Tax Payable', 'Other Liability', 'Goods Receipt Pending'
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

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  v_start_date := (p_date_from - 1);

  SELECT public.get_erp_profit_and_loss(p_date_from, p_date_to, p_store_id) INTO v_pl;
  v_net_income := COALESCE((v_pl ->> 'net_profit')::numeric, 0);

  SELECT COALESCE(SUM(public.get_erp_account_balance_as_of(a.id, v_start_date, p_store_id)), 0)
  INTO v_beginning_cash
  FROM public.accounts a
  JOIN public.account_types t ON t.id = a.account_type_id
  WHERE a.is_active = true
    AND t.name IN ('Cash', 'Bank')
    AND (a.store_id IS NULL OR a.store_id = p_store_id);

  SELECT COALESCE(SUM(public.get_erp_account_balance_as_of(a.id, p_date_to, p_store_id)), 0)
  INTO v_ending_cash
  FROM public.accounts a
  JOIN public.account_types t ON t.id = a.account_type_id
  WHERE a.is_active = true
    AND t.name IN ('Cash', 'Bank')
    AND (a.store_id IS NULL OR a.store_id = p_store_id);

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
      AND (a.store_id IS NULL OR a.store_id = p_store_id)
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
          ELSE -(balance_end - balance_start)
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

DROP FUNCTION IF EXISTS public.get_erp_customer_balance_report(uuid);
DROP FUNCTION IF EXISTS public.get_erp_customer_balance_report(uuid, text);

CREATE OR REPLACE FUNCTION public.get_erp_customer_balance_report(
  p_store_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
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

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.customer_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      u.id AS customer_id,
      u.name AS customer_name,
      u.phone,
      u.email,
      ROUND(COALESCE(pay.unallocated_amount, 0), 2) AS unallocated_amount,
      ROUND(
        COALESCE(u.opening_balance, 0)
        + COALESCE(inv.balance_due, 0)
        - COALESCE(pay.unallocated_amount, 0),
        2
      ) AS total_receivable,
      COALESCE(inv.open_invoices, 0) AS open_invoices
    FROM public.users u
    LEFT JOIN LATERAL (
      SELECT
        SUM(i.balance_due) AS balance_due,
        COUNT(i.id) FILTER (WHERE ABS(COALESCE(i.balance_due, 0)) > 0.001) AS open_invoices
      FROM public.invoices i
      WHERE i.user_id = u.id
        AND i.status IN ('issued', 'partial', 'paid', 'overdue')
        AND i.store_id = p_store_id
        AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
    ) inv ON true
    LEFT JOIN LATERAL (
      SELECT SUM(p.unallocated_amount) AS unallocated_amount
      FROM public.erp_customer_payments p
      WHERE p.user_id = u.id
        AND p.store_id = p_store_id
    ) pay ON true
    WHERE public.erp_report_is_customer_role(u.role)
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.phone ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
      )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

DROP FUNCTION IF EXISTS public.get_erp_vendor_balance_report(uuid);

CREATE OR REPLACE FUNCTION public.get_erp_vendor_balance_report(
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.vendor_name), '[]'::jsonb)
    FROM (
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        v.phone,
        ROUND(COALESCE(pay.unallocated_amount, 0), 2) AS unallocated_amount,
        ROUND(
          COALESCE(bill.balance_due, 0) - COALESCE(pay.unallocated_amount, 0),
          2
        ) AS balance_due,
        COALESCE(bill.open_bills, 0) AS open_bills
      FROM public.vendors v
      LEFT JOIN LATERAL (
        SELECT
          SUM(pb.balance_due) AS balance_due,
          COUNT(pb.id) FILTER (WHERE ABS(COALESCE(pb.balance_due, 0)) > 0.001) AS open_bills
        FROM public.erp_purchase_bills pb
        WHERE pb.vendor_id = v.id
          AND pb.status IN ('finalized', 'partial', 'paid')
          AND pb.store_id = p_store_id
      ) bill ON true
      LEFT JOIN LATERAL (
        SELECT SUM(sp.unallocated_amount) AS unallocated_amount
        FROM public.erp_supplier_payments sp
        WHERE sp.vendor_id = v.id
          AND sp.store_id = p_store_id
      ) pay ON true
      WHERE v.is_active IS DISTINCT FROM false
        AND (
          v_search IS NULL
          OR v.name ILIKE '%' || v_search || '%'
          OR v.phone ILIKE '%' || v_search || '%'
          OR v.email ILIKE '%' || v_search || '%'
        )
    ) r
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_erp_sales_by_item(date, date, uuid, text);

CREATE OR REPLACE FUNCTION public.get_erp_sales_by_item(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_channel text DEFAULT 'all',
  p_salesman_id uuid DEFAULT NULL
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

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.net_sales_ex_tax DESC), '[]'::jsonb)
    FROM (
      WITH sales AS (
        SELECT
          ii.product_name,
          ii.variant_id,
          ii.product_id,
          i.source AS channel,
          i.store_id,
          SUM(ii.quantity) AS total_qty,
          SUM(COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount)) AS net_sales_ex_tax,
          SUM(ii.total_amount) AS total_amount,
          SUM(ii.gst_amount) AS total_tax,
          SUM(mc.line_cogs) AS purchase_cost,
          SUM(mc.uncosted_revenue) AS uncosted_revenue,
          SUM(mc.recognized_profit) AS profit
        FROM public.invoice_items ii
        JOIN public.invoices i ON i.id = ii.invoice_id
        CROSS JOIN LATERAL public.erp_invoice_item_margin_components(
          ii.base_price,
          ii.unit_price,
          ii.variant_id,
          ii.product_id,
          i.store_id,
          ii.quantity,
          ii.pending_cost_qty,
          COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount)
        ) mc
        WHERE i.status NOT IN ('cancelled', 'pending', 'draft')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
          AND i.store_id = p_store_id
          AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
          AND (ii.product_id IS NOT NULL OR ii.variant_id IS NOT NULL)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND i.source = 'erp')
            OR (p_channel = 'online' AND i.source <> 'erp')
          )
        GROUP BY ii.product_name, ii.variant_id, ii.product_id, i.source, i.store_id
      ),
      credits AS (
        SELECT
          cl.product_name,
          cl.variant_id,
          cl.product_id,
          COALESCE(i.source, 'erp') AS channel,
          cn.store_id,
          SUM(cl.quantity) AS credit_qty,
          SUM(ROUND(cl.unit_price * cl.quantity, 2)) AS credit_subtotal,
          SUM(cl.line_total) AS credit_with_tax,
          SUM(cl.tax_amount) AS credit_tax,
          SUM(
            ROUND(
              public.erp_resolve_invoice_line_cost(
                NULL, cl.variant_id, cl.product_id, cn.store_id
              ) * cl.quantity,
              2
            )
          ) AS credit_cogs
        FROM public.erp_credit_note_lines cl
        JOIN public.erp_credit_notes cn ON cn.id = cl.credit_note_id
        LEFT JOIN public.invoices i ON i.id = cn.source_invoice_id
        WHERE cn.status IN ('issued', 'applied')
          AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
          AND cn.store_id = p_store_id
          AND (cl.product_id IS NOT NULL OR cl.variant_id IS NOT NULL)
          AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND COALESCE(i.source, 'erp') = 'erp')
            OR (p_channel = 'online' AND COALESCE(i.source, 'erp') <> 'erp')
          )
        GROUP BY cl.product_name, cl.variant_id, cl.product_id, COALESCE(i.source, 'erp'), cn.store_id
      ),
      keys AS (
        SELECT product_name, variant_id, channel FROM sales
        UNION
        SELECT product_name, variant_id, channel FROM credits
      )
      SELECT
        k.product_name,
        k.variant_id,
        k.channel,
        ROUND(COALESCE(s.total_qty, 0) - COALESCE(c.credit_qty, 0), 2) AS total_qty,
        ROUND(COALESCE(s.net_sales_ex_tax, 0) - COALESCE(c.credit_subtotal, 0), 2) AS net_sales_ex_tax,
        ROUND(COALESCE(s.total_amount, 0) - COALESCE(c.credit_with_tax, 0), 2) AS total_amount,
        ROUND(COALESCE(s.total_tax, 0) - COALESCE(c.credit_tax, 0), 2) AS total_tax,
        ROUND(COALESCE(s.purchase_cost, 0) - COALESCE(c.credit_cogs, 0), 2) AS purchase_cost,
        ROUND(COALESCE(s.uncosted_revenue, 0), 2) AS uncosted_revenue,
        ROUND(
          COALESCE(s.profit, 0) - (COALESCE(c.credit_subtotal, 0) - COALESCE(c.credit_cogs, 0)),
          2
        ) AS profit
      FROM keys k
      LEFT JOIN sales s
        ON s.product_name IS NOT DISTINCT FROM k.product_name
        AND s.variant_id IS NOT DISTINCT FROM k.variant_id
        AND s.channel IS NOT DISTINCT FROM k.channel
      LEFT JOIN credits c
        ON c.product_name IS NOT DISTINCT FROM k.product_name
        AND c.variant_id IS NOT DISTINCT FROM k.variant_id
        AND c.channel IS NOT DISTINCT FROM k.channel
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_credit_note_report(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_salesman_id uuid DEFAULT NULL
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

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.credit_note_date DESC), '[]'::jsonb)
    FROM (
      SELECT
        cn.id,
        cn.credit_note_number,
        cn.credit_note_date,
        cn.status,
        cn.reference,
        u.name AS customer_name,
        s.name AS store_name,
        inv.invoice_number,
        ROUND(cn.subtotal, 2) AS amount_without_tax,
        ROUND(cn.tax_amount, 2) AS tax,
        ROUND(cn.total_amount, 2) AS total_amount,
        ROUND(cn.balance_remaining, 2) AS balance_remaining
      FROM public.erp_credit_notes cn
      JOIN public.users u ON u.id = cn.user_id
      LEFT JOIN public.stores s ON s.id = cn.store_id
      LEFT JOIN public.invoices inv ON inv.id = cn.source_invoice_id
      WHERE cn.credit_note_date BETWEEN p_date_from AND p_date_to
        AND cn.status IN ('issued', 'applied')
        AND cn.store_id = p_store_id
        AND public.erp_report_matches_salesman(p_salesman_id, inv.sales_person_id)
    ) r
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_erp_payments_received_report(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_erp_payments_received_report(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_salesman_id uuid DEFAULT NULL
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

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  RETURN jsonb_build_object(
    'rows',
    COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.payment_date DESC, r.payment_number DESC)
      FROM (
        SELECT
          p.id,
          p.payment_number,
          p.payment_date,
          p.payment_mode,
          u.name AS customer_name,
          s.name AS store_name,
          ROUND(p.total_amount, 2) AS total_amount,
          ROUND(COALESCE(p.bank_charges, 0), 2) AS bank_charges,
          ROUND(p.total_amount - COALESCE(p.bank_charges, 0), 2) AS net_amount,
          ROUND(COALESCE(p.settlement_discount, 0), 2) AS settlement_discount,
          ROUND(p.total_amount + COALESCE(p.settlement_discount, 0), 2) AS ar_cleared,
          ROUND(p.unallocated_amount, 2) AS unallocated_amount,
          p.is_bulk,
          COALESCE((
            SELECT string_agg(DISTINCT i.invoice_number::text, ', ' ORDER BY i.invoice_number::text)
            FROM public.erp_payment_allocations a
            JOIN public.invoices i ON i.id = a.invoice_id
            WHERE a.payment_id = p.id
          ), '') AS invoice_numbers
        FROM public.erp_customer_payments p
        JOIN public.users u ON u.id = p.user_id
        LEFT JOIN public.stores s ON s.id = p.store_id
        WHERE p.payment_date BETWEEN p_date_from AND p_date_to
          AND p.store_id = p_store_id
          AND (
            p_salesman_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.erp_payment_allocations a
              JOIN public.invoices i ON i.id = a.invoice_id
              WHERE a.payment_id = p.id
                AND i.sales_person_id IS NOT DISTINCT FROM p_salesman_id
            )
          )
      ) r
    ), '[]'::jsonb),
    'payment_summary',
    COALESCE((
      SELECT jsonb_build_object(
        'cash', ROUND(COALESCE(SUM(p.total_amount) FILTER (
          WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'cash'
        ), 0), 2),
        'card', ROUND(COALESCE(SUM(p.total_amount) FILTER (
          WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'card'
        ), 0), 2),
        'check', ROUND(COALESCE(SUM(p.total_amount) FILTER (
          WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'check'
        ), 0), 2),
        'bank_remittance', ROUND(COALESCE(SUM(p.total_amount) FILTER (
          WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'bank_remittance'
        ), 0), 2),
        'bank_transfer', ROUND(COALESCE(SUM(p.total_amount) FILTER (
          WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'bank_transfer'
        ), 0), 2),
        'other', ROUND(COALESCE(SUM(p.total_amount) FILTER (
          WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'other'
        ), 0), 2),
        'total', ROUND(COALESCE(SUM(p.total_amount), 0), 2),
        'bank_charges', ROUND(COALESCE(SUM(p.bank_charges), 0), 2),
        'settlement_discount', ROUND(COALESCE(SUM(p.settlement_discount), 0), 2),
        'count', COUNT(*)::int
      )
      FROM public.erp_customer_payments p
      WHERE p.payment_date BETWEEN p_date_from AND p_date_to
        AND p.store_id = p_store_id
        AND (
          p_salesman_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.erp_payment_allocations a
            JOIN public.invoices i ON i.id = a.invoice_id
            WHERE a.payment_id = p.id
              AND i.sales_person_id IS NOT DISTINCT FROM p_salesman_id
          )
        )
    ), '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_day_book(
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number), '[]'::jsonb)
    FROM (
      SELECT
        t.id,
        t.transaction_number,
        t.transaction_date,
        t.transaction_type,
        t.details,
        a.name AS account_name,
        ca.name AS counter_account_name,
        s.name AS store_name,
        ROUND(t.debit_amount, 2) AS debit_amount,
        ROUND(t.credit_amount, 2) AS credit_amount,
        ROUND(t.running_balance, 2) AS running_balance
      FROM public.erp_account_transactions t
      JOIN public.accounts a ON a.id = t.account_id
      JOIN public.account_types at ON at.id = a.account_type_id
      LEFT JOIN public.accounts ca ON ca.id = t.counter_account_id
      LEFT JOIN public.stores s ON s.id = t.store_id
      WHERE t.transaction_date BETWEEN p_date_from AND p_date_to
        AND t.store_id = p_store_id
        AND at.name IN ('Cash', 'Bank')
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_minus_stock_report(
  p_store_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL
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

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.stock ASC, r.product_name), '[]'::jsonb)
    FROM (
      SELECT
        spi.product_id,
        spi.store_id,
        COALESCE(p.barcode, p.id::text) AS product_code,
        p.name AS product_name,
        c.name AS category_name,
        b.name AS brand_name,
        s.name AS store_name,
        ROUND(spi.stock, 2) AS stock,
        ROUND(ABS(spi.stock), 2) AS shortage_qty,
        ROUND(ABS(spi.stock) * COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS shortage_cost,
        ROUND(COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(spi.sales_price, p.price, 0), 2) AS sales_price,
        ROUND(spi.stock * COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS stock_purchase_value,
        ROUND(spi.stock * COALESCE(spi.sales_price, p.price, 0), 2) AS stock_sales_value,
        'Minus stock'::text AS stock_status
      FROM public.store_product_inventory spi
      JOIN public.products p ON p.id = spi.product_id
      JOIN public.stores s ON s.id = spi.store_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      WHERE spi.stock < 0
        AND spi.store_id = p_store_id
        AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_financial_dashboard(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_to date;
  v_pl jsonb;
  v_ar_gl numeric;
  v_ap_gl numeric;
  v_ar_open numeric;
  v_ap_open numeric;
  v_purchases numeric;
  v_daily_sales jsonb;
  v_low_stock_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_from := COALESCE(p_date_from, date_trunc('year', CURRENT_DATE)::date);
  v_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  v_pl := public.get_erp_profit_and_loss(v_from, v_to, p_store_id);

  v_ar_gl := public.get_erp_account_balance_as_of(public.get_account_by_code('ACCOUNTS_RECIEVABLE'), v_to, p_store_id);
  v_ap_gl := public.get_erp_account_balance_as_of(public.get_account_by_code('ACCOUNTS_PAYABLE'), v_to, p_store_id);

  SELECT COALESCE(SUM(balance_due), 0) INTO v_ar_open
  FROM public.invoices
  WHERE (p_store_id IS NULL OR store_id = p_store_id)
    AND status IN ('issued', 'partial', 'paid', 'overdue');

  SELECT COALESCE(SUM(balance_due), 0) INTO v_ap_open
  FROM public.erp_purchase_bills
  WHERE (p_store_id IS NULL OR store_id = p_store_id)
    AND status IN ('finalized', 'partial', 'paid');

  SELECT COALESCE(SUM(total_amount), 0) INTO v_purchases
  FROM public.erp_purchase_bills
  WHERE status IN ('finalized', 'partial', 'paid')
    AND purchase_date BETWEEN v_from AND v_to
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_daily_sales
  FROM (
    SELECT COALESCE(i.issued_at::date, i.created_at::date) AS day, SUM(i.total_amount) AS total
    FROM public.invoices i
    WHERE i.status IN ('issued', 'partial', 'paid')
      AND COALESCE(i.issued_at::date, i.created_at::date) >= (CURRENT_DATE - 30)
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
    GROUP BY COALESCE(i.issued_at::date, i.created_at::date)
    ORDER BY day
  ) r;

  SELECT COUNT(*) INTO v_low_stock_count
  FROM public.store_inventory si
  WHERE COALESCE(si.stock, 0) <= 5
    AND (p_store_id IS NULL OR si.store_id = p_store_id);

  RETURN jsonb_build_object(
    'accounts_receivable', ROUND(v_ar_open, 2),
    'accounts_payable', ROUND(v_ap_open, 2),
    'ar_gl', ROUND(v_ar_gl, 2),
    'ap_gl', ROUND(v_ap_gl, 2),
    'net_income_ytd', (v_pl ->> 'total_income')::numeric,
    'cogs_ytd', (v_pl ->> 'total_cogs')::numeric,
    'purchases_ytd', ROUND(v_purchases, 2),
    'expenses_ytd', (v_pl ->> 'total_expenses')::numeric,
    'gross_profit_ytd', (v_pl ->> 'gross_profit')::numeric,
    'net_profit_ytd', (v_pl ->> 'net_profit')::numeric,
    'date_from', v_from,
    'date_to', v_to,
    'store_id', p_store_id,
    'low_stock_count', v_low_stock_count,
    'daily_sales', v_daily_sales,
    'invoice_status_ytd', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT status, COUNT(*) AS count, SUM(total_amount) AS total
        FROM public.invoices i
        WHERE COALESCE(i.issued_at::date, i.created_at::date) BETWEEN v_from AND v_to
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
        GROUP BY status
      ) r
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_erp_store_wise_stock_report();

CREATE OR REPLACE FUNCTION public.get_erp_store_wise_stock_report(
  p_store_id uuid DEFAULT NULL
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

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.store_name), '[]'::jsonb)
    FROM (
      SELECT
        s.id AS store_id,
        s.name AS store_name,
        COUNT(DISTINCT spi.product_id) FILTER (WHERE COALESCE(spi.stock, 0) <> 0) AS sku_count,
        ROUND(COALESCE(SUM(spi.stock), 0), 2) AS total_stock,
        0::numeric AS total_reserved,
        ROUND(
          COALESCE(SUM(spi.stock * COALESCE(spi.purchase_price, p.purchase_price, 0)), 0),
          2
        ) AS stock_value_at_cost
      FROM public.stores s
      LEFT JOIN public.store_product_inventory spi ON spi.store_id = s.id
      LEFT JOIN public.products p ON p.id = spi.product_id
      WHERE s.id = p_store_id
      GROUP BY s.id, s.name
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_daily_collection_report(
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.report_date DESC), '[]'::jsonb)
    FROM (
      WITH dates AS (
        SELECT generate_series(p_date_from, p_date_to, '1 day'::interval)::date AS d
      ),
      invoice_totals AS (
        SELECT
          COALESCE(issued_at::date, created_at::date) AS inv_date,
          COUNT(id) AS invoice_count,
          SUM(total_amount) AS net_total,
          SUM(gst_amount) AS tax,
          SUM(discount) AS total_discount,
          SUM(balance_due) AS balance
        FROM public.invoices
        WHERE status NOT IN ('cancelled', 'pending', 'draft')
          AND COALESCE(issued_at::date, created_at::date) BETWEEN p_date_from AND p_date_to
          AND store_id = p_store_id
        GROUP BY 1
      ),
      payment_totals AS (
        SELECT
          payment_date,
          SUM(total_amount) FILTER (WHERE payment_mode = 'cash') AS cash_payment,
          SUM(total_amount) FILTER (WHERE payment_mode = 'card') AS card_payment,
          SUM(total_amount) FILTER (WHERE payment_mode = 'check') AS check_payment,
          SUM(total_amount) FILTER (WHERE payment_mode = 'bank_transfer') AS bank_transfer,
          SUM(total_amount) FILTER (WHERE payment_mode = 'bank_remittance') AS bank_remittance,
          SUM(total_amount) AS total_payment
        FROM public.erp_customer_payments
        WHERE payment_date BETWEEN p_date_from AND p_date_to
          AND store_id = p_store_id
        GROUP BY payment_date
      )
      SELECT
        dates.d AS report_date,
        COALESCE(i.invoice_count, 0) AS invoice_count,
        ROUND(COALESCE(i.net_total, 0), 2) AS net_total,
        ROUND(COALESCE(i.tax, 0), 2) AS tax,
        ROUND(COALESCE(i.total_discount, 0), 2) AS total_discount,
        ROUND(COALESCE(p.cash_payment, 0), 2) AS cash_payment,
        ROUND(COALESCE(p.card_payment, 0), 2) AS card_payment,
        ROUND(COALESCE(p.check_payment, 0), 2) AS check_payment,
        ROUND(COALESCE(p.bank_transfer, 0), 2) AS bank_transfer,
        ROUND(COALESCE(p.bank_remittance, 0), 2) AS bank_remittance,
        ROUND(COALESCE(p.total_payment, 0), 2) AS total_payment,
        ROUND(COALESCE(i.balance, 0), 2) AS balance
      FROM dates
      LEFT JOIN invoice_totals i ON i.inv_date = dates.d
      LEFT JOIN payment_totals p ON p.payment_date = dates.d
      WHERE COALESCE(i.invoice_count, 0) > 0 OR COALESCE(p.total_payment, 0) > 0
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_monthly_collection_report(
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.period_from DESC), '[]'::jsonb)
    FROM (
      WITH months AS (
        SELECT
          date_trunc('month', d)::date AS period_from,
          (date_trunc('month', d) + interval '1 month - 1 day')::date AS period_to,
          to_char(d, 'FMMonth YYYY') AS month_label,
          EXTRACT(days FROM date_trunc('month', d) + interval '1 month - 1 day') AS days_in_period
        FROM generate_series(date_trunc('month', p_date_from), date_trunc('month', p_date_to), '1 month'::interval) d
      ),
      invoice_totals AS (
        SELECT
          date_trunc('month', COALESCE(issued_at::date, created_at::date))::date AS month_start,
          COUNT(id) AS invoice_count,
          SUM(total_amount) AS net_total,
          SUM(gst_amount) AS tax,
          SUM(discount) AS total_discount,
          SUM(balance_due) AS balance
        FROM public.invoices
        WHERE status NOT IN ('cancelled', 'pending', 'draft')
          AND COALESCE(issued_at::date, created_at::date) BETWEEN p_date_from AND p_date_to
          AND store_id = p_store_id
        GROUP BY 1
      ),
      payment_totals AS (
        SELECT
          date_trunc('month', payment_date)::date AS month_start,
          SUM(total_amount) FILTER (WHERE payment_mode = 'cash') AS cash_payment,
          SUM(total_amount) FILTER (WHERE payment_mode = 'card') AS card_payment,
          SUM(total_amount) FILTER (WHERE payment_mode = 'check') AS check_payment,
          SUM(total_amount) FILTER (WHERE payment_mode = 'bank_transfer') AS bank_transfer,
          SUM(total_amount) FILTER (WHERE payment_mode = 'bank_remittance') AS bank_remittance,
          SUM(total_amount) AS total_payment
        FROM public.erp_customer_payments
        WHERE payment_date BETWEEN p_date_from AND p_date_to
          AND store_id = p_store_id
        GROUP BY 1
      )
      SELECT
        m.month_label,
        m.period_from,
        m.period_to,
        m.days_in_period,
        COALESCE(i.invoice_count, 0) AS invoice_count,
        ROUND(COALESCE(i.net_total, 0), 2) AS net_total,
        ROUND(COALESCE(i.tax, 0), 2) AS tax,
        ROUND(COALESCE(i.total_discount, 0), 2) AS total_discount,
        ROUND(COALESCE(p.cash_payment, 0), 2) AS cash_payment,
        ROUND(COALESCE(p.card_payment, 0), 2) AS card_payment,
        ROUND(COALESCE(p.check_payment, 0), 2) AS check_payment,
        ROUND(COALESCE(p.bank_transfer, 0), 2) AS bank_transfer,
        ROUND(COALESCE(p.bank_remittance, 0), 2) AS bank_remittance,
        ROUND(COALESCE(p.total_payment, 0), 2) AS total_payment,
        ROUND(COALESCE(i.balance, 0), 2) AS balance
      FROM months m
      LEFT JOIN invoice_totals i ON i.month_start = m.period_from
      LEFT JOIN payment_totals p ON p.month_start = m.period_from
      WHERE COALESCE(i.invoice_count, 0) > 0 OR COALESCE(p.total_payment, 0) > 0
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_account_balance_as_of(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_trial_balance(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_profit_and_loss(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_cash_flow_statement(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_balance_report(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_balance_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_item(date, date, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_credit_note_report(date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_payments_received_report(date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_day_book(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_minus_stock_report(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_financial_dashboard(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_store_wise_stock_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_daily_collection_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_monthly_collection_report(date, date, uuid) TO authenticated;

COMMIT;
