-- Resolve ambiguous log_stock_movement overloads.
-- Order ship was failing with:
--   function public.log_stock_movement(uuid, numeric, unknown, uuid, text, text, uuid, unknown, unknown) is not unique
-- Cause: 9-arg (phase4) and 10-arg (purchase bill fix with p_user_id) both match the same calls.

BEGIN;

DROP FUNCTION IF EXISTS public.log_stock_movement(
  uuid, numeric, text, uuid, text, text, uuid, uuid, numeric
);

CREATE OR REPLACE FUNCTION public.log_stock_movement(
  p_variant_id uuid,
  p_quantity numeric,
  p_type text,
  p_reference_id uuid DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_transfer_store_id uuid DEFAULT NULL,
  p_transaction_price numeric DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
  v_user_id uuid;
  v_balance numeric;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_store_id IS NOT NULL THEN
    SELECT stock INTO v_balance
    FROM public.store_inventory
    WHERE store_id = p_store_id AND variant_id = p_variant_id;
  END IF;

  INSERT INTO public.stock_movements (
    variant_id, quantity, type, reference_id, reference_type, reason, user_id,
    store_id, transfer_store_id, transaction_price, balance_after
  )
  VALUES (
    p_variant_id, p_quantity, p_type, p_reference_id, p_reference_type, p_reason, v_user_id,
    p_store_id, p_transfer_store_id, p_transaction_price, v_balance
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

-- Ship path: pass actor explicitly (SECURITY DEFINER chain).
CREATE OR REPLACE FUNCTION public.store_inventory_ship_reserved(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_reference_id uuid,
  p_reference_type text,
  p_reason text DEFAULT 'Order shipped',
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_reserved numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Ship quantity must be positive';
  END IF;

  SELECT stock, reserved_stock INTO v_stock, v_reserved
  FROM public.store_inventory
  WHERE store_id = p_store_id AND variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No inventory for variant % at store %', p_variant_id, p_store_id;
  END IF;

  IF COALESCE(v_reserved, 0) < p_quantity THEN
    RAISE EXCEPTION 'Reserved quantity insufficient for ship';
  END IF;

  IF COALESCE(v_stock, 0) < p_quantity THEN
    RAISE EXCEPTION 'Physical stock insufficient for ship';
  END IF;

  UPDATE public.store_inventory
  SET
    reserved_stock = reserved_stock - p_quantity,
    stock = stock - p_quantity,
    updated_at = now()
  WHERE store_id = p_store_id AND variant_id = p_variant_id;

  PERFORM public.log_stock_movement(
    p_variant_id, -p_quantity, 'sale', p_reference_id, p_reference_type,
    p_reason, p_store_id, NULL, NULL, p_user_id
  );

  PERFORM public.reconcile_central_inventory_from_stores(p_variant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_apply_order_stock(
  p_order_id uuid,
  p_multiplier integer DEFAULT -1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_is_staff boolean;
  r record;
  v_delta numeric;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order id is required';
  END IF;

  IF p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid stock multiplier';
  END IF;

  SELECT user_id, inventory_committed, store_id, source, inventory_reserved
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF COALESCE(v_order.source, 'online') = 'online' THEN
    IF p_multiplier = -1 THEN
      PERFORM public.setup_order_fulfillments_and_reserve(p_order_id);
    ELSE
      PERFORM public.release_order_inventory_reservations(p_order_id);
    END IF;
    RETURN;
  END IF;

  IF p_multiplier = -1 AND v_order.inventory_committed THEN
    RETURN;
  END IF;

  IF p_multiplier = 1 AND NOT v_order.inventory_committed THEN
    RETURN;
  END IF;

  IF v_order.store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required for POS/ERP stock movement';
  END IF;

  v_is_staff := public.is_staff_user(v_uid);
  IF NOT v_is_staff AND (v_uid IS NULL OR v_uid <> v_order.user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(v_order.store_id, v_uid);

  FOR r IN
    SELECT oi.variant_id, SUM(oi.quantity)::numeric AS qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
    GROUP BY oi.variant_id
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    PERFORM public.store_inventory_apply_delta(
      v_order.store_id, r.variant_id, v_delta, true, v_uid
    );

    PERFORM public.log_stock_movement(
      r.variant_id, v_delta,
      CASE WHEN p_multiplier = -1 THEN 'sale' ELSE 'return' END,
      p_order_id, 'order',
      CASE WHEN p_multiplier = -1 THEN 'POS/ERP order sale' ELSE 'POS/ERP order restore' END,
      v_order.store_id, NULL, NULL, v_uid
    );
  END LOOP;

  UPDATE public.orders
  SET inventory_committed = (p_multiplier = -1)
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_stock_movement(
  uuid, numeric, text, uuid, text, text, uuid, uuid, numeric, uuid
) TO authenticated;

COMMIT;
