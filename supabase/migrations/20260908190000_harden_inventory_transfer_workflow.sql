-- Harden store ↔ online inventory transfer workflow:
-- • Correct document numbers (erp_next_document_ref)
-- • Lock-before-check on stock mutations
-- • Reject duplicate lines / non-integer quantities
-- • Accurate variant balance_after in stock_movements (inventory table)
-- • Atomic bulk store → online transfers

-- ─── Helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_positive_whole_quantity(p_qty numeric, p_label text DEFAULT 'Quantity')
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 OR p_qty <> TRUNC(p_qty) THEN
    RAISE EXCEPTION '% must be a positive whole number', p_label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.online_inventory_deduct_unreserved(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
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
  v_new_stock numeric;
BEGIN
  PERFORM public.assert_positive_whole_quantity(p_quantity, 'Transfer quantity');

  SELECT stock, reserved_stock
  INTO v_stock, v_reserved
  FROM public.inventory
  WHERE store_id = p_store_id AND variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No online inventory for variant % at store %', p_variant_id, p_store_id;
  END IF;

  v_available := COALESCE(v_stock, 0) - COALESCE(v_reserved, 0);
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient online stock for variant % (available %, requested %)',
      p_variant_id, v_available, p_quantity;
  END IF;

  v_new_stock := COALESCE(v_stock, 0) - p_quantity;

  UPDATE public.inventory
  SET stock = v_new_stock, updated_at = now()
  WHERE store_id = p_store_id AND variant_id = p_variant_id;

  RETURN v_new_stock;
END;
$$;

-- Variant movements: balance_after must reflect online inventory, not legacy store_inventory.
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
  v_product_id uuid;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT product_id INTO v_product_id
  FROM public.product_variants
  WHERE id = p_variant_id;

  IF p_store_id IS NOT NULL THEN
    SELECT stock INTO v_balance
    FROM public.inventory
    WHERE store_id = p_store_id AND variant_id = p_variant_id;
  END IF;

  INSERT INTO public.stock_movements (
    variant_id, product_id, quantity, type, reference_id, reference_type, reason, user_id,
    store_id, transfer_store_id, transaction_price, balance_after
  )
  VALUES (
    p_variant_id, v_product_id, p_quantity, p_type, p_reference_id, p_reference_type, p_reason, v_user_id,
    p_store_id, p_transfer_store_id, p_transaction_price, v_balance
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

-- Product movements: balance_after after apply_delta (caller must log after mutation).
CREATE OR REPLACE FUNCTION public.log_product_stock_movement(
  p_product_id uuid,
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
    FROM public.store_product_inventory
    WHERE store_id = p_store_id AND product_id = p_product_id;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, quantity, type, reference_id, reference_type, reason, user_id,
    store_id, transfer_store_id, transaction_price, balance_after
  )
  VALUES (
    p_product_id, p_quantity, p_type, p_reference_id, p_reference_type, p_reason, v_user_id,
    p_store_id, p_transfer_store_id, p_transaction_price, v_balance
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

-- ─── Store → Online (single) ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_online_stock_transfer(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_number text;
  v_available numeric;
  v_product record;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);
  PERFORM public.assert_positive_whole_quantity(p_quantity, 'Transfer quantity');

  SELECT id, is_active, item_type
  INTO v_product
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND OR v_product.is_active IS NOT TRUE OR v_product.item_type <> 'goods' THEN
    RAISE EXCEPTION 'Product % is not an active goods item', p_product_id;
  END IF;

  -- Lock physical stock row before availability check (prevents concurrent oversell).
  SELECT stock INTO v_available
  FROM public.store_product_inventory
  WHERE store_id = p_store_id AND product_id = p_product_id
  FOR UPDATE;

  v_available := COALESCE(v_available, 0);
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient store stock: product % (available %, requested %)',
      p_product_id, v_available, p_quantity;
  END IF;

  PERFORM public.store_product_inventory_apply_delta(p_store_id, p_product_id, -p_quantity, p_user_id);

  SELECT t.out_id, t.out_ref INTO v_transfer_id, v_number
  FROM public.erp_next_document_ref('online_stock_transfer') AS t;

  INSERT INTO public.online_stock_transfers (
    id, transfer_number, store_id, product_id, quantity, status, notes, created_by
  )
  VALUES (
    v_transfer_id, v_number, p_store_id, p_product_id, p_quantity,
    'pending_allocation', p_notes, p_user_id
  );

  PERFORM public.log_product_stock_movement(
    p_product_id, -p_quantity, 'transfer_out', v_transfer_id, 'online_stock_transfer',
    'Store to online transfer (pending allocation)', p_store_id, NULL, NULL, p_user_id
  );

  RETURN v_transfer_id;
END;
$$;

-- ─── Store → Online (atomic bulk) ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_online_stock_transfers_bulk(
  p_store_id uuid,
  p_lines jsonb,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_transfer_id uuid;
  v_created uuid[] := ARRAY[]::uuid[];
  v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Transfer lines are required';
  END IF;

  -- Validate all lines before any stock mutation.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := (v_line ->> 'productId')::uuid;
    v_qty := (v_line ->> 'quantity')::numeric;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Invalid transfer line: product is required';
    END IF;

    PERFORM public.assert_positive_whole_quantity(v_qty, 'Transfer quantity');

    IF v_product_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'Duplicate product % in transfer batch', v_product_id;
    END IF;
    v_seen := array_append(v_seen, v_product_id);
  END LOOP;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := (v_line ->> 'productId')::uuid;
    v_qty := (v_line ->> 'quantity')::numeric;

    v_transfer_id := public.create_online_stock_transfer(
      p_store_id, v_product_id, v_qty, p_notes, p_user_id
    );
    v_created := array_append(v_created, v_transfer_id);
  END LOOP;

  RETURN jsonb_build_object(
    'created', to_jsonb(v_created),
    'failed', '[]'::jsonb
  );
END;
$$;

-- ─── Allocate pending store → online ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.allocate_online_stock_transfer(
  p_transfer_id uuid,
  p_allocations jsonb,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_line jsonb;
  v_variant_id uuid;
  v_qty numeric;
  v_total numeric := 0;
  v_product_id uuid;
  v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_transfer
  FROM public.online_stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF v_transfer.status <> 'pending_allocation' THEN
    RAISE EXCEPTION 'Transfer is not pending allocation';
  END IF;

  PERFORM public.require_store_access(v_transfer.store_id, p_user_id);

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Allocations are required';
  END IF;

  DELETE FROM public.online_stock_transfer_allocations
  WHERE transfer_id = p_transfer_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_variant_id := (v_line ->> 'variantId')::uuid;
    v_qty := (v_line ->> 'quantity')::numeric;

    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'Invalid allocation line';
    END IF;

    PERFORM public.assert_positive_whole_quantity(v_qty, 'Allocation quantity');

    IF v_variant_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'Duplicate variant % in allocation', v_variant_id;
    END IF;
    v_seen := array_append(v_seen, v_variant_id);

    SELECT product_id INTO v_product_id
    FROM public.product_variants
    WHERE id = v_variant_id;

    IF v_product_id IS DISTINCT FROM v_transfer.product_id THEN
      RAISE EXCEPTION 'Variant % does not belong to product %', v_variant_id, v_transfer.product_id;
    END IF;

    INSERT INTO public.online_stock_transfer_allocations (transfer_id, variant_id, quantity)
    VALUES (p_transfer_id, v_variant_id, v_qty);

    v_total := v_total + v_qty;
  END LOOP;

  IF v_total <> v_transfer.quantity THEN
    RAISE EXCEPTION 'Allocation total (%) must equal transfer quantity (%)', v_total, v_transfer.quantity;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_variant_id := (v_line ->> 'variantId')::uuid;
    v_qty := (v_line ->> 'quantity')::numeric;

    INSERT INTO public.inventory (store_id, variant_id, stock, reserved_stock, updated_at)
    VALUES (v_transfer.store_id, v_variant_id, v_qty, 0, now())
    ON CONFLICT (store_id, variant_id)
    DO UPDATE SET stock = public.inventory.stock + EXCLUDED.stock, updated_at = now();

    PERFORM public.log_stock_movement(
      v_variant_id, v_qty, 'transfer_in', p_transfer_id, 'online_stock_transfer',
      'Online stock allocation', v_transfer.store_id, NULL, NULL, p_user_id
    );
  END LOOP;

  UPDATE public.online_stock_transfers
  SET status = 'allocated', allocated_at = now(), updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── Online → Store ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_online_to_physical_transfer(
  p_store_id uuid,
  p_lines jsonb,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_number text;
  v_line jsonb;
  v_variant_id uuid;
  v_qty numeric;
  v_product_id uuid;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_variant record;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Transfer lines are required';
  END IF;

  -- Validate every line before locking or mutating anything.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := (v_line ->> 'variantId')::uuid;
    v_qty := (v_line ->> 'quantity')::numeric;

    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'Invalid transfer line: variant is required';
    END IF;

    PERFORM public.assert_positive_whole_quantity(v_qty, 'Transfer quantity');

    IF v_variant_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'Duplicate variant % in transfer batch', v_variant_id;
    END IF;
    v_seen := array_append(v_seen, v_variant_id);

    SELECT pv.id, pv.product_id, p.is_active, p.item_type
    INTO v_variant
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_variant_id;

    IF NOT FOUND OR v_variant.is_active IS NOT TRUE OR v_variant.item_type <> 'goods' THEN
      RAISE EXCEPTION 'Variant % is not an active goods SKU', v_variant_id;
    END IF;
  END LOOP;

  SELECT t.out_id, t.out_ref INTO v_transfer_id, v_number
  FROM public.erp_next_document_ref('online_to_physical_transfer') AS t;

  INSERT INTO public.online_to_physical_transfers (
    id, transfer_number, store_id, notes, created_by
  )
  VALUES (v_transfer_id, v_number, p_store_id, p_notes, p_user_id);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := (v_line ->> 'variantId')::uuid;
    v_qty := (v_line ->> 'quantity')::numeric;

    SELECT product_id INTO v_product_id
    FROM public.product_variants
    WHERE id = v_variant_id;

    PERFORM public.online_inventory_deduct_unreserved(
      p_store_id, v_variant_id, v_qty, p_user_id
    );

    PERFORM public.store_product_inventory_apply_delta(
      p_store_id, v_product_id, v_qty, p_user_id
    );

    INSERT INTO public.online_to_physical_transfer_lines (
      transfer_id, variant_id, product_id, quantity
    )
    VALUES (v_transfer_id, v_variant_id, v_product_id, v_qty);

    PERFORM public.log_stock_movement(
      v_variant_id, -v_qty, 'transfer_out', v_transfer_id, 'online_to_physical_transfer',
      'Online to store transfer', p_store_id, NULL, NULL, p_user_id
    );

    PERFORM public.log_product_stock_movement(
      v_product_id, v_qty, 'transfer_in', v_transfer_id, 'online_to_physical_transfer',
      'Online to store transfer', p_store_id, NULL, NULL, p_user_id
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_positive_whole_quantity(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_inventory_deduct_unreserved(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_online_stock_transfers_bulk(uuid, jsonb, text, uuid) TO authenticated;
