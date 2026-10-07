-- Purchases production hardening: bill cancel, vendor credit auto-apply, supplier bank charges, PO converted.

BEGIN;

ALTER TABLE public.erp_supplier_payments
  ADD COLUMN IF NOT EXISTS bank_charges numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_charges_account_id uuid REFERENCES public.accounts (id) ON DELETE SET NULL;

ALTER TABLE public.erp_vendor_credits
  ADD COLUMN IF NOT EXISTS source_bill_id uuid REFERENCES public.erp_purchase_bills (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS erp_vendor_credits_source_bill_id_idx
  ON public.erp_vendor_credits (source_bill_id)
  WHERE source_bill_id IS NOT NULL;

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

  UPDATE public.erp_purchase_bills
  SET status = 'cancelled', balance_due = 0, updated_at = now()
  WHERE id = p_bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_erp_purchase_bill(
  p_bill_id uuid,
  p_finalized_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_committed boolean;
  v_total numeric;
  v_po_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_finalized_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, inventory_committed, total_amount, po_id
  INTO v_status, v_committed, v_total, v_po_id
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot finalize cancelled bill';
  END IF;

  IF v_status <> 'draft' AND v_committed THEN
    RETURN;
  END IF;

  IF NOT v_committed THEN
    PERFORM public.inventory_apply_purchase_bill_stock(p_bill_id, 1);
    UPDATE public.erp_purchase_bills
    SET inventory_committed = true
    WHERE id = p_bill_id;
  END IF;

  UPDATE public.erp_purchase_bills
  SET
    status = 'finalized',
    balance_due = v_total,
    updated_at = now()
  WHERE id = p_bill_id;

  IF v_po_id IS NOT NULL THEN
    UPDATE public.purchase_orders
    SET status = 'converted', updated_at = now()
    WHERE id = v_po_id AND status NOT IN ('cancelled', 'converted');
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.record_erp_supplier_payment(
  uuid, uuid, date, text, numeric, uuid, text, text, boolean, jsonb, uuid
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
  v_bill_vendor uuid;
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
    CASE WHEN p_is_bulk THEN 'payment_made_bulk' ELSE 'payment_made' END
  );

  INSERT INTO public.erp_supplier_payments (
    payment_number, vendor_id, store_id, payment_date, payment_mode,
    account_id, total_amount, reference, notes, is_bulk,
    unallocated_amount, bills_count, created_by,
    bank_charges, bank_charges_account_id
  )
  VALUES (
    v_payment_number, p_vendor_id, p_store_id, p_payment_date, p_payment_mode,
    p_account_id, p_total_amount, p_reference, p_notes, p_is_bulk,
    p_total_amount - v_alloc_total,
    jsonb_array_length(p_allocations),
    p_created_by,
    COALESCE(p_bank_charges, 0),
    p_bank_charges_account_id
  )
  RETURNING id INTO v_payment_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    SELECT vendor_id INTO v_bill_vendor
    FROM public.erp_purchase_bills
    WHERE id = (v_row ->> 'purchase_bill_id')::uuid
      AND status IN ('finalized', 'partial', 'paid');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase bill not found or not payable';
    END IF;

    IF v_bill_vendor <> p_vendor_id THEN
      RAISE EXCEPTION 'Purchase bill does not belong to vendor';
    END IF;

    INSERT INTO public.erp_supplier_payment_allocations (payment_id, purchase_bill_id, amount)
    VALUES (v_payment_id, (v_row ->> 'purchase_bill_id')::uuid, (v_row ->> 'amount')::numeric);

    PERFORM public.recalculate_purchase_bill_balance((v_row ->> 'purchase_bill_id')::uuid);
  END LOOP;

  RETURN v_payment_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_erp_vendor_credit(
  uuid, uuid, date, jsonb, text, text, boolean, boolean, uuid
);

CREATE OR REPLACE FUNCTION public.create_erp_vendor_credit(
  p_vendor_id uuid,
  p_store_id uuid,
  p_credit_date date,
  p_lines jsonb,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_reduce_stock boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid(),
  p_source_bill_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_id uuid;
  v_credit_number text;
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
  v_bill_vendor uuid;
  v_bill_balance numeric;
  v_apply_amount numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_source_bill_id IS NOT NULL THEN
    SELECT vendor_id, balance_due
    INTO v_bill_vendor, v_bill_balance
    FROM public.erp_purchase_bills
    WHERE id = p_source_bill_id AND status <> 'cancelled';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source purchase bill not found';
    END IF;

    IF v_bill_vendor <> p_vendor_id THEN
      RAISE EXCEPTION 'Vendor credit must match source bill vendor';
    END IF;
  END IF;

  v_credit_number := public.next_erp_document_number('vendor_credit');

  INSERT INTO public.erp_vendor_credits (
    credit_number, vendor_id, store_id, reference, credit_date,
    status, notes, balance_remaining, created_by, source_bill_id
  )
  VALUES (
    v_credit_number, p_vendor_id, p_store_id, p_reference, p_credit_date,
    CASE WHEN p_finalize THEN 'issued' ELSE 'draft' END,
    p_notes, 0, p_created_by, p_source_bill_id
  )
  RETURNING id INTO v_credit_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_unit_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    INSERT INTO public.erp_vendor_credit_lines (
      vendor_credit_id, variant_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_credit_id,
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

  UPDATE public.erp_vendor_credits
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax,
    total_amount = v_total,
    balance_remaining = v_total
  WHERE id = v_credit_id;

  IF p_finalize AND p_reduce_stock THEN
    PERFORM public.inventory_apply_vendor_credit_stock(v_credit_id);
    UPDATE public.erp_vendor_credits SET inventory_committed = true WHERE id = v_credit_id;
  END IF;

  IF p_finalize AND p_source_bill_id IS NOT NULL AND v_total > 0 THEN
    v_apply_amount := LEAST(v_total, COALESCE(v_bill_balance, 0));
    IF v_apply_amount > 0 THEN
      PERFORM public.apply_erp_vendor_credit(v_credit_id, p_source_bill_id, v_apply_amount, p_created_by);
    END IF;
  END IF;

  RETURN v_credit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_erp_purchase_bill(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_supplier_payment(
  uuid, uuid, date, text, numeric, uuid, text, text, boolean, jsonb, uuid, numeric, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_vendor_credit(
  uuid, uuid, date, jsonb, text, text, boolean, boolean, uuid, uuid
) TO authenticated;

COMMIT;
