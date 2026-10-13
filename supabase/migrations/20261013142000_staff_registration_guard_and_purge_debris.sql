-- Reject storefront customer email/phone for staff registration; purge lightweight storefront FK debris.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_phone_digits(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.is_portal_staff_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(COALESCE(p_role, '')) = ANY (
    ARRAY[
      'staff', 'admin', 'manager', 'vendor', 'delivery', 'super_admin',
      'salesman', 'sales_manager', 'accountant', 'store_keeper'
    ]
  );
$$;

CREATE OR REPLACE FUNCTION public.check_staff_portal_registration(
  p_email text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_phone_digits text := public.normalize_phone_digits(p_phone);
  v_role text;
  v_auth_id uuid;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_email');
  END IF;

  SELECT u.role::text
  INTO v_role
  FROM public.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF FOUND THEN
    IF public.is_portal_staff_role(v_role) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'portal_exists');
    END IF;
    RETURN jsonb_build_object('allowed', false, 'reason', 'storefront_customer');
  END IF;

  SELECT au.id
  INTO v_auth_id
  FROM auth.users au
  WHERE lower(trim(au.email)) = v_email
  LIMIT 1;

  IF FOUND THEN
    SELECT u.role::text
    INTO v_role
    FROM public.users u
    WHERE u.id = v_auth_id;

    IF NOT FOUND OR NOT public.is_portal_staff_role(v_role) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'storefront_customer');
    END IF;
    RETURN jsonb_build_object('allowed', false, 'reason', 'portal_exists');
  END IF;

  IF v_phone_digits IS NOT NULL AND length(v_phone_digits) >= 6 THEN
    SELECT u.role::text
    INTO v_role
    FROM public.users u
    WHERE public.normalize_phone_digits(u.phone) = v_phone_digits
    LIMIT 1;

    IF FOUND THEN
      IF public.is_portal_staff_role(v_role) THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'portal_phone_exists');
      END IF;
      RETURN jsonb_build_object('allowed', false, 'reason', 'storefront_customer_phone');
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_staff_portal_signup_email(p_email text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.check_staff_portal_registration(p_email, NULL);
$$;

CREATE OR REPLACE FUNCTION public.create_portal_access_profile(
  p_user_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role text := lower(trim(COALESCE(p_role, 'staff')));
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_name text := NULLIF(BTRIM(p_name), '');
  v_phone text := NULLIF(BTRIM(p_phone), '');
  v_existing_role text;
  v_auth_email text;
  v_reg jsonb;
  v_allowed text[] := ARRAY[
    'staff', 'admin', 'manager', 'vendor', 'super_admin', 'salesman',
    'sales_manager', 'accountant', 'store_keeper'
  ];
BEGIN
  IF p_user_id IS NULL OR v_email = '' OR v_name IS NULL OR v_phone IS NULL THEN
    RAISE EXCEPTION 'Invalid portal access profile payload';
  END IF;

  IF NOT (v_role = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Invalid portal role';
  END IF;

  v_reg := public.check_staff_portal_registration(v_email, v_phone);
  IF COALESCE(v_reg ->> 'allowed', 'false') <> 'true' THEN
    IF v_reg ->> 'reason' = 'storefront_customer_phone' THEN
      RAISE EXCEPTION 'This phone number is already used by a storefront customer. Use a different phone for staff access.';
    ELSIF v_reg ->> 'reason' IN ('storefront_customer', 'portal_exists', 'portal_phone_exists') THEN
      RAISE EXCEPTION 'This email or phone is already registered. Storefront customers cannot use the same credentials for the management portal.';
    ELSE
      RAISE EXCEPTION 'Email or phone is not available for staff registration.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    SELECT u.role::text INTO v_existing_role FROM public.users u WHERE u.id = p_user_id;
    IF NOT public.is_portal_staff_role(v_existing_role) THEN
      RAISE EXCEPTION 'This login is a storefront customer account and cannot be converted to staff. Use a new email and phone.';
    END IF;
    RETURN;
  END IF;

  SELECT lower(trim(COALESCE(au.email, '')))
  INTO v_auth_email
  FROM auth.users au
  WHERE au.id = p_user_id;

  IF v_auth_email IS NULL OR v_auth_email = '' THEN
    RAISE EXCEPTION 'No account found for this sign-up. Complete sign-up first, then request access again.';
  END IF;

  IF v_auth_email <> v_email THEN
    RAISE EXCEPTION 'Email does not match the account that was just created. Use the same email you signed up with.';
  END IF;

  SELECT u.role::text
  INTO v_existing_role
  FROM public.users u
  WHERE lower(trim(u.email)) = v_email
    AND u.id IS DISTINCT FROM p_user_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_role IS NULL THEN
      RAISE EXCEPTION 'This email is already registered as a storefront customer. Use a separate email for staff portal access.';
    END IF;

    IF v_existing_role = ANY (v_allowed) THEN
      RAISE EXCEPTION 'This email is already registered for portal access.';
    END IF;
  END IF;

  INSERT INTO public.users (id, name, email, phone, role, is_verified)
  VALUES (
    p_user_id,
    v_name,
    v_email,
    v_phone,
    v_role::public.user_role,
    false
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_user_delete_storefront_debris(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.shopping_list_items') IS NOT NULL
     AND to_regclass('public.shopping_lists') IS NOT NULL THEN
    DELETE FROM public.shopping_list_items sli
    WHERE sli.list_id IN (
      SELECT sl.id FROM public.shopping_lists sl WHERE sl.user_id = p_user_id
    );
    DELETE FROM public.shopping_lists WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.cart_items') IS NOT NULL
     AND to_regclass('public.carts') IS NOT NULL THEN
    DELETE FROM public.cart_items ci
    WHERE ci.cart_id IN (SELECT c.id FROM public.carts c WHERE c.user_id = p_user_id);
    DELETE FROM public.carts WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.addresses') IS NOT NULL THEN
    DELETE FROM public.addresses WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.wallet') IS NOT NULL THEN
    DELETE FROM public.wallet WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.push_tokens') IS NOT NULL THEN
    DELETE FROM public.push_tokens WHERE user_id = p_user_id;
  END IF;
END;
$$;

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

  IF to_regclass('public.transactions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.transactions WHERE user_id = p_user_id LIMIT 1
     ) THEN
    RETURN 'wallet_transactions';
  END IF;

  IF to_regclass('public.returns') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.returns WHERE user_id = p_user_id LIMIT 1
     ) THEN
    RETURN 'return_requests';
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

  PERFORM public.portal_user_delete_storefront_debris(p_user_id);

  DELETE FROM public.user_store_access WHERE user_id = p_user_id;
  DELETE FROM public.vendors WHERE id = p_user_id;
  DELETE FROM public.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_staff_portal_registration(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_staff_portal_registration(text, text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.portal_user_delete_storefront_debris(uuid) TO authenticated;

COMMIT;
