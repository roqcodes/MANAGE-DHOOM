-- Re-audit critical fixes: store-strict RPCs, issued invoice statuses,
-- store-scoped day book running balance, transfer paid = completed transfer.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_sales_by_customer(
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
  PERFORM public.require_store_access(p_store_id);

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.sales_with_tax DESC), '[]'::jsonb)
    FROM (
      WITH invoice_stats AS (
        SELECT
          i.user_id AS customer_id,
          i.source AS channel,
          COUNT(DISTINCT i.id) AS invoice_count,
          SUM(i.total_amount) AS sales_with_tax,
          SUM(i.discount) AS total_discount,
          SUM(i.gst_amount) AS tax,
          SUM(i.subtotal) AS net_sales_value,
          SUM(i.balance_due) AS balance_due,
          SUM(m.line_cogs) AS purchase_cost,
          SUM(m.uncosted_revenue) AS uncosted_revenue,
          SUM(m.recognized_profit) AS recognized_profit
        FROM public.invoices i
        LEFT JOIN LATERAL (
          SELECT
            SUM(mc.line_cogs) AS line_cogs,
            SUM(mc.uncosted_revenue) AS uncosted_revenue,
            SUM(mc.recognized_profit) AS recognized_profit
          FROM public.invoice_items ii
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
          WHERE ii.invoice_id = i.id
        ) m ON true
        WHERE i.status IN ('issued', 'partial', 'paid', 'overdue')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
          AND i.store_id = p_store_id
          AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND i.source = 'erp')
            OR (p_channel = 'online' AND i.source <> 'erp')
          )
        GROUP BY i.user_id, i.source
      ),
      credit_stats AS (
        SELECT
          cn.user_id AS customer_id,
          i.source AS channel,
          COUNT(*) AS credit_note_count,
          SUM(cn.subtotal) AS credit_subtotal,
          SUM(cn.tax_amount) AS credit_tax,
          SUM(cn.total_amount) AS credit_with_tax,
          SUM(public.erp_credit_note_recognized_cogs_total(cn.id, cn.store_id)) AS credit_cogs
        FROM public.erp_credit_notes cn
        LEFT JOIN public.invoices i ON i.id = cn.source_invoice_id
        WHERE cn.status IN ('issued', 'applied')
          AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
          AND cn.store_id = p_store_id
          AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND COALESCE(i.source, 'erp') = 'erp')
            OR (p_channel = 'online' AND COALESCE(i.source, 'erp') <> 'erp')
          )
        GROUP BY cn.user_id, i.source
      ),
      combined AS (
        SELECT customer_id, channel FROM invoice_stats
        UNION
        SELECT customer_id, channel FROM credit_stats
      )
      SELECT
        u.id AS customer_id,
        u.name AS customer_name,
        c.channel,
        COALESCE(inv.invoice_count, 0) AS invoice_count,
        ROUND(COALESCE(inv.sales_with_tax, 0) - COALESCE(cr.credit_with_tax, 0), 2) AS sales_with_tax,
        ROUND(COALESCE(inv.total_discount, 0), 2) AS total_discount,
        ROUND(COALESCE(inv.tax, 0) - COALESCE(cr.credit_tax, 0), 2) AS tax,
        ROUND(COALESCE(inv.net_sales_value, 0) - COALESCE(cr.credit_subtotal, 0), 2) AS net_sales_value,
        ROUND(COALESCE(inv.purchase_cost, 0) - COALESCE(cr.credit_cogs, 0), 2) AS purchase_cost,
        ROUND(COALESCE(inv.uncosted_revenue, 0), 2) AS uncosted_revenue,
        ROUND(
          COALESCE(inv.recognized_profit, 0)
          - (COALESCE(cr.credit_subtotal, 0) - COALESCE(cr.credit_cogs, 0)),
          2
        ) AS net_profit,
        ROUND(
          CASE
            WHEN COALESCE(inv.net_sales_value, 0) - COALESCE(cr.credit_subtotal, 0) - COALESCE(inv.uncosted_revenue, 0) > 0 THEN
              100.0 * (
                COALESCE(inv.recognized_profit, 0)
                - (COALESCE(cr.credit_subtotal, 0) - COALESCE(cr.credit_cogs, 0))
              ) / (
                COALESCE(inv.net_sales_value, 0) - COALESCE(cr.credit_subtotal, 0) - COALESCE(inv.uncosted_revenue, 0)
              )
            ELSE 0
          END,
          3
        ) AS profit_percent,
        ROUND(COALESCE(inv.balance_due, 0), 2) AS balance_due
      FROM combined c
      JOIN public.users u ON u.id = c.customer_id
      LEFT JOIN invoice_stats inv
        ON inv.customer_id = c.customer_id AND inv.channel IS NOT DISTINCT FROM c.channel
      LEFT JOIN credit_stats cr
        ON cr.customer_id = c.customer_id AND cr.channel IS NOT DISTINCT FROM c.channel
    ) r
  );
