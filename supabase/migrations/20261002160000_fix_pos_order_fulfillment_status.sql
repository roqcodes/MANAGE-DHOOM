-- Fix: orders.fulfillment_status must not be 'pending' (invalid per orders_fulfillment_status_check).

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_pos_counter_sale(
  p_idempotency_key uuid,
  p_store_id uuid,
  p_lines jsonb,
  p_subtotal numeric,
  p_tax numeric,
  p_discount numeric,
  p_total_amount numeric,
  p_customer_user_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_company text DEFAULT NULL,
  p_gst_number text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_order_id uuid;
  v_invoice_id uuid;
  v_fulfillment_id uuid;
  v_line jsonb;
  v_variant_id uuid;
  v_qty numeric;
  v_fulfillment_line record;
  v_item_count integer := 0;
  v_agg record;
  v_customer_id uuid;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'POS_CHECKOUT_INVALID: idempotency key is required';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'POS_CHECKOUT_INVALID: store is required';
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'POS_CHECKOUT_INVALID: at least one line is required';
  END IF;

  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  PERFORM pg_advisory_xact_lock(hashtext(p_idempotency_key::text));

  SELECT o.order_id, o.invoice_id
  INTO v_existing
  FROM public.pos_checkout_operations o
  WHERE o.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'order_id', v_existing.order_id,
      'invoice_id', v_existing.invoice_id,
      'idempotent_replay', true
    );
  END IF;

  SET LOCAL lock_timeout = '15s';

  v_customer_id := p_customer_user_id;
  IF v_customer_id IS NULL THEN
    v_customer_id := public.ensure_walk_in_customer();
  END IF;

  v_order_id := gen_random_uuid();

  INSERT INTO public.orders (
    id, user_id, address_id, total_amount, status, payment_status,
    customer_name, phone, company, gst_number, source, store_id,
    subtotal, tax, discount, merchant_note, created_by_admin_id,
    fulfillment_status, inventory_committed, inventory_reserved
  )
  VALUES (
    v_order_id, v_customer_id, NULL, p_total_amount, 'processing', 'paid',
    NULLIF(trim(p_customer_name), ''), NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_company), ''), NULLIF(trim(p_gst_number), ''),
    'online', p_store_id, p_subtotal, p_tax, p_discount,
    'POS counter sale', p_created_by, 'none', false, false
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line ->> 'variant_id', '')::uuid;
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);

    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'POS_CHECKOUT_INVALID: each line needs a variant and positive quantity';
    END IF;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, quantity, price, vendor_id,
      base_price, final_price, margin_amount, product_name
    )
    VALUES (
      v_order_id,
      NULLIF(v_line ->> 'product_id', '')::uuid,
      v_variant_id,
      v_qty::integer,
      COALESCE((v_line ->> 'final_price')::numeric, (v_line ->> 'unit_price')::numeric, 0),
      NULLIF(v_line ->> 'vendor_id', '')::uuid,
      COALESCE((v_line ->> 'base_price')::numeric, 0),
      COALESCE((v_line ->> 'final_price')::numeric, (v_line ->> 'unit_price')::numeric, 0),
      COALESCE((v_line ->> 'margin_amount')::numeric, 0),
      COALESCE(v_line ->> 'product_name', 'Item')
    );

    v_item_count := v_item_count + v_qty::integer;
  END LOOP;

  FOR v_agg IN
    SELECT variant_id, SUM(quantity)::numeric AS qty
    FROM public.order_items
    WHERE order_id = v_order_id AND variant_id IS NOT NULL
    GROUP BY variant_id
    ORDER BY variant_id
  LOOP
    PERFORM public.pos_store_variant_sale_immediate(
      p_store_id,
      v_agg.variant_id,
      v_agg.qty,
      v_order_id,
      'order',
      'POS counter sale',
      p_created_by
    );
  END LOOP;

  v_fulfillment_id := gen_random_uuid();
  INSERT INTO public.order_fulfillments (
    id, order_id, store_id, status, reserved_at, shipped_at, inventory_committed
  )
  VALUES (
    v_fulfillment_id, v_order_id, p_store_id, 'shipped', now(), now(), true
  );

  FOR v_fulfillment_line IN
    SELECT oi.id AS order_item_id, oi.variant_id, oi.quantity::numeric AS qty
    FROM public.order_items oi
    WHERE oi.order_id = v_order_id AND oi.variant_id IS NOT NULL
    ORDER BY oi.variant_id, oi.id
  LOOP
    INSERT INTO public.order_fulfillment_items (
      fulfillment_id, order_item_id, variant_id, quantity,
      reserved_quantity, shipped_quantity
    )
    VALUES (
      v_fulfillment_id,
      v_fulfillment_line.order_item_id,
      v_fulfillment_line.variant_id,
      v_fulfillment_line.qty,
      v_fulfillment_line.qty,
      v_fulfillment_line.qty
    );
  END LOOP;

  UPDATE public.orders
  SET
    status = 'delivered',
    fulfillment_status = 'shipped',
    inventory_committed = true,
    inventory_reserved = false
  WHERE id = v_order_id;

  v_invoice_id := public.convert_order_to_erp_invoice(v_order_id, p_created_by);

  INSERT INTO public.pos_checkout_operations (
    idempotency_key, store_id, order_id, invoice_id, created_by
  )
  VALUES (
    p_idempotency_key, p_store_id, v_order_id, v_invoice_id, p_created_by
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'invoice_id', v_invoice_id,
    'total_amount', p_total_amount,
    'item_count', v_item_count,
    'idempotent_replay', false
  );
END;
$$;

COMMIT;
