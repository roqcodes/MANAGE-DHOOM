-- Rename system walk-in customer to "Walking Customer" (same id / WALK-IN number).

BEGIN;

UPDATE public.users
SET
  name = 'Walking Customer',
  contact_display_name = 'Walking Customer / POS cash sales'
WHERE id = 'a0000000-0000-4000-8000-000000000001'
   OR customer_number = 'WALK-IN'
   OR email = 'walk-in@buyhub.internal';

UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"name":"Walking Customer"}'::jsonb
WHERE id = 'a0000000-0000-4000-8000-000000000001'
   OR email = 'walk-in@buyhub.internal';

CREATE OR REPLACE FUNCTION public.ensure_walk_in_customer()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_id uuid;
  v_walk_in_id uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  SELECT id INTO v_id
  FROM public.users
  WHERE customer_number = 'WALK-IN'
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.users
    SET
      name = 'Walking Customer',
      contact_display_name = 'Walking Customer / POS cash sales'
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  SELECT id INTO v_id
  FROM public.users
  WHERE email = 'walk-in@buyhub.internal'
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.users
    SET
      name = 'Walking Customer',
      customer_number = COALESCE(customer_number, 'WALK-IN'),
      contact_display_name = 'Walking Customer / POS cash sales'
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_walk_in_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    VALUES (
      v_walk_in_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'walk-in@buyhub.internal',
      extensions.crypt('walk-in-no-login'::text, extensions.gen_salt('bf'::text)),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Walking Customer"}'::jsonb,
      false, '', '', '', ''
    );
  END IF;

  INSERT INTO public.users (
    id, name, email, role, is_verified, customer_number, contact_display_name
  )
  VALUES (
    v_walk_in_id,
    'Walking Customer',
    'walk-in@buyhub.internal',
    'customer',
    true,
    'WALK-IN',
    'Walking Customer / POS cash sales'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    customer_number = EXCLUDED.customer_number,
    contact_display_name = EXCLUDED.contact_display_name,
    name = EXCLUDED.name,
    email = EXCLUDED.email;

  RETURN v_walk_in_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_walk_in_customer() TO authenticated;

COMMIT;