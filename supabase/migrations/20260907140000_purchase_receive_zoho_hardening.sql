-- Zoho-style purchase receive hardening:
-- 1) Formal reverse receive (audit doc + journal void)
-- 2) Posted bill shortfall → vendor credit path
-- 3) Persist over-receive authorization on receive

BEGIN;

ALTER TABLE public.erp_purchase_receives
  DROP CONSTRAINT IF EXISTS erp_purchase_receives_status_check;

ALTER TABLE public.erp_purchase_receives
  ADD CONSTRAINT erp_purchase_receives_status_check
  CHECK (status IN ('draft', 'finalized', 'cancelled', 'reversed'));

ALTER TABLE public.erp_purchase_receives
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'receive'
    CHECK (document_kind IN ('receive', 'reversal')),
  ADD COLUMN IF NOT EXISTS reversal_of_id uuid REFERENCES public.erp_purchase_receives (id),
  ADD COLUMN IF NOT EXISTS reversed_by_receive_id uuid REFERENCES public.erp_purchase_receives (id),
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS allow_over_authorization boolean NOT NULL DEFAULT false;

ALTER TABLE public.procurement_settings
  ADD COLUMN IF NOT EXISTS posted_bill_shortfall_policy text NOT NULL DEFAULT 'vendor_credit'
    CHECK (posted_bill_shortfall_policy IN ('vendor_credit', 'ignore'));

