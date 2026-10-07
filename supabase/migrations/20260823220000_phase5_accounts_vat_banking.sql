-- Phase 5: Accounts, Journal, VAT, Banking, Fixed Assets, Financial Integration
-- Additive only — Phases 1–4 tables unchanged except extensions and RPC hooks.

-- ─── Account extensions ──────────────────  ─────────────────────────────────────

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.accounts.opening_balance IS
  'Opening GL balance; current balance = opening + posted journal debits - credits.';

-- Protect locked system accounts
CREATE OR REPLACE FUNCTION public.accounts_protect_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_locked THEN
    RAISE EXCEPTION 'Cannot delete locked system account';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_locked THEN
    IF OLD.code IS DISTINCT FROM NEW.code
      OR OLD.account_type_id IS DISTINCT FROM NEW.account_type_id
      OR OLD.is_system IS DISTINCT FROM NEW.is_system
      OR OLD.is_locked IS DISTINCT FROM NEW.is_locked THEN
      RAISE EXCEPTION 'Cannot modify core fields on locked system account';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_protect_locked ON public.accounts;
CREATE TRIGGER trg_accounts_protect_locked
  BEFORE UPDATE OR DELETE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.accounts_protect_locked();

-- Overseas tax payable ledger (reference-backed type exists in Phase 1 seeds)
INSERT INTO public.accounts (account_type_id, name, description, code, is_system, is_locked)
SELECT t.id, 'Overseas Tax Payable', 'Overseas Tax Payable', 'OVERSEAS_TAX_PAYABLE', true, true
FROM public.account_types t
WHERE t.name = 'Overseas Tax Payable' AND t.account_category = 'Liability'
ON CONFLICT (code) DO NOTHING;

-- ─── Journal architecture ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number text NOT NULL,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL DEFAULT '',
  store_id uuid REFERENCES public.stores (id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  source_entity_type text,
  source_entity_id uuid,
  status text NOT NULL DEFAULT 'posted',
  total_debit numeric NOT NULL DEFAULT 0,
  total_credit numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_entries_status_check CHECK (status IN ('draft', 'posted')),
  CONSTRAINT journal_entries_totals_balanced CHECK (total_debit = total_credit),
  CONSTRAINT journal_entries_number_unique UNIQUE (journal_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_source_posted_unique
  ON public.journal_entries (source_entity_type, source_entity_id)
  WHERE source_entity_id IS NOT NULL AND status = 'posted';

CREATE INDEX IF NOT EXISTS journal_entries_transaction_date_idx
  ON public.journal_entries (transaction_date DESC);

CREATE INDEX IF NOT EXISTS journal_entries_store_id_idx
  ON public.journal_entries (store_id);

CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  debit_amount numeric NOT NULL DEFAULT 0,
  credit_amount numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  line_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_entry_lines_amount_check CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0)
  )
);

CREATE INDEX IF NOT EXISTS journal_entry_lines_journal_idx
  ON public.journal_entry_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS journal_entry_lines_account_idx
  ON public.journal_entry_lines (account_id);

-- Configurable posting rules (architecture; mappings not Winner-exact unless noted)
CREATE TABLE IF NOT EXISTS public.erp_posting_rules (
  event_type text PRIMARY KEY,
  description text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  is_winner_exact boolean NOT NULL DEFAULT false,
  mapping_notes text NOT NULL DEFAULT '',
  mapping_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.erp_posting_rules (event_type, description, is_enabled, is_winner_exact, mapping_notes)
VALUES
  ('invoice', 'ERP invoice finalize', true, false,
   'DR Accounts Receivable (total), CR Income (subtotal), CR Overseas Tax Payable (tax). COGS/Stock not posted — reference does not establish Winner-exact GL.'),
  ('customer_payment', 'Customer payment received', true, false,
   'DR Cash/Bank (payment account), CR Accounts Receivable (amount).'),
  ('purchase_bill', 'Purchase bill finalize', true, false,
   'DR Stock (total), CR Accounts Payable (total). Input tax allocation not Winner-exact.'),
  ('supplier_payment', 'Supplier payment', true, false,
   'DR Accounts Payable, CR Cash/Bank (payment account).'),
  ('expense', 'Expense record', true, false,
   'DR Expense account, CR Paid-through cash/bank account.'),
  ('vendor_credit_application', 'Vendor credit applied to bill', true, false,
   'DR Accounts Payable, CR Stock (amount). Reversal mapping approximate.'),
  ('credit_note_application', 'Credit note applied to invoice', true, false,
   'DR Income (contra), CR Accounts Receivable (amount).'),
  ('credit_note', 'Credit note issued', true, false,
   'DR Income (total), CR Accounts Receivable (total) when issued.'),
  ('stock_adjustment', 'Stock adjustment finalize', false, false,
   'Deferred — reference does not establish adjustment GL. Enable when mapping confirmed.'),
  ('store_transfer', 'Inter-store transfer', false, false,
   'Deferred — reference does not establish transfer GL.'),
  ('banking_transaction', 'Banking / account transaction', true, false,
   'DR/CR based on transaction type and selected accounts.'),
  ('fixed_asset', 'Fixed asset purchase', true, false,
   'DR Fixed Asset account, CR Paid-through account (purchase amount).')
ON CONFLICT (event_type) DO NOTHING;

-- ─── Banking (account transactions) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_account_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number text NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  counter_account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores (id) ON DELETE SET NULL,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  transaction_type text NOT NULL,
  details text NOT NULL DEFAULT '',
  payment_type text,
  debit_amount numeric NOT NULL DEFAULT 0,
  credit_amount numeric NOT NULL DEFAULT 0,
  running_balance numeric,
  reference text,
  journal_entry_id uuid REFERENCES public.journal_entries (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_account_transactions_type_check CHECK (
    transaction_type IN (
      'owner_contribution', 'owner_drawing', 'profit_withdrawal',
      'loan_taking', 'loan_repayment', 'payment_statement', 'generic'
    )
  ),
  CONSTRAINT erp_account_transactions_number_unique UNIQUE (transaction_number),
  CONSTRAINT erp_account_transactions_amount_check CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0)
  )
);

