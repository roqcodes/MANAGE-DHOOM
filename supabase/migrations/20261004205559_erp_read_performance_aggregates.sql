-- Read-only aggregate RPCs for admin dashboard / sales / inventory lists.
-- Does not change write RPCs, RLS policies, or financial formulas.
-- Store access is enforced via require_store_access + is_staff_user.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_store_ops_snapshot(
  p_store_id uuid,
  p_start_of_day timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_name text;
  v_daily_revenue numeric := 0;
  v_orders_today integer := 0;
  v_pending integer := 0;
  v_processing integer := 0;
  v_shipped integer := 0;
  v_delivered integer := 0;
  v_unfulfilled integer := 0;
  v_delayed integer := 0;
  v_needs_assignment integer := 0;
  v_ready_to_ship integer := 0;
  v_invoices_today integer := 0;
  v_available_units numeric := 0;
  v_out_of_stock integer := 0;
  v_low_stock integer := 0;
  v_margin_today numeric := 0;
  v_demand_today numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT s.name INTO v_store_name
  FROM public.stores s
  WHERE s.id = p_store_id;

  SELECT
    COALESCE(SUM(o.total_amount) FILTER (
      WHERE o.created_at >= p_start_of_day AND o.status IS DISTINCT FROM 'cancelled'
    ), 0),
    COUNT(*) FILTER (
      WHERE o.created_at >= p_start_of_day AND o.status IS DISTINCT FROM 'cancelled'
    ),
    COUNT(*) FILTER (WHERE o.status = 'pending'),
    COUNT(*) FILTER (WHERE o.status = 'processing'),
    COUNT(*) FILTER (WHERE o.status = 'shipped'),
    COUNT(*) FILTER (WHERE o.status = 'delivered'),
    COUNT(*) FILTER (WHERE o.status IN ('pending', 'processing', 'shipped')),
    COUNT(*) FILTER (
      WHERE o.status IN ('pending', 'processing', 'shipped')
        AND o.created_at < p_start_of_day
    ),
    COUNT(*) FILTER (
      WHERE o.fulfillment_status = 'pending_assignment'
        AND o.status IS DISTINCT FROM 'cancelled'
    ),
    COUNT(*) FILTER (
      WHERE o.fulfillment_status IN ('reserved', 'multi_shipment', 'partially_shipped')
        AND o.status IS DISTINCT FROM 'cancelled'
    )
  INTO
    v_daily_revenue,
    v_orders_today,
    v_pending,
    v_processing,
    v_shipped,
    v_delivered,
    v_unfulfilled,
    v_delayed,
    v_needs_assignment,
    v_ready_to_ship
  FROM public.orders o
  WHERE o.store_id = p_store_id;

  SELECT COUNT(*)
  INTO v_invoices_today
  FROM public.invoices i
  WHERE i.store_id = p_store_id
    AND i.created_at >= p_start_of_day
    AND i.status IN ('issued', 'partial', 'paid');

  SELECT
    COALESCE(SUM(GREATEST(0, FLOOR(COALESCE(spi.stock, 0)))), 0),
    COUNT(*) FILTER (WHERE GREATEST(0, FLOOR(COALESCE(spi.stock, 0))) < 1),
    COUNT(*) FILTER (
      WHERE GREATEST(0, FLOOR(COALESCE(spi.stock, 0))) >= 1
        AND GREATEST(0, FLOOR(COALESCE(spi.stock, 0))) < 10
    )
  INTO v_available_units, v_out_of_stock, v_low_stock
  FROM public.store_product_inventory spi
  WHERE spi.store_id = p_store_id;

  SELECT
    COALESCE(SUM(oi.margin_amount), 0),
    COALESCE(SUM(GREATEST(0, FLOOR(COALESCE(oi.quantity, 0)))), 0)
  INTO v_margin_today, v_demand_today
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.store_id = p_store_id
    AND o.created_at >= p_start_of_day
    AND o.status IS DISTINCT FROM 'cancelled';

  RETURN jsonb_build_object(
    'store_name', COALESCE(v_store_name, 'Store'),
    'daily_revenue', ROUND(v_daily_revenue, 2),
    'orders_today', v_orders_today,
    'pending', v_pending,
    'processing', v_processing,
    'shipped', v_shipped,
    'delivered', v_delivered,
    'unfulfilled', v_unfulfilled,
    'delayed', v_delayed,
    'needs_assignment', v_needs_assignment,
    'ready_to_ship', v_ready_to_ship,
    'invoices_today', COALESCE(v_invoices_today, 0),
    'available_units', v_available_units,
    'out_of_stock', v_out_of_stock,
    'low_stock', v_low_stock,
    'margin_today', ROUND(v_margin_today, 2),
    'demand_today', v_demand_today
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_store_finance_snapshot(
  p_store_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ar numeric := 0;
  v_ap numeric := 0;
  v_invoice_status jsonb := '[]'::jsonb;
  v_daily_sales jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT COALESCE(SUM(i.balance_due), 0)
  INTO v_ar
  FROM public.invoices i
  WHERE i.store_id = p_store_id
    AND i.status IN ('issued', 'partial', 'paid', 'overdue')
    AND i.balance_due > 0;

  SELECT COALESCE(SUM(b.balance_due), 0)
  INTO v_ap
  FROM public.erp_purchase_bills b
  WHERE b.store_id = p_store_id
    AND b.status IN ('finalized', 'partial', 'paid')
    AND b.balance_due > 0;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'status', s.status,
        'count', s.cnt,
        'total', s.total
      )
    ),
    '[]'::jsonb
  )
  INTO v_invoice_status
  FROM (
    SELECT
      i.status,
      COUNT(*)::int AS cnt,
      COALESCE(SUM(i.total_amount), 0) AS total
    FROM public.invoices i
    WHERE i.store_id = p_store_id
      AND i.created_at >= (p_date_from::timestamp)
      AND i.created_at <= ((p_date_to::timestamp) + interval '1 day' - interval '1 second')
    GROUP BY i.status
  ) s;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('day', d.day, 'total', d.total)
      ORDER BY d.day
    ),
    '[]'::jsonb
  )
  INTO v_daily_sales
  FROM (
    SELECT
      i.created_at::date::text AS day,
      COALESCE(SUM(i.total_amount), 0) AS total
    FROM public.invoices i
    WHERE i.store_id = p_store_id
      AND i.status IN ('issued', 'partial', 'paid')
      AND i.created_at >= ((CURRENT_DATE - 30)::timestamp)
    GROUP BY i.created_at::date
  ) d;

  SELECT COALESCE(
    jsonb_agg(row_to_json(r)),
    '[]'::jsonb
  )
  INTO v_recent
  FROM (
    SELECT
      i.id,
      i.invoice_number,
      i.user_id,
      i.total_amount,
      i.created_at,
      i.status
    FROM public.invoices i
    WHERE i.store_id = p_store_id
    ORDER BY i.created_at DESC
    LIMIT 8
  ) r;

  RETURN jsonb_build_object(
    'accounts_receivable', ROUND(v_ar, 2),
    'accounts_payable', ROUND(v_ap, 2),
    'invoice_status', v_invoice_status,
    'daily_sales', v_daily_sales,
    'recent_invoices', v_recent
  );
