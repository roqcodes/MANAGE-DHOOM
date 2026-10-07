-- Accounting standards: subledger-only credit applications, vendor credit issue GL,
-- supplier bank charges, VAT netting, POS walk-in cash sales.

BEGIN;

-- ─── System walk-in customer (POS cash sales) ────────────────────────────────

DO $$
DECLARE
  v_walk_in_id uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_walk_in_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    VALUES (
      v_walk_in_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'walk-in@buyhub.internal',
      crypt('walk-in-no-login', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Walk-in Customer"}'::jsonb,
      false, '', '', '', ''
    );
  END IF;

  INSERT INTO public.users (
    id, name, email, role, is_verified, customer_number, contact_display_name
  )
  VALUES (
    v_walk_in_id,
    'Walk-in Customer',
    'walk-in@buyhub.internal',
    'customer',
    true,
    'WALK-IN',
    'Walk-in / POS cash sales'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    customer_number = EXCLUDED.customer_number,
    contact_display_name = EXCLUDED.contact_display_name,
    name = EXCLUDED.name;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_walk_in_customer()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.users
  WHERE customer_number = 'WALK-IN'
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT id INTO v_id
  FROM public.users
  WHERE email = 'walk-in@buyhub.internal'
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  RAISE EXCEPTION 'Walk-in customer is not configured — re-run migration 20260903200000';
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_walk_in_customer() TO authenticated;

-- ─── Posting rules: applications are subledger-only (Odoo / NetSuite pattern) ─

UPDATE public.erp_posting_rules
SET
  is_enabled = false,
  mapping_notes = 'Subledger matching only — GL posted at credit note issue. No journal on application.',
  updated_at = now()
WHERE event_type = 'credit_note_application';

UPDATE public.erp_posting_rules
SET
  is_enabled = false,
  mapping_notes = 'Subledger matching only — GL posted at vendor credit issue. No journal on application.',
  updated_at = now()
WHERE event_type = 'vendor_credit_application';

INSERT INTO public.erp_posting_rules (event_type, description, is_enabled, mapping_notes)
VALUES (
  'vendor_credit',
  'Vendor credit issued',
  true,
  'DR Accounts Payable, CR Stock — reverses purchase on vendor credit issue.'
)
ON CONFLICT (event_type) DO UPDATE
SET
  is_enabled = true,
  mapping_notes = EXCLUDED.mapping_notes,
  updated_at = now();

-- ─── Credit note application: no GL (AR subledger match only) ────────────────

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
BEGIN
  -- Standard ERP practice: credit note issue posts GL; application only clears AR subledger.
  RETURN NULL;
END;
$$;

-- ─── Vendor credit issue GL + application subledger-only ─────────────────────

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
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb;
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

  SELECT total_amount, store_id, credit_date, credit_number
  INTO v_total, v_store_id, v_date, v_number
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
BEGIN
  -- GL already posted when vendor credit was issued; application is AP subledger matching.
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_post_vendor_credit_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('issued', 'applied')
    AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    PERFORM public.post_journal_for_vendor_credit(
      NEW.id, COALESCE(auth.uid(), NEW.created_by)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_credits_post_journal ON public.erp_vendor_credits;
CREATE TRIGGER trg_vendor_credits_post_journal
  AFTER INSERT OR UPDATE OF status ON public.erp_vendor_credits
  FOR EACH ROW
  WHEN (NEW.status IN ('issued', 'applied'))
  EXECUTE FUNCTION public.trg_post_vendor_credit_journal();

-- ─── Supplier payment: bank charges split (mirror customer payments) ─────────

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
  v_bank_charges numeric;
  v_account_id uuid;
  v_bank_charges_account_id uuid;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb := '[]'::jsonb;
  v_net_payment numeric;
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

  SELECT
    total_amount, account_id, store_id, payment_date, payment_number,
    bank_charges, bank_charges_account_id
  INTO
    v_amount, v_account_id, v_store_id, v_date, v_number,
    v_bank_charges, v_bank_charges_account_id
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

  v_bank_charges := COALESCE(v_bank_charges, 0);
  v_net_payment := v_amount - v_bank_charges;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', 'ACCOUNTS_PAYABLE',
      'debit', v_amount,
      'description', 'AP payment ' || v_number
    )
  );

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'account_id', v_account_id,
      'credit', v_net_payment,
      'description', 'Payment ' || v_number
    )
  );

  IF v_bank_charges > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', v_bank_charges_account_id,
        'credit', v_bank_charges,
        'description', 'Bank charges ' || v_number
      )
    );
  END IF;

  RETURN public.create_posted_journal_entry(
    v_date, 'Supplier payment ' || v_number, v_store_id,
    'supplier_payment', p_payment_id, v_lines, p_actor
  );
END;
$$;

