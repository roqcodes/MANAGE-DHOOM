-- Commercial / price-concession discounts after a bill or invoice is posted.
-- Do not rewrite the source document. Record a credit memo (no stock) that:
--   supplier: DR Accounts Payable, CR Discount Received (income)
--   customer: DR Discount Allowed (expense), CR Accounts Receivable
-- Optional source document: apply up to remaining balance; leftover stays
-- unapplied and is consumed by account settlement (FIFO), same as other credits.

BEGIN;

-- Discount memos use DC-*, not VC-/CN- (returns keep vendor credit / credit note prefixes).
INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES ('commercial_discount', 'DC', 1, 0)
ON CONFLICT (document_type) DO UPDATE
SET prefix = EXCLUDED.prefix
WHERE public.erp_document_sequences.prefix IS DISTINCT FROM 'DC';

-- ─── Ledger accounts ────────────────────────────────────────────────────────

INSERT INTO public.accounts (account_type_id, name, description, code, is_system, is_locked)
SELECT t.id, 'Discount Received', 'Purchase discounts and vendor price concessions', 'DISCOUNT_RECEIVED', true, true
FROM public.account_types t
WHERE t.name = 'Other Income'
  AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.code = 'DISCOUNT_RECEIVED')
LIMIT 1;

INSERT INTO public.accounts (account_type_id, name, description, code, is_system, is_locked)
SELECT t.id, 'Discount Allowed', 'Sales discounts and customer price concessions', 'DISCOUNT_ALLOWED', true, true
FROM public.account_types t
WHERE t.name = 'Expense'
  AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.code = 'DISCOUNT_ALLOWED')
LIMIT 1;

ALTER TABLE public.erp_vendor_credits
  ADD COLUMN IF NOT EXISTS credit_kind text NOT NULL DEFAULT 'return',
  ADD COLUMN IF NOT EXISTS discount_account_id uuid REFERENCES public.accounts (id);

ALTER TABLE public.erp_credit_notes
  ADD COLUMN IF NOT EXISTS credit_kind text NOT NULL DEFAULT 'return',
  ADD COLUMN IF NOT EXISTS discount_account_id uuid REFERENCES public.accounts (id);

ALTER TABLE public.erp_vendor_credits
  DROP CONSTRAINT IF EXISTS erp_vendor_credits_credit_kind_check;
ALTER TABLE public.erp_vendor_credits
  ADD CONSTRAINT erp_vendor_credits_credit_kind_check
  CHECK (credit_kind IN ('return', 'discount'));

ALTER TABLE public.erp_credit_notes
  DROP CONSTRAINT IF EXISTS erp_credit_notes_credit_kind_check;
ALTER TABLE public.erp_credit_notes
  ADD CONSTRAINT erp_credit_notes_credit_kind_check
  CHECK (credit_kind IN ('return', 'discount'));

COMMENT ON COLUMN public.erp_vendor_credits.credit_kind IS
  'return = goods/price lines that may reduce stock; discount = commercial concession, no stock.';
COMMENT ON COLUMN public.erp_credit_notes.credit_kind IS
  'return = sales return (may restore stock / reverse COGS); discount = commercial concession, no stock.';

UPDATE public.erp_posting_rules
SET
  mapping_notes = 'Return: DR AP, CR Stock. Discount: DR AP, CR Discount Received (and input tax if present). Application is subledger-only.',
  updated_at = now()
WHERE event_type = 'vendor_credit';

UPDATE public.erp_posting_rules
SET
  mapping_notes = 'Return: DR revenue/tax (+ COGS reversal). Discount: DR Discount Allowed, CR AR (and output tax if present). Application is subledger-only.',
  updated_at = now()
WHERE event_type = 'credit_note';

