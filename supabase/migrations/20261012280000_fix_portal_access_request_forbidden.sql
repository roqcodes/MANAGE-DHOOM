-- Request Access: signUp often has no JWT (email confirm). The old RPC required
-- auth.uid() = p_user_id OR metadata portal_access_request = 'true' (string).
-- Boolean true in raw_user_meta_data failed that compare → RAISE 'Forbidden'.

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
SET search_path = public
AS $$
DECLARE
  v_role text := lower(trim(COALESCE(p_role, '')));
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_name text := NULLIF(BTRIM(p_name), '');
  v_phone text := NULLIF(BTRIM(p_phone), '');
  v_existing_role text;
  v_allowed boolean := false;
BEGIN
  IF p_user_id IS NULL OR v_email = '' OR v_name IS NULL OR v_phone IS NULL THEN
    RAISE EXCEPTION 'Invalid portal access profile payload';
  END IF;

  IF v_role NOT IN ('admin', 'manager', 'vendor', 'delivery') THEN
    RAISE EXCEPTION 'Invalid portal role';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() = p_user_id THEN
    v_allowed := true;
  ELSIF EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = p_user_id
      AND au.created_at >= (now() - interval '2 hours')
      AND (
        au.email IS NULL
        OR lower(trim(au.email)) = v_email
      )
      AND (
        lower(trim(COALESCE(au.raw_user_meta_data ->> 'role', ''))) IN ('', v_role)
      )
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Unable to create your access request. Try signing up again, or ask an administrator to invite you.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RETURN;
  END IF;

  SELECT u.role::text
  INTO v_existing_role
  FROM public.users u
  WHERE lower(trim(u.email)) = v_email
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
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_portal_access_profile(uuid, text, text, text, text) TO anon, authenticated;

COMMIT;
