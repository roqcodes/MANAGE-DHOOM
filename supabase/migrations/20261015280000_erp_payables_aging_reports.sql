-- Payables: vendor aging (fix purchase_date), summary counts, details, drill-down.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_purchase_bill_days_past_due(
  p_as_of date,
  p_due_date date,
  p_purchase_date date,
  p_created_at timestamptz
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.erp_invoice_days_past_due(
    p_as_of,
    p_due_date,
    COALESCE(p_created_at, p_purchase_date::timestamptz)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_balance_report(
  p_store_id uuid DEFAULT NULL,
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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.vendor_name), '[]'::jsonb)
    FROM (
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        v.phone,
        ROUND(COALESCE(v.opening_balance, 0), 2) AS opening_balance,
        ROUND(COALESCE(bill.bill_amount, 0), 2) AS bill_amount,
        ROUND(COALESCE(cred.vendor_credit, 0), 2) AS vendor_credit,
        ROUND(COALESCE(bill.payment_made, 0), 2) AS payment_made,
        ROUND(
          COALESCE(v.opening_balance, 0)
          + COALESCE(bill.bill_amount, 0)
          - COALESCE(cred.vendor_credit, 0)
          - COALESCE(bill.payment_made, 0),
          2
        ) AS balance,
        COALESCE(bill.open_bills, 0) AS open_bills,
        ROUND(COALESCE(bill.balance_due, 0), 2) AS balance_due
      FROM public.vendors v
      LEFT JOIN LATERAL (
        SELECT
          SUM(pb.total_amount) AS bill_amount,
          SUM(pb.amount_paid) AS payment_made,
          SUM(pb.balance_due) AS balance_due,
          COUNT(pb.id) FILTER (WHERE ABS(COALESCE(pb.balance_due, 0)) > 0.001) AS open_bills
        FROM public.erp_purchase_bills pb
        WHERE pb.vendor_id = v.id
          AND pb.status IN ('finalized', 'partial', 'paid')
          AND (p_store_id IS NULL OR pb.store_id = p_store_id)
      ) bill ON true
      LEFT JOIN LATERAL (
        SELECT SUM(vc.total_amount) AS vendor_credit
        FROM public.erp_vendor_credits vc
        WHERE vc.vendor_id = v.id
          AND vc.status IN ('issued', 'applied')
          AND (p_store_id IS NULL OR vc.store_id = p_store_id)
      ) cred ON true
      WHERE v.is_active IS DISTINCT FROM false
        AND (
          v_search IS NULL
          OR v.name ILIKE '%' || v_search || '%'
          OR v.phone ILIKE '%' || v_search || '%'
          OR v.email ILIKE '%' || v_search || '%'
        )
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_aging(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.vendor_name), '[]'::jsonb)
    FROM (
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        ROUND(COALESCE(v.opening_balance, 0), 2) AS opening_balance_due,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) = 0
        ), 0), 2) AS bucket_current,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) BETWEEN 1 AND 15
        ), 0), 2) AS bucket_1_15,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) BETWEEN 16 AND 30
        ), 0), 2) AS bucket_16_30,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) BETWEEN 31 AND 45
        ), 0), 2) AS bucket_31_45,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE b.id IS NOT NULL
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) > 45
        ), 0), 2) AS bucket_over_45,
        ROUND(COALESCE(pay.unallocated, 0), 2) AS available_credit,
        ROUND(COALESCE(SUM(GREATEST(0, b.amount_paid + b.credits_applied - b.total_amount)), 0), 2) AS bill_over_paid,
        ROUND(COALESCE(v.opening_balance, 0) + COALESCE(SUM(b.balance_due), 0), 2) AS total_due
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
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_aging_summary_counts(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.vendor_name), '[]'::jsonb)
    FROM (
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) = 0
        ) AS bucket_current,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) BETWEEN 1 AND 15
        ) AS bucket_1_15,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) BETWEEN 16 AND 30
        ) AS bucket_16_30,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) BETWEEN 31 AND 45
        ) AS bucket_31_45,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL
            AND ABS(COALESCE(b.balance_due, 0)) > 0.001
            AND public.erp_purchase_bill_days_past_due(
              p_as_of, b.due_date::date, b.purchase_date::date, b.created_at
            ) > 45
        ) AS bucket_over_45,
        COUNT(b.id) FILTER (
          WHERE b.id IS NOT NULL AND ABS(COALESCE(b.balance_due, 0)) > 0.001
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
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_aging_details(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
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
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

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
      AND (p_store_id IS NULL OR b.store_id = p_store_id)
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

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

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
      AND (p_store_id IS NULL OR b.store_id = p_store_id)
  ) r;

  RETURN jsonb_build_object(
    'vendor_id', p_vendor_id,
    'vendor_name', v_vendor_name,
    'as_of', p_as_of,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_purchase_bill_days_past_due(date, date, date, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_balance_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging(date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging_summary_counts(date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging_details(date, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging_summary_vendor_details(uuid, date, uuid) TO authenticated;

COMMIT;
