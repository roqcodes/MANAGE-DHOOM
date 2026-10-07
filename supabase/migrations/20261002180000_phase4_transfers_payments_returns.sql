-- Phase 4: Transfers, bulk vendor payments, purchase returns — concurrency + idempotency.

BEGIN;

-- ─── A. Store transfer completion (product-level physical stock) ─────────────

CREATE OR REPLACE FUNCTION public.complete_erp_store_transfer(
  p_transfer_id uuid,
  p_completed_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid;
  v_to uuid;
  v_committed boolean;
  v_status text;
  r record;
  v_product_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_completed_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT from_store_id, to_store_id, inventory_committed, status
  INTO v_from, v_to, v_committed, v_status
  FROM public.erp_store_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot complete cancelled transfer';
  END IF;

  IF v_committed THEN
    RETURN;
  END IF;

  IF v_from = v_to THEN
    RAISE EXCEPTION 'From and to store must be different';
  END IF;

  PERFORM public.require_store_access(v_from, p_completed_by);
  PERFORM public.require_store_access(v_to, p_completed_by);

  SET LOCAL lock_timeout = '15s';

  IF v_status = 'draft' THEN
    UPDATE public.erp_store_transfers SET status = 'approved' WHERE id = p_transfer_id;
  END IF;

  FOR r IN
    SELECT
      l.variant_id,
      l.product_id,
      l.quantity,
      l.transfer_price,
      COALESCE(
        l.product_id,
        (SELECT product_id FROM public.product_variants WHERE id = l.variant_id)
      ) AS resolved_product_id
    FROM public.erp_store_transfer_lines l
    WHERE l.transfer_id = p_transfer_id
    ORDER BY COALESCE(
      l.product_id,
      (SELECT product_id FROM public.product_variants WHERE id = l.variant_id)
    ), l.id
  LOOP
    v_product_id := r.resolved_product_id;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required on transfer line';
    END IF;

    IF r.quantity IS NULL OR r.quantity <= 0 THEN
      CONTINUE;
    END IF;

    PERFORM public.store_product_inventory_apply_delta(
      v_from, v_product_id, -r.quantity, p_completed_by
    );
    PERFORM public.store_product_inventory_apply_delta(
      v_to, v_product_id, r.quantity, p_completed_by
    );

    PERFORM public.log_product_stock_movement(
      v_product_id, -r.quantity, 'transfer_out', p_transfer_id, 'store_transfer',
      'Store transfer out', v_from, v_to, r.transfer_price, p_completed_by
    );
    PERFORM public.log_product_stock_movement(
      v_product_id, r.quantity, 'transfer_in', p_transfer_id, 'store_transfer',
      'Store transfer in', v_to, v_from, r.transfer_price, p_completed_by
    );
  END LOOP;

  UPDATE public.erp_store_transfers
  SET status = 'completed', inventory_committed = true, updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── B. Supplier payment (single) — idempotent reference + locked bills ─────

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

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF NULLIF(TRIM(p_reference), '') IS NOT NULL THEN
    SELECT id INTO v_payment_id
    FROM public.erp_supplier_payments
    WHERE vendor_id = p_vendor_id
      AND store_id = p_store_id
      AND reference = p_reference
      AND total_amount = p_total_amount
      AND is_bulk = p_is_bulk
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

  IF v_alloc_total > p_total_amount THEN
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

-- ─── B. Bulk supplier payment — validate all bills before any write ─────────

CREATE OR REPLACE FUNCTION public.record_erp_supplier_bulk_payment(
  p_store_id uuid,
  p_payment_date date,
  p_payment_mode text,
  p_lines jsonb,
  p_account_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid(),
  p_bank_charges numeric DEFAULT 0,
  p_bank_charges_account_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_ref text;
  v_row jsonb;
  v_payment_id uuid;
  v_payment_ids uuid[] := '{}';
  v_vendor_id uuid;
  v_amount numeric;
  v_allocations jsonb;
  v_existing uuid[];
  v_alloc jsonb;
  v_bill_id uuid;
  v_alloc_amount numeric;
  v_bill_vendor uuid;
  v_balance numeric;
  v_line_index integer := 0;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one payment line is required';
  END IF;

  v_batch_ref := COALESCE(NULLIF(TRIM(p_reference), ''), 'BULK:' || gen_random_uuid()::text);

  SELECT array_agg(id ORDER BY created_at)
  INTO v_existing
  FROM public.erp_supplier_payments
  WHERE reference = v_batch_ref AND is_bulk = true;

  IF v_existing IS NOT NULL AND array_length(v_existing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'reference', v_batch_ref,
      'payment_ids', to_jsonb(v_existing),
      'idempotent', true
    );
  END IF;

  SET LOCAL lock_timeout = '15s';

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_vendor_id := (v_row ->> 'vendor_id')::uuid;
    v_amount := COALESCE((v_row ->> 'amount')::numeric, 0);
    v_allocations := COALESCE(v_row -> 'allocations', '[]'::jsonb);

    IF v_vendor_id IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Each line requires vendor_id and positive amount';
    END IF;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_allocations)
    LOOP
      v_bill_id := (v_alloc ->> 'purchase_bill_id')::uuid;
      v_alloc_amount := COALESCE((v_alloc ->> 'amount')::numeric, 0);

      SELECT vendor_id, balance_due
      INTO v_bill_vendor, v_balance
      FROM public.erp_purchase_bills
      WHERE id = v_bill_id
        AND status IN ('finalized', 'partial', 'paid')
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase bill not found or not payable';
      END IF;

      IF v_bill_vendor <> v_vendor_id THEN
        RAISE EXCEPTION 'Purchase bill does not belong to vendor';
      END IF;

      IF v_alloc_amount > COALESCE(v_balance, 0) + 0.01 THEN
        RAISE EXCEPTION 'Payment amount exceeds bill balance due';
      END IF;
    END LOOP;
  END LOOP;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_vendor_id := (v_row ->> 'vendor_id')::uuid;
    v_amount := (v_row ->> 'amount')::numeric;
    v_allocations := COALESCE(v_row -> 'allocations', '[]'::jsonb);

    v_payment_id := public.record_erp_supplier_payment(
      v_vendor_id, p_store_id, p_payment_date, p_payment_mode,
      v_amount, p_account_id, v_batch_ref, p_notes, true, v_allocations, p_created_by,
      CASE WHEN v_line_index = 0 THEN COALESCE(p_bank_charges, 0) ELSE 0 END,
      CASE WHEN v_line_index = 0 THEN p_bank_charges_account_id ELSE NULL END
    );
    v_payment_ids := array_append(v_payment_ids, v_payment_id);
    v_line_index := v_line_index + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reference', v_batch_ref,
    'payment_ids', to_jsonb(v_payment_ids),
    'idempotent', false
  );
