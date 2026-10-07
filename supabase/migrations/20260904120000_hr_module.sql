-- HR module: employees, salary ledger, payments, bulk payments, pay slips,
-- opening balances, and accounting integration (Winner ERP parity).

BEGIN;

-- ─── System GL accounts for payroll ─────────────────────────────────────────

INSERT INTO public.accounts (account_type_id, name, description, code, is_system, is_locked)
SELECT t.id, v.name, v.description, v.code, true, true
FROM (
  VALUES
    ('Other Current Liability', 'Salaries Payable', 'Outstanding salary owed to employees', 'SALARIES_PAYABLE'),
    ('Other Current Assets', 'Employee Advances', 'Salary advances recoverable from employees', 'EMPLOYEE_ADVANCES'),
    ('Expense', 'Salary Expense', 'Payroll salary expense', 'SALARY_EXPENSE')
) AS v(type_name, name, description, code)
JOIN public.account_types t ON t.name = v.type_name
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.code = v.code);

-- ─── Document sequences ─────────────────────────────────────────────────────

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES
  ('employee', 'EMP', 1, 0),
  ('salary_payment', 'SP', 1, 0),
  ('salary_bulk_payment', 'SBP', 1, 0),
  ('pay_slip', 'PS', 1, 0),
  ('employee_opening_balance', 'EOB', 1, 0)
ON CONFLICT (document_type) DO NOTHING;

-- ─── Posting rules ──────────────────────────────────────────────────────────

INSERT INTO public.erp_posting_rules (event_type, description, is_enabled, is_winner_exact, mapping_notes)
VALUES
  (
    'salary_payment',
    'Salary payment to employee',
    true,
    false,
    'DR Salaries Payable (salary portion), DR Employee Advances (advance recovery), CR Cash/Bank (total cash paid). Excess over payable posts as DR Employee Advances (new advance).'
  ),
  (
    'salary_accrual',
    'Monthly salary accrual (pay slip)',
    true,
    false,
    'DR Salary Expense, CR Salaries Payable (net salary for period).'
  ),
  (
    'employee_opening_balance',
    'Employee opening salary balance',
    true,
    false,
    'DR Salaries Payable, CR Retained Earning (initial subledger balance at migration).'
  )
ON CONFLICT (event_type) DO NOTHING;

-- ─── Employees ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  employee_code text,
  full_name text NOT NULL,
  mobile text NOT NULL DEFAULT '',
  id_number text,
  id_expiry_date date,
  date_of_birth date,
  joining_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  discontinuation_date date,
  basic_salary numeric NOT NULL DEFAULT 0,
  allowance numeric NOT NULL DEFAULT 0,
  net_salary numeric GENERATED ALWAYS AS (basic_salary + allowance) STORED,
  salary_balance numeric NOT NULL DEFAULT 0,
  advance_balance numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_employees_number_unique UNIQUE (employee_number),
  CONSTRAINT erp_employees_salary_nonneg CHECK (basic_salary >= 0 AND allowance >= 0),
  CONSTRAINT erp_employees_balance_nonneg CHECK (salary_balance >= 0 AND advance_balance >= 0)
);

CREATE INDEX IF NOT EXISTS erp_employees_store_idx ON public.erp_employees (store_id);
CREATE INDEX IF NOT EXISTS erp_employees_active_idx ON public.erp_employees (is_active);
CREATE INDEX IF NOT EXISTS erp_employees_name_idx ON public.erp_employees (full_name);

-- ─── Employee salary ledger (statement) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_employee_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.erp_employees (id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type text NOT NULL CHECK (
    entry_type IN ('salary_accrual', 'payment', 'opening_balance', 'advance_recovery')
  ),
  description text NOT NULL DEFAULT '',
  salary_credit numeric NOT NULL DEFAULT 0,
  payment_debit numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  source_entity_type text,
  source_entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_employee_ledger_amounts_nonneg CHECK (
    salary_credit >= 0 AND payment_debit >= 0
  )
);

CREATE INDEX IF NOT EXISTS erp_employee_ledger_employee_idx
  ON public.erp_employee_ledger (employee_id, entry_date DESC);

-- ─── Salary bulk payment header ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_salary_bulk_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_number text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode text NOT NULL DEFAULT 'Cash',
  paid_through_account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  reference text,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_salary_bulk_payments_number_unique UNIQUE (bulk_number)
);

CREATE INDEX IF NOT EXISTS erp_salary_bulk_payments_store_idx
  ON public.erp_salary_bulk_payments (store_id, payment_date DESC);

