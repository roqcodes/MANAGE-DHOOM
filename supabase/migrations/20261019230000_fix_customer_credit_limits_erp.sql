-- Align customer credit limits with ERP receivables (balance_due) and enforce on invoice writes.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_customer_ar_exposure(
  p_user_id uuid,
  p_exclude_invoice_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening numeric := 0;
  v_invoices numeric := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(u.opening_balance, 0)
  INTO v_opening
  FROM public.users u
  WHERE u.id = p_user_id;

  SELECT COALESCE(SUM(i.balance_due), 0)
  INTO v_invoices
  FROM public.invoices i
  WHERE i.user_id = p_user_id
    AND i.status <> 'cancelled'
    AND COALESCE(i.balance_due, 0) > 0
    AND (p_exclude_invoice_id IS NULL OR i.id <> p_exclude_invoice_id);

  RETURN COALESCE(v_opening, 0) + COALESCE(v_invoices, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_available_credit(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_limit numeric;
  v_exposure numeric;
BEGIN
  SELECT c.credit_limit
  INTO v_credit_limit
  FROM public.customer_credit_limits c
  WHERE c.user_id = p_user_id;

  IF v_credit_limit IS NULL OR v_credit_limit <= 0 THEN
    RETURN NULL;
  END IF;

  v_exposure := public.get_customer_ar_exposure(p_user_id, NULL);
  RETURN v_credit_limit - v_exposure;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_customer_credit_headroom(
  p_user_id uuid,
  p_new_balance numeric,
  p_replace_invoice_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_limit numeric;
  v_exposure numeric;
  v_available numeric;
BEGIN
  IF p_user_id IS NULL OR COALESCE(p_new_balance, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT c.credit_limit
  INTO v_credit_limit
  FROM public.customer_credit_limits c
  WHERE c.user_id = p_user_id;

  IF v_credit_limit IS NULL OR v_credit_limit <= 0 THEN
    RETURN;
  END IF;

  v_exposure := public.get_customer_ar_exposure(p_user_id, p_replace_invoice_id);
  v_available := v_credit_limit - v_exposure;

  IF v_exposure + p_new_balance > v_credit_limit + 0.0001 THEN
    RAISE EXCEPTION
      'Customer credit limit exceeded. Available credit: % (limit %, outstanding %).',
      ROUND(GREATEST(v_available, 0), 2),
      ROUND(v_credit_limit, 2),
      ROUND(v_exposure, 2)
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_credit_limit(
  p_user_id uuid,
  p_order_amount numeric
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available numeric;
BEGIN
  v_available := public.get_available_credit(p_user_id);
  IF v_available IS NULL THEN
    RETURN true;
  END IF;
  RETURN v_available >= COALESCE(p_order_amount, 0);
END;
$$;

-- create_erp_invoice: enforce credit before posting balance_due
CREATE OR REPLACE FUNCTION public.create_erp_invoice(
  p_user_id uuid,
  p_store_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_lines jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sales_person_id uuid DEFAULT NULL,
  p_estimate_id uuid DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
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
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_user_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Customer and store are required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  IF COALESCE(p_finalize, true) THEN
    PERFORM public.assert_erp_sales_lines_store_stock(p_store_id, p_lines, p_created_by);
  END IF;

  SELECT t.out_id, t.out_ref INTO v_invoice_id, v_invoice_number
  FROM public.erp_next_document_ref('sales_invoice') AS t;

  IF v_invoice_id IS NULL OR v_invoice_number IS NULL OR BTRIM(v_invoice_number) = '' THEN
    RAISE EXCEPTION 'Could not allocate invoice number';
  END IF;

  INSERT INTO public.invoices (
    id, order_id, user_id, invoice_number, subtotal, gst_amount, total_amount,
    status, created_at, due_date, issued_at, store_id, amount_paid,
    credits_applied, balance_due, discount, source, sales_person_id,
    reference, tax_inclusive, estimate_id, notes, inventory_committed
  )
  VALUES (
    v_invoice_id, NULL, p_user_id, v_invoice_number, 0, 0, 0,
    'pending', now(), p_due_date, CASE WHEN p_finalize THEN now() ELSE NULL END,
    p_store_id, 0, 0, 0, COALESCE(p_discount, 0), 'erp',
    p_sales_person_id, p_reference, COALESCE(p_tax_inclusive, false),
    p_estimate_id, p_notes, false
  );

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
      invoice_id, variant_id, product_id, product_name, quantity, unit_price,
      base_price, gst_rate, gst_amount, total_amount, vendor_id,
      unit_id, description, taxable_amount
    )
    VALUES (
      v_invoice_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      COALESCE(
        NULLIF(v_line ->> 'product_id', '')::uuid,
        (SELECT product_id FROM public.product_variants WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid)
      ),
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

  PERFORM public.assert_customer_credit_headroom(p_user_id, v_total, NULL);

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    gst_amount = v_tax,
    total_amount = v_total,
    balance_due = v_total,
    status = CASE WHEN p_finalize THEN 'issued' ELSE 'pending' END
  WHERE id = v_invoice_id;

  IF p_finalize THEN
    PERFORM public.inventory_apply_invoice_stock(v_invoice_id, -1);
  END IF;

  IF p_estimate_id IS NOT NULL THEN
    UPDATE public.erp_estimates
    SET status = 'converted', converted_invoice_id = v_invoice_id, updated_at = now()
    WHERE id = p_estimate_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;

-- update_erp_invoice: enforce credit when balance_due changes
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
  v_will_issue boolean;
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
      unit_id, description, taxable_amount
    )
    VALUES (
      p_invoice_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      COALESCE(
        NULLIF(v_line ->> 'product_id', '')::uuid,
        (SELECT product_id FROM public.product_variants WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid)
      ),
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
    tax_inclusive = COALESCE(p_tax_inclusive, false),
    status = CASE WHEN v_status = 'pending' THEN 'issued' ELSE v_status END,
    issued_at = COALESCE(issued_at, now())
  WHERE id = p_invoice_id;

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, -1);
  PERFORM public.recalculate_invoice_balance(p_invoice_id);
  PERFORM public.post_journal_for_invoice(p_invoice_id, p_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_ar_exposure(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_customer_credit_headroom(uuid, numeric, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_customer_ar_exposure(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_credit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_credit_limit(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_customer_credit_headroom(uuid, numeric, uuid) TO authenticated;

COMMIT;
