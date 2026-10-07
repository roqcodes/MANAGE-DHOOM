-- P13–P19: Purchase orders and purchase bills durable client operations.

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
        'tax_rate_percent', COALESCE((elem ->> 'taxRatePercent')::numeric, 0)
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
        'unit_id', COALESCE(elem ->> 'unitId', '')
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS elem;
$$;

CREATE OR REPLACE FUNCTION public.erp_purchase_landed_costs_json_from_payload(p_costs jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'landed_cost_item_id', COALESCE(elem ->> 'landedCostItemId', ''),
        'name', COALESCE(elem ->> 'name', ''),
        'quantity', COALESCE((elem ->> 'quantity')::numeric, 0),
        'rate', COALESCE((elem ->> 'rate')::numeric, 0),
        'tax_rate_percent', COALESCE((elem ->> 'taxRatePercent')::numeric, 0)
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_costs, '[]'::jsonb)) AS elem;
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

  PERFORM public.refresh_purchase_order_landed_allocations(p_po_id);

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

  SELECT po_number INTO v_po_number FROM public.purchase_orders WHERE id = v_po_id;

  RETURN jsonb_build_object('poId', v_po_id, 'poNumber', v_po_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_deliver_finalize_purchase_order_from_payload(
  p_payload jsonb,
  p_store_id uuid,
  p_operation_id uuid
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
  v_result jsonb;
  v_receive_id uuid;
  v_bill_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_po_id := NULLIF(p_payload ->> 'poId', '')::uuid;
  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order id is required' USING ERRCODE = '22023';
  END IF;

  SELECT id, store_id INTO v_po
  FROM public.purchase_orders
  WHERE id = v_po_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found' USING ERRCODE = '22023';
  END IF;

  IF v_po.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'po_line_id', NULLIF(elem ->> 'poLineId', ''),
        'delivered_qty', COALESCE((elem ->> 'deliveredQty')::numeric, 0)
      )
    ),
    '[]'::jsonb
  )
  INTO v_lines
  FROM jsonb_array_elements(COALESCE(p_payload -> 'lines', '[]'::jsonb)) AS elem;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'At least one delivery line is required' USING ERRCODE = '22023';
  END IF;

  v_result := public.submit_erp_po_delivery_and_finalize(
    v_po_id,
    v_lines,
    COALESCE(NULLIF(p_payload ->> 'receiveDate', '')::date, CURRENT_DATE),
    NULLIF(p_payload ->> 'notes', ''),
    v_uid,
    COALESCE(p_operation_id, gen_random_uuid())
  );

  v_receive_id := (v_result ->> 'receive_id')::uuid;
  v_bill_id := (v_result ->> 'bill_id')::uuid;

  RETURN jsonb_build_object(
    'poId', v_po_id,
    'receiveId', v_receive_id,
    'billId', v_bill_id,
    'idempotentReplay', COALESCE((v_result ->> 'idempotent_replay')::boolean, false)
  );
