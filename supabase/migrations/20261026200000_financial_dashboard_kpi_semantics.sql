-- Financial dashboard KPI semantics: revenue vs net income (profit).
-- Adds revenue_ytd / total_income_ytd; net_income_ytd aligns with P&L net_profit.

BEGIN;

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
  v_revenue numeric;
  v_net_profit numeric;
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

  v_revenue := COALESCE((v_pl ->> 'total_income')::numeric, 0);
  v_net_profit := COALESCE((v_pl ->> 'net_profit')::numeric, 0);

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
    'revenue_ytd', ROUND(v_revenue, 2),
    'total_income_ytd', ROUND(v_revenue, 2),
    'net_income_ytd', ROUND(v_net_profit, 2),
    'cogs_ytd', (v_pl ->> 'total_cogs')::numeric,
    'purchases_ytd', ROUND(v_purchases, 2),
    'expenses_ytd', (v_pl ->> 'total_expenses')::numeric,
    'gross_profit_ytd', (v_pl ->> 'gross_profit')::numeric,
    'net_profit_ytd', ROUND(v_net_profit, 2),
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

COMMIT;
