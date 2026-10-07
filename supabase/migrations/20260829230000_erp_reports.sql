-- ERP Reports: GL, AR/AP, sales, inventory report RPCs.

BEGIN;

-- ─── Trial Balance ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_trial_balance(
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
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      a.id AS account_id,
      a.code AS account_code,
      a.name AS account_name,
      t.account_category,
      t.name AS account_type_name,
      ROUND(COALESCE(a.opening_balance, 0), 2) AS opening_balance,
      ROUND(COALESCE(SUM(jel.debit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND je.transaction_date <= p_as_of
          AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
      ), 0), 2) AS period_debit,
      ROUND(COALESCE(SUM(jel.credit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND je.transaction_date <= p_as_of
          AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
      ), 0), 2) AS period_credit, 4
      ROUND(
        COALESCE(a.opening_balance, 0)
        + COALESCE(SUM(jel.debit_amount) FILTER (
            WHERE je.id IS NOT NULL
              AND je.transaction_date <= p_as_of
              AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
          ), 0)
        - COALESCE(SUM(jel.credit_amount) FILTER (
            WHERE je.id IS NOT NULL
              AND je.transaction_date <= p_as_of
              AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
          ), 0),
        2
      ) AS balance
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted'
    WHERE a.is_active = true
    GROUP BY a.id, a.code, a.name, t.account_category, t.name, a.opening_balance
    HAVING ABS(
      COALESCE(a.opening_balance, 0)
      + COALESCE(SUM(jel.debit_amount) FILTER (WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of), 0)
      - COALESCE(SUM(jel.credit_amount) FILTER (WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of), 0)
    ) > 0.001
       OR COALESCE(SUM(jel.debit_amount) FILTER (WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of), 0) > 0
       OR COALESCE(SUM(jel.credit_amount) FILTER (WHERE je.id IS NOT NULL AND je.transaction_date <= p_as_of), 0) > 0
  ) r;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'store_id', p_store_id,
    'rows', v_result,
    'total_debit', COALESCE((
      SELECT ROUND(SUM((row ->> 'period_debit')::numeric), 2)
      FROM jsonb_array_elements(v_result) row
    ), 0),
    'total_credit', COALESCE((
      SELECT ROUND(SUM((row ->> 'period_credit')::numeric), 2)
      FROM jsonb_array_elements(v_result) row
    ), 0)
  );
END;
$$;

-- ─── General Ledger (single account) ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_general_ledger(
  p_account_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening numeric;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT ROUND(
    COALESCE(a.opening_balance, 0)
    + COALESCE(SUM(jel.debit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND (p_date_from IS NULL OR je.transaction_date < p_date_from)
          AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
      ), 0)
    - COALESCE(SUM(jel.credit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND (p_date_from IS NULL OR je.transaction_date < p_date_from)
          AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
      ), 0),
    2)
  INTO v_opening
  FROM public.accounts a
  LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
  LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted'
  WHERE a.id = p_account_id
  GROUP BY a.id, a.opening_balance;

  WITH ordered AS (
    SELECT
      je.transaction_date,
      je.journal_number,
      je.description AS journal_description,
      jel.description AS line_description,
      jel.debit_amount,
      jel.credit_amount,
      je.source_entity_type,
      je.id AS journal_id
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
      AND je.status = 'posted'
      AND (p_date_from IS NULL OR je.transaction_date >= p_date_from)
      AND je.transaction_date <= p_date_to
      AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
    ORDER BY je.transaction_date, je.journal_number, jel.line_order
  )
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      o.*,
      ROUND(
        v_opening + SUM(o.debit_amount - o.credit_amount) OVER (
          ORDER BY o.transaction_date, o.journal_number
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ),
        2
      ) AS running_balance
    FROM ordered o
  ) r;

  RETURN jsonb_build_object(
    'account_id', p_account_id,
    'date_from', p_date_from,
    'date_to', p_date_to,
    'opening_balance', COALESCE(v_opening, 0),
    'rows', v_result
  );
END;
$$;

-- ─── Profit & Loss ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_profit_and_loss(
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
DECLARE
  v_income jsonb;
  v_expense jsonb;
  v_income_total numeric := 0;
  v_expense_total numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb),
         COALESCE(SUM(r.amount), 0)
  INTO v_income, v_income_total
  FROM (
    SELECT
      a.code AS account_code,
      a.name AS account_name,
      ROUND(
        COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0),
        2
      ) AS amount
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
    WHERE t.account_category = 'Income' AND a.is_active = true
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)) > 0.001
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb),
         COALESCE(SUM(r.amount), 0)
  INTO v_expense, v_expense_total
  FROM (
    SELECT
      a.code AS account_code,
      a.name AS account_name,
      ROUND(
        COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0),
        2
      ) AS amount
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND (p_store_id IS NULL OR je.store_id = p_store_id OR je.store_id IS NULL)
    WHERE t.account_category = 'Expense' AND a.is_active = true
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.001
  ) r;

  RETURN jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'store_id', p_store_id,
    'income', v_income,
    'expenses', v_expense,
    'total_income', ROUND(v_income_total, 2),
    'total_expenses', ROUND(v_expense_total, 2),
    'net_profit', ROUND(v_income_total - v_expense_total, 2)
  );
