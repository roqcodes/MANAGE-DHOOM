-- Sales payments (Winner-style): bank charges, credit note attachments, document preview.

BEGIN;

ALTER TABLE public.erp_customer_payments
  ADD COLUMN IF NOT EXISTS bank_charges numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_charges_account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL;

ALTER TABLE public.erp_credit_notes
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachment_url text;

CREATE INDEX IF NOT EXISTS erp_credit_notes_source_invoice_id_idx
  ON public.erp_credit_notes (source_invoice_id)
  WHERE source_invoice_id IS NOT NULL;

-- Preview next document number without consuming the sequence.
CREATE OR REPLACE FUNCTION public.peek_erp_document_number(p_document_type text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.erp_document_sequences%ROWTYPE;
  v_number text;
BEGIN
  SELECT * INTO v_row
  FROM public.erp_document_sequences
  WHERE document_type = p_document_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown document type: %', p_document_type;
  END IF;

  IF v_row.padding > 0 THEN
    v_number := v_row.prefix || LPAD(v_row.next_number::text, v_row.padding, '0');
  ELSE
    v_number := v_row.prefix || v_row.next_number::text;
  END IF;

  RETURN v_number;
END;
$$;

DROP FUNCTION IF EXISTS public.record_erp_customer_payment(
  uuid, uuid, date, text, uuid, numeric, text, text, boolean, jsonb, uuid
);

CREATE OR REPLACE FUNCTION public.record_erp_customer_payment(
  p_user_id uuid,
  p_store_id uuid,
  p_payment_date date,
  p_payment_mode text,
  p_account_id uuid,
  p_total_amount numeric,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_bulk boolean DEFAULT false,
  p_allocations jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT auth.uid(),
  p_bank_charges numeric DEFAULT 0,
  p_bank_charges_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_payment_number text;
  v_alloc_total numeric := 0;
  v_row jsonb;
  v_invoice_user uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'Deposit account is required';
  END IF;

  IF COALESCE(p_bank_charges, 0) < 0 THEN
    RAISE EXCEPTION 'Bank charges cannot be negative';
  END IF;

  IF COALESCE(p_bank_charges, 0) >= p_total_amount THEN
    RAISE EXCEPTION 'Bank charges must be less than payment amount';
  END IF;

  IF COALESCE(p_bank_charges, 0) > 0 AND p_bank_charges_account_id IS NULL THEN
    RAISE EXCEPTION 'Expense account is required when bank charges are recorded';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_alloc_total := v_alloc_total + COALESCE((v_row ->> 'amount')::numeric, 0);
  END LOOP;

  IF v_alloc_total > p_total_amount THEN
    RAISE EXCEPTION 'Allocation total exceeds payment amount';
  END IF;

  v_payment_number := public.next_erp_document_number(
    CASE WHEN p_is_bulk THEN 'payment_bulk' ELSE 'payment_received' END
  );

  INSERT INTO public.erp_customer_payments (
    payment_number, store_id, user_id, payment_date, payment_mode,
    account_id, total_amount, reference, notes, is_bulk,
    unallocated_amount, customer_count, invoices_count, created_by,
    bank_charges, bank_charges_account_id
  )
  VALUES (
    v_payment_number, p_store_id, p_user_id, p_payment_date, p_payment_mode,
    p_account_id, p_total_amount, p_reference, p_notes, p_is_bulk,
    p_total_amount - v_alloc_total,
    1,
    jsonb_array_length(p_allocations),
    p_created_by,
    COALESCE(p_bank_charges, 0),
    p_bank_charges_account_id
  )
  RETURNING id INTO v_payment_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    SELECT user_id INTO v_invoice_user
    FROM public.invoices
    WHERE id = (v_row ->> 'invoice_id')::uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice not found';
    END IF;

    IF v_invoice_user <> p_user_id THEN
      RAISE EXCEPTION 'Invoice does not belong to customer';
    END IF;

    INSERT INTO public.erp_payment_allocations (payment_id, invoice_id, amount)
    VALUES (v_payment_id, (v_row ->> 'invoice_id')::uuid, (v_row ->> 'amount')::numeric);

    PERFORM public.recalculate_invoice_balance((v_row ->> 'invoice_id')::uuid);
  END LOOP;

  RETURN v_payment_id;
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
  v_bank_charges numeric;
  v_account_id uuid;
  v_bank_charges_account_id uuid;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb := '[]'::jsonb;
  v_net_deposit numeric;
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

  SELECT
    total_amount, account_id, store_id, payment_date, payment_number,
    bank_charges, bank_charges_account_id
  INTO
    v_amount, v_account_id, v_store_id, v_date, v_number,
    v_bank_charges, v_bank_charges_account_id
  FROM public.erp_customer_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer payment not found';
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Customer payment amount must be positive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_bank_charges := COALESCE(v_bank_charges, 0);
  v_net_deposit := v_amount - v_bank_charges;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', v_account_id,
      'debit', v_net_deposit,
      'description', 'Payment deposit ' || v_number
    )
  );

  IF v_bank_charges > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', v_bank_charges_account_id,
        'debit', v_bank_charges,
        'description', 'Bank charges ' || v_number
      )
    );
  END IF;

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'account_code', 'ACCOUNTS_RECIEVABLE',
      'credit', v_amount,
      'description', 'AR clearance'
    )
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Customer payment ' || v_number, v_store_id,
    'customer_payment', p_payment_id, v_lines, p_actor
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_erp_credit_note(
  uuid, uuid, date, jsonb, text, text, boolean, boolean, uuid
);

