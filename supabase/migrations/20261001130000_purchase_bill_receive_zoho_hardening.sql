-- Zoho-aligned purchase bill / receive hardening:
-- - Standalone "mark as received" (physical_receipt_on_bill) vs bill-first + GRN later
-- - PO / linked receive: physical on receive, bill clears GRNI → AP
-- - Loop guards: no bill stock + receive stock; vendor/store match on link; void GL on cancel

BEGIN;

ALTER TABLE public.erp_purchase_bills
  ADD COLUMN IF NOT EXISTS physical_receipt_on_bill boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.erp_purchase_bills.physical_receipt_on_bill IS
  'Standalone bills only: true = increase stock on bill finalize (Zoho mark received). false = bill posts GRNI/AP; stock on linked purchase receive.';

-- ─── Policy helpers (single source of truth) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.purchase_bill_has_active_linked_receive(p_bill_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.erp_purchase_receives pr
    WHERE pr.purchase_bill_id = p_bill_id
      AND pr.document_kind = 'receive'
      AND pr.status NOT IN ('cancelled', 'reversed')
  );
$$;

CREATE OR REPLACE FUNCTION public.purchase_bill_stock_already_via_receive(p_bill_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.erp_purchase_receives pr
    WHERE pr.purchase_bill_id = p_bill_id
      AND pr.document_kind = 'receive'
      AND pr.status = 'finalized'
      AND pr.inventory_committed = true
  );
$$;