CREATE INDEX IF NOT EXISTS erp_account_transactions_account_idx
  ON public.erp_account_transactions (account_id, transaction_date DESC);

-- ─── VAT Returns ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_vat_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text NOT NULL DEFAULT '',
  store_id uuid REFERENCES public.stores (id) ON DELETE SET NULL,
  filed_date date,
  status text NOT NULL DEFAULT 'unfiled',
  output_tax numeric NOT NULL DEFAULT 0,
  input_tax numeric NOT NULL DEFAULT 0,
  total_tax_payable numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES public.journal_entries (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_vat_returns_status_check CHECK (status IN ('unfiled', 'filed')),
  CONSTRAINT erp_vat_returns_number_unique UNIQUE (return_number),
  CONSTRAINT erp_vat_returns_period_check CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS erp_vat_returns_store_idx ON public.erp_vat_returns (store_id);
CREATE INDEX IF NOT EXISTS erp_vat_returns_period_idx ON public.erp_vat_returns (period_start, period_end);

-- ─── Fixed Assets ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_number text NOT NULL,
  name text NOT NULL,
  serial_number text,
  brand text,
  reference text,
  details text,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  purchase_amount numeric NOT NULL,
  paid_through_account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  tax_amount numeric NOT NULL DEFAULT 0,
  tax_mode text NOT NULL DEFAULT 'exclusive',
  vendor_id uuid REFERENCES public.vendors (id) ON DELETE SET NULL,
  warranty_expiry date,
  warranty_details text,
  maintenance_info text,
  store_id uuid REFERENCES public.stores (id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_fixed_assets_number_unique UNIQUE (asset_number),
  CONSTRAINT erp_fixed_assets_tax_mode_check CHECK (tax_mode IN ('none', 'exclusive', 'inclusive')),
  CONSTRAINT erp_fixed_assets_amount_positive CHECK (purchase_amount > 0)
);

CREATE INDEX IF NOT EXISTS erp_fixed_assets_store_idx ON public.erp_fixed_assets (store_id);

-- ─── Document sequences ─────────────────────────────────────────────────────

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES
  ('journal_entry', 'JE', 1, 0),
  ('vat_return', '', 101, 0),
  ('account_transaction', 'AT', 1, 0),
  ('fixed_asset', 'FA', 1, 0)
ON CONFLICT (document_type) DO NOTHING;

-- ─── updated_at triggers ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_journal_entries_updated_at ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_erp_account_transactions_updated_at ON public.erp_account_transactions;
CREATE TRIGGER trg_erp_account_transactions_updated_at
  BEFORE UPDATE ON public.erp_account_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_erp_vat_returns_updated_at ON public.erp_vat_returns;
CREATE TRIGGER trg_erp_vat_returns_updated_at
  BEFORE UPDATE ON public.erp_vat_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_erp_fixed_assets_updated_at ON public.erp_fixed_assets;
CREATE TRIGGER trg_erp_fixed_assets_updated_at
  BEFORE UPDATE ON public.erp_fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── Helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_account_by_code(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.accounts WHERE code = p_code LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_account_balance(p_account_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(a.opening_balance, 0)
    + COALESCE(SUM(l.debit_amount), 0)
    - COALESCE(SUM(l.credit_amount), 0)
  FROM public.accounts a
  LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id
  LEFT JOIN public.journal_entries j ON j.id = l.journal_entry_id AND j.status = 'posted'
  WHERE a.id = p_account_id
  GROUP BY a.id, a.opening_balance;
$$;

CREATE OR REPLACE FUNCTION public.is_posting_enabled(p_event_type text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.erp_posting_rules WHERE event_type = p_event_type),
    false
  );
$$;

-- ─── Core journal RPC (balanced, idempotent by source) ──────────────────────

CREATE OR REPLACE FUNCTION public.create_posted_journal_entry(
  p_transaction_date date,
  p_description text,
  p_store_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_lines jsonb,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_journal_id uuid;
  v_number text;
  v_line jsonb;
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_line_debit numeric;
  v_line_credit numeric;
  v_account_id uuid;
  v_company_id uuid;
  v_order integer := 0;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_source_entity_type IS NOT NULL AND p_source_entity_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM public.journal_entries
    WHERE source_entity_type = p_source_entity_type
      AND source_entity_id = p_source_entity_id
      AND status = 'posted';

    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Journal requires at least two lines';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_debit := COALESCE((v_line ->> 'debit')::numeric, 0);
    v_line_credit := COALESCE((v_line ->> 'credit')::numeric, 0);
    IF v_line_debit < 0 OR v_line_credit < 0 THEN
      RAISE EXCEPTION 'Negative amounts not allowed';
    END IF;
    IF v_line_debit > 0 AND v_line_credit > 0 THEN
      RAISE EXCEPTION 'Line cannot have both debit and credit';
    END IF;
    IF v_line_debit = 0 AND v_line_credit = 0 THEN
      RAISE EXCEPTION 'Line must have debit or credit';
    END IF;
    v_debit := v_debit + v_line_debit;
    v_credit := v_credit + v_line_credit;
  END LOOP;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Journal unbalanced: debit % credit %', v_debit, v_credit;
  END IF;

  IF v_debit = 0 THEN
    RAISE EXCEPTION 'Journal total must be greater than zero';
  END IF;

  v_number := public.next_erp_document_number('journal_entry');

  IF p_store_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id FROM public.stores WHERE id = p_store_id;
  END IF;

  INSERT INTO public.journal_entries (
    journal_number, transaction_date, description, store_id, company_id,
    source_entity_type, source_entity_id, status, total_debit, total_credit,
    created_by, posted_by, posted_at
  )
  VALUES (
    v_number, p_transaction_date, COALESCE(p_description, ''), p_store_id, v_company_id,
    p_source_entity_type, p_source_entity_id, 'posted', v_debit, v_credit,
    p_created_by, p_created_by, now()
  )
  RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    v_line_debit := COALESCE((v_line ->> 'debit')::numeric, 0);
    v_line_credit := COALESCE((v_line ->> 'credit')::numeric, 0);

    IF v_line ? 'account_id' THEN
      v_account_id := (v_line ->> 'account_id')::uuid;
    ELSE
      v_account_id := public.get_account_by_code(v_line ->> 'account_code');
    END IF;

    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Account not found for journal line';
    END IF;

    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, line_order
    )
    VALUES (
      v_journal_id, v_account_id, v_line_debit, v_line_credit,
      COALESCE(v_line ->> 'description', ''), v_order
    );
  END LOOP;

  RETURN v_journal_id;
END;
$$;

-- ─── Entity posting functions (idempotent) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_journal_for_invoice(
  p_invoice_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal numeric;
  v_tax numeric;
  v_total numeric;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb;
BEGIN
  IF NOT public.is_posting_enabled('invoice') THEN
    RETURN NULL;
  END IF;

  SELECT subtotal, gst_amount, total_amount, store_id, invoice_number, created_at::date
  INTO v_subtotal, v_tax, v_total, v_store_id, v_number, v_date
  FROM public.invoices
  WHERE id = p_invoice_id AND status IN ('issued', 'partial', 'paid');

  IF NOT FOUND OR v_total <= 0 THEN
    RETURN NULL;
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'ACCOUNTS_RECIEVABLE', 'debit', v_total, 'description', 'Invoice ' || v_number)
  );

  IF v_subtotal > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'INCOME', 'credit', v_subtotal, 'description', 'Sales')
    );
  END IF;

  IF v_tax > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'OVERSEAS_TAX_PAYABLE', 'credit', v_tax, 'description', 'Output tax')
    );
  END IF;

  RETURN public.create_posted_journal_entry(
    v_date, 'Invoice ' || v_number, v_store_id, 'invoice', p_invoice_id, v_lines, p_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_for_customer_payment(
  p_payment_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_account_id uuid;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb;
BEGIN
  IF NOT public.is_posting_enabled('customer_payment') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, account_id, store_id, payment_date, payment_number
  INTO v_amount, v_account_id, v_store_id, v_date, v_number
  FROM public.erp_customer_payments
  WHERE id = p_payment_id;

  IF NOT FOUND OR v_amount <= 0 THEN
    RETURN NULL;
  END IF;

  IF v_account_id IS NULL THEN
    v_account_id := public.get_account_by_code('CASH');
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_account_id, 'debit', v_amount, 'description', 'Payment ' || v_number),
    jsonb_build_object('account_code', 'ACCOUNTS_RECIEVABLE', 'credit', v_amount, 'description', 'AR clearance')
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Customer payment ' || v_number, v_store_id, 'customer_payment', p_payment_id, v_lines, p_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_for_purchase_bill(
  p_bill_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb;
BEGIN
  IF NOT public.is_posting_enabled('purchase_bill') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, store_id, purchase_date, purchase_bill_number
  INTO v_total, v_store_id, v_date, v_number
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id AND status IN ('finalized', 'partial', 'paid');

  IF NOT FOUND OR v_total <= 0 THEN
    RETURN NULL;
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'STOCK', 'debit', v_total, 'description', 'Purchase ' || v_number),
    jsonb_build_object('account_code', 'ACCOUNTS_PAYABLE', 'credit', v_total, 'description', 'AP')
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Purchase bill ' || v_number, v_store_id, 'purchase_bill', p_bill_id, v_lines, p_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_for_supplier_payment(
  p_payment_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_account_id uuid;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb;
