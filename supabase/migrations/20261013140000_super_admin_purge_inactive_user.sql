-- Super admin: permanently remove portal users with no audit trail or business activity.

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

  IF to_regclass('public.journal_entries') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.journal_entries WHERE created_by = p_user_id LIMIT 1
     ) THEN
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

CREATE OR REPLACE FUNCTION public.portal_user_purge_eligibility(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trace text;
BEGIN
  PERFORM public.rbac_require_super_admin();

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'cannot_delete_self');
  END IF;

  v_trace := public.portal_user_blocking_trace(p_user_id);

  IF v_trace = 'not_found' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_found');
  END IF;

  IF v_trace IS NOT NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', v_trace);
  END IF;

  RETURN jsonb_build_object('eligible', true, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_purge_inactive_portal_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trace text;
BEGIN
  PERFORM public.rbac_require_super_admin();

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account.';
  END IF;

  v_trace := public.portal_user_blocking_trace(p_user_id);

  IF v_trace = 'not_found' THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_trace IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete user: activity recorded (%).', v_trace;
  END IF;

  DELETE FROM public.user_store_access WHERE user_id = p_user_id;
  DELETE FROM public.vendors WHERE id = p_user_id;
  DELETE FROM public.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_user_blocking_trace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_user_purge_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_purge_inactive_portal_user(uuid) TO authenticated;

COMMIT;
