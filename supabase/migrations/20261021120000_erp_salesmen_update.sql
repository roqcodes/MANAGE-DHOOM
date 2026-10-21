-- Super-admin: update ERP salesman profile and PIN.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_erp_salesman(
  p_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINERC
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NULLIF(BTRIM(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Name is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.erp_salesmen
  SET
    name = BTRIM(p_name),
    email = NULLIF(BTRIM(p_email), ''),
    phone = NULLIF(BTRIM(p_phone), ''),
    is_active = COALESCE(p_is_active, true),
    updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salesman not found' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_erp_salesman_pin(
  p_id uuid,
  p_pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin char(3);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_pin := NULLIF(BTRIM(p_pin), '');
  IF v_pin IS NULL OR v_pin !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 3 digits' USING ERRCODE = '22023';
  END IF;

  UPDATE public.erp_salesmen
  SET pin = v_pin, updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salesman not found' USING ERRCODE = '22023';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_erp_salesman(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_erp_salesman_pin(uuid, text) TO authenticated;

COMMIT;
