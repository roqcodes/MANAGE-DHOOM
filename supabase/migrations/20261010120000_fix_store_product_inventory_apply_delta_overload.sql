-- Resolve ambiguous store_product_inventory_apply_delta overloads.
-- Purchase bill finalize / stock apply was failing with:
--   function public.store_product_inventory_apply_delta(uuid, uuid, numeric, uuid) is not unique
-- Cause: 20261002240000 added p_allow_negative with a default but CREATE OR REPLACE
-- left the original 4-arg signature in place; 4-arg calls match both overloads.

BEGIN;

DROP FUNCTION IF EXISTS public.store_product_inventory_apply_delta(uuid, uuid, numeric, uuid);

CREATE OR REPLACE FUNCTION public.store_product_inventory_apply_delta(
  p_store_id uuid,
  p_product_id uuid,
  p_delta numeric,
  p_user_id uuid DEFAULT auth.uid(),
  p_allow_negative boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_new numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_store_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Store and product are required';
  END IF;

  SELECT stock INTO v_stock
  FROM public.store_product_inventory
  WHERE store_id = p_store_id AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_delta < 0 THEN
      IF NOT p_allow_negative THEN
        RAISE EXCEPTION 'Insufficient stock: no inventory for product % at store %', p_product_id, p_store_id;
      END IF;
      INSERT INTO public.store_product_inventory (store_id, product_id, stock, updated_at)
      VALUES (p_store_id, p_product_id, p_delta, now());
      RETURN p_delta;
    END IF;
    INSERT INTO public.store_product_inventory (store_id, product_id, stock, updated_at)
    VALUES (p_store_id, p_product_id, p_delta, now());
    RETURN p_delta;
  END IF;

  v_new := COALESCE(v_stock, 0) + p_delta;
  IF v_new < 0 AND NOT p_allow_negative THEN
    RAISE EXCEPTION 'Insufficient stock: product % at store % (available %, requested %)',
      p_product_id, p_store_id, COALESCE(v_stock, 0), ABS(p_delta);
  END IF;

  UPDATE public.store_product_inventory
  SET stock = v_new, updated_at = now()
  WHERE store_id = p_store_id AND product_id = p_product_id;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_product_inventory_apply_delta(
  uuid, uuid, numeric, uuid, boolean
) TO authenticated;

-- Stale purchase bill create overloads (same class of bug: param inserted mid-signature).
DROP FUNCTION IF EXISTS public.create_erp_purchase_bill(
  uuid,
  uuid,
  date,
  date,
  jsonb,
  jsonb,
  numeric,
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  uuid
);

DROP FUNCTION IF EXISTS public.create_erp_purchase_bill(
  uuid,
  uuid,
  date,
  date,
  jsonb,
  jsonb,
  numeric,
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  date,
  boolean,
  uuid
);

COMMIT;
