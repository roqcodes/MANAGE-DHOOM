-- Phase 6: Inventory integration & data consistency
-- Authoritative stock: store_inventory (per store). Central inventory = derived aggregate.
-- Sales, purchases, adjustments sync both via store_inventory_apply_delta(p_update_central=true).
-- Transfers move stock between stores only (p_update_central=false).

BEGIN;

-- ─── 1. Strict stock deduction (no silent floor to zero) ─────────────────────

CREATE OR REPLACE FUNCTION public.store_inventory_apply_delta(
  p_store_id uuid,
  p_variant_id uuid,
  p_delta numeric,
  p_update_central boolean DEFAULT true,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_stock numeric;
  v_new_store numeric;
  v_central numeric;
  v_new_central numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  SELECT stock INTO v_store_stock
  FROM public.store_inventory
  WHERE store_id = p_store_id AND variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_delta < 0 THEN
      RAISE EXCEPTION 'Insufficient stock: no inventory for variant % at store %', p_variant_id, p_store_id;
    END IF;

    INSERT INTO public.store_inventory (store_id, variant_id, stock, updated_at)
    VALUES (p_store_id, p_variant_id, p_delta, now());
    v_new_store := p_delta;
  ELSE
    v_new_store := COALESCE(v_store_stock, 0) + p_delta;
    IF v_new_store < 0 THEN
      RAISE EXCEPTION 'Insufficient stock: variant % at store % (available %, requested %)',
        p_variant_id, p_store_id, COALESCE(v_store_stock, 0), ABS(p_delta);
    END IF;

    UPDATE public.store_inventory
    SET stock = v_new_store, updated_at = now()
    WHERE store_id = p_store_id AND variant_id = p_variant_id;
  END IF;

  IF p_update_central THEN
    SELECT stock INTO v_central
    FROM public.inventory
    WHERE variant_id = p_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      IF p_delta < 0 THEN
        RAISE EXCEPTION 'No central inventory for variant %', p_variant_id;
      END IF;
      INSERT INTO public.inventory (variant_id, stock, updated_at)
      VALUES (p_variant_id, p_delta, now());
    ELSE
      v_new_central := COALESCE(v_central, 0) + p_delta;
      IF v_new_central < 0 THEN
        RAISE EXCEPTION 'Insufficient central stock for variant %', p_variant_id;
      END IF;
      UPDATE public.inventory
      SET stock = v_new_central, updated_at = now()
      WHERE variant_id = p_variant_id;
    END IF;
  END IF;

  RETURN v_new_store;
END;
$$;

-- ─── 2. Reconcile central inventory from store totals (repair helper) ─────────

CREATE OR REPLACE FUNCTION public.reconcile_central_inventory_from_stores(
  p_variant_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  -- Migration / service-role calls have no auth.uid(); staff check applies at runtime only.
  IF auth.uid() IS NOT NULL AND NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR r IN
    SELECT variant_id, COALESCE(SUM(stock), 0) AS total_stock
    FROM public.store_inventory
    WHERE p_variant_id IS NULL OR variant_id = p_variant_id
    GROUP BY variant_id
  LOOP
    INSERT INTO public.inventory (variant_id, stock, updated_at)
    VALUES (r.variant_id, r.total_stock, now())
    ON CONFLICT (variant_id)
    DO UPDATE SET stock = EXCLUDED.stock, updated_at = now();
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- One-time alignment: central stock = sum of per-store stock
SELECT public.reconcile_central_inventory_from_stores();

-- ─── 3. Invoice stock: store_inventory + stock_movements + idempotency ───────

CREATE OR REPLACE FUNCTION public.inventory_apply_invoice_stock(
  p_invoice_id uuid,
  p_multiplier integer DEFAULT -1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_store_id uuid;
  v_committed boolean;
  v_delta numeric;
  v_invoice_number text;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice id is required';
  END IF;

  IF p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid stock multiplier';
  END IF;

  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, inventory_committed, invoice_number
  INTO v_store_id, v_committed, v_invoice_number
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Invoice store is required for stock deduction';
  END IF;

  IF p_multiplier = -1 AND v_committed THEN
    RETURN;
  END IF;

  IF p_multiplier = 1 AND NOT v_committed THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id);

  FOR r IN
    SELECT
      ii.variant_id,
      SUM(ii.quantity)::numeric AS qty,
      MAX(ii.unit_price) AS unit_price
    FROM public.invoice_items ii
    WHERE ii.invoice_id = p_invoice_id
      AND ii.variant_id IS NOT NULL
    GROUP BY ii.variant_id
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    PERFORM public.store_inventory_apply_delta(v_store_id, r.variant_id, v_delta, true);

    PERFORM public.log_stock_movement(
      r.variant_id,
      v_delta,
      CASE WHEN p_multiplier = -1 THEN 'sale' ELSE 'return' END,
      p_invoice_id,
      'invoice',
      CASE WHEN p_multiplier = -1 THEN 'ERP invoice sale' ELSE 'ERP invoice stock restore' END,
      v_store_id,
      NULL,
      r.unit_price
    );
  END LOOP;

  UPDATE public.invoices
  SET inventory_committed = (p_multiplier = -1)
  WHERE id = p_invoice_id;
END;
$$;

-- ─── 4. create_erp_invoice: store access + idempotent stock commit ───────────

CREATE OR REPLACE FUNCTION public.create_erp_invoice(
  p_user_id uuid,
  p_store_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_lines jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sales_person_id uuid DEFAULT NULL,
  p_estimate_id uuid DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
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
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_user_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Customer and store are required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_invoice_number := public.next_erp_document_number('sales_invoice');

  INSERT INTO public.invoices (
    order_id, user_id, invoice_number, subtotal, gst_amount, total_amount,
    status, created_at, due_date, issued_at, store_id, amount_paid,
    credits_applied, balance_due, discount, source, sales_person_id,
    reference, tax_inclusive, estimate_id, notes, inventory_committed
  )
  VALUES (
    NULL, p_user_id, v_invoice_number, 0, 0, 0,
    'pending', now(), p_due_date, CASE WHEN p_finalize THEN now() ELSE NULL END,
    p_store_id, 0, 0, 0, COALESCE(p_discount, 0), 'erp',
    p_sales_person_id, p_reference, COALESCE(p_tax_inclusive, false),
    p_estimate_id, p_notes, false
  )
  RETURNING id INTO v_invoice_id;

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
      v_invoice_id,
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
    subtotal = v_subtotal,
    gst_amount = v_tax,
    total_amount = v_total,
    balance_due = v_total,
    status = CASE WHEN p_finalize THEN 'issued' ELSE 'pending' END
  WHERE id = v_invoice_id;

  IF p_finalize THEN
    PERFORM public.inventory_apply_invoice_stock(v_invoice_id, -1);
  END IF;

  IF p_estimate_id IS NOT NULL THEN
    UPDATE public.erp_estimates
    SET status = 'converted', converted_invoice_id = v_invoice_id, updated_at = now()
    WHERE id = p_estimate_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;

-- ─── 5. Credit note stock restore: store_inventory + movements + idempotency ──

CREATE OR REPLACE FUNCTION public.create_erp_credit_note(
  p_user_id uuid,
  p_store_id uuid,
  p_credit_note_date date,
  p_lines jsonb,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_restore_stock boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
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
    status, notes, balance_remaining, created_by, inventory_committed
  )
  VALUES (
    v_cn_number, p_store_id, p_user_id, p_reference, p_credit_note_date,
    CASE WHEN p_finalize THEN 'issued' ELSE 'draft' END,
    p_notes, 0, p_created_by, false
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

      UPDATE public.erp_credit_notes SET inventory_committed = true WHERE id = v_cn_id;
    END IF;
  END IF;

  RETURN v_cn_id;
END;
$$;

-- ─── 6. Order stock: deduct from order store when available ─────────────────

CREATE OR REPLACE FUNCTION public.inventory_apply_order_stock(
  p_order_id uuid,
  p_multiplier integer DEFAULT -1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order_user uuid;
  v_store_id uuid;
  v_is_staff boolean;
  v_committed boolean;
  r record;
  v_delta numeric;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order id is required';
  END IF;

  IF p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid stock multiplier';
  END IF;

  SELECT user_id, inventory_committed, store_id
  INTO v_order_user, v_committed, v_store_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF p_multiplier = -1 AND v_committed THEN
    RETURN;
  END IF;

  IF p_multiplier = 1 AND NOT v_committed THEN
    RETURN;
  END IF;

  v_is_staff := EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_uid AND role::text IN ('admin', 'manager')
  );

  IF NOT v_is_staff AND (v_uid IS NULL OR v_uid <> v_order_user) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR r IN
    SELECT oi.variant_id, SUM(oi.quantity)::numeric AS qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
    GROUP BY oi.variant_id
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    IF v_store_id IS NOT NULL THEN
      PERFORM public.store_inventory_apply_delta(v_store_id, r.variant_id, v_delta, true, v_uid);

      PERFORM public.log_stock_movement(
        r.variant_id, v_delta,
        CASE WHEN p_multiplier = -1 THEN 'sale' ELSE 'return' END,
        p_order_id, 'order',
        CASE WHEN p_multiplier = -1 THEN 'Order sale' ELSE 'Order cancel restore' END,
        v_store_id, NULL, NULL
      );
    ELSE
      -- Legacy orders without store: central only
      PERFORM public.inventory_apply_invoice_stock_legacy_variant(r.variant_id, v_delta);
    END IF;
  END LOOP;

  UPDATE public.orders
  SET inventory_committed = (p_multiplier = -1)
  WHERE id = p_order_id;
END;
$$;

-- Helper for legacy central-only order path
CREATE OR REPLACE FUNCTION public.inventory_apply_invoice_stock_legacy_variant(
  p_variant_id uuid,
  p_delta numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_new numeric;
BEGIN
  SELECT stock INTO v_stock FROM public.inventory WHERE variant_id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_delta < 0 THEN
      RAISE EXCEPTION 'No inventory row for variant %', p_variant_id;
    END IF;
    INSERT INTO public.inventory (variant_id, stock, updated_at) VALUES (p_variant_id, p_delta, now());
    RETURN;
  END IF;
  v_new := COALESCE(v_stock, 0) + p_delta;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'Insufficient central stock for variant %', p_variant_id;
  END IF;
  UPDATE public.inventory SET stock = v_new, updated_at = now() WHERE variant_id = p_variant_id;
END;
$$;

-- ─── 7. Transfer completion: validate qty before deduct ─────────────────────

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
  v_available numeric;
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

  -- Pre-validate all lines before any mutation
  FOR r IN
    SELECT variant_id, quantity, transfer_price
    FROM public.erp_store_transfer_lines
    WHERE transfer_id = p_transfer_id
  LOOP
    SELECT COALESCE(stock, 0) INTO v_available
    FROM public.store_inventory
    WHERE store_id = v_from AND variant_id = r.variant_id;

    IF COALESCE(v_available, 0) < r.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for variant % at source store (available %, requested %)',
        r.variant_id, COALESCE(v_available, 0), r.quantity;
    END IF;
  END LOOP;

  IF v_status = 'draft' THEN
    UPDATE public.erp_store_transfers SET status = 'approved' WHERE id = p_transfer_id;
  END IF;

  FOR r IN
    SELECT variant_id, quantity, transfer_price
    FROM public.erp_store_transfer_lines
    WHERE transfer_id = p_transfer_id
  LOOP
    PERFORM public.store_inventory_apply_delta(v_from, r.variant_id, -r.quantity, false, p_completed_by);
    PERFORM public.store_inventory_apply_delta(v_to, r.variant_id, r.quantity, false, p_completed_by);

    PERFORM public.log_stock_movement(
      r.variant_id, -r.quantity, 'transfer_out', p_transfer_id, 'store_transfer',
      'Store transfer out', v_from, v_to, r.transfer_price
    );
    PERFORM public.log_stock_movement(
      r.variant_id, r.quantity, 'transfer_in', p_transfer_id, 'store_transfer',
      'Store transfer in', v_to, v_from, r.transfer_price
    );
  END LOOP;

  UPDATE public.erp_store_transfers
  SET status = 'completed', inventory_committed = true, updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── 8. Atomic bulk transfer payments (single transaction + idempotency) ──────

CREATE OR REPLACE FUNCTION public.record_erp_transfer_bulk_payment(
  p_payment_date date,
  p_payment_mode text,
  p_allocations jsonb,
  p_account_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
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
  v_transfer_id uuid;
  v_amount numeric;
  v_from uuid;
  v_to uuid;
  v_status text;
  v_total_amount numeric;
  v_paid numeric;
  v_balance numeric;
  v_existing uuid[];
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_allocations IS NULL OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'At least one allocation is required';
  END IF;

  v_batch_ref := COALESCE(NULLIF(TRIM(p_reference), ''), 'BULK:' || gen_random_uuid()::text);

  -- Idempotency: if batch reference already recorded, return existing payment ids
  SELECT array_agg(id ORDER BY created_at)
  INTO v_existing
  FROM public.erp_transfer_payments
  WHERE reference = v_batch_ref;

  IF v_existing IS NOT NULL AND array_length(v_existing, 1) > 0 THEN
    RETURN jsonb_build_object('reference', v_batch_ref, 'payment_ids', to_jsonb(v_existing), 'idempotent', true);
  END IF;

  -- Validate all allocations before writing
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_transfer_id := (v_row ->> 'transfer_id')::uuid;
    v_amount := COALESCE((v_row ->> 'amount')::numeric, 0);

    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Payment amount must be positive';
    END IF;

    SELECT from_store_id, to_store_id, status
    INTO v_from, v_to, v_status
    FROM public.erp_store_transfers
    WHERE id = v_transfer_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transfer not found: %', v_transfer_id;
    END IF;

    IF v_status NOT IN ('approved', 'in_transit', 'completed') THEN
      RAISE EXCEPTION 'Transfer % not eligible for payment', v_transfer_id;
    END IF;

    SELECT COALESCE(SUM(line_total), 0) INTO v_total_amount
    FROM public.erp_store_transfer_lines WHERE transfer_id = v_transfer_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.erp_transfer_payments WHERE transfer_id = v_transfer_id;

    v_balance := v_total_amount - v_paid;

    IF v_amount > v_balance + 0.01 THEN
      RAISE EXCEPTION 'Payment amount % exceeds transfer balance %', v_amount, v_balance;
    END IF;
  END LOOP;

  -- All validations passed — record payments atomically
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_transfer_id := (v_row ->> 'transfer_id')::uuid;
    v_amount := (v_row ->> 'amount')::numeric;

    v_payment_id := public.record_erp_transfer_payment(
      v_transfer_id, p_payment_date, p_payment_mode, v_amount,
      p_account_id, v_batch_ref, p_notes, p_created_by
    );
    v_payment_ids := array_append(v_payment_ids, v_payment_id);
  END LOOP;

  RETURN jsonb_build_object(
    'reference', v_batch_ref,
    'payment_ids', to_jsonb(v_payment_ids),
    'idempotent', false
  );
END;
$$;

-- ─── 9. Atomic bulk supplier payments (multi-vendor, single transaction) ──────

CREATE OR REPLACE FUNCTION public.record_erp_supplier_bulk_payment(
  p_store_id uuid,
  p_payment_date date,
  p_payment_mode text,
  p_lines jsonb,
  p_account_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
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
    RETURN jsonb_build_object('reference', v_batch_ref, 'payment_ids', to_jsonb(v_existing), 'idempotent', true);
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_vendor_id := (v_row ->> 'vendor_id')::uuid;
    v_amount := COALESCE((v_row ->> 'amount')::numeric, 0);
    v_allocations := COALESCE(v_row -> 'allocations', '[]'::jsonb);

    IF v_vendor_id IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Each line requires vendor_id and positive amount';
    END IF;
  END LOOP;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_vendor_id := (v_row ->> 'vendor_id')::uuid;
    v_amount := (v_row ->> 'amount')::numeric;
    v_allocations := COALESCE(v_row -> 'allocations', '[]'::jsonb);

    v_payment_id := public.record_erp_supplier_payment(
      v_vendor_id, p_store_id, p_payment_date, p_payment_mode,
      v_amount, p_account_id, v_batch_ref, p_notes, true, v_allocations, p_created_by
    );
    v_payment_ids := array_append(v_payment_ids, v_payment_id);
  END LOOP;

  RETURN jsonb_build_object(
    'reference', v_batch_ref,
    'payment_ids', to_jsonb(v_payment_ids),
    'idempotent', false
  );
END;
$$;

-- ─── 10. Vendor credit stock idempotency guard ───────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_vendor_credit(
  p_vendor_id uuid,
  p_store_id uuid,
  p_credit_date date,
  p_lines jsonb,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_reduce_stock boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
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
  v_already_committed boolean;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  v_credit_number := public.next_erp_document_number('vendor_credit');

  INSERT INTO public.erp_vendor_credits (
    credit_number, vendor_id, store_id, reference, credit_date,
    status, notes, balance_remaining, created_by
  )
  VALUES (
    v_credit_number, p_vendor_id, p_store_id, p_reference, p_credit_date,
    CASE WHEN p_finalize THEN 'issued' ELSE 'draft' END,
    p_notes, 0, p_created_by
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
    SELECT inventory_committed INTO v_already_committed
    FROM public.erp_vendor_credits WHERE id = v_credit_id FOR UPDATE;

    IF NOT COALESCE(v_already_committed, false) THEN
      PERFORM public.inventory_apply_vendor_credit_stock(v_credit_id);
      UPDATE public.erp_vendor_credits SET inventory_committed = true WHERE id = v_credit_id;
    END IF;
  END IF;

  RETURN v_credit_id;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.reconcile_central_inventory_from_stores(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_apply_invoice_stock_legacy_variant(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_transfer_bulk_payment(date, text, jsonb, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_supplier_bulk_payment(uuid, date, text, jsonb, uuid, text, text, uuid) TO authenticated;

COMMIT;
