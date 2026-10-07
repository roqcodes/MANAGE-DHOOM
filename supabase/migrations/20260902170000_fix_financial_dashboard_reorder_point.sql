-- Fix finance-summary report: reorder_point lives on inventory, not product_variants.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_financial_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_start date := date_trunc('year', CURRENT_DATE)::date;
  v_ar numeric;
  v_ap numeric;
  v_income numeric;
  v_cogs numeric;
  v_expenses numeric;
  v_daily_sales jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_ar := public.get_account_balance(public.get_account_by_code('ACCOUNTS_RECIEVABLE'));
  v_ap := public.get_account_balance(public.get_account_by_code('ACCOUNTS_PAYABLE'));

  SELECT COALESCE(SUM(total_amount), 0) INTO v_income
  FROM public.invoices
  WHERE status IN ('issued', 'partial', 'paid')
    AND created_at::date >= v_year_start;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_cogs
  FROM public.erp_purchase_bills
  WHERE status IN ('finalized', 'partial', 'paid')
    AND purchase_date >= v_year_start;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_expenses
  FROM public.erp_expenses
  WHERE expense_date >= v_year_start;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_daily_sales
  FROM (
    SELECT created_at::date AS day, SUM(total_amount) AS total
    FROM public.invoices
    WHERE status IN ('issued', 'partial', 'paid')
      AND created_at::date >= (CURRENT_DATE - 30)
    GROUP BY created_at::date
    ORDER BY day
  ) r;

  RETURN jsonb_build_object(
    'accounts_receivable', v_ar,
    'accounts_payable', v_ap,
    'net_income_ytd', v_income,
    'cogs_ytd', v_cogs,
    'expenses_ytd', v_expenses,
    'net_profit_ytd', v_income - v_cogs - v_expenses,
    'low_stock_count', (
      SELECT COUNT(*) FROM public.inventory i
      WHERE i.stock <= COALESCE(i.reorder_point, 0)
    ),
    'daily_sales', v_daily_sales,
    'invoice_status_ytd', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT status, COUNT(*) AS count, SUM(total_amount) AS total
        FROM public.invoices
        WHERE created_at::date >= v_year_start
        GROUP BY status
      ) r
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_financial_dashboard() TO authenticated;

COMMIT;