END;
$$;

-- Matches previous JS series: posted journals for the store only (not null store_id).
CREATE OR REPLACE FUNCTION public.get_erp_store_pl_series(
  p_store_id uuid,
  p_date_from date,
  p_date_to date,
  p_granularity text DEFAULT 'month'
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
  PERFORM public.require_store_access(p_store_id);

  IF p_granularity = 'day' THEN
    RETURN COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'period_key', x.period_key,
            'income', x.income,
            'expenses', x.expenses,
            'net_profit', ROUND(x.income - x.expenses, 2)
          )
          ORDER BY x.period_key
        )
        FROM (
          SELECT
            je.transaction_date::text AS period_key,
            ROUND(COALESCE(SUM(
              CASE WHEN t.account_category = 'Income'
                THEN COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)
                ELSE 0
              END
            ), 0), 2) AS income,
            ROUND(COALESCE(SUM(
              CASE WHEN t.account_category = 'Expense'
                THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
                ELSE 0
              END
            ), 0), 2) AS expenses
          FROM public.journal_entries je
          JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
          JOIN public.accounts a ON a.id = jel.account_id
          JOIN public.account_types t ON t.id = a.account_type_id
          WHERE je.status = 'posted'
            AND je.store_id = p_store_id
            AND je.transaction_date BETWEEN p_date_from AND p_date_to
          GROUP BY je.transaction_date
        ) x
      ),
      '[]'::jsonb
    );
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'period_key', x.period_key,
          'income', x.income,
          'expenses', x.expenses,
          'net_profit', ROUND(x.income - x.expenses, 2)
        )
        ORDER BY x.period_key
      )
      FROM (
        SELECT
          to_char(date_trunc('month', je.transaction_date), 'YYYY-MM') AS period_key,
          ROUND(COALESCE(SUM(
            CASE WHEN t.account_category = 'Income'
              THEN COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)
              ELSE 0
            END
          ), 0), 2) AS income,
          ROUND(COALESCE(SUM(
            CASE WHEN t.account_category = 'Expense'
              THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
              ELSE 0
            END
          ), 0), 2) AS expenses
        FROM public.journal_entries je
        JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
        JOIN public.accounts a ON a.id = jel.account_id
        JOIN public.account_types t ON t.id = a.account_type_id
        WHERE je.status = 'posted'
          AND je.store_id = p_store_id
          AND je.transaction_date BETWEEN p_date_from AND p_date_to
        GROUP BY date_trunc('month', je.transaction_date)
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_order_channel_stats(
  p_store_id uuid,
  p_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_pending integer := 0;
  v_processing integer := 0;
  v_shipped integer := 0;
  v_delivered integer := 0;
  v_cancelled integer := 0;
  v_reversals numeric := 0;
  v_items numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  IF p_channel NOT IN ('erp', 'online') THEN
    RAISE EXCEPTION 'Invalid channel';
  END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE o.status = 'pending')::int,
    COUNT(*) FILTER (WHERE o.status = 'processing')::int,
    COUNT(*) FILTER (WHERE o.status = 'shipped')::int,
    COUNT(*) FILTER (WHERE o.status = 'delivered')::int,
    COUNT(*) FILTER (WHERE o.status = 'cancelled')::int,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'cancelled'), 0)
  INTO v_total, v_pending, v_processing, v_shipped, v_delivered, v_cancelled, v_reversals
  FROM public.orders o
  WHERE o.store_id = p_store_id
    AND (
      (p_channel = 'erp' AND o.source = 'sales_order')
      OR (
        p_channel = 'online'
        AND (o.source IS NULL OR o.source IN ('online', 'manual'))
      )
    );

  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO v_items
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.store_id = p_store_id
    AND (
      (p_channel = 'erp' AND o.source = 'sales_order')
      OR (
        p_channel = 'online'
        AND (o.source IS NULL OR o.source IN ('online', 'manual'))
      )
    );

  RETURN jsonb_build_object(
    'total_orders', v_total,
    'pending_count', v_pending,
    'processing_count', v_processing,
    'shipped_count', v_shipped,
    'delivered_count', v_delivered,
    'cancelled_count', v_cancelled,
    'items_ordered', v_items,
    'orders_fulfilled', v_delivered + v_shipped,
    'sales_reversals', ROUND(v_reversals, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_inventory_catalog_stats(
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_critical integer := 0;
  v_low integer := 0;
  v_healthy integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (
      WHERE GREATEST(0, FLOOR(COALESCE(inv.stock, 0) - COALESCE(inv.reserved_stock, 0))) < 1
    )::int,
    COUNT(*) FILTER (
      WHERE GREATEST(0, FLOOR(COALESCE(inv.stock, 0) - COALESCE(inv.reserved_stock, 0))) >= 1
        AND GREATEST(0, FLOOR(COALESCE(inv.stock, 0) - COALESCE(inv.reserved_stock, 0)))
          < GREATEST(0, FLOOR(COALESCE(inv.reorder_point, 10)))
    )::int,
    COUNT(*) FILTER (
      WHERE GREATEST(0, FLOOR(COALESCE(inv.stock, 0) - COALESCE(inv.reserved_stock, 0)))
        >= GREATEST(0, FLOOR(COALESCE(inv.reorder_point, 10)))
        AND GREATEST(0, FLOOR(COALESCE(inv.stock, 0) - COALESCE(inv.reserved_stock, 0))) >= 1
    )::int
  INTO v_total, v_critical, v_low, v_healthy
  FROM public.inventory inv
  WHERE (
    p_store_id IS NOT NULL AND inv.store_id = p_store_id
  ) OR (
    p_store_id IS NULL
    AND (
      public.is_admin_user()
      OR public.rls_user_can_access_store(inv.store_id)
    )
  );

  RETURN jsonb_build_object(
    'total_skus', v_total,
    'critical_skus', v_critical,
    'low_stock_skus', v_low,
    'healthy_skus', v_healthy
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_store_ops_snapshot(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_store_finance_snapshot(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_erp_store_pl_series(uuid, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_order_channel_stats(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inventory_catalog_stats(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_store_ops_snapshot(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_store_finance_snapshot(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_store_pl_series(uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_order_channel_stats(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_catalog_stats(uuid) TO authenticated;

COMMIT;
