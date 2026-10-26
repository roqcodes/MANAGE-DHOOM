-- SQL editor: get_account_by_code must not require JWT.
-- Production missing erp_invoice_has_posted_revenue_journal from 20261020170000.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_account_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.erp_require_staff_or_service_role();
  RETURN (SELECT id FROM public.accounts WHERE code = p_code LIMIT 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_by_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_account_by_code(text) TO postgres;

CREATE OR REPLACE FUNCTION public.erp_invoice_has_posted_revenue_journal(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.source_entity_type = 'invoice'
      AND je.source_entity_id = p_invoice_id
      AND je.status = 'posted'
  );
$$;

GRANT EXECUTE ON FUNCTION public.erp_invoice_has_posted_revenue_journal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_invoice_has_posted_revenue_journal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_invoice_has_posted_revenue_journal(uuid) TO postgres;

COMMIT;
