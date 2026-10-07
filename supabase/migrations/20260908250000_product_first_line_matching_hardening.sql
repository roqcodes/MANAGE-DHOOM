-- Product-first hardening: unified PO↔bill line matching, receive adjustments, stock reports.

BEGIN;

-- ─── 1. PO delivery: match bill lines by product_id OR variant_id ─────────────

CREATE OR REPLACE FUNCTION public.submit_erp_po_delivery_and_finalize(
  p_po_id uuid,
  p_lines jsonb,
  p_receive_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po record;
  v_bill_id uuid;
  v_bill_status text;
  v_receive_lines jsonb := '[]'::jsonb;
  v_input jsonb;
  v_po_line_id uuid;
  v_delivered numeric;
  v_poi record;
  v_bill_line_id uuid;
  v_product_name text;
  v_price numeric;
  v_tax_rate numeric;
  v_receive_id uuid;
  v_resolved_product_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one delivery line is required';
  END IF;

  SELECT id, vendor_id, store_id, status
  INTO v_po
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot deliver a cancelled purchase order';
  END IF;

  PERFORM public.require_store_access(v_po.store_id, p_actor);

  SELECT id, status
  INTO v_bill_id, v_bill_status
  FROM public.erp_purchase_bills
  WHERE po_id = p_po_id
    AND status <> 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_bill_id IS NULL THEN
    RAISE EXCEPTION 'Generate a draft invoice before submitting delivery';
  END IF;

  IF v_bill_status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice is already finalized';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.erp_purchase_receives pr
    WHERE pr.po_id = p_po_id
      AND pr.purchase_bill_id = v_bill_id
      AND pr.status = 'finalized'
  ) THEN
    RAISE EXCEPTION 'Delivery already submitted for this purchase order';
  END IF;

  FOR v_input IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_po_line_id := NULLIF(v_input ->> 'po_line_id', '')::uuid;
    v_delivered := COALESCE((v_input ->> 'delivered_qty')::numeric, 0);

    IF v_po_line_id IS NULL THEN
      RAISE EXCEPTION 'Each line must include po_line_id';
    END IF;

    IF v_delivered < 0 THEN
      RAISE EXCEPTION 'Delivered quantity cannot be negative';
    END IF;

    SELECT
      poi.id,
      poi.variant_id,
      poi.product_id,
      poi.quantity,
      poi.price,
      poi.tax_rate_percent,
      COALESCE(p.name, pv.name, 'Item') AS product_name
    INTO v_poi
    FROM public.purchase_order_items poi
    LEFT JOIN public.product_variants pv ON pv.id = poi.variant_id
    LEFT JOIN public.products p ON p.id = COALESCE(poi.product_id, pv.product_id)
    WHERE poi.id = v_po_line_id
      AND poi.po_id = p_po_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid purchase order line';
    END IF;

    v_resolved_product_id := COALESCE(v_poi.product_id, (
      SELECT product_id FROM public.product_variants WHERE id = v_poi.variant_id
    ));

    v_bill_line_id := NULL;
    v_price := v_poi.price;
    v_tax_rate := v_poi.tax_rate_percent;
    v_product_name := v_poi.product_name;

    SELECT pbl.id, pbl.purchase_price, pbl.tax_rate_percent, pbl.product_name
    INTO v_bill_line_id, v_price, v_tax_rate, v_product_name
    FROM public.erp_purchase_bill_lines pbl
    WHERE pbl.purchase_bill_id = v_bill_id
      AND (
        (v_poi.variant_id IS NOT NULL AND pbl.variant_id = v_poi.variant_id)
        OR (v_resolved_product_id IS NOT NULL AND pbl.product_id = v_resolved_product_id)
      )
    ORDER BY
      CASE
        WHEN v_resolved_product_id IS NOT NULL AND pbl.product_id = v_resolved_product_id THEN 0
        WHEN v_poi.variant_id IS NOT NULL AND pbl.variant_id = v_poi.variant_id THEN 1
        ELSE 2
      END,
      pbl.id
    LIMIT 1;

    IF v_delivered > 0 OR v_poi.quantity > 0 THEN
      v_receive_lines := v_receive_lines || jsonb_build_array(jsonb_build_object(
        'po_line_id', v_po_line_id,
        'bill_line_id', v_bill_line_id,
        'variant_id', v_poi.variant_id,
        'product_id', v_resolved_product_id,
        'product_name', v_product_name,
        'ordered_qty', v_poi.quantity,
        'billed_qty', COALESCE((SELECT quantity FROM public.erp_purchase_bill_lines WHERE id = v_bill_line_id), v_poi.quantity),
        'received_qty', v_delivered,
        'accepted_qty', v_delivered,
        'rejected_qty', 0,
        'purchase_price', v_price,
        'tax_rate_percent', v_tax_rate
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_receive_lines) = 0 THEN
    RAISE EXCEPTION 'Enter delivered quantities for at least one line';
  END IF;

  v_receive_id := public.create_erp_purchase_receive(
    p_vendor_id := v_po.vendor_id,
    p_store_id := v_po.store_id,
    p_receive_date := COALESCE(p_receive_date, CURRENT_DATE),
    p_po_id := p_po_id,
    p_purchase_bill_id := v_bill_id,
    p_notes := p_notes,
    p_lines := v_receive_lines,
    p_reconcile_bill := true,
    p_finalize := false,
    p_allow_over_authorization := true,
    p_created_by := p_actor
  );

  PERFORM public.finalize_erp_purchase_receive(v_receive_id, true, p_actor);
  PERFORM public.finalize_erp_purchase_bill(v_bill_id, p_actor);

  RETURN jsonb_build_object(
    'receive_id', v_receive_id,
    'bill_id', v_bill_id,
    'po_id', p_po_id
  );
END;
$$;

-- ─── 2. Bill reconcile: accepted qty from receive by bill_line_id, product_id, or variant ─

CREATE OR REPLACE FUNCTION public.reconcile_draft_purchase_bill_from_receive(
  p_receive_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id uuid;
  v_status text;
  r record;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_landed numeric := 0;
  v_discount numeric := 0;
  v_taxable numeric;
  v_line_tax numeric;
  v_line_total numeric;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT pr.purchase_bill_id INTO v_bill_id
  FROM public.erp_purchase_receives pr
  WHERE pr.id = p_receive_id;

  IF v_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status, discount, landed_cost_total
  INTO v_status, v_discount, v_landed
  FROM public.erp_purchase_bills
  WHERE id = v_bill_id
  FOR UPDATE;

  IF v_status <> 'draft' THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT
      pbl.id AS bill_line_id,
      GREATEST(
        COALESCE(pbl.accepted_qty, 0),
        COALESCE((
          SELECT SUM(prl.accepted_qty)
          FROM public.erp_purchase_receive_lines prl
          WHERE prl.purchase_receive_id = p_receive_id
            AND prl.bill_line_id = pbl.id
        ), 0),
        COALESCE((
          SELECT SUM(prl.accepted_qty)
          FROM public.erp_purchase_receive_lines prl
          INNER JOIN public.purchase_order_items poi ON poi.id = prl.po_line_id
          WHERE prl.purchase_receive_id = p_receive_id
            AND pbl.product_id IS NOT NULL
            AND poi.product_id = pbl.product_id
        ), 0),
        COALESCE((
          SELECT SUM(prl.accepted_qty)
          FROM public.erp_purchase_receive_lines prl
          INNER JOIN public.purchase_order_items poi ON poi.id = prl.po_line_id
          WHERE prl.purchase_receive_id = p_receive_id
            AND pbl.variant_id IS NOT NULL
            AND poi.variant_id = pbl.variant_id
        ), 0)
      ) AS accepted_qty
    FROM public.erp_purchase_bill_lines pbl
    WHERE pbl.purchase_bill_id = v_bill_id
  LOOP
    UPDATE public.erp_purchase_bill_lines pbl
    SET
      original_quantity = COALESCE(pbl.original_quantity, pbl.quantity),
      quantity = GREATEST(0, r.accepted_qty),
      tax_amount = ROUND(GREATEST(0, r.accepted_qty) * pbl.purchase_price * pbl.tax_rate_percent / 100, 2),
      line_total = ROUND(
        GREATEST(0, r.accepted_qty) * pbl.purchase_price
        + ROUND(GREATEST(0, r.accepted_qty) * pbl.purchase_price * pbl.tax_rate_percent / 100, 2),
        2
      )
    WHERE pbl.id = r.bill_line_id;
  END LOOP;

  FOR r IN
    SELECT quantity, purchase_price, tax_rate_percent, tax_amount, line_total
    FROM public.erp_purchase_bill_lines
    WHERE purchase_bill_id = v_bill_id
  LOOP
    v_taxable := ROUND(r.quantity * r.purchase_price, 2);
    v_line_tax := ROUND(v_taxable * r.tax_rate_percent / 100, 2);
    v_line_total := v_taxable + v_line_tax;
    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_subtotal + v_tax - COALESCE(v_discount, 0)) + COALESCE(v_landed, 0);

  UPDATE public.erp_purchase_bills
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax,
    total_amount = v_total,
    balance_due = 0,
    updated_at = now()
  WHERE id = v_bill_id;
END;
$$;

-- ─── 3. Receive adjustments + vendor credit from receive: include product_id ──

CREATE OR REPLACE FUNCTION public.get_purchase_receive_adjustments(p_receive_id uuid)
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
  v_shortfall jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT pr.purchase_bill_id INTO v_bill_id
  FROM public.erp_purchase_receives pr
  WHERE pr.id = p_receive_id;

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
          COALESCE(prl.product_id, pbl.product_id) AS product_id,
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
      prl.product_id,
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
    'shortfall_policy', 'vendor_credit',
    'bill_posted', COALESCE(v_bill_posted, false),
    'shortfall_lines', v_shortfall,
    'rejected_lines', v_rejected,
    'requires_vendor_credit',
      jsonb_array_length(v_shortfall) > 0 OR jsonb_array_length(v_rejected) > 0
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
        'product_id', NULLIF(v_line ->> 'product_id', ''),
        'variant_id', NULLIF(v_line ->> 'variant_id', ''),
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
        'product_id', NULLIF(v_line ->> 'product_id', ''),
        'variant_id', NULLIF(v_line ->> 'variant_id', ''),
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

-- ─── 4. Receive reversal: preserve product_id on reversal lines ─────────────

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
  v_vendor_id uuid;
  v_bill_id uuid;
  v_receive_date date;
  v_reversal_id uuid;
  v_reversal_number text;
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
    purchase_receive_id, po_line_id, bill_line_id, variant_id, product_id, product_name, barcode,
    ordered_qty, billed_qty, received_qty, accepted_qty, rejected_qty,
    purchase_price, tax_rate_percent, expiry_date, batch_reference, batch_code, batch_number
  )
  SELECT
    v_reversal_id, prl.po_line_id, prl.bill_line_id, prl.variant_id, prl.product_id, prl.product_name, prl.barcode,
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

