-- Salesmen are employees: PIN attribution, salary, payslips, reports, activity logs.
-- Existing erp_salesmen rows are migrated onto erp_employees with the same UUIDs so
-- invoices.sales_person_id / audit_logs.salesman_id keep working.
-- public.erp_salesmen becomes a compatibility VIEW (name, pin, is_active, …)
-- so report SQL that LEFT JOIN erp_salesmen does not need a rewrite.
 
BEGIN;
 
-- ─── 1. Employee salesman columns ───────────────────────────────────────────

ALTER TABLE public.erp_employees
  ADD COLUMN IF NOT EXISTS is_salesman boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sales_pin char(3);

COMMENT ON COLUMN public.erp_employees.is_salesman IS
  'When true, this employee can be attributed on sales invoices/orders via a 3-digit PIN. No portal login.';
COMMENT ON COLUMN public.erp_employees.sales_pin IS
  'Unique 3-digit POS PIN. Required when is_salesman; null otherwise.';

CREATE UNIQUE INDEX IF NOT EXISTS erp_employees_sales_pin_unique
  ON public.erp_employees (sales_pin)
  WHERE sales_pin IS NOT NULL;

CREATE INDEX IF NOT EXISTS erp_employees_is_salesman_idx
  ON public.erp_employees (is_salesman)
  WHERE is_salesman;

-- ─── 2. Migrate existing PIN salesmen onto employees (preserve ids) ─────────

DO $$
DECLARE
  r record;
  v_store_id uuid;
  v_name text;
  v_mobile text;
  v_employee_number text;
BEGIN
  IF to_regclass('public.erp_salesmen') IS NULL THEN
    RETURN;
  END IF;
  -- Skip if erp_salesmen is already the compatibility view.
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'erp_salesmen'
      AND c.relkind = 'v'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_store_id
  FROM public.stores
  WHERE is_default
  ORDER BY created_at
  LIMIT 1;

  IF v_store_id IS NULL THEN
    SELECT id INTO v_store_id
    FROM public.stores
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot migrate salesmen: no store exists. Create a store, then re-run this migration.';
  END IF;

  FOR r IN
    SELECT id, name, phone, pin, is_active, created_at, created_by
    FROM public.erp_salesmen
  LOOP
    v_name := BTRIM(r.name);
    v_mobile := COALESCE(NULLIF(BTRIM(r.phone), ''), '—');

    IF EXISTS (SELECT 1 FROM public.erp_employees e WHERE e.id = r.id) THEN
      UPDATE public.erp_employees
      SET
        is_salesman = true,
        sales_pin = r.pin,
        is_active = r.is_active,
        updated_at = now()
      WHERE id = r.id;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.erp_employees e
      WHERE lower(trim(e.full_name)) = lower(v_name)
    ) THEN
      v_name := v_name || ' (' || r.pin || ')';
    END IF;

    SELECT t.out_ref INTO v_employee_number
    FROM public.erp_next_document_ref('employee') AS t;

    INSERT INTO public.erp_employees (
      id, employee_number, store_id, full_name, mobile,
      joining_date, is_active, basic_salary, allowance,
      notes, created_by, created_at, is_salesman, sales_pin
    )
    VALUES (
      r.id,
      v_employee_number,
      v_store_id,
      v_name,
      v_mobile,
      COALESCE(r.created_at::date, CURRENT_DATE),
      COALESCE(r.is_active, true),
      0,
      0,
      'Migrated from salesman directory. Set salary to include in payroll.',
      r.created_by,
      COALESCE(r.created_at, now()),
      true,
      r.pin
    );
  END LOOP;
END $$;

ALTER TABLE public.erp_employees
  DROP CONSTRAINT IF EXISTS erp_employees_salesman_pin_chk;

ALTER TABLE public.erp_employees
  ADD CONSTRAINT erp_employees_salesman_pin_chk
  CHECK (
    (is_salesman AND sales_pin ~ '^[0-9]{3}$')
    OR (NOT is_salesman AND sales_pin IS NULL)
  );

-- ─── 3. Pin helpers + salesman RPCs on employees ────────────────────────────

