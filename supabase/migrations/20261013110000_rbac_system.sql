-- Zoho-style RBAC: preset + custom roles, page read/write, optional per-store overrides.
-- Session is one RPC; no extra round-trips on page loads.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rbac_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'system' CHECK (kind IN ('system', 'custom')),
  portal_role public.user_role NOT NULL DEFAULT 'staff',
  is_preset boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rbac_role_permissions (
  role_id uuid NOT NULL REFERENCES public.rbac_roles (id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  store_id uuid REFERENCES public.stores (id) ON DELETE CASCADE,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_role_permissions_global_uq
  ON public.rbac_role_permissions (role_id, permission_key)
  WHERE store_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rbac_role_permissions_store_uq
  ON public.rbac_role_permissions (role_id, permission_key, store_id)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rbac_role_permissions_role_idx
  ON public.rbac_role_permissions (role_id);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS rbac_role_id uuid REFERENCES public.rbac_roles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_rbac_role_id_idx ON public.users (rbac_role_id);

ALTER TABLE public.rbac_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rbac_roles_staff_read ON public.rbac_roles;
CREATE POLICY rbac_roles_staff_read
  ON public.rbac_roles FOR SELECT TO authenticated
  USING (public.is_staff_user());

DROP POLICY IF EXISTS rbac_role_permissions_staff_read ON public.rbac_role_permissions;
CREATE POLICY rbac_role_permissions_staff_read
  ON public.rbac_role_permissions FOR SELECT TO authenticated
  USING (public.is_staff_user());

CREATE OR REPLACE FUNCTION public.is_super_admin_user(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id AND u.role::text = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id AND u.role::text IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_user(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id
      AND u.role::text IN (
        'admin', 'manager', 'super_admin', 'salesman', 'sales_manager',
        'accountant', 'store_keeper', 'staff'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.rbac_all_page_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'page.dashboard',
    'page.products', 'page.categories', 'page.brands', 'page.item-units',
    'page.inventory', 'page.erp.store-inventory', 'page.erp.stock-adjustments',
    'page.erp.item-transactions', 'page.erp.store-transfers', 'page.erp.transfer-requests',
    'page.erp.transfer-approvals', 'page.erp.transfer-statement', 'page.erp.transfer-bulk-payments',
    'page.erp.stores',
    'page.customers', 'page.orders', 'page.erp.fulfillment-queue', 'page.billing',
    'page.erp.estimates', 'page.erp.sales-orders', 'page.erp.invoices', 'page.erp.credit-notes',
    'page.erp.payments', 'page.erp.customer-bulk-payments', 'page.erp.recurring-invoices',
    'page.vendors', 'page.purchase-orders', 'page.erp.purchase-bills', 'page.erp.vendor-credits',
    'page.erp.expenses', 'page.erp.recurring-bills', 'page.erp.landed-costs',
    'page.erp.supplier-payments', 'page.erp.supplier-bulk-payments',
    'page.erp.banking', 'page.erp.payment-statement', 'page.erp.profit-withdrawals',
    'page.erp.account-types', 'page.erp.accounts', 'page.erp.journal-entries',
    'page.erp.reports', 'page.erp.financial-summary', 'page.erp.reconciliation', 'page.finance',
    'page.erp.vat-returns', 'page.erp.vat-payments',
    'page.erp.employees', 'page.erp.pay-slips', 'page.erp.salary-payments',
    'page.erp.salary-bulk-payments', 'page.erp.employee-opening-balances',
    'page.erp.fixed-assets',
    'page.business', 'page.config.tax', 'page.config.push',
    'page.users', 'page.config', 'page.roles'
  ];
$$;

CREATE OR REPLACE FUNCTION public.rbac_grant_keys(
  p_role_slug text,
  p_keys text[],
  p_write boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_key text;
BEGIN
  SELECT id INTO v_role_id FROM public.rbac_roles WHERE slug = p_role_slug;
  IF v_role_id IS NULL THEN
    RETURN;
  END IF;
  FOREACH v_key IN ARRAY p_keys LOOP
    INSERT INTO public.rbac_role_permissions (role_id, permission_key, store_id, can_read, can_write)
    VALUES (v_role_id, v_key, NULL, true, p_write)
    ON CONFLICT (role_id, permission_key) WHERE store_id IS NULL
    DO UPDATE SET can_read = true, can_write = EXCLUDED.can_write, updated_at = now();
  END LOOP;
END;
$$;

INSERT INTO public.rbac_roles (slug, name, description, kind, portal_role, is_preset, sort_order)
VALUES
  ('super_admin', 'Super Admin', 'Full access including roles and staff assignment.', 'system', 'super_admin', true, 10),
  ('admin', 'Admin', 'Everything except assigning and managing roles.', 'system', 'admin', true, 20),
  ('sales_manager', 'Sales Manager', 'Sales pipeline, customers, POS, and collections.', 'system', 'sales_manager', true, 30),
  ('salesman', 'Salesman', 'POS, estimates, orders, and customers.', 'system', 'salesman', true, 40),
  ('accountant', 'Accountant', 'Books, banking, tax, payments, and reports.', 'system', 'accountant', true, 50),
  ('store_keeper', 'Store Keeper', 'Stock, transfers, and inbound purchases.', 'system', 'store_keeper', true, 60),
  ('manager', 'Manager (legacy)', 'Mapped to sales manager access.', 'system', 'manager', true, 70)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  portal_role = EXCLUDED.portal_role,
  updated_at = now();

-- Super admin: every page including roles.
SELECT public.rbac_grant_keys('super_admin', public.rbac_all_page_keys(), true);

-- Admin: every page except roles.
SELECT public.rbac_grant_keys(
  'admin',
  ARRAY(
    SELECT k FROM unnest(public.rbac_all_page_keys()) AS k WHERE k <> 'page.roles'
  ),
  true
);

SELECT public.rbac_grant_keys('sales_manager', ARRAY[
  'page.dashboard', 'page.customers', 'page.orders', 'page.erp.fulfillment-queue', 'page.billing',
  'page.erp.estimates', 'page.erp.sales-orders', 'page.erp.invoices', 'page.erp.credit-notes',
  'page.erp.payments', 'page.erp.customer-bulk-payments', 'page.erp.recurring-invoices',
  'page.erp.reports', 'page.erp.financial-summary', 'page.finance', 'page.config'
], true);

SELECT public.rbac_grant_keys('manager', ARRAY[
  'page.dashboard', 'page.customers', 'page.orders', 'page.erp.fulfillment-queue', 'page.billing',
  'page.erp.estimates', 'page.erp.sales-orders', 'page.erp.invoices', 'page.erp.credit-notes',
  'page.erp.payments', 'page.erp.customer-bulk-payments', 'page.erp.recurring-invoices',
  'page.erp.reports', 'page.erp.financial-summary', 'page.finance', 'page.config'
], true);

SELECT public.rbac_grant_keys('salesman', ARRAY[
  'page.dashboard', 'page.customers', 'page.billing',
  'page.erp.estimates', 'page.erp.sales-orders', 'page.erp.invoices',
  'page.config'
], true);

SELECT public.rbac_grant_keys('accountant', ARRAY[
  'page.dashboard', 'page.erp.invoices', 'page.erp.credit-notes', 'page.erp.payments',
  'page.erp.customer-bulk-payments', 'page.erp.expenses', 'page.erp.supplier-payments',
  'page.erp.supplier-bulk-payments', 'page.erp.banking', 'page.erp.payment-statement',
  'page.erp.profit-withdrawals', 'page.erp.account-types', 'page.erp.accounts',
  'page.erp.journal-entries', 'page.erp.reports', 'page.erp.financial-summary',
  'page.erp.reconciliation', 'page.finance', 'page.erp.vat-returns', 'page.erp.vat-payments',
  'page.config'
], true);

SELECT public.rbac_grant_keys('store_keeper', ARRAY[
  'page.dashboard', 'page.products', 'page.inventory', 'page.erp.store-inventory',
  'page.erp.stock-adjustments', 'page.erp.item-transactions', 'page.erp.store-transfers',
  'page.erp.transfer-requests', 'page.erp.transfer-approvals', 'page.erp.transfer-statement',
  'page.erp.stores', 'page.purchase-orders', 'page.erp.purchase-bills', 'page.erp.landed-costs',
  'page.config'
], true);

-- Salesman products/inventory stay read-only if later granted; store keeper products read+write via grant above.

UPDATE public.users u
SET rbac_role_id = r.id
FROM public.rbac_roles r
WHERE u.rbac_role_id IS NULL
  AND u.role::text = r.slug;

UPDATE public.users
SET
  role = 'super_admin',
  is_verified = true,
  rbac_role_id = (SELECT id FROM public.rbac_roles WHERE slug = 'super_admin')
WHERE lower(trim(email)) = 'roq2362005@gmail.com';

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

  FOR r IN
    SELECT permission_key, can_read, can_write
    FROM public.rbac_role_permissions
    WHERE role_id = v_role.id AND store_id IS NULL
  LOOP
    v_perms := v_perms || jsonb_build_object(
      r.permission_key,
      jsonb_build_object('read', r.can_read, 'write', r.can_write)
    );
  END LOOP;

  FOR r IN
    SELECT store_id, permission_key, can_read, can_write
    FROM public.rbac_role_permissions
    WHERE role_id = v_role.id AND store_id IS NOT NULL
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

  SELECT COALESCE(jsonb_agg(usa.store_id), '[]'::jsonb)
  INTO v_stores
  FROM public.user_store_access usa
  WHERE usa.user_id = p_user_id;

  RETURN jsonb_build_object(
    'roleId', v_role.id,
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

CREATE OR REPLACE FUNCTION public.rbac_require_super_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Only a super admin can manage roles.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_upsert_custom_role(
  p_name text,
  p_description text DEFAULT '',
  p_role_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_slug text;
BEGIN
  PERFORM public.rbac_require_super_admin();
  IF p_role_id IS NOT NULL THEN
    UPDATE public.rbac_roles
    SET name = BTRIM(p_name),
        description = COALESCE(p_description, ''),
        updated_at = now()
    WHERE id = p_role_id AND kind = 'custom'
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Custom role not found.';
    END IF;
    RETURN v_id;
  END IF;

  v_slug := lower(regexp_replace(BTRIM(p_name), '[^a-zA-Z0-9]+', '_', 'g'));
  v_slug := trim(both '_' from v_slug);
  IF v_slug = '' THEN
    RAISE EXCEPTION 'Role name is required.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rbac_roles WHERE slug = v_slug) THEN
    v_slug := v_slug || '_' || substr(gen_random_uuid()::text, 1, 8);
  END IF;

  INSERT INTO public.rbac_roles (slug, name, description, kind, portal_role, is_preset, sort_order)
  VALUES (v_slug, BTRIM(p_name), COALESCE(p_description, ''), 'custom', 'staff', false, 200)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_set_permission(
  p_role_id uuid,
  p_permission_key text,
  p_can_read boolean,
  p_can_write boolean,
  p_store_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role record;
BEGIN
  PERFORM public.rbac_require_super_admin();
  SELECT * INTO v_role FROM public.rbac_roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found.';
  END IF;
  IF v_role.slug = 'super_admin' AND p_permission_key = 'page.roles' AND NOT p_can_write THEN
    RAISE EXCEPTION 'Super admin must keep role-management access.';
  END IF;

  IF p_store_id IS NULL THEN
    INSERT INTO public.rbac_role_permissions (role_id, permission_key, store_id, can_read, can_write)
    VALUES (p_role_id, p_permission_key, NULL, p_can_read, p_can_write)
    ON CONFLICT (role_id, permission_key) WHERE store_id IS NULL
    DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write, updated_at = now();
  ELSE
    INSERT INTO public.rbac_role_permissions (role_id, permission_key, store_id, can_read, can_write)
    VALUES (p_role_id, p_permission_key, p_store_id, p_can_read, p_can_write)
    ON CONFLICT (role_id, permission_key, store_id) WHERE store_id IS NOT NULL
    DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write, updated_at = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_assign_user(
  p_user_id uuid,
  p_role_id uuid,
  p_store_ids uuid[] DEFAULT NULL,
  p_default_store_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role record;
  v_store uuid;
BEGIN
  PERFORM public.rbac_require_super_admin();
  SELECT * INTO v_role FROM public.rbac_roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found.';
  END IF;

  UPDATE public.users
  SET role = v_role.portal_role,
      rbac_role_id = v_role.id
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF p_store_ids IS NOT NULL THEN
    DELETE FROM public.user_store_access WHERE user_id = p_user_id;
    FOREACH v_store IN ARRAY p_store_ids LOOP
      INSERT INTO public.user_store_access (user_id, store_id, is_default)
      VALUES (
        p_user_id,
        v_store,
        p_default_store_id IS NOT NULL AND v_store = p_default_store_id
      )
      ON CONFLICT (user_id, store_id) DO UPDATE SET is_default = EXCLUDED.is_default;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_delete_custom_role(p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.rbac_require_super_admin();
  DELETE FROM public.rbac_roles WHERE id = p_role_id AND kind = 'custom';
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rbac_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_upsert_custom_role(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_set_permission(uuid, text, boolean, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_assign_user(uuid, uuid, uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_delete_custom_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_all_page_keys() TO authenticated;

COMMIT;