-- ─── 5. Inbound pipeline lines: expose product_id ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_inbound_purchasing_pipeline(
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.expected_delivery_date NULLS LAST, r.created_at DESC), '[]'::jsonb)
    FROM (
      SELECT
        pr.id,
        pr.receive_number,
        pr.status,
        pr.receive_date,
        pr.expected_delivery_date,
        pr.reference,
        pr.po_id,
        po.po_number,
        pr.purchase_bill_id,
        pb.purchase_bill_number,
        pr.vendor_id,
        v.name AS vendor_name,
        pr.store_id,
        s.name AS store_name,
        po.status AS po_status,
        pb.status AS bill_status,
        (po.status = 'delivered') AS vendor_marked_delivered,
        pr.created_at,
        (
          SELECT COALESCE(SUM(GREATEST(0, prl.ordered_qty - COALESCE(prl.accepted_qty, 0))), 0)
          FROM public.erp_purchase_receive_lines prl
          WHERE prl.purchase_receive_id = pr.id
        ) AS pending_qty,
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', prl.id,
            'variant_id', prl.variant_id,
            'product_id', prl.product_id,
            'product_name', prl.product_name,
            'ordered_qty', prl.ordered_qty,
            'billed_qty', prl.billed_qty,
            'received_qty', prl.received_qty,
            'accepted_qty', prl.accepted_qty,
            'rejected_qty', prl.rejected_qty,
            'pending_qty', GREATEST(0, COALESCE(prl.billed_qty, prl.ordered_qty, 0) - COALESCE(prl.accepted_qty, 0)),
            'purchase_price', prl.purchase_price
          )), '[]'::jsonb)
          FROM public.erp_purchase_receive_lines prl
          WHERE prl.purchase_receive_id = pr.id
        ) AS lines
      FROM public.erp_purchase_receives pr
      JOIN public.vendors v ON v.id = pr.vendor_id
      JOIN public.stores s ON s.id = pr.store_id
      LEFT JOIN public.purchase_orders po ON po.id = pr.po_id
      LEFT JOIN public.erp_purchase_bills pb ON pb.id = pr.purchase_bill_id
      WHERE pr.status IN ('draft', 'finalized')
        AND (p_store_id IS NULL OR pr.store_id = p_store_id)
    ) r
  );
