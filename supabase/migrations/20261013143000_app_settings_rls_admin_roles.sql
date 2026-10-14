-- app_settings write policies predated super_admin / RBAC helpers.

DROP POLICY IF EXISTS "app_settings_update_admin" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_insert_admin" ON public.app_settings;

CREATE POLICY "app_settings_update_admin"
  ON public.app_settings
  FOR UPDATE
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role::text = 'manager'  
    )
  );  

CREATE POLICY "app_settings_insert_admin" 
  ON public.app_settings
  FOR INSERT
  WITH CHECK (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role::text = 'manager'
    )
  );