CREATE INDEX IF NOT EXISTS erp_purchase_receives_reversal_of_idx
  ON public.erp_purchase_receives (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

-- ─── Draft cancel only ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_erp_purchase_receive(
  p_receive_id uuid,
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
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id
  INTO v_status, v_store_id
  FROM public.erp_purchase_receives
  WHERE id = p_receive_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase receive not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft receives can be cancelled. Use reverse for finalized receives.';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  UPDATE public.erp_purchase_receives
  SET status = 'cancelled', updated_by = p_actor, updated_at = now()
  WHERE id = p_receive_id;
END;
$$;

-- ─── Reverse finalized receive (Zoho "undo receipt") ─────────────────────────

CREATE OR REPLACE FUNCTION public.reverse_erp_purchase_receive(
  p_receive_id uuid,
  p_reason text DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_committed boolean;
  v_store_id uuid;
  v_po_id uuid;
  v_reversal_id uuid;
  v_reversal_number text;
  v_vendor_id uuid;
  v_bill_id uuid;
  v_receive_date date;
  r record;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, inventory_committed, store_id, po_id, vendor_id, purchase_bill_id, receive_date, reversed_by_receive_id
  INTO v_status, v_committed, v_store_id, v_po_id, v_vendor_id, v_bill_id, v_receive_date, v_reversal_id
  FROM public.erp_purchase_receives
  WHERE id = p_receive_id AND document_kind = 'receive'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase receive not found';
  END IF;

  IF v_status = 'draft' THEN
    PERFORM public.cancel_erp_purchase_receive(p_receive_id, p_actor);
    RETURN p_receive_id;
  END IF;

  IF v_status = 'reversed' OR v_reversal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Purchase receive already reversed';
  END IF;

  IF v_status <> 'finalized' OR NOT v_committed THEN
    RAISE EXCEPTION 'Only finalized receives with committed stock can be reversed';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  SELECT t.out_id, t.out_ref INTO v_reversal_id, v_reversal_number
  FROM public.erp_next_document_ref('purchase_receive') AS t;

  INSERT INTO public.erp_purchase_receives (
    id, receive_number, vendor_id, store_id, po_id, purchase_bill_id,
    status, receive_date, reference, notes, document_kind, reversal_of_id,
    inventory_committed, reconcile_bill, created_by, updated_by
  )
  VALUES (
    v_reversal_id, v_reversal_number, v_vendor_id, v_store_id, v_po_id, v_bill_id,
    'finalized', CURRENT_DATE, NULL,
    COALESCE(p_reason, 'Reversal of ' || (SELECT receive_number FROM public.erp_purchase_receives WHERE id = p_receive_id)),
    'reversal', p_receive_id, true, false, p_actor, p_actor
  );

  INSERT INTO public.erp_purchase_receive_lines (
    purchase_receive_id, po_line_id, bill_line_id, variant_id, product_name, barcode,
    ordered_qty, billed_qty, received_qty, accepted_qty, rejected_qty,
    purchase_price, tax_rate_percent, expiry_date, batch_reference, batch_code, batch_number
  )
  SELECT
    v_reversal_id, prl.po_line_id, prl.bill_line_id, prl.variant_id, prl.product_name, prl.barcode,
    prl.ordered_qty, prl.billed_qty, prl.received_qty, prl.accepted_qty, prl.rejected_qty,
    prl.purchase_price, prl.tax_rate_percent, prl.expiry_date, prl.batch_reference, prl.batch_code, prl.batch_number
  FROM public.erp_purchase_receive_lines prl
  WHERE prl.purchase_receive_id = p_receive_id;

  PERFORM public.inventory_apply_purchase_receive_stock(p_receive_id, -1, p_actor);

  FOR r IN
    SELECT prl.po_line_id, prl.bill_line_id, prl.accepted_qty, prl.rejected_qty, prl.received_qty
    FROM public.erp_purchase_receive_lines prl
    WHERE prl.purchase_receive_id = p_receive_id
  LOOP
    IF r.po_line_id IS NOT NULL THEN
      UPDATE public.purchase_order_items poi
      SET
        received_qty = GREATEST(0, COALESCE(poi.received_qty, 0) - COALESCE(r.received_qty, 0)),
        accepted_qty = GREATEST(0, COALESCE(poi.accepted_qty, 0) - COALESCE(r.accepted_qty, 0)),
        rejected_qty = GREATEST(0, COALESCE(poi.rejected_qty, 0) - COALESCE(r.rejected_qty, 0))
      WHERE poi.id = r.po_line_id;
    END IF;

    IF r.bill_line_id IS NOT NULL THEN
      UPDATE public.erp_purchase_bill_lines pbl
      SET
        received_qty = GREATEST(0, COALESCE(pbl.received_qty, 0) - COALESCE(r.received_qty, 0)),
        accepted_qty = GREATEST(0, COALESCE(pbl.accepted_qty, 0) - COALESCE(r.accepted_qty, 0)),
        rejected_qty = GREATEST(0, COALESCE(pbl.rejected_qty, 0) - COALESCE(r.rejected_qty, 0))
      WHERE pbl.id = r.bill_line_id;
    END IF;
  END LOOP;

  PERFORM public.void_journals_for_entity('purchase_receive', p_receive_id);

  UPDATE public.erp_purchase_receives
  SET
    status = 'reversed',
    reversed_by_receive_id = v_reversal_id,
    reversal_reason = p_reason,
    updated_by = p_actor,
    updated_at = now()
  WHERE id = p_receive_id;

  IF v_po_id IS NOT NULL THEN
    PERFORM public.sync_purchase_order_receiving_status(v_po_id);
  END IF;

  RETURN v_reversal_id;
END;
$$;

-- ─── Adjustment suggestions (posted bill shortfall + rejected qty) ───────────

CREATE OR REPLACE FUNCTION public.get_purchase_receive_adjustments(
  p_receive_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id uuid;
  v_bill_status text;
  v_bill_posted boolean;
  v_policy text;
  v_shortfall jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT pr.purchase_bill_id INTO v_bill_id
  FROM public.erp_purchase_receives pr
  WHERE pr.id = p_receive_id;

  SELECT posted_bill_shortfall_policy INTO v_policy
  FROM public.procurement_settings WHERE id = 1;

  IF v_bill_id IS NOT NULL THEN
    SELECT status, accounting_posted
    INTO v_bill_status, v_bill_posted
    FROM public.erp_purchase_bills
    WHERE id = v_bill_id;

    IF v_bill_posted OR v_bill_status IN ('finalized', 'partial', 'paid') THEN
      SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_shortfall
      FROM (
        SELECT
          pbl.id AS bill_line_id,
          prl.variant_id,
          prl.product_name,
          COALESCE(pbl.original_quantity, pbl.quantity) AS billed_qty,
          pbl.accepted_qty,
          GREATEST(0, COALESCE(pbl.original_quantity, pbl.quantity) - COALESCE(pbl.accepted_qty, 0)) AS shortfall_qty,
          pbl.purchase_price,
          pbl.tax_rate_percent,
          ROUND(
            GREATEST(0, COALESCE(pbl.original_quantity, pbl.quantity) - COALESCE(pbl.accepted_qty, 0))
            * pbl.purchase_price * (1 + pbl.tax_rate_percent / 100),
            2
          ) AS credit_amount
        FROM public.erp_purchase_receive_lines prl
        JOIN public.erp_purchase_bill_lines pbl ON pbl.id = prl.bill_line_id
        WHERE prl.purchase_receive_id = p_receive_id
          AND GREATEST(0, COALESCE(pbl.original_quantity, pbl.quantity) - COALESCE(pbl.accepted_qty, 0)) > 0
      ) x;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_rejected
  FROM (
    SELECT
      prl.bill_line_id,
      prl.variant_id,
      prl.product_name,
      prl.rejected_qty,
      prl.purchase_price,
      prl.tax_rate_percent,
      ROUND(prl.rejected_qty * prl.purchase_price * (1 + prl.tax_rate_percent / 100), 2) AS credit_amount
    FROM public.erp_purchase_receive_lines prl
    WHERE prl.purchase_receive_id = p_receive_id
      AND prl.rejected_qty > 0
  ) x;

  RETURN jsonb_build_object(
    'shortfall_policy', COALESCE(v_policy, 'vendor_credit'),
    'bill_posted', COALESCE(v_bill_posted, false),
    'shortfall_lines', v_shortfall,
    'rejected_lines', v_rejected,
    'requires_vendor_credit',
      CASE
        WHEN COALESCE(v_policy, 'vendor_credit') = 'ignore' THEN false
        ELSE jsonb_array_length(v_shortfall) > 0 OR jsonb_array_length(v_rejected) > 0
      END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_vendor_credit_from_receive_adjustment(
  p_receive_id uuid,
  p_adjustment_kind text DEFAULT 'all',
  p_finalize boolean DEFAULT false,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adjustments jsonb;
  v_vendor_id uuid;
  v_store_id uuid;
  v_bill_id uuid;
  v_receive_number text;
  v_credit_id uuid;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_shortfall jsonb;
  v_rejected jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_adjustment_kind NOT IN ('shortfall', 'rejected', 'all') THEN
    RAISE EXCEPTION 'Invalid adjustment kind';
  END IF;

  SELECT vendor_id, store_id, purchase_bill_id, receive_number
  INTO v_vendor_id, v_store_id, v_bill_id, v_receive_number
  FROM public.erp_purchase_receives
  WHERE id = p_receive_id AND status = 'finalized';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finalized purchase receive not found';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_adjustments := public.get_purchase_receive_adjustments(p_receive_id);
  v_shortfall := COALESCE(v_adjustments -> 'shortfall_lines', '[]'::jsonb);
  v_rejected := COALESCE(v_adjustments -> 'rejected_lines', '[]'::jsonb);

  IF p_adjustment_kind IN ('shortfall', 'all') THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_shortfall)
    LOOP
      IF COALESCE((v_line ->> 'shortfall_qty')::numeric, 0) <= 0 THEN
        CONTINUE;
      END IF;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'variant_id', COALESCE(v_line ->> 'variant_id', ''),
        'product_name', v_line ->> 'product_name',
        'quantity', (v_line ->> 'shortfall_qty')::numeric,
        'unit_price', (v_line ->> 'purchase_price')::numeric,
        'tax_rate_percent', COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0)
      ));
    END LOOP;
  END IF;

  IF p_adjustment_kind IN ('rejected', 'all') THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_rejected)
    LOOP
      IF COALESCE((v_line ->> 'rejected_qty')::numeric, 0) <= 0 THEN
        CONTINUE;
      END IF;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'variant_id', COALESCE(v_line ->> 'variant_id', ''),
        'product_name', v_line ->> 'product_name',
        'quantity', (v_line ->> 'rejected_qty')::numeric,
        'unit_price', (v_line ->> 'purchase_price')::numeric,
        'tax_rate_percent', COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0)
      ));
    END LOOP;
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'No vendor credit lines to create for this receive';
  END IF;

  v_credit_id := public.create_erp_vendor_credit(
    v_vendor_id,
    v_store_id,
    CURRENT_DATE,
    v_lines,
    'Receive ' || v_receive_number,
    'Auto-suggested from purchase receive adjustment (' || p_adjustment_kind || ')',
    false,
    false,
    p_actor,
    v_bill_id
  );

  IF p_finalize THEN
    PERFORM public.finalize_erp_vendor_credit(v_credit_id, false, p_actor);
  END IF;

  RETURN v_credit_id;
