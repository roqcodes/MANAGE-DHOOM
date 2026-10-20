-- Sales reports: collections, salesman, enriched customer/item summaries.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_payment_mode_bucket(p_mode text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(p_mode, '')))
    WHEN 'cash' THEN 'cash'
    WHEN 'creditcard' THEN 'card' 
    WHEN 'cheque' THEN 'check'
    WHEN 'banktransfer' THEN 'bank_transfer'
    WHEN 'bankremittance' THEN 'bank_remittance'
    WHEN 'upi' THEN 'bank_transfer'
    ELSE 'other'
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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.report_date), '[]'::jsonb)
    FROM (
      SELECT
        d.day AS report_date,
        COALESCE(inv.invoice_count, 0) AS invoice_count,
        ROUND(COALESCE(inv.net_total, 0), 2) AS net_total,
        ROUND(COALESCE(inv.tax, 0), 2) AS tax,
        ROUND(COALESCE(inv.total_discount, 0), 2) AS total_discount,
        ROUND(COALESCE(pay.cash_payment, 0), 2) AS cash_payment,
        ROUND(COALESCE(pay.card_payment, 0), 2) AS card_payment,
        ROUND(COALESCE(pay.check_payment, 0), 2) AS check_payment,
        ROUND(COALESCE(pay.bank_transfer, 0), 2) AS bank_transfer,
        ROUND(COALESCE(pay.bank_remittance, 0), 2) AS bank_remittance,
        ROUND(COALESCE(pay.total_payment, 0), 2) AS total_payment,
        ROUND(COALESCE(inv.balance, 0), 2) AS balance
      FROM generate_series(p_date_from, p_date_to, '1 day'::interval) AS d(day)
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS invoice_count,
          SUM(i.total_amount) AS net_total,
          SUM(i.gst_amount) AS tax,
          SUM(i.discount) AS total_discount,
          SUM(i.balance_due) AS balance
        FROM public.invoices i
        WHERE i.status NOT IN ('cancelled', 'pending')
          AND i.created_at::date = d.day::date
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
      ) inv ON true
      LEFT JOIN LATERAL (
        SELECT
          SUM(p.total_amount) FILTER (
            WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'cash'
          ) AS cash_payment,
          SUM(p.total_amount) FILTER (
            WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'card'
          ) AS card_payment,
          SUM(p.total_amount) FILTER (
            WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'check'
          ) AS check_payment,
          SUM(p.total_amount) FILTER (
            WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'bank_transfer'
          ) AS bank_transfer,
          SUM(p.total_amount) FILTER (
            WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'bank_remittance'
          ) AS bank_remittance,
          SUM(p.total_amount) AS total_payment
        FROM public.erp_customer_payments p
        WHERE p.payment_date = d.day::date
          AND (p_store_id IS NULL OR p.store_id = p_store_id)
      ) pay ON true
      WHERE COALESCE(inv.invoice_count, 0) > 0
         OR COALESCE(pay.total_payment, 0) > 0
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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.month_start), '[]'::jsonb)
    FROM (
      SELECT
        m.month_start,
        to_char(m.month_start, 'FMMonth YYYY') AS month_label,
        GREATEST(m.month_start, p_date_from) AS period_from,
        LEAST((m.month_start + INTERVAL '1 month' - INTERVAL '1 day')::date, p_date_to) AS period_to,
        (
          LEAST((m.month_start + INTERVAL '1 month' - INTERVAL '1 day')::date, p_date_to)
          - GREATEST(m.month_start, p_date_from)
          + 1
        )::int AS days_in_period,
        COALESCE(inv.invoice_count, 0) AS invoice_count,
        ROUND(COALESCE(inv.net_total, 0), 2) AS net_total,
        ROUND(COALESCE(inv.tax, 0), 2) AS tax,
        ROUND(COALESCE(inv.total_discount, 0), 2) AS total_discount,
        ROUND(COALESCE(pay.cash_payment, 0), 2) AS cash_payment,
        ROUND(COALESCE(pay.card_payment, 0), 2) AS card_payment,
        ROUND(COALESCE(pay.check_payment, 0), 2) AS check_payment,
        ROUND(COALESCE(pay.bank_transfer, 0), 2) AS bank_transfer,
        ROUND(COALESCE(pay.bank_remittance, 0), 2) AS bank_remittance,
        ROUND(COALESCE(pay.total_payment, 0), 2) AS total_payment,
        ROUND(COALESCE(inv.balance, 0), 2) AS balance
      FROM (
        SELECT DISTINCT date_trunc('month', gs::timestamp)::date AS month_start
        FROM generate_series(p_date_from, p_date_to, '1 day'::interval) gs
      ) m
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS invoice_count,
          SUM(i.total_amount) AS net_total,
          SUM(i.gst_amount) AS tax,
          SUM(i.discount) AS total_discount,
          SUM(i.balance_due) AS balance
        FROM public.invoices i
        WHERE i.status NOT IN ('cancelled', 'pending')
          AND i.created_at::date BETWEEN GREATEST(m.month_start, p_date_from)
            AND LEAST((m.month_start + INTERVAL '1 month' - INTERVAL '1 day')::date, p_date_to)
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
      ) inv ON true
      LEFT JOIN LATERAL (
        SELECT
          SUM(p.total_amount) FILTER (
            WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'cash'
          ) AS cash_payment,
          SUM(p.total_amount) FILTER (
            WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'card'
          ) AS card_payment,
          SUM(p.total_amount) FILTER (
            WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'check'
          ) AS check_payment,
          SUM(p.total_amount) FILTER (
            WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'bank_transfer'
          ) AS bank_transfer,
          SUM(p.total_amount) FILTER (
            WHERE public.get_erp_payment_mode_bucket(p.payment_mode) = 'bank_remittance'
          ) AS bank_remittance,
          SUM(p.total_amount) AS total_payment
        FROM public.erp_customer_payments p
        WHERE p.payment_date BETWEEN GREATEST(m.month_start, p_date_from)
          AND LEAST((m.month_start + INTERVAL '1 month' - INTERVAL '1 day')::date, p_date_to)
          AND (p_store_id IS NULL OR p.store_id = p_store_id)
      ) pay ON true
      WHERE COALESCE(inv.invoice_count, 0) > 0
         OR COALESCE(pay.total_payment, 0) > 0
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
          SUM(cost.purchase_cost) AS purchase_cost
        FROM public.invoices i
        LEFT JOIN LATERAL (
          SELECT SUM(ii.base_price * ii.quantity) AS purchase_cost
          FROM public.invoice_items ii
          WHERE ii.invoice_id = i.id
        ) cost ON true
        WHERE i.status NOT IN ('cancelled', 'pending')
          AND i.created_at::date BETWEEN p_date_from AND p_date_to
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
          SUM(cn.total_amount) AS credit_note_total
        FROM public.erp_credit_notes cn
        JOIN public.invoices i ON i.id = cn.source_invoice_id
        WHERE cn.status <> 'cancelled'
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
        ROUND(COALESCE(inv.total_sales, 0), 2) AS total_sales,
        ROUND(COALESCE(inv.total_sales_without_tax, 0), 2) AS total_sales_without_tax,
        COALESCE(cn.credit_note_count, 0) AS credit_note_count,
        ROUND(COALESCE(cn.credit_note_total, 0), 2) AS credit_note_total,
        ROUND(COALESCE(inv.purchase_cost, 0), 2) AS purchase_cost,
        ROUND(
          COALESCE(inv.total_sales_without_tax, 0)
          - COALESCE(inv.purchase_cost, 0)
          - COALESCE(cn.credit_note_total, 0),
          2
        ) AS profit,
        ROUND(
          CASE
            WHEN COALESCE(inv.total_sales_without_tax, 0) > 0 THEN
              100.0 * (
                COALESCE(inv.total_sales_without_tax, 0)
                - COALESCE(inv.purchase_cost, 0)
                - COALESCE(cn.credit_note_total, 0)
              ) / COALESCE(inv.total_sales_without_tax, 0)
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
      SELECT
        u.id AS customer_id,
        u.name AS customer_name,
        i.source AS channel,
        COUNT(DISTINCT i.id) AS invoice_count,
        ROUND(COALESCE(SUM(i.total_amount), 0), 2) AS sales_with_tax,
        ROUND(COALESCE(SUM(i.discount), 0), 2) AS total_discount,
        ROUND(COALESCE(SUM(i.gst_amount), 0), 2) AS tax,
        ROUND(COALESCE(SUM(i.subtotal), 0), 2) AS net_sales_value,
        ROUND(COALESCE(SUM(cost.purchase_cost), 0), 2) AS purchase_cost,
        ROUND(
          COALESCE(SUM(i.subtotal), 0) - COALESCE(SUM(cost.purchase_cost), 0),
          2
        ) AS net_profit,
        ROUND(
          CASE
            WHEN COALESCE(SUM(i.subtotal), 0) > 0 THEN
              100.0 * (
                COALESCE(SUM(i.subtotal), 0) - COALESCE(SUM(cost.purchase_cost), 0)
              ) / COALESCE(SUM(i.subtotal), 0)
            ELSE 0
          END,
          3
        ) AS profit_percent,
        ROUND(COALESCE(SUM(i.balance_due), 0), 2) AS balance_due
      FROM public.invoices i
      JOIN public.users u ON u.id = i.user_id
      LEFT JOIN LATERAL (
        SELECT SUM(ii.base_price * ii.quantity) AS purchase_cost
        FROM public.invoice_items ii
        WHERE ii.invoice_id = i.id
      ) cost ON true
      WHERE i.status NOT IN ('cancelled', 'pending')
        AND i.created_at::date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
        AND (
          p_channel = 'all'
          OR (p_channel = 'erp' AND i.source = 'erp')
          OR (p_channel = 'online' AND i.source <> 'erp')
        )
      GROUP BY u.id, u.name, i.source
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.total_amount DESC), '[]'::jsonb)
    FROM (
      SELECT
        ii.product_name,
        ii.variant_id,
        i.source AS channel,
        ROUND(COALESCE(SUM(ii.quantity), 0), 2) AS total_qty,
        ROUND(COALESCE(SUM(ii.total_amount), 0), 2) AS total_amount,
        ROUND(COALESCE(SUM(ii.gst_amount), 0), 2) AS total_tax,
        ROUND(COALESCE(SUM(ii.base_price * ii.quantity), 0), 2) AS purchase_cost,
        ROUND(
          COALESCE(SUM(ii.total_amount), 0) - COALESCE(SUM(ii.base_price * ii.quantity), 0),
          2
        ) AS profit
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
      WHERE i.status NOT IN ('cancelled', 'pending')
        AND i.created_at::date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
        AND (
          p_channel = 'all'
          OR (p_channel = 'erp' AND i.source = 'erp')
          OR (p_channel = 'online' AND i.source <> 'erp')
        )
      GROUP BY ii.product_name, ii.variant_id, i.source
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_credit_note_report(
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
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_daily_collection_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_monthly_collection_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_salesman(date, date, uuid, text) TO authenticated;

COMMIT;
