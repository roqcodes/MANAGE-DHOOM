-- Landed cost allocation by extended line value (Odoo "By Current Cost" / Sage "Value").
-- Weighted-average unit cost on store_product_inventory at receipt.

BEGIN;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS landed_cost_total numeric NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS landed_cost_allocated numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_loaded_cost numeric;

ALTER TABLE public.erp_purchase_bill_lines
  ADD COLUMN IF NOT EXISTS landed_cost_allocated numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_loaded_cost numeric;

ALTER TABLE public.erp_purchase_receive_lines
  ADD COLUMN IF NOT EXISTS loaded_unit_cost numeric;

CREATE TABLE IF NOT EXISTS public.purchase_order_landed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders (id) ON DELETE CASCADE,
  landed_cost_item_id uuid REFERENCES public.erp_landed_cost_items (id),
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  rate numeric NOT NULL DEFAULT 0 CHECK (rate >= 0),
  tax_rate_percent numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_order_landed_costs_po_id_idx
  ON public.purchase_order_landed_costs (po_id);

-- ─── Weighted landed cost → lines (extended purchase value basis) ─────────────

CREATE OR REPLACE FUNCTION public.refresh_purchase_bill_landed_allocations(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_landed_total numeric := 0;
  v_basis_total numeric := 0;
  r record;
  v_alloc numeric;
  v_allocated numeric := 0;
  v_last_line_id uuid;
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

  SELECT COALESCE(SUM(ROUND(quantity * purchase_price, 2)), 0), COUNT(*)::integer
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
    SELECT id, quantity, purchase_price, ROUND(quantity * purchase_price, 2) AS ext
    FROM public.erp_purchase_bill_lines
    WHERE purchase_bill_id = p_bill_id AND quantity > 0
    ORDER BY id
  LOOP
    v_line_no := v_line_no + 1;
    IF v_line_no < v_line_total THEN
      v_alloc := ROUND(v_landed_total * (r.ext / v_basis_total), 2);
      v_allocated := v_allocated + v_alloc;
    ELSE
      v_alloc := ROUND(v_landed_total - v_allocated, 2);
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

  SELECT COALESCE(SUM(ROUND(quantity * price, 2)), 0), COUNT(*)::integer
  INTO v_basis_total, v_line_total
  FROM public.purchase_order_items
  WHERE po_id = p_po_id
    AND quantity > 0;

  UPDATE public.purchase_order_items
  SET landed_cost_allocated = 0
  WHERE po_id = p_po_id;

  UPDATE public.purchase_orders
  SET landed_cost_total = v_landed_total
  WHERE id = p_po_id;

  IF v_landed_total <= 0 OR v_basis_total <= 0 OR v_line_total = 0 THEN
    UPDATE public.purchase_order_items
    SET unit_loaded_cost = price
    WHERE po_id = p_po_id;
    RETURN;
  END IF;

  v_allocated := 0;
  v_line_no := 0;
  FOR r IN
    SELECT id, quantity, price, ROUND(quantity * price, 2) AS ext
    FROM public.purchase_order_items
    WHERE po_id = p_po_id AND quantity > 0
    ORDER BY id
  LOOP
    v_line_no := v_line_no + 1;
    IF v_line_no < v_line_total THEN
      v_alloc := ROUND(v_landed_total * (r.ext / v_basis_total), 2);
      v_allocated := v_allocated + v_alloc;
    ELSE
      v_alloc := ROUND(v_landed_total - v_allocated, 2);
    END IF;

    UPDATE public.purchase_order_items
    SET
      landed_cost_allocated = GREATEST(0, v_alloc),
      unit_loaded_cost = price + (GREATEST(0, v_alloc) / NULLIF(quantity, 0))
    WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.copy_po_landed_costs_to_bill(
  p_po_id uuid,
  p_bill_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_po_id IS NULL OR p_bill_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.erp_purchase_bill_landed_costs WHERE purchase_bill_id = p_bill_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.erp_purchase_bill_landed_costs (
    purchase_bill_id, landed_cost_item_id, name, quantity, rate,
    tax_rate_percent, tax_amount, line_total
  )
  SELECT
    p_bill_id,
    landed_cost_item_id,
    name,
    quantity,
    rate,
    tax_rate_percent,
    tax_amount,
    line_total
  FROM public.purchase_order_landed_costs
  WHERE po_id = p_po_id;
END;
$$;

-- Weighted average cost (AVCO) on receipt
CREATE OR REPLACE FUNCTION public.store_product_inventory_apply_receipt_cost(
  p_store_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_cost numeric;
  v_new_stock numeric;
  v_new_cost numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_store_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Store and product are required';
  END IF;

  IF p_qty = 0 THEN
    RETURN NULL;
  END IF;

  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be zero or positive';
  END IF;

  SELECT stock, purchase_price
  INTO v_stock, v_cost
  FROM public.store_product_inventory
  WHERE store_id = p_store_id AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock: no inventory for product % at store %', p_product_id, p_store_id;
    END IF;
    INSERT INTO public.store_product_inventory (store_id, product_id, stock, purchase_price, updated_at)
    VALUES (p_store_id, p_product_id, p_qty, ROUND(p_unit_cost, 4), now());
    RETURN ROUND(p_unit_cost, 4);
  END IF;

  v_new_stock := COALESCE(v_stock, 0) + p_qty;
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: product % at store %', p_product_id, p_store_id;
  END IF;

  IF p_qty > 0 THEN
    IF COALESCE(v_stock, 0) <= 0 OR v_cost IS NULL THEN
      v_new_cost := p_unit_cost;
    ELSE
      v_new_cost := (COALESCE(v_stock, 0) * COALESCE(v_cost, 0) + p_qty * p_unit_cost)
        / NULLIF(COALESCE(v_stock, 0) + p_qty, 0);
    END IF;
    v_new_cost := ROUND(v_new_cost, 4);
  ELSE
    v_new_cost := v_cost;
    IF v_new_stock = 0 THEN
      v_new_cost := NULL;
    END IF;
  END IF;

  UPDATE public.store_product_inventory
  SET stock = v_new_stock, purchase_price = v_new_cost, updated_at = now()
  WHERE store_id = p_store_id AND product_id = p_product_id;

  RETURN v_new_cost;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_receive_line_loaded_unit_cost(
  p_bill_line_id uuid,
  p_fallback_price numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.erp_purchase_bill_lines%ROWTYPE;
BEGIN
  IF p_bill_line_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.erp_purchase_bill_lines WHERE id = p_bill_line_id;
    IF FOUND THEN
      IF v_row.unit_loaded_cost IS NOT NULL AND v_row.unit_loaded_cost > 0 THEN
        RETURN v_row.unit_loaded_cost;
      END IF;
      IF COALESCE(v_row.landed_cost_allocated, 0) > 0 AND COALESCE(v_row.quantity, 0) > 0 THEN
        RETURN v_row.purchase_price + (v_row.landed_cost_allocated / v_row.quantity);
      END IF;
      RETURN COALESCE(v_row.purchase_price, p_fallback_price);
    END IF;
  END IF;

  RETURN COALESCE(p_fallback_price, 0);
END;
$$;

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
  v_unit numeric;
  v_actor uuid;
  v_committed boolean;
BEGIN
  v_actor := COALESCE(p_user_id, auth.uid());

  IF p_bill_id IS NULL OR p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid purchase bill stock request';
  END IF;

  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, inventory_committed
  INTO v_store_id, v_committed
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  PERFORM public.require_store_access(v_store_id, v_actor);

  IF p_multiplier = 1 AND COALESCE(v_committed, false) THEN
    RETURN;
  END IF;

  IF p_multiplier = -1 AND NOT COALESCE(v_committed, false) THEN
    RETURN;
  END IF;

  PERFORM public.refresh_purchase_bill_landed_allocations(p_bill_id);

  FOR r IN
    SELECT
      pbl.id,
      COALESCE(pbl.product_id, pv.product_id) AS product_id,
      pbl.quantity,
      COALESCE(pbl.unit_loaded_cost, pbl.purchase_price) AS unit_cost
    FROM public.erp_purchase_bill_lines pbl
    LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
    WHERE pbl.purchase_bill_id = p_bill_id
      AND COALESCE(pbl.product_id, pv.product_id) IS NOT NULL
      AND pbl.quantity > 0
  LOOP
    v_delta := r.quantity * p_multiplier;
    v_unit := COALESCE(r.unit_cost, 0);

    PERFORM public.store_product_inventory_apply_receipt_cost(
      v_store_id, r.product_id, v_delta, v_unit, v_actor
    );

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta, 'purchase', p_bill_id, 'purchase_bill',
      'Purchase Bill Receipt', v_store_id, NULL, v_unit, v_actor
    );
  END LOOP;
END;
$$;

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
  LOOP
    v_unit := COALESCE(
      NULLIF(r.loaded_unit_cost, 0),
      public.resolve_receive_line_loaded_unit_cost(r.bill_line_id, r.purchase_price)
    );

    IF p_multiplier = 1 THEN
      UPDATE public.erp_purchase_receive_lines
      SET loaded_unit_cost = v_unit
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

-- Patch bill create: copy PO landed costs + refresh allocations
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

  IF p_po_id IS NOT NULL AND jsonb_array_length(COALESCE(p_landed_costs, '[]'::jsonb)) = 0 THEN
    PERFORM public.copy_po_landed_costs_to_bill(p_po_id, v_bill_id);
  END IF;

  FOR v_lc IN SELECT * FROM jsonb_array_elements(COALESCE(p_landed_costs, '[]'::jsonb))
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

  IF v_landed_total = 0 AND p_po_id IS NOT NULL THEN
    SELECT COALESCE(SUM(line_total), 0) INTO v_landed_total
    FROM public.erp_purchase_bill_landed_costs
    WHERE purchase_bill_id = v_bill_id;
  END IF;

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

  PERFORM public.refresh_purchase_bill_landed_allocations(v_bill_id);

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, p_created_by);
  END IF;

  RETURN v_bill_id;
END;
$$;

-- Refresh allocations after receive reconciles bill quantities
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
    SELECT quantity, purchase_price, tax_rate_percent
    FROM public.erp_purchase_bill_lines
    WHERE purchase_bill_id = v_bill_id
  LOOP
    v_taxable := ROUND(r.quantity * r.purchase_price, 2);
    v_line_tax := ROUND(v_taxable * r.tax_rate_percent / 100, 2);
    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
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

  PERFORM public.refresh_purchase_bill_landed_allocations(v_bill_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_purchase_bill_landed_allocations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_purchase_order_landed_allocations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_product_inventory_apply_receipt_cost(uuid, uuid, numeric, numeric, uuid) TO authenticated;

-- Backfill landed allocations for open/historical bills
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.erp_purchase_bills WHERE COALESCE(landed_cost_total, 0) > 0
  LOOP
    PERFORM public.refresh_purchase_bill_landed_allocations(r.id);
  END LOOP;
END;
$$;

COMMIT;