-- ─── VAT return: overdue invoices, net credit notes & vendor credits ─────────

CREATE OR REPLACE FUNCTION public.create_erp_vat_return(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  p_notes text DEFAULT NULL,
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
  v_output_credits numeric := 0;
  v_input numeric := 0;
  v_input_credits numeric := 0;
  v_label text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_id, v_number
  FROM public.erp_next_document_ref('vat_return') AS t;

  v_label := to_char(p_period_start, 'Mon - YYYY');

  SELECT COALESCE(SUM(gst_amount), 0) INTO v_output
  FROM public.invoices
  WHERE status IN ('issued', 'partial', 'paid', 'overdue')
    AND COALESCE(issued_at::date, created_at::date) BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_output_credits
  FROM public.erp_credit_notes
  WHERE status IN ('issued', 'applied')
    AND credit_note_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_input
  FROM public.erp_purchase_bills
  WHERE status IN ('finalized', 'partial', 'paid')
    AND purchase_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_input_credits
  FROM public.erp_vendor_credits
  WHERE status IN ('issued', 'applied')
    AND credit_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  v_output := GREATEST(0, v_output - v_output_credits);
  v_input := GREATEST(0, v_input - v_input_credits);

  INSERT INTO public.erp_vat_returns (
    id, return_number, period_start, period_end, period_label, store_id,
    output_tax, input_tax, total_tax_payable, balance_due, notes, created_by
  )
  VALUES (
    v_id, v_number, p_period_start, p_period_end, v_label, p_store_id,
    v_output, v_input, GREATEST(0, v_output - v_input), GREATEST(0, v_output - v_input),
    COALESCE(p_notes, ''), p_created_by
  );

  RETURN v_id;
END;
$$;

-- ─── Order → invoice: POS walk-in + cash payment ─────────────────────────────

CREATE OR REPLACE FUNCTION public.convert_order_to_erp_invoice(
  p_order_id uuid,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item record;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_unit_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
  v_tax_inclusive boolean;
  v_source text;
  v_skip_stock boolean;
  v_ref text;
  v_notes text;
  v_existing_invoice uuid;
  v_existing_status text;
  v_is_pos boolean;
  v_is_online boolean;
  v_payment_account uuid;
  v_payment_mode text;
  v_allocations jsonb;
  v_customer_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot invoice a cancelled order';
  END IF;

  v_is_pos := COALESCE(v_order.merchant_note, '') ILIKE '%POS counter sale%';

  v_customer_id := v_order.user_id;
  IF v_customer_id IS NULL THEN
    IF v_is_pos THEN
      v_customer_id := public.ensure_walk_in_customer();
      UPDATE public.orders SET user_id = v_customer_id WHERE id = p_order_id;
      v_order.user_id := v_customer_id;
    ELSE
      RAISE EXCEPTION 'Order has no customer — link a customer before invoicing';
    END IF;
  END IF;

  IF v_order.source NOT IN ('sales_order', 'online', 'manual') AND v_order.source IS NOT NULL THEN
    RAISE EXCEPTION 'This order type cannot be converted to an invoice';
  END IF;

  v_existing_invoice := v_order.invoice_id;
  IF v_existing_invoice IS NULL THEN
    SELECT id INTO v_existing_invoice
    FROM public.invoices
    WHERE order_id = p_order_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_existing_invoice IS NOT NULL THEN
    SELECT status INTO v_existing_status
    FROM public.invoices
    WHERE id = v_existing_invoice;

    IF COALESCE(v_existing_status, '') <> 'cancelled' THEN
      UPDATE public.orders
      SET invoice_id = v_existing_invoice
      WHERE id = p_order_id AND invoice_id IS NULL;
      RETURN v_existing_invoice;
    END IF;

    UPDATE public.orders SET invoice_id = NULL WHERE id = p_order_id;
    v_existing_invoice := NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Order has no line items';
  END IF;

  IF v_order.store_id IS NULL THEN
    RAISE EXCEPTION 'Order has no store — assign a store before invoicing';
  END IF;

  PERFORM public.require_store_access(v_order.store_id, p_created_by);

  v_is_online := v_order.source IS NULL OR v_order.source IN ('online', 'manual');

  IF v_is_online AND NOT v_is_pos AND NOT COALESCE(v_order.inventory_committed, false) THEN
    RAISE EXCEPTION 'Ship the order before creating an invoice — inventory must be committed first';
  END IF;

  IF v_order.source = 'sales_order' THEN
    v_source := 'sales_order';
    v_ref := COALESCE(v_order.reference_number, v_order.sales_order_number);
    v_notes := 'Converted from sales order ' || COALESCE(v_order.sales_order_number, p_order_id::text);
  ELSIF v_is_pos THEN
    v_source := 'pos';
    v_ref := 'POS-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 8));
    v_notes := 'Converted from POS sale ' || v_ref;
    IF COALESCE(v_order.customer_name, '') <> '' THEN
      v_notes := v_notes || ' · Walk-in: ' || v_order.customer_name;
    END IF;
  ELSE
    v_source := 'online';
    v_ref := 'ORD-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 8));
    v_notes := 'Converted from online order ' || v_ref;
  END IF;

  v_tax_inclusive := COALESCE(v_order.tax_inclusive, v_order.source = 'sales_order');
  v_skip_stock := COALESCE(v_order.inventory_committed, false);

  SELECT t.out_id, t.out_ref INTO v_invoice_id, v_invoice_number
  FROM public.erp_next_document_ref('sales_invoice') AS t;

  INSERT INTO public.invoices (
    id, order_id, user_id, invoice_number, subtotal, gst_amount, total_amount,
    status, created_at, due_date, issued_at, store_id, amount_paid,
    credits_applied, balance_due, discount, source, reference, tax_inclusive,
    notes, inventory_committed
  )
  VALUES (
    v_invoice_id, p_order_id, v_customer_id, v_invoice_number, 0, 0, 0,
    'pending', now(),
    COALESCE(v_order.shipment_date::date, CURRENT_DATE),
    now(),
    v_order.store_id, 0, 0, 0,
    COALESCE(v_order.discount, 0),
    v_source, v_ref, v_tax_inclusive, v_notes,
    v_skip_stock
  );

  FOR v_item IN
    SELECT
      oi.*,
      COALESCE(
        NULLIF(oi.tax_rate_percent, 0),
        NULLIF(pv.tax_rate_percent, 0),
        0
      ) AS resolved_tax_rate
    FROM public.order_items oi
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_qty := COALESCE(v_item.quantity, 0);
    v_unit_price := COALESCE(v_item.final_price, v_item.price, 0);
    v_tax_rate := COALESCE(v_item.resolved_tax_rate, 0);

    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_tax_inclusive THEN
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
      base_price, gst_rate, gst_amount, total_amount, vendor_id, taxable_amount
    )
    VALUES (
      v_invoice_id, v_item.variant_id, COALESCE(v_item.product_name, 'Item'),
      v_qty, v_unit_price, COALESCE(v_item.base_price, v_unit_price),
      v_tax_rate, v_line_tax, v_line_total, v_item.vendor_id, v_taxable
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(v_order.discount, 0));

  IF COALESCE(v_order.total_amount, 0) > 0 THEN
    v_total := v_order.total_amount;
    v_tax := COALESCE(v_order.tax, v_tax);
    v_subtotal := COALESCE(v_order.subtotal, v_subtotal);
  END IF;

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    gst_amount = v_tax,
    total_amount = v_total,
    balance_due = v_total,
    status = 'issued'
  WHERE id = v_invoice_id;

  IF NOT v_skip_stock THEN
    PERFORM public.inventory_apply_invoice_stock(v_invoice_id, -1);
    UPDATE public.invoices SET inventory_committed = true WHERE id = v_invoice_id;
  END IF;

  UPDATE public.orders
  SET invoice_id = v_invoice_id
  WHERE id = p_order_id;

  IF v_order.payment_status = 'paid' AND v_total > 0 THEN
    IF v_is_pos THEN
      v_payment_account := COALESCE(
        public.get_account_by_code('CASH'),
        public.ensure_system_ledger_account('CASH', 'Cash')
      );
      v_payment_mode := 'cash';
    ELSE
      v_payment_account := COALESCE(
        public.get_account_by_code('PAYMENT_CLEARING'),
        public.ensure_system_ledger_account('PAYMENT_CLEARING', 'Payment Clearing')
      );
      v_payment_mode := 'wallet';
    END IF;

    IF v_payment_account IS NOT NULL THEN
      v_allocations := jsonb_build_array(
        jsonb_build_object('invoice_id', v_invoice_id, 'amount', v_total)
      );

      PERFORM public.record_erp_customer_payment(
        v_customer_id,
        v_order.store_id,
        CURRENT_DATE,
        v_payment_mode,
        v_payment_account,
        v_total,
        CASE
          WHEN v_is_pos THEN 'Cash sale for order ' || p_order_id::text
          ELSE 'Wallet payment for order ' || p_order_id::text
        END,
        CASE
          WHEN v_is_pos THEN 'Auto-recorded POS cash sale'
          ELSE 'Auto-recorded from prepaid wallet order'
        END,
        false,
        v_allocations,
        p_created_by,
        0,
        NULL
      );
    END IF;
  END IF;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_journal_for_vendor_credit(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_vendor_credit_application(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_credit_note_application(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_supplier_payment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_vat_return(uuid, date, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_order_to_erp_invoice(uuid, uuid) TO authenticated;

COMMIT;
