-- purchase_bill.create / update / finalize / cancel idempotency (P16–P19).
-- Requires migration 20261004300000_erp_purchase_module_idempotent.sql
-- Ends with ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_store uuid;
  v_vendor uuid;
  v_product uuid;
  v_product_name text;
  v_create_op uuid := gen_random_uuid();
  v_update_op uuid := gen_random_uuid();
  v_finalize_op uuid := gen_random_uuid();
  v_cancel_op uuid := gen_random_uuid();
  v_create_payload jsonb;
  v_update_payload jsonb;
  v_finalize_payload jsonb;
  v_cancel_payload jsonb;
  v_hash text;
  v_result jsonb;
  v_replay jsonb;
  v_bill1 uuid;
  v_bill2 uuid;
  v_bill_draft uuid;
  v_line_total numeric;
  v_cnt int;
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
    RAISE NOTICE 'SKIP: purchase_bill tests (no product)';
    RETURN;
  END IF;

  IF NOT public.user_has_store_access(v_staff, v_store) THEN
    INSERT INTO public.user_store_access (user_id, store_id)
    VALUES (v_staff, v_store)
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- purchase_bill.create (standalone draft)
  v_create_payload := jsonb_build_object(
    'vendorId', v_vendor::text,
    'purchaseDate', CURRENT_DATE::text,
    'physicalReceiptOnBill', false,
    'finalize', false,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'productName', COALESCE(v_product_name, 'Item'),
        'quantity', 2,
        'purchasePrice', 15,
        'taxRatePercent', 0
      )
    ),
    'discount', 0
  );
  v_hash := public.erp_payload_hash(v_create_payload);

  v_result := public.run_erp_client_idempotent_operation(
    v_create_op, 'purchase_bill.create', v_hash, v_create_payload, v_store, 'term-pb'
  );
  IF COALESCE((v_result ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first purchase_bill.create must not replay';
  END IF;
  v_bill1 := (v_result -> 'result' ->> 'billId')::uuid;

  v_replay := public.run_erp_client_idempotent_operation(
    v_create_op, 'purchase_bill.create', v_hash, v_create_payload, v_store, 'term-pb'
  );
  IF NOT COALESCE((v_replay ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: purchase_bill.create replay must return idempotentReplay=true';
  END IF;
  v_bill2 := (v_replay -> 'result' ->> 'billId')::uuid;
  IF v_bill1 IS DISTINCT FROM v_bill2 THEN
    RAISE EXCEPTION 'FAIL: replay must return same billId';
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM public.erp_purchase_bills WHERE id = v_bill1;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly one bill row';
  END IF;

  -- purchase_bill.update
  v_update_payload := jsonb_build_object(
    'billId', v_bill1::text,
    'vendorId', v_vendor::text,
    'purchaseDate', CURRENT_DATE::text,
    'physicalReceiptOnBill', false,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'productName', COALESCE(v_product_name, 'Item'),
        'quantity', 3,
        'purchasePrice', 15,
        'taxRatePercent', 0
      )
    ),
    'discount', 0
  );
  v_hash := public.erp_payload_hash(v_update_payload);

  v_result := public.run_erp_client_idempotent_operation(
    v_update_op, 'purchase_bill.update', v_hash, v_update_payload, v_store, 'term-pb'
  );
  IF COALESCE((v_result ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first purchase_bill.update must not replay';
  END IF;

  SELECT quantity INTO v_line_total
  FROM public.erp_purchase_bill_lines
  WHERE purchase_bill_id = v_bill1
  LIMIT 1;
  IF v_line_total <> 3 THEN
    RAISE EXCEPTION 'FAIL: update must set quantity to 3';
  END IF;

  v_replay := public.run_erp_client_idempotent_operation(
    v_update_op, 'purchase_bill.update', v_hash, v_update_payload, v_store, 'term-pb'
  );
  IF NOT COALESCE((v_replay ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: purchase_bill.update replay must return idempotentReplay=true';
  END IF;

  -- Finalized bill cannot be updated via normal update
  v_finalize_payload := jsonb_build_object('billId', v_bill1::text);
  v_hash := public.erp_payload_hash(v_finalize_payload);
  v_result := public.run_erp_client_idempotent_operation(
    v_finalize_op, 'purchase_bill.finalize', v_hash, v_finalize_payload, v_store, 'term-pb'
  );
  IF COALESCE((v_result ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first purchase_bill.finalize must not replay';
  END IF;

  v_replay := public.run_erp_client_idempotent_operation(
    v_finalize_op, 'purchase_bill.finalize', v_hash, v_finalize_payload, v_store, 'term-pb'
  );
  IF NOT COALESCE((v_replay ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: purchase_bill.finalize replay must return idempotentReplay=true';
  END IF;

  BEGIN
    PERFORM public.run_erp_client_idempotent_operation(
      gen_random_uuid(),
      'purchase_bill.update',
      public.erp_payload_hash(v_update_payload),
      v_update_payload,
      v_store,
      'term-pb'
    );
    RAISE EXCEPTION 'FAIL: update on finalized bill must raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Only draft purchase bills can be edited%'
         AND SQLERRM NOT LIKE '%22023%' THEN
        RAISE;
      END IF;
  END;

  -- purchase_bill.cancel on a new draft
  v_create_payload := jsonb_build_object(
    'vendorId', v_vendor::text,
    'purchaseDate', CURRENT_DATE::text,
    'physicalReceiptOnBill', false,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'productName', COALESCE(v_product_name, 'Item'),
        'quantity', 1,
        'purchasePrice', 5,
        'taxRatePercent', 0
      )
    )
  );
  v_result := public.run_erp_client_idempotent_operation(
    gen_random_uuid(),
    'purchase_bill.create',
    public.erp_payload_hash(v_create_payload),
    v_create_payload,
    v_store,
    'term-pb'
  );
  v_bill_draft := (v_result -> 'result' ->> 'billId')::uuid;

  v_cancel_payload := jsonb_build_object('billId', v_bill_draft::text);
  v_hash := public.erp_payload_hash(v_cancel_payload);

  v_result := public.run_erp_client_idempotent_operation(
    v_cancel_op, 'purchase_bill.cancel', v_hash, v_cancel_payload, v_store, 'term-pb'
  );
  IF COALESCE((v_result ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first purchase_bill.cancel must not replay';
  END IF;

  v_replay := public.run_erp_client_idempotent_operation(
    v_cancel_op, 'purchase_bill.cancel', v_hash, v_cancel_payload, v_store, 'term-pb'
  );
  IF NOT COALESCE((v_replay ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: purchase_bill.cancel replay must return idempotentReplay=true';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM public.erp_purchase_bills
  WHERE id = v_bill_draft AND status = 'cancelled';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL: cancel must set bill status to cancelled';
  END IF;

  RAISE NOTICE 'purchase_bill create/update/finalize/cancel idempotency certification PASS';
END;
$$;

ROLLBACK;
