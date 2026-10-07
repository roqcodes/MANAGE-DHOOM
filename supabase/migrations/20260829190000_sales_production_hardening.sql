-- Sales production hardening: CN auto-apply (Winner-style), invoice cancel/update.

BEGIN;

-- Winner / standard ERP: credit note linked to invoice auto-reduces that invoice balance.
CREATE OR REPLACE FUNCTION public.create_erp_credit_note(
  p_user_id uuid,
  p_store_id uuid,
  p_credit_note_date date,
  p_lines jsonb,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_restore_stock boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid(),
  p_source_invoice_id uuid DEFAULT NULL,
  p_attachment_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn_id uuid;
  v_cn_number text;
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
  v_already_committed boolean;
  v_invoice_user uuid;
  v_invoice_balance numeric;
  v_apply_amount numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF p_source_invoice_id IS NOT NULL THEN
    SELECT user_id, balance_due
    INTO v_invoice_user, v_invoice_balance
    FROM public.invoices
    WHERE id = p_source_invoice_id AND status <> 'cancelled';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source invoice not found';
    END IF;

    IF v_invoice_user <> p_user_id THEN
      RAISE EXCEPTION 'Credit note customer must match source invoice';
    END IF;
  END IF;

  v_cn_number := public.next_erp_document_number('credit_note');

  INSERT INTO public.erp_credit_notes (
    credit_note_number, store_id, user_id, reference, credit_note_date,
    status, notes, balance_remaining, created_by, inventory_committed,
    source_invoice_id, attachment_url
  )
  VALUES (
    v_cn_number, p_store_id, p_user_id, p_reference, p_credit_note_date,
    CASE WHEN p_finalize THEN 'issued' ELSE 'draft' END,
    p_notes, 0, p_created_by, false,
    p_source_invoice_id, p_attachment_url
  )
  RETURNING id INTO v_cn_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_unit_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    INSERT INTO public.erp_credit_note_lines (
      credit_note_id, variant_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_cn_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_qty,
      v_unit_price,
      v_tax_rate,
      v_line_tax,
      v_line_total
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  UPDATE public.erp_credit_notes
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax,
    total_amount = v_total,
    balance_remaining = v_total
  WHERE id = v_cn_id;

  IF p_finalize AND p_restore_stock THEN
    SELECT inventory_committed INTO v_already_committed
    FROM public.erp_credit_notes
    WHERE id = v_cn_id
    FOR UPDATE;

    IF NOT COALESCE(v_already_committed, false) THEN
      FOR v_line IN
        SELECT variant_id, quantity, unit_price
        FROM public.erp_credit_note_lines
        WHERE credit_note_id = v_cn_id AND variant_id IS NOT NULL
      LOOP
        PERFORM public.store_inventory_apply_delta(
          p_store_id, v_line.variant_id, v_line.quantity, true, p_created_by
        );

        PERFORM public.log_stock_movement(
          v_line.variant_id,
          v_line.quantity,
          'return',
          v_cn_id,
          'credit_note',
          'Credit note stock restore',
          p_store_id,
          NULL,
          v_line.unit_price
        );
      END LOOP;

      UPDATE public.erp_credit_notes
      SET inventory_committed = true
      WHERE id = v_cn_id;
    END IF;
  END IF;

  IF p_finalize AND p_source_invoice_id IS NOT NULL AND v_total > 0 THEN
    v_apply_amount := LEAST(v_total, COALESCE(v_invoice_balance, 0));
    IF v_apply_amount > 0 THEN
      PERFORM public.apply_erp_credit_note(
        v_cn_id, p_source_invoice_id, v_apply_amount, p_created_by
      );
    END IF;
  END IF;

  RETURN v_cn_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_erp_invoice(
  p_invoice_id uuid,
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
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id
  INTO v_status, v_store_id
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_payment_allocations
  WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.erp_credit_note_applications
  WHERE invoice_id = p_invoice_id;

  IF v_paid > 0 OR v_credits > 0 THEN
    RAISE EXCEPTION 'Cannot cancel invoice with payments or credit notes applied';
  END IF;

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, 1);

  UPDATE public.invoices
  SET
    status = 'cancelled',
    balance_due = 0
  WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_erp_invoice(
  p_invoice_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_lines jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
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
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

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

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, 1);

  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

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

    INSERT INTO public.invoice_items (
      invoice_id, variant_id, product_name, quantity, unit_price,
      base_price, gst_rate, gst_amount, total_amount, vendor_id,
      unit_id, description, taxable_amount
    )
    VALUES (
      p_invoice_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_qty,
      v_unit_price,
      COALESCE((v_line ->> 'purchase_price')::numeric, v_unit_price),
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(v_line ->> 'vendor_id', '')::uuid,
      NULLIF(v_line ->> 'unit_id', '')::uuid,
      v_line ->> 'description',
      v_taxable
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

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
    tax_inclusive = COALESCE(p_tax_inclusive, false),
    status = CASE WHEN v_status = 'pending' THEN 'issued' ELSE v_status END,
    issued_at = COALESCE(issued_at, now())
  WHERE id = p_invoice_id;

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, -1);
  PERFORM public.recalculate_invoice_balance(p_invoice_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_erp_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_erp_invoice(uuid, date, date, jsonb, numeric, boolean, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_credit_note(
  uuid, uuid, date, jsonb, text, text, boolean, boolean, uuid, uuid, text
) TO authenticated;

COMMIT;
