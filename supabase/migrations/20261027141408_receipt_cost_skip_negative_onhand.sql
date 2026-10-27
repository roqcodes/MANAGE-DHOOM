-- Purchase bill / GRN receipts use apply_receipt_cost, not apply_delta.
-- 20261017163000 skipped the negative-on-hand guard for inbound apply_delta,
-- but apply_receipt_cost still raised "Insufficient stock: product % at store %"
-- whenever on-hand + receipt qty stayed negative (sold ahead of the buy).

BEGIN;

CREATE OR REPLACE FUNCTION public.store_product_inventory_apply_receipt_cost(
  p_store_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_cost numeric;
  v_new_stock numeric;
  v_new_cost numeric;
  v_allow_negative boolean;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_store_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Store and product are required';
  END IF;

  IF p_qty = 0 THEN
    RETURN NULL;
  END IF;

  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be zero or positive';
  END IF;

  v_allow_negative := public.app_settings_allow_negative_store_stock();

  SELECT stock, purchase_price
  INTO v_stock, v_cost
  FROM public.store_product_inventory
  WHERE store_id = p_store_id AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_qty < 0 THEN
      IF NOT v_allow_negative THEN
        RAISE EXCEPTION 'Insufficient stock: no inventory for product % at store %', p_product_id, p_store_id;
      END IF;
      INSERT INTO public.store_product_inventory (store_id, product_id, stock, purchase_price, updated_at)
      VALUES (p_store_id, p_product_id, p_qty, ROUND(p_unit_cost, 4), now());
      RETURN ROUND(p_unit_cost, 4);
    END IF;
    INSERT INTO public.store_product_inventory (store_id, product_id, stock, purchase_price, updated_at)
    VALUES (p_store_id, p_product_id, p_qty, ROUND(p_unit_cost, 4), now());
    PERFORM public.erp_allocate_receipt_cost_to_pending_sales(
      p_store_id, p_product_id, p_qty, p_unit_cost, p_user_id, CURRENT_DATE
    );
    RETURN ROUND(p_unit_cost, 4);
  END IF;

  v_new_stock := COALESCE(v_stock, 0) + p_qty;

  -- Inbound receipts may correct a short position without fully covering it.
  -- Only outbound (bill/receive reversal) needs an availability check.
  IF p_qty < 0 AND v_new_stock < 0 AND NOT v_allow_negative THEN
    RAISE EXCEPTION 'Insufficient stock: product % at store %', p_product_id, p_store_id;
  END IF;

  IF p_qty > 0 THEN
    IF COALESCE(v_stock, 0) <= 0 OR v_cost IS NULL THEN
      v_new_cost := p_unit_cost;
    ELSE
      v_new_cost := (COALESCE(v_stock, 0) * COALESCE(v_cost, 0) + p_qty * p_unit_cost)
        / NULLIF(COALESCE(v_stock, 0) + p_qty, 0);
    END IF;
    v_new_cost := ROUND(v_new_cost, 4);
  ELSE
    v_new_cost := v_cost;
    IF v_new_stock = 0 THEN
      v_new_cost := NULL;
    END IF;
  END IF;

  UPDATE public.store_product_inventory
  SET stock = v_new_stock, purchase_price = v_new_cost, updated_at = now()
  WHERE store_id = p_store_id AND product_id = p_product_id;

  IF p_qty > 0 THEN
    PERFORM public.erp_allocate_receipt_cost_to_pending_sales(
      p_store_id, p_product_id, p_qty, p_unit_cost, p_user_id, CURRENT_DATE
    );
  END IF;

  RETURN v_new_cost;
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_product_inventory_apply_receipt_cost(
  uuid, uuid, numeric, numeric, uuid
) TO authenticated;

COMMIT;
