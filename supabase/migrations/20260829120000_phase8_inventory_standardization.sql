-- Phase 8: Inventory standardization
-- store_inventory = sole physical authority. inventory = derived aggregate cache only.
-- Online orders reserve stock; physical deduct on ship. POS/ERP deduct immediately.

BEGIN;

-- ─── 1. Reservations on store inventory ─────────────────────────────────────

ALTER TABLE public.store_inventory
  ADD COLUMN IF NOT EXISTS reserved_stock numeric NOT NULL DEFAULT 0;

ALTER TABLE public.store_inventory
  ADD CONSTRAINT store_inventory_reserved_non_negative CHECK (reserved_stock >= 0);

ALTER TABLE public.store_inventory
  ADD CONSTRAINT store_inventory_reserved_lte_stock CHECK (reserved_stock <= stock);

-- ─── 2. Order fulfillment partitions (multi-store online) ─────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS inventory_reserved boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_status_check
  CHECK (fulfillment_status IN (
    'none', 'pending_assignment', 'reserved', 'multi_shipment',
    'partially_shipped', 'shipped', 'cancelled'
  ));

CREATE TABLE IF NOT EXISTS public.order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_assignment',
  shipment_number text,
  reserved_at timestamptz,
  shipped_at timestamptz,
  inventory_committed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_fulfillments_status_check CHECK (status IN (
    'pending_assignment', 'reserved', 'processing', 'shipped', 'cancelled'
  ))
);

CREATE INDEX IF NOT EXISTS order_fulfillments_order_id_idx
  ON public.order_fulfillments (order_id);

CREATE INDEX IF NOT EXISTS order_fulfillments_store_id_idx
  ON public.order_fulfillments (store_id);

CREATE TABLE IF NOT EXISTS public.order_fulfillment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES public.order_fulfillments (id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items (id) ON DELETE SET NULL,
  variant_id uuid NOT NULL REFERENCES public.product_variants (id) ON DELETE RESTRICT,
  quantity numeric NOT NULL,
  reserved_quantity numeric NOT NULL DEFAULT 0,
  shipped_quantity numeric NOT NULL DEFAULT 0,
  CONSTRAINT order_fulfillment_items_qty_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS order_fulfillment_items_fulfillment_id_idx
  ON public.order_fulfillment_items (fulfillment_id);

-- ─── 3. Helpers ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.store_inventory_available(
  p_store_id uuid,
  p_variant_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(si.stock, 0) - COALESCE(si.reserved_stock, 0)
  FROM public.store_inventory si
  WHERE si.store_id = p_store_id AND si.variant_id = p_variant_id;
$$;

CREATE OR REPLACE FUNCTION public.get_default_store_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT default_store_id FROM public.app_settings WHERE id = 1),
    (SELECT id FROM public.stores WHERE is_active = true ORDER BY created_at LIMIT 1)
  );
$$;

