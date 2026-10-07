-- Customer preferred delivery date + checkout RPC param

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preferred_delivery_date date;

COMMENT ON COLUMN public.orders.preferred_delivery_date IS
  'Customer-requested delivery date at checkout. Admin promise uses shipment_date.';

CREATE OR REPLACE FUNCTION public.place_customer_order(
  p_address_id uuid,
  p_items jsonb,
  p_merchant_note text DEFAULT NULL,
  p_preferred_delivery_date date DEFAULT NULL
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
    merchant_note, inventory_committed, inventory_reserved, source, fulfillment_status,
    preferred_delivery_date
  )
  VALUES (
    v_uid, p_address_id, round(v_grand_total, 2), 'pending',
    CASE WHEN v_capture_payments THEN 'pending' ELSE 'not_required' END,
    v_note, false, false, 'online', 'none',
    p_preferred_delivery_date
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

GRANT EXECUTE ON FUNCTION public.place_customer_order(uuid, jsonb, text, date) TO authenticated;
