-- VAT return: shared calculation, preview before save, refresh unfiled snapshots.

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_erp_vat_return_amounts(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  OUT output_tax numeric,
  OUT input_tax numeric,
  OUT total_tax_payable numeric
)
RETURNS record
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_output numeric := 0;
  v_output_credits numeric := 0;
  v_input numeric := 0;
  v_input_credits numeric := 0;
BEGIN
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  SELECT COALESCE(SUM(gst_amount), 0) INTO v_output
  FROM public.invoices
  WHERE status IN ('issued', 'partial', 'paid', 'overdue')
    AND COALESCE(issued_at::date, created_at::date) BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_output_credits
  FROM public.erp_credit_notes
  WHERE status IN ('issued', 'applied')
    AND credit_note_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_input
  FROM public.erp_purchase_bills
  WHERE status IN ('finalized', 'partial', 'paid')
    AND purchase_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_input_credits
  FROM public.erp_vendor_credits
  WHERE status IN ('issued', 'applied')
    AND credit_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  output_tax := GREATEST(0, v_output - v_output_credits);
  input_tax := GREATEST(0, v_input - v_input_credits);
  total_tax_payable := GREATEST(0, output_tax - input_tax);
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_erp_vat_return(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  p_requested_by uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amounts record;
BEGIN
  IF NOT public.is_staff_user(p_requested_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id, p_requested_by);
  END IF;

  SELECT * INTO v_amounts
  FROM public.compute_erp_vat_return_amounts(p_store_id, p_period_start, p_period_end);

  RETURN jsonb_build_object(
    'output_tax', v_amounts.output_tax,
    'input_tax', v_amounts.input_tax,
    'total_tax_payable', v_amounts.total_tax_payable,
    'recoverable_tax', GREATEST(0, v_amounts.input_tax - v_amounts.output_tax)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_erp_vat_return(
  p_return_id uuid,
  p_refreshed_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return public.erp_vat_returns%ROWTYPE;
  v_amounts record;
  v_paid numeric := 0;
BEGIN
  IF NOT public.is_staff_user(p_refreshed_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_return
  FROM public.erp_vat_returns
  WHERE id = p_return_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return not found';
  END IF;

  IF v_return.status <> 'unfiled' THEN
    RAISE EXCEPTION 'Only unfiled VAT returns can be recalculated';
  END IF;

  IF v_return.store_id IS NOT NULL THEN
    PERFORM public.require_store_access(v_return.store_id, p_refreshed_by);
  END IF;

  SELECT * INTO v_amounts
  FROM public.compute_erp_vat_return_amounts(
    v_return.store_id,
    v_return.period_start,
    v_return.period_end
  );

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_vat_payments
  WHERE vat_return_id = p_return_id;

  UPDATE public.erp_vat_returns
  SET
    output_tax = v_amounts.output_tax,
    input_tax = v_amounts.input_tax,
    total_tax_payable = v_amounts.total_tax_payable,
    balance_due = GREATEST(0, v_amounts.total_tax_payable - v_paid),
    updated_at = now()
  WHERE id = p_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_vat_return(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
  v_amounts record;
  v_label text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_id, v_number
  FROM public.erp_next_document_ref('vat_return') AS t;

  v_label := to_char(p_period_start, 'Mon - YYYY');

  SELECT * INTO v_amounts
  FROM public.compute_erp_vat_return_amounts(p_store_id, p_period_start, p_period_end);

  INSERT INTO public.erp_vat_returns (
    id, return_number, period_start, period_end, period_label, store_id,
    output_tax, input_tax, total_tax_payable, balance_due, notes, created_by
  )
  VALUES (
    v_id, v_number, p_period_start, p_period_end, v_label, p_store_id,
    v_amounts.output_tax, v_amounts.input_tax, v_amounts.total_tax_payable,
    v_amounts.total_tax_payable, COALESCE(p_notes, ''), p_created_by
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_erp_vat_return_amounts(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_erp_vat_return(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_erp_vat_return(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_vat_return(uuid, date, date, text, uuid) TO authenticated;

COMMIT;
