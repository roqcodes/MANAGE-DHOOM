-- Production hardening after module audits vs Zoho/Odoo:
-- store-strict GL, salesman CNs without source invoice, purchases, transfers.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_erp_general_ledger_summary(
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
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      a.id AS account_id,
      a.code AS account_code,
      a.name AS account_name,
      t.account_category,
      t.name AS account_type_name,
      ROUND(COALESCE(SUM(jel.credit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND je.transaction_date BETWEEN p_date_from AND p_date_to
          AND je.store_id = p_store_id
      ), 0), 2) AS period_credit,
      ROUND(COALESCE(SUM(jel.debit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND je.transaction_date BETWEEN p_date_from AND p_date_to
          AND je.store_id = p_store_id
      ), 0), 2) AS period_debit,
      ROUND(
        CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END
        + COALESCE(SUM(jel.debit_amount) FILTER (
            WHERE je.id IS NOT NULL
              AND je.transaction_date <= p_date_to
              AND je.store_id = p_store_id
          ), 0)
        - COALESCE(SUM(jel.credit_amount) FILTER (
            WHERE je.id IS NOT NULL
              AND je.transaction_date <= p_date_to
              AND je.store_id = p_store_id
          ), 0),
        2
      ) AS balance
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted'
    WHERE a.is_active = true
      AND (a.store_id IS NULL OR a.store_id = p_store_id)
    GROUP BY a.id, a.code, a.name, t.account_category, t.name, a.store_id, a.opening_balance
    HAVING ABS(COALESCE(SUM(jel.debit_amount) FILTER (
        WHERE je.id IS NOT NULL AND je.transaction_date BETWEEN p_date_from AND p_date_to AND je.store_id = p_store_id
      ), 0)
      + COALESCE(SUM(jel.credit_amount) FILTER (
        WHERE je.id IS NOT NULL AND je.transaction_date BETWEEN p_date_from AND p_date_to AND je.store_id = p_store_id
      ), 0)) > 0.001
       OR ABS(
         CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END
         + COALESCE(SUM(jel.debit_amount) FILTER (
             WHERE je.id IS NOT NULL AND je.transaction_date <= p_date_to AND je.store_id = p_store_id
           ), 0)
         - COALESCE(SUM(jel.credit_amount) FILTER (
             WHERE je.id IS NOT NULL AND je.transaction_date <= p_date_to AND je.store_id = p_store_id
           ), 0)
       ) > 0.001
  ) r;

  RETURN jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'store_id', p_store_id,
    'rows', v_rows,
    'total_credit', COALESCE((
      SELECT ROUND(SUM((row ->> 'period_credit')::numeric), 2)
      FROM jsonb_array_elements(v_rows) row
    ), 0),
    'total_debit', COALESCE((
      SELECT ROUND(SUM((row ->> 'period_debit')::numeric), 2)
      FROM jsonb_array_elements(v_rows) row
    ), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_account_transaction_report(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_account_type_id uuid DEFAULT NULL
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
    SELECT COALESCE(
      jsonb_agg(row_to_json(r) ORDER BY r.transaction_date, r.transaction_number, r.line_order),
      '[]'::jsonb
    )
    FROM (
      SELECT
        jel.id AS line_id,
        je.transaction_date,
        je.journal_number AS transaction_number,
        COALESCE(st.name, '—') AS store_name,
        a.name AS account_name,
        t.name AS account_type_name,
        COALESCE(NULLIF(TRIM(jel.description), ''), NULLIF(TRIM(je.description), ''), '—') AS transaction_details,
        INITCAP(REPLACE(COALESCE(je.source_entity_type, 'journal'), '_', ' ')) AS transaction_type,
        COALESCE(NULLIF(TRIM(je.description), ''), je.journal_number) AS reference_number,
        ROUND(jel.debit_amount, 2) AS debit_amount,
        ROUND(jel.credit_amount, 2) AS credit_amount,
        jel.line_order
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      JOIN public.accounts a ON a.id = jel.account_id
      JOIN public.account_types t ON t.id = a.account_type_id
      LEFT JOIN public.stores st ON st.id = je.store_id
      WHERE je.status = 'posted'
        AND je.transaction_date BETWEEN p_date_from AND p_date_to
        AND je.store_id = p_store_id
        AND (p_account_id IS NULL OR jel.account_id = p_account_id)
        AND (p_account_type_id IS NULL OR a.account_type_id = p_account_type_id)
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_general_ledger(
  p_account_id uuid,
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
  v_opening numeric;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  SELECT ROUND(
    CASE WHEN a.store_id IS NOT DISTINCT FROM p_store_id THEN COALESCE(a.opening_balance, 0) ELSE 0 END
    + COALESCE(SUM(jel.debit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND (p_date_from IS NULL OR je.transaction_date < p_date_from)
          AND je.store_id = p_store_id
      ), 0)
    - COALESCE(SUM(jel.credit_amount) FILTER (
        WHERE je.id IS NOT NULL
          AND (p_date_from IS NULL OR je.transaction_date < p_date_from)
          AND je.store_id = p_store_id
      ), 0),
    2)
  INTO v_opening
  FROM public.accounts a
  LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
  LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted'
  WHERE a.id = p_account_id
  GROUP BY a.id, a.store_id, a.opening_balance;

  WITH ordered AS (
    SELECT
      je.transaction_date,
      je.journal_number,
      je.description AS journal_description,
      jel.description AS line_description,
      jel.debit_amount,
      jel.credit_amount,
      je.source_entity_type,
      je.id AS journal_id,
      jel.line_order
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
      AND je.status = 'posted'
      AND (p_date_from IS NULL OR je.transaction_date >= p_date_from)
      AND je.transaction_date <= p_date_to
      AND je.store_id = p_store_id
    ORDER BY je.transaction_date, je.journal_number, jel.line_order
  )
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      o.*,
      ROUND(
        v_opening + SUM(o.debit_amount - o.credit_amount) OVER (
          ORDER BY o.transaction_date, o.journal_number, o.line_order
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
        WHERE i.status NOT IN ('cancelled', 'pending', 'draft')
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

CREATE OR REPLACE FUNCTION public.get_erp_purchase_by_item_report(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.item_name), '[]'::jsonb)
    FROM (
      SELECT
        p.id AS product_id,
        p.name AS item_name,
        COALESCE(c.name, '—') AS category_name,
        COALESCE(b.name, 'General Item Brand') AS brand_name,
        ROUND(COALESCE(pu.purchase_qty, 0), 2) AS purchase_qty,
        ROUND(COALESCE(tr.transfer_qty, 0), 2) AS transfer_qty,
        ROUND(COALESCE(pu.purchase_qty, 0) + COALESCE(tr.transfer_qty, 0), 2) AS total_qty,
        ROUND(COALESCE(pu.purchase_value, 0), 2) AS purchase_value,
        ROUND(COALESCE(tr.transfer_value, 0), 2) AS transfer_value,
        ROUND(COALESCE(pu.purchase_value, 0) + COALESCE(tr.transfer_value, 0), 2) AS total_value,
        ROUND(
          CASE
            WHEN COALESCE(pu.purchase_qty, 0) > 0 THEN pu.purchase_value / pu.purchase_qty
            ELSE 0
          END,
          2
        ) AS avg_purchase_cost
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN LATERAL (
        SELECT
          SUM(pbl.quantity) AS purchase_qty,
          SUM(pbl.line_total + COALESCE(pbl.landed_cost_allocated, 0)) AS purchase_value
        FROM public.erp_purchase_bill_lines pbl
        JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
        LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
        WHERE COALESCE(pbl.product_id, pv.product_id) = p.id
          AND pb.purchase_date BETWEEN p_date_from AND p_date_to
          AND pb.status IN ('finalized', 'partial', 'paid')
          AND pb.store_id = p_store_id
      ) pu ON true
      LEFT JOIN LATERAL (
        SELECT
          SUM(stl.quantity) AS transfer_qty,
          SUM(COALESCE(stl.line_total, stl.quantity * COALESCE(stl.transfer_price, 0))) AS transfer_value
        FROM public.erp_store_transfer_lines stl
        JOIN public.erp_store_transfers st ON st.id = stl.transfer_id
        JOIN public.product_variants pv ON pv.id = stl.variant_id
        WHERE pv.product_id = p.id
          AND st.transfer_date BETWEEN p_date_from AND p_date_to
          AND st.status IN ('completed', 'approved')
          AND st.to_store_id = p_store_id
      ) tr ON true
      WHERE (p_brand_id IS NULL OR p.brand_id = p_brand_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (
          COALESCE(pu.purchase_qty, 0) <> 0
          OR COALESCE(tr.transfer_qty, 0) <> 0
        )
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_purchase_by_vendor_report(
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.vendor_name), '[]'::jsonb)
    FROM (
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        COALESCE(exp.expense_count, 0)::bigint AS expense_count,
        COALESCE(bill.bill_count, 0)::bigint AS bill_count,
        COALESCE(cred.vendor_credit_count, 0)::bigint AS vendor_credit_count,
        ROUND(COALESCE(exp.expense_amount, 0), 2) AS expense_amount,
        ROUND(COALESCE(bill.bill_amount, 0), 2) AS bill_amount,
        ROUND(COALESCE(cred.vendor_credit_amount, 0), 2) AS vendor_credit_amount,
        ROUND(
          COALESCE(exp.expense_amount, 0)
          + COALESCE(bill.bill_amount, 0)
          - COALESCE(cred.vendor_credit_amount, 0),
          2
        ) AS total
      FROM public.vendors v
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS expense_count,
          SUM(e.total_amount) AS expense_amount
        FROM public.erp_expenses e
        WHERE e.vendor_id = v.id
          AND e.expense_date BETWEEN p_date_from AND p_date_to
          AND e.store_id = p_store_id
      ) exp ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS bill_count,
          SUM(pb.total_amount) AS bill_amount
        FROM public.erp_purchase_bills pb
        WHERE pb.vendor_id = v.id
          AND pb.purchase_date BETWEEN p_date_from AND p_date_to
          AND pb.status IN ('finalized', 'partial', 'paid')
          AND pb.store_id = p_store_id
      ) bill ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS vendor_credit_count,
          SUM(vc.total_amount) AS vendor_credit_amount
        FROM public.erp_vendor_credits vc
        WHERE vc.vendor_id = v.id
          AND vc.credit_date BETWEEN p_date_from AND p_date_to
          AND vc.status IN ('issued', 'applied')
          AND vc.store_id = p_store_id
      ) cred ON true
      WHERE v.is_active IS DISTINCT FROM false
        AND (
          COALESCE(exp.expense_count, 0) + COALESCE(bill.bill_count, 0) + COALESCE(cred.vendor_credit_count, 0) > 0
        )
    ) r
  );
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
          CASE WHEN tr.status IN ('completed', 'transfer_completed', 'approved')
            OR EXISTS (
              SELECT 1 FROM public.erp_store_transfers st
              WHERE st.request_id = tr.id AND st.status = 'completed'
            )
          THEN COALESCE(line.requested_value, 0) ELSE 0 END,
          2
        ) AS payment_paid,
        ROUND(
          COALESCE(line.requested_value, 0)
          - CASE WHEN tr.status IN ('completed', 'transfer_completed', 'approved')
            OR EXISTS (
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

GRANT EXECUTE ON FUNCTION public.get_erp_general_ledger_summary(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_account_transaction_report(date, date, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_general_ledger(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_salesman(date, date, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_purchase_by_item_report(date, date, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_purchase_by_vendor_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_stock_transfer_report(date, date, uuid, uuid, text) TO authenticated;

COMMIT;