-- ─── Vendor credit GL ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_journal_for_vendor_credit(
  p_credit_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_total numeric;
  v_subtotal numeric;
  v_tax numeric;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_kind text;
  v_discount_account_id uuid;
  v_lines jsonb;
  v_discount_line jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'vendor_credit'
    AND source_entity_id = p_credit_id
    AND status = 'posted';

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('vendor_credit') THEN
    RETURN NULL;
  END IF;

  SELECT
    total_amount,
    COALESCE(subtotal, GREATEST(total_amount - COALESCE(tax_amount, 0), 0)),
    COALESCE(tax_amount, 0),
    store_id,
    credit_date,
    credit_number,
    COALESCE(credit_kind, 'return'),
    discount_account_id
  INTO
    v_total, v_subtotal, v_tax, v_store_id, v_date, v_number, v_kind, v_discount_account_id
  FROM public.erp_vendor_credits
  WHERE id = p_credit_id
    AND status IN ('issued', 'applied');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor credit not found or not eligible for journal posting';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Vendor credit total must be positive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  IF v_kind = 'discount' THEN
    PERFORM public.ensure_system_ledger_account('ACCOUNTS_PAYABLE', 'Accounts Payable');
    PERFORM public.ensure_system_ledger_account('DISCOUNT_RECEIVED', 'Other Income');
    IF v_tax > 0 THEN
      PERFORM public.ensure_system_ledger_account('OVERSEAS_TAX_PAYABLE', 'Overseas Tax Payable');
    END IF;

    IF v_discount_account_id IS NOT NULL THEN
      v_discount_line := jsonb_build_object(
        'account_id', v_discount_account_id,
        'credit', v_subtotal,
        'description', 'Purchase discount ' || v_number
      );
    ELSE
      v_discount_line := jsonb_build_object(
        'account_code', 'DISCOUNT_RECEIVED',
        'credit', v_subtotal,
        'description', 'Purchase discount ' || v_number
      );
    END IF;

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', 'ACCOUNTS_PAYABLE',
        'debit', v_total,
        'description', 'Vendor discount ' || v_number
      ),
      v_discount_line
    );

    IF v_tax > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_code', 'OVERSEAS_TAX_PAYABLE',
          'credit', v_tax,
          'description', 'Input tax reversal on discount'
        )
      );
    END IF;

    RETURN public.create_posted_journal_entry(
      v_date, 'Purchase discount ' || v_number, v_store_id,
      'vendor_credit', p_credit_id, v_lines, p_actor
    );
  END IF;

  PERFORM public.ensure_system_ledger_account('ACCOUNTS_PAYABLE', 'Accounts Payable');
  PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', 'ACCOUNTS_PAYABLE',
      'debit', v_total,
      'description', 'Vendor credit ' || v_number
    ),
    jsonb_build_object(
      'account_code', 'STOCK',
      'credit', v_total,
      'description', 'Purchase reversal'
    )
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Vendor credit ' || v_number, v_store_id,
    'vendor_credit', p_credit_id, v_lines, p_actor
  );
END;
$$;

