-- purchase_order.create / purchase_order.update idempotency (P13–P14).
-- Requires migration 20261004300000_erp_purchase_module_idempotent.sql
-- Ends with ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_store uuid;
  v_vendor uuid;
  v_product uuid;
  v_create_op uuid := gen_random_uuid();
  v_update_op uuid := gen_random_uuid();
  v_create_payload jsonb;
  v_update_payload jsonb;
  v_create_hash text;
  v_update_hash text;
  v_create_result jsonb;
  v_update_result jsonb;
  v_replay jsonb;
  v_po_id uuid;
  v_po1 uuid;
  v_po2 uuid;
  v_line_qty numeric;
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

  SELECT p.id INTO v_product
  FROM public.products p
  ORDER BY p.created_at
  LIMIT 1;

  IF v_product IS NULL THEN
    RAISE NOTICE 'SKIP: purchase_order tests (no product)';
    RETURN;
  END IF;

  IF NOT public.user_has_store_access(v_staff, v_store) THEN
    INSERT INTO public.user_store_access (user_id, store_id)
    VALUES (v_staff, v_store)
    ON CONFLICT DO NOTHING;
  END IF;

  v_create_payload := jsonb_build_object(
    'vendorId', v_vendor::text,
    'poDate', CURRENT_DATE::text,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'quantity', 5,
        'purchasePrice', 10,
        'taxRatePercent', 0
      )
    ),
    'discount', 0,
    'landedCosts', '[]'::jsonb
  );

  v_create_hash := public.erp_payload_hash(v_create_payload);

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- purchase_order.create: first commit
  v_create_result := public.run_erp_client_idempotent_operation(
    v_create_op, 'purchase_order.create', v_create_hash, v_create_payload, v_store, 'term-po'
  );
  IF COALESCE((v_create_result ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first purchase_order.create must not replay';
  END IF;
  v_po1 := (v_create_result -> 'result' ->> 'poId')::uuid;

  -- purchase_order.create: replay
  v_replay := public.run_erp_client_idempotent_operation(
    v_create_op, 'purchase_order.create', v_create_hash, v_create_payload, v_store, 'term-po'
  );
  IF NOT COALESCE((v_replay ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: purchase_order.create replay must set idempotentReplay=true';
  END IF;
  v_po2 := (v_replay -> 'result' ->> 'poId')::uuid;
  IF v_po1 IS DISTINCT FROM v_po2 THEN
    RAISE EXCEPTION 'FAIL: replay must return same poId';
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM public.purchase_orders WHERE id = v_po1;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly one purchase_orders row';
  END IF;

  -- payload hash conflict
  BEGIN
    PERFORM public.run_erp_client_idempotent_operation(
      v_create_op,
      'purchase_order.create',
      public.erp_payload_hash(jsonb_set(v_create_payload, '{discount}', '1')),
      jsonb_set(v_create_payload, '{discount}', '1'),
      v_store,
      'term-po'
    );
    RAISE EXCEPTION 'FAIL: payload hash conflict must raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%ERP_CLIENT_PAYLOAD_HASH_CONFLICT%' THEN
        RAISE;
      END IF;
  END;

  -- purchase_order.update
  v_po_id := v_po1;
  v_update_payload := jsonb_build_object(
    'poId', v_po_id::text,
    'vendorId', v_vendor::text,
    'poDate', CURRENT_DATE::text,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'productId', v_product::text,
        'quantity', 8,
        'purchasePrice', 12,
        'taxRatePercent', 0
      )
    ),
    'discount', 0,
    'landedCosts', '[]'::jsonb
  );
  v_update_hash := public.erp_payload_hash(v_update_payload);

  v_update_result := public.run_erp_client_idempotent_operation(
    v_update_op, 'purchase_order.update', v_update_hash, v_update_payload, v_store, 'term-po'
  );
  IF COALESCE((v_update_result ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first purchase_order.update must not replay';
  END IF;

  SELECT quantity INTO v_line_qty
  FROM public.purchase_order_items
  WHERE po_id = v_po_id AND product_id = v_product
  LIMIT 1;
  IF v_line_qty <> 8 THEN
    RAISE EXCEPTION 'FAIL: update must set line quantity to 8';
  END IF;

  v_replay := public.run_erp_client_idempotent_operation(
    v_update_op, 'purchase_order.update', v_update_hash, v_update_payload, v_store, 'term-po'
  );
  IF NOT COALESCE((v_replay ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: purchase_order.update replay must return idempotentReplay=true';
  END IF;

  SELECT quantity INTO v_line_qty
  FROM public.purchase_order_items
  WHERE po_id = v_po_id AND product_id = v_product
  LIMIT 1;
  IF v_line_qty <> 8 THEN
    RAISE EXCEPTION 'FAIL: replay must not apply update twice';
  END IF;

  RAISE NOTICE 'purchase_order.create / purchase_order.update idempotency certification PASS';
END;
$$;

ROLLBACK;