CREATE OR REPLACE FUNCTION public.erp_parse_sales_pin(p_pin text)
RETURNS char(3)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_pin text := NULLIF(BTRIM(p_pin), '');
BEGIN
  IF v_pin IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_pin !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 3 digits' USING ERRCODE = '22023';
  END IF;
  RETURN v_pin::char(3);
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_erp_salesman_id(p_salesman_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_salesman_id IS NULL THEN
    RAISE EXCEPTION 'Salesman PIN is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.erp_employees e
    WHERE e.id = p_salesman_id
      AND e.is_salesman
      AND e.is_active
  ) THEN
    RAISE EXCEPTION 'Invalid or inactive salesman' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_erp_salesman_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin char(3);
  v_id uuid;
  v_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_pin := public.erp_parse_sales_pin(p_pin);
  IF v_pin IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT e.id, e.full_name
  INTO v_id, v_name
  FROM public.erp_employees e
  WHERE e.sales_pin = v_pin
    AND e.is_salesman
    AND e.is_active
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'name', v_name);
END;
$$;

DROP FUNCTION IF EXISTS public.create_erp_employee(uuid, text, text, date, numeric, numeric, text, text, date, date, boolean, text, uuid);

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
  p_is_salesman boolean DEFAULT false,
  p_sales_pin text DEFAULT NULL,
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
  v_is_salesman boolean := COALESCE(p_is_salesman, false);
  v_pin char(3);
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

  IF v_is_salesman THEN
    v_pin := public.erp_parse_sales_pin(p_sales_pin);
    IF v_pin IS NULL THEN
      RAISE EXCEPTION 'Salesman PIN is required' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.erp_employees e WHERE e.sales_pin = v_pin
    ) THEN
      RAISE EXCEPTION 'This PIN is already assigned to another employee.' USING ERRCODE = '23505';
    END IF;
  ELSE
    v_pin := NULL;
  END IF;

  SELECT t.out_id, t.out_ref INTO v_employee_id, v_employee_number
  FROM public.erp_next_document_ref('employee') AS t;

  INSERT INTO public.erp_employees (
    id, employee_number, store_id, employee_code, full_name, mobile,
    id_number, id_expiry_date, date_of_birth, joining_date, is_active,
    basic_salary, allowance, notes, created_by, is_salesman, sales_pin
  )
  VALUES (
    v_employee_id, v_employee_number, p_store_id, NULLIF(TRIM(p_employee_code), ''),
    v_name, TRIM(p_mobile),
    NULLIF(TRIM(p_id_number), ''), p_id_expiry_date, p_date_of_birth,
    p_joining_date, COALESCE(p_is_active, true),
    COALESCE(p_basic_salary, 0), COALESCE(p_allowance, 0),
    p_notes, p_created_by, v_is_salesman, v_pin
  );

  RETURN v_employee_id;
END;
$$;

DROP FUNCTION IF EXISTS public.update_erp_employee(uuid, uuid, text, text, date, numeric, numeric, text, text, date, date, boolean, date, text, uuid);

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
  p_is_salesman boolean DEFAULT NULL,
  p_sales_pin text DEFAULT NULL,
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
  v_is_salesman boolean;
  v_existing_pin char(3);
  v_pin char(3);