END;
$$;

-- ─── Customer balance & aging ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_customer_balance_report(
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.balance_due DESC), '[]'::jsonb)
    FROM (
      SELECT
        u.id AS customer_id,
        u.name AS customer_name,
        u.email,
        COALESCE(u.opening_balance, 0) AS opening_balance,
        ROUND(COALESCE(SUM(i.balance_due), 0), 2) AS balance_due,
        COUNT(i.id) FILTER (WHERE i.balance_due > 0) AS open_invoices,
        ROUND(COALESCE(u.opening_balance, 0) + COALESCE(SUM(i.balance_due), 0), 2) AS total_receivable
      FROM public.users u
      LEFT JOIN public.invoices i ON i.user_id = u.id
        AND i.status IN ('issued', 'partial', 'paid', 'overdue')
        AND i.balance_due > 0
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
      WHERE u.role::text = 'customer'
      GROUP BY u.id, u.name, u.email, u.opening_balance
      HAVING COALESCE(u.opening_balance, 0) + COALESCE(SUM(i.balance_due), 0) > 0.001
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_customer_aging(
  p_as_of date DEFAULT CURRENT_DATE,
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.customer_name), '[]'::jsonb)
    FROM (
      SELECT
        u.id AS customer_id,
        u.name AS customer_name,
        ROUND(COALESCE(SUM(i.balance_due) FILTER (
          WHERE GREATEST(0, p_as_of - COALESCE(i.due_date, i.created_at::date)) <= 30
        ), 0), 2) AS bucket_0_30,
        ROUND(COALESCE(SUM(i.balance_due) FILTER (
          WHERE GREATEST(0, p_as_of - COALESCE(i.due_date, i.created_at::date)) BETWEEN 31 AND 60
        ), 0), 2) AS bucket_31_60,
        ROUND(COALESCE(SUM(i.balance_due) FILTER (
          WHERE GREATEST(0, p_as_of - COALESCE(i.due_date, i.created_at::date)) BETWEEN 61 AND 90
        ), 0), 2) AS bucket_61_90,
        ROUND(COALESCE(SUM(i.balance_due) FILTER (
          WHERE GREATEST(0, p_as_of - COALESCE(i.due_date, i.created_at::date)) > 90
        ), 0), 2) AS bucket_90_plus,
        ROUND(COALESCE(SUM(i.balance_due), 0), 2) AS total_due,
        COUNT(i.id) AS invoice_count
      FROM public.users u
      JOIN public.invoices i ON i.user_id = u.id
      WHERE u.role::text = 'customer'
        AND i.balance_due > 0
        AND i.status IN ('issued', 'partial', 'overdue')
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
      GROUP BY u.id, u.name
    ) r
  );
END;
$$;

-- ─── Vendor balance & aging ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_vendor_balance_report(
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.balance_due DESC), '[]'::jsonb)
    FROM (
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        ROUND(COALESCE(SUM(b.balance_due), 0), 2) AS balance_due,
        COUNT(b.id) FILTER (WHERE b.balance_due > 0) AS open_bills
      FROM public.vendors v
      LEFT JOIN public.erp_purchase_bills b ON b.vendor_id = v.id
        AND b.status IN ('finalized', 'partial', 'paid')
        AND b.balance_due > 0
        AND (p_store_id IS NULL OR b.store_id = p_store_id)
      GROUP BY v.id, v.name
      HAVING COALESCE(SUM(b.balance_due), 0) > 0.001
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vendor_aging(
  p_as_of date DEFAULT CURRENT_DATE,
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.vendor_name), '[]'::jsonb)
    FROM (
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE GREATEST(0, p_as_of - COALESCE(b.due_date, b.bill_date)) <= 30
        ), 0), 2) AS bucket_0_30,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE GREATEST(0, p_as_of - COALESCE(b.due_date, b.bill_date)) BETWEEN 31 AND 60
        ), 0), 2) AS bucket_31_60,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE GREATEST(0, p_as_of - COALESCE(b.due_date, b.bill_date)) BETWEEN 61 AND 90
        ), 0), 2) AS bucket_61_90,
        ROUND(COALESCE(SUM(b.balance_due) FILTER (
          WHERE GREATEST(0, p_as_of - COALESCE(b.due_date, b.bill_date)) > 90
        ), 0), 2) AS bucket_90_plus,
        ROUND(COALESCE(SUM(b.balance_due), 0), 2) AS total_due
      FROM public.vendors v
      JOIN public.erp_purchase_bills b ON b.vendor_id = v.id
      WHERE b.balance_due > 0
        AND b.status IN ('finalized', 'partial')
        AND (p_store_id IS NULL OR b.store_id = p_store_id)
      GROUP BY v.id, v.name
    ) r
  );