CREATE OR REPLACE FUNCTION public.purchase_bill_should_increase_stock_on_finalize(p_bill_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id uuid;
  v_committed boolean;
  v_on_bill boolean;
BEGIN
  SELECT po_id, inventory_committed, physical_receipt_on_bill
  INTO v_po_id, v_committed, v_on_bill
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id;

  IF NOT FOUND OR COALESCE(v_committed, false) THEN
    RETURN false;
  END IF;

  IF v_po_id IS NOT NULL THEN
    RETURN false;
  END IF;

  IF public.purchase_bill_stock_already_via_receive(p_bill_id) THEN
    RETURN false;
  END IF;

  IF public.purchase_bill_has_active_linked_receive(p_bill_id) THEN
    RETURN false;
  END IF;

  RETURN COALESCE(v_on_bill, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_bill_uses_grni_clearing(p_bill_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT pb.po_id IS NOT NULL
      FROM public.erp_purchase_bills pb
      WHERE pb.id = p_bill_id
    ),
    false
  )
  OR public.purchase_bill_stock_already_via_receive(p_bill_id)
  OR public.purchase_bill_has_active_linked_receive(p_bill_id)
  OR COALESCE(
    (
      SELECT NOT pb.physical_receipt_on_bill
      FROM public.erp_purchase_bills pb
      WHERE pb.id = p_bill_id
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_purchase_bill_lines_have_products(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.erp_purchase_bill_lines pbl
    LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
    WHERE pbl.purchase_bill_id = p_bill_id
      AND COALESCE(pbl.product_id, pv.product_id) IS NULL
  ) THEN
    RAISE EXCEPTION 'Each bill line must have a product before stock receipt';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.erp_purchase_bill_lines pbl
    LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
    WHERE pbl.purchase_bill_id = p_bill_id
      AND COALESCE(pbl.quantity, 0) > 0
      AND COALESCE(pbl.product_id, pv.product_id) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'At least one product line with quantity is required for stock receipt';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_purchase_receive_bill_link(
  p_purchase_bill_id uuid,
  p_vendor_id uuid,
  p_store_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor uuid;
  v_store uuid;
  v_status text;
  v_stock_on_bill boolean;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT vendor_id, store_id, status, inventory_committed
  INTO v_vendor, v_store, v_status, v_stock_on_bill
  FROM public.erp_purchase_bills
  WHERE id = p_purchase_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked purchase bill not found';
  END IF;

  PERFORM public.require_store_access(v_store, p_actor);

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot link a receive to a cancelled bill';
  END IF;

  IF v_vendor <> p_vendor_id THEN
    RAISE EXCEPTION 'Purchase receive vendor must match the linked bill vendor';
  END IF;

  IF v_store <> p_store_id THEN
    RAISE EXCEPTION 'Purchase receive store must match the linked bill store';
  END IF;

  IF COALESCE(v_stock_on_bill, false) THEN
    RAISE EXCEPTION
      'Bill already increased stock on finalize; record receipt on the bill only or cancel the bill first';
  END IF;
END;
$$;

-- ─── Stock RPC: idempotent receipt / reversal ────────────────────────────────

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
  v_committed boolean;
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

  SELECT store_id, inventory_committed
  INTO v_store_id, v_committed
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill store not found';
  END IF;

  PERFORM public.require_store_access(v_store_id, v_actor);

  IF p_multiplier = 1 AND COALESCE(v_committed, false) THEN
    RETURN;
  END IF;

  IF p_multiplier = -1 AND NOT COALESCE(v_committed, false) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT
      COALESCE(pbl.product_id, pv.product_id) AS product_id,
      SUM(pbl.quantity)::numeric AS qty,
      AVG(pbl.purchase_price) AS avg_price
    FROM public.erp_purchase_bill_lines pbl
    LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
    WHERE pbl.purchase_bill_id = p_bill_id
      AND COALESCE(pbl.product_id, pv.product_id) IS NOT NULL
    GROUP BY COALESCE(pbl.product_id, pv.product_id)
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    PERFORM public.store_product_inventory_apply_delta(v_store_id, r.product_id, v_delta, v_actor);

    IF p_multiplier = 1 AND r.avg_price > 0 THEN
      UPDATE public.store_product_inventory
      SET purchase_price = r.avg_price, updated_at = now()
      WHERE store_id = v_store_id AND product_id = r.product_id;
    END IF;

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta, 'purchase', p_bill_id, 'purchase_bill',
      'Purchase Bill Receipt', v_store_id, NULL, r.avg_price, v_actor
    );
  END LOOP;
END;
$$;

-- ─── Bill finalize ───────────────────────────────────────────────────────────

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
  v_posted boolean;
  v_total numeric;
  v_po_id uuid;
  v_store_id uuid;
  v_apply_stock boolean;
BEGIN
  IF p_finalized_by IS NULL OR NOT public.is_staff_user(p_finalized_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, accounting_posted, total_amount, po_id, store_id
  INTO v_status, v_posted, v_total, v_po_id, v_store_id
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot finalize cancelled bill';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_finalized_by);

  IF v_po_id IS NOT NULL AND v_status = 'draft' THEN
    IF NOT public.purchase_bill_stock_already_via_receive(p_bill_id) THEN
      RAISE EXCEPTION 'Submit delivery on the purchase order before finalizing the invoice';
    END IF;
  END IF;

  IF v_status <> 'draft' AND v_posted THEN
    RETURN;
  END IF;

  v_apply_stock := public.purchase_bill_should_increase_stock_on_finalize(p_bill_id);

  IF v_apply_stock THEN
    PERFORM public.assert_purchase_bill_lines_have_products(p_bill_id);
    PERFORM public.inventory_apply_purchase_bill_stock(p_bill_id, 1, p_finalized_by);
    UPDATE public.erp_purchase_bills
    SET inventory_committed = true
    WHERE id = p_bill_id;
  END IF;

  UPDATE public.erp_purchase_bills
  SET
    status = 'finalized',
    balance_due = v_total,
    accounting_posted = true,
    updated_at = now()
  WHERE id = p_bill_id;

  PERFORM public.post_journal_for_purchase_bill(p_bill_id, p_finalized_by);

  IF v_po_id IS NOT NULL THEN
    PERFORM public.sync_purchase_order_receiving_status(v_po_id);
  END IF;
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
  v_use_grni boolean;
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

  IF COALESCE(v_total, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_use_grni := public.purchase_bill_uses_grni_clearing(p_bill_id);

  IF v_use_grni THEN
    PERFORM public.ensure_system_ledger_account('GOODS_RECEIPT_PENDING', 'Goods Receipt Pending');
    PERFORM public.ensure_system_ledger_account('ACCOUNTS_PAYABLE', 'Accounts Payable');

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', 'GOODS_RECEIPT_PENDING', 'debit', v_total,
        'description', 'Purchase bill ' || v_number
      ),
      jsonb_build_object(
        'account_code', 'ACCOUNTS_PAYABLE', 'credit', v_total,
        'description', 'AP'
      )
    );
  ELSE
    PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');
    PERFORM public.ensure_system_ledger_account('ACCOUNTS_PAYABLE', 'Accounts Payable');

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', 'STOCK', 'debit', v_total,
        'description', 'Purchase bill ' || v_number
      ),
      jsonb_build_object(
        'account_code', 'ACCOUNTS_PAYABLE', 'credit', v_total,
        'description', 'AP'
      )
    );
  END IF;

  RETURN public.create_posted_journal_entry(
    v_date, 'Purchase bill ' || v_number, v_store_id, 'purchase_bill', p_bill_id, v_lines, p_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_erp_purchase_receive(
  p_receive_id uuid,
  p_reconcile_bill boolean DEFAULT NULL,
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
  v_store_id uuid;
  v_po_id uuid;
  v_bill_id uuid;
  v_bill_status text;
  v_bill_posted boolean;
  v_bill_stock_committed boolean;
  v_reconcile boolean;
  r record;
BEGIN
  IF p_finalized_by IS NULL OR NOT public.is_staff_user(p_finalized_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, inventory_committed, store_id, po_id, purchase_bill_id, reconcile_bill
  INTO v_status, v_committed, v_store_id, v_po_id, v_bill_id, v_reconcile
  FROM public.erp_purchase_receives
  WHERE id = p_receive_id AND document_kind = 'receive'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase receive not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot finalize cancelled receive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_finalized_by);

  IF v_status = 'finalized' AND v_committed THEN
    RETURN;
  END IF;

  v_reconcile := COALESCE(p_reconcile_bill, v_reconcile, true);

  IF v_bill_id IS NOT NULL THEN
    SELECT status, accounting_posted, inventory_committed
    INTO v_bill_status, v_bill_posted, v_bill_stock_committed
    FROM public.erp_purchase_bills
    WHERE id = v_bill_id;

    IF v_bill_posted OR v_bill_status IN ('finalized', 'partial', 'paid') THEN
      v_reconcile := false;
    END IF;

    IF COALESCE(v_bill_stock_committed, false) THEN
      RAISE EXCEPTION
        'Linked purchase bill already received stock on finalize; cancel the bill or use a bill without mark-as-received';
    END IF;
  END IF;

  IF NOT v_committed THEN
    PERFORM public.inventory_apply_purchase_receive_stock(p_receive_id, 1, p_finalized_by);

    FOR r IN
      SELECT prl.po_line_id, prl.bill_line_id, prl.accepted_qty, prl.rejected_qty, prl.received_qty
      FROM public.erp_purchase_receive_lines prl
      WHERE prl.purchase_receive_id = p_receive_id
    LOOP
      IF r.po_line_id IS NOT NULL THEN
        UPDATE public.purchase_order_items poi
        SET
          received_qty = COALESCE(poi.received_qty, 0) + COALESCE(r.received_qty, 0),
          accepted_qty = COALESCE(poi.accepted_qty, 0) + COALESCE(r.accepted_qty, 0),
          rejected_qty = COALESCE(poi.rejected_qty, 0) + COALESCE(r.rejected_qty, 0)
        WHERE poi.id = r.po_line_id;
      END IF;

      IF r.bill_line_id IS NOT NULL THEN
        UPDATE public.erp_purchase_bill_lines pbl
        SET
          received_qty = COALESCE(pbl.received_qty, 0) + COALESCE(r.received_qty, 0),
          accepted_qty = COALESCE(pbl.accepted_qty, 0) + COALESCE(r.accepted_qty, 0),
          rejected_qty = COALESCE(pbl.rejected_qty, 0) + COALESCE(r.rejected_qty, 0)
        WHERE pbl.id = r.bill_line_id;
      END IF;
    END LOOP;

    UPDATE public.erp_purchase_receives
    SET inventory_committed = true
    WHERE id = p_receive_id;
  END IF;

  IF v_reconcile AND v_bill_id IS NOT NULL THEN
    PERFORM public.reconcile_draft_purchase_bill_from_receive(p_receive_id, p_finalized_by);
  END IF;

  UPDATE public.erp_purchase_receives
  SET
    status = 'finalized',
    reconcile_bill = v_reconcile,
    updated_by = p_finalized_by,
    updated_at = now()
  WHERE id = p_receive_id;

  PERFORM public.post_journal_for_purchase_receive(p_receive_id, p_finalized_by);

  IF v_po_id IS NOT NULL THEN
    PERFORM public.sync_purchase_order_receiving_status(v_po_id);
  END IF;
END;
$$;

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
  v_po_id uuid;
  v_stock_on_bill boolean;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id, po_id, inventory_committed
  INTO v_status, v_store_id, v_po_id, v_stock_on_bill
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
    SELECT 1 FROM public.erp_purchase_receives
    WHERE purchase_bill_id = p_bill_id AND status = 'finalized'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel bill with finalized purchase receives; cancel or reverse receives first';
  END IF;

  IF COALESCE(v_stock_on_bill, false) THEN
    PERFORM public.inventory_apply_purchase_bill_stock(p_bill_id, -1, p_actor);
    UPDATE public.erp_purchase_bills
    SET inventory_committed = false
    WHERE id = p_bill_id;
  END IF;

  PERFORM public.void_journals_for_entity('purchase_bill', p_bill_id);

  UPDATE public.erp_purchase_bills
  SET
    status = 'cancelled',
    balance_due = 0,
    accounting_posted = false,
    updated_at = now()
  WHERE id = p_bill_id;

  IF v_po_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.erp_purchase_bills
    WHERE po_id = v_po_id
      AND status <> 'cancelled'
      AND id <> p_bill_id
  ) THEN
    UPDATE public.purchase_orders
    SET status = 'accepted', updated_at = now()
    WHERE id = v_po_id AND status = 'converted';
  END IF;
END;
$$;

-- Patch create receive: validate bill link (Zoho "receive billed items")
CREATE OR REPLACE FUNCTION public.create_erp_purchase_receive(
  p_vendor_id uuid,
  p_store_id uuid,
  p_receive_date date,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_po_id uuid DEFAULT NULL,
  p_purchase_bill_id uuid DEFAULT NULL,
  p_expected_delivery_date date DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reconcile_bill boolean DEFAULT true,
  p_finalize boolean DEFAULT false,
  p_allow_over_authorization boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receive_id uuid;
  v_receive_number text;
  v_line jsonb;
  v_variant_id uuid;
  v_product_id uuid;
  v_po_line_id uuid;
  v_bill_line_id uuid;
  v_ordered numeric;
  v_billed numeric;
  v_received numeric;
  v_accepted numeric;
  v_rejected numeric;
  v_price numeric;
  v_tax_rate numeric;
  v_max_qty numeric;
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

  IF p_purchase_bill_id IS NOT NULL THEN
    PERFORM public.assert_purchase_receive_bill_link(
      p_purchase_bill_id, p_vendor_id, p_store_id, p_created_by
    );
  END IF;

  SELECT out_id, out_ref INTO v_receive_id, v_receive_number
  FROM public.erp_next_document_ref('purchase_receive') AS t;

  INSERT INTO public.erp_purchase_receives (
    id, receive_number, vendor_id, store_id, po_id, purchase_bill_id,
    receive_date, expected_delivery_date, reference, notes, reconcile_bill,
    allow_over_authorization, status, created_by, updated_by
  )
  VALUES (
    v_receive_id, v_receive_number, p_vendor_id, p_store_id, p_po_id, p_purchase_bill_id,
    p_receive_date, p_expected_delivery_date, p_reference, p_notes, COALESCE(p_reconcile_bill, true),
    COALESCE(p_allow_over_authorization, false), 'draft', p_created_by, p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_po_line_id := NULLIF(v_line ->> 'po_line_id', '')::uuid;
    v_bill_line_id := NULLIF(v_line ->> 'bill_line_id', '')::uuid;
    v_variant_id := NULLIF(v_line ->> 'variant_id', '')::uuid;
    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    v_ordered := COALESCE((v_line ->> 'ordered_qty')::numeric, 0);
    v_billed := COALESCE((v_line ->> 'billed_qty')::numeric, 0);
    v_received := COALESCE((v_line ->> 'received_qty')::numeric, 0);
    v_accepted := COALESCE((v_line ->> 'accepted_qty')::numeric, 0);
    v_rejected := COALESCE((v_line ->> 'rejected_qty')::numeric, 0);
    v_price := COALESCE((v_line ->> 'purchase_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);

    IF v_product_id IS NULL AND v_variant_id IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = v_variant_id;
    END IF;

    IF v_product_id IS NULL AND v_po_line_id IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.purchase_order_items
      WHERE id = v_po_line_id;
    END IF;

    IF v_accepted < 0 OR v_rejected < 0 OR v_received < 0 THEN
      RAISE EXCEPTION 'Quantities cannot be negative';
    END IF;

    IF v_po_line_id IS NOT NULL THEN
      SELECT quantity INTO v_ordered FROM public.purchase_order_items WHERE id = v_po_line_id;
    END IF;

    IF v_bill_line_id IS NOT NULL THEN
      SELECT quantity, purchase_price, tax_rate_percent
      INTO v_billed, v_price, v_tax_rate
      FROM public.erp_purchase_bill_lines WHERE id = v_bill_line_id;
    END IF;

    v_max_qty := NULLIF(GREATEST(COALESCE(v_billed, 0), COALESCE(v_ordered, 0)), 0);

    IF v_max_qty IS NOT NULL AND v_accepted > 0 THEN
      PERFORM public.validate_purchase_receive_over_qty(
        v_bill_line_id, v_po_line_id, v_max_qty, v_accepted, p_allow_over_authorization
      );
    END IF;

    INSERT INTO public.erp_purchase_receive_lines (
      purchase_receive_id, po_line_id, bill_line_id, variant_id, product_id, product_name, barcode,
      ordered_qty, billed_qty, received_qty, accepted_qty, rejected_qty,
      purchase_price, tax_rate_percent, expiry_date, batch_reference, batch_code, batch_number
    )
    VALUES (
      v_receive_id,
      v_po_line_id,
      v_bill_line_id,
      v_variant_id,
      v_product_id,
      COALESCE(v_line ->> 'product_name', 'Item'),
      v_line ->> 'barcode',
      COALESCE(v_ordered, 0),
      COALESCE(v_billed, 0),
      v_received,
      v_accepted,
      v_rejected,
      v_price,
      v_tax_rate,
      NULLIF(v_line ->> 'expiry_date', '')::date,
      v_line ->> 'batch_reference',
      v_line ->> 'batch_code',
      v_line ->> 'batch_number'
    );
  END LOOP;

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_receive(v_receive_id, p_reconcile_bill, p_created_by);
  END IF;

  RETURN v_receive_id;
END;
$$;

-- create_erp_purchase_bill: persist physical_receipt_on_bill (standalone only)
DROP FUNCTION IF EXISTS public.create_erp_purchase_bill(
  uuid, uuid, date, date, jsonb, jsonb, numeric, uuid, text, text, text, text, text, uuid, date, boolean, uuid
);

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
  p_expected_delivery_date date DEFAULT NULL,
  p_finalize boolean DEFAULT false,
  p_physical_receipt_on_bill boolean DEFAULT true,
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
  v_expected_delivery date;
  v_product_id uuid;
  v_receipt_on_bill boolean;
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

  v_receipt_on_bill := CASE
    WHEN p_po_id IS NOT NULL THEN false
    ELSE COALESCE(p_physical_receipt_on_bill, true)
  END;

  v_expected_delivery := p_expected_delivery_date;
  IF v_expected_delivery IS NULL AND p_po_id IS NOT NULL THEN
    SELECT expected_delivery_date INTO v_expected_delivery
    FROM public.purchase_orders WHERE id = p_po_id;
  END IF;

  IF p_batch_reference IS NULL OR p_batch_reference = '' THEN
    v_batch_code := format('%s_%s', p_store_id::text, to_char(now(), 'YYYYMMDDHH24MISS'));
    v_batch_number := substr(to_char(floor(random() * 100000)::integer, 'FM99999'), 1, 10);
  ELSE
    v_batch_code := p_batch_reference;
    v_batch_number := p_batch_reference;
  END IF;

  SELECT t.out_id, t.out_ref INTO v_bill_id, v_bill_number
  FROM public.erp_next_document_ref('purchase_bill') AS t;

  INSERT INTO public.erp_purchase_bills (
    id, purchase_bill_number, vendor_bill_number, vendor_id, po_id, store_id,
    purchase_date, due_date, expected_delivery_date, grn_reference, batch_reference, batch_code, batch_number,
    reference, sales_person_id, status, notes, physical_receipt_on_bill, created_by
  )
  VALUES (
    v_bill_id, v_bill_number, p_vendor_bill_number, p_vendor_id, p_po_id, p_store_id,
    p_purchase_date, p_due_date, v_expected_delivery, p_grn_reference, p_batch_reference,
    v_batch_code, v_batch_number, p_reference, p_sales_person_id,
    'draft', p_notes, v_receipt_on_bill, p_created_by
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

    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    IF v_product_id IS NULL AND NULLIF(v_line ->> 'variant_id', '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid;
    END IF;

    INSERT INTO public.erp_purchase_bill_lines (
      purchase_bill_id, variant_id, product_id, product_name, barcode, expiry_date,
      quantity, original_quantity, purchase_price, tax_rate_percent, tax_amount, line_total,
      unit_id
    )
    VALUES (
      v_bill_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_product_id,
      v_line ->> 'product_name',
      v_line ->> 'barcode',
      NULLIF(v_line ->> 'expiry_date', '')::date,
      v_qty,
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
    balance_due = 0,
    updated_at = now()
  WHERE id = v_bill_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, p_created_by);
  END IF;

  RETURN v_bill_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_bill_has_active_linked_receive(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_bill_stock_already_via_receive(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_bill_should_increase_stock_on_finalize(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_bill_uses_grni_clearing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_purchase_receive_bill_link(uuid, uuid, uuid, uuid) TO authenticated;

COMMIT;
