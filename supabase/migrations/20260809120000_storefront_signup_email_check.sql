-- Allow the mobile storefront to reject sign-ups for emails already in use
-- (staff portal or existing customer) before Supabase returns a fake confirmation response.

CREATE OR REPLACE FUNCTION public.check_storefront_signup_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role
  INTO v_role
  FROM public.users
  WHERE lower(trim(email)) = lower(trim(p_email))
  LIMIT 1;

  IF FOUND THEN
    IF v_role IS NULL THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'customer_exists'
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'staff_exists',
      'role', v_role
    );
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.check_storefront_signup_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_storefront_signup_email(text) TO anon, authenticated;
