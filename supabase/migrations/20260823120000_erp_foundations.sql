-- ERP extension foundations: org context, item units, accounting references,
-- audit trail, and document sequences. Does not alter inventory/orders RPC flow.

BEGIN;

-- ─── Organization context (company → store) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  tax_id text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_single_default_idx
  ON public.companies (is_default)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  name text NOT NULL,
  code text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  pincode text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stores_company_id_idx ON public.stores (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS stores_single_default_idx
  ON public.stores (is_default)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS public.user_store_access (
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS user_store_access_store_id_idx
  ON public.user_store_access (store_id);

-- ─── Item units (Items → Item Unit) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.item_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  abbreviation text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_units_name_unique UNIQUE (name),
  CONSTRAINT item_units_abbreviation_unique UNIQUE (abbreviation)
);

-- ─── Accounting references (Accounts module) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.account_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_category text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_types_category_check CHECK (
    account_category IN (
      'Assets',
      'Liability',
      'Equity',
      'Income',
      'Expense',
      'AccountsPayable',
      'AccountsRecievable'
    )
  )
);

CREATE INDEX IF NOT EXISTS account_types_category_idx
  ON public.account_types (account_category);

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type_id uuid NOT NULL REFERENCES public.account_types (id) ON DELETE RESTRICT,
  store_id uuid REFERENCES public.stores (id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  code text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS accounts_account_type_id_idx
  ON public.accounts (account_type_id);

CREATE INDEX IF NOT EXISTS accounts_store_id_idx
  ON public.accounts (store_id);

-- ─── Audit trail (activity / compliance) ────────────────────────────────────

-- Legacy DB-SCHEMA used `entity`; align if table already exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'entity'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'entity_type'
  ) THEN
    ALTER TABLE public.audit_logs RENAME COLUMN entity TO entity_type;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx
  ON public.audit_logs (user_id);

CREATE INDEX IF NOT EXISTS audit_logs_store_id_idx
  ON public.audit_logs (store_id);

-- ─── Document numbering (shared across ERP modules) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_document_sequences (
  document_type text PRIMARY KEY,
  prefix text NOT NULL DEFAULT '',
  next_number bigint NOT NULL DEFAULT 1,
  padding integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_document_sequences_padding_check CHECK (padding >= 0)
);

-- ─── Link singleton app settings to default org context ─────────────────────

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS default_company_id uuid REFERENCES public.companies (id),
  ADD COLUMN IF NOT EXISTS default_store_id uuid REFERENCES public.stores (id);

COMMENT ON COLUMN public.app_settings.default_company_id IS
  'Default trading entity for ERP context when no store is explicitly selected.';
COMMENT ON COLUMN public.app_settings.default_store_id IS
  'Default operational store for ERP context and legacy single-store inventory.';

-- ─── updated_at triggers ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_stores_updated_at ON public.stores;
CREATE TRIGGER trg_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_item_units_updated_at ON public.item_units;
CREATE TRIGGER trg_item_units_updated_at
  BEFORE UPDATE ON public.item_units
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_account_types_updated_at ON public.account_types;
CREATE TRIGGER trg_account_types_updated_at
  BEFORE UPDATE ON public.account_types
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts;
CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── Seed default org context ───────────────────────────────────────────────

INSERT INTO public.companies (name, legal_name, is_default)
SELECT 'Default Company', 'Default Company', true
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE is_default = true);

INSERT INTO public.stores (company_id, name, code, is_default)
SELECT c.id, 'Main Store', 'MAIN', true
FROM public.companies c
WHERE c.is_default = true
  AND NOT EXISTS (SELECT 1 FROM public.stores WHERE is_default = true);

UPDATE public.app_settings
SET
  default_company_id = c.id,
  default_store_id = s.id
FROM public.companies c
JOIN public.stores s ON s.company_id = c.id AND s.is_default = true
WHERE c.is_default = true
  AND public.app_settings.id = 1
  AND public.app_settings.default_company_id IS NULL;

-- ─── Seed item units ────────────────────────────────────────────────────────

