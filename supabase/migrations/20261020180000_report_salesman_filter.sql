-- Report filters: optional ERP salesman (invoice sales_person_id).

BEGIN;


CREATE OR REPLACE FUNCTION public.erp_report_matches_salesman(
  p_salesman_id uuid,
  p_sales_person_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_salesman_id IS NULL OR p_sales_person_id IS NOT DISTINCT FROM p_salesman_id;
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

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

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
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
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

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging(
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
  v_age_filter boolean := p_age_min IS NOT NULL OR p_age_max IS NOT NULL;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.customer_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      u.id AS customer_id,
      u.name AS customer_name,
      ROUND(COALESCE(u.opening_balance, 0), 2) AS opening_balance_due,
      ROUND(COALESCE(SUM(i.balance_due) FILTER (
        WHERE i.id IS NOT NULL
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) = 0
      ), 0), 2) AS bucket_current,
      ROUND(COALESCE(SUM(i.balance_due) FILTER (
        WHERE i.id IS NOT NULL
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 1 AND 15
      ), 0), 2) AS bucket_1_15,
      ROUND(COALESCE(SUM(i.balance_due) FILTER (
        WHERE i.id IS NOT NULL
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 16 AND 30
      ), 0), 2) AS bucket_16_30,
      ROUND(COALESCE(SUM(i.balance_due) FILTER (
        WHERE i.id IS NOT NULL
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) BETWEEN 31 AND 45
      ), 0), 2) AS bucket_31_45,
      ROUND(COALESCE(SUM(i.balance_due) FILTER (
        WHERE i.id IS NOT NULL
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
          AND public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at) > 45
      ), 0), 2) AS bucket_over_45,
      ROUND(COALESCE(pay.unallocated, 0), 2) AS available_credit,
      ROUND(COALESCE(SUM(GREATEST(0, i.amount_paid + i.credits_applied - i.total_amount)) FILTER (
        WHERE i.id IS NOT NULL
          AND (
            NOT v_age_filter
            OR public.erp_report_age_in_range(
              public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
              p_age_min,
              p_age_max
            )
          )
      ), 0), 2) AS invoice_over_paid,
      ROUND(
        CASE
          WHEN NOT v_age_filter THEN COALESCE(u.opening_balance, 0) + COALESCE(SUM(i.balance_due), 0) - COALESCE(pay.unallocated, 0)
          ELSE COALESCE(SUM(i.balance_due) FILTER (
            WHERE i.id IS NOT NULL
              AND ABS(COALESCE(i.balance_due, 0)) > 0.001
              AND public.erp_report_age_in_range(
                public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
                p_age_min,
                p_age_max
              )
          ), 0)
        END,
        2
      ) AS total_due
    FROM public.users u
    LEFT JOIN public.invoices i ON i.user_id = u.id
      AND i.status IN ('issued', 'partial', 'paid', 'overdue')
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
      AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(p.unallocated_amount), 0) AS unallocated
      FROM public.erp_customer_payments p
      WHERE p.user_id = u.id
        AND (p_store_id IS NULL OR p.store_id = p_store_id)
    ) pay ON true
    WHERE public.erp_report_is_customer_role(u.role)
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.phone ILIKE '%' || v_search || '%'
      )
    GROUP BY u.id, u.name, u.opening_balance, pay.unallocated
    HAVING (
      NOT v_age_filter
      OR COALESCE(SUM(i.balance_due) FILTER (
        WHERE i.id IS NOT NULL
          AND ABS(COALESCE(i.balance_due, 0)) > 0.001
          AND public.erp_report_age_in_range(
            public.erp_invoice_days_past_due(p_as_of, i.due_date::date, i.created_at),
            p_age_min,
            p_age_max
          )
      ), 0) <> 0
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

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

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
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
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

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.customer_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      u.id AS customer_id,
      u.name AS customer_name,
      u.phone,
      u.email,
      ROUND(COALESCE(u.opening_balance, 0) + COALESCE(SUM(i.balance_due), 0), 2) AS total_receivable,
      COUNT(i.id) FILTER (WHERE ABS(COALESCE(i.balance_due, 0)) > 0.001) AS open_invoices
    FROM public.users u
    LEFT JOIN public.invoices i ON i.user_id = u.id
      AND i.status IN ('issued', 'partial', 'paid', 'overdue')
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
      AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
    WHERE public.erp_report_is_customer_role(u.role)
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.phone ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
      )
    GROUP BY u.id, u.name, u.phone, u.email, u.opening_balance
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

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

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
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
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
          AND (p_store_id IS NULL OR cn.store_id = p_store_id)
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
          AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
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
        JOIN public.invoices i ON i.id = cn.source_invoice_id
        WHERE cn.status IN ('issued', 'applied')
          AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR cn.store_id = p_store_id)
          AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
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
      LEFT JOIN public.erp_salesmen sp ON sp.id = c.sales_person_id
      WHERE public.erp_report_matches_salesman(p_salesman_id, c.sales_person_id)
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
        AND cn.status <> 'cancelled'
        AND (p_store_id IS NULL OR cn.store_id = p_store_id)
        AND public.erp_report_matches_salesman(p_salesman_id, inv.sales_person_id)
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
          AND (p_store_id IS NULL OR p.store_id = p_store_id)
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
        'count', COUNT(*)::int
      )
      FROM public.erp_customer_payments p
      WHERE p.payment_date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR p.store_id = p_store_id)
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