-- ─── Salary payments ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.erp_employees (id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode text NOT NULL DEFAULT 'Cash',
  paid_through_account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  total_paid_amount numeric NOT NULL DEFAULT 0,
  salary_payment_amount numeric NOT NULL DEFAULT 0,
  advance_payment_amount numeric NOT NULL DEFAULT 0,
  advance_recovery_amount numeric NOT NULL DEFAULT 0,
  advance_balance_after numeric NOT NULL DEFAULT 0,
  bulk_payment_id uuid REFERENCES public.erp_salary_bulk_payments (id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_salary_payments_number_unique UNIQUE (payment_number),
  CONSTRAINT erp_salary_payments_amount_positive CHECK (total_paid_amount > 0)
);

CREATE INDEX IF NOT EXISTS erp_salary_payments_employee_idx
  ON public.erp_salary_payments (employee_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS erp_salary_payments_store_idx
  ON public.erp_salary_payments (store_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS erp_salary_payments_bulk_idx
  ON public.erp_salary_payments (bulk_payment_id);

-- ─── Pay slips ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_pay_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_number text NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.erp_employees (id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year integer NOT NULL CHECK (period_year >= 2000),
  period_label text NOT NULL DEFAULT '',
  from_date date NOT NULL,
  to_date date NOT NULL,
  days_count integer NOT NULL DEFAULT 30,
  basic_salary numeric NOT NULL DEFAULT 0,
  allowance numeric NOT NULL DEFAULT 0,
  net_salary numeric NOT NULL DEFAULT 0,
  ledger_entry_id uuid REFERENCES public.erp_employee_ledger (id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_pay_slips_number_unique UNIQUE (payslip_number),
  CONSTRAINT erp_pay_slips_period_unique UNIQUE (employee_id, period_month, period_year),
  CONSTRAINT erp_pay_slips_dates_check CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS erp_pay_slips_store_period_idx
  ON public.erp_pay_slips (store_id, period_year DESC, period_month DESC);

-- ─── Employee opening balance batches ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_employee_opening_balance_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  total_amount numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_employee_opening_balance_batches_number_unique UNIQUE (batch_number)
);

CREATE TABLE IF NOT EXISTS public.erp_employee_opening_balance_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.erp_employee_opening_balance_batches (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.erp_employees (id) ON DELETE RESTRICT,
  opening_balance numeric NOT NULL DEFAULT 0,
  joining_date date,
  CONSTRAINT erp_employee_opening_balance_lines_unique UNIQUE (batch_id, employee_id),
  CONSTRAINT erp_employee_opening_balance_lines_amount_nonneg CHECK (opening_balance >= 0)
);

-- ─── Updated-at trigger ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_erp_employees_updated_at ON public.erp_employees;
CREATE TRIGGER trg_erp_employees_updated_at
  BEFORE UPDATE ON public.erp_employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── Internal: append employee ledger entry ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.append_erp_employee_ledger(
  p_employee_id uuid,
  p_store_id uuid,
  p_entry_date date,
  p_entry_type text,
  p_description text,
  p_salary_credit numeric DEFAULT 0,
  p_payment_debit numeric DEFAULT 0,
  p_source_entity_type text DEFAULT NULL,
  p_source_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_ledger_id uuid;
BEGIN
  SELECT salary_balance INTO v_balance
  FROM public.erp_employees
  WHERE id = p_employee_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  v_balance := COALESCE(v_balance, 0) + COALESCE(p_salary_credit, 0) - COALESCE(p_payment_debit, 0);

  INSERT INTO public.erp_employee_ledger (
    employee_id, store_id, entry_date, entry_type, description,
    salary_credit, payment_debit, balance_after,
    source_entity_type, source_entity_id
  )
  VALUES (
    p_employee_id, p_store_id, p_entry_date, p_entry_type, p_description,
    COALESCE(p_salary_credit, 0), COALESCE(p_payment_debit, 0), v_balance,
    p_source_entity_type, p_source_entity_id
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.erp_employees
  SET salary_balance = v_balance, updated_at = now()
  WHERE id = p_employee_id;

  RETURN v_ledger_id;
END;
$$;

-- ─── Create / update employee ─────────────────────────────────────────────────

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
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  IF NULLIF(TRIM(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;

  IF NULLIF(TRIM(p_mobile), '') IS NULL THEN
    RAISE EXCEPTION 'Mobile is required';
  END IF;

  IF p_joining_date IS NULL THEN
    RAISE EXCEPTION 'Joining date is required';
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
    TRIM(p_full_name), TRIM(p_mobile),
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

  UPDATE public.erp_employees
  SET
    store_id = COALESCE(p_store_id, store_id),
    full_name = COALESCE(NULLIF(TRIM(p_full_name), ''), full_name),
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

-- ─── Record salary payment (allocates payable vs advance) ─────────────────────

CREATE OR REPLACE FUNCTION public.record_erp_salary_payment(
  p_employee_id uuid,
  p_store_id uuid,
  p_payment_date date,
  p_total_paid numeric,
  p_payment_mode text DEFAULT 'Cash',
  p_paid_through_account_id uuid DEFAULT NULL,
  p_advance_recovery numeric DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_bulk_payment_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_payment_number text;
  v_salary_balance numeric;
  v_advance_balance numeric;
  v_recovery numeric;
  v_cash_paid numeric;
  v_salary_portion numeric;
  v_advance_portion numeric;
  v_advance_after numeric;
  v_employee_name text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_total_paid IS NULL OR p_total_paid <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  SELECT salary_balance, advance_balance, full_name
  INTO v_salary_balance, v_advance_balance, v_employee_name
  FROM public.erp_employees
  WHERE id = p_employee_id AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found for this store';
  END IF;

  v_recovery := LEAST(COALESCE(p_advance_recovery, 0), COALESCE(v_advance_balance, 0), p_total_paid);
  v_cash_paid := p_total_paid;

  -- Apply cash to salary payable first; excess becomes new advance
  v_salary_portion := LEAST(v_cash_paid, COALESCE(v_salary_balance, 0));
  v_advance_portion := GREATEST(0, v_cash_paid - v_salary_portion);

  v_advance_after := COALESCE(v_advance_balance, 0) - v_recovery + v_advance_portion;

  SELECT t.out_id, t.out_ref INTO v_payment_id, v_payment_number
  FROM public.erp_next_document_ref('salary_payment') AS t;

  INSERT INTO public.erp_salary_payments (
    id, payment_number, employee_id, store_id, payment_date, payment_mode,
    paid_through_account_id, total_paid_amount, salary_payment_amount,
    advance_payment_amount, advance_recovery_amount, advance_balance_after,
    bulk_payment_id, notes, created_by
  )
  VALUES (
    v_payment_id, v_payment_number, p_employee_id, p_store_id, p_payment_date,
    COALESCE(p_payment_mode, 'Cash'), p_paid_through_account_id, p_total_paid,
    v_salary_portion, v_advance_portion, v_recovery, v_advance_after,
    p_bulk_payment_id, p_notes, p_created_by
  );

  IF v_salary_portion > 0 OR v_recovery > 0 THEN
    PERFORM public.append_erp_employee_ledger(
      p_employee_id, p_store_id, p_payment_date, 'payment',
      'PAYMENT',
      0,
      v_salary_portion + v_recovery,
      'salary_payment',
      v_payment_id
    );
  END IF;

  UPDATE public.erp_employees
  SET
    advance_balance = v_advance_after,
    updated_at = now()
  WHERE id = p_employee_id;

  RETURN v_payment_id;
END;
$$;

-- ─── Bulk salary payment ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_erp_salary_bulk_payment(
  p_store_id uuid,
  p_payment_date date,
  p_payment_mode text,
  p_lines jsonb,
  p_paid_through_account_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bulk_id uuid;
  v_bulk_number text;
  v_batch_ref text;
  v_row jsonb;
  v_payment_id uuid;
  v_payment_ids uuid[] := '{}';
  v_total numeric := 0;
  v_amount numeric;
  v_recovery numeric;
  v_employee_id uuid;
  v_comment text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one payment line is required';
  END IF;

  v_batch_ref := COALESCE(NULLIF(TRIM(p_reference), ''), 'BULK:' || gen_random_uuid()::text);

  SELECT t.out_id, t.out_ref INTO v_bulk_id, v_bulk_number
  FROM public.erp_next_document_ref('salary_bulk_payment') AS t;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_employee_id := (v_row ->> 'employee_id')::uuid;
    v_amount := COALESCE((v_row ->> 'total_payment')::numeric, 0);
    IF v_employee_id IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Each line requires employee_id and positive total_payment';
    END IF;
    v_total := v_total + v_amount;
  END LOOP;

  INSERT INTO public.erp_salary_bulk_payments (
    id, bulk_number, store_id, payment_date, payment_mode,
    paid_through_account_id, total_amount, notes, reference, created_by
  )
  VALUES (
    v_bulk_id, v_bulk_number, p_store_id, p_payment_date,
    COALESCE(p_payment_mode, 'Cash'), p_paid_through_account_id,
    v_total, p_notes, v_batch_ref, p_created_by
  );

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_employee_id := (v_row ->> 'employee_id')::uuid;
    v_amount := (v_row ->> 'total_payment')::numeric;
    v_recovery := COALESCE((v_row ->> 'payment_from_advance')::numeric, 0);
    v_comment := NULLIF(v_row ->> 'comment', '');

    v_payment_id := public.record_erp_salary_payment(
      v_employee_id, p_store_id, p_payment_date, v_amount,
      p_payment_mode, p_paid_through_account_id, v_recovery,
      v_comment, v_bulk_id, p_created_by
    );
    v_payment_ids := array_append(v_payment_ids, v_payment_id);
  END LOOP;

  RETURN jsonb_build_object(
    'bulk_id', v_bulk_id,
    'bulk_number', v_bulk_number,
    'reference', v_batch_ref,
    'payment_ids', to_jsonb(v_payment_ids),
    'total_amount', v_total
  );
END;
$$;

-- ─── Employee opening balances ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_erp_employee_opening_balances(
  p_store_id uuid,
  p_entry_date date,
  p_lines jsonb,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_batch_number text;
  v_row jsonb;
  v_total numeric := 0;
  v_employee_id uuid;
  v_amount numeric;
  v_ledger_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one employee line is required';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_batch_id, v_batch_number
  FROM public.erp_next_document_ref('employee_opening_balance') AS t;

  INSERT INTO public.erp_employee_opening_balance_batches (
    id, batch_number, store_id, entry_date, notes, created_by
  )
  VALUES (v_batch_id, v_batch_number, p_store_id, p_entry_date, p_notes, p_created_by);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_employee_id := (v_row ->> 'employee_id')::uuid;
    v_amount := COALESCE((v_row ->> 'opening_balance')::numeric, 0);

    IF v_employee_id IS NULL THEN
      RAISE EXCEPTION 'Each line requires employee_id';
    END IF;

    INSERT INTO public.erp_employee_opening_balance_lines (
      batch_id, employee_id, opening_balance,
      joining_date
    )
    VALUES (
      v_batch_id, v_employee_id, v_amount,
      NULLIF(v_row ->> 'joining_date', '')::date
    );

    IF v_amount > 0 THEN
      v_ledger_id := public.append_erp_employee_ledger(
        v_employee_id, p_store_id, p_entry_date, 'opening_balance',
        'Opening balance',
        v_amount, 0,
        'employee_opening_balance', v_batch_id
      );

      IF public.is_posting_enabled('employee_opening_balance') THEN
        PERFORM public.post_journal_for_employee_opening_balance(v_batch_id, v_employee_id, p_created_by);
      END IF;
    END IF;

    v_total := v_total + v_amount;
  END LOOP;

  UPDATE public.erp_employee_opening_balance_batches
  SET total_amount = v_total
  WHERE id = v_batch_id;

  RETURN v_batch_id;
END;
$$;

-- ─── Generate pay slips for a month ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_erp_pay_slips(
  p_store_id uuid,
  p_period_month integer,
  p_period_year integer,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_to date;
  v_days integer;
  v_label text;
  v_emp record;
  v_payslip_id uuid;
  v_payslip_number text;
  v_ledger_id uuid;
  v_journal_id uuid;
  v_created_ids uuid[] := '{}';
  v_month_names text[] := ARRAY[
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  v_from := COALESCE(p_from_date, make_date(p_period_year, p_period_month, 1));
  v_to := COALESCE(p_to_date, (date_trunc('month', v_from) + interval '1 month - 1 day')::date);
  v_days := (v_to - v_from) + 1;
  v_label := v_month_names[p_period_month] || ' - ' || p_period_year;

  FOR v_emp IN
    SELECT e.*
    FROM public.erp_employees e
    WHERE e.store_id = p_store_id
      AND e.is_active = true
      AND (p_employee_id IS NULL OR e.id = p_employee_id)
      AND e.joining_date <= v_to
      AND NOT EXISTS (
        SELECT 1 FROM public.erp_pay_slips ps
        WHERE ps.employee_id = e.id
          AND ps.period_month = p_period_month
          AND ps.period_year = p_period_year
      )
  LOOP
    SELECT t.out_id, t.out_ref INTO v_payslip_id, v_payslip_number
    FROM public.erp_next_document_ref('pay_slip') AS t;

    v_ledger_id := public.append_erp_employee_ledger(
      v_emp.id, p_store_id, v_to, 'salary_accrual',
      'SALARY: ' || v_label,
      v_emp.net_salary, 0,
      'pay_slip', v_payslip_id
    );

    INSERT INTO public.erp_pay_slips (
      id, payslip_number, employee_id, store_id,
      period_month, period_year, period_label,
      from_date, to_date, days_count,
      basic_salary, allowance, net_salary,
      ledger_entry_id, created_by
    )
    VALUES (
      v_payslip_id, v_payslip_number, v_emp.id, p_store_id,
      p_period_month, p_period_year, v_label,
      v_from, v_to, v_days,
      v_emp.basic_salary, v_emp.allowance, v_emp.net_salary,
      v_ledger_id, p_created_by
    );

    IF public.is_posting_enabled('salary_accrual') THEN
      v_journal_id := public.post_journal_for_salary_accrual(v_payslip_id, p_created_by);
      UPDATE public.erp_pay_slips SET journal_entry_id = v_journal_id WHERE id = v_payslip_id;
    END IF;

    v_created_ids := array_append(v_created_ids, v_payslip_id);
  END LOOP;

  RETURN jsonb_build_object(
    'created_count', COALESCE(array_length(v_created_ids, 1), 0),
    'payslip_ids', to_jsonb(v_created_ids)
  );
END;
$$;

-- ─── Accounting: salary payment journal ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_journal_for_salary_payment(
  p_payment_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_cash_account uuid;
  v_total numeric;
  v_salary_portion numeric;
  v_advance_portion numeric;
  v_recovery numeric;
  v_lines jsonb := '[]'::jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'salary_payment'
    AND source_entity_id = p_payment_id
    AND status = 'posted';

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('salary_payment') THEN
    RETURN NULL;
  END IF;

  SELECT
    store_id, payment_date, payment_number, paid_through_account_id,
    total_paid_amount, salary_payment_amount, advance_payment_amount, advance_recovery_amount
  INTO
    v_store_id, v_date, v_number, v_cash_account,
    v_total, v_salary_portion, v_advance_portion, v_recovery
  FROM public.erp_salary_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salary payment not found';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  IF v_cash_account IS NULL THEN
    v_cash_account := public.get_account_by_code('CASH');
  END IF;

  IF v_salary_portion > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', 'SALARIES_PAYABLE',
        'debit', v_salary_portion,
        'description', 'Salary payable settlement'
      )
    );
  END IF;

  IF v_recovery > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', 'EMPLOYEE_ADVANCES',
        'debit', v_recovery,
        'description', 'Advance recovery'
      )
    );
  END IF;

  IF v_advance_portion > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', 'EMPLOYEE_ADVANCES',
        'debit', v_advance_portion,
        'description', 'New salary advance'
      )
    );
  END IF;

  IF v_total > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', v_cash_account,
        'credit', v_total,
        'description', 'Salary payment ' || v_number
      )
    );
  END IF;

  RETURN public.create_posted_journal_entry(
    v_date,
    'Salary payment ' || v_number,
    v_store_id,
    'salary_payment',
    p_payment_id,
    v_lines,
    p_actor
  );
END;
$$;

-- ─── Accounting: salary accrual journal ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_journal_for_salary_accrual(
  p_payslip_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_amount numeric;
  v_lines jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'salary_accrual'
    AND source_entity_id = p_payslip_id
    AND status = 'posted';

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('salary_accrual') THEN
    RETURN NULL;
  END IF;

  SELECT store_id, to_date, payslip_number, net_salary
  INTO v_store_id, v_date, v_number, v_amount
  FROM public.erp_pay_slips
  WHERE id = p_payslip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pay slip not found';
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', 'SALARY_EXPENSE',
      'debit', v_amount,
      'description', 'Salary accrual ' || v_number
    ),
    jsonb_build_object(
      'account_code', 'SALARIES_PAYABLE',
      'credit', v_amount,
      'description', 'Salary accrual ' || v_number
    )
  );

  RETURN public.create_posted_journal_entry(
    v_date,
    'Salary accrual ' || v_number,
    v_store_id,
    'salary_accrual',
    p_payslip_id,
    v_lines,
    p_actor
  );
END;
$$;

-- ─── Accounting: employee opening balance journal ─────────────────────────────

CREATE OR REPLACE FUNCTION public.post_journal_for_employee_opening_balance(
  p_batch_id uuid,
  p_employee_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_amount numeric;
  v_employee_name text;
  v_lines jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'employee_opening_balance'
    AND source_entity_id = p_batch_id
    AND description LIKE '%' || p_employee_id::text || '%'
    AND status = 'posted';

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('employee_opening_balance') THEN
    RETURN NULL;
  END IF;

  SELECT b.store_id, b.entry_date, b.batch_number, l.opening_balance, e.full_name
  INTO v_store_id, v_date, v_number, v_amount, v_employee_name
  FROM public.erp_employee_opening_balance_batches b
  JOIN public.erp_employee_opening_balance_lines l ON l.batch_id = b.id
  JOIN public.erp_employees e ON e.id = l.employee_id
  WHERE b.id = p_batch_id AND l.employee_id = p_employee_id;

  IF NOT FOUND OR v_amount IS NULL OR v_amount <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', 'RETAINED_EARNING',
      'debit', v_amount,
      'description', 'Employee opening balance — ' || v_employee_name
    ),
    jsonb_build_object(
      'account_code', 'SALARIES_PAYABLE',
      'credit', v_amount,
      'description', 'Employee opening balance — ' || v_employee_name
    )
  );

  RETURN public.create_posted_journal_entry(
    v_date,
    'Employee opening balance ' || v_number || ' (' || v_employee_name || ')',
    v_store_id,
    'employee_opening_balance',
    p_batch_id,
    v_lines,
    p_actor
  );
END;
$$;

-- ─── Delete salary payment (reverses ledger + voids journal) ──────────────────

CREATE OR REPLACE FUNCTION public.delete_erp_salary_payment(
  p_payment_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
BEGIN
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_payment
  FROM public.erp_salary_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salary payment not found';
  END IF;

  IF v_payment.bulk_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete individual payments from a bulk batch';
  END IF;

  PERFORM public.require_store_access(v_payment.store_id, p_actor);

  PERFORM public.void_journals_for_entity('salary_payment', p_payment_id);

  UPDATE public.erp_employees e
  SET
    salary_balance = e.salary_balance + v_payment.salary_payment_amount + v_payment.advance_recovery_amount,
    advance_balance = e.advance_balance - v_payment.advance_payment_amount + v_payment.advance_recovery_amount,
    updated_at = now()
  WHERE e.id = v_payment.employee_id;

  DELETE FROM public.erp_employee_ledger
  WHERE source_entity_type = 'salary_payment' AND source_entity_id = p_payment_id;

  DELETE FROM public.erp_salary_payments WHERE id = p_payment_id;
END;
$$;

-- ─── Triggers: auto-post salary payment journals ──────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_salary_payments_post_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.post_journal_for_salary_payment(NEW.id, COALESCE(NEW.created_by, auth.uid()));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_salary_payments_post_journal ON public.erp_salary_payments;
CREATE TRIGGER trg_salary_payments_post_journal
  AFTER INSERT ON public.erp_salary_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_salary_payments_post_journal();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.erp_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_employee_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_salary_bulk_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_pay_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_employee_opening_balance_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_employee_opening_balance_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_employees_staff"
  ON public.erp_employees FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_employee_ledger_staff"
  ON public.erp_employee_ledger FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_salary_payments_staff"
  ON public.erp_salary_payments FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_salary_bulk_payments_staff"
  ON public.erp_salary_bulk_payments FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_pay_slips_staff"
  ON public.erp_pay_slips FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_employee_opening_balance_batches_staff"
  ON public.erp_employee_opening_balance_batches FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_employee_opening_balance_lines_staff"
  ON public.erp_employee_opening_balance_lines FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.create_erp_employee(uuid, text, text, date, numeric, numeric, text, text, date, date, boolean, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_erp_employee(uuid, uuid, text, text, date, numeric, numeric, text, text, date, date, boolean, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_salary_payment(uuid, uuid, date, numeric, text, uuid, numeric, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_salary_bulk_payment(uuid, date, text, jsonb, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_employee_opening_balances(uuid, date, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_erp_pay_slips(uuid, integer, integer, date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_erp_salary_payment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_salary_payment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_salary_accrual(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_employee_opening_balance(uuid, uuid, uuid) TO authenticated;

COMMIT;