-- ─── 4. Reservation RPCs ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.store_inventory_reserve(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
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
  v_available numeric;
BEGIN
  IF p_store_id IS NULL OR p_variant_id IS NULL THEN
    RAISE EXCEPTION 'Store and variant are required';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Reserve quantity must be positive';
  END IF;

  SELECT stock, reserved_stock INTO v_stock, v_reserved
  FROM public.store_inventory
  WHERE store_id = p_store_id AND variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No inventory for variant % at store %', p_variant_id, p_store_id;
  END IF;

  v_available := COALESCE(v_stock, 0) - COALESCE(v_reserved, 0);
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient available stock: variant % at store % (available %, requested %)',
      p_variant_id, p_store_id, v_available, p_quantity;
  END IF;

  UPDATE public.store_inventory
  SET reserved_stock = reserved_stock + p_quantity, updated_at = now()
  WHERE store_id = p_store_id AND variant_id = p_variant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_inventory_release_reservation(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.store_inventory
  SET reserved_stock = GREATEST(0, reserved_stock - p_quantity), updated_at = now()
  WHERE store_id = p_store_id AND variant_id = p_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No inventory row to release reservation';
  END IF;
END;
$$;

-- ─── 5. Physical delta (strict; respects reserved on outbound) ───────────────

CREATE OR REPLACE FUNCTION public.store_inventory_apply_delta(
  p_store_id uuid,
  p_variant_id uuid,
  p_delta numeric,
  p_update_central boolean DEFAULT true,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_reserved numeric;
  v_available numeric;
  v_new_store numeric;
  v_central numeric;
  v_new_central numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  SELECT stock, reserved_stock INTO v_stock, v_reserved
  FROM public.store_inventory
  WHERE store_id = p_store_id AND variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_delta < 0 THEN
      RAISE EXCEPTION 'Insufficient stock: no inventory for variant % at store %', p_variant_id, p_store_id;
    END IF;
    INSERT INTO public.store_inventory (store_id, variant_id, stock, reserved_stock, updated_at)
    VALUES (p_store_id, p_variant_id, p_delta, 0, now());
    v_new_store := p_delta;
  ELSE
    IF p_delta < 0 THEN
      v_available := COALESCE(v_stock, 0) - COALESCE(v_reserved, 0);
      IF v_available + p_delta < 0 THEN
        RAISE EXCEPTION 'Insufficient available stock: variant % at store % (available %, requested %)',
          p_variant_id, p_store_id, v_available, ABS(p_delta);
      END IF;
    END IF;

    v_new_store := COALESCE(v_stock, 0) + p_delta;
    IF v_new_store < 0 THEN
      RAISE EXCEPTION 'Insufficient stock: variant % at store %', p_variant_id, p_store_id;
    END IF;

    UPDATE public.store_inventory
    SET stock = v_new_store, updated_at = now()
    WHERE store_id = p_store_id AND variant_id = p_variant_id;
  END IF;

  IF p_update_central THEN
    PERFORM public.reconcile_central_inventory_from_stores(p_variant_id);
  END IF;

  RETURN v_new_store;
END;
$$;

-- Ship: release reservation + physical deduct + movement
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

-- Staff opening stock set (replaces direct upserts)
CREATE OR REPLACE FUNCTION public.set_store_inventory_stock(
  p_store_id uuid,
  p_variant_id uuid,
  p_stock numeric,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_stock < 0 THEN
    RAISE EXCEPTION 'Stock cannot be negative';
  END IF;

  INSERT INTO public.store_inventory (store_id, variant_id, stock, reserved_stock, updated_at)
  VALUES (p_store_id, p_variant_id, p_stock, 0, now())
  ON CONFLICT (store_id, variant_id)
  DO UPDATE SET stock = EXCLUDED.stock, updated_at = now()
  WHERE public.store_inventory.reserved_stock <= EXCLUDED.stock;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot set stock below reserved quantity';
  END IF;

  PERFORM public.reconcile_central_inventory_from_stores(p_variant_id);
END;
$$;

-- ─── 6. Online fulfillment setup + reserve ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.setup_order_fulfillments_and_reserve(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_default_store uuid;
  v_line record;
  v_store_id uuid;
  v_fulfillment_id uuid;
  v_candidates uuid[];
  v_can_whole_order uuid[];
  v_best_store uuid;
  v_qty numeric;
  v_fulfillment_map jsonb := '{}'::jsonb;
  v_fid_text text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, user_id, source, inventory_reserved, inventory_committed, status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.user_id <> v_uid AND NOT public.is_staff_user(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_order.inventory_committed THEN
    RETURN;
  END IF;

  IF v_order.inventory_reserved THEN
  PERFORM public.release_order_inventory_reservations(p_order_id);
  END IF;

  v_default_store := public.get_default_store_id();

  -- Stores that can fulfill the entire order alone
  SELECT array_agg(s.id)
  INTO v_can_whole_order
  FROM public.stores s
  WHERE s.is_active = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.variant_id IS NOT NULL
        AND COALESCE(public.store_inventory_available(s.id, oi.variant_id), 0) < oi.quantity
    );

  IF v_can_whole_order IS NOT NULL AND array_length(v_can_whole_order, 1) > 0 THEN
    IF v_default_store IS NOT NULL AND v_default_store = ANY(v_can_whole_order) THEN
      v_best_store := v_default_store;
    ELSIF array_length(v_can_whole_order, 1) = 1 THEN
      v_best_store := v_can_whole_order[1];
    ELSE
      UPDATE public.orders
      SET fulfillment_status = 'pending_assignment', store_id = NULL
      WHERE id = p_order_id;

      INSERT INTO public.order_fulfillments (order_id, store_id, status)
      VALUES (p_order_id, NULL, 'pending_assignment');

      RETURN;
    END IF;

    v_fulfillment_id := gen_random_uuid();
    INSERT INTO public.order_fulfillments (id, order_id, store_id, status, reserved_at)
    VALUES (v_fulfillment_id, p_order_id, v_best_store, 'reserved', now());

    FOR v_line IN
      SELECT oi.id AS order_item_id, oi.variant_id, oi.quantity::numeric AS qty
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
    LOOP
      INSERT INTO public.order_fulfillment_items (
        fulfillment_id, order_item_id, variant_id, quantity, reserved_quantity
      )
      VALUES (v_fulfillment_id, v_line.order_item_id, v_line.variant_id, v_line.qty, v_line.qty);

      PERFORM public.store_inventory_reserve(
        v_best_store, v_line.variant_id, v_line.qty, 'order', p_order_id, v_uid
      );
    END LOOP;

    UPDATE public.orders
    SET store_id = v_best_store, fulfillment_status = 'reserved', inventory_reserved = true
    WHERE id = p_order_id;

    RETURN;
  END IF;

  -- Multi-store split: assign each line to best store with stock (prefer default)
  FOR v_line IN
    SELECT oi.id AS order_item_id, oi.variant_id, oi.quantity::numeric AS qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
  LOOP
    SELECT s.id INTO v_store_id
    FROM public.stores s
    WHERE s.is_active = true
      AND COALESCE(public.store_inventory_available(s.id, v_line.variant_id), 0) >= v_line.qty
    ORDER BY CASE WHEN s.id = v_default_store THEN 0 ELSE 1 END,
             public.store_inventory_available(s.id, v_line.variant_id) DESC
    LIMIT 1;

    IF v_store_id IS NULL THEN
      RAISE EXCEPTION 'Insufficient stock for variant %', v_line.variant_id;
    END IF;

    v_fid_text := v_fulfillment_map ->> v_store_id::text;
    IF v_fid_text IS NULL THEN
      v_fulfillment_id := gen_random_uuid();
      INSERT INTO public.order_fulfillments (id, order_id, store_id, status, reserved_at)
      VALUES (v_fulfillment_id, p_order_id, v_store_id, 'reserved', now());
      v_fulfillment_map := v_fulfillment_map || jsonb_build_object(v_store_id::text, v_fulfillment_id::text);
    ELSE
      v_fulfillment_id := v_fid_text::uuid;
    END IF;

    INSERT INTO public.order_fulfillment_items (
      fulfillment_id, order_item_id, variant_id, quantity, reserved_quantity
    )
    VALUES (v_fulfillment_id, v_line.order_item_id, v_line.variant_id, v_line.qty, v_line.qty);

    PERFORM public.store_inventory_reserve(
      v_store_id, v_line.variant_id, v_line.qty, 'order', p_order_id, v_uid
    );
  END LOOP;

  UPDATE public.orders
  SET fulfillment_status = 'multi_shipment', inventory_reserved = true
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_inventory_reservations(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_uid uuid := auth.uid();
  v_order record;
BEGIN
  SELECT user_id, inventory_reserved, inventory_committed INTO v_order
  FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_uid IS NOT NULL AND v_order.user_id <> v_uid AND NOT public.is_staff_user(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT v_order.inventory_reserved THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT ofi.variant_id, ofi.reserved_quantity - ofi.shipped_quantity AS qty,
           of.store_id
    FROM public.order_fulfillment_items ofi
    JOIN public.order_fulfillments of ON of.id = ofi.fulfillment_id
    WHERE of.order_id = p_order_id
      AND of.store_id IS NOT NULL
      AND ofi.reserved_quantity > ofi.shipped_quantity
  LOOP
    PERFORM public.store_inventory_release_reservation(r.store_id, r.variant_id, r.qty);
  END LOOP;

  UPDATE public.order_fulfillments
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id AND status NOT IN ('shipped', 'cancelled');

  UPDATE public.orders
  SET inventory_reserved = false, fulfillment_status = 'cancelled'
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_order_fulfillment_store(
  p_order_id uuid,
  p_store_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fulfillment_id uuid;
  v_line record;
BEGIN
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  PERFORM public.require_store_access(p_store_id, p_actor);

  DELETE FROM public.order_fulfillment_items
  WHERE fulfillment_id IN (
    SELECT id FROM public.order_fulfillments WHERE order_id = p_order_id
  );
  DELETE FROM public.order_fulfillments WHERE order_id = p_order_id;

  v_fulfillment_id := gen_random_uuid();
  INSERT INTO public.order_fulfillments (id, order_id, store_id, status, reserved_at)
  VALUES (v_fulfillment_id, p_order_id, p_store_id, 'reserved', now());

  FOR v_line IN
    SELECT oi.id AS order_item_id, oi.variant_id, oi.quantity::numeric AS qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
  LOOP
    IF COALESCE(public.store_inventory_available(p_store_id, v_line.variant_id), 0) < v_line.qty THEN
      RAISE EXCEPTION 'Insufficient stock at assigned store for variant %', v_line.variant_id;
    END IF;

    INSERT INTO public.order_fulfillment_items (
      fulfillment_id, order_item_id, variant_id, quantity, reserved_quantity
    )
    VALUES (v_fulfillment_id, v_line.order_item_id, v_line.variant_id, v_line.qty, v_line.qty);

    PERFORM public.store_inventory_reserve(
      p_store_id, v_line.variant_id, v_line.qty, 'order', p_order_id, p_actor
    );
  END LOOP;

  UPDATE public.orders
  SET store_id = p_store_id, fulfillment_status = 'reserved', inventory_reserved = true
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ship_order_fulfillment(
  p_fulfillment_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fulfillment record;
  v_line record;
  v_order_id uuid;
  v_all_shipped boolean;
BEGIN
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id, order_id, store_id, status, inventory_committed
  INTO v_fulfillment
  FROM public.order_fulfillments
  WHERE id = p_fulfillment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fulfillment not found';
  END IF;

  IF v_fulfillment.inventory_committed THEN
    RETURN;
  END IF;

  IF v_fulfillment.store_id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment has no assigned store';
  END IF;

  PERFORM public.require_store_access(v_fulfillment.store_id, p_actor);

  FOR v_line IN
    SELECT variant_id, quantity, reserved_quantity, shipped_quantity
    FROM public.order_fulfillment_items
    WHERE fulfillment_id = p_fulfillment_id
  LOOP
    IF v_line.quantity > v_line.shipped_quantity THEN
      PERFORM public.store_inventory_ship_reserved(
        v_fulfillment.store_id,
        v_line.variant_id,
        v_line.quantity - v_line.shipped_quantity,
        p_fulfillment_id,
        'order_fulfillment',
        'Online order shipped',
        p_actor
      );

      UPDATE public.order_fulfillment_items
      SET shipped_quantity = quantity
      WHERE fulfillment_id = p_fulfillment_id AND variant_id = v_line.variant_id;
    END IF;
  END LOOP;

  UPDATE public.order_fulfillments
  SET status = 'shipped', inventory_committed = true, shipped_at = now(), updated_at = now()
  WHERE id = p_fulfillment_id;

  v_order_id := v_fulfillment.order_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_fulfillments
    WHERE order_id = v_order_id AND inventory_committed = false AND status <> 'cancelled'
  )
  INTO v_all_shipped;

  IF v_all_shipped THEN
    UPDATE public.orders
    SET inventory_committed = true, inventory_reserved = false,
        fulfillment_status = 'shipped', status = 'shipped'
    WHERE id = v_order_id;
  ELSE
    UPDATE public.orders
    SET fulfillment_status = 'partially_shipped'
    WHERE id = v_order_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ship_all_order_fulfillments(
  p_order_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR r IN
    SELECT id FROM public.order_fulfillments
    WHERE order_id = p_order_id AND inventory_committed = false AND status <> 'cancelled'
  LOOP
    PERFORM public.ship_order_fulfillment(r.id, p_actor);
  END LOOP;
END;
$$;

-- ─── 7. POS / ERP immediate stock (requires store_id) ───────────────────────

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

  -- Online orders use reservation flow, not immediate physical apply
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

-- ─── 8. Remove unsafe legacy central path ─────────────────────────────────

DROP FUNCTION IF EXISTS public.inventory_apply_invoice_stock_legacy_variant(uuid, numeric);

-- ─── 9. place_customer_order uses reserve flow ──────────────────────────────

CREATE OR REPLACE FUNCTION public.place_customer_order(
  p_address_id uuid,
  p_items jsonb,
  p_merchant_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_grand_total numeric := 0;
  v_balance numeric;
  v_note text;
  v_order jsonb;
  v_capture_payments boolean := true;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_address_id IS NULL THEN
    RAISE EXCEPTION 'Delivery address is required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.addresses WHERE id = p_address_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Selected delivery address was not found';
  END IF;

  SELECT COALESCE(capture_payments, true) INTO v_capture_payments
  FROM public.app_settings WHERE id = 1;

  v_note := nullif(trim(coalesce(p_merchant_note, '')), '');

  SELECT COALESCE(sum((elem->>'final_price')::numeric * (elem->>'quantity')::numeric), 0)
  INTO v_grand_total
  FROM jsonb_array_elements(p_items) AS elem;

  IF v_grand_total IS NULL OR v_grand_total <= 0 THEN
    RAISE EXCEPTION 'Invalid order total';
  END IF;

  IF v_capture_payments THEN
    SELECT balance INTO v_balance FROM public.wallet WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
    IF v_balance < v_grand_total THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  END IF;

  INSERT INTO public.orders (
    user_id, address_id, total_amount, status, payment_status,
    merchant_note, inventory_committed, inventory_reserved, source, fulfillment_status
  )
  VALUES (
    v_uid, p_address_id, round(v_grand_total, 2), 'pending',
    CASE WHEN v_capture_payments THEN 'pending' ELSE 'not_required' END,
    v_note, false, false, 'online', 'none'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, variant_id, quantity, price, vendor_id,
    base_price, final_price, margin_amount, product_name
  )
  SELECT
    v_order_id,
    (elem->>'variant_id')::uuid,
    sum((elem->>'quantity')::int)::int,
    max((elem->>'final_price')::numeric),
    nullif(max(elem->>'vendor_id'), '')::uuid,
    max((elem->>'base_price')::numeric),
    max((elem->>'final_price')::numeric),
    max((elem->>'margin_amount')::numeric),
    max(elem->>'product_name')
  FROM jsonb_array_elements(p_items) AS elem
  GROUP BY (elem->>'variant_id')::uuid;

  PERFORM public.setup_order_fulfillments_and_reserve(v_order_id);

  IF v_capture_payments THEN
    PERFORM public.wallet_debit(v_grand_total, 'Order ' || v_order_id::text);
    UPDATE public.orders SET payment_status = 'paid' WHERE id = v_order_id;
  END IF;

  SELECT to_jsonb(o) INTO v_order FROM public.orders o WHERE o.id = v_order_id;
  RETURN v_order;
END;
$$;

-- ─── 10. customer_edit_order: release + re-reserve ────────────────────────

CREATE OR REPLACE FUNCTION public.customer_edit_order(p_order_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_old_total numeric;
  v_new_total numeric := 0;
  v_diff numeric;
  v_balance numeric;
  v_committed boolean;
  v_capture_payments boolean := true;
  v_was_paid boolean;
  r_old record;
  v_flag text;
  v_order_json jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Order id is required'; END IF;

  SELECT o.*, o.inventory_committed AS inv_committed
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.user_id <> v_uid THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_order.status IN ('shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Order cannot be edited in status %', v_order.status;
  END IF;

  v_committed := COALESCE(v_order.inventory_committed, false);

  IF v_committed THEN
    RAISE EXCEPTION 'Cannot edit order after shipment';
  END IF;

  PERFORM public.release_order_inventory_reservations(p_order_id);

  CREATE TEMP TABLE _old_order_items ON COMMIT DROP AS
  SELECT variant_id, quantity::int AS quantity
  FROM public.order_items
  WHERE order_id = p_order_id AND variant_id IS NOT NULL;

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  FOR r_old IN
    SELECT
      (elem->>'variant_id')::uuid AS variant_id,
      sum((elem->>'quantity')::int)::int AS quantity,
      max((elem->>'final_price')::numeric) AS final_price,
      nullif(max(elem->>'vendor_id'), '')::uuid AS vendor_id,
      max((elem->>'base_price')::numeric) AS base_price,
      max((elem->>'margin_amount')::numeric) AS margin_amount,
      max(elem->>'product_name') AS product_name
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY (elem->>'variant_id')::uuid
  LOOP
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM _old_order_items o WHERE o.variant_id = r_old.variant_id) THEN 'added'
      WHEN EXISTS (
        SELECT 1 FROM _old_order_items o
        WHERE o.variant_id = r_old.variant_id AND o.quantity IS DISTINCT FROM r_old.quantity
      ) THEN 'modified'
      ELSE NULL
    END INTO v_flag;

    INSERT INTO public.order_items (
      order_id, variant_id, quantity, price, vendor_id,
      base_price, final_price, margin_amount, product_name, customer_edit_flag
    )
    VALUES (
      p_order_id, r_old.variant_id, r_old.quantity, r_old.final_price, r_old.vendor_id,
      r_old.base_price, r_old.final_price, r_old.margin_amount, r_old.product_name, v_flag
    );

    v_new_total := v_new_total + r_old.final_price * r_old.quantity;
  END LOOP;

  PERFORM public.setup_order_fulfillments_and_reserve(p_order_id);

  SELECT COALESCE(capture_payments, true) INTO v_capture_payments FROM public.app_settings WHERE id = 1;
  v_was_paid := v_order.payment_status = 'paid';
  v_old_total := COALESCE(v_order.total_amount, 0);
  v_diff := round(v_new_total - v_old_total, 2);

  IF v_capture_payments AND v_was_paid THEN
    IF v_diff > 0 THEN
      PERFORM public.wallet_debit(v_diff, 'Order edit ' || p_order_id::text);
    ELSIF v_diff < 0 THEN
      UPDATE public.wallet SET balance = balance + abs(v_diff), updated_at = now() WHERE user_id = v_uid;
      INSERT INTO public.transactions (user_id, amount, type, reference)
      VALUES (v_uid, abs(v_diff), 'credit', 'Order edit ' || p_order_id::text);
    END IF;
  END IF;

  UPDATE public.orders
  SET total_amount = v_new_total, subtotal = v_new_total, tax = 0, discount = 0,
      status = 'pending', customer_edited_at = now()
  WHERE id = p_order_id;

  SELECT to_jsonb(o) INTO v_order_json FROM public.orders o WHERE o.id = p_order_id;
  RETURN v_order_json;
END;
$$;

-- ─── 11. Online availability helper ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_variant_online_available(p_variant_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(public.store_inventory_available(s.id, p_variant_id)), 0)
  FROM public.stores s
  WHERE s.is_active = true;
$$;

-- ─── 12. RLS for new tables ─────────────────────────────────────────────────

ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fulfillment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_fulfillments_staff"
  ON public.order_fulfillments FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "order_fulfillment_items_staff"
  ON public.order_fulfillment_items FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- Customer read own order fulfillments
CREATE POLICY "order_fulfillments_customer_read"
  ON public.order_fulfillments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_fulfillments.order_id AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "order_fulfillment_items_customer_read"
  ON public.order_fulfillment_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_fulfillments of
      JOIN public.orders o ON o.id = of.order_id
      WHERE of.id = order_fulfillment_items.fulfillment_id AND o.user_id = auth.uid()
    )
  );

-- ─── 13. Grants (staff-gated inside functions) ──────────────────────────────

GRANT EXECUTE ON FUNCTION public.store_inventory_available(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_variant_online_available(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.setup_order_fulfillments_and_reserve(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_inventory_reservations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_order_fulfillment_store(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ship_order_fulfillment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ship_all_order_fulfillments(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_store_inventory_stock(uuid, uuid, numeric, uuid) TO authenticated;

COMMIT;
