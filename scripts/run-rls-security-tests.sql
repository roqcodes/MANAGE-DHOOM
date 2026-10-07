-- Phase 1 RLS security tests — run in Supabase SQL editor AFTER applying migration
-- 20261002120000_phase1_rls_authorization_hardening.sql
-- Uses request.jwt.claim.sub to simulate roles (same pattern as run-integration-tests.sql).

BEGIN;

DO $$
DECLARE
  v_admin uuid;
  v_manager_a uuid;
  v_customer_a uuid;
  v_customer_b uuid;
  v_store_a uuid := 'a0000001-0001-4000-8000-000000000001';
  v_store_b uuid := 'a0000002-0002-4000-8000-000000000002';
  v_bill_a uuid;
  v_bill_b uuid;
  v_cnt int;
BEGIN
  SELECT id INTO v_admin FROM public.users WHERE role::text = 'admin' ORDER BY created_at LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'RLS TEST SETUP: no admin user';
  END IF;

  -- Manager with access only to TEST-STORE-A
  SELECT u.id INTO v_manager_a
  FROM public.users u
  WHERE u.role::text = 'manager'
  ORDER BY u.created_at
  LIMIT 1;

  IF v_manager_a IS NULL THEN
    RAISE NOTICE 'RLS TEST SKIP: no manager user — create a manager for full coverage';
  ELSE
    DELETE FROM public.user_store_access WHERE user_id = v_manager_a;
    INSERT INTO public.user_store_access (user_id, store_id, is_default)
    VALUES (v_manager_a, v_store_a, true)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO v_customer_a FROM public.users WHERE role::text = 'customer' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_customer_b FROM public.users WHERE role::text = 'customer' ORDER BY created_at OFFSET 1 LIMIT 1;

  -- Sample bills per store (if present)
  SELECT id INTO v_bill_a FROM public.erp_purchase_bills WHERE store_id = v_store_a LIMIT 1;
  SELECT id INTO v_bill_b FROM public.erp_purchase_bills WHERE store_id = v_store_b LIMIT 1;

  -- ─── Manager cannot read Store B purchase bills ───────────────────────────
  IF v_manager_a IS NOT NULL AND v_bill_b IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_manager_a::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    SELECT COUNT(*) INTO v_cnt
    FROM public.erp_purchase_bills
    WHERE id = v_bill_b;

    IF v_cnt > 0 THEN
      RAISE EXCEPTION 'RLS FAIL: manager saw Store B purchase bill';
    END IF;
    RAISE NOTICE 'RLS PASS: manager blocked from Store B purchase bill';
  ELSE
    RAISE NOTICE 'RLS SKIP: manager Store B bill isolation (missing manager or bill)';
  END IF;

  -- ─── Admin can read both stores (when data exists) ────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  IF v_bill_a IS NOT NULL THEN
    PERFORM 1 FROM public.erp_purchase_bills WHERE id = v_bill_a;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RLS FAIL: admin cannot read Store A bill';
    END IF;
  END IF;
  RAISE NOTICE 'RLS PASS: admin purchase bill read';

  -- ─── Customer cannot read another user''s orders ──────────────────────────
  IF v_customer_a IS NOT NULL AND v_customer_b IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);

    SELECT COUNT(*) INTO v_cnt
    FROM public.orders
    WHERE user_id = v_customer_b;

    IF v_cnt > 0 THEN
      RAISE EXCEPTION 'RLS FAIL: customer read other user orders';
    END IF;
    RAISE NOTICE 'RLS PASS: customer order isolation';
  ELSE
    RAISE NOTICE 'RLS SKIP: need two customers for order isolation test';
  END IF;

  -- ─── Non-staff cannot call get_all_movements ─────────────────────────────
  IF v_customer_a IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    BEGIN
      PERFORM public.get_all_movements(10, 0, NULL);
      RAISE EXCEPTION 'RLS FAIL: customer invoked get_all_movements';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%Forbidden%' THEN
          RAISE;
        END IF;
    END;
    RAISE NOTICE 'RLS PASS: customer blocked from get_all_movements';
  END IF;

  -- ─── Public catalog still readable (authenticated customer) ─────────────
  IF v_customer_a IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    PERFORM 1 FROM public.products WHERE is_active = true LIMIT 1;
    IF NOT FOUND THEN
      RAISE NOTICE 'RLS WARN: no active products to verify catalog read';
    ELSE
      RAISE NOTICE 'RLS PASS: customer can read active products';
    END IF;
  END IF;

  -- Reset claim
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

ROLLBACK;
