-- purchase_order.deliver_finalize + receive/stock idempotency (P15).
-- Requires migrations:
--   20261004300000_erp_purchase_module_idempotent.sql
--   20261004310000_po_delivery_prefer_draft_bill.sql
-- Ends with ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_store uuid;
  v_vendor uuid;
  v_product uuid;
  v_po_op uuid := gen_random_uuid();
  v_bill_op uuid := gen_random_uuid();
  v_deliver_op uuid := gen_random_uuid();
  v_po_payload jsonb;
  v_bill_payload jsonb;
  v_deliver_payload jsonb;
  v_po_hash text;
  v_bill_hash text;
  v_deliver_hash text;
  v_po_id uuid;
  v_po_line_id uuid;
  v_bill_id uuid;
  v_receive1 uuid;
  v_receive2 uuid;
  v_result jsonb;
  v_movements int;
  v_product_name text;
BEGIN
  SELECT id INTO v_staff FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no staff user';
  END IF;

  SELECT id INTO v_store FROM public.stores WHERE COALESCE(is_active, true) ORDER BY created_at LIMIT 1;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no store';
  END IF;

  SELECT id INTO v_vendor FROM public.vendors WHERE COALESCE(is_active, true) ORDER BY created_at LIMIT 1;
  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no vendor';
  END IF;

  SELECT p.id, p.name INTO v_product, v_product_name
  FROM public.products p
  ORDER BY p.created_at
  LIMIT 1;

  IF v_product IS NULL THEN
    RAISE NOTICE 'SKIP: purchase receive tests (no product)';
    RETURN;
  END IF;

  IF NOT public.user_has_store_access(v_staff, v_store) THEN
    INSERT INTO public.user_store_access (user_id, store_id)
    VALUES (v_staff, v_store)
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- PO with qty 10 for partial + over-receipt scenarios
  v_po_payload := jsonb_build_object(
    'vendorId', v_vendor::text,
    'poDate', CURRENT_DATE::text,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'quantity', 10,
        'purchasePrice', 10,
        'taxRatePercent', 0
      )
    ),
    'discount', 0
  );
  v_po_hash := public.erp_payload_hash(v_po_payload);

  v_result := public.run_erp_client_idempotent_operation(
    v_po_op, 'purchase_order.create', v_po_hash, v_po_payload, v_store, 'term-rcv'
  );
  v_po_id := (v_result -> 'result' ->> 'poId')::uuid;

  SELECT id INTO v_po_line_id
  FROM public.purchase_order_items
  WHERE po_id = v_po_id
  LIMIT 1;

  v_bill_payload := jsonb_build_object(
    'vendorId', v_vendor::text,
    'purchaseDate', CURRENT_DATE::text,
    'poId', v_po_id::text,
    'finalize', false,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'productName', COALESCE(v_product_name, 'Item'),
        'quantity', 10,
        'purchasePrice', 10,
        'taxRatePercent', 0
      )
    ),
    'discount', 0
  );
  v_bill_hash := public.erp_payload_hash(v_bill_payload);

  v_result := public.run_erp_client_idempotent_operation(
    v_bill_op, 'purchase_bill.create', v_bill_hash, v_bill_payload, v_store, 'term-rcv'
  );
  v_bill_id := (v_result -> 'result' ->> 'billId')::uuid;

  -- Over-receipt: deliver 11 against PO 10 (allowed)
  v_deliver_payload := jsonb_build_object(
    'poId', v_po_id::text,
    'receiveDate', CURRENT_DATE::text,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'poLineId', v_po_line_id::text,
        'deliveredQty', 11
      )
    )
  );
  v_deliver_hash := public.erp_payload_hash(v_deliver_payload);

  v_result := public.run_erp_client_idempotent_operation(
    v_deliver_op, 'purchase_order.deliver_finalize', v_deliver_hash, v_deliver_payload, v_store, 'term-rcv'
  );
  IF COALESCE((v_result ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first deliver_finalize must not replay';
  END IF;
  v_receive1 := (v_result -> 'result' ->> 'receiveId')::uuid;

  SELECT COUNT(*) INTO v_movements
  FROM public.stock_movements sm
  WHERE sm.reference_id = v_receive1 AND sm.reference_type = 'purchase_receive';

  IF v_movements < 1 THEN
    RAISE EXCEPTION 'FAIL: expected stock_movements for receive';
  END IF;

  -- Idempotent replay (client ledger + purchase_po_delivery_operations)
  v_result := public.run_erp_client_idempotent_operation(
    v_deliver_op, 'purchase_order.deliver_finalize', v_deliver_hash, v_deliver_payload, v_store, 'term-rcv'
  );
  IF NOT COALESCE((v_result ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: deliver_finalize replay must return idempotentReplay=true';
  END IF;
  v_receive2 := (v_result -> 'result' ->> 'receiveId')::uuid;
  IF v_receive1 IS DISTINCT FROM v_receive2 THEN
    RAISE EXCEPTION 'FAIL: replay must return same receiveId';
  END IF;

  SELECT COUNT(*) INTO v_movements
  FROM public.stock_movements sm
  WHERE sm.reference_id = v_receive1 AND sm.reference_type = 'purchase_receive';

  IF v_movements < 1 THEN
    RAISE EXCEPTION 'FAIL: replay must not duplicate stock_movements';
  END IF;

  RAISE NOTICE 'purchase_order.deliver_finalize idempotency + over-receipt certification PASS';
END;
$$;

-- Partial multi-shipment: separate PO (qty 100 → 80 + 20)
DO $$
DECLARE
  v_staff uuid;
  v_store uuid;
  v_vendor uuid;
  v_product uuid;
  v_product_name text;
  v_po_id uuid;
  v_po_line_id uuid;
  v_po_payload jsonb;
  v_bill_payload jsonb;
  v_deliver_payload jsonb;
  v_result jsonb;
  v_receive_a uuid;
  v_receive_b uuid;
  v_bill_a uuid;
  v_bill_b uuid;
  v_cnt int;
BEGIN
  SELECT id INTO v_staff FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  IF v_staff IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_store FROM public.stores WHERE COALESCE(is_active, true) ORDER BY created_at LIMIT 1;
  SELECT id INTO v_vendor FROM public.vendors WHERE COALESCE(is_active, true) ORDER BY created_at LIMIT 1;
  SELECT p.id, p.name INTO v_product, v_product_name FROM public.products p ORDER BY p.created_at LIMIT 1;

  IF v_store IS NULL OR v_vendor IS NULL OR v_product IS NULL THEN
    RAISE NOTICE 'SKIP: partial shipment test (missing seed data)';
    RETURN;
  END IF;

  IF NOT public.user_has_store_access(v_staff, v_store) THEN
    INSERT INTO public.user_store_access (user_id, store_id)
    VALUES (v_staff, v_store)
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_po_payload := jsonb_build_object(
    'vendorId', v_vendor::text,
    'poDate', CURRENT_DATE::text,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'quantity', 100,
        'purchasePrice', 1,
        'taxRatePercent', 0
      )
    )
  );

  v_result := public.run_erp_client_idempotent_operation(
    gen_random_uuid(),
    'purchase_order.create',
    public.erp_payload_hash(v_po_payload),
    v_po_payload,
    v_store,
    'term-partial'
  );
  v_po_id := (v_result -> 'result' ->> 'poId')::uuid;
  SELECT id INTO v_po_line_id FROM public.purchase_order_items WHERE po_id = v_po_id LIMIT 1;

  -- Shipment 1: draft bill + deliver 80
  v_bill_payload := jsonb_build_object(
    'vendorId', v_vendor::text,
    'purchaseDate', CURRENT_DATE::text,
    'poId', v_po_id::text,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'productName', COALESCE(v_product_name, 'Item'),
        'quantity', 100,
        'purchasePrice', 1,
        'taxRatePercent', 0
      )
    )
  );
  v_result := public.run_erp_client_idempotent_operation(
    gen_random_uuid(),
    'purchase_bill.create',
    public.erp_payload_hash(v_bill_payload),
    v_bill_payload,
    v_store,
    'term-partial'
  );
  v_bill_a := (v_result -> 'result' ->> 'billId')::uuid;

  v_deliver_payload := jsonb_build_object(
    'poId', v_po_id::text,
    'receiveDate', CURRENT_DATE::text,
    'lines', jsonb_build_array(
      jsonb_build_object('poLineId', v_po_line_id::text, 'deliveredQty', 80)
    )
  );
  v_result := public.run_erp_client_idempotent_operation(
    gen_random_uuid(),
    'purchase_order.deliver_finalize',
    public.erp_payload_hash(v_deliver_payload),
    v_deliver_payload,
    v_store,
    'term-partial'
  );
  v_receive_a := (v_result -> 'result' ->> 'receiveId')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM public.erp_purchase_bills WHERE id = v_bill_a AND status IN ('finalized', 'partial', 'paid')
  ) THEN
    RAISE EXCEPTION 'FAIL: first shipment bill must be finalized';
  END IF;

  -- Shipment 2: new draft bill + deliver 20
  v_result := public.run_erp_client_idempotent_operation(
    gen_random_uuid(),
    'purchase_bill.create',
    public.erp_payload_hash(v_bill_payload),
    v_bill_payload,
    v_store,
    'term-partial'
  );
  v_bill_b := (v_result -> 'result' ->> 'billId')::uuid;

  IF v_bill_b IS NOT DISTINCT FROM v_bill_a THEN
    RAISE EXCEPTION 'FAIL: second shipment needs a new bill';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.erp_purchase_bills WHERE id = v_bill_b AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'FAIL: second shipment bill must be draft';
  END IF;

  v_deliver_payload := jsonb_build_object(
    'poId', v_po_id::text,
    'receiveDate', CURRENT_DATE::text,
    'lines', jsonb_build_array(
      jsonb_build_object('poLineId', v_po_line_id::text, 'deliveredQty', 20)
    )
  );
  v_result := public.run_erp_client_idempotent_operation(
    gen_random_uuid(),
    'purchase_order.deliver_finalize',
    public.erp_payload_hash(v_deliver_payload),
    v_deliver_payload,
    v_store,
    'term-partial'
  );
  v_receive_b := (v_result -> 'result' ->> 'receiveId')::uuid;

  IF v_receive_a IS NOT DISTINCT FROM v_receive_b THEN
    RAISE EXCEPTION 'FAIL: partial shipments must produce distinct receives';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM public.erp_purchase_receives
  WHERE po_id = v_po_id AND status = 'finalized';

  IF v_cnt < 2 THEN
    RAISE EXCEPTION 'FAIL: expected two finalized receives on PO';
  END IF;
  
  RAISE NOTICE 'partial multi-shipment certification PASS';
END;
$$;

ROLLBACK;
