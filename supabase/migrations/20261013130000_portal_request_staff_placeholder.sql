-- Access requests: no self-selected role; placeholder `staff` until super admin assigns RBAC.

BEGIN;

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

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
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

COMMIT;