END;
$$;

-- ─── 6. Stock reports: product-level physical inventory + inbound by product_id ─

CREATE OR REPLACE FUNCTION public.get_erp_item_stock_report(
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.product_name), '[]'::jsonb)
    FROM (
      SELECT
        spi.product_id,
        p.name AS product_name,
        p.barcode,
        s.name AS store_name,
        spi.store_id,
        ROUND(COALESCE(spi.stock, 0), 2) AS stock,
        ROUND(0::numeric, 2) AS reserved_stock,
        ROUND(COALESCE(spi.stock, 0), 2) AS available_stock,
        ROUND(COALESCE(inb.incoming_qty, 0), 2) AS incoming_qty,
        ROUND(COALESCE(spi.stock, 0) + COALESCE(inb.incoming_qty, 0), 2) AS expected_stock,
        COALESCE(inb.inbound_breakdown, '[]'::jsonb) AS inbound_breakdown,
        ROUND(COALESCE(spi.purchase_price, p.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(spi.sales_price, p.price, 0), 2) AS sales_price
      FROM public.store_product_inventory spi
      JOIN public.products p ON p.id = spi.product_id
      JOIN public.stores s ON s.id = spi.store_id
      LEFT JOIN LATERAL (
        SELECT
          SUM(GREATEST(0, pending.pending_qty)) AS incoming_qty,
          COALESCE(jsonb_agg(
            jsonb_build_object(
              'document_type', pending.doc_type,
              'document_number', pending.doc_number,
              'quantity', pending.pending_qty,
              'expected_delivery_date', pending.expected_delivery_date
            )
            ORDER BY pending.expected_delivery_date NULLS LAST
          ) FILTER (WHERE pending.pending_qty > 0), '[]'::jsonb) AS inbound_breakdown
        FROM (
          SELECT
            'PO'::text AS doc_type,
            po.po_number AS doc_number,
            GREATEST(0, poi.quantity - COALESCE(poi.accepted_qty, 0)) AS pending_qty,
            po.expected_delivery_date
          FROM public.purchase_order_items poi
          JOIN public.purchase_orders po ON po.id = poi.po_id
          LEFT JOIN public.product_variants pv ON pv.id = poi.variant_id
          WHERE COALESCE(poi.product_id, pv.product_id) = spi.product_id
            AND po.store_id = spi.store_id
            AND po.status NOT IN ('cancelled', 'closed', 'fully_received')
          UNION ALL
          SELECT
            'PB'::text,
            pb.purchase_bill_number,
            GREATEST(0, pbl.quantity - COALESCE(pbl.accepted_qty, 0)),
            pb.expected_delivery_date
          FROM public.erp_purchase_bill_lines pbl
          JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
          LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
          WHERE COALESCE(pbl.product_id, pv.product_id) = spi.product_id
            AND pb.store_id = spi.store_id
            AND pb.status = 'draft'
            AND pb.legacy_stock_via_bill = false
        ) pending
      ) inb ON true
      WHERE (p_store_id IS NULL OR spi.store_id = p_store_id)
        AND (
          COALESCE(spi.stock, 0) <> 0
          OR COALESCE(inb.incoming_qty, 0) <> 0
        )
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_store_wise_stock_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.store_name), '[]'::jsonb)
    FROM (
      SELECT
        s.id AS store_id,
        s.name AS store_name,
        COUNT(DISTINCT spi.product_id) AS sku_count,
        ROUND(COALESCE(SUM(spi.stock), 0), 2) AS total_stock,
        ROUND(0::numeric, 2) AS total_reserved,
        ROUND(
          COALESCE(SUM(spi.stock * COALESCE(spi.purchase_price, p.purchase_price, 0)), 0),
          2
        ) AS stock_value_at_cost
      FROM public.stores s
      LEFT JOIN public.store_product_inventory spi ON spi.store_id = s.id
      LEFT JOIN public.products p ON p.id = spi.product_id
      GROUP BY s.id, s.name
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_erp_po_delivery_and_finalize(uuid, jsonb, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_draft_purchase_bill_from_receive(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_receive_adjustments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vendor_credit_from_receive_adjustment(uuid, text, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_erp_purchase_receive(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_inbound_purchasing_pipeline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_item_stock_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_store_wise_stock_report() TO authenticated;

COMMIT;
