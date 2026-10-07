  -- Integration test seed — run in Supabase SQL Editor (postgres role).
  -- Safe to re-run: uses existing default company; does not violate single-default constraints.

  BEGIN;

  DO $$
  DECLARE
    v_company_id uuid;
  BEGIN
    SELECT id INTO v_company_id
    FROM public.companies
    WHERE is_active = true
    ORDER BY is_default DESC NULLS LAST, created_at
    LIMIT 1;

    IF v_company_id IS NULL THEN
      INSERT INTO public.companies (name, is_default, is_active)
      VALUES ('Default Company', true, true)
      RETURNING id INTO v_company_id;
    END IF;

    UPDATE public.stores SET is_default = false WHERE is_default = true;

    INSERT INTO public.stores (id, company_id, name, code, is_active, is_default)
    VALUES
      ('a0000001-0001-4000-8000-000000000001', v_company_id, 'TEST-STORE-A', 'TSTA', true, true),
      ('a0000002-0002-4000-8000-000000000002', v_company_id, 'TEST-STORE-B', 'TSTB', true, false)
    ON CONFLICT (id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      name = EXCLUDED.name,
      code = EXCLUDED.code,
      is_active = true,
      is_default = EXCLUDED.is_default;
  END $$;

  UPDATE public.app_settings
  SET default_store_id = 'a0000001-0001-4000-8000-000000000001'
  WHERE id = 1;

  INSERT INTO public.user_store_access (user_id, store_id, is_default)
  SELECT u.id, s.id, (s.id = 'a0000001-0001-4000-8000-000000000001')
  FROM public.users u
  CROSS JOIN public.stores s
  WHERE u.role::text = 'admin'
    AND s.id IN (
      'a0000001-0001-4000-8000-000000000001',
      'a0000002-0002-4000-8000-000000000002'
    )
  ON CONFLICT (user_id, store_id) DO NOTHING;

  INSERT INTO public.store_inventory (store_id, variant_id, stock, reserved_stock, updated_at)
  VALUES
    ('a0000001-0001-4000-8000-000000000001', 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa', 10, 0, now()),
    ('a0000001-0001-4000-8000-000000000001', '15fb9312-e7cf-4d27-b830-f38b00d3137f', 5, 0, now()),
    ('a0000002-0002-4000-8000-000000000002', 'bfa4cbf5-9f95-4e57-9ff0-f44b74ce8aaa', 5, 0, now()),
    ('a0000002-0002-4000-8000-000000000002', '15fb9312-e7cf-4d27-b830-f38b00d3137f', 8, 0, now())
  ON CONFLICT (store_id, variant_id) DO UPDATE SET
    stock = EXCLUDED.stock,
    reserved_stock = 0,
    updated_at = now();

  SELECT public.reconcile_central_inventory_from_stores(NULL);

  COMMIT;

  -- Verify (run after commit if editor splits batches)
  SELECT s.name, si.variant_id, pv.name AS variant_name, si.stock, si.reserved_stock
  FROM public.store_inventory si
  JOIN public.stores s ON s.id = si.store_id
  JOIN public.product_variants pv ON pv.id = si.variant_id
  WHERE s.name LIKE 'TEST-STORE-%'
  ORDER BY s.name, pv.name;
