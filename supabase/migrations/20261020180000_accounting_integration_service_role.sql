-- Allow automated accounting validation via service_role JWT (integration scripts).

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_require_staff_or_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_require_staff_or_service_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_require_staff_or_service_role() TO service_role;

CREATE OR REPLACE FUNCTION public.erp_audit_unbalanced_journals(
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.erp_require_staff_or_service_role();

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT
          je.id,
          je.journal_number,
          je.transaction_date,
          je.total_debit,
          je.total_credit,
          ROUND(je.total_debit - je.total_credit, 4) AS variance
        FROM public.journal_entries je
        WHERE je.status = 'posted'
          AND ABS(je.total_debit - je.total_credit) > 0.01
        ORDER BY je.transaction_date DESC
        LIMIT p_limit
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_audit_missing_sale_cogs_gl(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := COALESCE(p_date_from, '1970-01-01'::date);
  v_to date := COALESCE(p_date_to, CURRENT_DATE);
  v_cogs_account uuid;
BEGIN
  PERFORM public.erp_require_staff_or_service_role();

  IF p_store_id IS NOT NULL AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  v_cogs_account := public.get_account_by_code('COST_OF_GOODS_SOLD');

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT
          i.id AS invoice_id,
          i.invoice_number,
          i.store_id,
          COALESCE(i.issued_at::date, i.created_at::date) AS invoice_date,
          public.erp_invoice_recognized_cogs_total(i.id) AS expected_cogs,
          ROUND(COALESCE((
            SELECT SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
            FROM public.journal_entries je
            JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
            WHERE jel.account_id = v_cogs_account
              AND je.status = 'posted'
              AND (
                (je.source_entity_type = 'invoice' AND je.source_entity_id = i.id)
                OR (
                  je.source_entity_type = 'invoice_deferred_cogs'
                  AND je.source_entity_id IN (
                    SELECT d.id FROM public.erp_invoice_deferred_cogs_postings d WHERE d.invoice_id = i.id
                  )
                )
              )
          ), 0), 2) AS posted_cogs,
          ROUND(
            public.erp_invoice_recognized_cogs_total(i.id)
            - COALESCE((
              SELECT SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
              FROM public.journal_entries je
              JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
              WHERE jel.account_id = v_cogs_account
                AND je.status = 'posted'
                AND (
                  (je.source_entity_type = 'invoice' AND je.source_entity_id = i.id)
                  OR (
                    je.source_entity_type = 'invoice_deferred_cogs'
                    AND je.source_entity_id IN (
                      SELECT d.id FROM public.erp_invoice_deferred_cogs_postings d WHERE d.invoice_id = i.id
                    )
                  )
                )
            ), 0),
            2
          ) AS cogs_gap
        FROM public.invoices i
        WHERE i.status IN ('issued', 'partial', 'paid')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN v_from AND v_to
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
          AND public.erp_invoice_recognized_cogs_total(i.id) > 0.01
        ORDER BY cogs_gap DESC
        LIMIT p_limit
      ) x
      WHERE x.cogs_gap > 0.01
    ),
    '[]'::jsonb
  );
END;
$$;

-- Patch P&L and dashboard auth gates (bodies unchanged except first check).

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

  IF p_store_id IS NOT NULL AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
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
        p_store_id IS NULL
        OR je.store_id = p_store_id
        OR je.store_id IS NULL
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
    'cogs', v_cogs,
    'expenses', v_expense,
    'total_income', ROUND(v_income_total, 2),
    'total_cogs', ROUND(v_cogs_total, 2),
    'total_operating_expenses', ROUND(v_operating_total, 2),
    'total_expenses', ROUND(v_cogs_total + v_operating_total, 2),
    'gross_profit', ROUND(v_income_total - v_cogs_total, 2),
    'net_profit', ROUND(v_income_total - v_cogs_total - v_operating_total, 2)
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
  v_ar numeric;
  v_ap numeric;
  v_purchases numeric;
  v_daily_sales jsonb;
BEGIN
  PERFORM public.erp_require_staff_or_service_role();

  v_from := COALESCE(p_date_from, date_trunc('year', CURRENT_DATE)::date);
  v_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_store_id IS NOT NULL AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  v_pl := public.get_erp_profit_and_loss(v_from, v_to, p_store_id);

  IF p_store_id IS NULL THEN
    v_ar := public.get_account_balance(public.get_account_by_code('ACCOUNTS_RECIEVABLE'));
    v_ap := public.get_account_balance(public.get_account_by_code('ACCOUNTS_PAYABLE'));
  ELSE
    SELECT COALESCE(SUM(balance_due), 0) INTO v_ar
    FROM public.invoices
    WHERE store_id = p_store_id
      AND status IN ('issued', 'partial', 'paid', 'overdue')
      AND balance_due > 0;

    SELECT COALESCE(SUM(balance_due), 0) INTO v_ap
    FROM public.erp_purchase_bills
    WHERE store_id = p_store_id
      AND status IN ('finalized', 'partial', 'paid')
      AND balance_due > 0;
  END IF;

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

  RETURN jsonb_build_object(
    'accounts_receivable', ROUND(v_ar, 2),
    'accounts_payable', ROUND(v_ap, 2),
    'net_income_ytd', (v_pl ->> 'total_income')::numeric,
    'cogs_ytd', (v_pl ->> 'total_cogs')::numeric,
    'purchases_ytd', ROUND(v_purchases, 2),
    'expenses_ytd', (v_pl ->> 'total_operating_expenses')::numeric,
    'gross_profit_ytd', (v_pl ->> 'gross_profit')::numeric,
    'net_profit_ytd', (v_pl ->> 'net_profit')::numeric,
    'date_from', v_from,
    'date_to', v_to,
    'store_id', p_store_id,
    'low_stock_count', (
      SELECT COUNT(*) FROM public.inventory i
      WHERE i.stock <= COALESCE(i.reorder_point, 0)
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
    ),
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

GRANT EXECUTE ON FUNCTION public.erp_audit_unbalanced_journals(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_audit_missing_sale_cogs_gl(date, date, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_erp_profit_and_loss(date, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_erp_financial_dashboard(date, date, uuid) TO service_role;

COMMIT;
