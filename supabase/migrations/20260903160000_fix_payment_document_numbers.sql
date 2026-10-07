-- Fix payment RPCs that still call next_erp_document_number(text) without an id
-- (returns NULL after erp document ref standardization).

BEGIN;

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

  SELECT t.out_id, t.out_ref
  INTO v_payment_id, v_payment_number
  FROM public.erp_next_document_ref(
    CASE WHEN p_is_bulk THEN 'payment_bulk' ELSE 'payment_received' END
  ) AS t;

  INSERT INTO public.erp_customer_payments (
    id, payment_number, store_id, user_id, payment_date, payment_mode,
    account_id, total_amount, reference, notes, is_bulk,
    unallocated_amount, customer_count, invoices_count, created_by,
    bank_charges, bank_charges_account_id
  )
  VALUES (
    v_payment_id, v_payment_number, p_store_id, p_user_id, p_payment_date, p_payment_mode,
    p_account_id, p_total_amount, p_reference, p_notes, p_is_bulk,
    p_total_amount - v_alloc_total,
    1,
    jsonb_array_length(p_allocations),
    p_created_by,
    COALESCE(p_bank_charges, 0),
    p_bank_charges_account_id
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

  SELECT t.out_id, t.out_ref
  INTO v_payment_id, v_payment_number
  FROM public.erp_next_document_ref(
    CASE WHEN p_is_bulk THEN 'payment_made_bulk' ELSE 'payment_made' END
  ) AS t;

  INSERT INTO public.erp_supplier_payments (
    id, payment_number, vendor_id, store_id, payment_date, payment_mode,
    account_id, total_amount, reference, notes, is_bulk,
    unallocated_amount, bills_count, created_by,
    bank_charges, bank_charges_account_id
  )
  VALUES (
    v_payment_id, v_payment_number, p_vendor_id, p_store_id, p_payment_date, p_payment_mode,
    p_account_id, p_total_amount, p_reference, p_notes, p_is_bulk,
    p_total_amount - v_alloc_total,
    jsonb_array_length(p_allocations),
    p_created_by,
    COALESCE(p_bank_charges, 0),
    p_bank_charges_account_id
  );

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

CREATE OR REPLACE FUNCTION public.record_erp_transfer_payment(
  p_transfer_id uuid,
  p_payment_date date,
  p_payment_mode text,
  p_amount numeric,
  p_account_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
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
  v_from uuid;
  v_to uuid;
  v_status text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT from_store_id, to_store_id, status
  INTO v_from, v_to, v_status
  FROM public.erp_store_transfers
  WHERE id = p_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF v_status NOT IN ('approved', 'in_transit', 'completed') THEN
    RAISE EXCEPTION 'Transfer not eligible for payment';
  END IF;

  PERFORM public.require_store_access(v_from, p_created_by);
  PERFORM public.require_store_access(v_to, p_created_by);

  SELECT t.out_id, t.out_ref
  INTO v_payment_id, v_payment_number
  FROM public.erp_next_document_ref('transfer_payment') AS t;

  INSERT INTO public.erp_transfer_payments (
    id, payment_number, transfer_id, from_store_id, to_store_id,
    payment_date, payment_mode, account_id, amount, reference, notes, created_by
  )
  VALUES (
    v_payment_id, v_payment_number, p_transfer_id, v_from, v_to,
    p_payment_date, p_payment_mode, p_account_id, p_amount, p_reference, p_notes, p_created_by
  );

  RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_erp_customer_payment(
  uuid, uuid, date, text, uuid, numeric, text, text, boolean, jsonb, uuid, numeric, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_supplier_payment(
  uuid, uuid, date, text, numeric, uuid, text, text, boolean, jsonb, uuid, numeric, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_transfer_payment(
  uuid, date, text, numeric, uuid, text, text, uuid
) TO authenticated;

COMMIT;
