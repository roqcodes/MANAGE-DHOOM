-- Supabase Dashboard SQL editor runs as postgres without auth.uid(); allow read-only audit RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_require_staff_or_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Dashboard SQL / migrations (no JWT)
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN;
  END IF;

  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN;
  END IF;
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL AND public.is_staff_user(auth.uid()) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Forbidden';
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_require_staff_or_service_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_require_staff_or_service_role() TO service_role;

GRANT EXECUTE ON FUNCTION public.erp_audit_invoice_cogs_trueup(uuid) TO postgres;

COMMIT;
