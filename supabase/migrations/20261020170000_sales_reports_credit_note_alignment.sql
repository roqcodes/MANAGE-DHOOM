-- Sales reports: net credit notes on ex-tax revenue and margin-consistent profit.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_sales_by_customer(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_channel text DEFAULT 'all'
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
        WHERE i.status NOT IN ('cancelled', 'pending', 'draft')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
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
          AND (p_store_id IS NULL OR cn.store_id = p_store_id)
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
  p_channel text DEFAULT 'all'
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
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
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
          AND (p_store_id IS NULL OR cn.store_id = p_store_id)
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
  p_channel text DEFAULT 'all'
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
        WHERE i.status NOT IN ('cancelled', 'pending', 'draft')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
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
        JOIN public.invoices i ON i.id = cn.source_invoice_id
        WHERE cn.status IN ('issued', 'applied')
          AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR cn.store_id = p_store_id)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND i.source = 'erp')
            OR (p_channel = 'online' AND i.source <> 'erp')
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
      LEFT JOIN public.users sp ON sp.id = c.sales_person_id
    ) r
  );
END;
$$;

-- Journal integrity helper (repeatable reconciliation check).

CREATE OR REPLACE FUNCTION public.erp_audit_unbalanced_journals(
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
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
  ) x;
$$;

GRANT EXECUTE ON FUNCTION public.erp_audit_unbalanced_journals(integer) TO authenticated;

COMMIT;
