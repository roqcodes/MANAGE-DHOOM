-- Old RPCs (journal posting, receive stock, GL inventory) always called
-- refresh_purchase_bill_landed_allocations, which re-split by line value and
-- overwrote saved 30/70-style amounts with 50/50. Keep a balanced split.

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_purchase_bill_landed_allocations(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_landed_total numeric := 0;
  v_existing numeric := 0;
  v_basis_total numeric := 0;
  r record;
  v_alloc numeric;
  v_allocated numeric := 0;
  v_line_no integer := 0;
  v_line_total integer := 0;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_landed_total
  FROM public.erp_purchase_bill_landed_costs
  WHERE purchase_bill_id = p_bill_id;

  SELECT COALESCE(SUM(landed_cost_allocated), 0)
  INTO v_existing
  FROM public.erp_purchase_bill_lines
  WHERE purchase_bill_id = p_bill_id
    AND quantity > 0;

  -- Already matches the landed total (including a manual 30/70 split). Do not re-split.
  IF v_landed_total > 0
     AND abs(public.erp_round_calc(v_existing) - public.erp_round_calc(v_landed_total)) < 0.0001 THEN
    UPDATE public.erp_purchase_bill_lines
    SET unit_loaded_cost = purchase_price + (
      GREATEST(0, COALESCE(landed_cost_allocated, 0)) / NULLIF(quantity, 0)
    )
    WHERE purchase_bill_id = p_bill_id;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(public.erp_round_calc(quantity * purchase_price)), 0), COUNT(*)::integer
  INTO v_basis_total, v_line_total
  FROM public.erp_purchase_bill_lines
  WHERE purchase_bill_id = p_bill_id
    AND quantity > 0;

  UPDATE public.erp_purchase_bill_lines
  SET landed_cost_allocated = 0
  WHERE purchase_bill_id = p_bill_id;

  IF v_landed_total <= 0 OR v_basis_total <= 0 OR v_line_total = 0 THEN
    UPDATE public.erp_purchase_bill_lines
    SET unit_loaded_cost = purchase_price
    WHERE purchase_bill_id = p_bill_id;
    RETURN;
  END IF;

  v_allocated := 0;
  v_line_no := 0;
  FOR r IN
    SELECT id, quantity, purchase_price, public.erp_round_calc(quantity * purchase_price) AS ext
    FROM public.erp_purchase_bill_lines
    WHERE purchase_bill_id = p_bill_id AND quantity > 0
    ORDER BY id
  LOOP
    v_line_no := v_line_no + 1;
    IF v_line_no < v_line_total THEN
      v_alloc := public.erp_round_calc(v_landed_total * (r.ext / v_basis_total));
      v_allocated := public.erp_round_calc(v_allocated + v_alloc);
    ELSE
      v_alloc := public.erp_round_calc(v_landed_total - v_allocated);
    END IF;

    UPDATE public.erp_purchase_bill_lines
    SET
      landed_cost_allocated = GREATEST(0, v_alloc),
      unit_loaded_cost = purchase_price + (GREATEST(0, v_alloc) / NULLIF(quantity, 0))
    WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_purchase_order_landed_allocations(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_landed_total numeric := 0;
  v_existing numeric := 0;
  v_basis_total numeric := 0;
  r record;
  v_alloc numeric;
  v_allocated numeric := 0;
  v_line_no integer := 0;
  v_line_total integer := 0;
BEGIN
  IF p_po_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_landed_total
  FROM public.purchase_order_landed_costs
  WHERE po_id = p_po_id;

  SELECT COALESCE(SUM(landed_cost_allocated), 0)
  INTO v_existing
  FROM public.purchase_order_items
  WHERE po_id = p_po_id
    AND quantity > 0;

  UPDATE public.purchase_orders
  SET landed_cost_total = v_landed_total
  WHERE id = p_po_id;

  IF v_landed_total > 0
     AND abs(public.erp_round_calc(v_existing) - public.erp_round_calc(v_landed_total)) < 0.0001 THEN
    UPDATE public.purchase_order_items
    SET unit_loaded_cost = price + (
      GREATEST(0, COALESCE(landed_cost_allocated, 0)) / NULLIF(quantity, 0)
    )
    WHERE po_id = p_po_id;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(public.erp_round_calc(quantity * price)), 0), COUNT(*)::integer
  INTO v_basis_total, v_line_total
  FROM public.purchase_order_items
  WHERE po_id = p_po_id
    AND quantity > 0;

  UPDATE public.purchase_order_items
  SET landed_cost_allocated = 0
  WHERE po_id = p_po_id;

  IF v_landed_total <= 0 OR v_basis_total <= 0 OR v_line_total = 0 THEN
    UPDATE public.purchase_order_items
    SET unit_loaded_cost = price
    WHERE po_id = p_po_id;
    RETURN;
  END IF;

  v_allocated := 0;
  v_line_no := 0;
  FOR r IN
    SELECT id, quantity, price, public.erp_round_calc(quantity * price) AS ext
    FROM public.purchase_order_items
    WHERE po_id = p_po_id AND quantity > 0
    ORDER BY id
  LOOP
    v_line_no := v_line_no + 1;
    IF v_line_no < v_line_total THEN
      v_alloc := public.erp_round_calc(v_landed_total * (r.ext / v_basis_total));
      v_allocated := public.erp_round_calc(v_allocated + v_alloc);
    ELSE
      v_alloc := public.erp_round_calc(v_landed_total - v_allocated);
    END IF;

    UPDATE public.purchase_order_items
    SET
      landed_cost_allocated = GREATEST(0, v_alloc),
      unit_loaded_cost = price + (GREATEST(0, v_alloc) / NULLIF(quantity, 0))
    WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_purchase_bill_inventory_amount(p_bill_id uuid)