BEGIN
  IF NOT public.is_posting_enabled('supplier_payment') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, account_id, store_id, payment_date, payment_number
  INTO v_amount, v_account_id, v_store_id, v_date, v_number
  FROM public.erp_supplier_payments
  WHERE id = p_payment_id;

  IF NOT FOUND OR v_amount <= 0 THEN
    RETURN NULL;
  END IF;

  IF v_account_id IS NULL THEN
    v_account_id := public.get_account_by_code('CASH');
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'ACCOUNTS_PAYABLE', 'debit', v_amount, 'description', 'AP payment'),
    jsonb_build_object('account_id', v_account_id, 'credit', v_amount, 'description', 'Payment ' || v_number)
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Supplier payment ' || v_number, v_store_id, 'supplier_payment', p_payment_id, v_lines, p_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_for_expense(
  p_expense_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_expense_account uuid;
  v_paid_account uuid;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb;
BEGIN
  IF NOT public.is_posting_enabled('expense') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, account_id, paid_through_account_id, store_id, expense_date, expense_number
  INTO v_total, v_expense_account, v_paid_account, v_store_id, v_date, v_number
  FROM public.erp_expenses
  WHERE id = p_expense_id;

  IF NOT FOUND OR v_total <= 0 THEN
    RETURN NULL;
  END IF;

  IF v_paid_account IS NULL THEN
    v_paid_account := public.get_account_by_code('CASH');
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_expense_account, 'debit', v_total, 'description', 'Expense'),
    jsonb_build_object('account_id', v_paid_account, 'credit', v_total, 'description', 'Paid through')
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Expense ' || v_number, v_store_id, 'expense', p_expense_id, v_lines, p_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_for_credit_note(
  p_credit_note_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb;
