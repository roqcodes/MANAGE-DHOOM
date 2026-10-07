-- Phase 5 smoke: batch RPCs return rows (ROLLBACK).

BEGIN;

DO $$
DECLARE
  v_account uuid;
  v_variant uuid;
  v_user uuid;
  v_bal numeric;
  v_avail numeric;
BEGIN
  SELECT id INTO v_account FROM public.accounts LIMIT 1;
  IF v_account IS NOT NULL THEN
    SELECT balance INTO v_bal
    FROM public.get_account_balances(ARRAY[v_account])
    LIMIT 1;
    IF v_bal IS NULL THEN
      RAISE EXCEPTION 'TEST_FAIL: get_account_balances';
    END IF;
    RAISE NOTICE 'get_account_balances OK';
  ELSE
    RAISE NOTICE 'TEST_SKIP: no accounts';
  END IF;

  SELECT id INTO v_variant FROM public.product_variants LIMIT 1;
  IF v_variant IS NOT NULL THEN
    SELECT available INTO v_avail
    FROM public.get_variants_online_available(ARRAY[v_variant])
    LIMIT 1;
    IF v_avail IS NULL THEN
      RAISE EXCEPTION 'TEST_FAIL: get_variants_online_available batch';
    END IF;
    RAISE NOTICE 'get_variants_online_available batch OK';
  END IF;

  SELECT user_id INTO v_user FROM public.orders WHERE user_id IS NOT NULL LIMIT 1;
  IF v_user IS NOT NULL THEN
    PERFORM 1 FROM public.get_user_order_counts(ARRAY[v_user]);
    RAISE NOTICE 'get_user_order_counts OK';
  END IF;
END $$;

ROLLBACK;
