-- Return expense report as a jsonb array (same shape as other ERP reports)
-- so extractReportRows does not drop rows. Reload PostgREST schema cache.

BEGIN;

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
  PERFORM public.erp_require_staff_or_service_role();

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  IF current_user NOT IN ('postgres', 'supabase_admin')
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(r) ORDER BY r.expense_date DESC, r.expense_number DESC),
      '[]'::jsonb
    )
    FROM (
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
        ROUND(COALESCE(e.tax_percent, 0), 2) AS tax_percent,
        ROUND(COALESCE(e.tax_amount, 0), 2) AS tax_amount,
        ROUND(COALESCE(e.total_amount, 0), 2) AS total_amount,
        ROUND(
          CASE
            WHEN e.tax_mode = 'inclusive' THEN COALESCE(e.total_amount, 0) - COALESCE(e.tax_amount, 0)
            ELSE COALESCE(e.amount, 0)
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
      LEFT JOIN public.accounts a ON a.id = e.account_id
      LEFT JOIN public.account_types at ON at.id = a.account_type_id
      LEFT JOIN public.accounts pa ON pa.id = e.paid_through_account_id
      LEFT JOIN public.vendors v ON v.id = e.vendor_id
      LEFT JOIN public.users cu ON cu.id = COALESCE(e.billable_customer_id, e.user_id)
      LEFT JOIN public.users cb ON cb.id = e.created_by
      WHERE e.expense_date BETWEEN p_date_from AND p_date_to
        AND e.store_id = p_store_id
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_expense_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_expense_report(date, date, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
