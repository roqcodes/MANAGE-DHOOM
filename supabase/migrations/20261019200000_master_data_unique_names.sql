-- Case-insensitive unique display names for ERP master data.

BEGIN;

-- ─── Vendors ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_ci_unique_idx
  ON public.vendors (lower(trim(name)))
  WHERE trim(name) <> '';

-- ─── Products ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS products_name_ci_unique_idx
  ON public.products (lower(trim(name)))
  WHERE trim(name) <> '';

-- ─── Brands ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS brands_name_ci_unique_idx
  ON public.brands (lower(trim(name)))
  WHERE trim(name) <> '';

-- ─── Stores ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS stores_name_ci_unique_idx
  ON public.stores (lower(trim(name)))
  WHERE trim(name) <> '';

-- ─── ERP customers (company name) ───────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS users_customer_company_name_ci_unique_idx
  ON public.users (lower(trim(company_name)))
  WHERE customer_number IS NOT NULL AND trim(company_name) <> '';

-- ─── Categories (unique among siblings) ─────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_parent_ci_unique_idx
  ON public.categories (
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  )
  WHERE trim(name) <> '';

-- ─── Variants & variant groups (per product) ────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_name_product_ci_unique_idx
  ON public.product_variants (product_id, lower(trim(name)))
  WHERE trim(name) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS variant_groups_name_product_ci_unique_idx
  ON public.variant_groups (product_id, lower(trim(name)))
  WHERE trim(name) <> '';

-- ─── Employees ──────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS erp_employees_full_name_ci_unique_idx
  ON public.erp_employees (lower(trim(full_name)))
  WHERE trim(full_name) <> '';

-- ─── Chart of accounts ──────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS accounts_name_ci_unique_idx
  ON public.accounts (lower(trim(name)))
  WHERE trim(name) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS account_types_category_name_ci_unique_idx
  ON public.account_types (account_category, lower(trim(name)))
  WHERE trim(name) <> '';

-- ─── Employee RPC: enforce unique full name ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_employee(
  p_store_id uuid,
  p_full_name text,
  p_mobile text,
  p_joining_date date,
  p_basic_salary numeric DEFAULT 0,
  p_allowance numeric DEFAULT 0,
  p_employee_code text DEFAULT NULL,
  p_id_number text DEFAULT NULL,
  p_id_expiry_date date DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_employee_number text;
  v_name text := TRIM(p_full_name);
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  IF NULLIF(v_name, '') IS NULL THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;

  IF NULLIF(TRIM(p_mobile), '') IS NULL THEN
    RAISE EXCEPTION 'Mobile is required';
  END IF;

  IF p_joining_date IS NULL THEN
    RAISE EXCEPTION 'Joining date is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.erp_employees e
    WHERE lower(trim(e.full_name)) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'An employee with this name already exists.';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  SELECT t.out_id, t.out_ref INTO v_employee_id, v_employee_number
  FROM public.erp_next_document_ref('employee') AS t;

  INSERT INTO public.erp_employees (
    id, employee_number, store_id, employee_code, full_name, mobile,
    id_number, id_expiry_date, date_of_birth, joining_date, is_active,
    basic_salary, allowance, notes, created_by
  )
  VALUES (
    v_employee_id, v_employee_number, p_store_id, NULLIF(TRIM(p_employee_code), ''),
    v_name, TRIM(p_mobile),
    NULLIF(TRIM(p_id_number), ''), p_id_expiry_date, p_date_of_birth,
    p_joining_date, COALESCE(p_is_active, true),
    COALESCE(p_basic_salary, 0), COALESCE(p_allowance, 0),
    p_notes, p_created_by
  );

  RETURN v_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_erp_employee(
  p_employee_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_mobile text DEFAULT NULL,
  p_joining_date date DEFAULT NULL,
  p_basic_salary numeric DEFAULT NULL,
  p_allowance numeric DEFAULT NULL,
  p_employee_code text DEFAULT NULL,
  p_id_number text DEFAULT NULL,
  p_id_expiry_date date DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_discontinuation_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_new_name text;
BEGIN
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id INTO v_store_id
  FROM public.erp_employees
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  PERFORM public.require_store_access(COALESCE(p_store_id, v_store_id), p_actor);

  v_new_name := NULLIF(TRIM(p_full_name), '');
  IF v_new_name IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.erp_employees e
    WHERE lower(trim(e.full_name)) = lower(v_new_name)
      AND e.id <> p_employee_id
  ) THEN
    RAISE EXCEPTION 'An employee with this name already exists.';
  END IF;

  UPDATE public.erp_employees
  SET
    store_id = COALESCE(p_store_id, store_id),
    full_name = COALESCE(v_new_name, full_name),
    mobile = COALESCE(NULLIF(TRIM(p_mobile), ''), mobile),
    employee_code = COALESCE(NULLIF(TRIM(p_employee_code), ''), employee_code),
    id_number = CASE WHEN p_id_number IS NOT NULL THEN NULLIF(TRIM(p_id_number), '') ELSE id_number END,
    id_expiry_date = COALESCE(p_id_expiry_date, id_expiry_date),
    date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
    joining_date = COALESCE(p_joining_date, joining_date),
    basic_salary = COALESCE(p_basic_salary, basic_salary),
    allowance = COALESCE(p_allowance, allowance),
    is_active = COALESCE(p_is_active, is_active),
    discontinuation_date = CASE
      WHEN p_is_active = false THEN COALESCE(p_discontinuation_date, discontinuation_date, CURRENT_DATE)
      WHEN p_is_active = true THEN NULL
      ELSE discontinuation_date
    END,
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_employee_id;
END;
$$;

-- ─── Account RPCs: enforce unique display names ───────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_account(
  p_account_type_id uuid,
  p_name text,
  p_code text,
  p_description text DEFAULT '',
  p_store_id uuid DEFAULT NULL,
  p_opening_balance numeric DEFAULT 0,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := TRIM(p_name);
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NULLIF(v_name, '') IS NULL THEN
    RAISE EXCEPTION 'Account name is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE lower(trim(a.name)) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'An account with this name already exists.';
  END IF;

  INSERT INTO public.accounts (
    account_type_id, name, code, description, store_id, opening_balance,
    is_system, is_locked, is_active
  )
  VALUES (
    p_account_type_id, v_name, p_code, COALESCE(p_description, ''), p_store_id,
    COALESCE(p_opening_balance, 0), false, false, true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_erp_account(
  p_account_id uuid,
  p_name text,
  p_code text,
  p_description text,
  p_store_id uuid,
  p_opening_balance numeric,
  p_is_active boolean,
  p_updated_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_name text;
BEGIN
  IF NOT public.is_staff_user(p_updated_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_new_name := NULLIF(TRIM(p_name), '');
  IF v_new_name IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE lower(trim(a.name)) = lower(v_new_name)
      AND a.id <> p_account_id
  ) THEN
    RAISE EXCEPTION 'An account with this name already exists.';
  END IF;

  UPDATE public.accounts
  SET
    name = COALESCE(v_new_name, name),
    code = p_code,
    description = COALESCE(p_description, ''),
    store_id = p_store_id,
    opening_balance = COALESCE(p_opening_balance, opening_balance),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
END;
$$;

COMMIT;