INSERT INTO public.item_units (name, abbreviation, sort_order)
VALUES
  ('Piece', 'PCS', 1),
  ('Box', 'BOX', 2),
  ('Kilogram', 'KG', 3),
  ('Gram', 'G', 4),
  ('Liter', 'LTR', 5),
  ('Meter', 'M', 6),
  ('Set', 'SET', 7),
  ('Dozen', 'DZ', 8)
ON CONFLICT (name) DO NOTHING;

-- ─── Seed account types (Winner ERP observed categories) ────────────────────

INSERT INTO public.account_types (account_category, name, description, is_system)
SELECT v.account_category, v.name, v.description, true
FROM (
  VALUES
    ('Income', 'Income', 'Income'),
    ('Income', 'Other Income', 'Other Income'),
    ('Expense', 'Expense', 'Expense'),
    ('Expense', 'Cost of Goods Sold', 'Cost of Goods Sold'),
    ('Expense', 'Other Expense', 'Other Expense'),
    ('Assets', 'Cash', 'Cash'),
    ('Assets', 'Bank', 'Bank'),
    ('Equity', 'Equity', 'Owner''s Equity'),
    ('Equity', 'Retained Earning', 'Retained Earning'),
    ('Assets', 'Stock', 'Stock'),
    ('Liability', 'Other Liability', 'Other Liability'),
    ('AccountsPayable', 'Accounts Payable', 'Accounts Payable'),
    ('AccountsRecievable', 'Accounts Recievable', 'Accounts Recievable'),
    ('Liability', 'Credit Card', 'Credit Card'),
    ('Liability', 'Long Term Liability', 'Long Term Liability'),
    ('Liability', 'Overseas Tax Payable', 'Overseas Tax Payable'),
    ('Assets', 'Other Assets', 'Other Assets'),
    ('Assets', 'Other Current Assets', 'Other Current Assets'),
    ('Assets', 'Payment Clearing', 'Payment Clearing'),
    ('Assets', 'Fixed Asset', 'Fixed Asset'),
    ('Liability', 'Other Current Liability', 'Other Current Liability')
) AS v(account_category, name, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.account_types existing
  WHERE existing.name = v.name
    AND existing.account_category = v.account_category
);

-- ─── Seed system ledger accounts ────────────────────────────────────────────

INSERT INTO public.accounts (account_type_id, name, description, code, is_system, is_locked)
SELECT t.id, t.name, t.description, UPPER(REPLACE(t.name, ' ', '_')), true, true
FROM public.account_types t
WHERE t.is_system = true
  AND t.name IN (
    'Cash',
    'Bank',
    'Stock',
    'Accounts Payable',
    'Accounts Recievable',
    'Payment Clearing',
    'Cost of Goods Sold',
    'Income',
    'Retained Earning'
  )
ON CONFLICT (code) DO NOTHING;

-- ─── Seed document sequences (parallel to existing invoice RPC) ─────────────

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES
  ('sales_invoice', 'INV', 1, 0),
  ('sales_order', 'SO', 1, 0),
  ('estimate', 'EST', 1, 0),
  ('credit_note', 'CN', 1, 0),
  ('purchase_bill', 'PB', 1, 0),
  ('purchase_order', 'PO', 1, 0),
  ('vendor_credit', 'VC', 1, 0),
  ('expense', 'EXP', 1, 0),
  ('payment_received', 'PR', 1, 0),
  ('payment_made', 'PM', 1, 0),
  ('stock_adjustment', 'SA', 1, 0),
  ('stock_transfer', 'ST', 1, 0)
ON CONFLICT (document_type) DO NOTHING;

-- ─── RPC: staff check (shared helper) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_staff_user(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.role::text IN ('admin', 'manager')
  );
$$;