-- ─── Credit note GL (keep return/COGS path; add discount path) ───────────────

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
  v_existing uuid;
  v_subtotal numeric;
  v_tax numeric;
  v_total numeric;
  v_cogs numeric;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_kind text;
  v_discount_account_id uuid;
  v_lines jsonb;
  v_discount_line jsonb;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'credit_note'
    AND source_entity_id = p_credit_note_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('credit_note') THEN
    RETURN NULL;
  END IF;

  SELECT
    subtotal,
    tax_amount,
    total_amount,
    store_id,
    credit_note_date,
    credit_note_number,
    COALESCE(credit_kind, 'return'),
    discount_account_id
  INTO
    v_subtotal, v_tax, v_total, v_store_id, v_date, v_number, v_kind, v_discount_account_id
  FROM public.erp_credit_notes
  WHERE id = p_credit_note_id AND status IN ('issued', 'applied');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note not found or not eligible for journal posting';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Credit note total must be positive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_subtotal := COALESCE(v_subtotal, GREATEST(v_total - COALESCE(v_tax, 0), 0));
  v_tax := COALESCE(v_tax, 0);

  IF v_kind = 'discount' THEN
    PERFORM public.ensure_system_ledger_account('ACCOUNTS_RECIEVABLE', 'Accounts Recievable');
    PERFORM public.ensure_system_ledger_account('DISCOUNT_ALLOWED', 'Expense');
    IF v_tax > 0 THEN
      PERFORM public.ensure_system_ledger_account('OVERSEAS_TAX_PAYABLE', 'Overseas Tax Payable');
    END IF;

    IF v_discount_account_id IS NOT NULL THEN
      v_discount_line := jsonb_build_object(
        'account_id', v_discount_account_id,
        'debit', v_subtotal,
        'description', 'Sales discount ' || v_number
      );
    ELSE
      v_discount_line := jsonb_build_object(
        'account_code', 'DISCOUNT_ALLOWED',
        'debit', v_subtotal,
        'description', 'Sales discount ' || v_number
      );
    END IF;

    v_lines := jsonb_build_array();
    IF v_subtotal > 0 THEN
      v_lines := v_lines || jsonb_build_array(v_discount_line);
    END IF;
    IF v_tax > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_code', 'OVERSEAS_TAX_PAYABLE',
          'debit', v_tax,
          'description', 'Output tax reversal on discount'
        )
      );
    END IF;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', 'ACCOUNTS_RECIEVABLE',
        'credit', v_total,
        'description', 'AR reduction'
      )
    );

    RETURN public.create_posted_journal_entry(
      v_date, 'Sales discount ' || v_number, v_store_id,
      'credit_note', p_credit_note_id, v_lines, p_actor
    );
  END IF;

  v_cogs := public.erp_credit_note_recognized_cogs_total(p_credit_note_id, v_store_id);

  PERFORM public.ensure_system_ledger_account('INCOME', 'Income');
  PERFORM public.ensure_system_ledger_account('ACCOUNTS_RECIEVABLE', 'Accounts Recievable');
  PERFORM public.ensure_system_ledger_account('OVERSEAS_TAX_PAYABLE', 'Overseas Tax Payable');
  IF v_cogs > 0 THEN
    PERFORM public.ensure_system_ledger_account('COST_OF_GOODS_SOLD', 'Cost of Goods Sold');
    PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');
  END IF;

  v_lines := jsonb_build_array();

  IF v_subtotal > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'INCOME', 'debit', v_subtotal, 'description', 'Credit note revenue reversal')
    );
  END IF;

  IF v_tax > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'OVERSEAS_TAX_PAYABLE', 'debit', v_tax, 'description', 'Output tax reversal')
    );
  END IF;

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('account_code', 'ACCOUNTS_RECIEVABLE', 'credit', v_total, 'description', 'AR reduction')
  );

  IF v_cogs > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'STOCK', 'debit', v_cogs, 'description', 'Inventory return'),
      jsonb_build_object('account_code', 'COST_OF_GOODS_SOLD', 'credit', v_cogs, 'description', 'COGS reversal')
    );
  END IF;

  RETURN public.create_posted_journal_entry(
    v_date, 'Credit note ' || v_number, v_store_id, 'credit_note', p_credit_note_id, v_lines, p_actor
  );
END;
$$;

-- ─── Record discount RPC ────────────────────────────────────────────────────