CREATE OR REPLACE FUNCTION public.get_erp_deleted_invoices_report(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 200,
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.deleted_at DESC NULLS LAST, r.invoice_created_at DESC)
    FROM (
      SELECT
        i.id AS invoice_id,
        i.created_at AS invoice_created_at,
        i.invoice_number,
        cu.name AS customer_name,
        s.name AS store_name,
        ROUND(i.total_amount, 2) AS total_amount,
        ROUND(COALESCE(i.discount, 0), 2) AS discount,
        ROUND(i.total_amount - COALESCE(i.discount, 0), 2) AS net_amount,
        ROUND(i.gst_amount, 2) AS tax_amount,
        cancel_log.deleted_at,
        COALESCE(cancel_user.name, cancel_user.email, 'Unknown user') AS deleted_by_name,
        COALESCE(cancel_log.reason, cancel_log.description, '—') AS delete_reason,
        COALESCE(create_user.name, create_user.email, sm.name, 'Unknown user') AS created_by_name,
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'product_name', ii.product_name,
            'quantity', ii.quantity,
            'unit_price', ii.unit_price,
            'gst_amount', ii.gst_amount,
            'total_amount', ii.total_amount
          ) ORDER BY ii.product_name), '[]'::jsonb)
          FROM public.invoice_items ii
          WHERE ii.invoice_id = i.id
        ) AS line_items,
        (
          SELECT p.payment_mode
          FROM public.erp_payment_allocations a
          JOIN public.erp_customer_payments p ON p.id = a.payment_id
          WHERE a.invoice_id = i.id
          ORDER BY p.payment_date DESC
          LIMIT 1
        ) AS payment_mode
      FROM public.invoices i
      JOIN public.users cu ON cu.id = i.user_id
      LEFT JOIN public.stores s ON s.id = i.store_id
      LEFT JOIN LATERAL (
        SELECT
          al.created_at AS deleted_at,
          al.description,
          COALESCE(al.metadata->>'reason', al.metadata->>'cancel_reason') AS reason,
          al.user_id
        FROM public.audit_logs al
        WHERE al.entity_type = 'invoice'
          AND al.entity_id = i.id
          AND al.action IN ('cancel', 'delete')
        ORDER BY al.created_at DESC
        LIMIT 1
      ) cancel_log ON true
      LEFT JOIN public.users cancel_user ON cancel_user.id = cancel_log.user_id
      LEFT JOIN LATERAL (
        SELECT al.user_id, al.salesman_id
        FROM public.audit_logs al
        WHERE al.entity_type = 'invoice'
          AND al.entity_id = i.id
          AND al.action = 'create'
        ORDER BY al.created_at ASC
        LIMIT 1
      ) create_log ON true
      LEFT JOIN public.users create_user ON create_user.id = create_log.user_id
      LEFT JOIN public.erp_salesmen sm ON sm.id = COALESCE(create_log.salesman_id, i.sales_person_id)
      WHERE i.status = 'cancelled'
        AND (
          cancel_log.deleted_at IS NULL
          OR cancel_log.deleted_at::date BETWEEN p_date_from AND p_date_to
        )
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
        AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
        AND (
          v_search IS NULL
          OR i.invoice_number::text ILIKE '%' || v_search || '%'
          OR cu.name ILIKE '%' || v_search || '%'
          OR cancel_user.name ILIKE '%' || v_search || '%'
          OR create_user.name ILIKE '%' || v_search || '%'
        )
      ORDER BY cancel_log.deleted_at DESC NULLS LAST, i.created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
    ) r
  ), '[]'::jsonb);
END;
$$;


GRANT EXECUTE ON FUNCTION public.erp_report_matches_salesman(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_summary_counts(date, uuid, text, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging(date, uuid, text, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_details(date, uuid, date, date, text, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_balance_report(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_summary_customer_details(uuid, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_customer(date, date, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_item(date, date, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_salesman(date, date, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_credit_note_report(date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_payments_received_report(date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_deleted_invoices_report(date, date, uuid, text, int, uuid) TO authenticated;

COMMIT;
