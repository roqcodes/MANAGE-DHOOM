-- Phase 5 security hardening: financial RPC authorization
-- Additive REPLACE only — no schema/business-logic redesign.

-- ─── Revoke broad execute grants on sensitive RPCs ───────────────────────────
 
REVOKE ALL ON FUNCTION public.get_account_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_account_balance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_posting_enabled(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, text, jsonb, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_erp_document_number(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_erp_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_posted_journal_entry(date, text, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_for_invoice(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_for_customer_payment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_for_purchase_bill(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_for_supplier_payment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_for_expense(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_for_credit_note(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_for_vendor_credit_application(uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_for_credit_note_application(uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_erp_reconciliation_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_erp_financial_dashboard() FROM PUBLIC;

-- ─── Staff-only read helpers ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_account_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN (SELECT id FROM public.accounts WHERE code = p_code LIMIT 1);
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user() THEN
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

CREATE OR REPLACE FUNCTION public.is_posting_enabled(p_event_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN COALESCE(
    (SELECT is_enabled FROM public.erp_posting_rules WHERE event_type = p_event_type),
    false
  );
END;
$$;

-- ─── ERP context & audit (staff only) ────────────────────────────────────────

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
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

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
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_store_id IS NULL THEN
    SELECT (public.get_erp_context(p_user_id) ->> 'store_id')::uuid
    INTO v_store_id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, store_id, action, entity_type, entity_id,
    description, metadata, old_data, new_data
  )
  VALUES (
    p_user_id, v_store_id, p_action, p_entity_type, p_entity_id,
    p_description, COALESCE(p_metadata, '{}'::jsonb), p_old_data, p_new_data
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.erp_document_sequences
  SET next_number = next_number + 1, updated_at = now()
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

-- ─── Journal entry core (staff + store access) ───────────────────────────────

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

-- ─── Entity posting RPCs (authorize before source lookup) ──────────────────

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
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('invoice') THEN
    RETURN NULL;
  END IF;

  SELECT subtotal, gst_amount, total_amount, store_id, invoice_number, created_at::date
  INTO v_subtotal, v_tax, v_total, v_store_id, v_number, v_date
  FROM public.invoices
  WHERE id = p_invoice_id
    AND source = 'erp'
    AND status IN ('issued', 'partial', 'paid');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found or not eligible for journal posting';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Invoice total must be positive for journal posting';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

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
  v_existing uuid;
  v_amount numeric;
  v_account_id uuid;
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
  WHERE source_entity_type = 'customer_payment'
    AND source_entity_id = p_payment_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('customer_payment') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, account_id, store_id, payment_date, payment_number
  INTO v_amount, v_account_id, v_store_id, v_date, v_number
  FROM public.erp_customer_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer payment not found';
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Customer payment amount must be positive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

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
  v_existing uuid;
  v_total numeric;
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
  WHERE source_entity_type = 'purchase_bill'
    AND source_entity_id = p_bill_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('purchase_bill') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, store_id, purchase_date, purchase_bill_number
  INTO v_total, v_store_id, v_date, v_number
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
    AND status IN ('finalized', 'partial', 'paid');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found or not eligible for journal posting';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Purchase bill total must be positive for journal posting';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

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
  v_existing uuid;
  v_amount numeric;
  v_account_id uuid;
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
  WHERE source_entity_type = 'supplier_payment'
    AND source_entity_id = p_payment_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('supplier_payment') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, account_id, store_id, payment_date, payment_number
  INTO v_amount, v_account_id, v_store_id, v_date, v_number
  FROM public.erp_supplier_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier payment not found';
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Supplier payment amount must be positive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

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
  v_existing uuid;
  v_total numeric;
  v_expense_account uuid;
  v_paid_account uuid;
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
  WHERE source_entity_type = 'expense'
    AND source_entity_id = p_expense_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('expense') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, account_id, paid_through_account_id, store_id, expense_date, expense_number
  INTO v_total, v_expense_account, v_paid_account, v_store_id, v_date, v_number
  FROM public.erp_expenses
  WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'Expense total must be positive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

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
  v_existing uuid;
  v_total numeric;
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
  WHERE source_entity_type = 'credit_note'
    AND source_entity_id = p_credit_note_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('credit_note') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, store_id, credit_note_date, credit_note_number
  INTO v_total, v_store_id, v_date, v_number
  FROM public.erp_credit_notes
  WHERE id = p_credit_note_id AND status IN ('issued', 'applied');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note not found or not eligible for journal posting';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Credit note total must be positive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'INCOME', 'debit', v_total, 'description', 'Credit note'),
    jsonb_build_object('account_code', 'ACCOUNTS_RECIEVABLE', 'credit', v_total, 'description', 'AR reduction')
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Credit note ' || v_number, v_store_id, 'credit_note', p_credit_note_id, v_lines, p_actor
  );
END;
$$;

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
  v_existing uuid;
  v_lines jsonb;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Vendor credit application amount must be positive';
  END IF;

  SELECT id INTO v_app_id
  FROM public.erp_vendor_credit_applications
  WHERE vendor_credit_id = p_credit_id AND purchase_bill_id = p_bill_id;

  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'Vendor credit application not found';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'vendor_credit_application'
    AND source_entity_id = v_app_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('vendor_credit_application') THEN
    RETURN NULL;
  END IF;

  SELECT store_id INTO v_store_id FROM public.erp_purchase_bills WHERE id = p_bill_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill not found for vendor credit application';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

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
  v_existing uuid;
  v_lines jsonb;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit note application amount must be positive';
  END IF;

  SELECT id INTO v_app_id
  FROM public.erp_credit_note_applications
  WHERE credit_note_id = p_credit_note_id AND invoice_id = p_invoice_id;

  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'Credit note application not found';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'credit_note_application'
    AND source_entity_id = v_app_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('credit_note_application') THEN
    RETURN NULL;
  END IF;

  SELECT store_id INTO v_store_id FROM public.invoices WHERE id = p_invoice_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found for credit note application';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

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

-- ─── Financial dashboard / reconciliation (staff + authenticated only) ───────

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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
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

-- ─── Grants: authenticated staff ERP flows only ────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_account_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_posting_enabled(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, text, jsonb, jsonb, jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_erp_document_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_posted_journal_entry(date, text, uuid, text, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_customer_payment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_purchase_bill(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_supplier_payment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_expense(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_credit_note(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_vendor_credit_application(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_credit_note_application(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_reconciliation_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_financial_dashboard() TO authenticated;