BEGIN
  IF NOT public.is_posting_enabled('credit_note') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, store_id, credit_note_date, credit_note_number
  INTO v_total, v_store_id, v_date, v_number
  FROM public.erp_credit_notes
  WHERE id = p_credit_note_id AND status IN ('issued', 'applied');

  IF NOT FOUND OR v_total <= 0 THEN
    RETURN NULL;
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'INCOME', 'debit', v_total, 'description', 'Credit note'),
    jsonb_build_object('account_code', 'ACCOUNTS_RECIEVABLE', 'credit', v_total, 'description', 'AR reduction')
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Credit note ' || v_number, v_store_id, 'credit_note', p_credit_note_id, v_lines, p_actor
  );
END;
$$;

-- Fix idempotent vendor/credit note application posting via application row id
CREATE OR REPLACE FUNCTION public.post_journal_for_vendor_credit_application(
  p_credit_id uuid,
  p_bill_id uuid,
  p_amount numeric,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_app_id uuid;
  v_lines jsonb;
BEGIN
  IF NOT public.is_posting_enabled('vendor_credit_application') THEN
    RETURN NULL;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_app_id
  FROM public.erp_vendor_credit_applications
  WHERE vendor_credit_id = p_credit_id AND purchase_bill_id = p_bill_id;

  IF v_app_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT store_id INTO v_store_id FROM public.erp_purchase_bills WHERE id = p_bill_id;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'ACCOUNTS_PAYABLE', 'debit', p_amount, 'description', 'Vendor credit'),
    jsonb_build_object('account_code', 'STOCK', 'credit', p_amount, 'description', 'Stock reversal')
  );

  RETURN public.create_posted_journal_entry(
    CURRENT_DATE, 'Vendor credit application', v_store_id,
    'vendor_credit_application', v_app_id, v_lines, p_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_for_credit_note_application(
  p_credit_note_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_app_id uuid;
  v_lines jsonb;
BEGIN
  IF NOT public.is_posting_enabled('credit_note_application') THEN
    RETURN NULL;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_app_id
  FROM public.erp_credit_note_applications
  WHERE credit_note_id = p_credit_note_id AND invoice_id = p_invoice_id;

  IF v_app_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT store_id INTO v_store_id FROM public.invoices WHERE id = p_invoice_id;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'INCOME', 'debit', p_amount, 'description', 'Credit applied'),
    jsonb_build_object('account_code', 'ACCOUNTS_RECIEVABLE', 'credit', p_amount, 'description', 'AR reduction')
  );

  RETURN public.create_posted_journal_entry(
    CURRENT_DATE, 'Credit note application', v_store_id,
    'credit_note_application', v_app_id, v_lines, p_actor
  );
END;
$$;

