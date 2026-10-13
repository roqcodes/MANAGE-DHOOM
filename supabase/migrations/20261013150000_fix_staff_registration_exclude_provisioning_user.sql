-- create_portal_access_profile re-ran check_staff_portal_registration after auth.users
-- was created, so every new staff sign-up looked like an existing storefront auth account.

BEGIN;

DROP FUNCTION IF EXISTS public.check_staff_portal_registration(text, text);

CREATE OR REPLACE FUNCTION public.check_staff_portal_registration(
  p_email text,
  p_phone text DEFAULT NULL,
  p_exclude_user_id uuid DEFAULT NULL
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
  v_user_id uuid;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_email');
  END IF;

  SELECT u.role::text, u.id
  INTO v_role, v_user_id
  FROM public.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF FOUND AND (p_exclude_user_id IS NULL OR v_user_id IS DISTINCT FROM p_exclude_user_id) THEN
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

  IF FOUND AND (p_exclude_user_id IS NULL OR v_auth_id IS DISTINCT FROM p_exclude_user_id) THEN
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
    SELECT u.role::text, u.id
    INTO v_role, v_user_id
    FROM public.users u
    WHERE public.normalize_phone_digits(u.phone) = v_phone_digits
    LIMIT 1;

    IF FOUND AND (p_exclude_user_id IS NULL OR v_user_id IS DISTINCT FROM p_exclude_user_id) THEN
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
  SELECT public.check_staff_portal_registration(p_email, NULL, NULL);
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

  v_reg := public.check_staff_portal_registration(v_email, v_phone, p_user_id);
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

REVOKE ALL ON FUNCTION public.check_staff_portal_registration(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_staff_portal_registration(text, text, uuid) TO anon, authenticated;

COMMIT;
