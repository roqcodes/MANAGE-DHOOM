-- PO-centric delivery flow: enter qty on PO, one submit = stock + AP + bill adjust.
-- Fixed rules: any over/under delivery allowed; bill reconciles on submit.

BEGIN;

-- Allow any delivered quantity (no purchasing policy).
CREATE OR REPLACE FUNCTION public.validate_purchase_receive_over_qty(
  p_bill_line_id uuid,
  p_po_line_id uuid,
  p_max_qty numeric,
  p_new_accepted numeric,
  p_allow_over_authorization boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(p_new_accepted, 0) < 0 THEN
    RAISE EXCEPTION 'Delivered quantity cannot be negative';
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.erp_purchasing_settings;

DROP FUNCTION IF EXISTS public.get_purchasing_over_receive_policy();

-- Block posting PO-linked bills before delivery is recorded.
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
    IF NOT EXISTS (
      SELECT 1
      FROM public.erp_purchase_receives pr
      WHERE pr.purchase_bill_id = p_bill_id
        AND pr.po_id = v_po_id
        AND pr.status = 'finalized'
        AND pr.inventory_committed = true
    ) THEN
      RAISE EXCEPTION 'Submit delivery on the purchase order before finalizing the invoice';
    END IF;
  END IF;

  IF v_status <> 'draft' AND v_posted THEN
    RETURN;
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
  v_vendor_id uuid;
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

    SELECT poi.id, poi.variant_id, poi.quantity, poi.price, poi.tax_rate_percent,
      COALESCE(pv.name, p.name, 'Item') AS product_name
    INTO v_poi
    FROM public.purchase_order_items poi
    LEFT JOIN public.product_variants pv ON pv.id = poi.variant_id
    LEFT JOIN public.products p ON p.id = pv.product_id
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
    END IF;

    IF v_delivered > 0 OR v_poi.quantity > 0 THEN
      v_receive_lines := v_receive_lines || jsonb_build_array(jsonb_build_object(
        'po_line_id', v_po_line_id,
        'bill_line_id', v_bill_line_id,
        'variant_id', v_poi.variant_id,
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

GRANT EXECUTE ON FUNCTION public.submit_erp_po_delivery_and_finalize(uuid, jsonb, date, text, uuid) TO authenticated;

-- Fixed shortfall policy (no settings table).
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
    'shortfall_policy', 'vendor_credit',
    'bill_posted', COALESCE(v_bill_posted, false),
    'shortfall_lines', v_shortfall,
    'rejected_lines', v_rejected,
    'requires_vendor_credit',
      jsonb_array_length(v_shortfall) > 0 OR jsonb_array_length(v_rejected) > 0
  );
END;
$$;

COMMIT;