END;
$$;

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

  IF v_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id);
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
  v_subtotal := public.erp_round_money_2(v_subtotal);
  v_tax := public.erp_round_money_2(v_tax);
  v_landed_total := public.erp_round_money_2(v_landed_total);

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

  PERFORM public.refresh_purchase_bill_landed_allocations(v_bill_id);

  RETURN jsonb_build_object('billId', v_bill_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_finalize_purchase_bill_from_payload(
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_bill_id := NULLIF(p_payload ->> 'billId', '')::uuid;
  IF v_bill_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill id is required' USING ERRCODE = '22023';
  END IF;

  SELECT store_id, status INTO v_bill
  FROM public.erp_purchase_bills
  WHERE id = v_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found' USING ERRCODE = '22023';
  END IF;

  IF v_bill.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  PERFORM public.finalize_erp_purchase_bill(v_bill_id);

  RETURN jsonb_build_object('billId', v_bill_id, 'status', 'finalized');
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_cancel_purchase_bill_from_payload(
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
  v_store_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_bill_id := NULLIF(p_payload ->> 'billId', '')::uuid;
  IF v_bill_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill id is required' USING ERRCODE = '22023';
  END IF;

  SELECT store_id INTO v_store_id
  FROM public.erp_purchase_bills
  WHERE id = v_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found' USING ERRCODE = '22023';
  END IF;

  IF v_store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  PERFORM public.cancel_erp_purchase_bill(v_bill_id, v_uid);

  RETURN jsonb_build_object('billId', v_bill_id, 'status', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.run_erp_client_idempotent_operation(
  p_operation_id uuid,
  p_operation_type text,
  p_payload_hash text,
  p_payload jsonb,
  p_store_id uuid,
  p_terminal_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.erp_client_operations%ROWTYPE;
  v_computed_hash text;
  v_result jsonb;
  v_exec_nonce bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED'
      USING ERRCODE = '28000';
  END IF;

  IF p_operation_id IS NULL OR p_operation_type IS NULL OR p_payload_hash IS NULL OR p_payload IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_INVALID_REQUEST'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_computed_hash := public.erp_payload_hash(p_payload);
  IF v_computed_hash <> p_payload_hash THEN
    RAISE EXCEPTION 'ERP_CLIENT_PAYLOAD_HASH_MISMATCH'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.erp_client_operations (
    operation_id,
    operation_type,
    payload_hash,
    user_id,
    store_id,
    terminal_id,
    status
  )
  VALUES (
    p_operation_id,
    p_operation_type,
    p_payload_hash,
    v_uid,
    p_store_id,
    p_terminal_id,
    'PENDING'
  )
  ON CONFLICT (operation_id) DO NOTHING;

  SELECT *
  INTO v_row
  FROM public.erp_client_operations
  WHERE operation_id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERP_CLIENT_OPERATION_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_row.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'ERP_CLIENT_USER_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.operation_type IS DISTINCT FROM p_operation_type THEN
    RAISE EXCEPTION 'ERP_CLIENT_OPERATION_TYPE_CONFLICT'
      USING ERRCODE = '23505';
  END IF;

  IF v_row.payload_hash IS DISTINCT FROM p_payload_hash THEN
    RAISE EXCEPTION 'ERP_CLIENT_PAYLOAD_HASH_CONFLICT'
      USING ERRCODE = '23505';
  END IF;

  IF v_row.status = 'COMMITTED' THEN
    RETURN jsonb_build_object(
      'idempotentReplay', true,
      'result', v_row.result
    );
  END IF;

  IF p_operation_type = 'test.certify' THEN
    IF COALESCE((p_payload ->> 'fail')::boolean, false) THEN
      RAISE EXCEPTION 'ERP_CLIENT_CERTIFY_FAILURE'
        USING ERRCODE = 'P0001';
    END IF;
    v_exec_nonce := nextval('public.erp_certify_execution_seq');
    v_result := jsonb_build_object(
      'certified', true,
      'executionNonce', v_exec_nonce
    );
  ELSIF p_operation_type = 'sales_order.create' THEN
    v_result := public.erp_create_sales_order_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_order.update' THEN
    v_result := public.erp_update_sales_order_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_order.cancel' THEN
    v_result := public.erp_cancel_sales_order_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_order.convert_to_invoice' THEN
    v_result := public.erp_convert_sales_order_to_invoice_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_invoice.create' THEN
    v_result := public.erp_create_sales_invoice_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_invoice.update' THEN
    v_result := public.erp_update_sales_invoice_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_invoice.issue' THEN
    v_result := public.erp_issue_sales_invoice_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_invoice.cancel' THEN
    v_result := public.erp_cancel_sales_invoice_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'purchase_order.create' THEN
    v_result := public.erp_create_purchase_order_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'purchase_order.update' THEN
    v_result := public.erp_update_purchase_order_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'purchase_order.deliver_finalize' THEN
    v_result := public.erp_deliver_finalize_purchase_order_from_payload(p_payload, p_store_id, p_operation_id);
  ELSIF p_operation_type = 'purchase_bill.create' THEN
    v_result := public.erp_create_purchase_bill_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'purchase_bill.update' THEN
    v_result := public.erp_update_purchase_bill_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'purchase_bill.finalize' THEN
    v_result := public.erp_finalize_purchase_bill_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'purchase_bill.cancel' THEN
    v_result := public.erp_cancel_purchase_bill_from_payload(p_payload, p_store_id);
  ELSE
    RAISE EXCEPTION 'ERP_CLIENT_UNSUPPORTED_OPERATION_TYPE'
      USING ERRCODE = '0A000';
  END IF;

  UPDATE public.erp_client_operations
  SET
    status = 'COMMITTED',
    result = v_result,
    updated_at = now()
  WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'idempotentReplay', false,
    'result', v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_purchase_order_lines_json_from_payload(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_purchase_bill_lines_json_from_payload(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_purchase_landed_costs_json_from_payload(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_apply_po_landed_costs_from_payload(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_create_purchase_order_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_update_purchase_order_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_deliver_finalize_purchase_order_from_payload(jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_create_purchase_bill_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_update_purchase_bill_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_finalize_purchase_bill_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_cancel_purchase_bill_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_erp_client_idempotent_operation(
  uuid, text, text, jsonb, uuid, text
) TO authenticated;

COMMIT;
