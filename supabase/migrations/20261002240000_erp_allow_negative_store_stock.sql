-- ERP-only negative store_product_inventory for sales orders/invoices.
-- POS and online checkout remain strict (unchanged).

BEGIN;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS allow_negative_store_stock boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_settings.allow_negative_store_stock IS
  'When true, ERP sales orders and issued invoices may reduce store_product_inventory below zero. POS and online remain strict.';

ALTER TABLE public.store_product_inventory
  DROP CONSTRAINT IF EXISTS store_product_inventory_stock_non_negative;

CREATE OR REPLACE FUNCTION public.app_settings_allow_negative_store_stock()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT allow_negative_store_stock FROM public.app_settings WHERE id = 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.app_settings_allow_negative_store_stock() TO authenticated;

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

CREATE OR REPLACE FUNCTION public.assert_erp_sales_lines_store_stock(
  p_store_id uuid,
  p_lines jsonb,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_available numeric;
BEGIN
  IF public.app_settings_allow_negative_store_stock() THEN
    RETURN;
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required for stock validation';
  END IF;

  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_actor);

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  FOR r IN
    SELECT
      COALESCE(
        NULLIF(elem ->> 'product_id', '')::uuid,
        pv.product_id
      ) AS product_id,
      MAX(COALESCE(elem ->> 'product_name', 'Item')) AS product_name,
      SUM(COALESCE((elem ->> 'quantity')::numeric, 0)) AS total_qty
    FROM jsonb_array_elements(p_lines) AS elem
    LEFT JOIN public.product_variants pv
      ON pv.id = NULLIF(elem ->> 'variant_id', '')::uuid
    GROUP BY 1
  LOOP
    IF r.product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required on each line for stock tracking (%)', r.product_name;
    END IF;

    IF r.total_qty IS NULL OR r.total_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_available := public.store_product_inventory_available(p_store_id, r.product_id);

    IF v_available < r.total_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % (available %, requested %)',
        r.product_name, v_available, r.total_qty;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_apply_invoice_stock(
  p_invoice_id uuid,
  p_multiplier integer DEFAULT -1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_store_id uuid;
  v_committed boolean;
  v_delta numeric;
  v_allow_negative boolean;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice id is required';
  END IF;

  IF p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid stock multiplier';
  END IF;

  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, inventory_committed
  INTO v_store_id, v_committed
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Invoice store is required for stock deduction';
  END IF;

  IF p_multiplier = -1 AND v_committed THEN
    RETURN;
  END IF;

  IF p_multiplier = 1 AND NOT v_committed THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id);

  v_allow_negative := public.app_settings_allow_negative_store_stock();

  FOR r IN
    SELECT
      COALESCE(ii.product_id, pv.product_id) AS product_id,
      SUM(ii.quantity)::numeric AS qty,
      MAX(ii.unit_price) AS unit_price
    FROM public.invoice_items ii
    LEFT JOIN public.product_variants pv ON pv.id = ii.variant_id
    WHERE ii.invoice_id = p_invoice_id
      AND COALESCE(ii.product_id, pv.product_id) IS NOT NULL
    GROUP BY COALESCE(ii.product_id, pv.product_id)
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    PERFORM public.store_product_inventory_apply_delta(
      v_store_id, r.product_id, v_delta, auth.uid(), v_allow_negative
    );

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta,
      CASE WHEN p_multiplier = -1 THEN 'sale' ELSE 'return' END,
      p_invoice_id, 'invoice',
      CASE WHEN p_multiplier = -1 THEN 'ERP invoice sale' ELSE 'ERP invoice stock restore' END,
      v_store_id, NULL, r.unit_price
    );
  END LOOP;

  UPDATE public.invoices
  SET inventory_committed = (p_multiplier = -1)
  WHERE id = p_invoice_id;
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
  v_allow_negative boolean;
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
    RAISE EXCEPTION 'Store is required for ERP stock movement';
  END IF;

  v_is_staff := public.is_staff_user(v_uid);
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(v_order.store_id, v_uid);

  v_allow_negative := public.app_settings_allow_negative_store_stock();

  FOR r IN
    SELECT
      COALESCE(oi.product_id, pv.product_id) AS product_id,
      SUM(oi.quantity)::numeric AS qty
    FROM public.order_items oi
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    WHERE oi.order_id = p_order_id
      AND COALESCE(oi.product_id, pv.product_id) IS NOT NULL
    GROUP BY COALESCE(oi.product_id, pv.product_id)
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    PERFORM public.store_product_inventory_apply_delta(
      v_order.store_id, r.product_id, v_delta, v_uid, v_allow_negative
    );

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta,
      CASE WHEN p_multiplier = -1 THEN 'sale' ELSE 'return' END,
      p_order_id, 'order',
      CASE WHEN p_multiplier = -1 THEN 'ERP sales order' ELSE 'ERP sales order restore' END,
      v_order.store_id, NULL, NULL, v_uid
    );
  END LOOP;

  UPDATE public.orders
  SET inventory_committed = (p_multiplier = -1)
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_stock_shortages(p_store_id uuid)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  stock numeric,
  suggested_qty numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_store_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id);

  RETURN QUERY
  SELECT
    spi.product_id,
    COALESCE(p.name, 'Product')::text,
    spi.stock,
    CEIL(ABS(spi.stock))::numeric AS suggested_qty
  FROM public.store_product_inventory spi
  INNER JOIN public.products p ON p.id = spi.product_id
  WHERE spi.store_id = p_store_id
    AND spi.stock < 0
  ORDER BY spi.stock ASC, p.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_stock_shortages(uuid) TO authenticated;

COMMIT;
