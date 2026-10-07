-- Phase 3: Physical receive vs financial bill — hardened separation, idempotent PO deliver-finalize.

BEGIN;

-- ─── Idempotency for deliver + finalize (RPC-only ledger) ───────────────────

CREATE TABLE IF NOT EXISTS public.purchase_po_delivery_operations (
  idempotency_key uuid PRIMARY KEY,
  po_id uuid NOT NULL REFERENCES public.purchase_orders (id) ON DELETE RESTRICT,
  purchase_bill_id uuid NOT NULL REFERENCES public.erp_purchase_bills (id) ON DELETE RESTRICT,
  receive_id uuid NOT NULL REFERENCES public.erp_purchase_receives (id) ON DELETE RESTRICT,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_po_delivery_operations_po_id_idx
  ON public.purchase_po_delivery_operations (po_id);

ALTER TABLE public.purchase_po_delivery_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_po_delivery_operations FROM PUBLIC;
REVOKE ALL ON TABLE public.purchase_po_delivery_operations FROM authenticated;

-- ─── Bill finalize: financial only when stock already received via GRN ───────

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

  -- Physical stock is owned by purchase receive (or explicit standalone mark-received).
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

-- ─── Guard bill stock RPC (never double-count with receive) ───────────────────

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

  IF p_multiplier = 1 AND NOT public.purchase_bill_should_increase_stock_on_finalize(p_bill_id) THEN
    RETURN;
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
    ORDER BY COALESCE(pbl.product_id, pv.product_id)
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

-- ─── Receive stock: deterministic product lock order ─────────────────────────

CREATE OR REPLACE FUNCTION public.inventory_apply_purchase_receive_stock(
  p_receive_id uuid,
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
  v_bill_id uuid;
  v_delta numeric;
  v_unit numeric;
  v_landed_share numeric;
  v_bill_qty numeric;
  v_bill_landed numeric;
  v_actor uuid;
BEGIN
  v_actor := COALESCE(p_user_id, auth.uid());

  IF p_receive_id IS NULL OR p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid purchase receive stock request';
  END IF;

  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, purchase_bill_id
  INTO v_store_id, v_bill_id
  FROM public.erp_purchase_receives
  WHERE id = p_receive_id;

  PERFORM public.require_store_access(v_store_id, v_actor);

  IF v_bill_id IS NOT NULL THEN
    PERFORM public.copy_po_landed_costs_to_bill(
      (SELECT po_id FROM public.erp_purchase_bills WHERE id = v_bill_id),
      v_bill_id
    );
    PERFORM public.refresh_purchase_bill_landed_allocations(v_bill_id);
  END IF;

  FOR r IN
    SELECT
      prl.id AS receive_line_id,
      prl.bill_line_id,
      prl.purchase_price,
      prl.loaded_unit_cost,
      prl.accepted_qty,
      COALESCE(prl.product_id, pv.product_id) AS product_id
    FROM public.erp_purchase_receive_lines prl
    LEFT JOIN public.product_variants pv ON pv.id = prl.variant_id
    WHERE prl.purchase_receive_id = p_receive_id
      AND COALESCE(prl.product_id, pv.product_id) IS NOT NULL
      AND COALESCE(prl.accepted_qty, 0) > 0
    ORDER BY COALESCE(prl.product_id, pv.product_id), prl.id
  LOOP
    v_unit := COALESCE(
      NULLIF(r.loaded_unit_cost, 0),
      public.resolve_receive_line_loaded_unit_cost(r.bill_line_id, r.purchase_price)
    );

    v_landed_share := 0;
    IF r.bill_line_id IS NOT NULL AND p_multiplier = 1 THEN
      SELECT quantity, landed_cost_allocated
      INTO v_bill_qty, v_bill_landed
      FROM public.erp_purchase_bill_lines
      WHERE id = r.bill_line_id;

      IF COALESCE(v_bill_qty, 0) > 0 AND COALESCE(v_bill_landed, 0) > 0 THEN
        v_landed_share := ROUND(
          v_bill_landed * (GREATEST(0, r.accepted_qty) / v_bill_qty),
          2
        );
      END IF;
    END IF;

    IF p_multiplier = 1 THEN
      UPDATE public.erp_purchase_receive_lines
      SET
        loaded_unit_cost = v_unit,
        landed_cost_allocated = v_landed_share
      WHERE id = r.receive_line_id;
    ELSE
      v_unit := COALESCE(NULLIF(r.loaded_unit_cost, 0), v_unit);
    END IF;

    v_delta := r.accepted_qty * p_multiplier;

    PERFORM public.store_product_inventory_apply_receipt_cost(
      v_store_id, r.product_id, v_delta, v_unit, v_actor
    );

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta, 'purchase', p_receive_id, 'purchase_receive',
      'Purchase Receive', v_store_id, NULL, v_unit, v_actor
    );
  END LOOP;
END;
$$;

-- ─── PO deliver + finalize: one RPC transaction, idempotent replay ───────────

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
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_bill_id IS NULL THEN
    RAISE EXCEPTION 'Generate a draft invoice before submitting delivery';
  END IF;

  -- Idempotent replay when delivery already completed (network retry / double-click).
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

  -- Physical: receive + store_product_inventory + receive GL (GRNI)
  PERFORM public.finalize_erp_purchase_receive(v_receive_id, true, p_actor);

  -- Financial: AP/GL on bill (no physical stock on PO-linked bills)
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
