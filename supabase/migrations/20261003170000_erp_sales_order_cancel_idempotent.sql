-- Phase 7: Atomic sales_order.cancel inside ERP client idempotency transaction.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_cancel_sales_order_from_payload(
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
  v_order record;
  v_was_paid boolean;
  v_refund_amount numeric;
  v_restored boolean := false;
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
    RAISE EXCEPTION 'Order is already cancelled.' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('shipped', 'delivered') THEN
    RAISE EXCEPTION 'Cannot cancel an order that has been shipped.' USING ERRCODE = '22023';
  END IF;

  IF v_order.payment_status = 'refunded' THEN
    RAISE EXCEPTION 'Order has already been refunded.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.order_id = v_order_id
      AND i.status IS DISTINCT FROM 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel an order with an active invoice. Cancel the invoice first.'
      USING ERRCODE = '22023';
  END IF;

  v_was_paid := v_order.payment_status = 'paid';
  v_refund_amount := COALESCE(v_order.total_amount, 0);

  IF COALESCE(v_order.inventory_committed, false) THEN
    PERFORM public.inventory_apply_order_stock(v_order_id, 1);
    v_restored := true;
  END IF;

  IF v_was_paid THEN
    IF v_order.user_id IS NULL THEN
      RAISE EXCEPTION 'Order has no customer to refund.' USING ERRCODE = '22023';
    END IF;
    IF v_refund_amount <= 0 THEN
      RAISE EXCEPTION 'Order total is invalid for refund.' USING ERRCODE = '22023';
    END IF;
    PERFORM public.wallet_credit_user(
      v_order.user_id,
      v_refund_amount,
      'Refund for cancelled order ' || v_order_id::text
    );
  END IF;

  UPDATE public.orders
  SET
    status = 'cancelled',
    payment_status = CASE
      WHEN v_was_paid THEN 'refunded'
      ELSE payment_status
    END
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'salesOrderNumber', COALESCE(v_order.sales_order_number, v_order_id::text),
    'status', 'cancelled',
    'inventoryRestored', v_restored,
    'walletRefunded', v_was_paid
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
  ELSIF p_operation_type = 'sales_order.cancel' THEN
    v_result := public.erp_cancel_sales_order_from_payload(p_payload, p_store_id);
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

GRANT EXECUTE ON FUNCTION public.erp_cancel_sales_order_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_erp_client_idempotent_operation(
  uuid, text, text, jsonb, uuid, text
) TO authenticated;

COMMIT;