-- ─── Banking RPCs ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_account_transaction(
  p_account_id uuid,
  p_store_id uuid,
  p_transaction_date date,
  p_transaction_type text,
  p_debit_amount numeric DEFAULT 0,
  p_credit_amount numeric DEFAULT 0,
  p_counter_account_id uuid DEFAULT NULL,
  p_details text DEFAULT NULL,
  p_payment_type text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_number text;
  v_journal_id uuid;
  v_lines jsonb;
  v_balance numeric;
  v_cash_account uuid;
  v_equity_account uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_debit_amount < 0 OR p_credit_amount < 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF p_debit_amount = 0 AND p_credit_amount = 0 THEN
    RAISE EXCEPTION 'Debit or credit required';
  END IF;

  IF p_debit_amount > 0 AND p_credit_amount > 0 THEN
    RAISE EXCEPTION 'Cannot set both debit and credit';
  END IF;

  v_number := public.next_erp_document_number('account_transaction');
  v_cash_account := public.get_account_by_code('CASH');
  v_equity_account := public.get_account_by_code('EQUITY');

  IF p_transaction_type = 'owner_contribution' AND p_debit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_account_id, 'debit', p_debit_amount, 'description', 'Owner contribution'),
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_equity_account), 'credit', p_debit_amount, 'description', 'Equity')
    );
  ELSIF p_transaction_type IN ('owner_drawing', 'profit_withdrawal') AND p_credit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_equity_account), 'debit', p_credit_amount, 'description', p_transaction_type),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', p_transaction_type)
    );
  ELSIF p_transaction_type = 'loan_taking' AND p_debit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_account_id, 'debit', p_debit_amount, 'description', 'Loan taking'),
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'credit', p_debit_amount, 'description', 'Loan liability')
    );
  ELSIF p_transaction_type = 'loan_repayment' AND p_credit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'debit', p_credit_amount, 'description', 'Loan repayment'),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', 'Loan repayment')
    );
  ELSIF p_debit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_account_id, 'debit', p_debit_amount, 'description', COALESCE(p_details, 'Debit')),
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'credit', p_debit_amount, 'description', 'Counter')
    );
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'debit', p_credit_amount, 'description', 'Counter'),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', COALESCE(p_details, 'Credit'))
    );
  END IF;

  IF public.is_posting_enabled('banking_transaction') THEN
    v_journal_id := public.create_posted_journal_entry(
      p_transaction_date, COALESCE(p_details, p_transaction_type), p_store_id,
      'banking_transaction', NULL, v_lines, p_created_by
    );
  END IF;

  v_balance := public.get_account_balance(p_account_id);

  INSERT INTO public.erp_account_transactions (
    transaction_number, account_id, counter_account_id, store_id,
    transaction_date, transaction_type, details, payment_type,
    debit_amount, credit_amount, running_balance, reference,
    journal_entry_id, created_by
  )
  VALUES (
    v_number, p_account_id, p_counter_account_id, p_store_id,
    p_transaction_date, p_transaction_type, COALESCE(p_details, ''), p_payment_type,
    COALESCE(p_debit_amount, 0), COALESCE(p_credit_amount, 0), v_balance, p_reference,
    v_journal_id, p_created_by
  )
  RETURNING id INTO v_tx_id;

  IF v_journal_id IS NOT NULL THEN
    UPDATE public.journal_entries
    SET source_entity_id = v_tx_id
    WHERE id = v_journal_id AND source_entity_id IS NULL;
  END IF;

  RETURN v_tx_id;
END;
$$;

