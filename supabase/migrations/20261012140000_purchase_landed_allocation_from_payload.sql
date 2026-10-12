-- Honor per-line landedCostAllocated from purchase payloads when balanced; else pro-rata refresh.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_purchase_order_lines_json_from_payload(p_lines jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', NULLIF(elem ->> 'productId', ''),
        'variant_id', NULL,
        'quantity', COALESCE((elem ->> 'quantity')::numeric, 0),
        'purchase_price', COALESCE((elem ->> 'purchasePrice')::numeric, 0),
        'tax_rate_percent', COALESCE((elem ->> 'taxRatePercent')::numeric, 0),
        'landed_cost_allocated', CASE
          WHEN elem ? 'landedCostAllocated' AND NULLIF(elem ->> 'landedCostAllocated', '') IS NOT NULL
            THEN (elem ->> 'landedCostAllocated')::numeric
          ELSE NULL
        END
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS elem;
$$;

CREATE OR REPLACE FUNCTION public.erp_purchase_bill_lines_json_from_payload(p_lines jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', NULLIF(elem ->> 'productId', ''),
        'variant_id', NULL,
        'product_name', COALESCE(elem ->> 'productName', 'Item'),
        'barcode', COALESCE(elem ->> 'barcode', ''),
        'expiry_date', COALESCE(elem ->> 'expiryDate', ''),
        'quantity', COALESCE((elem ->> 'quantity')::numeric, 0),
        'purchase_price', COALESCE((elem ->> 'purchasePrice')::numeric, 0),
        'tax_rate_percent', COALESCE((elem ->> 'taxRatePercent')::numeric, 0),
        'unit_id', COALESCE(elem ->> 'unitId', ''),
        'landed_cost_allocated', CASE
          WHEN elem ? 'landedCostAllocated' AND NULLIF(elem ->> 'landedCostAllocated', '') IS NOT NULL
            THEN (elem ->> 'landedCostAllocated')::numeric
          ELSE NULL
        END
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS elem;
$$;

CREATE OR REPLACE FUNCTION public.erp_payload_lines_have_balanced_manual_landed(
  p_lines jsonb,
  p_landed_total numeric
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_elem jsonb;
  v_qty numeric;
  v_alloc numeric;
  v_sum numeric := 0;
  v_eligible integer := 0;
  v_with_alloc integer := 0;
BEGIN
  IF COALESCE(p_landed_total, 0) <= 0 THEN
    RETURN false;
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_qty := COALESCE((v_elem ->> 'quantity')::numeric, 0);
    IF v_qty > 0 THEN
      v_eligible := v_eligible + 1;
      IF v_elem ? 'landed_cost_allocated' AND NULLIF(v_elem ->> 'landed_cost_allocated', '') IS NOT NULL THEN
        v_alloc := COALESCE((v_elem ->> 'landed_cost_allocated')::numeric, 0);
        v_sum := v_sum + v_alloc;
        v_with_alloc := v_with_alloc + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_eligible = 0 OR v_with_alloc <> v_eligible THEN
    RETURN false;
  END IF;

  RETURN abs(public.erp_round_money_2(v_sum) - public.erp_round_money_2(p_landed_total)) < 0.01;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_finish_purchase_bill_landed_allocations(
  p_bill_id uuid,
  p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_landed_total numeric := 0;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_landed_total
  FROM public.erp_purchase_bill_landed_costs
  WHERE purchase_bill_id = p_bill_id;

  IF NOT public.erp_payload_lines_have_balanced_manual_landed(p_lines, v_landed_total) THEN
    PERFORM public.refresh_purchase_bill_landed_allocations(p_bill_id);
    RETURN;
  END IF;

  WITH payload AS (
    SELECT value AS elem, ordinality::int AS ord
    FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY
  ),
  bill_lines AS (
    SELECT id, row_number() OVER (ORDER BY id) AS ord
    FROM public.erp_purchase_bill_lines
    WHERE purchase_bill_id = p_bill_id
  )
  UPDATE public.erp_purchase_bill_lines bl
  SET
    landed_cost_allocated = GREATEST(
      0,
      public.erp_round_money_2(COALESCE((p.elem ->> 'landed_cost_allocated')::numeric, 0))
    ),
    unit_loaded_cost = bl.purchase_price + (
      GREATEST(0, COALESCE((p.elem ->> 'landed_cost_allocated')::numeric, 0))
      / NULLIF(bl.quantity, 0)
    )
  FROM bill_lines bl_ord
  JOIN payload p ON p.ord = bl_ord.ord
  WHERE bl.id = bl_ord.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_finish_purchase_order_landed_allocations(
  p_po_id uuid,
  p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_landed_total numeric := 0;
BEGIN
  IF p_po_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_landed_total
  FROM public.purchase_order_landed_costs
  WHERE po_id = p_po_id;

  IF NOT public.erp_payload_lines_have_balanced_manual_landed(p_lines, v_landed_total) THEN
    PERFORM public.refresh_purchase_order_landed_allocations(p_po_id);
    RETURN;
  END IF;

  WITH payload AS (
    SELECT value AS elem, ordinality::int AS ord
    FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY
  ),
  po_lines AS (
    SELECT id, row_number() OVER (ORDER BY id) AS ord
    FROM public.purchase_order_items
    WHERE po_id = p_po_id
  )
  UPDATE public.purchase_order_items poi
  SET
    landed_cost_allocated = GREATEST(
      0,
      public.erp_round_money_2(COALESCE((p.elem ->> 'landed_cost_allocated')::numeric, 0))
    ),
    unit_loaded_cost = poi.price + (
      GREATEST(0, COALESCE((p.elem ->> 'landed_cost_allocated')::numeric, 0))
      / NULLIF(poi.quantity, 0)
    )
  FROM po_lines pl
  JOIN payload p ON p.ord = pl.ord
  WHERE poi.id = pl.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_apply_po_landed_costs_from_payload(
  p_po_id uuid,
  p_landed jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_elem jsonb;
  v_taxable numeric;
  v_line_tax numeric;
  v_landed_total numeric := 0;
  v_po record;
BEGIN
  DELETE FROM public.purchase_order_landed_costs WHERE po_id = p_po_id;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(COALESCE(p_landed, '[]'::jsonb))
  LOOP
    v_taxable := public.erp_round_money_2(
      COALESCE((v_elem ->> 'quantity')::numeric, 0) * COALESCE((v_elem ->> 'rate')::numeric, 0)
    );
    v_line_tax := public.erp_round_money_2(
      v_taxable * COALESCE((v_elem ->> 'taxRatePercent')::numeric, 0) / 100
    );
    v_landed_total := v_landed_total + public.erp_round_money_2(v_taxable + v_line_tax);

    INSERT INTO public.purchase_order_landed_costs (
      po_id,
      landed_cost_item_id,
      name,
      quantity,
      rate,
      tax_rate_percent,
      tax_amount,
      line_total
    )
    VALUES (
      p_po_id,
      NULLIF(v_elem ->> 'landedCostItemId', '')::uuid,
      COALESCE(v_elem ->> 'name', ''),
      COALESCE((v_elem ->> 'quantity')::numeric, 0),
      COALESCE((v_elem ->> 'rate')::numeric, 0),
      COALESCE((v_elem ->> 'taxRatePercent')::numeric, 0),
      v_line_tax,
      public.erp_round_money_2(v_taxable + v_line_tax)
    );
  END LOOP;

  SELECT subtotal, tax_total, discount
  INTO v_po
  FROM public.purchase_orders
  WHERE id = p_po_id;

  UPDATE public.purchase_orders
  SET
    landed_cost_total = public.erp_round_money_2(v_landed_total),
    total_amount = public.erp_round_money_2(
      GREATEST(0, COALESCE(v_po.subtotal, 0) + COALESCE(v_po.tax_total, 0) - COALESCE(v_po.discount, 0))
      + v_landed_total
    )
  WHERE id = p_po_id;
END;
$$;

-- create_erp_purchase_bill: apply manual landed when payload lines are balanced
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
      COALESCE(v_line ->> 'product_name', 'Item'),
      NULLIF(v_line ->> 'barcode', ''),
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
  END LOOP;

  FOR v_lc IN SELECT * FROM jsonb_array_elements(COALESCE(p_landed_costs, '[]'::jsonb))
  LOOP
    v_qty := COALESCE((v_lc ->> 'quantity')::numeric, 0);
    v_price := COALESCE((v_lc ->> 'rate')::numeric, 0);
    v_tax_rate := COALESCE((v_lc ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_qty * v_price, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;
    v_landed_total := v_landed_total + v_line_total;

    INSERT INTO public.erp_purchase_bill_landed_costs (
      purchase_bill_id, landed_cost_item_id, name, quantity, rate, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_bill_id,
      NULLIF(v_lc ->> 'landed_cost_item_id', '')::uuid,
      COALESCE(v_lc ->> 'name', ''),
      v_qty,
      v_price,
      v_tax_rate,
      v_line_tax,
      v_line_total
    );
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

  PERFORM public.erp_finish_purchase_bill_landed_allocations(v_bill_id, p_lines);

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, p_created_by);
  END IF;

  RETURN v_bill_id;
END;
$$;

-- Patch payload RPCs to finish landed allocations (body copied from 20261004300000 with targeted edits)

CREATE OR REPLACE FUNCTION public.erp_create_purchase_order_from_payload(
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
  v_po_id uuid;
  v_po_number text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_vendor_id := NULLIF(p_payload ->> 'vendorId', '')::uuid;
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Vendor is required' USING ERRCODE = '22023';
  END IF;

  v_lines := public.erp_purchase_order_lines_json_from_payload(p_payload -> 'lines');
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  v_po_id := public.create_erp_purchase_order(
    v_vendor_id,
    p_store_id,
    NULLIF(p_payload ->> 'poDate', '')::date,
    NULLIF(p_payload ->> 'expectedDeliveryDate', '')::date,
    NULLIF(p_payload ->> 'reference', ''),
    NULLIF(p_payload ->> 'notes', ''),
    v_lines,
    COALESCE((p_payload ->> 'discount')::numeric, 0),
    v_uid
  );

  PERFORM public.erp_apply_po_landed_costs_from_payload(v_po_id, p_payload -> 'landedCosts');
  PERFORM public.erp_finish_purchase_order_landed_allocations(v_po_id, v_lines);

  SELECT po_number INTO v_po_number FROM public.purchase_orders WHERE id = v_po_id;

  RETURN jsonb_build_object('poId', v_po_id, 'poNumber', v_po_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_update_purchase_order_from_payload(
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
  v_po_id uuid;
  v_po record;
  v_lines jsonb;
  v_elem jsonb;
  v_taxable numeric;
  v_line_tax numeric;
  v_po_number text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_po_id := NULLIF(p_payload ->> 'poId', '')::uuid;
  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = v_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found' USING ERRCODE = '22023';
  END IF;

  IF v_po.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF v_po.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Only pending purchase orders can be edited' USING ERRCODE = '22023';
  END IF;

  v_lines := public.erp_purchase_order_lines_json_from_payload(p_payload -> 'lines');
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.purchase_orders
  SET
    vendor_id = NULLIF(p_payload ->> 'vendorId', '')::uuid,
    store_id = p_store_id,
    po_date = NULLIF(p_payload ->> 'poDate', '')::date,
    expected_delivery_date = NULLIF(p_payload ->> 'expectedDeliveryDate', '')::date,
    reference = NULLIF(p_payload ->> 'reference', ''),
    notes = NULLIF(p_payload ->> 'notes', ''),
    discount = COALESCE((p_payload ->> 'discount')::numeric, 0),
    updated_at = now()
  WHERE id = v_po_id AND status = 'pending';

  DELETE FROM public.purchase_order_items WHERE po_id = v_po_id;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    v_taxable := public.erp_round_money_2(
      COALESCE((v_elem ->> 'quantity')::numeric, 0) * COALESCE((v_elem ->> 'purchase_price')::numeric, 0)
    );
    v_line_tax := public.erp_round_money_2(
      v_taxable * COALESCE((v_elem ->> 'tax_rate_percent')::numeric, 0) / 100
    );

    INSERT INTO public.purchase_order_items (
      po_id, product_id, variant_id, quantity, price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_po_id,
      NULLIF(v_elem ->> 'product_id', '')::uuid,
      NULLIF(v_elem ->> 'variant_id', '')::uuid,
      COALESCE((v_elem ->> 'quantity')::numeric, 0),
      COALESCE((v_elem ->> 'purchase_price')::numeric, 0),
      COALESCE((v_elem ->> 'tax_rate_percent')::numeric, 0),
      v_line_tax,
      public.erp_round_money_2(v_taxable + v_line_tax)
    );
  END LOOP;

  UPDATE public.purchase_orders po
  SET
    subtotal = sub.subtotal,
    tax_total = sub.tax_total
  FROM (
    SELECT
      COALESCE(SUM(public.erp_round_money_2(quantity * price)), 0) AS subtotal,
      COALESCE(SUM(tax_amount), 0) AS tax_total
    FROM public.purchase_order_items
    WHERE po_id = v_po_id
  ) sub
  WHERE po.id = v_po_id;

  PERFORM public.erp_apply_po_landed_costs_from_payload(v_po_id, p_payload -> 'landedCosts');
  PERFORM public.erp_finish_purchase_order_landed_allocations(v_po_id, v_lines);

  SELECT po_number INTO v_po_number FROM public.purchase_orders WHERE id = v_po_id;

  RETURN jsonb_build_object('poId', v_po_id, 'poNumber', v_po_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_update_purchase_bill_from_payload(
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
  v_bill_id uuid;
  v_bill record;
  v_lines jsonb;
  v_elem jsonb;
  v_landed jsonb;
  v_lc_elem jsonb;
  v_taxable numeric;
  v_line_tax numeric;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_landed_total numeric := 0;
  v_discount numeric;
  v_total numeric;
  v_po_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_bill_id := NULLIF(p_payload ->> 'billId', '')::uuid;
  IF v_bill_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill id is required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_bill
  FROM public.erp_purchase_bills
  WHERE id = v_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found' USING ERRCODE = '22023';
  END IF;

  IF v_bill.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF v_bill.status IS DISTINCT FROM 'draft'
    OR COALESCE(v_bill.accounting_posted, false)
    OR COALESCE(v_bill.legacy_stock_via_bill, false) THEN
    RAISE EXCEPTION 'Only draft purchase bills can be edited' USING ERRCODE = '22023';
  END IF;

  v_lines := public.erp_purchase_bill_lines_json_from_payload(p_payload -> 'lines');
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  v_landed := COALESCE(p_payload -> 'landedCosts', '[]'::jsonb);
  v_discount := COALESCE((p_payload ->> 'discount')::numeric, 0);
  v_po_id := NULLIF(p_payload ->> 'poId', '')::uuid;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    v_taxable := public.erp_round_money_2(
      COALESCE((v_elem ->> 'quantity')::numeric, 0) * COALESCE((v_elem ->> 'purchase_price')::numeric, 0)
    );
    v_line_tax := public.erp_round_money_2(
      v_taxable * COALESCE((v_elem ->> 'tax_rate_percent')::numeric, 0) / 100
    );
    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
  END LOOP;

  FOR v_lc_elem IN SELECT value FROM jsonb_array_elements(v_landed)
  LOOP
    v_taxable := public.erp_round_money_2(
      COALESCE((v_lc_elem ->> 'quantity')::numeric, 0) * COALESCE((v_lc_elem ->> 'rate')::numeric, 0)
    );
    v_line_tax := public.erp_round_money_2(
      v_taxable * COALESCE((v_lc_elem ->> 'taxRatePercent')::numeric, 0) / 100
    );
    v_landed_total := v_landed_total + public.erp_round_money_2(v_taxable + v_line_tax);
  END LOOP;

  v_total := public.erp_round_money_2(
    GREATEST(0, v_subtotal + v_tax - v_discount) + v_landed_total
  );

  UPDATE public.erp_purchase_bills
  SET
    vendor_id = NULLIF(p_payload ->> 'vendorId', '')::uuid,
    store_id = p_store_id,
    purchase_date = NULLIF(p_payload ->> 'purchaseDate', '')::date,
    due_date = NULLIF(p_payload ->> 'dueDate', '')::date,
    expected_delivery_date = NULLIF(p_payload ->> 'expectedDeliveryDate', '')::date,
    po_id = v_po_id,
    vendor_bill_number = NULLIF(p_payload ->> 'vendorBillNumber', ''),
    grn_reference = NULLIF(p_payload ->> 'grnReference', ''),
    batch_reference = NULLIF(p_payload ->> 'batchReference', ''),
    reference = NULLIF(p_payload ->> 'reference', ''),
    notes = NULLIF(p_payload ->> 'notes', ''),
    discount = v_discount,
    subtotal = v_subtotal,
    tax_amount = v_tax,
    landed_cost_total = v_landed_total,
    total_amount = v_total,
    balance_due = 0,
    physical_receipt_on_bill = CASE WHEN v_po_id IS NOT NULL THEN false ELSE COALESCE((p_payload ->> 'physicalReceiptOnBill')::boolean, true) END,
    updated_at = now()
  WHERE id = v_bill_id AND status = 'draft';

  DELETE FROM public.erp_purchase_bill_lines WHERE purchase_bill_id = v_bill_id;
  DELETE FROM public.erp_purchase_bill_landed_costs WHERE purchase_bill_id = v_bill_id;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    v_taxable := public.erp_round_money_2(
      COALESCE((v_elem ->> 'quantity')::numeric, 0) * COALESCE((v_elem ->> 'purchase_price')::numeric, 0)
    );
    v_line_tax := public.erp_round_money_2(
      v_taxable * COALESCE((v_elem ->> 'tax_rate_percent')::numeric, 0) / 100
    );

    INSERT INTO public.erp_purchase_bill_lines (
      purchase_bill_id, product_id, variant_id, product_name, barcode, expiry_date,
      quantity, purchase_price, tax_rate_percent, tax_amount, line_total, unit_id
    )
    VALUES (
      v_bill_id,
      NULLIF(v_elem ->> 'product_id', '')::uuid,
      NULLIF(v_elem ->> 'variant_id', '')::uuid,
      COALESCE(v_elem ->> 'product_name', 'Item'),
      NULLIF(v_elem ->> 'barcode', ''),
      NULLIF(v_elem ->> 'expiry_date', '')::date,
      COALESCE((v_elem ->> 'quantity')::numeric, 0),
      COALESCE((v_elem ->> 'purchase_price')::numeric, 0),
      COALESCE((v_elem ->> 'tax_rate_percent')::numeric, 0),
      v_line_tax,
      public.erp_round_money_2(v_taxable + v_line_tax),
      NULLIF(v_elem ->> 'unit_id', '')::uuid
    );
  END LOOP;

  FOR v_lc_elem IN SELECT value FROM jsonb_array_elements(v_landed)
  LOOP
    v_taxable := public.erp_round_money_2(
      COALESCE((v_lc_elem ->> 'quantity')::numeric, 0) * COALESCE((v_lc_elem ->> 'rate')::numeric, 0)
    );
    v_line_tax := public.erp_round_money_2(
      v_taxable * COALESCE((v_lc_elem ->> 'taxRatePercent')::numeric, 0) / 100
    );

    INSERT INTO public.erp_purchase_bill_landed_costs (
      purchase_bill_id, landed_cost_item_id, name, quantity, rate, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_bill_id,
      NULLIF(v_lc_elem ->> 'landedCostItemId', '')::uuid,
      COALESCE(v_lc_elem ->> 'name', ''),
      COALESCE((v_lc_elem ->> 'quantity')::numeric, 0),
      COALESCE((v_lc_elem ->> 'rate')::numeric, 0),
      COALESCE((v_lc_elem ->> 'taxRatePercent')::numeric, 0),
      v_line_tax,
      public.erp_round_money_2(v_taxable + v_line_tax)
    );
  END LOOP;

  PERFORM public.erp_finish_purchase_bill_landed_allocations(v_bill_id, v_lines);

  RETURN jsonb_build_object('billId', v_bill_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_payload_lines_have_balanced_manual_landed(jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_finish_purchase_bill_landed_allocations(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_finish_purchase_order_landed_allocations(uuid, jsonb) TO authenticated;

COMMIT;
