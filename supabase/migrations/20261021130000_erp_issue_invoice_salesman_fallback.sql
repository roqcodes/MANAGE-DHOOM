-- Issue invoice: use payload salesPersonId or existing invoice.sales_person_id.

BEGIN;

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
  v_sales_person_id uuid;
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

  SELECT status, store_id, sales_person_id
  INTO v_status, v_store_id, v_sales_person_id
  FROM public.invoices
  WHERE id = v_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '22023';
  END IF;

  v_sales_person_id := COALESCE(
    NULLIF(p_payload ->> 'salesPersonId', '')::uuid,
    v_sales_person_id
  );
  PERFORM public.assert_erp_salesman_id(v_sales_person_id);

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

  UPDATE public.invoices
  SET sales_person_id = v_sales_person_id
  WHERE id = v_invoice_id;

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

COMMIT;
