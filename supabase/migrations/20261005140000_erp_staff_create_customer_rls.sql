-- ERP customers are rows in public.users with their own id (not auth.uid()).
-- Phase-1 RLS only allowed users_insert_self, which blocked admin/manager create-customer flows.

BEGIN;

DROP POLICY IF EXISTS "users_staff_insert_customer" ON public.users;
CREATE POLICY "users_staff_insert_customer"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff_user()
    AND (role IS NULL OR role::text = 'customer')
  );

DROP POLICY IF EXISTS "addresses_staff_insert" ON public.addresses;
CREATE POLICY "addresses_staff_insert"
  ON public.addresses FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "addresses_staff_update" ON public.addresses;
CREATE POLICY "addresses_staff_update"
  ON public.addresses FOR UPDATE
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

COMMIT;
