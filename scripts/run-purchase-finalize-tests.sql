-- Purchase deliver-finalize integrity checks (ROLLBACK at end).
-- Requires Phase 3 migration + sample PO with draft bill (or TEST_SKIP).

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_po_id uuid;
  v_bill_id uuid;
  v_line_id uuid;
  v_product_id uuid;
  v_key uuid := gen_random_uuid();
  v_result jsonb;
  v_receive_id uuid;
  v_movements integer;
BEGIN
  SELECT id INTO v_staff FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no staff user';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

  SELECT pb.po_id, pb.id, poi.id, COALESCE(poi.product_id, pv.product_id)
  INTO v_po_id, v_bill_id, v_line_id, v_product_id
  FROM public.erp_purchase_bills pb
  JOIN public.purchase_order_items poi ON poi.po_id = pb.po_id
  LEFT JOIN public.product_variants pv ON pv.id = poi.variant_id
  WHERE pb.status = 'draft'
    AND pb.po_id IS NOT NULL
    AND COALESCE(poi.product_id, pv.product_id) IS NOT NULL
  ORDER BY pb.created_at DESC
  LIMIT 1;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: need a PO with draft vendor invoice';
  END IF;

  v_result := public.submit_erp_po_delivery_and_finalize(
    v_po_id,
    jsonb_build_array(jsonb_build_object('po_line_id', v_line_id, 'delivered_qty', 1)),
    CURRENT_DATE,
    'Phase 3 test',
    v_staff,
    v_key
  );

  v_receive_id := (v_result ->> 'receive_id')::uuid;
  IF v_receive_id IS NULL THEN
    RAISE EXCEPTION 'TEST_FAIL: no receive_id';
  END IF;

  SELECT COUNT(*) INTO v_movements
  FROM public.stock_movements sm
  WHERE sm.reference_id = v_receive_id AND sm.reference_type = 'purchase_receive';

  IF v_movements < 1 THEN
    RAISE EXCEPTION 'TEST_FAIL: expected stock_movements on receive';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.erp_purchase_bills
    WHERE id = v_bill_id AND inventory_committed = true
  ) THEN
    RAISE EXCEPTION 'TEST_FAIL: PO-linked bill should not commit stock on bill';
  END IF;

  v_result := public.submit_erp_po_delivery_and_finalize(
    v_po_id,
    jsonb_build_array(jsonb_build_object('po_line_id', v_line_id, 'delivered_qty', 1)),
    CURRENT_DATE,
    'retry',
    v_staff,
    v_key
  );

  IF COALESCE((v_result ->> 'idempotent_replay')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST_FAIL: idempotent retry should replay';
  END IF;

  RAISE NOTICE 'Purchase finalize tests passed.';
END $$;

ROLLBACK;
