-- Reject update_erp_invoice on finalized (non-draft) sales invoices.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_erp_invoice(
  p_invoice_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_lines jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sales_person_id uuid DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_paid numeric;
  v_credits numeric;
  v_store_id uuid;
  v_user_id uuid;
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
  v_will_issue boolean;
  v_variant_id uuid;
  v_product_id uuid;
  v_line_cost numeric;
  v_pending_qty numeric;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.assert_erp_salesman_id(p_sales_person_id);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  SELECT status, store_id, user_id
  INTO v_status, v_store_id, v_user_id
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot edit a cancelled invoice';
  END IF;

  IF lower(trim(v_status)) NOT IN ('pending', 'draft') THEN
    RAISE EXCEPTION
      'INVOICE_NOT_EDITABLE: Finalized invoices cannot be edited. Use credit notes, payments, or cancel and reissue.';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_payment_allocations
  WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.erp_credit_note_applications
  WHERE invoice_id = p_invoice_id;

  IF v_paid > 0 OR v_credits > 0 THEN
    RAISE EXCEPTION 'Cannot edit invoice after payments or credit notes';
  END IF;

  v_will_issue := v_status IN ('pending', 'draft');

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, 1);
  PERFORM public.void_journals_for_entity('invoice', p_invoice_id);

  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  IF v_will_issue OR v_status = 'issued' THEN
    PERFORM public.assert_erp_sales_lines_store_stock(v_store_id, p_lines, p_actor);
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_variant_id := NULLIF(v_line ->> 'variant_id', '')::uuid;
    v_product_id := COALESCE(
      NULLIF(v_line ->> 'product_id', '')::uuid,
      (SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = v_variant_id)
    );
    v_line_cost := public.erp_resolve_invoice_line_cost(
      (v_line ->> 'purchase_price')::numeric,
      v_variant_id,
      v_product_id,
      v_store_id
    );
    v_pending_qty := CASE WHEN COALESCE(v_line_cost, 0) > 0 THEN 0 ELSE v_qty END;

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

    INSERT INTO public.invoice_items (
      invoice_id, variant_id, product_id, product_name, quantity, unit_price,
      base_price, gst_rate, gst_amount, total_amount, vendor_id,
      unit_id, description, taxable_amount, pending_cost_qty
    )
    VALUES (
      p_invoice_id,
      v_variant_id,
      v_product_id,
      v_line ->> 'product_name',
      v_qty,
      v_unit_price,
      v_line_cost,
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(v_line ->> 'vendor_id', '')::uuid,
      NULLIF(v_line ->> 'unit_id', '')::uuid,
      v_line ->> 'description',
      v_taxable,
      v_pending_qty
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

  PERFORM public.assert_customer_credit_headroom(v_user_id, v_total, p_invoice_id);

  UPDATE public.invoices
  SET
    due_date = p_due_date,
    subtotal = v_subtotal,
    gst_amount = v_tax,
    total_amount = v_total,
    balance_due = v_total,
    discount = COALESCE(p_discount, 0),
    reference = p_reference,
    notes = p_notes,
    sales_person_id = p_sales_person_id,
    tax_inclusive = COALESCE(p_tax_inclusive, false),
    status = CASE WHEN v_status = 'pending' THEN 'issued' ELSE v_status END,
    issued_at = COALESCE(issued_at, now())
  WHERE id = p_invoice_id;

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, -1);
  PERFORM public.recalculate_invoice_balance(p_invoice_id);
  PERFORM public.post_journal_for_invoice(p_invoice_id, p_actor);
END;
$$;

COMMIT;
