BEGIN;

CREATE OR REPLACE FUNCTION public.erp_require_staff_or_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN;
  END IF;
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
END;
$$;

COMMIT;
