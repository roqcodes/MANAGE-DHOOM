-- Multi-shipment PO: deliver must target the open draft bill, not the latest finalized bill.
-- (Within one DB transaction, created_at ties are common — draft must win.)

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_erp_po_delivery_and_finalize(
  p_po_id uuid,
  p_lines jsonb,
  p_receive_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid(),
  p_idempotency_key uuid DEFAULT NULL
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
  v_existing record;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one delivery line is required';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_idempotency_key::text));

    SELECT receive_id, purchase_bill_id
    INTO v_existing
    FROM public.purchase_po_delivery_operations
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'receive_id', v_existing.receive_id,
        'bill_id', v_existing.purchase_bill_id,
        'po_id', p_po_id,
        'idempotent_replay', true
      );
    END IF;
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
  ORDER BY
    CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
    created_at DESC,
    id DESC
  LIMIT 1;

  IF v_bill_id IS NULL THEN
    RAISE EXCEPTION 'Generate a draft invoice before submitting delivery';
  END IF;

  SELECT pr.id
  INTO v_receive_id
  FROM public.erp_purchase_receives pr
  WHERE pr.po_id = p_po_id
    AND pr.purchase_bill_id = v_bill_id
    AND pr.status = 'finalized'
    AND pr.inventory_committed = true
  ORDER BY pr.created_at DESC
  LIMIT 1;

  IF v_receive_id IS NOT NULL AND v_bill_status IN ('finalized', 'partial', 'paid') THEN
    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO public.purchase_po_delivery_operations (
        idempotency_key, po_id, purchase_bill_id, receive_id, created_by
      )
      VALUES (p_idempotency_key, p_po_id, v_bill_id, v_receive_id, p_actor)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
      'receive_id', v_receive_id,
      'bill_id', v_bill_id,
      'po_id', p_po_id,
      'idempotent_replay', true
    );
  END IF;

  IF v_bill_status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice is already finalized';
  END IF;

  IF v_receive_id IS NOT NULL THEN
    RAISE EXCEPTION 'Delivery already submitted for this purchase order';
  END IF;

  SET LOCAL lock_timeout = '15s';

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

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.purchase_po_delivery_operations (
      idempotency_key, po_id, purchase_bill_id, receive_id, created_by
    )
    VALUES (p_idempotency_key, p_po_id, v_bill_id, v_receive_id, p_actor);
  END IF;

  RETURN jsonb_build_object(
    'receive_id', v_receive_id,
    'bill_id', v_bill_id,
    'po_id', p_po_id,
    'idempotent_replay', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_erp_po_delivery_and_finalize(
  uuid, jsonb, date, text, uuid, uuid
) TO authenticated;

COMMIT;
