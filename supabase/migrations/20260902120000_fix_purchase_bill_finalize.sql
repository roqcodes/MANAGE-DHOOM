-- Fix purchase bill create/finalize: document numbers via trigger, ledger account
-- seeding, zero-total finalize (no journal), and actor propagation for inventory.

BEGIN;

-- ─── Stock movement: allow SECURITY DEFINER callers to pass actor ─────────────

CREATE OR REPLACE FUNCTION public.log_stock_movement(
  p_variant_id uuid,
  p_quantity numeric,
  p_type text,
  p_reference_id uuid DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_transfer_store_id uuid DEFAULT NULL,
  p_transaction_price numeric DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
  v_user_id uuid;
  v_balance numeric;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_store_id IS NOT NULL THEN
    SELECT stock INTO v_balance
    FROM public.store_inventory
    WHERE store_id = p_store_id AND variant_id = p_variant_id;
  END IF;

  INSERT INTO public.stock_movements (
    variant_id, quantity, type, reference_id, reference_type, reason, user_id,
    store_id, transfer_store_id, transaction_price, balance_after
  )
  VALUES (
    p_variant_id, p_quantity, p_type, p_reference_id, p_reference_type, p_reason, v_user_id,
    p_store_id, p_transfer_store_id, p_transaction_price, v_balance
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

-- ─── Purchase bill stock: propagate actor to inventory helpers ───────────────

CREATE OR REPLACE FUNCTION public.inventory_apply_purchase_bill_stock(
  p_bill_id uuid,
  p_multiplier integer DEFAULT 1,
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
BEGIN
  v_actor := COALESCE(p_user_id, auth.uid());

  IF p_bill_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill id is required';
  END IF;

  IF p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid stock multiplier';
  END IF;

  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id INTO v_store_id
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill store not found';
  END IF;

  FOR r IN
    SELECT pbl.variant_id, SUM(pbl.quantity)::numeric AS qty
    FROM public.erp_purchase_bill_lines pbl
    WHERE pbl.purchase_bill_id = p_bill_id AND pbl.variant_id IS NOT NULL
    GROUP BY pbl.variant_id
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    PERFORM public.store_inventory_apply_delta(v_store_id, r.variant_id, v_delta, true, v_actor);

    PERFORM public.log_stock_movement(
      r.variant_id, v_delta, 'purchase', p_bill_id, 'purchase_bill',
      'Purchase Bill Receipt', v_store_id, NULL, NULL, v_actor
    );
  END LOOP;
END;
$$;

-- ─── Finalize: pass actor into inventory ─────────────────────────────────────

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
  IF p_finalized_by IS NULL OR NOT public.is_staff_user(p_finalized_by) THEN
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
    PERFORM public.inventory_apply_purchase_bill_stock(p_bill_id, 1, p_finalized_by);
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

-- ─── Journal posting: seed accounts + allow zero-total bills (stock-only) ────

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

  -- Free goods / zero-value receipts update stock only; no GL entry required.
  IF COALESCE(v_total, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');
  PERFORM public.ensure_system_ledger_account('ACCOUNTS_PAYABLE', 'Accounts Payable');

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'STOCK', 'debit', v_total, 'description', 'Purchase ' || v_number),
    jsonb_build_object('account_code', 'ACCOUNTS_PAYABLE', 'credit', v_total, 'description', 'AP')
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Purchase bill ' || v_number, v_store_id, 'purchase_bill', p_bill_id, v_lines, p_actor
  );
END;
$$;

-- ─── Create RPC: store access + document ref trigger compatibility ───────────

CREATE OR REPLACE FUNCTION public.create_erp_purchase_bill(
  p_vendor_id uuid,
  p_store_id uuid,
  p_purchase_date date,
  p_due_date date DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_landed_costs jsonb DEFAULT '[]'::jsonb,
  p_discount numeric DEFAULT 0,
  p_po_id uuid DEFAULT NULL,
  p_vendor_bill_number text DEFAULT NULL,
  p_grn_reference text DEFAULT NULL,
  p_batch_reference text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sales_person_id uuid DEFAULT NULL,
  p_finalize boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id uuid;
  v_bill_number text;
  v_line jsonb;
  v_lc jsonb;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_landed_total numeric := 0;
  v_qty numeric;
  v_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
  v_batch_code text;
  v_batch_number text;
BEGIN
  IF p_created_by IS NULL OR NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_vendor_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Vendor and store are required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  IF p_batch_reference IS NULL OR p_batch_reference = '' THEN
    v_batch_code := format('%s_%s', p_store_id::text, to_char(now(), 'YYYYMMDDHH24MISS'));
    v_batch_number := substr(to_char(floor(random() * 100000)::integer, 'FM99999'), 1, 10);
  ELSE
    v_batch_code := p_batch_reference;
    v_batch_number := p_batch_reference;
  END IF;

  v_bill_id := gen_random_uuid();
  v_bill_number := public.erp_format_document_ref('PB'::text, v_bill_id);

  INSERT INTO public.erp_purchase_bills (
    id, purchase_bill_number, vendor_bill_number, vendor_id, po_id, store_id,
    purchase_date, due_date, grn_reference, batch_reference, batch_code, batch_number,
    reference, sales_person_id, status, notes, created_by
  )
  VALUES (
    v_bill_id, v_bill_number, p_vendor_bill_number, p_vendor_id, p_po_id, p_store_id,
    p_purchase_date, p_due_date, p_grn_reference, p_batch_reference,
    v_batch_code, v_batch_number, p_reference, p_sales_person_id,
    'draft', p_notes, p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_price := COALESCE((v_line ->> 'purchase_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    INSERT INTO public.erp_purchase_bill_lines (
      purchase_bill_id, variant_id, product_name, barcode, expiry_date,
      quantity, purchase_price, tax_rate_percent, tax_amount, line_total,
      unit_id
    )
    VALUES (
      v_bill_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_line ->> 'barcode',
      NULLIF(v_line ->> 'expiry_date', '')::date,
      v_qty,
      v_price,
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(v_line ->> 'unit_id', '')::uuid
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  FOR v_lc IN SELECT * FROM jsonb_array_elements(p_landed_costs)
  LOOP
    v_qty := COALESCE((v_lc ->> 'quantity')::numeric, 1);
    v_price := COALESCE((v_lc ->> 'rate')::numeric, 0);
    v_tax_rate := COALESCE((v_lc ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    INSERT INTO public.erp_purchase_bill_landed_costs (
      purchase_bill_id, landed_cost_item_id, name, quantity, rate,
      tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_bill_id,
      NULLIF(v_lc ->> 'landed_cost_item_id', '')::uuid,
      v_lc ->> 'name',
      v_qty,
      v_price,
      v_tax_rate,
      v_line_tax,
      v_line_total
    );

    v_landed_total := v_landed_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_subtotal + v_tax - COALESCE(p_discount, 0)) + v_landed_total;

  UPDATE public.erp_purchase_bills
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax,
    discount = COALESCE(p_discount, 0),
    landed_cost_total = v_landed_total,
    total_amount = v_total,
    balance_due = CASE WHEN p_finalize THEN v_total ELSE 0 END,
    status = CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,
    updated_at = now()
  WHERE id = v_bill_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, p_created_by);
  END IF;

  RETURN v_bill_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_stock_movement(
  uuid, numeric, text, uuid, text, text, uuid, uuid, numeric, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.inventory_apply_purchase_bill_stock(uuid, integer, uuid) TO authenticated;

COMMIT;
