-- Expense report (Purchases and Expenses): Zoho/NetSuite-style register
-- with category, vendor, paid-through, customer, and billing-status slices.

BEGIN;

CREATE INDEX IF NOT EXISTS erp_expenses_store_date_idx
  ON public.erp_expenses (store_id, expense_date DESC);

CREATE OR REPLACE FUNCTION public.get_erp_expense_report(
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
    WITH filtered AS (
      SELECT
        e.id,
        e.expense_number,
        e.expense_date,
        e.store_id,
        s.name AS store_name,
        e.account_id,
        COALESCE(a.code, '') AS account_code,
        COALESCE(a.name, 'Uncategorized') AS account_name,
        COALESCE(at.name, 'Expense') AS account_type_name,
        e.paid_through_account_id,
        COALESCE(pa.name, 'Unassigned') AS paid_through_name,
        e.vendor_id,
        COALESCE(v.name, 'No vendor') AS vendor_name,
        COALESCE(e.billable_customer_id, e.user_id) AS customer_id,
        COALESCE(cu.name, 'Unassigned') AS customer_name,
        e.created_by,
        COALESCE(cb.name, '—') AS recorded_by,
        e.reference,
        e.notes,
        e.tax_mode,
        ROUND(e.tax_percent, 2) AS tax_percent,
        ROUND(e.tax_amount, 2) AS tax_amount,
        ROUND(e.total_amount, 2) AS total_amount,
        ROUND(
          CASE
            WHEN e.tax_mode = 'inclusive' THEN e.total_amount - e.tax_amount
            ELSE e.amount
          END,
          2
        ) AS untaxed_amount,
        COALESCE(e.is_billable, false) AS is_billable,
        e.billed_invoice_id,
        CASE
          WHEN e.billed_invoice_id IS NOT NULL THEN 'Invoiced'
          WHEN COALESCE(e.is_billable, false) THEN 'Billable'
          ELSE 'Non-billable'
        END AS billing_status,
        (e.attachment_url IS NOT NULL AND length(btrim(e.attachment_url)) > 0) AS has_receipt
      FROM public.erp_expenses e
      JOIN public.stores s ON s.id = e.store_id
      JOIN public.accounts a ON a.id = e.account_id
      LEFT JOIN public.account_types at ON at.id = a.account_type_id
      LEFT JOIN public.accounts pa ON pa.id = e.paid_through_account_id
      LEFT JOIN public.vendors v ON v.id = e.vendor_id
      LEFT JOIN public.users cu ON cu.id = COALESCE(e.billable_customer_id, e.user_id)
      LEFT JOIN public.users cb ON cb.id = e.created_by
      WHERE e.expense_date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR e.store_id = p_store_id)
    ),
    kpis AS (
      SELECT
        COUNT(*)::bigint AS expense_count,
        ROUND(COALESCE(SUM(untaxed_amount), 0), 2) AS untaxed_amount,
        ROUND(COALESCE(SUM(tax_amount), 0), 2) AS tax_amount,
        ROUND(COALESCE(SUM(total_amount), 0), 2) AS total_amount,
        ROUND(
          CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_amount), 0) / COUNT(*) ELSE 0 END,
          2
        ) AS avg_amount,
        ROUND(COALESCE(SUM(total_amount) FILTER (WHERE billing_status = 'Non-billable'), 0), 2) AS non_billable_amount,
        ROUND(COALESCE(SUM(total_amount) FILTER (WHERE billing_status = 'Billable'), 0), 2) AS unbilled_amount,
        ROUND(COALESCE(SUM(total_amount) FILTER (WHERE billing_status = 'Invoiced'), 0), 2) AS invoiced_amount,
        ROUND(
          COALESCE(SUM(total_amount) FILTER (WHERE billing_status IN ('Billable', 'Invoiced')), 0),
          2
        ) AS billable_amount,
        COUNT(*) FILTER (WHERE has_receipt)::bigint AS with_receipt_count,
        COUNT(DISTINCT account_id)::bigint AS category_count,
        COUNT(DISTINCT vendor_id) FILTER (WHERE vendor_id IS NOT NULL)::bigint AS vendor_count
      FROM filtered
    )
    SELECT jsonb_build_object(
      'kpis', COALESCE((SELECT to_jsonb(k) FROM kpis k), '{}'::jsonb),
      'details', COALESCE(
        (
          SELECT jsonb_agg(to_jsonb(d) ORDER BY d.expense_date DESC, d.expense_number DESC)
          FROM filtered d
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_expense_report(date, date, uuid) TO authenticated;

COMMIT;
