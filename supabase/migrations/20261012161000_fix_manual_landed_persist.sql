-- Persist per-line landed allocations on INSERT; stable line order; safer balance detection.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_purchase_bill_lines_json_from_payload(p_lines jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(line_obj ORDER BY ord),
    '[]'::jsonb
  )
  FROM (
    SELECT
      t.ordinality::int AS ord,
      jsonb_build_object(
        'product_id', NULLIF(t.elem ->> 'productId', ''),
        'variant_id', NULL,
        'product_name', COALESCE(t.elem ->> 'productName', 'Item'),
        'barcode', COALESCE(t.elem ->> 'barcode', ''),
        'expiry_date', COALESCE(t.elem ->> 'expiryDate', ''),
        'quantity', COALESCE((t.elem ->> 'quantity')::numeric, 0),
        'purchase_price', COALESCE((t.elem ->> 'purchasePrice')::numeric, 0),
        'tax_rate_percent', COALESCE((t.elem ->> 'taxRatePercent')::numeric, 0),
        'unit_id', COALESCE(t.elem ->> 'unitId', ''),
        'landed_cost_allocated',
          CASE
            WHEN t.elem ? 'landedCostAllocated'
              THEN COALESCE((t.elem ->> 'landedCostAllocated')::numeric, 0)
            ELSE NULL
          END
      ) AS line_obj
    FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ordinality)
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.erp_purchase_order_lines_json_from_payload(p_lines jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(line_obj ORDER BY ord),
    '[]'::jsonb
  )
  FROM (
    SELECT
      t.ordinality::int AS ord,
      jsonb_build_object(
        'product_id', NULLIF(t.elem ->> 'productId', ''),
        'variant_id', NULL,
        'quantity', COALESCE((t.elem ->> 'quantity')::numeric, 0),
        'purchase_price', COALESCE((t.elem ->> 'purchasePrice')::numeric, 0),
        'tax_rate_percent', COALESCE((t.elem ->> 'taxRatePercent')::numeric, 0),
        'landed_cost_allocated',
          CASE
            WHEN t.elem ? 'landedCostAllocated'
              THEN COALESCE((t.elem ->> 'landedCostAllocated')::numeric, 0)
            ELSE NULL
          END
      ) AS line_obj
    FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ordinality)
  ) s;
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
      IF v_elem ? 'landed_cost_allocated' THEN
        v_sum := v_sum + COALESCE((v_elem ->> 'landed_cost_allocated')::numeric, 0);
        v_with_alloc := v_with_alloc + 1;
      ELSIF v_elem ? 'landedCostAllocated' THEN
        v_sum := v_sum + COALESCE((v_elem ->> 'landedCostAllocated')::numeric, 0);
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
  v_qty numeric;
  v_price numeric;
  v_alloc numeric;
  v_unit_loaded numeric;
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
    v_qty := COALESCE((v_elem ->> 'quantity')::numeric, 0);
    v_price := COALESCE((v_elem ->> 'purchase_price')::numeric, 0);
    v_taxable := public.erp_round_money_2(v_qty * v_price);
    v_line_tax := public.erp_round_money_2(
      v_taxable * COALESCE((v_elem ->> 'tax_rate_percent')::numeric, 0) / 100
    );
    v_alloc := 0;
    IF v_elem ? 'landed_cost_allocated' THEN
      v_alloc := GREATEST(0, COALESCE((v_elem ->> 'landed_cost_allocated')::numeric, 0));
    ELSIF v_elem ? 'landedCostAllocated' THEN
      v_alloc := GREATEST(0, COALESCE((v_elem ->> 'landedCostAllocated')::numeric, 0));
    END IF;
    v_unit_loaded := v_price;
    IF COALESCE(v_qty, 0) > 0 THEN
      v_unit_loaded := v_price + (v_alloc / v_qty);
    END IF;

    INSERT INTO public.erp_purchase_bill_lines (
      purchase_bill_id, product_id, variant_id, product_name, barcode, expiry_date,
      quantity, purchase_price, tax_rate_percent, tax_amount, line_total, unit_id,
      landed_cost_allocated, unit_loaded_cost
    )
    VALUES (
      v_bill_id,
      NULLIF(v_elem ->> 'product_id', '')::uuid,
      NULLIF(v_elem ->> 'variant_id', '')::uuid,
      COALESCE(v_elem ->> 'product_name', 'Item'),
      NULLIF(v_elem ->> 'barcode', ''),
      NULLIF(v_elem ->> 'expiry_date', '')::date,
      v_qty,
      v_price,
      COALESCE((v_elem ->> 'tax_rate_percent')::numeric, 0),
      v_line_tax,
      public.erp_round_money_2(v_taxable + v_line_tax),
      NULLIF(v_elem ->> 'unit_id', '')::uuid,
      public.erp_round_money_2(v_alloc),
      v_unit_loaded
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

  IF NOT public.erp_payload_lines_have_balanced_manual_landed(v_lines, v_landed_total) THEN
    PERFORM public.refresh_purchase_bill_landed_allocations(v_bill_id);
  END IF;

  RETURN jsonb_build_object('billId', v_bill_id);
END;
$$;

COMMIT;