-- ─── VAT Return RPCs ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_vat_return(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
  v_output numeric := 0;
  v_input numeric := 0;
  v_label text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  v_number := public.next_erp_document_number('vat_return');
  v_label := to_char(p_period_start, 'Mon - YYYY');

  SELECT COALESCE(SUM(gst_amount), 0) INTO v_output
  FROM public.invoices
  WHERE status IN ('issued', 'partial', 'paid')
    AND created_at::date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_input
  FROM public.erp_purchase_bills
  WHERE status IN ('finalized', 'partial', 'paid')
    AND purchase_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  INSERT INTO public.erp_vat_returns (
    return_number, period_start, period_end, period_label, store_id,
    output_tax, input_tax, total_tax_payable, balance_due, created_by
  )
  VALUES (
    v_number, p_period_start, p_period_end, v_label, p_store_id,
    v_output, v_input, GREATEST(0, v_output - v_input), GREATEST(0, v_output - v_input), p_created_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.file_erp_vat_return(
  p_return_id uuid,
  p_filed_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_user(p_filed_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.erp_vat_returns
  SET status = 'filed', filed_date = CURRENT_DATE, updated_at = now()
  WHERE id = p_return_id AND status = 'unfiled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return not found or already filed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_erp_vat_return(
  p_return_id uuid,
  p_deleted_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_user(p_deleted_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM public.erp_vat_returns
  WHERE id = p_return_id AND status = 'unfiled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only unfiled VAT returns can be deleted';
  END IF;
END;
$$;

-- ─── Fixed Asset RPCs ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_fixed_asset(
  p_name text,
  p_purchase_amount numeric,
  p_store_id uuid,
  p_purchase_date date DEFAULT CURRENT_DATE,
  p_paid_through_account_id uuid DEFAULT NULL,
  p_serial_number text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_details text DEFAULT NULL,
  p_tax_amount numeric DEFAULT 0,
  p_tax_mode text DEFAULT 'exclusive',
  p_vendor_id uuid DEFAULT NULL,
  p_warranty_expiry date DEFAULT NULL,
  p_warranty_details text DEFAULT NULL,
  p_maintenance_info text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
  v_journal_id uuid;
  v_paid uuid;
  v_fixed uuid;
  v_total numeric;
  v_lines jsonb;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_purchase_amount IS NULL OR p_purchase_amount <= 0 THEN
    RAISE EXCEPTION 'Purchase amount must be positive';
  END IF;

  v_number := public.next_erp_document_number('fixed_asset');
  v_total := p_purchase_amount + COALESCE(p_tax_amount, 0);
  v_paid := COALESCE(p_paid_through_account_id, public.get_account_by_code('CASH'));
  v_fixed := public.get_account_by_code('FIXED_ASSET');

  IF v_fixed IS NULL THEN
    SELECT a.id INTO v_fixed
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    WHERE t.name = 'Fixed Asset'
    LIMIT 1;
  END IF;

  INSERT INTO public.erp_fixed_assets (
    asset_number, name, serial_number, brand, reference, details,
    purchase_date, purchase_amount, paid_through_account_id,
    tax_amount, tax_mode, vendor_id, warranty_expiry, warranty_details,
    maintenance_info, store_id, created_by
  )
  VALUES (
    v_number, p_name, p_serial_number, p_brand, p_reference, p_details,
    p_purchase_date, p_purchase_amount, v_paid,
    COALESCE(p_tax_amount, 0), COALESCE(p_tax_mode, 'exclusive'), p_vendor_id,
    p_warranty_expiry, p_warranty_details, p_maintenance_info, p_store_id, p_created_by
  )
  RETURNING id INTO v_id;

  IF public.is_posting_enabled('fixed_asset') AND v_fixed IS NOT NULL AND v_paid IS NOT NULL THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_fixed, 'debit', v_total, 'description', 'Asset ' || p_name),
      jsonb_build_object('account_id', v_paid, 'credit', v_total, 'description', 'Paid through')
    );
    v_journal_id := public.create_posted_journal_entry(
      p_purchase_date, 'Fixed asset ' || p_name, p_store_id, 'fixed_asset', v_id, v_lines, p_created_by
    );
    UPDATE public.erp_fixed_assets SET journal_entry_id = v_journal_id WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- ─── Account management RPCs ──────────────────────────────────────────────────

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
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.accounts (
    account_type_id, name, code, description, store_id, opening_balance,
    is_system, is_locked, is_active
  )
  VALUES (
    p_account_type_id, p_name, p_code, COALESCE(p_description, ''), p_store_id,
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
BEGIN
  IF NOT public.is_staff_user(p_updated_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.accounts
  SET
    name = p_name,
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

-- ─── Reconciliation snapshot ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_reconciliation_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_journal_unbalanced integer;
  v_legacy_inventory numeric;
  v_store_inventory_total numeric;
  v_central_inventory numeric;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(*) INTO v_journal_unbalanced
  FROM public.journal_entries
  WHERE status = 'posted' AND total_debit <> total_credit;

  SELECT COALESCE(SUM(stock), 0) INTO v_central_inventory FROM public.inventory;
  SELECT COALESCE(SUM(stock), 0) INTO v_store_inventory_total FROM public.store_inventory;

  v_result := jsonb_build_object(
    'journal_balanced', v_journal_unbalanced = 0,
    'journal_unbalanced_count', v_journal_unbalanced,
    'central_inventory_total', v_central_inventory,
    'store_inventory_total', v_store_inventory_total,
    'inventory_store_gap', v_central_inventory - v_store_inventory_total,
    'legacy_unallocated_stock', GREATEST(0, v_central_inventory - v_store_inventory_total),
    'customer_checks', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT u.id AS user_id, u.name,
          COALESCE(u.opening_balance, 0) AS opening_balance,
          COALESCE(inv.total_invoiced, 0) AS total_invoiced,
          COALESCE(pay.total_paid, 0) AS total_paid,
          COALESCE(cn.total_credits, 0) AS total_credits,
          COALESCE(u.opening_balance, 0) + COALESCE(inv.total_invoiced, 0)
            - COALESCE(pay.total_paid, 0) - COALESCE(cn.total_credits, 0) AS computed_receivable,
          COALESCE(ar.balance, 0) AS gl_ar_balance
        FROM public.users u
        LEFT JOIN (
          SELECT user_id, SUM(balance_due) AS total_invoiced FROM public.invoices
          WHERE status IN ('issued', 'partial', 'paid') GROUP BY user_id
        ) inv ON inv.user_id = u.id
        LEFT JOIN (
          SELECT user_id, SUM(total_amount) AS total_paid FROM public.erp_customer_payments GROUP BY user_id
        ) pay ON pay.user_id = u.id
        LEFT JOIN (
          SELECT cn.user_id, SUM(cna.amount) AS total_credits
          FROM public.erp_credit_note_applications cna
          JOIN public.erp_credit_notes cn ON cn.id = cna.credit_note_id
          GROUP BY cn.user_id
        ) cn ON cn.user_id = u.id
        LEFT JOIN (
          SELECT SUM(public.get_account_balance(a.id)) AS balance
          FROM public.accounts a WHERE a.code = 'ACCOUNTS_RECIEVABLE'
        ) ar ON true
        WHERE u.role::text = 'customer'
        LIMIT 50
      ) r
    ),
    'invoice_balance_checks', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT id, invoice_number, total_amount, amount_paid, credits_applied, balance_due,
          total_amount - amount_paid - credits_applied AS computed_balance,
          (total_amount - amount_paid - credits_applied = balance_due) AS reconciled
        FROM public.invoices
        WHERE status IN ('issued', 'partial', 'paid')
        LIMIT 100
      ) r
    ),
    'purchase_bill_balance_checks', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT id, purchase_bill_number, total_amount, amount_paid, credits_applied, balance_due,
          total_amount - amount_paid - credits_applied AS computed_balance,
          (total_amount - amount_paid - credits_applied = balance_due) AS reconciled
        FROM public.erp_purchase_bills
        WHERE status IN ('finalized', 'partial', 'paid')
        LIMIT 100
      ) r
    ),
    'payment_allocation_checks', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT p.id, p.payment_number, p.total_amount, p.unallocated_amount,
          COALESCE(SUM(a.amount), 0) AS allocated,
          (p.total_amount - COALESCE(SUM(a.amount), 0) = p.unallocated_amount) AS reconciled
        FROM public.erp_customer_payments p
        LEFT JOIN public.erp_payment_allocations a ON a.payment_id = p.id
        GROUP BY p.id
        LIMIT 50
      ) r
    ),
    'vat_return_checks', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT vr.id, vr.return_number, vr.output_tax, vr.input_tax, vr.total_tax_payable,
          (vr.output_tax - vr.input_tax = vr.total_tax_payable) AS reconciled
        FROM public.erp_vat_returns vr
        LIMIT 50
      ) r
    )
  );

  RETURN v_result;
END;
$$;

