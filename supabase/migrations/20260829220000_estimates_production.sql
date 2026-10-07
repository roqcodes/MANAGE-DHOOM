-- Estimates: update, cancel, finalize status support.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_erp_estimate(
  p_estimate_id uuid,
  p_estimate_date date,
  p_valid_until date,
  p_lines jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_store_id uuid;
  v_line jsonb;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_unit_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  SELECT status, store_id
  INTO v_status, v_store_id
  FROM public.erp_estimates
  WHERE id = p_estimate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate not found';
  END IF;

  IF v_status IN ('converted', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot edit a % estimate', v_status;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  DELETE FROM public.erp_estimate_lines WHERE estimate_id = p_estimate_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    IF p_tax_inclusive THEN
      v_taxable := ROUND(v_unit_price * v_qty / (1 + v_tax_rate / 100), 2);
      v_line_tax := ROUND(v_unit_price * v_qty - v_taxable, 2);
      v_line_total := ROUND(v_unit_price * v_qty, 2);
    ELSE
      v_taxable := ROUND(v_unit_price * v_qty, 2);
      v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
      v_line_total := v_taxable + v_line_tax;
    END IF;

    INSERT INTO public.erp_estimate_lines (
      estimate_id, variant_id, product_name, description, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total, unit_id
    )
    VALUES (
      p_estimate_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_line ->> 'description',
      v_qty,
      v_unit_price,
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(v_line ->> 'unit_id', '')::uuid
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

  UPDATE public.erp_estimates
  SET
    estimate_date = p_estimate_date,
    valid_until = p_valid_until,
    subtotal = v_subtotal,
    tax_amount = v_tax,
    discount = COALESCE(p_discount, 0),
    total_amount = v_total,
    tax_inclusive = COALESCE(p_tax_inclusive, false),
    reference = p_reference,
    notes = p_notes,
    status = COALESCE(NULLIF(p_status, ''), v_status),
    updated_at = now()
  WHERE id = p_estimate_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_erp_estimate(
  p_estimate_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_store_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id
  INTO v_status, v_store_id
  FROM public.erp_estimates
  WHERE id = p_estimate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate not found';
  END IF;

  IF v_status = 'converted' THEN
    RAISE EXCEPTION 'Cannot cancel a converted estimate';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  UPDATE public.erp_estimates
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_estimate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_erp_estimate(
  uuid, date, date, jsonb, numeric, boolean, text, text, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_erp_estimate(uuid, uuid) TO authenticated;

COMMIT;
