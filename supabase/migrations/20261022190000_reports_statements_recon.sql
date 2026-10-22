-- Hub reports P2: store-scoped party openings, statements of account,
-- AR/AP vs GL recon, STOCK GL vs WAC, VAT footer from filtered rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_party_store_openings (
  party_kind text NOT NULL CHECK (party_kind IN ('customer', 'vendor')),
  party_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  opening_balance numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_kind, party_id, store_id)
);

CREATE INDEX IF NOT EXISTS erp_party_store_openings_store_idx
  ON public.erp_party_store_openings (store_id);

ALTER TABLE public.erp_party_store_openings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_party_store_openings_staff ON public.erp_party_store_openings;
CREATE POLICY erp_party_store_openings_staff ON public.erp_party_store_openings
  FOR ALL TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_party_store_openings TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_report_party_store_opening(
  p_kind text,
  p_party_id uuid,
  p_store_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_explicit numeric;
  v_company numeric := 0;
  v_home uuid;
BEGIN
  IF p_store_id IS NULL OR p_party_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT o.opening_balance
  INTO v_explicit
  FROM public.erp_party_store_openings o
  WHERE o.party_kind = p_kind
    AND o.party_id = p_party_id
    AND o.store_id = p_store_id;

  IF FOUND THEN
    RETURN COALESCE(v_explicit, 0);
  END IF;

  IF p_kind = 'customer' THEN
    SELECT COALESCE(u.opening_balance, 0) INTO v_company
    FROM public.users u
    WHERE u.id = p_party_id;

    IF COALESCE(v_company, 0) = 0 THEN
      RETURN 0;
    END IF;

    SELECT x.store_id
    INTO v_home
    FROM (
      SELECT i.store_id, MIN(COALESCE(i.issued_at, i.created_at)) AS first_at
      FROM public.invoices i
      WHERE i.user_id = p_party_id
      GROUP BY i.store_id
      UNION ALL
      SELECT p.store_id, MIN(p.created_at)
      FROM public.erp_customer_payments p
      WHERE p.user_id = p_party_id
      GROUP BY p.store_id
    ) x
    ORDER BY x.first_at NULLS LAST
    LIMIT 1;
  ELSIF p_kind = 'vendor' THEN
    SELECT COALESCE(v.opening_balance, 0) INTO v_company
    FROM public.vendors v
    WHERE v.id = p_party_id;

    IF COALESCE(v_company, 0) = 0 THEN
      RETURN 0;
    END IF;

    SELECT x.store_id
    INTO v_home
    FROM (
      SELECT b.store_id, MIN(b.created_at) AS first_at
      FROM public.erp_purchase_bills b
      WHERE b.vendor_id = p_party_id
      GROUP BY b.store_id
      UNION ALL
      SELECT p.store_id, MIN(p.created_at)
      FROM public.erp_supplier_payments p
      WHERE p.vendor_id = p_party_id
      GROUP BY p.store_id
    ) x
    ORDER BY x.first_at NULLS LAST
    LIMIT 1;
  ELSE
    RETURN 0;
  END IF;

  IF v_home IS NOT DISTINCT FROM p_store_id THEN
    RETURN v_company;
  END IF;

  RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_report_party_store_opening(text, uuid, uuid) TO authenticated;

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
      u.phone,
      u.email,
      ROUND(COALESCE(pay.unallocated_amount, 0), 2) AS unallocated_amount,
      ROUND(public.erp_report_party_store_opening('customer', u.id, p_store_id), 2) AS opening_balance,
      ROUND(
        public.erp_report_party_store_opening('customer', u.id, p_store_id)
        + COALESCE(inv.balance_due, 0)
        - COALESCE(pay.unallocated_amount, 0),
        2
      ) AS total_receivable,
      COALESCE(inv.open_invoices, 0) AS open_invoices
    FROM public.users u
    LEFT JOIN LATERAL (
      SELECT
        SUM(i.balance_due) AS balance_due,
        COUNT(i.id) FILTER (WHERE ABS(COALESCE(i.balance_due, 0)) > 0.001) AS open_invoices
      FROM public.invoices i
      WHERE i.user_id = u.id
        AND i.status IN ('issued', 'partial', 'paid', 'overdue')
        AND i.store_id = p_store_id
        AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
    ) inv ON true
    LEFT JOIN LATERAL (
      SELECT SUM(p.unallocated_amount) AS unallocated_amount
      FROM public.erp_customer_payments p
      WHERE p.user_id = u.id
        AND p.store_id = p_store_id
    ) pay ON true
    WHERE public.erp_report_is_customer_role(u.role)
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.phone ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
      )
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
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
        v.phone,
        ROUND(COALESCE(pay.unallocated_amount, 0), 2) AS unallocated_amount,
        ROUND(public.erp_report_party_store_opening('vendor', v.id, p_store_id), 2) AS opening_balance,
        ROUND(
          public.erp_report_party_store_opening('vendor', v.id, p_store_id)
          + COALESCE(bill.balance_due, 0)
          - COALESCE(pay.unallocated_amount, 0),
          2
        ) AS balance_due,
        COALESCE(bill.open_bills, 0) AS open_bills
      FROM public.vendors v
      LEFT JOIN LATERAL (
        SELECT
          SUM(pb.balance_due) AS balance_due,
          COUNT(pb.id) FILTER (WHERE ABS(COALESCE(pb.balance_due, 0)) > 0.001) AS open_bills
        FROM public.erp_purchase_bills pb
        WHERE pb.vendor_id = v.id
          AND pb.status IN ('finalized', 'partial', 'paid')
          AND pb.store_id = p_store_id
      ) bill ON true
      LEFT JOIN LATERAL (
        SELECT SUM(sp.unallocated_amount) AS unallocated_amount
        FROM public.erp_supplier_payments sp
        WHERE sp.vendor_id = v.id
          AND sp.store_id = p_store_id
      ) pay ON true
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
      ROUND(public.erp_report_party_store_opening('customer', u.id, p_store_id), 2) AS opening_balance_due,
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
          WHEN NOT v_age_filter THEN
            public.erp_report_party_store_opening('customer', u.id, p_store_id)
            + COALESCE(SUM(i.balance_due), 0)
            - COALESCE(pay.unallocated, 0)
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
      AND i.store_id = p_store_id
      AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(p.unallocated_amount), 0) AS unallocated
      FROM public.erp_customer_payments p
      WHERE p.user_id = u.id
        AND p.store_id = p_store_id
    ) pay ON true
    WHERE public.erp_report_is_customer_role(u.role)
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.phone ILIKE '%' || v_search || '%'
      )
    GROUP BY u.id, u.name, pay.unallocated
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
        ROUND(public.erp_report_party_store_opening('vendor', v.id, p_store_id), 2) AS opening_balance_due,
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
            WHEN NOT v_age_filter THEN
              public.erp_report_party_store_opening('vendor', v.id, p_store_id)
              + COALESCE(SUM(b.balance_due), 0)
              - COALESCE(pay.unallocated, 0)
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
        AND b.store_id = p_store_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(p.unallocated_amount), 0) AS unallocated
        FROM public.erp_supplier_payments p
        WHERE p.vendor_id = v.id
          AND p.store_id = p_store_id
      ) pay ON true
      WHERE v.is_active IS DISTINCT FROM false
        AND (
          v_search IS NULL
          OR v.name ILIKE '%' || v_search || '%'
          OR v.phone ILIKE '%' || v_search || '%'
        )
      GROUP BY v.id, v.name, pay.unallocated
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

