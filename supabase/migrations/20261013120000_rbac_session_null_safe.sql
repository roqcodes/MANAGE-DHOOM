-- Harden get_my_rbac_session when role row is missing (pre-migration users).

CREATE OR REPLACE FUNCTION public.get_my_rbac_session(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_role record;
  v_role_id uuid;     
  v_perms jsonb := '{}'::jsonb;
  v_overrides jsonb := '{}'::jsonb;
  v_stores jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.id, u.role, u.rbac_role_id, u.is_verified
  INTO v_user
  FROM public.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_role
  FROM public.rbac_roles
  WHERE id = v_user.rbac_role_id
     OR (v_user.rbac_role_id IS NULL AND slug = v_user.role::text)
  LIMIT 1;

  v_role_id := v_role.id;

  IF v_role_id IS NOT NULL THEN
    FOR r IN
      SELECT permission_key, can_read, can_write
      FROM public.rbac_role_permissions
      WHERE role_id = v_role_id AND store_id IS NULL
    LOOP
      v_perms := v_perms || jsonb_build_object(
        r.permission_key,
        jsonb_build_object('read', r.can_read, 'write', r.can_write)
      );
    END LOOP;

    FOR r IN
      SELECT store_id, permission_key, can_read, can_write
      FROM public.rbac_role_permissions
      WHERE role_id = v_role_id AND store_id IS NOT NULL
    LOOP
      v_overrides := jsonb_set(
        v_overrides,
        ARRAY[r.store_id::text],
        COALESCE(v_overrides -> r.store_id::text, '{}'::jsonb) || jsonb_build_object(
          r.permission_key,
          jsonb_build_object('read', r.can_read, 'write', r.can_write)
        ),
        true
      );
    END LOOP;
  END IF;

  SELECT COALESCE(jsonb_agg(usa.store_id), '[]'::jsonb)
  INTO v_stores
  FROM public.user_store_access usa
  WHERE usa.user_id = p_user_id;

  RETURN jsonb_build_object(
    'roleId', v_role_id,
    'roleSlug', COALESCE(v_role.slug, v_user.role::text),
    'roleName', COALESCE(v_role.name, v_user.role::text),
    'kind', COALESCE(v_role.kind, 'system'),
    'isSuperAdmin', v_user.role::text = 'super_admin',
    'canManageRoles', v_user.role::text = 'super_admin',
    'permissions', v_perms,
    'storeOverrides', v_overrides,
    'storeIds', v_stores
  );
END;
$$;
