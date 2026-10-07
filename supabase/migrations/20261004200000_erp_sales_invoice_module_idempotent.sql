-- P8–P12: Sales order conversion + sales invoice durable client operations.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_invoice_lines_json_from_payload(p_lines jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'variant_id', NULLIF(elem ->> 'variantId', ''),
        'product_id', NULLIF(elem ->> 'productId', ''),
        'product_name', COALESCE(elem ->> 'productName', 'Item'),
        'description', elem ->> 'description',
        'quantity', COALESCE((elem ->> 'quantity')::numeric, 0),
        'unit_price', COALESCE((elem ->> 'unitPrice')::numeric, 0),
        'tax_rate_percent', COALESCE((elem ->> 'taxRatePercent')::numeric, 0),
        'purchase_price', NULLIF(elem ->> 'purchasePrice', '')::numeric,
        'unit_id', NULLIF(elem ->> 'unitId', ''),
        'vendor_id', NULLIF(elem ->> 'vendorId', '')
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS elem;
$$;

CREATE OR REPLACE FUNCTION public.erp_convert_sales_order_to_invoice_from_payload(
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
  v_invoice_id uuid;
  v_invoice_number text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_order_id := NULLIF(p_payload ->> 'orderId', '')::uuid;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Sales order id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_order_id;

  IF NOT FOUND OR v_order.source IS DISTINCT FROM 'sales_order' THEN
    RAISE EXCEPTION 'Sales order not found.' USING ERRCODE = '22023';
  END IF;

  IF v_order.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  v_invoice_id := public.convert_order_to_erp_invoice(v_order_id, v_uid);

  SELECT invoice_number INTO v_invoice_number
  FROM public.invoices
  WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'invoiceId', v_invoice_id,
    'invoiceNumber', v_invoice_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_create_sales_invoice_from_payload(
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
  v_user_id uuid;
  v_invoice_id uuid;
  v_lines jsonb;
  v_finalize boolean;
  v_invoice_number text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_user_id := NULLIF(p_payload ->> 'userId', '')::uuid;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required' USING ERRCODE = '22023';
  END IF;

  v_lines := public.erp_invoice_lines_json_from_payload(p_payload -> 'lines');
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  v_finalize := COALESCE((p_payload ->> 'finalize')::boolean, false);

  v_invoice_id := public.create_erp_invoice(
    v_user_id,
    p_store_id,
    COALESCE(NULLIF(p_payload ->> 'invoiceDate', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(p_payload ->> 'dueDate', '')::date, CURRENT_DATE),
    v_lines,
    COALESCE((p_payload ->> 'discount')::numeric, 0),
    COALESCE((p_payload ->> 'taxInclusive')::boolean, false),
    NULLIF(p_payload ->> 'reference', ''),
    NULLIF(p_payload ->> 'notes', ''),
    NULLIF(p_payload ->> 'salesPersonId', '')::uuid,
    NULLIF(p_payload ->> 'estimateId', '')::uuid,
    v_finalize,
    v_uid
  );

  SELECT invoice_number INTO v_invoice_number FROM public.invoices WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'invoiceId', v_invoice_id,
    'invoiceNumber', v_invoice_number,
    'status', CASE WHEN v_finalize THEN 'issued' ELSE 'pending' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_update_sales_invoice_from_payload(
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
  v_invoice_id uuid;
  v_store_id uuid;
  v_lines jsonb;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  v_invoice_id := NULLIF(p_payload ->> 'invoiceId', '')::uuid;
  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice id is required' USING ERRCODE = '22023';
  END IF;

  SELECT store_id, status INTO v_store_id, v_status
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '22023';
  END IF;

  IF v_store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_lines := public.erp_invoice_lines_json_from_payload(p_payload -> 'lines');
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  PERFORM public.update_erp_invoice(
    v_invoice_id,
    COALESCE(NULLIF(p_payload ->> 'invoiceDate', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(p_payload ->> 'dueDate', '')::date, CURRENT_DATE),
    v_lines,
    COALESCE((p_payload ->> 'discount')::numeric, 0),
    COALESCE((p_payload ->> 'taxInclusive')::boolean, false),
    NULLIF(p_payload ->> 'reference', ''),
    NULLIF(p_payload ->> 'notes', ''),
    v_uid
  );

  SELECT status INTO v_status FROM public.invoices WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'invoiceId', v_invoice_id,
    'status', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_issue_sales_invoice_from_payload(
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
  v_invoice_id uuid;
  v_status text;
  v_store_id uuid;
  v_lines jsonb;
  v_paid numeric;
  v_credits numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  v_invoice_id := NULLIF(p_payload ->> 'invoiceId', '')::uuid;
  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice id is required' USING ERRCODE = '22023';
  END IF;

  SELECT status, store_id INTO v_status, v_store_id
  FROM public.invoices
  WHERE id = v_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '22023';
  END IF;

  IF v_store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot issue a cancelled invoice' USING ERRCODE = '22023';
  END IF;

  IF v_status = 'issued' THEN
    RETURN jsonb_build_object('invoiceId', v_invoice_id, 'status', 'issued');
  END IF;

  IF v_status NOT IN ('pending', 'draft') THEN
    RAISE EXCEPTION 'Invoice cannot be issued from its current status' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_payment_allocations WHERE invoice_id = v_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.erp_credit_note_applications WHERE invoice_id = v_invoice_id;

  IF v_paid > 0 OR v_credits > 0 THEN
    RAISE EXCEPTION 'Cannot issue invoice after payments or credit notes' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', ii.product_id,
        'variant_id', ii.variant_id,
        'product_name', ii.product_name,
        'quantity', ii.quantity,
        'unit_price', ii.unit_price,
        'tax_rate_percent', ii.gst_rate
      )
    ),
    '[]'::jsonb
  )
  INTO v_lines
  FROM public.invoice_items ii
  WHERE ii.invoice_id = v_invoice_id;

  PERFORM public.assert_erp_sales_lines_store_stock(v_store_id, v_lines, v_uid);

  UPDATE public.invoices
  SET
    status = 'issued',
    issued_at = COALESCE(issued_at, now())
  WHERE id = v_invoice_id;

  PERFORM public.inventory_apply_invoice_stock(v_invoice_id, -1);
  PERFORM public.recalculate_invoice_balance(v_invoice_id);
  PERFORM public.post_journal_for_invoice(v_invoice_id, v_uid);

  RETURN jsonb_build_object('invoiceId', v_invoice_id, 'status', 'issued');
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_cancel_sales_invoice_from_payload(
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
  v_invoice_id uuid;
  v_store_id uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  v_invoice_id := NULLIF(p_payload ->> 'invoiceId', '')::uuid;
  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice id is required' USING ERRCODE = '22023';
  END IF;

  SELECT store_id, status INTO v_store_id, v_status
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '22023';
  END IF;

  IF v_store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('invoiceId', v_invoice_id, 'status', 'cancelled');
  END IF;

  PERFORM public.cancel_erp_invoice(v_invoice_id, v_uid);

  RETURN jsonb_build_object('invoiceId', v_invoice_id, 'status', 'cancelled');
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
  ELSIF p_operation_type = 'sales_order.convert_to_invoice' THEN
    v_result := public.erp_convert_sales_order_to_invoice_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_invoice.create' THEN
    v_result := public.erp_create_sales_invoice_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_invoice.update' THEN
    v_result := public.erp_update_sales_invoice_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_invoice.issue' THEN
    v_result := public.erp_issue_sales_invoice_from_payload(p_payload, p_store_id);
  ELSIF p_operation_type = 'sales_invoice.cancel' THEN
    v_result := public.erp_cancel_sales_invoice_from_payload(p_payload, p_store_id);
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

GRANT EXECUTE ON FUNCTION public.erp_invoice_lines_json_from_payload(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_convert_sales_order_to_invoice_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_create_sales_invoice_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_update_sales_invoice_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_issue_sales_invoice_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_cancel_sales_invoice_from_payload(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_erp_client_idempotent_operation(
  uuid, text, text, jsonb, uuid, text
) TO authenticated;

COMMIT;
