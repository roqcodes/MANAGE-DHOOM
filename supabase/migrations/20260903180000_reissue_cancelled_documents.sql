-- Allow re-issuing invoices/bills after cancellation by clearing stale links.

BEGIN;

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
  v_store_id uuid;
  v_paid numeric;
  v_credits numeric;
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
  PERFORM public.void_journals_for_entity('invoice', p_invoice_id);

  UPDATE public.invoices
  SET status = 'cancelled', balance_due = 0
  WHERE id = p_invoice_id;

  UPDATE public.orders
  SET invoice_id = NULL
  WHERE invoice_id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_order_to_erp_invoice(
  p_order_id uuid,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item record;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_unit_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
  v_tax_inclusive boolean;
  v_source text;
  v_skip_stock boolean;
  v_ref text;
  v_notes text;
  v_existing_invoice uuid;
  v_existing_status text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot invoice a cancelled order';
  END IF;

  IF v_order.user_id IS NULL THEN
    RAISE EXCEPTION 'Order has no customer — link a customer before invoicing';
  END IF;

  IF v_order.source NOT IN ('sales_order', 'online', 'manual') AND v_order.source IS NOT NULL THEN
    RAISE EXCEPTION 'This order type cannot be converted to an invoice';
  END IF;

  v_existing_invoice := v_order.invoice_id;
  IF v_existing_invoice IS NULL THEN
    SELECT id INTO v_existing_invoice
    FROM public.invoices
    WHERE order_id = p_order_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_existing_invoice IS NOT NULL THEN
    SELECT status INTO v_existing_status
    FROM public.invoices
    WHERE id = v_existing_invoice;

    IF COALESCE(v_existing_status, '') <> 'cancelled' THEN
      UPDATE public.orders
      SET invoice_id = v_existing_invoice
      WHERE id = p_order_id AND invoice_id IS NULL;
      RETURN v_existing_invoice;
    END IF;

    UPDATE public.orders SET invoice_id = NULL WHERE id = p_order_id;
    v_existing_invoice := NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Order has no line items';
  END IF;

  IF v_order.store_id IS NULL THEN
    RAISE EXCEPTION 'Order has no store — assign a store before invoicing';
  END IF;

  PERFORM public.require_store_access(v_order.store_id, p_created_by);

  IF v_order.source = 'sales_order' THEN
    v_source := 'sales_order';
    v_ref := COALESCE(v_order.reference_number, v_order.sales_order_number);
    v_notes := 'Converted from sales order ' || COALESCE(v_order.sales_order_number, p_order_id::text);
  ELSIF COALESCE(v_order.merchant_note, '') ILIKE '%POS counter sale%' THEN
    v_source := 'pos';
    v_ref := 'POS-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 8));
    v_notes := 'Converted from POS sale ' || v_ref;
  ELSE
    v_source := 'online';
    v_ref := 'ORD-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 8));
    v_notes := 'Converted from online order ' || v_ref;
  END IF;

  v_tax_inclusive := COALESCE(v_order.tax_inclusive, v_order.source = 'sales_order');
  v_skip_stock := COALESCE(v_order.inventory_committed, false);

  SELECT t.out_id, t.out_ref INTO v_invoice_id, v_invoice_number
  FROM public.erp_next_document_ref('sales_invoice') AS t;

  INSERT INTO public.invoices (
    id, order_id, user_id, invoice_number, subtotal, gst_amount, total_amount,
    status, created_at, due_date, issued_at, store_id, amount_paid,
    credits_applied, balance_due, discount, source, reference, tax_inclusive,
    notes, inventory_committed
  )
  VALUES (
    v_invoice_id, p_order_id, v_order.user_id, v_invoice_number, 0, 0, 0,
    'pending', now(),
    COALESCE(v_order.shipment_date::date, CURRENT_DATE),
    now(),
    v_order.store_id, 0, 0, 0,
    COALESCE(v_order.discount, 0),
    v_source, v_ref, v_tax_inclusive, v_notes,
    v_skip_stock
  );

  FOR v_item IN
    SELECT
      oi.*,
      COALESCE(
        NULLIF(oi.tax_rate_percent, 0),
        NULLIF(pv.tax_rate_percent, 0),
        0
      ) AS resolved_tax_rate
    FROM public.order_items oi
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_qty := COALESCE(v_item.quantity, 0);
    v_unit_price := COALESCE(v_item.final_price, v_item.price, 0);
    v_tax_rate := COALESCE(v_item.resolved_tax_rate, 0);

    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_tax_inclusive THEN
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
      base_price, gst_rate, gst_amount, total_amount, vendor_id, taxable_amount
    )
    VALUES (
      v_invoice_id, v_item.variant_id, COALESCE(v_item.product_name, 'Item'),
      v_qty, v_unit_price, COALESCE(v_item.base_price, v_unit_price),
      v_tax_rate, v_line_tax, v_line_total, v_item.vendor_id, v_taxable
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(v_order.discount, 0));

  IF COALESCE(v_order.total_amount, 0) > 0 THEN
    v_total := v_order.total_amount;
    v_tax := COALESCE(v_order.tax, v_tax);
    v_subtotal := COALESCE(v_order.subtotal, v_subtotal);
  END IF;

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    gst_amount = v_tax,
    total_amount = v_total,
    balance_due = v_total,
    status = 'issued'
  WHERE id = v_invoice_id;

  IF NOT v_skip_stock THEN
    PERFORM public.inventory_apply_invoice_stock(v_invoice_id, -1);
    UPDATE public.invoices SET inventory_committed = true WHERE id = v_invoice_id;
  END IF;

  UPDATE public.orders
  SET invoice_id = v_invoice_id
  WHERE id = p_order_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_erp_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_order_to_erp_invoice(uuid, uuid) TO authenticated;

COMMIT;
