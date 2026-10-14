-- Payments received & payables reports (Winner-style columns, aging buckets, summaries).

BEGIN;

DROP FUNCTION IF EXISTS public.get_erp_payments_received_report(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_erp_payments_received_report(
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
    ), '{}'::jsonb)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_erp_vendor_balance_report(uuid);

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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.balance DESC, r.vendor_name), '[]'::jsonb)
    FROM (
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
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
          COUNT(pb.id) FILTER (WHERE pb.balance_due > 0) AS open_bills
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
        AND ABS(
          COALESCE(v.opening_balance, 0)
          + COALESCE(bill.bill_amount, 0)
          - COALESCE(cred.vendor_credit, 0)
          - COALESCE(bill.payment_made, 0)
        ) > 0.001
    ) r
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_erp_vendor_aging(date, uuid);

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
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE public.erp_invoice_days_past_due(p_as_of, b.due_date, b.bill_date::timestamptz) = 0
        ), 0), 2) AS bucket_current,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE public.erp_invoice_days_past_due(p_as_of, b.due_date, b.bill_date::timestamptz) BETWEEN 1 AND 15
        ), 0), 2) AS bucket_1_15,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE public.erp_invoice_days_past_due(p_as_of, b.due_date, b.bill_date::timestamptz) BETWEEN 16 AND 30
        ), 0), 2) AS bucket_16_30,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE public.erp_invoice_days_past_due(p_as_of, b.due_date, b.bill_date::timestamptz) BETWEEN 31 AND 45
        ), 0), 2) AS bucket_31_45,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE public.erp_invoice_days_past_due(p_as_of, b.due_date, b.bill_date::timestamptz) > 45
        ), 0), 2) AS bucket_over_45,
        ROUND(COALESCE(SUM(b.balance_due), 0), 2) AS total_due
      FROM public.vendors v
      JOIN public.erp_purchase_bills b ON b.vendor_id = v.id
      WHERE b.balance_due > 0
        AND b.status IN ('finalized', 'partial')
        AND (p_store_id IS NULL OR b.store_id = p_store_id)
        AND (
          v_search IS NULL
          OR v.name ILIKE '%' || v_search || '%'
        )
      GROUP BY v.id, v.name
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_payments_received_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_balance_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging(date, uuid, text) TO authenticated;

COMMIT;
