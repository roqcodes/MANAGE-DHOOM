-- ERP client operation idempotency certification (Phase 4).
-- Apply migration 20261003120000_erp_client_operations_idempotency.sql first.
-- Ends with ROLLBACK — no persistent changes.

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_other uuid;
  v_store uuid;
  v_op uuid := gen_random_uuid();
  v_payload jsonb := '{"b":2,"a":1}'::jsonb;
  v_hash text;
  v_r1 jsonb;
  v_r2 jsonb;
  v_nonce1 bigint;
  v_nonce2 bigint;
  v_cnt int;
BEGIN
  SELECT id INTO v_staff FROM public.users WHERE role::text IN ('admin', 'manager') LIMIT 1;
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no staff user';
  END IF;

  SELECT id INTO v_other
  FROM public.users
  WHERE role::text IN ('admin', 'manager') AND id <> v_staff
  LIMIT 1;

  SELECT id INTO v_store FROM public.stores WHERE COALESCE(is_active, true) ORDER BY created_at LIMIT 1;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'TEST_SKIP: no store';
  END IF;

  IF NOT public.user_has_store_access(v_staff, v_store) THEN
    INSERT INTO public.user_store_access (user_id, store_id)
    VALUES (v_staff, v_store)
    ON CONFLICT DO NOTHING;
  END IF;

  v_hash := public.erp_payload_hash(v_payload);

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_r1 := public.run_erp_client_idempotent_operation(
    v_op, 'test.certify', v_hash, v_payload, v_store, 'term-1'
  );
  IF COALESCE((v_r1 ->> 'idempotentReplay')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: first call must not be replay';
  END IF;
  v_nonce1 := (v_r1 -> 'result' ->> 'executionNonce')::bigint;

  v_r2 := public.run_erp_client_idempotent_operation(
    v_op, 'test.certify', v_hash, v_payload, v_store, 'term-1'
  );
  IF NOT COALESCE((v_r2 ->> 'idempotentReplay')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: second identical call must replay';
  END IF;
  v_nonce2 := (v_r2 -> 'result' ->> 'executionNonce')::bigint;
  IF v_nonce1 IS DISTINCT FROM v_nonce2 THEN
    RAISE EXCEPTION 'FAIL: replay must return same execution nonce';
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM public.erp_client_operations WHERE operation_id = v_op;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly one ledger row';
  END IF;

  BEGIN
    PERFORM public.run_erp_client_idempotent_operation(
      v_op, 'test.certify', public.erp_payload_hash('{"a":1}'::jsonb), '{"a":1}'::jsonb, v_store, 'term-1'
    );
    RAISE EXCEPTION 'FAIL: payload hash conflict must raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%ERP_CLIENT_PAYLOAD_HASH_CONFLICT%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.run_erp_client_idempotent_operation(
      v_op, 'other.type', v_hash, v_payload, v_store, 'term-1'
    );
    RAISE EXCEPTION 'FAIL: operation type conflict must raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%ERP_CLIENT_OPERATION_TYPE_CONFLICT%' THEN
        RAISE;
      END IF;
  END;

  IF v_other IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
    BEGIN
      PERFORM public.run_erp_client_idempotent_operation(
        v_op, 'test.certify', v_hash, v_payload, v_store, 'term-1'
      );
      RAISE EXCEPTION 'FAIL: different user must be rejected';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%ERP_CLIENT_USER_MISMATCH%' THEN
          RAISE;
        END IF;
    END;
  ELSE
    RAISE NOTICE 'SKIP: different-user test (need second staff user)';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

  BEGIN
    PERFORM public.run_erp_client_idempotent_operation(
      v_op, 'test.certify', v_hash, v_payload, gen_random_uuid(), 'term-1'
    );
    RAISE EXCEPTION 'FAIL: store mismatch must raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%ERP_CLIENT_STORE_MISMATCH%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.run_erp_client_idempotent_operation(
      gen_random_uuid(),
      'test.certify',
      public.erp_payload_hash('{"fail":true}'::jsonb),
      '{"fail":true}'::jsonb,
      v_store,
      'term-1'
    );
    RAISE EXCEPTION 'FAIL: business failure must roll back ledger row';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%ERP_CLIENT_CERTIFY_FAILURE%' THEN
        RAISE;
      END IF;
  END;

  SELECT COUNT(*) INTO v_cnt
  FROM public.erp_client_operations
  WHERE operation_type = 'test.certify' AND status = 'COMMITTED' AND operation_id = v_op;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL: failed op must not replace committed row';
  END IF;

  RAISE NOTICE 'ERP client operations Phase 4 certification PASS';
END;
$$;

ROLLBACK;