-- Resolve ambiguity when both 9- and 10-arg log_audit_event overloads exist (pre-salesmen DROP).
DROP FUNCTION IF EXISTS public.log_audit_event(text, text, uuid, text, jsonb, jsonb, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.record_erp_commercial_discount(
  p_side text,
  p_party_id uuid,
  p_store_id uuid,
  p_discount_date date,
  p_amount numeric,
  p_tax_rate_percent numeric DEFAULT 0,
  p_source_document_id uuid DEFAULT NULL,
  p_discount_account_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor, auth.uid());
  v_total numeric;
  v_tax numeric;
  v_subtotal numeric;
  v_tax_rate numeric := COALESCE(p_tax_rate_percent, 0);
  v_id uuid;
  v_number text;
  v_source_party uuid;
  v_source_store uuid;
  v_source_status text;
  v_source_balance numeric := 0;
  v_apply_amount numeric := 0;
  v_account_category text;
  v_line_name text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_side NOT IN ('supplier', 'customer') THEN
    RAISE EXCEPTION 'Side must be supplier or customer';
  END IF;

  IF p_party_id IS NULL THEN
    RAISE EXCEPTION 'Party is required';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_actor);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Discount amount must be greater than zero';
  END IF;

  IF p_amount > 1000000000 THEN
    RAISE EXCEPTION 'Discount amount is too large';
  END IF;

  IF v_tax_rate < 0 OR v_tax_rate > 100 THEN
    RAISE EXCEPTION 'Tax rate must be between 0 and 100';
  END IF;

  -- Amount is the payable/receivable reduction. Optional tax rate is inclusive.
  v_total := ROUND(p_amount, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Discount amount must be greater than zero';
  END IF;

  IF v_tax_rate > 0 THEN
    v_tax := ROUND(v_total * v_tax_rate / (100 + v_tax_rate), 2);
  ELSE
    v_tax := 0;
  END IF;
  v_subtotal := ROUND(v_total - v_tax, 2);
  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Discount net amount must be greater than zero';
  END IF;

  IF p_discount_account_id IS NOT NULL THEN
    SELECT at.account_category
    INTO v_account_category
    FROM public.accounts a
    JOIN public.account_types at ON at.id = a.account_type_id
    WHERE a.id = p_discount_account_id
      AND a.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Discount account not found or inactive';
    END IF;

    IF p_side = 'supplier' AND v_account_category IS DISTINCT FROM 'Income' THEN
      RAISE EXCEPTION 'Purchase discount must post to an income account';
    END IF;
    IF p_side = 'customer' AND v_account_category IS DISTINCT FROM 'Expense' THEN
      RAISE EXCEPTION 'Sales discount must post to an expense account';
    END IF;
  END IF;

  IF p_side = 'supplier' THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_party_id) THEN
      RAISE EXCEPTION 'Vendor not found';
    END IF;

    IF p_source_document_id IS NOT NULL THEN
      SELECT vendor_id, store_id, status, balance_due
      INTO v_source_party, v_source_store, v_source_status, v_source_balance
      FROM public.erp_purchase_bills
      WHERE id = p_source_document_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Source purchase bill not found';
      END IF;
      IF v_source_status IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot record a discount against a draft or cancelled bill';
      END IF;
      IF v_source_party IS DISTINCT FROM p_party_id THEN
        RAISE EXCEPTION 'Discount vendor must match the source bill';
      END IF;
      IF v_source_store IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Discount store must match the source bill';
      END IF;
    END IF;

    SELECT t.out_id, t.out_ref INTO v_id, v_number
    FROM public.erp_next_document_ref('commercial_discount') AS t;

    v_line_name := 'Purchase discount';

    INSERT INTO public.erp_vendor_credits (
      id, credit_number, vendor_id, store_id, reference, credit_date,
      status, notes, subtotal, tax_amount, total_amount, balance_remaining,
      created_by, source_bill_id, credit_kind, discount_account_id,
      inventory_committed
    )
    VALUES (
      v_id, v_number, p_party_id, p_store_id, p_reference, p_discount_date,
      'issued', p_notes, v_subtotal, v_tax, v_total, v_total,
      v_actor, p_source_document_id, 'discount', p_discount_account_id,
      false
    );

    INSERT INTO public.erp_vendor_credit_lines (
      vendor_credit_id, variant_id, product_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_id, NULL, NULL, v_line_name, 1,
      v_subtotal, v_tax_rate, v_tax, v_total
    );

    v_apply_amount := LEAST(v_total, GREATEST(COALESCE(v_source_balance, 0), 0));
    IF p_source_document_id IS NOT NULL AND v_apply_amount > 0 THEN
      PERFORM public.apply_erp_vendor_credit(v_id, p_source_document_id, v_apply_amount, v_actor);
    END IF;

    PERFORM public.log_audit_event(
      'record_commercial_discount',
      'vendor_credit',
      v_id,
      format(
        'Purchase discount %s of %s recorded%s',
        v_number,
        v_total::text,
        CASE
          WHEN v_apply_amount > 0 THEN format(' and applied %s to bill', v_apply_amount::text)
          ELSE ''
        END
      ),
      jsonb_build_object(
        'side', p_side,
        'amount', v_total,
        'tax_amount', v_tax,
        'applied_amount', v_apply_amount,
        'unapplied_amount', ROUND(v_total - v_apply_amount, 2),
        'source_bill_id', p_source_document_id,
        'vendor_id', p_party_id,
        'discount_account_id', p_discount_account_id
      ),
      NULL,
      NULL,
      p_store_id,
      v_actor,
      NULL
    );
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_party_id) THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;

    IF p_source_document_id IS NOT NULL THEN
      SELECT user_id, store_id, status, balance_due
      INTO v_source_party, v_source_store, v_source_status, v_source_balance
      FROM public.invoices
      WHERE id = p_source_document_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Source invoice not found';
      END IF;
      IF v_source_status IN ('draft', 'cancelled', 'pending') THEN
        RAISE EXCEPTION 'Cannot record a discount against a draft, pending, or cancelled invoice';
      END IF;
      IF v_source_party IS DISTINCT FROM p_party_id THEN
        RAISE EXCEPTION 'Discount customer must match the source invoice';
      END IF;
      IF v_source_store IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Discount store must match the source invoice';
      END IF;
    END IF;

    SELECT t.out_id, t.out_ref INTO v_id, v_number
    FROM public.erp_next_document_ref('commercial_discount') AS t;

    v_line_name := 'Sales discount';

    INSERT INTO public.erp_credit_notes (
      id, credit_note_number, store_id, user_id, reference, credit_note_date,
      status, notes, subtotal, tax_amount, total_amount, balance_remaining,
      created_by, inventory_committed, source_invoice_id, credit_kind, discount_account_id
    )
    VALUES (
      v_id, v_number, p_store_id, p_party_id, p_reference, p_discount_date,
      'issued', p_notes, v_subtotal, v_tax, v_total, v_total,
      v_actor, false, p_source_document_id, 'discount', p_discount_account_id
    );

    INSERT INTO public.erp_credit_note_lines (
      credit_note_id, variant_id, product_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_id, NULL, NULL, v_line_name, 1,
      v_subtotal, v_tax_rate, v_tax, v_total
    );

    v_apply_amount := LEAST(v_total, GREATEST(COALESCE(v_source_balance, 0), 0));
    IF p_source_document_id IS NOT NULL AND v_apply_amount > 0 THEN
      PERFORM public.apply_erp_credit_note(v_id, p_source_document_id, v_apply_amount, v_actor);
    END IF;

    PERFORM public.log_audit_event(
      'record_commercial_discount',
      'credit_note',
      v_id,
      format(
        'Sales discount %s of %s recorded%s',
        v_number,
        v_total::text,
        CASE
          WHEN v_apply_amount > 0 THEN format(' and applied %s to invoice', v_apply_amount::text)
          ELSE ''
        END
      ),
      jsonb_build_object(
        'side', p_side,
        'amount', v_total,
        'tax_amount', v_tax,
        'applied_amount', v_apply_amount,
        'unapplied_amount', ROUND(v_total - v_apply_amount, 2),
        'source_invoice_id', p_source_document_id,
        'user_id', p_party_id,
        'discount_account_id', p_discount_account_id
      ),
      NULL,
      NULL,
      p_store_id,
      v_actor,
      NULL
    );
  END IF;

  RETURN v_id;