END;
$$;

-- ─── Sales reports (channel: erp | online | all) ─────────────────────────────

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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.total_sales DESC), '[]'::jsonb)
    FROM (
      SELECT
        u.id AS customer_id,
        u.name AS customer_name,
        COUNT(i.id) AS invoice_count,
        ROUND(COALESCE(SUM(i.total_amount), 0), 2) AS total_sales,
        ROUND(COALESCE(SUM(i.balance_due), 0), 2) AS balance_due,
        i.source AS channel
      FROM public.invoices i
      JOIN public.users u ON u.id = i.user_id
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
        ROUND(COALESCE(SUM(ii.quantity), 0), 2) AS total_qty,
        ROUND(COALESCE(SUM(ii.total_amount), 0), 2) AS total_amount,
        ROUND(COALESCE(SUM(ii.gst_amount), 0), 2) AS total_tax,
        i.source AS channel
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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.payment_date DESC), '[]'::jsonb)
    FROM (
      SELECT
        p.id,
        p.payment_number,
        p.payment_date,
        p.payment_mode,
        u.name AS customer_name,
        s.name AS store_name,
        ROUND(p.total_amount, 2) AS total_amount,
        ROUND(p.unallocated_amount, 2) AS unallocated_amount,
        p.is_bulk
      FROM public.erp_customer_payments p
      JOIN public.users u ON u.id = p.user_id
      LEFT JOIN public.stores s ON s.id = p.store_id
      WHERE p.payment_date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR p.store_id = p_store_id)
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
        u.name AS customer_name,
        s.name AS store_name,
        ROUND(cn.total_amount, 2) AS total_amount,
        ROUND(cn.balance_remaining, 2) AS balance_remaining
      FROM public.erp_credit_notes cn
      JOIN public.users u ON u.id = cn.user_id
      LEFT JOIN public.stores s ON s.id = cn.store_id
      WHERE cn.credit_note_date BETWEEN p_date_from AND p_date_to
        AND cn.status <> 'cancelled'
        AND (p_store_id IS NULL OR cn.store_id = p_store_id)
    ) r
  );
END;
$$;

-- ─── Inventory reports ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_item_stock_report(
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.product_name), '[]'::jsonb)
    FROM (
      SELECT
        pv.id AS variant_id,
        p.name AS product_name,
        pv.name AS variant_name,
        pv.barcode,
        s.name AS store_name,
        si.store_id,
        ROUND(COALESCE(si.stock, 0), 2) AS stock,
        ROUND(COALESCE(si.reserved_stock, 0), 2) AS reserved_stock,
        ROUND(COALESCE(si.stock, 0) - COALESCE(si.reserved_stock, 0), 2) AS available_stock,
        ROUND(COALESCE(si.purchase_price, pv.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(si.sales_price, pv.price, 0), 2) AS sales_price
      FROM public.store_inventory si
      JOIN public.product_variants pv ON pv.id = si.variant_id
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.stores s ON s.id = si.store_id
      WHERE (p_store_id IS NULL OR si.store_id = p_store_id)
        AND COALESCE(si.stock, 0) <> 0
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_store_wise_stock_report()
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.store_name), '[]'::jsonb)
    FROM (
      SELECT
        s.id AS store_id,
        s.name AS store_name,
        COUNT(DISTINCT si.variant_id) AS sku_count,
        ROUND(COALESCE(SUM(si.stock), 0), 2) AS total_stock,
        ROUND(COALESCE(SUM(si.reserved_stock), 0), 2) AS total_reserved,
        ROUND(
          COALESCE(SUM(si.stock * COALESCE(si.purchase_price, pv.purchase_price, 0)), 0),
          2
        ) AS stock_value_at_cost
      FROM public.stores s
      LEFT JOIN public.store_inventory si ON si.store_id = s.id
      LEFT JOIN public.product_variants pv ON pv.id = si.variant_id
      GROUP BY s.id, s.name
    ) r
  );
END;
$$;

-- ─── Day book (cash/bank account transactions) ─────────────────────────────────

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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number), '[]'::jsonb)
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
        ROUND(t.running_balance, 2) AS running_balance
      FROM public.erp_account_transactions t
      JOIN public.accounts a ON a.id = t.account_id
      LEFT JOIN public.accounts ca ON ca.id = t.counter_account_id
      LEFT JOIN public.stores s ON s.id = t.store_id
      WHERE t.transaction_date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR t.store_id = p_store_id)
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_trial_balance(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_general_ledger(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_profit_and_loss(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_balance_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_balance_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_vendor_aging(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_customer(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_item(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_payments_received_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_credit_note_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_item_stock_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_store_wise_stock_report() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_day_book(date, date, uuid) TO authenticated;

COMMIT;