RETURNS numeric
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := 0;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(
    SUM(
      public.erp_round_calc(
        GREATEST(0, pbl.quantity)
        * COALESCE(NULLIF(pbl.unit_loaded_cost, 0), pbl.purchase_price, 0)
      )
    ),
    0
  )
  INTO v_amount
  FROM public.erp_purchase_bill_lines pbl
  WHERE pbl.purchase_bill_id = p_bill_id
    AND pbl.quantity > 0;

  RETURN GREATEST(0, COALESCE(v_amount, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_purchase_receive_capitalization(p_receive_id uuid)
RETURNS TABLE (
  inventory_amount numeric,
  input_tax_amount numeric,
  grni_clearance_amount numeric
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory numeric := 0;
  v_tax numeric := 0;
  v_unit numeric;
  r record;
BEGIN
  inventory_amount := 0;
  input_tax_amount := 0;
  grni_clearance_amount := 0;

  IF p_receive_id IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  FOR r IN
    SELECT
      prl.bill_line_id,
      prl.accepted_qty,
      prl.purchase_price,
      prl.tax_rate_percent,
      prl.loaded_unit_cost
    FROM public.erp_purchase_receive_lines prl
    WHERE prl.purchase_receive_id = p_receive_id
      AND COALESCE(prl.accepted_qty, 0) > 0
  LOOP
    v_unit := COALESCE(
      NULLIF(r.loaded_unit_cost, 0),
      public.resolve_receive_line_loaded_unit_cost(r.bill_line_id, r.purchase_price),
      r.purchase_price,
      0
    );

    v_inventory := v_inventory
      + public.erp_round_calc(GREATEST(0, r.accepted_qty) * v_unit);

    v_tax := v_tax
      + public.erp_round_calc(
        GREATEST(0, r.accepted_qty) * COALESCE(r.purchase_price, 0)
        * COALESCE(r.tax_rate_percent, 0) / 100
      );
  END LOOP;

  inventory_amount := GREATEST(0, v_inventory);
  input_tax_amount := GREATEST(0, v_tax);
  grni_clearance_amount := public.erp_round_calc(inventory_amount + input_tax_amount);

  RETURN NEXT;
END;
$$;

-- Re-apply the saved payload split after insert (camelCase keys on the outbox body).
CREATE OR REPLACE FUNCTION public.erp_create_purchase_bill_from_payload(
  p_payload jsonb,
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_vendor_id uuid;
  v_lines jsonb;
  v_landed jsonb;
  v_bill_id uuid;
  v_bill_number text;
  v_finalize boolean;
  v_po_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_vendor_id := NULLIF(p_payload ->> 'vendorId', '')::uuid;
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Vendor is required' USING ERRCODE = '22023';
  END IF;

  v_lines := public.erp_purchase_bill_lines_json_from_payload(p_payload -> 'lines');
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  v_landed := public.erp_purchase_landed_costs_json_from_payload(p_payload -> 'landedCosts');
  v_finalize := COALESCE((p_payload ->> 'finalize')::boolean, false);
  v_po_id := NULLIF(p_payload ->> 'poId', '')::uuid;

  v_bill_id := public.create_erp_purchase_bill(
    v_vendor_id,
    p_store_id,
    NULLIF(p_payload ->> 'purchaseDate', '')::date,
    NULLIF(p_payload ->> 'dueDate', '')::date,
    v_lines,
    v_landed,
    COALESCE((p_payload ->> 'discount')::numeric, 0),
    v_po_id,
    NULLIF(p_payload ->> 'vendorBillNumber', ''),
    NULLIF(p_payload ->> 'grnReference', ''),
    NULLIF(p_payload ->> 'batchReference', ''),
    NULLIF(p_payload ->> 'reference', ''),
    NULLIF(p_payload ->> 'notes', ''),
    NULL,
    NULLIF(p_payload ->> 'expectedDeliveryDate', '')::date,
    false,
    CASE WHEN v_po_id IS NOT NULL THEN false ELSE COALESCE((p_payload ->> 'physicalReceiptOnBill')::boolean, true) END,
    v_uid
  );

  PERFORM public.erp_finish_purchase_bill_landed_allocations(v_bill_id, p_payload -> 'lines');

  IF v_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, v_uid);
  END IF;

  SELECT purchase_bill_number INTO v_bill_number
  FROM public.erp_purchase_bills
  WHERE id = v_bill_id;

  RETURN jsonb_build_object(
    'billId', v_bill_id,
    'billNumber', v_bill_number,
    'finalized', v_finalize
  );
END;
$$;

COMMIT;
