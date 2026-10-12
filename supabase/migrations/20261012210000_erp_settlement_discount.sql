-- Settlement payments: allocate full document balances while cash paid is reduced by settlement discount.

BEGIN;

ALTER TABLE public.erp_customer_payments
  ADD COLUMN IF NOT EXISTS settlement_discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_discount_account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL;

ALTER TABLE public.erp_supplier_payments
  ADD COLUMN IF NOT EXISTS settlement_discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_discount_account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL;

ALTER TABLE public.erp_customer_payments
  DROP CONSTRAINT IF EXISTS erp_customer_payments_settlement_discount_nonneg;
ALTER TABLE public.erp_customer_payments
  ADD CONSTRAINT erp_customer_payments_settlement_discount_nonneg
  CHECK (settlement_discount >= 0);

ALTER TABLE public.erp_supplier_payments
  DROP CONSTRAINT IF EXISTS erp_supplier_payments_settlement_discount_nonneg;
ALTER TABLE public.erp_supplier_payments
  ADD CONSTRAINT erp_supplier_payments_settlement_discount_nonneg
  CHECK (settlement_discount >= 0);

DROP FUNCTION IF EXISTS public.record_erp_customer_payment(
  uuid, uuid, date, text, uuid, numeric, text, text, boolean, jsonb, uuid, numeric, uuid
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
  p_bank_charges_account_id uuid DEFAULT NULL,
  p_settlement_discount numeric DEFAULT 0,
  p_settlement_discount_account_id uuid DEFAULT NULL
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
  v_discount numeric;
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

  v_discount := COALESCE(p_settlement_discount, 0);
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'Settlement discount cannot be negative';
  END IF;

  IF v_discount > 0 AND p_settlement_discount_account_id IS NULL THEN
    RAISE EXCEPTION 'Discount account is required when settlement discount is recorded';
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

  PERFORM public.require_store_access(p_store_id, p_created_by);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_alloc_total := v_alloc_total + COALESCE((v_row ->> 'amount')::numeric, 0);
  END LOOP;

  IF v_discount > 0 THEN
    IF abs(v_alloc_total - (p_total_amount + v_discount)) > 0.02 THEN
      RAISE EXCEPTION 'Allocation total must equal payment amount plus settlement discount';
    END IF;
  ELSIF v_alloc_total > p_total_amount THEN
    RAISE EXCEPTION 'Allocation total exceeds payment amount';
  END IF;

  SELECT t.out_id, t.out_ref
  INTO v_payment_id, v_payment_number
  FROM public.erp_next_document_ref(
    CASE WHEN p_is_bulk THEN 'payment_bulk' ELSE 'payment_received' END
  ) AS t;

  INSERT INTO public.erp_customer_payments (
    id, payment_number, store_id, user_id, payment_date, payment_mode,
    account_id, total_amount, reference, notes, is_bulk,
    unallocated_amount, customer_count, invoices_count, created_by,
    bank_charges, bank_charges_account_id,
    settlement_discount, settlement_discount_account_id
  )
  VALUES (
    v_payment_id, v_payment_number, p_store_id, p_user_id, p_payment_date, p_payment_mode,
    p_account_id, p_total_amount, p_reference, p_notes, p_is_bulk,
    GREATEST(0, p_total_amount + v_discount - v_alloc_total),
    1,
    jsonb_array_length(p_allocations),
    p_created_by,
    COALESCE(p_bank_charges, 0),
    p_bank_charges_account_id,
    v_discount,
    p_settlement_discount_account_id
  );

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

DROP FUNCTION IF EXISTS public.record_erp_supplier_payment(
  uuid, uuid, date, text, numeric, uuid, text, text, boolean, jsonb, uuid, numeric, uuid
);

CREATE OR REPLACE FUNCTION public.record_erp_supplier_payment(
  p_vendor_id uuid,
  p_store_id uuid,
  p_payment_date date,
  p_payment_mode text,
  p_total_amount numeric,
  p_account_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_bulk boolean DEFAULT false,
  p_allocations jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT auth.uid(),
  p_bank_charges numeric DEFAULT 0,
  p_bank_charges_account_id uuid DEFAULT NULL,
  p_settlement_discount numeric DEFAULT 0,
  p_settlement_discount_account_id uuid DEFAULT NULL
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
  v_discount numeric;
  v_row jsonb;
  v_bill_vendor uuid;
  v_bill_id uuid;
  v_alloc_amount numeric;
  v_balance numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  IF p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Vendor is required';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'Paid through account is required';
  END IF;

  v_discount := COALESCE(p_settlement_discount, 0);
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'Settlement discount cannot be negative';
  END IF;

  IF v_discount > 0 AND p_settlement_discount_account_id IS NULL THEN
    RAISE EXCEPTION 'Discount account is required when settlement discount is recorded';
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

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF NULLIF(TRIM(p_reference), '') IS NOT NULL THEN
    SELECT id INTO v_payment_id
    FROM public.erp_supplier_payments
    WHERE vendor_id = p_vendor_id
      AND store_id = p_store_id
      AND reference = p_reference
      AND total_amount = p_total_amount
      AND is_bulk = p_is_bulk
      AND settlement_discount = v_discount
    ORDER BY created_at
    LIMIT 1;

    IF FOUND THEN
      RETURN v_payment_id;
    END IF;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_alloc_total := v_alloc_total + COALESCE((v_row ->> 'amount')::numeric, 0);
  END LOOP;

  IF v_discount > 0 THEN
    IF abs(v_alloc_total - (p_total_amount + v_discount)) > 0.02 THEN
      RAISE EXCEPTION 'Allocation total must equal payment amount plus settlement discount';
    END IF;
  ELSIF v_alloc_total > p_total_amount THEN
    RAISE EXCEPTION 'Allocation total exceeds payment amount';
  END IF;

  SET LOCAL lock_timeout = '15s';

  FOR v_bill_id, v_alloc_amount IN
    SELECT
      (elem ->> 'purchase_bill_id')::uuid,
      COALESCE((elem ->> 'amount')::numeric, 0)
    FROM jsonb_array_elements(p_allocations) AS elem
    ORDER BY (elem ->> 'purchase_bill_id')
  LOOP
    IF v_bill_id IS NULL OR v_alloc_amount <= 0 THEN
      RAISE EXCEPTION 'Each allocation requires purchase_bill_id and positive amount';
    END IF;

    SELECT vendor_id, balance_due
    INTO v_bill_vendor, v_balance
    FROM public.erp_purchase_bills
    WHERE id = v_bill_id
      AND status IN ('finalized', 'partial', 'paid')
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase bill not found or not payable';
    END IF;

    IF v_bill_vendor <> p_vendor_id THEN
      RAISE EXCEPTION 'Purchase bill does not belong to vendor';
    END IF;

    IF v_alloc_amount > COALESCE(v_balance, 0) + 0.01 THEN
      RAISE EXCEPTION 'Payment amount exceeds bill balance due';
    END IF;
  END LOOP;

  SELECT t.out_id, t.out_ref
  INTO v_payment_id, v_payment_number
  FROM public.erp_next_document_ref(
    CASE WHEN p_is_bulk THEN 'payment_made_bulk' ELSE 'payment_made' END
  ) AS t;

  INSERT INTO public.erp_supplier_payments (
    id, payment_number, vendor_id, store_id, payment_date, payment_mode,
    account_id, total_amount, reference, notes, is_bulk,
    unallocated_amount, bills_count, created_by,
    bank_charges, bank_charges_account_id,
    settlement_discount, settlement_discount_account_id
  )
  VALUES (
    v_payment_id, v_payment_number, p_vendor_id, p_store_id, p_payment_date, p_payment_mode,
    p_account_id, p_total_amount, p_reference, p_notes, p_is_bulk,
    GREATEST(0, p_total_amount + v_discount - v_alloc_total),
    jsonb_array_length(p_allocations),
    p_created_by,
    COALESCE(p_bank_charges, 0),
    p_bank_charges_account_id,
    v_discount,
    p_settlement_discount_account_id
  );

  FOR v_bill_id, v_alloc_amount IN
    SELECT
      (elem ->> 'purchase_bill_id')::uuid,
      COALESCE((elem ->> 'amount')::numeric, 0)
    FROM jsonb_array_elements(p_allocations) AS elem
    ORDER BY (elem ->> 'purchase_bill_id')
  LOOP
    INSERT INTO public.erp_supplier_payment_allocations (payment_id, purchase_bill_id, amount)
    VALUES (v_payment_id, v_bill_id, v_alloc_amount);

    PERFORM public.recalculate_purchase_bill_balance(v_bill_id);
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
  v_discount numeric;
  v_discount_account uuid;
  v_ar_clearance numeric;
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
    bank_charges, bank_charges_account_id,
    settlement_discount, settlement_discount_account_id
  INTO
    v_amount, v_account_id, v_store_id, v_date, v_number,
    v_bank_charges, v_bank_charges_account_id,
    v_discount, v_discount_account
  FROM public.erp_customer_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer payment not found';
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Customer payment amount must be positive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_discount := COALESCE(v_discount, 0);
  v_bank_charges := COALESCE(v_bank_charges, 0);
  v_net_deposit := v_amount - v_bank_charges;
  v_ar_clearance := v_amount + v_discount;

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

  IF v_discount > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', v_discount_account,
        'debit', v_discount,
        'description', 'Settlement discount ' || v_number
      )
    );
  END IF;

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'account_code', 'ACCOUNTS_RECIEVABLE',
      'credit', v_ar_clearance,
      'description', 'AR clearance'
    )
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Customer payment ' || v_number, v_store_id,
    'customer_payment', p_payment_id, v_lines, p_actor
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
  v_discount numeric;
  v_discount_account uuid;
  v_ap_clearance numeric;
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
    bank_charges, bank_charges_account_id,
    settlement_discount, settlement_discount_account_id
  INTO
    v_amount, v_account_id, v_store_id, v_date, v_number,
    v_bank_charges, v_bank_charges_account_id,
    v_discount, v_discount_account
  FROM public.erp_supplier_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier payment not found';
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Supplier payment amount must be positive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_discount := COALESCE(v_discount, 0);
  v_bank_charges := COALESCE(v_bank_charges, 0);
  v_net_payment := v_amount - v_bank_charges;
  v_ap_clearance := v_amount + v_discount;

  IF v_account_id IS NULL THEN
    v_account_id := public.get_account_by_code('CASH');
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', 'ACCOUNTS_PAYABLE',
      'debit', v_ap_clearance,
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

  IF v_discount > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', v_discount_account,
        'credit', v_discount,
        'description', 'Settlement discount ' || v_number
      )
    );
  END IF;

  RETURN public.create_posted_journal_entry(
    v_date, 'Supplier payment ' || v_number, v_store_id,
    'supplier_payment', p_payment_id, v_lines, p_actor
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_erp_customer_payment(
  uuid, uuid, date, text, uuid, numeric, text, text, boolean, jsonb, uuid, numeric, uuid, numeric, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.record_erp_supplier_payment(
  uuid, uuid, date, text, numeric, uuid, text, text, boolean, jsonb, uuid, numeric, uuid, numeric, uuid
) TO authenticated;

COMMIT;
