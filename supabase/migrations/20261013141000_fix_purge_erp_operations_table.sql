-- Fix purge eligibility: use erp_client_operations (not erp_client_operations_idempotency).

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_user_blocking_trace(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'invalid_user';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RETURN 'not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.audit_logs WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN 'audit_logs';
  END IF;

  IF to_regclass('public.erp_client_operations') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.erp_client_operations WHERE user_id = p_user_id LIMIT 1
     ) THEN
    RETURN 'erp_sync_operations';
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN 'store_orders';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN 'customer_invoices';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE sales_person_id = p_user_id LIMIT 1) THEN
    RETURN 'sales_invoices';
  END IF;

  IF EXISTS (SELECT 1 FROM public.addresses WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN 'saved_addresses';
  END IF;

  IF EXISTS (SELECT 1 FROM public.transactions WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN 'wallet_transactions';
  END IF;

  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE created_by = p_user_id LIMIT 1) THEN
    RETURN 'journal_entries';
  END IF;

  IF to_regclass('public.erp_purchase_bills') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.erp_purchase_bills WHERE created_by = p_user_id LIMIT 1
     ) THEN
    RETURN 'purchase_bills';
  END IF;

  IF to_regclass('public.erp_purchase_bills') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.erp_purchase_bills WHERE vendor_id = p_user_id LIMIT 1
     ) THEN
    RETURN 'vendor_purchase_history';
  END IF;

  RETURN NULL;
END;
$$;

COMMIT;
