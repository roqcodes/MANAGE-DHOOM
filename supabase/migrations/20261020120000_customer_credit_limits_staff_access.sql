-- Staff ERP flows upsert customer_credit_limits with the user JWT; table had no grants/RLS for staff.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_credit_limits TO authenticated;

ALTER TABLE public.customer_credit_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_credit_limits_customer_read ON public.customer_credit_limits;
CREATE POLICY customer_credit_limits_customer_read
  ON public.customer_credit_limits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS customer_credit_limits_staff_manage ON public.customer_credit_limits;
CREATE POLICY customer_credit_limits_staff_manage
  ON public.customer_credit_limits FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS addresses_staff_select ON public.addresses;
CREATE POLICY addresses_staff_select
  ON public.addresses FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

COMMIT;