END;
$$;

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
  PERFORM public.require_store_access(p_store_id);

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
        WHERE i.status IN ('issued', 'partial', 'paid', 'overdue')
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

CREATE OR REPLACE FUNCTION public.get_erp_sales_by_salesman(
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
  PERFORM public.require_store_access(p_store_id);

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.total_sales DESC), '[]'::jsonb)
    FROM (
      WITH invoice_stats AS (
        SELECT
          i.sales_person_id,
          COUNT(*) AS invoice_count,
          SUM(i.total_amount) AS total_sales,
          SUM(i.subtotal) AS total_sales_without_tax,
          SUM(m.line_cogs) AS purchase_cost,
          SUM(m.uncosted_revenue) AS uncosted_revenue,
          SUM(m.recognized_profit) AS recognized_profit
        FROM public.invoices i
        LEFT JOIN LATERAL (
          SELECT
            SUM(mc.line_cogs) AS line_cogs,
            SUM(mc.uncosted_revenue) AS uncosted_revenue,
            SUM(mc.recognized_profit) AS recognized_profit
          FROM public.invoice_items ii
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
          WHERE ii.invoice_id = i.id
        ) m ON true
        WHERE i.status IN ('issued', 'partial', 'paid', 'overdue')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
          AND i.store_id = p_store_id
          AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND i.source = 'erp')
            OR (p_channel = 'online' AND i.source <> 'erp')
          )
        GROUP BY i.sales_person_id
      ),
      credit_stats AS (
        SELECT
          i.sales_person_id,
          COUNT(cn.id) AS credit_note_count,
          SUM(cn.subtotal) AS credit_note_subtotal,
          SUM(cn.total_amount) AS credit_note_total,
          SUM(public.erp_credit_note_recognized_cogs_total(cn.id, cn.store_id)) AS credit_note_cogs
        FROM public.erp_credit_notes cn
        LEFT JOIN public.invoices i ON i.id = cn.source_invoice_id
        WHERE cn.status IN ('issued', 'applied')
          AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
          AND cn.store_id = p_store_id
          AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND COALESCE(i.source, 'erp') = 'erp')
            OR (p_channel = 'online' AND COALESCE(i.source, 'erp') <> 'erp')
          )
        GROUP BY i.sales_person_id
      ),
      combined AS (
        SELECT sales_person_id FROM invoice_stats
        UNION
        SELECT sales_person_id FROM credit_stats
      )
      SELECT
        COALESCE(sp.id, '00000000-0000-0000-0000-000000000000'::uuid) AS salesman_id,
        COALESCE(sp.name, 'Unassigned') AS salesman_name,
        COALESCE(inv.invoice_count, 0) AS invoice_count,
        ROUND(COALESCE(inv.total_sales, 0) - COALESCE(cn.credit_note_total, 0), 2) AS total_sales,
        ROUND(COALESCE(inv.total_sales_without_tax, 0) - COALESCE(cn.credit_note_subtotal, 0), 2) AS total_sales_without_tax,
        COALESCE(cn.credit_note_count, 0) AS credit_note_count,
        ROUND(COALESCE(cn.credit_note_total, 0), 2) AS credit_note_total,
        ROUND(COALESCE(inv.purchase_cost, 0) - COALESCE(cn.credit_note_cogs, 0), 2) AS purchase_cost,
        ROUND(COALESCE(inv.uncosted_revenue, 0), 2) AS uncosted_revenue,
        ROUND(
          COALESCE(inv.recognized_profit, 0)
          - (COALESCE(cn.credit_note_subtotal, 0) - COALESCE(cn.credit_note_cogs, 0)),
          2
        ) AS profit,
        ROUND(
          CASE
            WHEN COALESCE(inv.total_sales_without_tax, 0) - COALESCE(cn.credit_note_subtotal, 0) - COALESCE(inv.uncosted_revenue, 0) > 0 THEN
              100.0 * (
                COALESCE(inv.recognized_profit, 0)
                - (COALESCE(cn.credit_note_subtotal, 0) - COALESCE(cn.credit_note_cogs, 0))
              ) / (
                COALESCE(inv.total_sales_without_tax, 0) - COALESCE(cn.credit_note_subtotal, 0) - COALESCE(inv.uncosted_revenue, 0)
              )
            ELSE 0
          END,
          3
        ) AS profit_percent
      FROM combined c
      LEFT JOIN invoice_stats inv ON inv.sales_person_id IS NOT DISTINCT FROM c.sales_person_id
      LEFT JOIN credit_stats cn ON cn.sales_person_id IS NOT DISTINCT FROM c.sales_person_id
      LEFT JOIN public.erp_salesmen sp ON sp.id = c.sales_person_id
      WHERE public.erp_report_matches_salesman(p_salesman_id, c.sales_person_id)
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
  PERFORM public.require_store_access(p_store_id);

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
        WHERE status IN ('issued', 'partial', 'paid', 'overdue')
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
  PERFORM public.require_store_access(p_store_id);

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
        WHERE status IN ('issued', 'partial', 'paid', 'overdue')
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
  PERFORM public.require_store_access(p_store_id);

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

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging_summary_counts(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_age_min integer DEFAULT NULL,
  p_age_max integer DEFAULT NULL,
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
      COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND ABS(COALESCE(i.balance_due, 0)) > 0.001
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) = 0
      ) AS bucket_current,
      COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND ABS(COALESCE(i.balance_due, 0)) > 0.001
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 1 AND 15
      ) AS bucket_1_15,
      COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND ABS(COALESCE(i.balance_due, 0)) > 0.001
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 16 AND 30
      ) AS bucket_16_30,
      COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND ABS(COALESCE(i.balance_due, 0)) > 0.001
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 31 AND 45
      ) AS bucket_31_45,
      COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND ABS(COALESCE(i.balance_due, 0)) > 0.001
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) > 45
      ) AS bucket_over_45,
      COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND ABS(COALESCE(i.balance_due, 0)) > 0.001
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
      ) AS total_invoices
    FROM public.users u
    LEFT JOIN public.invoices i ON i.user_id = u.id
      AND i.status IN ('issued', 'partial', 'paid', 'overdue')
      AND i.store_id = p_store_id
      AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
    WHERE public.erp_report_is_customer_role(u.role)
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.phone ILIKE '%' || v_search || '%'
      )
    GROUP BY u.id, u.name
    HAVING (
      p_age_min IS NULL AND p_age_max IS NULL
      OR COUNT(i.id) FILTER (
        WHERE i.id IS NOT NULL
          AND ABS(COALESCE(i.balance_due, 0)) > 0.001
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
      ) > 0
    )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging_details(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_age_min integer DEFAULT NULL,
  p_age_max integer DEFAULT NULL,
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

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.invoice_date DESC, r.invoice_number), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      COALESCE(i.issued_at::date, i.created_at::date) AS invoice_date,
      i.invoice_number,
      s.name AS store_name,
      'Invoice'::text AS document_type,
      i.status,
      u.name AS customer_name,
      COALESCE(sp.name, 'Unassigned') AS salesman_name,
      public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) AS age_days,
      ROUND(i.total_amount, 2) AS amount,
      ROUND(COALESCE(i.credits_applied, 0), 2) AS applied_credit,
      ROUND(COALESCE(i.balance_due, 0), 2) AS balance_due
    FROM public.invoices i
    JOIN public.users u ON u.id = i.user_id
    LEFT JOIN public.stores s ON s.id = i.store_id
    LEFT JOIN public.erp_salesmen sp ON sp.id = i.sales_person_id
    WHERE public.erp_report_is_customer_role(u.role)
      AND i.status IN ('issued', 'partial', 'paid', 'overdue')
      AND ABS(COALESCE(i.balance_due, 0)) > 0.001
      AND i.store_id = p_store_id
      AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
      AND (
        p_date_from IS NULL
        OR COALESCE(i.issued_at::date, i.created_at::date) >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR COALESCE(i.issued_at::date, i.created_at::date) <= p_date_to
      )
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR i.invoice_number ILIKE '%' || v_search || '%'
      )
      AND public.erp_report_age_in_range(
        public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
        p_age_min,
        p_age_max
      )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging_summary_customer_details(
  p_customer_id uuid,
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_salesman_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT u.name
  INTO v_customer_name
  FROM public.users u
  WHERE u.id = p_customer_id
    AND public.erp_report_is_customer_role(u.role);

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.due_date, r.invoice_number), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      i.invoice_number,
      COALESCE(i.issued_at::date, i.created_at::date) AS invoice_date,
      COALESCE(i.due_date::date, i.created_at::date) AS due_date,
      public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) AS age_days,
      ROUND(i.total_amount, 2) AS invoice_amount,
      ROUND(COALESCE(i.credits_applied, 0), 2) AS credit,
      ROUND(COALESCE(i.balance_due, 0), 2) AS payment_balance
    FROM public.invoices i
    WHERE i.user_id = p_customer_id
      AND i.status IN ('issued', 'partial', 'paid', 'overdue')
      AND ABS(COALESCE(i.balance_due, 0)) > 0.001
      AND i.store_id = p_store_id
      AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
  ) r;

  RETURN jsonb_build_object(
    'customer_id', p_customer_id,
    'customer_name', v_customer_name,
    'as_of', p_as_of,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_aging_summary_counts(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_age_min integer DEFAULT NULL,
  p_age_max integer DEFAULT NULL
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
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_report_age_in_range(
              public.erp_purchase_bill_days_past_due(
                p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
              ),
              p_age_min,
              p_age_max
            )
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) = 0
        ) AS bucket_current,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_report_age_in_range(
              public.erp_purchase_bill_days_past_due(
                p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
              ),
              p_age_min,
              p_age_max
            )
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) BETWEEN 1 AND 15
        ) AS bucket_1_15,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_report_age_in_range(
              public.erp_purchase_bill_days_past_due(
                p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
              ),
              p_age_min,
              p_age_max
            )
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) BETWEEN 16 AND 30
        ) AS bucket_16_30,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_report_age_in_range(
              public.erp_purchase_bill_days_past_due(
                p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
              ),
              p_age_min,
              p_age_max
            )
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) BETWEEN 31 AND 45
        ) AS bucket_31_45,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_report_age_in_range(
              public.erp_purchase_bill_days_past_due(
                p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
              ),
              p_age_min,
              p_age_max
            )
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) > 45
        ) AS bucket_over_45,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_report_age_in_range(
              public.erp_purchase_bill_days_past_due(
                p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
              ),
              p_age_min,
              p_age_max
            )
        ) AS total_bills
      FROM public.vendors v
      LEFT JOIN public.erp_purchase_bills b ON b.vendor_id = v.id
        AND b.status IN ('finalized', 'partial', 'paid')
        AND b.store_id = p_store_id
      WHERE v.is_active IS DISTINCT FROM false
        AND (
          v_search IS NULL
          OR v.name ILIKE '%' || v_search || '%'
          OR v.phone ILIKE '%' || v_search || '%'
        )
      GROUP BY v.id, v.name
      HAVING (
        p_age_min IS NULL AND p_age_max IS NULL
        OR COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_report_age_in_range(
              public.erp_purchase_bill_days_past_due(
                p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
              ),
              p_age_min,
              p_age_max
            )
        ) > 0
      )
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_aging_details(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_age_min integer DEFAULT NULL,
  p_age_max integer DEFAULT NULL
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

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.bill_date DESC, r.purchase_bill_number), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      b.purchase_date::date AS bill_date,
      b.purchase_bill_number,
      s.name AS store_name,
      b.status,
      v.name AS vendor_name,
      public.erp_purchase_bill_days_past_due(
        p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
      ) AS age_days,
      ROUND(b.total_amount, 2) AS amount,
      ROUND(COALESCE(b.credits_applied, 0), 2) AS applied_credit,
      ROUND(COALESCE(b.balance_due, 0), 2) AS balance_due
    FROM public.erp_purchase_bills b
    JOIN public.vendors v ON v.id = b.vendor_id
    LEFT JOIN public.stores s ON s.id = b.store_id
    WHERE v.is_active IS DISTINCT FROM false
      AND b.status IN ('finalized', 'partial', 'paid')
      AND ABS(COALESCE(b.balance_due, 0)) > 0.001
      AND b.store_id = p_store_id
      AND (
        p_date_from IS NULL OR b.purchase_date::date >= p_date_from
      )
      AND (
        p_date_to IS NULL OR b.purchase_date::date <= p_date_to
      )
      AND (
        v_search IS NULL
        OR v.name ILIKE '%' || v_search || '%'
        OR b.purchase_bill_number ILIKE '%' || v_search || '%'
      )
      AND public.erp_report_age_in_range(
        public.erp_purchase_bill_days_past_due(
          p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
        ),
        p_age_min,
        p_age_max
      )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_aging_summary_vendor_details(
  p_vendor_id uuid,
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
  v_vendor_name text;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT v.name
  INTO v_vendor_name
  FROM public.vendors v
  WHERE v.id = p_vendor_id
    AND v.is_active IS DISTINCT FROM false;

  IF v_vendor_name IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.due_date, r.purchase_bill_number), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      b.purchase_bill_number,
      b.purchase_date::date AS bill_date,
      COALESCE(b.due_date::date, b.purchase_date::date) AS due_date,
      public.erp_purchase_bill_days_past_due(
        p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
      ) AS age_days,
      ROUND(b.total_amount, 2) AS bill_amount,
      ROUND(COALESCE(b.credits_applied, 0), 2) AS credit,
      ROUND(COALESCE(b.balance_due, 0), 2) AS payment_balance
    FROM public.erp_purchase_bills b
    WHERE b.vendor_id = p_vendor_id
      AND b.status IN ('finalized', 'partial', 'paid')
      AND ABS(COALESCE(b.balance_due, 0)) > 0.001
      AND b.store_id = p_store_id
  ) r;

  RETURN jsonb_build_object(
    'vendor_id', p_vendor_id,
    'vendor_name', v_vendor_name,
    'as_of', p_as_of,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_item_stock_report(
  p_store_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_stock_level text DEFAULT 'all'
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
  PERFORM public.require_store_access(p_store_id);

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.product_name), '[]'::jsonb)
    FROM (
      SELECT
        spi.product_id,
        COALESCE(p.barcode, p.id::text) AS product_code,
        p.name AS product_name,
        c.name AS category_name,
        b.name AS brand_name,
        s.name AS store_name,
        spi.store_id,
        ROUND(COALESCE(spi.stock, 0), 2) AS stock,
        ROUND(COALESCE(spi.stock, 0), 2) AS available_stock,
        ROUND(COALESCE(inb.incoming_qty, 0), 2) AS incoming_qty,
        ROUND(COALESCE(spi.stock, 0) + COALESCE(inb.incoming_qty, 0), 2) AS expected_stock,
        ROUND(COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(spi.sales_price, p.price, 0), 2) AS sales_price,
        ROUND(COALESCE(spi.stock, 0) * COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS stock_purchase_value,
        ROUND(COALESCE(spi.stock, 0) * COALESCE(spi.sales_price, p.price, 0), 2) AS stock_sales_value,
        CASE
          WHEN COALESCE(spi.stock, 0) <= 0 THEN 'Out of stock'
          WHEN COALESCE(spi.stock, 0) < 5 THEN 'Low stock'
          ELSE 'In stock'
        END AS stock_status
      FROM public.store_product_inventory spi
      JOIN public.products p ON p.id = spi.product_id
      JOIN public.stores s ON s.id = spi.store_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN LATERAL (
        SELECT SUM(GREATEST(0, pending.pending_qty)) AS incoming_qty
        FROM (
          SELECT GREATEST(0, poi.quantity - COALESCE(poi.accepted_qty, 0)) AS pending_qty
          FROM public.purchase_order_items poi
          JOIN public.purchase_orders po ON po.id = poi.po_id
          LEFT JOIN public.product_variants pv ON pv.id = poi.variant_id
          WHERE COALESCE(poi.product_id, pv.product_id) = spi.product_id
            AND po.store_id = spi.store_id
            AND po.status NOT IN ('cancelled', 'closed', 'fully_received')
          UNION ALL
          SELECT GREATEST(0, pbl.quantity - COALESCE(pbl.accepted_qty, 0))
          FROM public.erp_purchase_bill_lines pbl
          JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
          LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
          WHERE COALESCE(pbl.product_id, pv.product_id) = spi.product_id
            AND pb.store_id = spi.store_id
            AND pb.status = 'draft'
            AND pb.legacy_stock_via_bill = false
        ) pending
      ) inb ON true
      WHERE spi.store_id = p_store_id
        AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (
          p_stock_level = 'all'
          OR (p_stock_level = 'in_stock' AND COALESCE(spi.stock, 0) > 0)
          OR (p_stock_level = 'out_of_stock' AND COALESCE(spi.stock, 0) <= 0)
          OR (p_stock_level = 'low_stock' AND COALESCE(spi.stock, 0) > 0 AND COALESCE(spi.stock, 0) < 5)
        )
        AND (
          p_stock_level = 'out_of_stock'
          OR COALESCE(spi.stock, 0) <> 0
          OR COALESCE(inb.incoming_qty, 0) <> 0
        )
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_dead_stock_report(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_days_expired_min integer DEFAULT NULL,
  p_days_expired_max integer DEFAULT NULL,
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

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.days_expired DESC, r.product_name)
    FROM (
      WITH lot_sources AS (
        SELECT
          pb.store_id,
          COALESCE(pbl.product_id, pv.product_id) AS product_id,
          pbl.id AS line_id,
          pbl.product_name,
          pbl.barcode,
          pbl.expiry_date,
          GREATEST(
            0::numeric,
            COALESCE(
              NULLIF(pbl.accepted_qty, 0),
              NULLIF(pbl.received_qty, 0),
              pbl.quantity
            )
          ) AS lot_qty,
          pbl.purchase_price,
          pb.purchase_bill_number AS source_ref,
          'purchase_bill'::text AS source_type
        FROM public.erp_purchase_bill_lines pbl
        JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
        LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
        WHERE pb.inventory_committed = true
          AND pb.status <> 'cancelled'
          AND pbl.expiry_date IS NOT NULL
          AND pbl.expiry_date < p_as_of
          AND COALESCE(pbl.product_id, pv.product_id) IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.erp_purchase_receives pr
            WHERE pr.purchase_bill_id = pb.id
              AND pr.inventory_committed = true
              AND pr.status NOT IN ('cancelled', 'reversed')
          )

        UNION ALL

        SELECT
          pr.store_id,
          COALESCE(pbl.product_id, pv.product_id) AS product_id,
          prl.id AS line_id,
          prl.product_name,
          prl.barcode,
          prl.expiry_date,
          GREATEST(0::numeric, COALESCE(prl.accepted_qty, 0)) AS lot_qty,
          prl.purchase_price,
          pr.receive_number AS source_ref,
          'purchase_receive'::text AS source_type
        FROM public.erp_purchase_receive_lines prl
        JOIN public.erp_purchase_receives pr ON pr.id = prl.purchase_receive_id
        LEFT JOIN public.erp_purchase_bill_lines pbl ON pbl.id = prl.bill_line_id
        LEFT JOIN public.product_variants pv ON pv.id = prl.variant_id
        WHERE pr.inventory_committed = true
          AND pr.status NOT IN ('cancelled', 'reversed')
          AND prl.expiry_date IS NOT NULL
          AND prl.expiry_date < p_as_of
          AND COALESCE(pbl.product_id, pv.product_id) IS NOT NULL
          AND COALESCE(prl.accepted_qty, 0) > 0
      ),
      lots AS (
        SELECT
          ls.*,
          (p_as_of - ls.expiry_date)::integer AS days_expired,
          SUM(ls.lot_qty) OVER (
            PARTITION BY ls.store_id, ls.product_id
            ORDER BY ls.expiry_date, ls.line_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cum_lot_qty,
          COALESCE(
            SUM(ls.lot_qty) OVER (
              PARTITION BY ls.store_id, ls.product_id
              ORDER BY ls.expiry_date, ls.line_id
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0::numeric
          ) AS prev_cum_lot_qty
        FROM lot_sources ls
        WHERE ls.lot_qty > 0
      ),
      allocated AS (
        SELECT
          l.store_id,
          l.product_id,
          l.line_id,
          l.product_name,
          l.barcode,
          l.expiry_date,
          l.days_expired,
          l.purchase_price,
          l.source_ref,
          l.source_type,
          GREATEST(
            0::numeric,
            LEAST(
              l.lot_qty,
              GREATEST(0::numeric, COALESCE(spi.stock, 0)) - l.prev_cum_lot_qty
            )
          ) AS dead_qty
        FROM lots l
        JOIN public.store_product_inventory spi
          ON spi.store_id = l.store_id
         AND spi.product_id = l.product_id
        WHERE COALESCE(spi.stock, 0) > 0
      )
      SELECT
        a.line_id AS id,
        COALESCE(p.barcode, p.id::text) AS product_code,
        COALESCE(p.name, a.product_name) AS product_name,
        c.name AS category_name,
        b.name AS brand_name,
        s.name AS store_name,
        a.store_id,
        a.expiry_date,
        a.days_expired,
        ROUND(a.dead_qty, 2) AS quantity,
        ROUND(COALESCE(a.purchase_price, spi.purchase_price, p.purchase_price, 0), 2) AS purchase_price,
        ROUND(
          a.dead_qty * COALESCE(a.purchase_price, spi.purchase_price, p.purchase_price, 0),
          2
        ) AS stock_purchase_value,
        a.source_ref,
        a.source_type
      FROM allocated a
      JOIN public.products p ON p.id = a.product_id
      JOIN public.stores s ON s.id = a.store_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN public.store_product_inventory spi
        ON spi.store_id = a.store_id
       AND spi.product_id = a.product_id
      WHERE a.dead_qty > 0.0001
        AND a.store_id = p_store_id
        AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (
          p_days_expired_min IS NULL
          OR a.days_expired >= p_days_expired_min
        )
        AND (
          p_days_expired_max IS NULL
          OR a.days_expired <= p_days_expired_max
        )
        AND (
          v_search IS NULL
          OR p.name ILIKE '%' || v_search || '%'
          OR p.barcode ILIKE '%' || v_search || '%'
          OR a.product_name ILIKE '%' || v_search || '%'
          OR a.source_ref ILIKE '%' || v_search || '%'
        )
    ) r
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_stock_transfer_report(
  p_date_from date,
  p_date_to date,
  p_from_store_id uuid DEFAULT NULL,
  p_to_store_id uuid DEFAULT NULL,
  p_status text DEFAULT 'all'
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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.request_date DESC), '[]'::jsonb)
    FROM (
      SELECT
        tr.id,
        tr.request_date,
        tr.request_number,
        COALESCE(u.name, '—') AS requested_by,
        fs.name AS from_store,
        ts.name AS to_store,
        COALESCE(line.requested_qty, 0) AS requested_qty,
        COALESCE(line.approved_qty, 0) AS approved_qty,
        COALESCE(line.received_qty, 0) AS received_qty,
        ROUND(COALESCE(line.requested_value, 0), 2) AS requested_items_price,
        tr.status,
        ROUND(COALESCE(line.requested_value, 0), 2) AS payment_amount,
        ROUND(
          CASE WHEN EXISTS (
              SELECT 1 FROM public.erp_store_transfers st
              WHERE st.request_id = tr.id AND st.status = 'completed'
            )
          THEN COALESCE(line.requested_value, 0) ELSE 0 END,
          2
        ) AS payment_paid,
        ROUND(
          COALESCE(line.requested_value, 0)
          - CASE WHEN EXISTS (
              SELECT 1 FROM public.erp_store_transfers st
              WHERE st.request_id = tr.id AND st.status = 'completed'
            )
          THEN COALESCE(line.requested_value, 0) ELSE 0 END,
          2
        ) AS payment_balance
      FROM public.erp_transfer_requests tr
      JOIN public.stores fs ON fs.id = tr.from_store_id
      JOIN public.stores ts ON ts.id = tr.to_store_id
      LEFT JOIN public.users u ON u.id = tr.created_by
      LEFT JOIN LATERAL (
        SELECT
          SUM(l.quantity) AS requested_qty,
          SUM(CASE WHEN tr.status NOT IN ('rejected', 'cancelled', 'draft') THEN l.quantity ELSE 0 END) AS approved_qty,
          COALESCE((
            SELECT SUM(stl.quantity)
            FROM public.erp_store_transfers st
            JOIN public.erp_store_transfer_lines stl ON stl.transfer_id = st.id
            WHERE st.request_id = tr.id
              AND st.status IN ('completed', 'approved')
          ), 0) AS received_qty,
          SUM(l.quantity * COALESCE(l.transfer_price, 0)) AS requested_value
        FROM public.erp_transfer_request_lines l
        WHERE l.request_id = tr.id
      ) line ON true
      WHERE tr.request_date BETWEEN p_date_from AND p_date_to
        AND (p_from_store_id IS NULL OR tr.from_store_id = p_from_store_id)
        AND (p_to_store_id IS NULL OR tr.to_store_id = p_to_store_id)
        AND (
          p_status = 'all'
          OR tr.status = p_status
          OR (
            p_status IN ('completed', 'transfer_completed')
            AND EXISTS (
              SELECT 1 FROM public.erp_store_transfers st
              WHERE st.request_id = tr.id AND st.status = 'completed'
            )
          )
          OR (p_status = 'pending' AND tr.status = 'submitted')
        )
    ) r
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
  PERFORM public.require_store_access(p_store_id);

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number, r.id), '[]'::jsonb)
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
        ROUND(
          public.get_erp_account_balance_as_of(t.account_id, p_date_from - 1, p_store_id)
          + SUM(t.debit_amount - t.credit_amount) OVER (
            PARTITION BY t.account_id
            ORDER BY t.transaction_date, t.transaction_number, t.id
            ROWS UNBOUNDED PRECEDING
          ),
          2
        ) AS running_balance
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


GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_customer(date, date, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_item(date, date, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_salesman(date, date, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_daily_collection_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_monthly_collection_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_payments_received_report(date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_summary_counts(date, uuid, text, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_details(date, uuid, date, date, text, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_summary_customer_details(uuid, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging_summary_counts(date, uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging_details(date, uuid, date, date, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging_summary_vendor_details(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_item_stock_report(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_dead_stock_report(date, uuid, uuid, uuid, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_stock_transfer_report(date, date, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_day_book(date, date, uuid) TO authenticated;

COMMIT;