BEGIN
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, is_salesman, sales_pin
  INTO v_store_id, v_is_salesman, v_existing_pin
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

  v_is_salesman := COALESCE(p_is_salesman, v_is_salesman);
  IF v_is_salesman THEN
    v_pin := COALESCE(public.erp_parse_sales_pin(p_sales_pin), v_existing_pin);
    IF v_pin IS NULL THEN
      RAISE EXCEPTION 'Salesman PIN is required' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.erp_employees e
      WHERE e.sales_pin = v_pin
        AND e.id <> p_employee_id
    ) THEN
      RAISE EXCEPTION 'This PIN is already assigned to another employee.' USING ERRCODE = '23505';
    END IF;
  ELSE
    v_pin := NULL;
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
    is_salesman = v_is_salesman,
    sales_pin = v_pin,
    updated_at = now()
  WHERE id = p_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_salesman(
  p_name text,
  p_pin text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_store_id
  FROM public.stores
  WHERE is_default
  ORDER BY created_at
  LIMIT 1;

  IF v_store_id IS NULL THEN
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Create a store before adding a salesman employee' USING ERRCODE = '22023';
  END IF;

  v_id := public.create_erp_employee(
    v_store_id,
    p_name,
    COALESCE(NULLIF(BTRIM(p_phone), ''), '—'),
    CURRENT_DATE,
    0,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    true,
    NULL,
    true,
    p_pin,
    auth.uid()
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_erp_salesman(
  p_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.update_erp_employee(
    p_id,
    NULL,
    p_name,
    p_phone,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    p_is_active,
    NULL,
    NULL,
    true,
    NULL,
    auth.uid()
  );
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
BEGIN
  PERFORM public.update_erp_employee(
    p_id,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    true,
    p_pin,
    auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_erp_employee(uuid, text, text, date, numeric, numeric, text, text, date, date, boolean, text, boolean, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_erp_employee(uuid, uuid, text, text, date, numeric, numeric, text, text, date, date, boolean, date, text, boolean, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_erp_salesman_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_salesman(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_erp_salesman(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_erp_salesman_pin(uuid, text) TO authenticated;

-- ─── 4. Repoint FKs from erp_salesmen → erp_employees, then replace table ───

DO $$
DECLARE
  r record;
  v_def text;
BEGIN
  IF to_regclass('public.erp_salesmen') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'erp_salesmen' AND c.relkind = 'v'
  ) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _erp_salesmen_fks ON COMMIT DROP AS
  SELECT
    n.nspname AS schema_name,
    rel.relname AS table_name,
    c.conname,
    pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE c.contype = 'f'
    AND c.confrelid = 'public.erp_salesmen'::regclass;

  FOR r IN SELECT * FROM _erp_salesmen_fks LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I',
      r.schema_name, r.table_name, r.conname
    );
  END LOOP;

  DROP POLICY IF EXISTS erp_salesmen_select_staff ON public.erp_salesmen;
  DROP POLICY IF EXISTS erp_salesmen_manage_super_admin ON public.erp_salesmen;
  DROP POLICY IF EXISTS "erp_salesmen_select_staff" ON public.erp_salesmen;
  DROP POLICY IF EXISTS "erp_salesmen_manage_super_admin" ON public.erp_salesmen;

  -- Views (ai_v_invoices, ai_v_invoice_lines, …) depend on the table; CASCADE
  -- drops those views. Recreated below after the compatibility view exists.
  DROP TABLE public.erp_salesmen CASCADE;

  FOR r IN SELECT * FROM _erp_salesmen_fks LOOP
    v_def := replace(replace(r.def, 'public.erp_salesmen', 'public.erp_employees'), 'erp_salesmen', 'erp_employees');
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
      r.schema_name, r.table_name, r.conname, v_def
    );
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.erp_salesmen
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.full_name AS name,
  NULL::text AS email,
  NULLIF(e.mobile, '—') AS phone,
  e.sales_pin AS pin,
  e.is_active,
  e.created_at,
  e.updated_at,
  e.created_by
FROM public.erp_employees e
WHERE e.is_salesman;

COMMENT ON VIEW public.erp_salesmen IS
  'Compatibility view of salesman employees (is_salesman). FKs point at erp_employees.';

GRANT SELECT ON public.erp_salesmen TO authenticated;

CREATE OR REPLACE VIEW public.ai_v_invoices
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.invoice_number,
  i.status,
  i.source,
  i.issued_at,
  i.created_at,
  i.due_date,
  i.subtotal,
  i.gst_amount,
  i.discount,
  i.total_amount,
  i.amount_paid,
  i.balance_due,
  i.store_id,
  s.name AS store_name,
  i.user_id AS customer_id,
  COALESCE(c.company_name, c.contact_display_name, c.name) AS customer_name,
  i.sales_person_id AS salesman_id,
  COALESCE(sp.name, 'Unassigned') AS salesman_name
FROM public.invoices i
LEFT JOIN public.users c ON c.id = i.user_id
LEFT JOIN public.erp_salesmen sp ON sp.id = i.sales_person_id
LEFT JOIN public.stores s ON s.id = i.store_id;

CREATE OR REPLACE VIEW public.ai_v_invoice_lines
WITH (security_invoker = true) AS
SELECT
  li.id AS line_id,
  li.invoice_id,
  i.invoice_number,
  i.issued_at,
  i.created_at,
  i.status AS invoice_status,
  COALESCE(c.company_name, c.contact_display_name, c.name) AS customer_name,
  COALESCE(sp.name, 'Unassigned') AS salesman_name,
  li.product_id,
  li.product_name,
  li.quantity,
  li.unit_price,
  li.total_amount AS line_total,
  s.name AS store_name
FROM public.invoice_items li
JOIN public.invoices i ON i.id = li.invoice_id
LEFT JOIN public.users c ON c.id = i.user_id
LEFT JOIN public.erp_salesmen sp ON sp.id = i.sales_person_id
LEFT JOIN public.stores s ON s.id = i.store_id;

GRANT SELECT ON public.ai_v_invoices, public.ai_v_invoice_lines TO authenticated;

COMMIT;