-- ─── RPC: org context ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_context(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_company_id uuid;
  v_store record;
  v_company record;
BEGIN
  SELECT usa.store_id
  INTO v_store_id
  FROM public.user_store_access usa
  WHERE usa.user_id = p_user_id
    AND usa.is_default = true
  LIMIT 1;

  IF v_store_id IS NULL THEN
    SELECT s.id, s.company_id
    INTO v_store_id, v_company_id
    FROM public.app_settings a
    JOIN public.stores s ON s.id = a.default_store_id
    WHERE a.id = 1;
  END IF;

  IF v_store_id IS NULL THEN
    SELECT s.id, s.company_id
    INTO v_store_id, v_company_id
    FROM public.stores s
    WHERE s.is_default = true
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL AND v_store_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.stores
    WHERE id = v_store_id;
  END IF;

  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id
    FROM public.companies
    WHERE is_default = true
    LIMIT 1;
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = v_store_id;
  SELECT * INTO v_company FROM public.companies WHERE id = v_company_id;

  RETURN jsonb_build_object(
    'store_id', v_store_id,
    'company_id', v_company_id,
    'store', CASE
      WHEN v_store.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_store.id,
        'name', v_store.name,
        'code', v_store.code,
        'company_id', v_store.company_id
      )
    END,
    'company', CASE
      WHEN v_company.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_company.id,
        'name', v_company.name,
        'legal_name', v_company.legal_name,
        'tax_id', v_company.tax_id
      )
    END
  );
END;
$$;

-- ─── RPC: audit logging ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_store_id uuid := p_store_id;
BEGIN
  IF v_store_id IS NULL THEN
    SELECT (public.get_erp_context(p_user_id) ->> 'store_id')::uuid
    INTO v_store_id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    store_id,
    action,
    entity_type,
    entity_id,
    description,
    metadata,
    old_data,
    new_data
  )
  VALUES (
    p_user_id,
    v_store_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_description,
    COALESCE(p_metadata, '{}'::jsonb),
    p_old_data,
    p_new_data
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── RPC: document sequence (non-invasive; invoices keep generate_invoice_number) ─

CREATE OR REPLACE FUNCTION public.next_erp_document_number(p_document_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.erp_document_sequences%ROWTYPE;
  v_number text;
BEGIN
  UPDATE public.erp_document_sequences
  SET
    next_number = next_number + 1,
    updated_at = now()
  WHERE document_type = p_document_type
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown document type: %', p_document_type;
  END IF;

  IF v_row.padding > 0 THEN
    v_number := v_row.prefix || LPAD((v_row.next_number - 1)::text, v_row.padding, '0');
  ELSE
    v_number := v_row.prefix || (v_row.next_number - 1)::text;
  END IF;

  RETURN v_number;
END;
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_store_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_document_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_staff_select"
  ON public.companies FOR SELECT
  USING (public.is_staff_user());

CREATE POLICY "companies_staff_manage"
  ON public.companies FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "stores_staff_select"
  ON public.stores FOR SELECT
  USING (public.is_staff_user());

CREATE POLICY "stores_staff_manage"
  ON public.stores FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "user_store_access_self_select"
  ON public.user_store_access FOR SELECT
  USING (user_id = auth.uid() OR public.is_staff_user());

CREATE POLICY "user_store_access_staff_manage"
  ON public.user_store_access FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "item_units_staff_select"
  ON public.item_units FOR SELECT
  USING (public.is_staff_user());

CREATE POLICY "item_units_staff_manage"
  ON public.item_units FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "account_types_staff_select"
  ON public.account_types FOR SELECT
  USING (public.is_staff_user());

CREATE POLICY "account_types_staff_manage"
  ON public.account_types FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "accounts_staff_select"
  ON public.accounts FOR SELECT
  USING (public.is_staff_user());

CREATE POLICY "accounts_staff_manage"
  ON public.accounts FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "audit_logs_staff_select"
  ON public.audit_logs FOR SELECT
  USING (public.is_staff_user());

CREATE POLICY "audit_logs_staff_insert"
  ON public.audit_logs FOR INSERT
  WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_document_sequences_staff_select"
  ON public.erp_document_sequences FOR SELECT
  USING (public.is_staff_user());

CREATE POLICY "erp_document_sequences_staff_manage"
  ON public.erp_document_sequences FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

COMMIT;
