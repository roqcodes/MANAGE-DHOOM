-- Performance dashboard: single JSON payload for glance analytics (store-scoped).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_performance_dashboard(
  p_date_from date,
  p_date_to date,
  p_store_id uuid,
  p_channel text DEFAULT 'all',
  p_salesman_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(LEAST(COALESCE(p_limit, 8), 25), 1);
  v_days integer := GREATEST(1, (p_date_to - p_date_from + 1));
  v_use_weekly boolean := v_days > 90;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  RETURN (
    WITH
    inv_filter AS (
      SELECT i.*
      FROM public.invoices i
      WHERE i.status IN ('issued', 'partial', 'paid', 'overdue')
        AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
        AND i.store_id = p_store_id
        AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
        AND (
          p_channel = 'all'
          OR (p_channel = 'erp' AND i.source = 'erp')
          OR (p_channel = 'online' AND i.source <> 'erp')
        )
    ),
    line_margin AS (
      SELECT
        i.id AS invoice_id,
        i.user_id,
        i.sales_person_id,
        COALESCE(i.issued_at::date, i.created_at::date) AS invoice_date,
        i.total_amount,
        ii.product_id,
        ii.variant_id,
        ii.product_name,
        ii.quantity,
        mc.net_revenue_ex_tax,
        mc.line_cogs,
        mc.uncosted_revenue,
        mc.recognized_profit
      FROM inv_filter i
      JOIN public.invoice_items ii ON ii.invoice_id = i.id
      CROSS JOIN LATERAL public.erp_invoice_item_margin_components(
        ii.base_price,
        ii.unit_price,
        ii.variant_id,
        ii.product_id,
        i.store_id,
        ii.quantity,
        ii.pending_cost_qty,
        COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount),
        COALESCE(ii.discount_allocated, 0)
      ) mc
    ),
    product_sales AS (
      SELECT
        COALESCE(lm.product_id, pv.product_id) AS product_id,
        MAX(lm.product_name) AS product_name,
        SUM(lm.quantity) AS qty,
        SUM(lm.net_revenue_ex_tax) AS net_sales_ex_tax,
        SUM(lm.recognized_profit) AS profit,
        SUM(lm.line_cogs) AS cogs,
        SUM(lm.uncosted_revenue) AS uncosted_revenue
      FROM line_margin lm
      LEFT JOIN public.product_variants pv ON pv.id = lm.variant_id
      WHERE COALESCE(lm.product_id, pv.product_id) IS NOT NULL
      GROUP BY COALESCE(lm.product_id, pv.product_id)
      HAVING SUM(lm.net_revenue_ex_tax) <> 0 OR SUM(lm.quantity) <> 0
    ),
    invoice_kpi AS (
      SELECT
        COUNT(*) AS invoice_count,
        COALESCE(SUM(i.total_amount), 0) AS sales_incl_tax,
        COALESCE(SUM(m.net_sales_ex_tax), 0) AS net_sales_ex_tax,
        COALESCE(SUM(m.recognized_profit), 0) AS recognized_profit,
        COALESCE(SUM(m.uncosted_revenue), 0) AS uncosted_revenue
      FROM inv_filter i
      LEFT JOIN LATERAL (
        SELECT
          SUM(lm.net_revenue_ex_tax) AS net_sales_ex_tax,
          SUM(lm.recognized_profit) AS recognized_profit,
          SUM(lm.uncosted_revenue) AS uncosted_revenue
        FROM line_margin lm
        WHERE lm.invoice_id = i.id
      ) m ON true
    ),
    credit_kpi AS (
      SELECT
        COALESCE(SUM(cn.total_amount), 0) AS credit_total,
        COALESCE(SUM(cn.subtotal), 0) AS credit_subtotal,
        COALESCE(SUM(public.erp_credit_note_recognized_cogs_total(cn.id, cn.store_id)), 0) AS credit_cogs
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
    ),
    collections_kpi AS (
      SELECT COALESCE(SUM(cp.total_amount), 0) AS collections
      FROM public.erp_customer_payments cp
      WHERE cp.payment_date BETWEEN p_date_from AND p_date_to
        AND cp.store_id = p_store_id
        AND (
          p_salesman_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.erp_payment_allocations pa
            JOIN public.invoices i ON i.id = pa.invoice_id
            WHERE pa.payment_id = cp.id
              AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
          )
        )
    ),
    ar_kpi AS (
      SELECT COALESCE(SUM(i.balance_due), 0) AS ar_outstanding
      FROM public.invoices i
      WHERE i.store_id = p_store_id
        AND i.status IN ('issued', 'partial', 'overdue')
        AND ABS(i.balance_due) > 0.001
        AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
    ),
    ap_kpi AS (
      SELECT COALESCE(SUM(pb.balance_due), 0) AS ap_outstanding
      FROM public.erp_purchase_bills pb
      WHERE pb.store_id = p_store_id
        AND pb.status IN ('finalized', 'partial', 'paid')
        AND ABS(pb.balance_due) > 0.001
    ),
    kpis AS (
      SELECT
        ROUND(GREATEST(0, ik.net_sales_ex_tax - ck.credit_subtotal), 2) AS net_sales_ex_tax,
        ROUND(GREATEST(0, ik.sales_incl_tax - ck.credit_total), 2) AS sales_incl_tax,
        ROUND(
          GREATEST(0, ik.recognized_profit - (ck.credit_subtotal - ck.credit_cogs)),
          2
        ) AS recognized_profit,
        ROUND(
          CASE
            WHEN GREATEST(0, ik.net_sales_ex_tax - ck.credit_subtotal - ik.uncosted_revenue) > 0 THEN
              100.0 * GREATEST(0, ik.recognized_profit - (ck.credit_subtotal - ck.credit_cogs))
              / GREATEST(0, ik.net_sales_ex_tax - ck.credit_subtotal - ik.uncosted_revenue)
            ELSE 0
          END,
          2
        ) AS profit_percent,
        ik.invoice_count,
        ROUND(col.collections, 2) AS collections,
        ROUND(
          CASE
            WHEN GREATEST(0, ik.sales_incl_tax - ck.credit_total) > 0 THEN
              100.0 * col.collections / GREATEST(0, ik.sales_incl_tax - ck.credit_total)
            ELSE 0
          END,
          2
        ) AS collection_rate,
        ROUND(ar.ar_outstanding, 2) AS ar_outstanding,
        ROUND(ap.ap_outstanding, 2) AS ap_outstanding,
        ROUND(ik.uncosted_revenue, 2) AS uncosted_revenue,
        v_days AS period_days
      FROM invoice_kpi ik
      CROSS JOIN credit_kpi ck
      CROSS JOIN collections_kpi col
      CROSS JOIN ar_kpi ar
      CROSS JOIN ap_kpi ap
    ),
    daily_sales AS (
      SELECT
        COALESCE(i.issued_at::date, i.created_at::date) AS bucket_date,
        SUM(i.total_amount) AS sales
      FROM inv_filter i
      GROUP BY 1
    ),
    daily_collections AS (
      SELECT cp.payment_date AS bucket_date, SUM(cp.total_amount) AS collections
      FROM public.erp_customer_payments cp
      WHERE cp.payment_date BETWEEN p_date_from AND p_date_to
        AND cp.store_id = p_store_id
        AND (
          p_salesman_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.erp_payment_allocations pa
            JOIN public.invoices i ON i.id = pa.invoice_id
            WHERE pa.payment_id = cp.id
              AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
          )
        )
      GROUP BY 1
    ),
    trend AS (
      SELECT
        d.bucket_date::text AS bucket,
        ROUND(COALESCE(ds.sales, 0), 2) AS sales,
        ROUND(COALESCE(dc.collections, 0), 2) AS collections
      FROM generate_series(p_date_from, p_date_to, '1 day'::interval) AS d(bucket_date)
      LEFT JOIN daily_sales ds ON ds.bucket_date = d.bucket_date::date
      LEFT JOIN daily_collections dc ON dc.bucket_date = d.bucket_date::date
    ),
    item_rows AS (
      SELECT
        ps.product_id,
        COALESCE(p.name, ps.product_name) AS product_name,
        p.image_url,
        ROUND(ps.qty, 2) AS qty,
        ROUND(ps.net_sales_ex_tax, 2) AS net_sales_ex_tax,
        ROUND(ps.profit, 2) AS profit,
        ROUND(ps.cogs, 2) AS cogs,
        ROUND(ps.uncosted_revenue, 2) AS uncosted_revenue,
        ROUND(ps.qty / v_days, 3) AS qty_per_day,
        ROUND(
          CASE WHEN ps.cogs > 0.001 THEN 100.0 * ps.profit / ps.cogs ELSE NULL END,
          2
        ) AS profit_percent
      FROM product_sales ps
      LEFT JOIN public.products p ON p.id = ps.product_id
    ),
    salesman_invoice AS (
      SELECT
        i.sales_person_id,
        SUM(i.total_amount) AS invoice_total,
        SUM(m.net_sales_ex_tax) AS net_sales_ex_tax
      FROM inv_filter i
      LEFT JOIN LATERAL (
        SELECT SUM(lm.net_revenue_ex_tax) AS net_sales_ex_tax
        FROM line_margin lm
        WHERE lm.invoice_id = i.id
      ) m ON true
      GROUP BY i.sales_person_id
    ),
    salesman_collections AS (
      SELECT
        i.sales_person_id,
        SUM(pa.amount) AS collections
      FROM public.erp_payment_allocations pa
      JOIN public.erp_customer_payments cp ON cp.id = pa.payment_id
      JOIN public.invoices i ON i.id = pa.invoice_id
      WHERE cp.payment_date BETWEEN p_date_from AND p_date_to
        AND cp.store_id = p_store_id
        AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
        AND (
          p_channel = 'all'
          OR (p_channel = 'erp' AND i.source = 'erp')
          OR (p_channel = 'online' AND i.source <> 'erp')
        )
      GROUP BY i.sales_person_id
    ),
    salesman_rows AS (
      SELECT
        COALESCE(si.sales_person_id, sc.sales_person_id) AS salesman_id,
        COALESCE(sp.name, 'Unassigned') AS salesman_name,
        ROUND(COALESCE(si.invoice_total, 0), 2) AS total_sales,
        ROUND(COALESCE(sc.collections, 0), 2) AS collections,
        ROUND(
          CASE
            WHEN COALESCE(si.invoice_total, 0) > 0 THEN
              100.0 * COALESCE(sc.collections, 0) / si.invoice_total
            ELSE 0
          END,
          2
        ) AS collection_rate
      FROM salesman_invoice si
      FULL OUTER JOIN salesman_collections sc
        ON sc.sales_person_id IS NOT DISTINCT FROM si.sales_person_id
      LEFT JOIN public.erp_salesmen sp ON sp.id = COALESCE(si.sales_person_id, sc.sales_person_id)
      WHERE COALESCE(si.invoice_total, 0) <> 0 OR COALESCE(sc.collections, 0) <> 0
    ),
    brand_mix AS (
      SELECT
        b.id AS brand_id,
        b.name AS brand_name,
        COALESCE(b.logo_url, b.image_url) AS image_url,
        SUM(ps.net_sales_ex_tax) AS net_sales_ex_tax
      FROM product_sales ps
      JOIN public.products p ON p.id = ps.product_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      WHERE b.id IS NOT NULL
      GROUP BY b.id, b.name, b.logo_url, b.image_url
      HAVING SUM(ps.net_sales_ex_tax) <> 0
    ),
    category_mix AS (
      SELECT
        c.id AS category_id,
        c.name AS category_name,
        COALESCE(c.thumbnail_url, c.image_url) AS image_url,
        SUM(ps.net_sales_ex_tax) AS net_sales_ex_tax
      FROM product_sales ps
      JOIN public.products p ON p.id = ps.product_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      WHERE c.id IS NOT NULL
      GROUP BY c.id, c.name, c.thumbnail_url, c.image_url
      HAVING SUM(ps.net_sales_ex_tax) <> 0
    ),
    customer_sales AS (
      SELECT
        i.user_id,
        COALESCE(u.name, u.email, 'Customer') AS customer_name,
        SUM(i.total_amount) AS total_sales,
        SUM(m.net_sales_ex_tax) AS net_sales_ex_tax
      FROM inv_filter i
      JOIN public.users u ON u.id = i.user_id
      LEFT JOIN LATERAL (
        SELECT SUM(lm.net_revenue_ex_tax) AS net_sales_ex_tax
        FROM line_margin lm
        WHERE lm.invoice_id = i.id
      ) m ON true
      GROUP BY i.user_id, u.name, u.email
      HAVING SUM(i.total_amount) <> 0
    ),
    customer_ar AS (
      SELECT
        i.user_id,
        COALESCE(u.name, u.email, 'Customer') AS customer_name,
        SUM(i.balance_due) AS balance_due
      FROM public.invoices i
      JOIN public.users u ON u.id = i.user_id
      WHERE i.store_id = p_store_id
        AND i.status IN ('issued', 'partial', 'overdue')
        AND ABS(i.balance_due) > 0.001
        AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
      GROUP BY i.user_id, u.name, u.email
    ),
    customer_pay_speed AS (
      SELECT
        i.user_id,
        COALESCE(u.name, u.email, 'Customer') AS customer_name,
        AVG((lp.last_pay - COALESCE(i.issued_at::date, i.created_at::date))::integer) AS avg_days_to_pay,
        COUNT(*) AS paid_invoice_count
      FROM public.invoices i
      JOIN public.users u ON u.id = i.user_id
      JOIN LATERAL (
        SELECT MAX(cp.payment_date) AS last_pay
        FROM public.erp_payment_allocations pa
        JOIN public.erp_customer_payments cp ON cp.id = pa.payment_id
        WHERE pa.invoice_id = i.id
          AND cp.payment_date BETWEEN p_date_from AND p_date_to
      ) lp ON lp.last_pay IS NOT NULL
      WHERE i.store_id = p_store_id
        AND i.status = 'paid'
        AND ABS(i.balance_due) <= 0.001
        AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
      GROUP BY i.user_id, u.name, u.email
      HAVING COUNT(*) >= 1
    ),
    vendor_purchases AS (
      SELECT
        pb.vendor_id,
        COALESCE(v.name, 'Vendor') AS vendor_name,
        SUM(pb.total_amount) AS purchase_total
      FROM public.erp_purchase_bills pb
      LEFT JOIN public.vendors v ON v.id = pb.vendor_id
      WHERE pb.store_id = p_store_id
        AND pb.status NOT IN ('cancelled', 'draft')
        AND pb.purchase_date BETWEEN p_date_from AND p_date_to
      GROUP BY pb.vendor_id, v.name
      HAVING SUM(pb.total_amount) <> 0
    ),
    vendor_ap AS (
      SELECT
        pb.vendor_id,
        COALESCE(v.name, 'Vendor') AS vendor_name,
        SUM(pb.balance_due) AS balance_due
      FROM public.erp_purchase_bills pb
      LEFT JOIN public.vendors v ON v.id = pb.vendor_id
      WHERE pb.store_id = p_store_id
        AND pb.status IN ('finalized', 'partial', 'paid')
        AND ABS(pb.balance_due) > 0.001
      GROUP BY pb.vendor_id, v.name
    ),
    vendor_pay_speed AS (
      SELECT
        pb.vendor_id,
        COALESCE(v.name, 'Vendor') AS vendor_name,
        AVG((lp.last_pay - pb.purchase_date)::integer) AS avg_days_to_pay,
        COUNT(*) AS paid_bill_count
      FROM public.erp_purchase_bills pb
      LEFT JOIN public.vendors v ON v.id = pb.vendor_id
      JOIN LATERAL (
        SELECT MAX(sp.payment_date) AS last_pay
        FROM public.erp_supplier_payment_allocations spa
        JOIN public.erp_supplier_payments sp ON sp.id = spa.payment_id
        WHERE spa.purchase_bill_id = pb.id
          AND sp.payment_date BETWEEN p_date_from AND p_date_to
      ) lp ON lp.last_pay IS NOT NULL
      WHERE pb.store_id = p_store_id
        AND pb.status IN ('finalized', 'partial', 'paid')
        AND ABS(pb.balance_due) <= 0.001
      GROUP BY pb.vendor_id, v.name
      HAVING COUNT(*) >= 1
    )
    SELECT jsonb_build_object(
      'kpis', (SELECT row_to_json(k) FROM kpis k),
      'sales_trend', COALESCE((SELECT jsonb_agg(row_to_json(t) ORDER BY t.bucket) FROM trend t), '[]'::jsonb),
      'items', jsonb_build_object(
        'top_by_sales', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.net_sales_ex_tax DESC)
          FROM (SELECT * FROM item_rows WHERE net_sales_ex_tax > 0 ORDER BY net_sales_ex_tax DESC LIMIT v_limit) r
        ), '[]'::jsonb),
        'bottom_by_sales', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.net_sales_ex_tax ASC)
          FROM (SELECT * FROM item_rows WHERE net_sales_ex_tax > 0 ORDER BY net_sales_ex_tax ASC LIMIT v_limit) r
        ), '[]'::jsonb),
        'top_by_qty', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.qty DESC)
          FROM (SELECT * FROM item_rows WHERE qty > 0 ORDER BY qty DESC LIMIT v_limit) r
        ), '[]'::jsonb),
        'top_by_profit_percent', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.profit_percent DESC NULLS LAST)
          FROM (
            SELECT * FROM item_rows
            WHERE profit_percent IS NOT NULL AND cogs > 0
            ORDER BY profit_percent DESC
            LIMIT v_limit
          ) r
        ), '[]'::jsonb),
        'bottom_by_profit_percent', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.profit_percent ASC NULLS LAST)
          FROM (
            SELECT * FROM item_rows
            WHERE profit_percent IS NOT NULL AND cogs > 0 AND net_sales_ex_tax > 0
            ORDER BY profit_percent ASC
            LIMIT v_limit
          ) r
        ), '[]'::jsonb)
      ),
      'salesmen', jsonb_build_object(
        'top_by_sales', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.total_sales DESC)
          FROM (SELECT * FROM salesman_rows WHERE total_sales > 0 ORDER BY total_sales DESC LIMIT v_limit) r
        ), '[]'::jsonb),
        'bottom_by_sales', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.total_sales ASC)
          FROM (SELECT * FROM salesman_rows WHERE total_sales > 0 ORDER BY total_sales ASC LIMIT v_limit) r
        ), '[]'::jsonb),
        'top_by_collections', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.collections DESC)
          FROM (SELECT * FROM salesman_rows WHERE collections > 0 ORDER BY collections DESC LIMIT v_limit) r
        ), '[]'::jsonb),
        'bottom_by_collection_rate', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.collection_rate ASC)
          FROM (
            SELECT * FROM salesman_rows
            WHERE total_sales > 0
            ORDER BY collection_rate ASC
            LIMIT v_limit
          ) r
        ), '[]'::jsonb)
      ),
      'brands', jsonb_build_object(
        'mix', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.net_sales_ex_tax DESC)
          FROM (SELECT * FROM brand_mix ORDER BY net_sales_ex_tax DESC LIMIT v_limit + 1) r
        ), '[]'::jsonb),
        'top_by_sales', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.net_sales_ex_tax DESC)
          FROM (SELECT * FROM brand_mix ORDER BY net_sales_ex_tax DESC LIMIT v_limit) r
        ), '[]'::jsonb),
        'bottom_by_sales', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.net_sales_ex_tax ASC)
          FROM (SELECT * FROM brand_mix WHERE net_sales_ex_tax > 0 ORDER BY net_sales_ex_tax ASC LIMIT v_limit) r
        ), '[]'::jsonb)
      ),
      'categories', jsonb_build_object(
        'mix', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.net_sales_ex_tax DESC)
          FROM (SELECT * FROM category_mix ORDER BY net_sales_ex_tax DESC LIMIT v_limit + 1) r
        ), '[]'::jsonb),
        'top_by_sales', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.net_sales_ex_tax DESC)
          FROM (SELECT * FROM category_mix ORDER BY net_sales_ex_tax DESC LIMIT v_limit) r
        ), '[]'::jsonb),
        'bottom_by_sales', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.net_sales_ex_tax ASC)
          FROM (SELECT * FROM category_mix WHERE net_sales_ex_tax > 0 ORDER BY net_sales_ex_tax ASC LIMIT v_limit) r
        ), '[]'::jsonb)
      ),
      'customers', jsonb_build_object(
        'top_by_sales', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.total_sales DESC)
          FROM (SELECT * FROM customer_sales ORDER BY total_sales DESC LIMIT v_limit) r
        ), '[]'::jsonb),
        'bottom_by_sales', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.total_sales ASC)
          FROM (SELECT * FROM customer_sales WHERE total_sales > 0 ORDER BY total_sales ASC LIMIT v_limit) r
        ), '[]'::jsonb),
        'top_by_ar', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.balance_due DESC)
          FROM (SELECT * FROM customer_ar ORDER BY balance_due DESC LIMIT v_limit) r
        ), '[]'::jsonb),
        'fastest_payers', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.avg_days_to_pay ASC)
          FROM (SELECT * FROM customer_pay_speed ORDER BY avg_days_to_pay ASC LIMIT v_limit) r
        ), '[]'::jsonb),
        'slowest_payers', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.avg_days_to_pay DESC)
          FROM (SELECT * FROM customer_pay_speed ORDER BY avg_days_to_pay DESC LIMIT v_limit) r
        ), '[]'::jsonb)
      ),
      'vendors', jsonb_build_object(
        'top_by_purchases', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.purchase_total DESC)
          FROM (SELECT * FROM vendor_purchases ORDER BY purchase_total DESC LIMIT v_limit) r
        ), '[]'::jsonb),
        'bottom_by_purchases', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.purchase_total ASC)
          FROM (SELECT * FROM vendor_purchases WHERE purchase_total > 0 ORDER BY purchase_total ASC LIMIT v_limit) r
        ), '[]'::jsonb),
        'top_by_ap', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.balance_due DESC)
          FROM (SELECT * FROM vendor_ap ORDER BY balance_due DESC LIMIT v_limit) r
        ), '[]'::jsonb),
        'fastest_payers', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.avg_days_to_pay ASC)
          FROM (SELECT * FROM vendor_pay_speed ORDER BY avg_days_to_pay ASC LIMIT v_limit) r
        ), '[]'::jsonb),
        'slowest_payers', COALESCE((
          SELECT jsonb_agg(row_to_json(r) ORDER BY r.avg_days_to_pay DESC)
          FROM (SELECT * FROM vendor_pay_speed ORDER BY avg_days_to_pay DESC LIMIT v_limit) r
        ), '[]'::jsonb)
      ),
      'meta', jsonb_build_object(
        'date_from', p_date_from,
        'date_to', p_date_to,
        'period_days', v_days,
        'weekly_trend', v_use_weekly,
        'limit', v_limit
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_performance_dashboard(
  date, date, uuid, text, uuid, integer
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
