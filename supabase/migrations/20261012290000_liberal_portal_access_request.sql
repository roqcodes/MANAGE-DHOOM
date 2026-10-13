-- Request Access: trust signUp-returned user id + email; no metadata/time/role gates.

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
  v_role text := lower(trim(COALESCE(p_role, '')));
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_name text := NULLIF(BTRIM(p_name), '');
  v_phone text := NULLIF(BTRIM(p_phone), '');
  v_existing_role text;
  v_auth_email text;
BEGIN
  IF p_user_id IS NULL OR v_email = '' OR v_name IS NULL OR v_phone IS NULL THEN
    RAISE EXCEPTION 'Invalid portal access profile payload';
  END IF;

  IF v_role NOT IN ('admin', 'manager', 'vendor', 'delivery') THEN
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

    IF v_existing_role IN ('admin', 'manager', 'vendor', 'delivery') THEN
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

GRANT EXECUTE ON FUNCTION public.create_portal_access_profile(uuid, text, text, text, text) TO anon, authenticated, service_role;

COMMIT;