END;
$$;

-- ─── C. Vendor credit / return stock ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inventory_apply_vendor_credit_stock(
  p_credit_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_store_id uuid;
  v_delta numeric;
  v_actor uuid;
  v_committed boolean;
BEGIN
  v_actor := COALESCE(p_user_id, auth.uid());

  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, inventory_committed
  INTO v_store_id, v_committed
  FROM public.erp_vendor_credits
  WHERE id = p_credit_id
  FOR UPDATE;

  IF v_committed THEN
    RETURN;
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Vendor credit store not found';
  END IF;

  PERFORM public.require_store_access(v_store_id, v_actor);

  SET LOCAL lock_timeout = '15s';

  FOR r IN
    SELECT
      COALESCE(vcl.product_id, pv.product_id) AS product_id,
      SUM(vcl.quantity)::numeric AS qty
    FROM public.erp_vendor_credit_lines vcl
    LEFT JOIN public.product_variants pv ON pv.id = vcl.variant_id
    WHERE vcl.vendor_credit_id = p_credit_id
      AND COALESCE(vcl.product_id, pv.product_id) IS NOT NULL
    GROUP BY COALESCE(vcl.product_id, pv.product_id)
    ORDER BY COALESCE(vcl.product_id, pv.product_id)
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := -r.qty;

    PERFORM public.store_product_inventory_apply_delta(v_store_id, r.product_id, v_delta, v_actor);

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta, 'vendor_credit', p_credit_id, 'vendor_credit',
      'Vendor Credit', v_store_id, NULL, NULL, v_actor
    );
  END LOOP;
END;
$$;

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
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id, total_amount, source_bill_id, inventory_committed
  INTO v_status, v_store_id, v_total, v_source_bill_id, v_committed
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

  IF p_reduce_stock AND NOT COALESCE(v_committed, false) THEN
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

GRANT EXECUTE ON FUNCTION public.complete_erp_store_transfer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_supplier_payment(
  uuid, uuid, date, text, numeric, uuid, text, text, boolean, jsonb, uuid, numeric, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_supplier_bulk_payment(
  uuid, date, text, jsonb, uuid, text, text, uuid, numeric, uuid
) TO authenticated;

COMMIT;