-- ─── Financial dashboard metrics ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_financial_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_start date := date_trunc('year', CURRENT_DATE)::date;
  v_ar numeric;
  v_ap numeric;
  v_income numeric;
  v_cogs numeric;
  v_expenses numeric;
  v_daily_sales jsonb;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_ar := public.get_account_balance(public.get_account_by_code('ACCOUNTS_RECIEVABLE'));
  v_ap := public.get_account_balance(public.get_account_by_code('ACCOUNTS_PAYABLE'));

  SELECT COALESCE(SUM(total_amount), 0) INTO v_income
  FROM public.invoices
  WHERE status IN ('issued', 'partial', 'paid')
    AND created_at::date >= v_year_start;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_cogs
  FROM public.erp_purchase_bills
  WHERE status IN ('finalized', 'partial', 'paid')
    AND purchase_date >= v_year_start;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_expenses
  FROM public.erp_expenses
  WHERE expense_date >= v_year_start;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_daily_sales
  FROM (
    SELECT created_at::date AS day, SUM(total_amount) AS total
    FROM public.invoices
    WHERE status IN ('issued', 'partial', 'paid')
      AND created_at::date >= (CURRENT_DATE - 30)
    GROUP BY created_at::date
    ORDER BY day
  ) r;

  RETURN jsonb_build_object(
    'accounts_receivable', v_ar,
    'accounts_payable', v_ap,
    'net_income_ytd', v_income,
    'cogs_ytd', v_cogs,
    'expenses_ytd', v_expenses,
    'net_profit_ytd', v_income - v_cogs - v_expenses,
    'low_stock_count', (
      SELECT COUNT(*) FROM public.inventory i
      WHERE i.stock <= COALESCE(i.reorder_point, 0)
    ),
    'daily_sales', v_daily_sales,
    'invoice_status_ytd', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT status, COUNT(*) AS count, SUM(total_amount) AS total
        FROM public.invoices
        WHERE created_at::date >= v_year_start
        GROUP BY status
      ) r
    )
  );
END;
$$;

-- Owner's equity ledger account (for banking owner contribution/drawings)
INSERT INTO public.accounts (account_type_id, name, description, code, is_system, is_locked)
SELECT t.id, 'Owner''s Equity', 'Owner''s Equity', 'OWNERS_EQUITY', true, true
FROM public.account_types t
WHERE t.name = 'Equity' AND t.account_category = 'Equity'
ON CONFLICT (code) DO NOTHING;

-- ─── Accounting posting triggers (idempotent via post_* functions) ────────────

