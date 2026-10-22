-- Empty expiry_date in bill line JSON was cast via NULLIF(expiry_date, expiryDate),
-- which leaves '' when expiryDate is missing (NULLIF('', NULL) => ''), causing:
-- invalid input syntax for type date: ""

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_json_line_expiry_date(p_line jsonb)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public 
AS $$
  SELECT NULLIF(
    TRIM(COALESCE(p_line ->> 'expiry_date', p_line ->> 'expiryDate', '')),
    ''  
  )::date;
$$;

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
  v_alloc numeric;
  v_unit_loaded numeric;
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

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_price := COALESCE(
      (v_line ->> 'purchase_price')::numeric,
      (v_line ->> 'purchasePrice')::numeric,
      0
    );
    v_tax_rate := COALESCE(
      (v_line ->> 'tax_rate_percent')::numeric,
      (v_line ->> 'taxRatePercent')::numeric,
      0
    );
    v_taxable := public.erp_round_calc(v_price * v_qty);
    v_line_tax := public.erp_round_calc(v_taxable * v_tax_rate / 100);
    v_line_total := public.erp_round_calc(v_taxable + v_line_tax);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    v_alloc := 0;
    IF public.erp_json_has_numeric_field(v_line, 'landed_cost_allocated') THEN
      v_alloc := GREATEST(0, COALESCE((v_line ->> 'landed_cost_allocated')::numeric, 0));
    ELSIF public.erp_json_has_numeric_field(v_line, 'landedCostAllocated') THEN
      v_alloc := GREATEST(0, COALESCE((v_line ->> 'landedCostAllocated')::numeric, 0));
    END IF;
    v_unit_loaded := v_price;
    IF v_qty > 0 THEN
      v_unit_loaded := v_price + (v_alloc / v_qty);
    END IF;

    v_product_id := NULLIF(COALESCE(v_line ->> 'product_id', v_line ->> 'productId'), '')::uuid;
    IF v_product_id IS NULL AND NULLIF(COALESCE(v_line ->> 'variant_id', v_line ->> 'variantId'), '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(COALESCE(v_line ->> 'variant_id', v_line ->> 'variantId'), '')::uuid;
    END IF;

    INSERT INTO public.erp_purchase_bill_lines (
      purchase_bill_id, variant_id, product_id, product_name, barcode, expiry_date,
      quantity, original_quantity, purchase_price, tax_rate_percent, tax_amount, line_total,
      unit_id, landed_cost_allocated, unit_loaded_cost
    )
    VALUES (
      v_bill_id,
      NULLIF(COALESCE(v_line ->> 'variant_id', v_line ->> 'variantId'), '')::uuid,
      v_product_id,
      COALESCE(v_line ->> 'product_name', v_line ->> 'productName', 'Item'),
      NULLIF(v_line ->> 'barcode', ''),
      public.erp_json_line_expiry_date(v_line),
      v_qty,
      v_qty,
      v_price,
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(COALESCE(v_line ->> 'unit_id', v_line ->> 'unitId'), '')::uuid,
      public.erp_round_calc(v_alloc),
      v_unit_loaded
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
  END LOOP;

  FOR v_lc IN SELECT value FROM jsonb_array_elements(COALESCE(p_landed_costs, '[]'::jsonb))
  LOOP
    v_qty := COALESCE((v_lc ->> 'quantity')::numeric, 0);
    v_price := COALESCE((v_lc ->> 'rate')::numeric, 0);
    v_tax_rate := COALESCE(
      (v_lc ->> 'tax_rate_percent')::numeric,
      (v_lc ->> 'taxRatePercent')::numeric,
      0
    );
    v_taxable := public.erp_round_calc(v_qty * v_price);
    v_line_tax := public.erp_round_calc(v_taxable * v_tax_rate / 100);
    v_line_total := public.erp_round_calc(v_taxable + v_line_tax);
    v_landed_total := public.erp_round_calc(v_landed_total + v_line_total);

    INSERT INTO public.erp_purchase_bill_landed_costs (
      purchase_bill_id, landed_cost_item_id, name, quantity, rate, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_bill_id,
      NULLIF(COALESCE(v_lc ->> 'landed_cost_item_id', v_lc ->> 'landedCostItemId'), '')::uuid,
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

  v_total := public.erp_round_calc(
    GREATEST(0, v_subtotal + v_tax - COALESCE(p_discount, 0)) + v_landed_total
  );

  UPDATE public.erp_purchase_bills
  SET
    subtotal = public.erp_round_calc(v_subtotal),
    tax_amount = public.erp_round_calc(v_tax),
    discount = COALESCE(p_discount, 0),
    landed_cost_total = public.erp_round_calc(v_landed_total),
    total_amount = v_total,
    balance_due = 0,
    updated_at = now()
  WHERE id = v_bill_id;

  IF NOT public.erp_payload_lines_have_balanced_manual_landed(p_lines, v_landed_total) THEN
    PERFORM public.refresh_purchase_bill_landed_allocations(v_bill_id);
  END IF;

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, p_created_by);
  END IF;

  RETURN v_bill_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_json_line_expiry_date(jsonb) TO authenticated;

COMMIT;