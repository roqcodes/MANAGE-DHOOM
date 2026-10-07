-- Ledger integrity: seed missing GL accounts, void/repost on edit/delete,
-- and mirror cash/bank journal lines into the cash book.

BEGIN;

-- Allow security-definer posting to read config/balances during backfill.
CREATE OR REPLACE FUNCTION public.is_posting_enabled(p_event_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE  
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN COALESCE(
    (SELECT is_enabled FROM public.erp_posting_rules WHERE event_type = p_event_type),
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_account_balance(p_account_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN (
    SELECT COALESCE(a.opening_balance, 0)
      + COALESCE(SUM(l.debit_amount), 0)
      - COALESCE(SUM(l.credit_amount), 0)
    FROM public.accounts a
    LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id
    LEFT JOIN public.journal_entries j ON j.id = l.journal_entry_id AND j.status = 'posted'
    WHERE a.id = p_account_id
    GROUP BY a.id, a.opening_balance
  );
END;
$$;

-- ─── Constraints ─────────────────────────────────────────────────────────────

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_status_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_status_check
  CHECK (status IN ('draft', 'posted', 'voided'));

ALTER TABLE public.erp_account_transactions
  DROP CONSTRAINT IF EXISTS erp_account_transactions_type_check;
ALTER TABLE public.erp_account_transactions
  ADD CONSTRAINT erp_account_transactions_type_check
  CHECK (
    transaction_type IN (
      'owner_contribution', 'owner_drawing', 'profit_withdrawal',
      'loan_taking', 'loan_repayment', 'payment_statement', 'generic',
      'expense', 'fixed_asset', 'customer_payment', 'supplier_payment',
      'invoice', 'credit_note', 'vat_payment', 'vat_return', 'purchase_bill',
      'journal', 'account_transfer'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS erp_account_transactions_journal_account_uidx
  ON public.erp_account_transactions (journal_entry_id, account_id)
  WHERE journal_entry_id IS NOT NULL;

-- ─── System ledger accounts ──────────────────────────────────────────────────

INSERT INTO public.accounts (account_type_id, name, description, code, is_system, is_locked)
SELECT t.id, t.name, t.description, UPPER(REPLACE(t.name, ' ', '_')), true, true
FROM public.account_types t
WHERE t.is_system = true
  AND t.name IN (
    'Fixed Asset',
    'Equity',
    'Income',
    'Expense',
    'Other Expense',
    'Other Income',
    'Cost of Goods Sold',
    'Accounts Payable',
    'Accounts Recievable',
    'Overseas Tax Payable',
    'Cash',
    'Bank',
    'Stock',
    'Retained Earning'
  )
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_system_ledger_account(p_code text, p_type_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public.get_account_by_code(p_code);
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.accounts (account_type_id, name, description, code, is_system, is_locked)
  SELECT t.id, t.name, t.description, p_code, true, true
  FROM public.account_types t
  WHERE t.name = p_type_name
  ORDER BY t.is_system DESC
  LIMIT 1
  ON CONFLICT (code) DO NOTHING;

  RETURN public.get_account_by_code(p_code);
END;
$$;

-- ─── Cash-book helpers ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_cash_book_account(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    WHERE a.id = p_account_id
      AND (
        t.name IN ('Cash', 'Bank', 'Credit Card')
        OR (t.account_category = 'Liability' AND t.name = 'Other Current Liability')
        OR t.name ILIKE '%loan%'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.cash_book_type_for_source(p_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_source
    WHEN 'expense' THEN 'expense'
    WHEN 'fixed_asset' THEN 'fixed_asset'
    WHEN 'customer_payment' THEN 'customer_payment'
    WHEN 'supplier_payment' THEN 'supplier_payment'
    WHEN 'invoice' THEN 'invoice'
    WHEN 'credit_note' THEN 'credit_note'
    WHEN 'vat_payment' THEN 'vat_payment'
    WHEN 'vat_return' THEN 'vat_return'
    WHEN 'purchase_bill' THEN 'purchase_bill'
    WHEN 'banking_transaction' THEN 'generic'
    ELSE 'journal'
  END;
$$;

CREATE OR REPLACE FUNCTION public.sync_cash_book_from_journal(p_journal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_je public.journal_entries%ROWTYPE;
  v_line public.journal_entry_lines%ROWTYPE;
  v_counter uuid;
  v_type text;
  v_balance numeric;
BEGIN
  SELECT * INTO v_je FROM public.journal_entries WHERE id = p_journal_id;
  IF NOT FOUND OR v_je.status <> 'posted' THEN
    RETURN;
  END IF;

  v_type := public.cash_book_type_for_source(v_je.source_entity_type);

  FOR v_line IN
    SELECT * FROM public.journal_entry_lines
    WHERE journal_entry_id = p_journal_id
    ORDER BY line_order
  LOOP
    IF NOT public.is_cash_book_account(v_line.account_id) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.erp_account_transactions
      WHERE journal_entry_id = p_journal_id
        AND account_id = v_line.account_id
    ) THEN
      CONTINUE;
    END IF;

    SELECT l.account_id INTO v_counter
    FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = p_journal_id
      AND l.account_id <> v_line.account_id
    ORDER BY l.line_order
    LIMIT 1;

    v_balance := public.get_account_balance(v_line.account_id);

    INSERT INTO public.erp_account_transactions (
      transaction_number, account_id, counter_account_id, store_id,
      transaction_date, transaction_type, details,
      debit_amount, credit_amount, running_balance, reference,
      journal_entry_id, created_by
    )
    VALUES (
      public.next_erp_document_number('account_transaction'),
      v_line.account_id,
      v_counter,
      v_je.store_id,
      v_je.transaction_date,
      v_type,
      COALESCE(NULLIF(v_line.description, ''), v_je.description),
      v_line.debit_amount,
      v_line.credit_amount,
      v_balance,
      v_je.journal_number,
      p_journal_id,
      v_je.created_by
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_posted_journal(p_journal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_journal_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.journal_entries
  SET status = 'voided', updated_at = now()
  WHERE id = p_journal_id
    AND status = 'posted';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.erp_account_transactions
  WHERE journal_entry_id = p_journal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_journals_for_entity(p_source_type text, p_source_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_source_type IS NULL OR p_source_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_id IN
    SELECT id FROM public.journal_entries
    WHERE source_entity_type = p_source_type
      AND source_entity_id = p_source_id
      AND status = 'posted'
  LOOP
    PERFORM public.void_posted_journal(v_id);
  END LOOP;
END;
$$;

-- ─── Journal create also writes cash book ────────────────────────────────────

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
  IF p_created_by IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id, p_created_by);
  END IF;

  IF p_source_entity_type IS NOT NULL AND p_source_entity_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM public.journal_entries
    WHERE source_entity_type = p_source_entity_type
      AND source_entity_id = p_source_entity_id
      AND status = 'posted';

    IF v_existing IS NOT NULL THEN
      PERFORM public.sync_cash_book_from_journal(v_existing);
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

  PERFORM public.sync_cash_book_from_journal(v_journal_id);
  RETURN v_journal_id;
END;
$$;

-- ─── Banking tx: reuse cash-book rows created by the journal ─────────────────

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
  v_equity_account := COALESCE(
    public.get_account_by_code('OWNERS_EQUITY'),
    public.get_account_by_code('EQUITY'),
    public.get_account_by_code('RETAINED_EARNING')
  );

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

  IF v_journal_id IS NOT NULL THEN
    UPDATE public.erp_account_transactions
    SET
      transaction_type = p_transaction_type,
      details = COALESCE(p_details, details),
      payment_type = p_payment_type,
      reference = COALESCE(p_reference, reference),
      running_balance = v_balance
    WHERE journal_entry_id = v_journal_id
      AND account_id = p_account_id
    RETURNING id INTO v_tx_id;
  END IF;

  IF v_tx_id IS NULL THEN
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
  END IF;

  IF v_journal_id IS NOT NULL THEN
    UPDATE public.journal_entries
    SET source_entity_id = v_tx_id
    WHERE id = v_journal_id AND source_entity_id IS NULL;
  END IF;

  RETURN v_tx_id;
END;
$$;

-- ─── Fixed assets ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_journal_for_fixed_asset(
  p_asset_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_name text;
  v_amount numeric;
  v_tax numeric;
  v_date date;
  v_store uuid;
  v_paid uuid;
  v_fixed uuid;
  v_total numeric;
  v_lines jsonb;
  v_journal uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT public.is_posting_enabled('fixed_asset') THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'fixed_asset'
    AND source_entity_id = p_asset_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    PERFORM public.sync_cash_book_from_journal(v_existing);
    RETURN v_existing;
  END IF;

  SELECT name, purchase_amount, tax_amount, purchase_date, store_id, paid_through_account_id
  INTO v_name, v_amount, v_tax, v_date, v_store, v_paid
  FROM public.erp_fixed_assets
  WHERE id = p_asset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fixed asset not found';
  END IF;

  PERFORM public.require_store_access(v_store, p_actor);

  v_total := COALESCE(v_amount, 0) + COALESCE(v_tax, 0);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Fixed asset purchase amount must be positive';
  END IF;

  v_fixed := public.ensure_system_ledger_account('FIXED_ASSET', 'Fixed Asset');
  v_paid := COALESCE(v_paid, public.get_account_by_code('CASH'));

  IF v_fixed IS NULL THEN
    RAISE EXCEPTION 'Create a Fixed Asset ledger account before recording asset purchases';
  END IF;
  IF v_paid IS NULL THEN
    RAISE EXCEPTION 'Paid-through account is required';
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_fixed, 'debit', v_total, 'description', 'Asset ' || v_name),
    jsonb_build_object('account_id', v_paid, 'credit', v_total, 'description', 'Paid through')
  );

  v_journal := public.create_posted_journal_entry(
    v_date, 'Fixed asset ' || v_name, v_store, 'fixed_asset', p_asset_id, v_lines, p_actor
  );

  UPDATE public.erp_fixed_assets
  SET journal_entry_id = v_journal
  WHERE id = p_asset_id;

  RETURN v_journal;
END;
$$;

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
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_purchase_amount IS NULL OR p_purchase_amount <= 0 THEN
    RAISE EXCEPTION 'Purchase amount must be positive';
  END IF;

  IF p_paid_through_account_id IS NULL THEN
    RAISE EXCEPTION 'Paid-through account is required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  v_number := public.next_erp_document_number('fixed_asset');

  INSERT INTO public.erp_fixed_assets (
    asset_number, name, serial_number, brand, reference, details,
    purchase_date, purchase_amount, paid_through_account_id,
    tax_amount, tax_mode, vendor_id, warranty_expiry, warranty_details,
    maintenance_info, store_id, created_by
  )
  VALUES (
    v_number, p_name, p_serial_number, p_brand, p_reference, p_details,
    p_purchase_date, p_purchase_amount, p_paid_through_account_id,
    COALESCE(p_tax_amount, 0), COALESCE(p_tax_mode, 'exclusive'), p_vendor_id,
    p_warranty_expiry, p_warranty_details, p_maintenance_info, p_store_id, p_created_by
  )
  RETURNING id INTO v_id;

  PERFORM public.post_journal_for_fixed_asset(v_id, p_created_by);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_erp_fixed_asset(
  p_asset_id uuid,
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
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_purchase_amount IS NULL OR p_purchase_amount <= 0 THEN
    RAISE EXCEPTION 'Purchase amount must be positive';
  END IF;

  IF p_paid_through_account_id IS NULL THEN
    RAISE EXCEPTION 'Paid-through account is required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_actor);
  PERFORM public.void_journals_for_entity('fixed_asset', p_asset_id);

  UPDATE public.erp_fixed_assets
  SET
    name = p_name,
    purchase_amount = p_purchase_amount,
    store_id = p_store_id,
    purchase_date = p_purchase_date,
    paid_through_account_id = p_paid_through_account_id,
    serial_number = p_serial_number,
    brand = p_brand,
    reference = p_reference,
    details = p_details,
    tax_amount = COALESCE(p_tax_amount, 0),
    tax_mode = COALESCE(p_tax_mode, 'exclusive'),
    vendor_id = p_vendor_id,
    warranty_expiry = p_warranty_expiry,
    warranty_details = p_warranty_details,
    maintenance_info = p_maintenance_info,
    journal_entry_id = NULL,
    updated_at = now()
  WHERE id = p_asset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fixed asset not found';
  END IF;

  PERFORM public.post_journal_for_fixed_asset(p_asset_id, p_actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_erp_fixed_asset(
  p_asset_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.void_journals_for_entity('fixed_asset', p_asset_id);
  DELETE FROM public.erp_fixed_assets WHERE id = p_asset_id;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_post_journal ON public.invoices;
CREATE TRIGGER trg_invoices_post_journal
  AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_post_invoice_journal();

CREATE OR REPLACE FUNCTION public.trg_post_invoice_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('issued', 'partial', 'paid') THEN
    PERFORM public.post_journal_for_invoice(NEW.id, COALESCE(auth.uid(), NEW.user_id));
  ELSIF NEW.status = 'cancelled' THEN
    PERFORM public.void_journals_for_entity('invoice', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Allow online + ERP invoices to post (AR / income).
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
  v_existing uuid;
  v_subtotal numeric;
  v_tax numeric;
  v_total numeric;
  v_income numeric;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'invoice'
    AND source_entity_id = p_invoice_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    PERFORM public.sync_cash_book_from_journal(v_existing);
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('invoice') THEN
    RETURN NULL;
  END IF;

  SELECT subtotal, gst_amount, total_amount, store_id, invoice_number,
         COALESCE(issued_at::date, created_at::date)
  INTO v_subtotal, v_tax, v_total, v_store_id, v_number, v_date
  FROM public.invoices
  WHERE id = p_invoice_id
    AND status IN ('issued', 'partial', 'paid');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found or not eligible for journal posting';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Invoice total must be positive for journal posting';
  END IF;

  IF v_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(v_store_id, p_actor);
  END IF;

  v_tax := COALESCE(v_tax, 0);
  v_total := COALESCE(v_total, 0);
  v_income := GREATEST(v_total - v_tax, 0);

  PERFORM public.ensure_system_ledger_account('ACCOUNTS_RECIEVABLE', 'Accounts Recievable');
  PERFORM public.ensure_system_ledger_account('INCOME', 'Income');
  PERFORM public.ensure_system_ledger_account('OVERSEAS_TAX_PAYABLE', 'Overseas Tax Payable');

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'ACCOUNTS_RECIEVABLE', 'debit', v_total, 'description', 'Invoice ' || v_number)
  );

  IF v_income > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'INCOME', 'credit', v_income, 'description', 'Sales')
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

CREATE OR REPLACE FUNCTION public.cancel_erp_invoice(
  p_invoice_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_store_id uuid;
  v_paid numeric;
  v_credits numeric;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id
  INTO v_status, v_store_id
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_payment_allocations
  WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.erp_credit_note_applications
  WHERE invoice_id = p_invoice_id;

  IF v_paid > 0 OR v_credits > 0 THEN
    RAISE EXCEPTION 'Cannot cancel invoice with payments or credit notes applied';
  END IF;

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, 1);
  PERFORM public.void_journals_for_entity('invoice', p_invoice_id);

  UPDATE public.invoices
  SET status = 'cancelled', balance_due = 0
  WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_erp_invoice(
  p_invoice_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_lines jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_paid numeric;
  v_credits numeric;
  v_store_id uuid;
  v_user_id uuid;
  v_line jsonb;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_unit_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  SELECT status, store_id, user_id
  INTO v_status, v_store_id, v_user_id
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot edit a cancelled invoice';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_payment_allocations
  WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.erp_credit_note_applications
  WHERE invoice_id = p_invoice_id;

  IF v_paid > 0 OR v_credits > 0 THEN
    RAISE EXCEPTION 'Cannot edit invoice after payments or credit notes';
  END IF;

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, 1);
  PERFORM public.void_journals_for_entity('invoice', p_invoice_id);

  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    IF p_tax_inclusive THEN
      v_taxable := ROUND(v_unit_price * v_qty / (1 + v_tax_rate / 100), 2);
      v_line_tax := ROUND(v_unit_price * v_qty - v_taxable, 2);
      v_line_total := ROUND(v_unit_price * v_qty, 2);
    ELSE
      v_taxable := ROUND(v_unit_price * v_qty, 2);
      v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
      v_line_total := v_taxable + v_line_tax;
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, variant_id, product_name, quantity, unit_price,
      base_price, gst_rate, gst_amount, total_amount, vendor_id,
      unit_id, description, taxable_amount
    )
    VALUES (
      p_invoice_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_qty,
      v_unit_price,
      COALESCE((v_line ->> 'purchase_price')::numeric, v_unit_price),
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(v_line ->> 'vendor_id', '')::uuid,
      NULLIF(v_line ->> 'unit_id', '')::uuid,
      v_line ->> 'description',
      v_taxable
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

  UPDATE public.invoices
  SET
    due_date = p_due_date,
    subtotal = v_subtotal,
    gst_amount = v_tax,
    total_amount = v_total,
    balance_due = v_total,
    discount = COALESCE(p_discount, 0),
    reference = p_reference,
    notes = p_notes,
    tax_inclusive = COALESCE(p_tax_inclusive, false),
    status = CASE WHEN v_status = 'pending' THEN 'issued' ELSE v_status END,
    issued_at = COALESCE(issued_at, now())
  WHERE id = p_invoice_id;

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, -1);
  PERFORM public.recalculate_invoice_balance(p_invoice_id);
  PERFORM public.post_journal_for_invoice(p_invoice_id, p_actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_erp_purchase_bill(
  p_bill_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_paid numeric;
  v_credits numeric;
  v_store_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id
  INTO v_status, v_store_id
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_supplier_payment_allocations
  WHERE purchase_bill_id = p_bill_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.erp_vendor_credit_applications
  WHERE purchase_bill_id = p_bill_id;

  IF v_paid > 0 OR v_credits > 0 THEN
    RAISE EXCEPTION 'Cannot cancel bill with payments or vendor credits applied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.erp_purchase_bills
    WHERE id = p_bill_id AND inventory_committed = true
  ) THEN
    PERFORM public.inventory_apply_purchase_bill_stock(p_bill_id, -1);
  END IF;

  PERFORM public.void_journals_for_entity('purchase_bill', p_bill_id);

  UPDATE public.erp_purchase_bills
  SET status = 'cancelled', balance_due = 0, updated_at = now()
  WHERE id = p_bill_id;
END;
$$;

-- ─── Entity void triggers ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_void_expense_journals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.void_journals_for_entity('expense', OLD.id);
    RETURN OLD;
  END IF;
  PERFORM public.void_journals_for_entity('expense', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_void_journal ON public.erp_expenses;
CREATE TRIGGER trg_expenses_void_journal
  BEFORE UPDATE OR DELETE ON public.erp_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_void_expense_journals();

DROP TRIGGER IF EXISTS trg_expenses_post_journal_update ON public.erp_expenses;
CREATE TRIGGER trg_expenses_post_journal_update
  AFTER UPDATE ON public.erp_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_post_expense_journal();

CREATE OR REPLACE FUNCTION public.trg_void_customer_payment_journals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.void_journals_for_entity('customer_payment', OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_payments_void_journal ON public.erp_customer_payments;
CREATE TRIGGER trg_customer_payments_void_journal
  BEFORE DELETE ON public.erp_customer_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_void_customer_payment_journals();

CREATE OR REPLACE FUNCTION public.trg_void_supplier_payment_journals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.void_journals_for_entity('supplier_payment', OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_payments_void_journal ON public.erp_supplier_payments;
CREATE TRIGGER trg_supplier_payments_void_journal
  BEFORE DELETE ON public.erp_supplier_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_void_supplier_payment_journals();

CREATE OR REPLACE FUNCTION public.trg_void_credit_note_journals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.void_journals_for_entity('credit_note', OLD.id);
    RETURN OLD;
  END IF;
  IF NEW.status = 'cancelled' THEN
    PERFORM public.void_journals_for_entity('credit_note', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_notes_void_journal ON public.erp_credit_notes;
CREATE TRIGGER trg_credit_notes_void_journal
  BEFORE UPDATE OR DELETE ON public.erp_credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_void_credit_note_journals();

CREATE OR REPLACE FUNCTION public.delete_erp_vat_payment(
  p_payment_id uuid,
  p_deleted_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.erp_vat_payments%ROWTYPE;
BEGIN
  IF NOT public.is_staff_user(p_deleted_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_payment
  FROM public.erp_vat_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT payment not found';
  END IF;

  PERFORM public.void_journals_for_entity('vat_payment', p_payment_id);
  IF v_payment.account_transaction_id IS NOT NULL THEN
    PERFORM public.void_journals_for_entity('banking_transaction', v_payment.account_transaction_id);
    DELETE FROM public.erp_account_transactions WHERE id = v_payment.account_transaction_id;
  END IF;

  UPDATE public.erp_vat_returns
  SET balance_due = balance_due + v_payment.amount,
      updated_at = now()
  WHERE id = v_payment.vat_return_id;

  DELETE FROM public.erp_vat_payments
  WHERE id = p_payment_id;
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
DECLARE
  v_status text;
  v_payment_count int;
BEGIN
  IF NOT public.is_staff_user(p_deleted_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status INTO v_status
  FROM public.erp_vat_returns
  WHERE id = p_return_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return not found';
  END IF;

  SELECT COUNT(*) INTO v_payment_count
  FROM public.erp_vat_payments
  WHERE vat_return_id = p_return_id;

  IF v_payment_count > 0 THEN
    RAISE EXCEPTION 'Delete VAT payments before deleting this return';
  END IF;

  PERFORM public.void_journals_for_entity('vat_return', p_return_id);

  IF v_status = 'unfiled' THEN
    DELETE FROM public.erp_vat_returns WHERE id = p_return_id;
    RETURN;
  END IF;

  DELETE FROM public.erp_vat_returns WHERE id = p_return_id;
END;
$$;

-- ─── Backfill ────────────────────────────────────────────────────────────────

-- Post missing fixed-asset journals, then mirror every posted cash line.
DO $$
DECLARE
  v_id uuid;
  v_actor uuid;
BEGIN
  FOR v_id, v_actor IN
    SELECT a.id, a.created_by
    FROM public.erp_fixed_assets a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.journal_entries j
      WHERE j.source_entity_type = 'fixed_asset'
        AND j.source_entity_id = a.id
        AND j.status = 'posted'
    )
  LOOP
    BEGIN
      PERFORM public.post_journal_for_fixed_asset(v_id, COALESCE(v_actor, auth.uid()));
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped fixed asset %: %', v_id, SQLERRM;
    END;
  END LOOP;

  FOR v_id IN
    SELECT id FROM public.journal_entries WHERE status = 'posted'
  LOOP
    PERFORM public.sync_cash_book_from_journal(v_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_system_ledger_account(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_cash_book_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cash_book_from_journal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_posted_journal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_journals_for_entity(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_fixed_asset(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_erp_fixed_asset(uuid, text, numeric, uuid, date, uuid, text, text, text, text, numeric, text, uuid, date, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_erp_fixed_asset(uuid, uuid) TO authenticated;

COMMIT;
