-- Phase 4 smoke tests (ROLLBACK). Requires draft transfer or payable bills where noted.

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_transfer uuid;
  v_committed boolean;
BEGIN
  SELECT id INTO v_staff FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  IF v_staff IS NULL THEN
    RAISE NOTICE 'TEST_SKIP: no staff';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

  SELECT id, inventory_committed
  INTO v_transfer, v_committed
  FROM public.erp_store_transfers
  WHERE status IN ('draft', 'approved')
    AND inventory_committed = false
  LIMIT 1;

  IF v_transfer IS NOT NULL THEN
    PERFORM public.complete_erp_store_transfer(v_transfer, v_staff);
    PERFORM public.complete_erp_store_transfer(v_transfer, v_staff);
    SELECT inventory_committed INTO v_committed FROM public.erp_store_transfers WHERE id = v_transfer;
    IF NOT v_committed THEN
      RAISE EXCEPTION 'TEST_FAIL: transfer complete idempotency';
    END IF;
    RAISE NOTICE 'Transfer idempotent complete OK';
  ELSE
    RAISE NOTICE 'TEST_SKIP: no open store transfer';
  END IF;
END $$;

ROLLBACK;