END;
$$;

-- ─── Persist over-receive auth + block reconcile on posted bills ─────────────

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
    v_ordered := COALESCE((v_line ->> 'ordered_qty')::numeric, 0);
    v_billed := COALESCE((v_line ->> 'billed_qty')::numeric, 0);
    v_received := COALESCE((v_line ->> 'received_qty')::numeric, 0);
    v_accepted := COALESCE((v_line ->> 'accepted_qty')::numeric, 0);
    v_rejected := COALESCE((v_line ->> 'rejected_qty')::numeric, 0);
    v_price := COALESCE((v_line ->> 'purchase_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);

    IF v_accepted < 0 OR v_rejected < 0 OR v_received < 0 THEN
      RAISE EXCEPTION 'Quantities cannot be negative';
    END IF;

    IF v_accepted + v_rejected > v_received THEN
      RAISE EXCEPTION 'Accepted + rejected cannot exceed received quantity';
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
      purchase_receive_id, po_line_id, bill_line_id, variant_id, product_name, barcode,
      ordered_qty, billed_qty, received_qty, accepted_qty, rejected_qty,
      purchase_price, tax_rate_percent, expiry_date, batch_reference, batch_code, batch_number
    )
    VALUES (
      v_receive_id,
      v_po_line_id,
      v_bill_line_id,
      v_variant_id,
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
    SELECT status, accounting_posted
    INTO v_bill_status, v_bill_posted
    FROM public.erp_purchase_bills
    WHERE id = v_bill_id;

    IF v_bill_posted OR v_bill_status IN ('finalized', 'partial', 'paid') THEN
      v_reconcile := false;
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

GRANT EXECUTE ON FUNCTION public.reverse_erp_purchase_receive(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_receive_adjustments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vendor_credit_from_receive_adjustment(uuid, text, boolean, uuid) TO authenticated;

COMMIT;