END;
$$;

-- Discount credits must never move stock, even if finalize is called later.
CREATE OR REPLACE FUNCTION public.finalize_erp_vendor_credit(
  p_credit_id uuid,
  p_reduce_stock boolean DEFAULT false,
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
  v_total numeric;
  v_source_bill_id uuid;
  v_bill_balance numeric;
  v_apply_amount numeric;
  v_committed boolean;
  v_kind text;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id, total_amount, source_bill_id, inventory_committed, COALESCE(credit_kind, 'return')
  INTO v_status, v_store_id, v_total, v_source_bill_id, v_committed, v_kind
  FROM public.erp_vendor_credits
  WHERE id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor credit not found';
  END IF;

  IF v_status <> 'draft' AND v_status <> 'cancelled' THEN
    RETURN;
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft vendor credits can be finalized';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  UPDATE public.erp_vendor_credits
  SET
    status = 'issued',
    balance_remaining = v_total,
    updated_at = now()
  WHERE id = p_credit_id;

  IF v_kind <> 'discount' AND p_reduce_stock AND NOT COALESCE(v_committed, false) THEN
    PERFORM public.inventory_apply_vendor_credit_stock(p_credit_id, p_actor);
    UPDATE public.erp_vendor_credits
    SET inventory_committed = true
    WHERE id = p_credit_id;
  END IF;

  IF v_source_bill_id IS NOT NULL AND v_total > 0 THEN
    SELECT balance_due
    INTO v_bill_balance
    FROM public.erp_purchase_bills
    WHERE id = v_source_bill_id AND status <> 'cancelled'
    FOR UPDATE;

    v_apply_amount := LEAST(v_total, COALESCE(v_bill_balance, 0));
    IF v_apply_amount > 0 THEN
      PERFORM public.apply_erp_vendor_credit(
        p_credit_id, v_source_bill_id, v_apply_amount, p_actor
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_erp_credit_note(
  p_credit_note_id uuid,
  p_restore_stock boolean DEFAULT false,
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
  v_total numeric;
  v_source_invoice_id uuid;
  v_invoice_balance numeric;
  v_apply_amount numeric;
  v_already_committed boolean;
  v_kind text;
  v_line record;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id, total_amount, source_invoice_id, inventory_committed, COALESCE(credit_kind, 'return')
  INTO v_status, v_store_id, v_total, v_source_invoice_id, v_already_committed, v_kind
  FROM public.erp_credit_notes
  WHERE id = p_credit_note_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note not found';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft credit notes can be finalized';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  UPDATE public.erp_credit_notes
  SET
    status = 'issued',
    balance_remaining = v_total,
    updated_at = now()
  WHERE id = p_credit_note_id;

  IF v_kind <> 'discount' AND p_restore_stock AND NOT COALESCE(v_already_committed, false) THEN
    FOR v_line IN
      SELECT
        COALESCE(cl.product_id, pv.product_id) AS product_id,
        cl.quantity,
        cl.unit_price
      FROM public.erp_credit_note_lines cl
      LEFT JOIN public.product_variants pv ON pv.id = cl.variant_id
      WHERE cl.credit_note_id = p_credit_note_id
        AND COALESCE(cl.product_id, pv.product_id) IS NOT NULL
    LOOP
      PERFORM public.store_product_inventory_apply_delta(
        v_store_id, v_line.product_id, v_line.quantity, p_actor
      );

      PERFORM public.log_product_stock_movement(
        v_line.product_id,
        v_line.quantity,
        'return',
        p_credit_note_id,
        'credit_note',
        'Credit note stock restore',
        v_store_id,
        NULL,
        v_line.unit_price,
        p_actor
      );
    END LOOP;

    UPDATE public.erp_credit_notes
    SET inventory_committed = true
    WHERE id = p_credit_note_id;
  END IF;

  IF v_source_invoice_id IS NOT NULL AND v_total > 0 THEN
    SELECT balance_due
    INTO v_invoice_balance
    FROM public.invoices
    WHERE id = v_source_invoice_id AND status <> 'cancelled'
    FOR UPDATE;

    v_apply_amount := LEAST(v_total, COALESCE(v_invoice_balance, 0));
    IF v_apply_amount > 0 THEN
      PERFORM public.apply_erp_credit_note(
        p_credit_note_id, v_source_invoice_id, v_apply_amount, p_actor
      );
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_erp_commercial_discount(
  text, uuid, uuid, date, numeric, numeric, uuid, uuid, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_erp_commercial_discount(
  text, uuid, uuid, date, numeric, numeric, uuid, uuid, text, text, uuid
) TO authenticated;

-- BEFORE INSERT triggers always assign numbers; use DC for credit_kind = discount.
CREATE OR REPLACE FUNCTION public.erp_trg_assign_vendor_credit_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  NEW.credit_number := public.erp_format_document_ref(
    CASE WHEN COALESCE(NEW.credit_kind, 'return') = 'discount' THEN 'DC' ELSE 'VC' END,
    NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_trg_assign_credit_note_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  NEW.credit_note_number := public.erp_format_document_ref(
    CASE WHEN COALESCE(NEW.credit_kind, 'return') = 'discount' THEN 'DC' ELSE 'CN' END,
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_vendor_credits_document_ref ON public.erp_vendor_credits;
CREATE TRIGGER trg_erp_vendor_credits_document_ref
  BEFORE INSERT ON public.erp_vendor_credits
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_vendor_credit_ref();

DROP TRIGGER IF EXISTS trg_erp_credit_notes_document_ref ON public.erp_credit_notes;
CREATE TRIGGER trg_erp_credit_notes_document_ref
  BEFORE INSERT ON public.erp_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_credit_note_ref();

COMMIT;