CREATE OR REPLACE FUNCTION public.trg_post_invoice_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('issued', 'partial', 'paid') AND NEW.source = 'erp' THEN
    PERFORM public.post_journal_for_invoice(NEW.id, COALESCE(auth.uid(), NEW.user_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_post_customer_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.post_journal_for_customer_payment(NEW.id, COALESCE(auth.uid(), NEW.created_by));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_post_purchase_bill_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('finalized', 'partial', 'paid') AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    PERFORM public.post_journal_for_purchase_bill(NEW.id, COALESCE(auth.uid(), NEW.created_by));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_post_supplier_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.post_journal_for_supplier_payment(NEW.id, COALESCE(auth.uid(), NEW.created_by));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_post_expense_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.post_journal_for_expense(NEW.id, COALESCE(auth.uid(), NEW.created_by));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_post_vendor_credit_application_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.post_journal_for_vendor_credit_application(
    NEW.vendor_credit_id, NEW.purchase_bill_id, NEW.amount, auth.uid()
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_post_credit_note_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('issued', 'applied') THEN
    PERFORM public.post_journal_for_credit_note(NEW.id, COALESCE(auth.uid(), NEW.created_by));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_post_credit_note_application_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.post_journal_for_credit_note_application(
    NEW.credit_note_id, NEW.invoice_id, NEW.amount, auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_post_journal ON public.invoices;
CREATE TRIGGER trg_invoices_post_journal
  AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW
  WHEN (NEW.status IN ('issued', 'partial', 'paid'))
  EXECUTE FUNCTION public.trg_post_invoice_journal();

DROP TRIGGER IF EXISTS trg_customer_payments_post_journal ON public.erp_customer_payments;
CREATE TRIGGER trg_customer_payments_post_journal
  AFTER INSERT ON public.erp_customer_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_post_customer_payment_journal();

DROP TRIGGER IF EXISTS trg_purchase_bills_post_journal ON public.erp_purchase_bills;
CREATE TRIGGER trg_purchase_bills_post_journal
  AFTER INSERT OR UPDATE OF status ON public.erp_purchase_bills
  FOR EACH ROW
  WHEN (NEW.status IN ('finalized', 'partial', 'paid'))
  EXECUTE FUNCTION public.trg_post_purchase_bill_journal();

DROP TRIGGER IF EXISTS trg_supplier_payments_post_journal ON public.erp_supplier_payments;
CREATE TRIGGER trg_supplier_payments_post_journal
  AFTER INSERT ON public.erp_supplier_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_post_supplier_payment_journal();

DROP TRIGGER IF EXISTS trg_expenses_post_journal ON public.erp_expenses;
CREATE TRIGGER trg_expenses_post_journal
  AFTER INSERT ON public.erp_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_post_expense_journal();

DROP TRIGGER IF EXISTS trg_vendor_credit_app_post_journal ON public.erp_vendor_credit_applications;
CREATE TRIGGER trg_vendor_credit_app_post_journal
  AFTER INSERT ON public.erp_vendor_credit_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_post_vendor_credit_application_journal();

DROP TRIGGER IF EXISTS trg_credit_notes_post_journal ON public.erp_credit_notes;
CREATE TRIGGER trg_credit_notes_post_journal
  AFTER INSERT OR UPDATE OF status ON public.erp_credit_notes
  FOR EACH ROW
  WHEN (NEW.status IN ('issued', 'applied'))
  EXECUTE FUNCTION public.trg_post_credit_note_journal();

DROP TRIGGER IF EXISTS trg_credit_note_app_post_journal ON public.erp_credit_note_applications;
CREATE TRIGGER trg_credit_note_app_post_journal
  AFTER INSERT ON public.erp_credit_note_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_post_credit_note_application_journal();

-- Fix banking equity account lookup
CREATE OR REPLACE FUNCTION public.create_erp_account_transaction(
  p_account_id uuid,
  p_store_id uuid,
  p_transaction_date date,
  p_transaction_type text,
  p_debit_amount numeric DEFAULT 0,
  p_credit_amount numeric DEFAULT 0,
  p_counter_account_id uuid DEFAULT NULL,
  p_details text DEFAULT NULL,
  p_payment_type text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_number text;
  v_journal_id uuid;
  v_lines jsonb;
  v_balance numeric;
  v_cash_account uuid;
  v_equity_account uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_debit_amount < 0 OR p_credit_amount < 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF p_debit_amount = 0 AND p_credit_amount = 0 THEN
    RAISE EXCEPTION 'Debit or credit required';
  END IF;

  IF p_debit_amount > 0 AND p_credit_amount > 0 THEN
    RAISE EXCEPTION 'Cannot set both debit and credit';
  END IF;

  v_number := public.next_erp_document_number('account_transaction');
  v_cash_account := public.get_account_by_code('CASH');
  v_equity_account := COALESCE(public.get_account_by_code('OWNERS_EQUITY'), public.get_account_by_code('RETAINED_EARNING'));

  IF p_transaction_type = 'owner_contribution' AND p_debit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_account_id, 'debit', p_debit_amount, 'description', 'Owner contribution'),
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_equity_account), 'credit', p_debit_amount, 'description', 'Equity')
    );
  ELSIF p_transaction_type IN ('owner_drawing', 'profit_withdrawal') AND p_credit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_equity_account), 'debit', p_credit_amount, 'description', p_transaction_type),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', p_transaction_type)
    );
  ELSIF p_transaction_type = 'loan_taking' AND p_debit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_account_id, 'debit', p_debit_amount, 'description', 'Loan taking'),
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'credit', p_debit_amount, 'description', 'Loan liability')
    );
  ELSIF p_transaction_type = 'loan_repayment' AND p_credit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'debit', p_credit_amount, 'description', 'Loan repayment'),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', 'Loan repayment')
    );
  ELSIF p_debit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_account_id, 'debit', p_debit_amount, 'description', COALESCE(p_details, 'Debit')),
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'credit', p_debit_amount, 'description', 'Counter')
    );
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'debit', p_credit_amount, 'description', 'Counter'),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', COALESCE(p_details, 'Credit'))
    );
  END IF;

  IF public.is_posting_enabled('banking_transaction') THEN
    v_journal_id := public.create_posted_journal_entry(
      p_transaction_date, COALESCE(p_details, p_transaction_type), p_store_id,
      'banking_transaction', NULL, v_lines, p_created_by
    );
  END IF;

  v_balance := public.get_account_balance(p_account_id);

  INSERT INTO public.erp_account_transactions (
    transaction_number, account_id, counter_account_id, store_id,
    transaction_date, transaction_type, details, payment_type,
    debit_amount, credit_amount, running_balance, reference,
    journal_entry_id, created_by
  )
  VALUES (
    v_number, p_account_id, p_counter_account_id, p_store_id,
    p_transaction_date, p_transaction_type, COALESCE(p_details, ''), p_payment_type,
    COALESCE(p_debit_amount, 0), COALESCE(p_credit_amount, 0), v_balance, p_reference,
    v_journal_id, p_created_by
  )
  RETURNING id INTO v_tx_id;

  IF v_journal_id IS NOT NULL THEN
    UPDATE public.journal_entries
    SET source_entity_id = v_tx_id
    WHERE id = v_journal_id AND source_entity_id IS NULL;
  END IF;

  RETURN v_tx_id;
END;
$$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_posting_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_vat_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_entries_staff"
  ON public.journal_entries FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "journal_entry_lines_staff"
  ON public.journal_entry_lines FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_posting_rules_staff"
  ON public.erp_posting_rules FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_account_transactions_staff"
  ON public.erp_account_transactions FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_vat_returns_staff"
  ON public.erp_vat_returns FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_fixed_assets_staff"
  ON public.erp_fixed_assets FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

-- ─── GRANTS ───────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_account_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_posting_enabled(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_posted_journal_entry(date, text, uuid, text, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_customer_payment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_purchase_bill(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_supplier_payment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_expense(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_account_transaction(uuid, uuid, date, text, numeric, numeric, uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_vat_return(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.file_erp_vat_return(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_erp_vat_return(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_fixed_asset(text, numeric, uuid, date, uuid, text, text, text, text, numeric, text, uuid, date, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_account(uuid, text, text, text, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_erp_account(uuid, text, text, text, uuid, numeric, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_reconciliation_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_financial_dashboard() TO authenticated;
