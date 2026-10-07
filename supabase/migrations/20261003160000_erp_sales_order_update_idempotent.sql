-- Phase 6: Atomic sales_order.update inside ERP client idempotency transaction.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_update_sales_order_from_payload(
  p_payload jsonb,
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_customer_id uuid;
  v_so_number text;
  v_order record;
  v_allow_negative boolean;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_tax_rate numeric;
  v_product record;
  v_spi record;
  v_store_stock int;
  v_list_price numeric;
  v_final_price numeric;
  v_reference_cost numeric;
  v_margin numeric;
  v_product_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_order_id := NULLIF(p_payload ->> 'orderId', '')::uuid;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Sales order id is required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.source IS DISTINCT FROM 'sales_order' THEN
    RAISE EXCEPTION 'Sales order not found.' USING ERRCODE = '22023';
  END IF;

  IF v_order.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot edit a cancelled order.' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('shipped', 'delivered') THEN
    RAISE EXCEPTION 'Cannot edit a shipped sales order.' USING ERRCODE = '22023';
  END IF;

  IF v_order.payment_status = 'refunded' THEN
    RAISE EXCEPTION 'Cannot edit a refunded order.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.order_id = v_order_id
      AND i.status IS DISTINCT FROM 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Cannot edit an order with an active invoice. Cancel the invoice first.'
      USING ERRCODE = '22023';
  END IF;

  v_customer_id := NULLIF(p_payload ->> 'userId', '')::uuid;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required' USING ERRCODE = '22023';
  END IF;

  IF p_payload -> 'items' IS NULL OR jsonb_typeof(p_payload -> 'items') <> 'array' THEN
    RAISE EXCEPTION 'Add at least one item' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_payload -> 'items') = 0 THEN
    RAISE EXCEPTION 'Add at least one item' USING ERRCODE = '22023';
  END IF;

  v_allow_negative := public.app_settings_allow_negative_store_stock();
  v_so_number := v_order.sales_order_number;

  IF COALESCE(v_order.inventory_committed, false) THEN
    PERFORM public.inventory_apply_order_stock(v_order_id, 1);
  END IF;

  DELETE FROM public.order_items WHERE order_id = v_order_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_payload -> 'items')
  LOOP
    v_product_id := NULLIF(v_item ->> 'productId', '')::uuid;
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Select products from catalog search' USING ERRCODE = '22023';
    END IF;

    v_qty := GREATEST(1, floor(COALESCE((v_item ->> 'quantity')::numeric, 1)));
    v_tax_rate := COALESCE((v_item ->> 'taxRatePercent')::numeric, 0);

    SELECT id, name, price, purchase_price
    INTO v_product
    FROM public.products
    WHERE id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found.' USING ERRCODE = '22023';
    END IF;

    SELECT product_id, stock, purchase_price
    INTO v_spi
    FROM public.store_product_inventory
    WHERE store_id = p_store_id AND product_id = v_product_id;

    v_store_stock := floor(COALESCE(v_spi.stock, 0));
    IF NOT v_allow_negative AND v_store_stock < v_qty THEN
      IF v_store_stock <= 0 THEN
        RAISE EXCEPTION 'Not enough stock at store' USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'Only % unit% at store (requested %).',
        GREATEST(0, v_store_stock),
        CASE WHEN GREATEST(0, v_store_stock) = 1 THEN '' ELSE 's' END,
        v_qty
        USING ERRCODE = '22023';
    END IF;

    v_list_price := public.erp_round_money_2(v_product.price);
    IF v_list_price <= 0 THEN
      RAISE EXCEPTION 'This product has no valid selling price.' USING ERRCODE = '22023';
    END IF;

    IF v_item ? 'unitPrice'
      AND v_item ->> 'unitPrice' IS NOT NULL
      AND (v_item ->> 'unitPrice') ~ '^-?[0-9]+(\.[0-9]+)?$'
      AND (v_item ->> 'unitPrice')::numeric IS NOT NULL THEN
      v_final_price := public.erp_round_money_2((v_item ->> 'unitPrice')::numeric);
    ELSE
      v_final_price := v_list_price;
    END IF;

    v_reference_cost := public.erp_round_money_2(
      COALESCE(
        v_spi.purchase_price,
        v_product.purchase_price,
        0
      )
    );
    v_margin := public.erp_round_money_2(v_final_price - v_reference_cost);
    v_product_name := COALESCE(v_product.name, 'Product');

    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      quantity,
      price,
      vendor_id,
      base_price,
      final_price,
      margin_amount,
      product_name,
      tax_rate_percent
    )
    VALUES (
      v_order_id,
      v_product_id,
      NULL,
      v_qty,
      v_final_price,
      NULL,
      v_reference_cost,
      v_final_price,
      v_margin,
      v_product_name,
      v_tax_rate
    );
  END LOOP;

  UPDATE public.orders
  SET
    user_id = v_customer_id,
    total_amount = public.erp_round_money_2((p_payload ->> 'totalAmount')::numeric),
    subtotal = public.erp_round_money_2((p_payload ->> 'subtotal')::numeric),
    tax = public.erp_round_money_2((p_payload ->> 'tax')::numeric),
    discount = public.erp_round_money_2(COALESCE((p_payload ->> 'discount')::numeric, 0)),
    tax_inclusive = COALESCE((p_payload ->> 'taxInclusive')::boolean, true),
    reference_number = NULLIF(p_payload ->> 'referenceNumber', ''),
    shipment_date = NULLIF(p_payload ->> 'shipmentDate', '')::date,
    delivery_method = NULLIF(p_payload ->> 'deliveryMethod', ''),
    sales_person_id = NULLIF(p_payload ->> 'salesPersonId', '')::uuid
  WHERE id = v_order_id;

  PERFORM public.inventory_apply_order_stock(v_order_id, -1);

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'salesOrderNumber', COALESCE(v_so_number, v_order_id::text)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_erp_client_idempotent_operation(
  p_operation_id uuid,
  p_operation_type text,
  p_payload_hash text,
  p_payload jsonb,
  p_store_id uuid,
  p_terminal_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.erp_client_operations%ROWTYPE;
  v_computed_hash text;
  v_result jsonb;
  v_exec_nonce bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED'
      USING ERRCODE = '28000';
  END IF;

  IF p_operation_id IS NULL OR p_operation_type IS NULL OR p_payload_hash IS NULL OR p_payload IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_INVALID_REQUEST'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_computed_hash := public.erp_payload_hash(p_payload);
  IF v_computed_hash <> p_payload_hash THEN
    RAISE EXCEPTION 'ERP_CLIENT_PAYLOAD_HASH_MISMATCH'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.erp_client_operations (
    operation_id,
    operation_type,
    payload_hash,
    user_id,
    store_id,
    terminal_id,
    status
  )
  VALUES (
    p_operation_id,
    p_operation_type,
    p_payload_hash,
    v_uid,
    p_store_id,
    p_terminal_id,
    'PENDING'
  )
  ON CONFLICT (operation_id) DO NOTHING;

  SELECT *
  INTO v_row
  FROM public.erp_client_operations
  WHERE operation_id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERP_CLIENT_OPERATION_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_row.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'ERP_CLIENT_USER_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.operation_type IS DISTINCT FROM p_operation_type THEN
    RAISE EXCEPTION 'ERP_CLIENT_OPERATION_TYPE_CONFLICT'
      USING ERRCODE = '23505';
  END IF;

  IF v_row.payload_hash IS DISTINCT FROM p_payload_hash THEN
    RAISE EXCEPTION 'ERP_CLIENT_PAYLOAD_HASH_CONFLICT'
      USING ERRCODE = '23505';
  END IF;

  IF v_row.status = 'COMMITTED' THEN
    RETURN jsonb_build_object(
      'idempotentReplay', true,
      'result', v_row.result
    );
  END IF;

  IF p_operation_type = 'test.certify' THEN
    IF COALESCE((p_payload ->> 'fail')::boolean, false) THEN
      RAISE EXCEPTION 'ERP_CLIENT_CERTIFY_FAILURE'
        USING ERRCODE = 'P0001';
    END IF;
    v_exec_nonce := nextval('public.erp_certify_execution_seq');
    v_result := jsonb_build_object(
      'certified', true,
      'executionNonce', v_exec_nonce
    );
  ELSIF p_operation_type = 'sales_order.create' THEN
    v_result := public.erp_create_sales_order_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_order.update' THEN
    v_result := public.erp_update_sales_order_from_payload(p_payload, p_store_id);
  ELSE
    RAISE EXCEPTION 'ERP_CLIENT_UNSUPPORTED_OPERATION_TYPE'
      USING ERRCODE = '0A000';
  END IF;

  UPDATE public.erp_client_operations
  SET
    status = 'COMMITTED',
    result = v_result,
    updated_at = now()
  WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'idempotentReplay', false,
    'result', v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_update_sales_order_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_erp_client_idempotent_operation(
  uuid, text, text, jsonb, uuid, text
) TO authenticated;

COMMIT;
