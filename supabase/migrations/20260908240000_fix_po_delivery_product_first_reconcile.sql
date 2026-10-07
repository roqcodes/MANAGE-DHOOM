-- Product-first PO delivery: match draft bill lines by product_id when variant_id is null.
-- Without this, submit delivery leaves bill_line_id unset and reconcile zeroes invoice qty/total.

BEGIN;

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
  v_store_id uuid;
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

    v_bill_line_id := NULL;
    v_price := v_poi.price;
    v_tax_rate := v_poi.tax_rate_percent;
    v_product_name := v_poi.product_name;

    IF v_poi.variant_id IS NOT NULL THEN
      SELECT pbl.id, pbl.purchase_price, pbl.tax_rate_percent, pbl.product_name
      INTO v_bill_line_id, v_price, v_tax_rate, v_product_name
      FROM public.erp_purchase_bill_lines pbl
      WHERE pbl.purchase_bill_id = v_bill_id
        AND pbl.variant_id = v_poi.variant_id
      ORDER BY pbl.id
      LIMIT 1;
    ELSIF v_poi.product_id IS NOT NULL THEN
      SELECT pbl.id, pbl.purchase_price, pbl.tax_rate_percent, pbl.product_name
      INTO v_bill_line_id, v_price, v_tax_rate, v_product_name
      FROM public.erp_purchase_bill_lines pbl
      WHERE pbl.purchase_bill_id = v_bill_id
        AND pbl.product_id = v_poi.product_id
      ORDER BY pbl.id
      LIMIT 1;
    END IF;

    IF v_delivered > 0 OR v_poi.quantity > 0 THEN
      v_receive_lines := v_receive_lines || jsonb_build_array(jsonb_build_object(
        'po_line_id', v_po_line_id,
        'bill_line_id', v_bill_line_id,
        'variant_id', v_poi.variant_id,
        'product_id', v_poi.product_id,
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

GRANT EXECUTE ON FUNCTION public.create_erp_purchase_receive(
  uuid, uuid, date, jsonb, uuid, uuid, date, text, text, boolean, boolean, boolean, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.reconcile_draft_purchase_bill_from_receive(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.submit_erp_po_delivery_and_finalize(uuid, jsonb, date, text, uuid) TO authenticated;

COMMIT;
