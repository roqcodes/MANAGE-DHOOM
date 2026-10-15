-- Delete ERP vendors/customers only when they have no operational (transactional) data.
-- Master debris (addresses, empty wallet, catalog SKUs) is removed with the party.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_party_has_fk_rows(
  p_table text,
  p_column text,
  p_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found boolean := false;
BEGIN
  IF p_table IS NULL OR p_column IS NULL OR p_id IS NULL THEN
    RETURN false;
  END IF;
  IF to_regclass(format('public.%I', p_table)) IS NULL THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = p_table
      AND c.column_name = p_column
  ) THEN
    RETURN false;
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I = $1 LIMIT 1)',
    p_table,
    p_column
  )
  INTO v_found
  USING p_id;

  RETURN COALESCE(v_found, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_customer_operational_trace(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_number text;
  v_email text;
  v_opening numeric;
  v_wallet numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'not_found';
  END IF;

  SELECT u.role::text, u.customer_number, u.email, COALESCE(u.opening_balance, 0)
  INTO v_role, v_number, v_email, v_opening
  FROM public.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN 'cannot_delete_self';
  END IF;

  IF p_user_id = 'a0000000-0000-4000-8000-000000000001'::uuid
     OR upper(COALESCE(v_number, '')) = 'WALK-IN'
     OR lower(COALESCE(v_email, '')) = 'walk-in@buyhub.internal' THEN
    RETURN 'walk_in';
  END IF;

  IF public.is_portal_staff_role(v_role) THEN
    RETURN 'staff_account';
  END IF;

  IF v_role IS NOT NULL AND lower(v_role) <> 'customer' THEN
    RETURN 'staff_account';
  END IF;

  IF v_opening <> 0 THEN
    RETURN 'opening_balance';
  END IF;

  IF public.erp_party_has_fk_rows('invoices', 'user_id', p_user_id) THEN
    RETURN 'invoices';
  END IF;
  IF public.erp_party_has_fk_rows('orders', 'user_id', p_user_id) THEN
    RETURN 'orders';
  END IF;
  IF public.erp_party_has_fk_rows('erp_estimates', 'user_id', p_user_id) THEN
    RETURN 'estimates';
  END IF;
  IF public.erp_party_has_fk_rows('erp_credit_notes', 'user_id', p_user_id) THEN
    RETURN 'credit_notes';
  END IF;
  IF public.erp_party_has_fk_rows('erp_customer_payments', 'user_id', p_user_id) THEN
    RETURN 'customer_payments';
  END IF;
  IF public.erp_party_has_fk_rows('erp_expenses', 'user_id', p_user_id)
     OR public.erp_party_has_fk_rows('erp_expenses', 'billable_customer_id', p_user_id) THEN
    RETURN 'expenses';
  END IF;
  IF public.erp_party_has_fk_rows('erp_recurring_schedules', 'customer_id', p_user_id) THEN
    RETURN 'recurring_schedules';
  END IF;
  IF public.erp_party_has_fk_rows('transactions', 'user_id', p_user_id) THEN
    RETURN 'wallet_transactions';
  END IF;
  IF public.erp_party_has_fk_rows('returns', 'user_id', p_user_id) THEN
    RETURN 'returns';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.returns r
    JOIN public.orders o ON o.id = r.order_id
    WHERE o.user_id = p_user_id
    LIMIT 1
  ) THEN
    RETURN 'returns';
  END IF;

  IF to_regclass('public.wallet') IS NOT NULL THEN
    SELECT w.balance INTO v_wallet
    FROM public.wallet w
    WHERE w.user_id = p_user_id;
    IF COALESCE(v_wallet, 0) <> 0 THEN
      RETURN 'wallet_balance';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_vendor_operational_trace(p_vendor_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening numeric;
  v_role text;
BEGIN
  IF p_vendor_id IS NULL THEN
    RETURN 'not_found';
  END IF;

  SELECT COALESCE(v.opening_balance, 0)
  INTO v_opening
  FROM public.vendors v
  WHERE v.id = p_vendor_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  SELECT u.role::text INTO v_role
  FROM public.users u
  WHERE u.id = p_vendor_id;

  IF FOUND AND public.is_portal_staff_role(v_role) THEN
    RETURN 'portal_account';
  END IF;

  IF v_opening <> 0 THEN
    RETURN 'opening_balance';
  END IF;

  IF public.erp_party_has_fk_rows('erp_purchase_bills', 'vendor_id', p_vendor_id) THEN
    RETURN 'purchase_bills';
  END IF;
  IF public.erp_party_has_fk_rows('purchase_orders', 'vendor_id', p_vendor_id) THEN
    RETURN 'purchase_orders';
  END IF;
  IF public.erp_party_has_fk_rows('erp_purchase_receives', 'vendor_id', p_vendor_id) THEN
    RETURN 'purchase_receives';
  END IF;
  IF public.erp_party_has_fk_rows('erp_supplier_payments', 'vendor_id', p_vendor_id) THEN
    RETURN 'supplier_payments';
  END IF;
  IF public.erp_party_has_fk_rows('erp_vendor_credits', 'vendor_id', p_vendor_id) THEN
    RETURN 'vendor_credits';
  END IF;
  IF public.erp_party_has_fk_rows('erp_expenses', 'vendor_id', p_vendor_id) THEN
    RETURN 'expenses';
  END IF;
  IF public.erp_party_has_fk_rows('erp_recurring_schedules', 'vendor_id', p_vendor_id) THEN
    RETURN 'recurring_schedules';
  END IF;
  IF public.erp_party_has_fk_rows('erp_fixed_assets', 'vendor_id', p_vendor_id) THEN
    RETURN 'fixed_assets';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_unused_party_block_message(p_kind text, p_trace text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_trace
    WHEN 'not_found' THEN format('%s not found.', initcap(p_kind))
    WHEN 'cannot_delete_self' THEN 'You cannot delete your own account.'
    WHEN 'walk_in' THEN 'The walk-in customer cannot be deleted.'
    WHEN 'staff_account' THEN 'This account is a staff or portal user. Remove it from Users instead.'
    WHEN 'portal_account' THEN 'This vendor is linked to a portal login. Remove it from Users instead.'
    WHEN 'opening_balance' THEN format('Cannot delete this %s because an opening balance is recorded. Clear it first.', p_kind)
    WHEN 'invoices' THEN 'Cannot delete this customer because invoices exist.'
    WHEN 'orders' THEN 'Cannot delete this customer because orders exist.'
    WHEN 'estimates' THEN 'Cannot delete this customer because estimates exist.'
    WHEN 'credit_notes' THEN 'Cannot delete this customer because credit notes exist.'
    WHEN 'customer_payments' THEN 'Cannot delete this customer because payments exist.'
    WHEN 'returns' THEN 'Cannot delete this customer because returns exist.'
    WHEN 'wallet_transactions' THEN 'Cannot delete this customer because wallet transactions exist.'
    WHEN 'wallet_balance' THEN 'Cannot delete this customer because the wallet still has a balance.'
    WHEN 'purchase_bills' THEN 'Cannot delete this vendor because purchase bills exist.'
    WHEN 'purchase_orders' THEN 'Cannot delete this vendor because purchase orders exist.'
    WHEN 'purchase_receives' THEN 'Cannot delete this vendor because goods receives exist.'
    WHEN 'supplier_payments' THEN 'Cannot delete this vendor because supplier payments exist.'
    WHEN 'vendor_credits' THEN 'Cannot delete this vendor because vendor credits exist.'
    WHEN 'fixed_assets' THEN 'Cannot delete this vendor because fixed assets are linked.'
    WHEN 'expenses' THEN format('Cannot delete this %s because expenses exist.', p_kind)
    WHEN 'recurring_schedules' THEN format('Cannot delete this %s because recurring schedules exist.', p_kind)
    ELSE format('Cannot delete this %s because operational data exists (%s).', p_kind, COALESCE(p_trace, 'unknown'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.delete_erp_customer_if_unused(
  p_user_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trace text;
  v_name text;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_trace := public.erp_customer_operational_trace(p_user_id);
  IF v_trace IS NOT NULL THEN
    RAISE EXCEPTION '%', public.erp_unused_party_block_message('customer', v_trace);
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(u.company_name), ''), NULLIF(BTRIM(u.name), ''), 'customer')
  INTO v_name
  FROM public.users u
  WHERE u.id = p_user_id;

  PERFORM public.portal_user_delete_storefront_debris(p_user_id);

  IF to_regclass('public.customer_credit_limits') IS NOT NULL THEN
    DELETE FROM public.customer_credit_limits WHERE user_id = p_user_id;
  END IF;
  IF to_regclass('public.user_erp_preferences') IS NOT NULL THEN
    DELETE FROM public.user_erp_preferences WHERE user_id = p_user_id;
  END IF;
  IF to_regclass('public.user_store_access') IS NOT NULL THEN
    DELETE FROM public.user_store_access WHERE user_id = p_user_id;
  END IF;
  IF to_regclass('public.notification_preferences') IS NOT NULL THEN
    DELETE FROM public.notification_preferences WHERE user_id = p_user_id;
  END IF;
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications WHERE user_id = p_user_id;
  END IF;
  IF to_regclass('public.order_funnel_reach') IS NOT NULL THEN
    DELETE FROM public.order_funnel_reach WHERE user_id = p_user_id;
  END IF;
  IF to_regclass('public.cart_reach') IS NOT NULL THEN
    DELETE FROM public.cart_reach WHERE user_id = p_user_id;
  END IF;
  IF to_regclass('public.product_view_reach') IS NOT NULL THEN
    DELETE FROM public.product_view_reach WHERE user_id = p_user_id;
  END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    UPDATE public.audit_logs SET user_id = NULL WHERE user_id = p_user_id;
  END IF;

  DELETE FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found.';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, description)
  VALUES (
    p_actor,
    'delete',
    'customer',
    p_user_id,
    format('Customer deleted (unused): %s', v_name)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_erp_vendor_if_unused(
  p_vendor_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trace text;
  v_name text;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_trace := public.erp_vendor_operational_trace(p_vendor_id);
  IF v_trace IS NOT NULL THEN
    RAISE EXCEPTION '%', public.erp_unused_party_block_message('vendor', v_trace);
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(v.name), ''), 'vendor')
  INTO v_name
  FROM public.vendors v
  WHERE v.id = p_vendor_id;

  IF to_regclass('public.vendor_products') IS NOT NULL THEN
    DELETE FROM public.vendor_products WHERE vendor_id = p_vendor_id;
  END IF;
  IF to_regclass('public.vendor_pricing_overrides') IS NOT NULL THEN
    DELETE FROM public.vendor_pricing_overrides WHERE vendor_id = p_vendor_id;
  END IF;

  DELETE FROM public.vendors WHERE id = p_vendor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor not found.';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, description)
  VALUES (
    p_actor,
    'delete',
    'vendor',
    p_vendor_id,
    format('Vendor deleted (unused): %s', v_name)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.erp_party_has_fk_rows(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_customer_operational_trace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_vendor_operational_trace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_unused_party_block_message(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_erp_customer_if_unused(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_erp_vendor_if_unused(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.erp_customer_operational_trace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_vendor_operational_trace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_erp_customer_if_unused(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_erp_vendor_if_unused(uuid, uuid) TO authenticated;

COMMIT;