CREATE OR REPLACE FUNCTION public.get_erp_customer_statement_report(
  p_date_from date,
  p_date_to date,
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
  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  RETURN (
    WITH parties AS (
      SELECT u.id, u.name
      FROM public.users u
      WHERE public.erp_report_is_customer_role(u.role)
        AND (
          v_search IS NULL
          OR u.name ILIKE '%' || v_search || '%'
          OR u.phone ILIKE '%' || v_search || '%'
          OR EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.user_id = u.id AND i.store_id = p_store_id
              AND i.invoice_number::text ILIKE '%' || v_search || '%'
          )
          OR EXISTS (
            SELECT 1 FROM public.erp_customer_payments p
            WHERE p.user_id = u.id AND p.store_id = p_store_id
              AND p.payment_number ILIKE '%' || v_search || '%'
          )
          OR EXISTS (
            SELECT 1 FROM public.erp_credit_notes cn
            WHERE cn.user_id = u.id AND cn.store_id = p_store_id
              AND cn.credit_note_number::text ILIKE '%' || v_search || '%'
          )
        )
    )
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.customer_name, r.sort_ts, r.sort_key), '[]'::jsonb)
    FROM (
      SELECT
        x.customer_id,
        x.customer_name,
        x.txn_date,
        x.document_type,
        x.document_number,
        x.details,
        ROUND(x.debit, 2) AS debit,
        ROUND(x.credit, 2) AS credit,
        ROUND(
          SUM(x.debit - x.credit) OVER (
            PARTITION BY x.customer_id
            ORDER BY x.sort_ts, x.sort_key
            ROWS UNBOUNDED PRECEDING
          ),
          2
        ) AS running_balance,
        x.sort_ts,
        x.sort_key
      FROM (
        SELECT
          u.id AS customer_id,
          u.name AS customer_name,
          p_date_from AS txn_date,
          'Opening Balance'::text AS document_type,
          ''::text AS document_number,
          'Balance brought forward'::text AS details,
          GREATEST(0, open.amount) AS debit,
          GREATEST(0, -open.amount) AS credit,
          (p_date_from::timestamp - interval '1 second') AS sort_ts,
          0 AS sort_key
        FROM parties u
        CROSS JOIN LATERAL (
          SELECT
            public.erp_report_party_store_opening('customer', u.id, p_store_id)
            + COALESCE((
                SELECT SUM(i.total_amount)
                FROM public.invoices i
                WHERE i.user_id = u.id
                  AND i.store_id = p_store_id
                  AND i.status IN ('issued', 'partial', 'paid', 'overdue')
                  AND COALESCE(i.issued_at::date, i.created_at::date) < p_date_from
              ), 0)
            - COALESCE((
                SELECT SUM(p.total_amount + COALESCE(p.settlement_discount, 0))
                FROM public.erp_customer_payments p
                WHERE p.user_id = u.id
                  AND p.store_id = p_store_id
                  AND p.payment_date < p_date_from
              ), 0)
            - COALESCE((
                SELECT SUM(cn.total_amount)
                FROM public.erp_credit_notes cn
                WHERE cn.user_id = u.id
                  AND cn.store_id = p_store_id
                  AND cn.status IN ('issued', 'applied')
                  AND cn.credit_note_date < p_date_from
              ), 0) AS amount
        ) open

        UNION ALL
        SELECT
          u.id,
          u.name,
          COALESCE(i.issued_at::date, i.created_at::date),
          'Invoice',
          i.invoice_number::text,
          ''::text,
          i.total_amount,
          0,
          COALESCE(i.issued_at, i.created_at),
          1
        FROM public.invoices i
        JOIN parties u ON u.id = i.user_id
        WHERE i.store_id = p_store_id
          AND i.status IN ('issued', 'partial', 'paid', 'overdue')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to

        UNION ALL
        SELECT
          u.id,
          u.name,
          p.payment_date,
          'Payment',
          p.payment_number,
          COALESCE(p.payment_mode, ''),
          0,
          p.total_amount + COALESCE(p.settlement_discount, 0),
          p.created_at,
          2
        FROM public.erp_customer_payments p
        JOIN parties u ON u.id = p.user_id
        WHERE p.store_id = p_store_id
          AND p.payment_date BETWEEN p_date_from AND p_date_to

        UNION ALL
        SELECT
          u.id,
          u.name,
          cn.credit_note_date,
          'Credit Note',
          cn.credit_note_number::text,
          COALESCE(cn.reference, ''),
          0,
          cn.total_amount,
          cn.created_at,
          3
        FROM public.erp_credit_notes cn
        JOIN parties u ON u.id = cn.user_id
        WHERE cn.store_id = p_store_id
          AND cn.status IN ('issued', 'applied')
          AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
      ) x
      WHERE ABS(x.debit) > 0.0001 OR ABS(x.credit) > 0.0001
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_statement_report(
  p_date_from date,
  p_date_to date,
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
  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  RETURN (
    WITH parties AS (
      SELECT v.id, v.name
      FROM public.vendors v
      WHERE v.is_active IS DISTINCT FROM false
        AND (
          v_search IS NULL
          OR v.name ILIKE '%' || v_search || '%'
          OR v.phone ILIKE '%' || v_search || '%'
          OR EXISTS (
            SELECT 1 FROM public.erp_purchase_bills b
            WHERE b.vendor_id = v.id AND b.store_id = p_store_id
              AND b.purchase_bill_number::text ILIKE '%' || v_search || '%'
          )
          OR EXISTS (
            SELECT 1 FROM public.erp_supplier_payments p
            WHERE p.vendor_id = v.id AND p.store_id = p_store_id
              AND p.payment_number ILIKE '%' || v_search || '%'
          )
          OR EXISTS (
            SELECT 1 FROM public.erp_vendor_credits vc
            WHERE vc.vendor_id = v.id AND vc.store_id = p_store_id
              AND vc.credit_number ILIKE '%' || v_search || '%'
          )
        )
    )
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.vendor_name, r.sort_ts, r.sort_key), '[]'::jsonb)
    FROM (
      SELECT
        x.vendor_id,
        x.vendor_name,
        x.txn_date,
        x.document_type,
        x.document_number,
        x.details,
        ROUND(x.debit, 2) AS debit,
        ROUND(x.credit, 2) AS credit,
        ROUND(
          SUM(x.debit - x.credit) OVER (
            PARTITION BY x.vendor_id
            ORDER BY x.sort_ts, x.sort_key
            ROWS UNBOUNDED PRECEDING
          ),
          2
        ) AS running_balance,
        x.sort_ts,
        x.sort_key
      FROM (
        SELECT
          v.id AS vendor_id,
          v.name AS vendor_name,
          p_date_from AS txn_date,
          'Opening Balance'::text AS document_type,
          ''::text AS document_number,
          'Balance brought forward'::text AS details,
          GREATEST(0, open.amount) AS debit,
          GREATEST(0, -open.amount) AS credit,
          (p_date_from::timestamp - interval '1 second') AS sort_ts,
          0 AS sort_key
        FROM parties v
        CROSS JOIN LATERAL (
          SELECT
            public.erp_report_party_store_opening('vendor', v.id, p_store_id)
            + COALESCE((
                SELECT SUM(b.total_amount)
                FROM public.erp_purchase_bills b
                WHERE b.vendor_id = v.id
                  AND b.store_id = p_store_id
                  AND b.status IN ('finalized', 'partial', 'paid')
                  AND b.purchase_date < p_date_from
              ), 0)
            - COALESCE((
                SELECT SUM(p.total_amount + COALESCE(p.settlement_discount, 0))
                FROM public.erp_supplier_payments p
                WHERE p.vendor_id = v.id
                  AND p.store_id = p_store_id
                  AND p.payment_date < p_date_from
              ), 0)
            - COALESCE((
                SELECT SUM(vc.total_amount)
                FROM public.erp_vendor_credits vc
                WHERE vc.vendor_id = v.id
                  AND vc.store_id = p_store_id
                  AND vc.status IN ('issued', 'applied')
                  AND vc.credit_date < p_date_from
              ), 0) AS amount
        ) open

        UNION ALL
        SELECT
          v.id,
          v.name,
          b.purchase_date,
          'Bill',
          b.purchase_bill_number::text,
          COALESCE(b.notes, ''),
          b.total_amount,
          0,
          b.created_at,
          1
        FROM public.erp_purchase_bills b
        JOIN parties v ON v.id = b.vendor_id
        WHERE b.store_id = p_store_id
          AND b.status IN ('finalized', 'partial', 'paid')
          AND b.purchase_date BETWEEN p_date_from AND p_date_to

        UNION ALL
        SELECT
          v.id,
          v.name,
          p.payment_date,
          'Payment',
          p.payment_number,
          COALESCE(p.payment_mode, ''),
          0,
          p.total_amount + COALESCE(p.settlement_discount, 0),
          p.created_at,
          2
        FROM public.erp_supplier_payments p
        JOIN parties v ON v.id = p.vendor_id
        WHERE p.store_id = p_store_id
          AND p.payment_date BETWEEN p_date_from AND p_date_to

        UNION ALL
        SELECT
          v.id,
          v.name,
          vc.credit_date,
          'Vendor Credit',
          vc.credit_number::text,
          COALESCE(vc.reference, ''),
          0,
          vc.total_amount,
          vc.created_at,
          3
        FROM public.erp_vendor_credits vc
        JOIN parties v ON v.id = vc.vendor_id
        WHERE vc.store_id = p_store_id
          AND vc.status IN ('issued', 'applied')
          AND vc.credit_date BETWEEN p_date_from AND p_date_to
      ) x
      WHERE ABS(x.debit) > 0.0001 OR ABS(x.credit) > 0.0001
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_ar_ap_gl_recon_report(
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
  v_ar_gl numeric := 0;
  v_ap_gl numeric := 0;
  v_ar_open numeric := 0;
  v_ap_open numeric := 0;
  v_ar_unalloc numeric := 0;
  v_ap_unalloc numeric := 0;
  v_ar_cn numeric := 0;
  v_ap_vc numeric := 0;
  v_ar_party numeric := 0;
  v_ap_party numeric := 0;
  v_ar_sub numeric;
  v_ap_sub numeric;
  v_ar_gl_shown numeric;
  v_ap_gl_shown numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  v_ar_gl := public.get_erp_account_balance_as_of(
    public.get_account_by_code('ACCOUNTS_RECIEVABLE'), p_as_of, p_store_id
  );
  v_ap_gl := public.get_erp_account_balance_as_of(
    public.get_account_by_code('ACCOUNTS_PAYABLE'), p_as_of, p_store_id
  );

  SELECT COALESCE(SUM(i.balance_due), 0) INTO v_ar_open
  FROM public.invoices i
  WHERE i.store_id = p_store_id
    AND i.status IN ('issued', 'partial', 'paid', 'overdue')
    AND COALESCE(i.issued_at::date, i.created_at::date) <= p_as_of;

  SELECT COALESCE(SUM(p.unallocated_amount), 0) INTO v_ar_unalloc
  FROM public.erp_customer_payments p
  WHERE p.store_id = p_store_id
    AND p.payment_date <= p_as_of;

  SELECT COALESCE(SUM(GREATEST(0, cn.total_amount - COALESCE(app.applied, 0))), 0)
  INTO v_ar_cn
  FROM public.erp_credit_notes cn
  LEFT JOIN LATERAL (
    SELECT SUM(a.amount) AS applied
    FROM public.erp_credit_note_applications a
    WHERE a.credit_note_id = cn.id
  ) app ON true
  WHERE cn.store_id = p_store_id
    AND cn.status IN ('issued', 'applied')
    AND cn.credit_note_date <= p_as_of;

  SELECT COALESCE(SUM(public.erp_report_party_store_opening('customer', u.id, p_store_id)), 0)
  INTO v_ar_party
  FROM public.users u
  WHERE public.erp_report_is_customer_role(u.role);

  SELECT COALESCE(SUM(b.balance_due), 0) INTO v_ap_open
  FROM public.erp_purchase_bills b
  WHERE b.store_id = p_store_id
    AND b.status IN ('finalized', 'partial', 'paid')
    AND b.purchase_date <= p_as_of;

  SELECT COALESCE(SUM(p.unallocated_amount), 0) INTO v_ap_unalloc
  FROM public.erp_supplier_payments p
  WHERE p.store_id = p_store_id
    AND p.payment_date <= p_as_of;

  SELECT COALESCE(SUM(GREATEST(0, vc.total_amount - COALESCE(app.applied, 0))), 0)
  INTO v_ap_vc
  FROM public.erp_vendor_credits vc
  LEFT JOIN LATERAL (
    SELECT SUM(a.amount) AS applied
    FROM public.erp_vendor_credit_applications a
    WHERE a.vendor_credit_id = vc.id
  ) app ON true
  WHERE vc.store_id = p_store_id
    AND vc.status IN ('issued', 'applied')
    AND vc.credit_date <= p_as_of;

  SELECT COALESCE(SUM(public.erp_report_party_store_opening('vendor', v.id, p_store_id)), 0)
  INTO v_ap_party
  FROM public.vendors v
  WHERE v.is_active IS DISTINCT FROM false;

  v_ar_sub := ROUND(v_ar_party + v_ar_open - v_ar_unalloc - v_ar_cn, 2);
  v_ap_sub := ROUND(v_ap_party + v_ap_open - v_ap_unalloc - v_ap_vc, 2);
  v_ar_gl_shown := ROUND(COALESCE(v_ar_gl, 0), 2);
  v_ap_gl_shown := ROUND(-COALESCE(v_ap_gl, 0), 2);

  RETURN jsonb_build_array(
    jsonb_build_object(
      'control', 'Accounts Receivable',
      'as_of', p_as_of,
      'gl_balance', v_ar_gl_shown,
      'party_openings', ROUND(v_ar_party, 2),
      'open_documents', ROUND(v_ar_open, 2),
      'unallocated', ROUND(v_ar_unalloc, 2),
      'unapplied_credits', ROUND(v_ar_cn, 2),
      'subledger', v_ar_sub,
      'variance', ROUND(v_ar_gl_shown - v_ar_sub, 2),
      'in_sync', ABS(v_ar_gl_shown - v_ar_sub) < 0.02
    ),
    jsonb_build_object(
      'control', 'Accounts Payable',
      'as_of', p_as_of,
      'gl_balance', v_ap_gl_shown,
      'party_openings', ROUND(v_ap_party, 2),
      'open_documents', ROUND(v_ap_open, 2),
      'unallocated', ROUND(v_ap_unalloc, 2),
      'unapplied_credits', ROUND(v_ap_vc, 2),
      'subledger', v_ap_sub,
      'variance', ROUND(v_ap_gl_shown - v_ap_sub, 2),
      'in_sync', ABS(v_ap_gl_shown - v_ap_sub) < 0.02
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_stock_gl_wac_recon_report(
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gl numeric := 0;
  v_wac numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  v_gl := public.get_erp_account_balance_as_of(
    public.get_account_by_code('STOCK'), CURRENT_DATE, p_store_id
  );

  SELECT COALESCE(SUM(
    COALESCE(spi.stock, 0) * COALESCE(spi.purchase_price, p.purchase_price, 0)
  ), 0)
  INTO v_wac
  FROM public.store_product_inventory spi
  JOIN public.products p ON p.id = spi.product_id
  WHERE spi.store_id = p_store_id;

  v_gl := ROUND(COALESCE(v_gl, 0), 2);
  v_wac := ROUND(v_wac, 2);

  RETURN jsonb_build_array(
    jsonb_build_object(
      'account_code', 'STOCK',
      'account_name', 'Stock',
      'gl_balance', v_gl,
      'wac_value', v_wac,
      'variance', ROUND(v_gl - v_wac, 2),
      'in_sync', ABS(v_gl - v_wac) < 0.02
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vat_return_summary_report(
  p_date_from date,
  p_date_to date,
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
  v_sales jsonb;
  v_purchases jsonb;
  v_due numeric := 0;
  v_recoverable numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.store_name), '[]'::jsonb)
  INTO v_sales
  FROM (
    SELECT
      s.id AS store_id,
      s.name AS store_name,
      ROUND(COALESCE(inv.taxable_sales, 0), 2) AS standard_rated_sales,
      ROUND(COALESCE(cn.credit_adjustment, 0), 2) AS credit_adjustment,
      ROUND(
        COALESCE(inv.tax_amount, 0) - COALESCE(cn.tax_adjustment, 0),
        2
      ) AS tax_amount
    FROM public.stores s
    LEFT JOIN LATERAL (
      SELECT
        SUM(i.subtotal) AS taxable_sales,
        SUM(i.gst_amount) AS tax_amount
      FROM public.invoices i
      WHERE i.store_id = s.id
        AND i.status IN ('issued', 'partial', 'paid', 'overdue')
        AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
    ) inv ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(cn.subtotal) AS credit_adjustment,
        SUM(cn.tax_amount) AS tax_adjustment
      FROM public.erp_credit_notes cn
      WHERE cn.store_id = s.id
        AND cn.status IN ('issued', 'applied')
        AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
    ) cn ON true
    WHERE s.id = p_store_id
      AND (
        v_search IS NULL
        OR s.name ILIKE '%' || v_search || '%'
      )
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.store_name), '[]'::jsonb)
  INTO v_purchases
  FROM (
    SELECT
      s.id AS store_id,
      s.name AS store_name,
      ROUND(COALESCE(pb.taxable_purchases, 0), 2) AS standard_rated_purchases,
      ROUND(COALESCE(vc.vendor_credit_adjustment, 0), 2) AS vendor_credit_adjustment,
      ROUND(
        COALESCE(pb.tax_amount, 0) - COALESCE(vc.tax_adjustment, 0),
        2
      ) AS tax_amount
    FROM public.stores s
    LEFT JOIN LATERAL (
      SELECT
        SUM(b.subtotal) AS taxable_purchases,
        SUM(b.tax_amount) AS tax_amount
      FROM public.erp_purchase_bills b
      WHERE b.store_id = s.id
        AND b.status IN ('finalized', 'partial', 'paid')
        AND b.purchase_date BETWEEN p_date_from AND p_date_to
    ) pb ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(vc.subtotal) AS vendor_credit_adjustment,
        SUM(vc.tax_amount) AS tax_adjustment
      FROM public.erp_vendor_credits vc
      WHERE vc.store_id = s.id
        AND vc.status IN ('issued', 'applied')
        AND vc.credit_date BETWEEN p_date_from AND p_date_to
    ) vc ON true
    WHERE s.id = p_store_id
      AND (
        v_search IS NULL
        OR s.name ILIKE '%' || v_search || '%'
      )
  ) r;

  SELECT COALESCE(SUM((x->>'tax_amount')::numeric), 0) INTO v_due
  FROM jsonb_array_elements(v_sales) x;
  SELECT COALESCE(SUM((x->>'tax_amount')::numeric), 0) INTO v_recoverable
  FROM jsonb_array_elements(v_purchases) x;

  RETURN jsonb_build_object(
    'sales_by_store', COALESCE(v_sales, '[]'::jsonb),
    'purchases_by_store', COALESCE(v_purchases, '[]'::jsonb),
    'net_vat',
    jsonb_build_object(
      'due_tax', ROUND(v_due, 2),
      'recoverable_tax', ROUND(v_recoverable, 2),
      'net_payable', ROUND(v_due - v_recoverable, 2),
      'net_reclaimable', ROUND(GREATEST(0, v_recoverable - v_due), 2)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vat_return_details_report(
  p_date_from date,
  p_date_to date,
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
  v_output jsonb;
  v_input jsonb;
  v_due numeric := 0;
  v_recoverable numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number), '[]'::jsonb)
  INTO v_output
  FROM (
    SELECT
      u.name AS party_name,
      u.trn AS party_trn,
      COALESCE(i.issued_at::date, i.created_at::date) AS transaction_date,
      i.invoice_number::text AS transaction_number,
      'Invoice'::text AS transaction_type,
      s.name AS store_name,
      ROUND(i.subtotal, 2) AS taxable_amount,
      ROUND(i.gst_amount, 2) AS vat_amount,
      CASE
        WHEN i.subtotal > 0 THEN ROUND(100.0 * i.gst_amount / i.subtotal, 2)
        ELSE NULL
      END AS vat_percentage
    FROM public.invoices i
    JOIN public.users u ON u.id = i.user_id
    LEFT JOIN public.stores s ON s.id = i.store_id
    WHERE i.status IN ('issued', 'partial', 'paid', 'overdue')
      AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
      AND i.store_id = p_store_id
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.trn ILIKE '%' || v_search || '%'
        OR i.invoice_number::text ILIKE '%' || v_search || '%'
        OR s.name ILIKE '%' || v_search || '%'
      )
    UNION ALL
    SELECT
      u.name AS party_name,
      u.trn AS party_trn,
      cn.credit_note_date AS transaction_date,
      cn.credit_note_number::text AS transaction_number,
      'Credit Note'::text AS transaction_type,
      s.name AS store_name,
      ROUND(cn.subtotal, 2) AS taxable_amount,
      ROUND(cn.tax_amount, 2) AS vat_amount,
      CASE
        WHEN cn.subtotal > 0 THEN ROUND(100.0 * cn.tax_amount / cn.subtotal, 2)
        ELSE NULL
      END AS vat_percentage
    FROM public.erp_credit_notes cn
    JOIN public.users u ON u.id = cn.user_id
    LEFT JOIN public.stores s ON s.id = cn.store_id
    WHERE cn.status IN ('issued', 'applied')
      AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
      AND cn.store_id = p_store_id
      AND (
        v_search IS NULL
        OR u.name ILIKE '%' || v_search || '%'
        OR u.trn ILIKE '%' || v_search || '%'
        OR cn.credit_note_number::text ILIKE '%' || v_search || '%'
        OR s.name ILIKE '%' || v_search || '%'
      )
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number), '[]'::jsonb)
  INTO v_input
  FROM (
    SELECT
      v.name AS party_name,
      v.trn AS party_trn,
      b.purchase_date AS transaction_date,
      b.purchase_bill_number::text AS transaction_number,
      'Purchase Bill'::text AS transaction_type,
      s.name AS store_name,
      ROUND(b.subtotal, 2) AS taxable_amount,
      ROUND(b.tax_amount, 2) AS vat_amount,
      CASE
        WHEN b.subtotal > 0 THEN ROUND(100.0 * b.tax_amount / b.subtotal, 2)
        ELSE NULL
      END AS vat_percentage
    FROM public.erp_purchase_bills b
    JOIN public.vendors v ON v.id = b.vendor_id
    LEFT JOIN public.stores s ON s.id = b.store_id
    WHERE b.status IN ('finalized', 'partial', 'paid')
      AND b.purchase_date BETWEEN p_date_from AND p_date_to
      AND b.store_id = p_store_id
      AND (
        v_search IS NULL
        OR v.name ILIKE '%' || v_search || '%'
        OR v.trn ILIKE '%' || v_search || '%'
        OR b.purchase_bill_number::text ILIKE '%' || v_search || '%'
        OR s.name ILIKE '%' || v_search || '%'
      )
    UNION ALL
    SELECT
      v.name AS party_name,
      v.trn AS party_trn,
      vc.credit_date AS transaction_date,
      vc.credit_number::text AS transaction_number,
      'Vendor Credit'::text AS transaction_type,
      s.name AS store_name,
      ROUND(vc.subtotal, 2) AS taxable_amount,
      ROUND(vc.tax_amount, 2) AS vat_amount,
      CASE
        WHEN vc.subtotal > 0 THEN ROUND(100.0 * vc.tax_amount / vc.subtotal, 2)
        ELSE NULL
      END AS vat_percentage
    FROM public.erp_vendor_credits vc
    JOIN public.vendors v ON v.id = vc.vendor_id
    LEFT JOIN public.stores s ON s.id = vc.store_id
    WHERE vc.status IN ('issued', 'applied')
      AND vc.credit_date BETWEEN p_date_from AND p_date_to
      AND vc.store_id = p_store_id
      AND (
        v_search IS NULL
        OR v.name ILIKE '%' || v_search || '%'
        OR v.trn ILIKE '%' || v_search || '%'
        OR vc.credit_number ILIKE '%' || v_search || '%'
        OR s.name ILIKE '%' || v_search || '%'
      )
  ) r;

  SELECT
    COALESCE(SUM(CASE WHEN x->>'transaction_type' = 'Invoice' THEN (x->>'vat_amount')::numeric ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN x->>'transaction_type' = 'Credit Note' THEN (x->>'vat_amount')::numeric ELSE 0 END), 0)
  INTO v_due
  FROM jsonb_array_elements(COALESCE(v_output, '[]'::jsonb)) x;

  SELECT
    COALESCE(SUM(CASE WHEN x->>'transaction_type' = 'Purchase Bill' THEN (x->>'vat_amount')::numeric ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN x->>'transaction_type' = 'Vendor Credit' THEN (x->>'vat_amount')::numeric ELSE 0 END), 0)
  INTO v_recoverable
  FROM jsonb_array_elements(COALESCE(v_input, '[]'::jsonb)) x;

  RETURN jsonb_build_object(
    'output_lines', COALESCE(v_output, '[]'::jsonb),
    'input_lines', COALESCE(v_input, '[]'::jsonb),
    'net_vat',
    jsonb_build_object(
      'due_tax', ROUND(v_due, 2),
      'recoverable_tax', ROUND(v_recoverable, 2),
      'net_payable', ROUND(v_due - v_recoverable, 2),
      'net_reclaimable', ROUND(GREATEST(0, v_recoverable - v_due), 2)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_customer_balance_report(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_balance_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging(date, uuid, text, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging(date, uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_statement_report(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_statement_report(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_ar_ap_gl_recon_report(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_stock_gl_wac_recon_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vat_return_summary_report(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vat_return_details_report(date, date, uuid, text) TO authenticated;

COMMIT;
