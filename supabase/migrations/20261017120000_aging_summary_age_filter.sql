-- Aging summary / values: optional filter by days past due (min and/or max).

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_report_age_in_range(
  p_age_days integer,
  p_age_min integer,
  p_age_max integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (p_age_min IS NULL OR p_age_days >= p_age_min)
    AND (p_age_max IS NULL OR p_age_days <= p_age_max);
$$;

DROP FUNCTION IF EXISTS public.get_erp_customer_aging_summary_counts(date, uuid, text);
DROP FUNCTION IF EXISTS public.get_erp_customer_aging(date, uuid, text);
DROP FUNCTION IF EXISTS public.get_erp_vendor_aging_summary_counts(date, uuid, text);
DROP FUNCTION IF EXISTS public.get_erp_vendor_aging(date, uuid, text);

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging_summary_counts(
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
      AND i.status <> 'cancelled'
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
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
          WHEN NOT v_age_filter THEN COALESCE(u.opening_balance, 0) + COALESCE(SUM(i.balance_due), 0)
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
      AND i.status <> 'cancelled'
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
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
        AND (p_store_id IS NULL OR b.store_id = p_store_id)
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

CREATE OR REPLACE FUNCTION public.get_erp_vendor_aging(
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
  v_age_filter boolean := p_age_min IS NOT NULL OR p_age_max IS NOT NULL;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.vendor_name), '[]'::jsonb)
    FROM (
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        ROUND(COALESCE(v.opening_balance, 0), 2) AS opening_balance_due,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
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
        ), 0), 2) AS bucket_current,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
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
        ), 0), 2) AS bucket_1_15,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
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
        ), 0), 2) AS bucket_16_30,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
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
        ), 0), 2) AS bucket_31_45,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
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
        ), 0), 2) AS bucket_over_45,
        ROUND(COALESCE(pay.unallocated, 0), 2) AS available_credit,
        ROUND(COALESCE(SUM(GREATEST(0, b.amount_paid + b.credits_applied - b.total_amount)) FILTER (
          WHERE b.id IS NOT NULL
            AND (
              NOT v_age_filter
              OR public.erp_report_age_in_range(
                public.erp_purchase_bill_days_past_due(
                  p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
                ),
                p_age_min,
                p_age_max
              )
            )
        ), 0), 2) AS bill_over_paid,
        ROUND(
          CASE
            WHEN NOT v_age_filter THEN COALESCE(v.opening_balance, 0) + COALESCE(SUM(b.balance_due), 0) - COALESCE(pay.unallocated, 0)
            ELSE COALESCE(SUM(b.balance_due) FILTER (
              WHERE b.id IS NOT NULL
                AND ABS(COALESCE(b.balance_due, 0)) > 0.001
                AND public.erp_report_age_in_range(
                  public.erp_purchase_bill_days_past_due(
                    p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
                  ),
                  p_age_min,
                  p_age_max
                )
            ), 0)
          END,
          2
        ) AS total_due
      FROM public.vendors v
      LEFT JOIN public.erp_purchase_bills b ON b.vendor_id = v.id
        AND b.status IN ('finalized', 'partial', 'paid')
        AND (p_store_id IS NULL OR b.store_id = p_store_id)
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(p.unallocated_amount), 0) AS unallocated
        FROM public.erp_supplier_payments p
        WHERE p.vendor_id = v.id
          AND (p_store_id IS NULL OR p.store_id = p_store_id)
      ) pay ON true
      WHERE v.is_active IS DISTINCT FROM false
        AND (
          v_search IS NULL
          OR v.name ILIKE '%' || v_search || '%'
          OR v.phone ILIKE '%' || v_search || '%'
        )
      GROUP BY v.id, v.name, v.opening_balance, pay.unallocated
      HAVING (
        NOT v_age_filter
        OR COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_report_age_in_range(
              public.erp_purchase_bill_days_past_due(
                p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
              ),
              p_age_min,
              p_age_max
            )
        ), 0) <> 0
      )
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_report_age_in_range(integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_summary_counts(date, uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging(date, uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging_summary_counts(date, uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging(date, uuid, text, integer, integer) TO authenticated;

COMMIT;