CREATE OR REPLACE FUNCTION public.create_erp_credit_note(
  p_user_id uuid,
  p_store_id uuid,
  p_credit_note_date date,
  p_lines jsonb,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_restore_stock boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid(),
  p_source_invoice_id uuid DEFAULT NULL,
  p_attachment_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn_id uuid;
  v_cn_number text;
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
  v_already_committed boolean;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  v_cn_number := public.next_erp_document_number('credit_note');

  INSERT INTO public.erp_credit_notes (
    credit_note_number, store_id, user_id, reference, credit_note_date,
    status, notes, balance_remaining, created_by, inventory_committed,
    source_invoice_id, attachment_url
  )
  VALUES (
    v_cn_number, p_store_id, p_user_id, p_reference, p_credit_note_date,
    CASE WHEN p_finalize THEN 'issued' ELSE 'draft' END,
    p_notes, 0, p_created_by, false,
    p_source_invoice_id, p_attachment_url
  )
  RETURNING id INTO v_cn_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_unit_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    INSERT INTO public.erp_credit_note_lines (
      credit_note_id, variant_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_cn_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_qty,
      v_unit_price,
      v_tax_rate,
      v_line_tax,
      v_line_total
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  UPDATE public.erp_credit_notes
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax,
    total_amount = v_total,
    balance_remaining = v_total
  WHERE id = v_cn_id;

  IF p_finalize AND p_restore_stock THEN
    SELECT inventory_committed INTO v_already_committed
    FROM public.erp_credit_notes
    WHERE id = v_cn_id
    FOR UPDATE;

    IF NOT COALESCE(v_already_committed, false) THEN
      FOR v_line IN
        SELECT variant_id, quantity, unit_price
        FROM public.erp_credit_note_lines
        WHERE credit_note_id = v_cn_id AND variant_id IS NOT NULL
      LOOP
        PERFORM public.store_inventory_apply_delta(
          p_store_id, v_line.variant_id, v_line.quantity, true, p_created_by
        );

        PERFORM public.log_stock_movement(
          v_line.variant_id,
          v_line.quantity,
          'return',
          v_cn_id,
          'credit_note',
          'Credit note stock restore',
          p_store_id,
          NULL,
          v_line.unit_price
        );
      END LOOP;

      UPDATE public.erp_credit_notes
      SET inventory_committed = true
      WHERE id = v_cn_id;
    END IF;
  END IF;

  RETURN v_cn_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.peek_erp_document_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_customer_payment(
  uuid, uuid, date, text, uuid, numeric, text, text, boolean, jsonb, uuid, numeric, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_credit_note(
  uuid, uuid, date, jsonb, text, text, boolean, boolean, uuid, uuid, text
) TO authenticated;

COMMIT;
