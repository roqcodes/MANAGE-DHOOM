-- Standalone (non-PO) purchase bills: physical stock + GL on finalize.
-- PO-linked bills unchanged: stock on purchase receive, bill clears GRNI → AP.
-- Guards prevent double receipt (bill + GRN) and bill + draft GRN races.

BEGIN;

-- True when bill posting should use GRNI clearing (3-way / receive-first), not direct STOCK/AP.
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
  OR EXISTS (
    SELECT 1
    FROM public.erp_purchase_receives pr
    WHERE pr.purchase_bill_id = p_bill_id
      AND pr.document_kind = 'receive'
      AND pr.status = 'finalized'
      AND pr.inventory_committed = true
  );
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
  v_posted boolean;
  v_total numeric;
  v_po_id uuid;
  v_store_id uuid;
  v_committed boolean;
  v_stock_via_receive boolean;
BEGIN
  IF p_finalized_by IS NULL OR NOT public.is_staff_user(p_finalized_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, accounting_posted, total_amount, po_id, store_id, inventory_committed
  INTO v_status, v_posted, v_total, v_po_id, v_store_id, v_committed
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

  v_stock_via_receive := EXISTS (
    SELECT 1
    FROM public.erp_purchase_receives pr
    WHERE pr.purchase_bill_id = p_bill_id
      AND pr.document_kind = 'receive'
      AND pr.status = 'finalized'
      AND pr.inventory_committed = true
  );

  IF v_po_id IS NOT NULL AND v_status = 'draft' THEN
    IF NOT v_stock_via_receive THEN
      RAISE EXCEPTION 'Submit delivery on the purchase order before finalizing the invoice';
    END IF;
  END IF;

  IF v_status <> 'draft' AND v_posted THEN
    RETURN;
  END IF;

  -- Standalone bill: receipt-at-invoice (2-way). Block if an open GRN is linked.
  IF v_po_id IS NULL AND NOT v_committed AND NOT v_stock_via_receive THEN
    IF EXISTS (
      SELECT 1
      FROM public.erp_purchase_receives pr
      WHERE pr.purchase_bill_id = p_bill_id
        AND pr.document_kind = 'receive'
        AND pr.status = 'draft'
    ) THEN
      RAISE EXCEPTION
        'Finalize or cancel the linked draft purchase receive before finalizing this bill';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.erp_purchase_bill_lines pbl
      LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
      WHERE pbl.purchase_bill_id = p_bill_id
        AND COALESCE(pbl.product_id, pv.product_id) IS NULL
    ) THEN
      RAISE EXCEPTION 'Each bill line must have a product before finalize (inventory tracking)';
    END IF;

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
        'Linked purchase bill already increased stock on finalize; use bill-only receipt or cancel the bill first';
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
  v_stock_on_bill boolean;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id, inventory_committed
  INTO v_status, v_store_id, v_stock_on_bill
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
    RAISE EXCEPTION 'Cannot cancel bill with finalized purchase receives; cancel receives first';
  END IF;

  IF COALESCE(v_stock_on_bill, false) THEN
    PERFORM public.inventory_apply_purchase_bill_stock(p_bill_id, -1, p_actor);
    UPDATE public.erp_purchase_bills
    SET inventory_committed = false
    WHERE id = p_bill_id;
  END IF;

  UPDATE public.erp_purchase_bills
  SET status = 'cancelled', balance_due = 0, updated_at = now()
  WHERE id = p_bill_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_bill_uses_grni_clearing(uuid) TO authenticated;

COMMIT;
