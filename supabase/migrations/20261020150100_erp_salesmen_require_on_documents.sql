BEGIN;

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
  v_variant_id uuid;
  v_product_id uuid;
  v_line_cost numeric;
  v_pending_qty numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_user_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Customer and store are required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  PERFORM public.assert_erp_salesman_id(p_sales_person_id);

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
    v_variant_id := NULLIF(v_line ->> 'variant_id', '')::uuid;
    v_product_id := COALESCE(
      NULLIF(v_line ->> 'product_id', '')::uuid,
      (SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = v_variant_id)
    );
    v_line_cost := public.erp_resolve_invoice_line_cost(
      (v_line ->> 'purchase_price')::numeric,
      v_variant_id,
      v_product_id,
      p_store_id
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
      v_invoice_id,
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


CREATE OR REPLACE FUNCTION public.erp_create_sales_order_from_payload(
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
  v_customer_id uuid;
  v_order_id uuid;
  v_so_number text;
  v_allow_negative boolean;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_tax_rate numeric;
  v_product record;
  v_spi record;
  v_store_stock int;
  v_final_price numeric;
  v_reference_cost numeric;
  v_margin numeric;
  v_product_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_customer_id := NULLIF(p_payload ->> 'userId', '')::uuid;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_erp_salesman_id(NULLIF(p_payload ->> 'salesPersonId', '')::uuid);

  IF p_payload -> 'items' IS NULL OR jsonb_typeof(p_payload -> 'items') <> 'array' THEN
    RAISE EXCEPTION 'Add at least one item' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_payload -> 'items') = 0 THEN
    RAISE EXCEPTION 'Add at least one item' USING ERRCODE = '22023';
  END IF;

  v_allow_negative := public.app_settings_allow_negative_store_stock();

  INSERT INTO public.orders (
    user_id,
    address_id,
    total_amount,
    status,
    payment_status,
    source,
    subtotal,
    tax,
    discount,
    tax_inclusive,
    created_by_admin_id,
    reference_number,
    shipment_date,
    delivery_method,
    sales_person_id,
    store_id,
    estimate_id
  )
  VALUES (
    v_customer_id,
    NULL,
    public.erp_round_money_2((p_payload ->> 'totalAmount')::numeric),
    'processing',
    'pending',
    'sales_order',
    public.erp_round_money_2((p_payload ->> 'subtotal')::numeric),
    public.erp_round_money_2((p_payload ->> 'tax')::numeric),
    public.erp_round_money_2(COALESCE((p_payload ->> 'discount')::numeric, 0)),
    COALESCE((p_payload ->> 'taxInclusive')::boolean, true),
    v_uid,
    NULLIF(p_payload ->> 'referenceNumber', ''),
    NULLIF(p_payload ->> 'shipmentDate', '')::date,
    NULLIF(p_payload ->> 'deliveryMethod', ''),
    NULLIF(p_payload ->> 'salesPersonId', '')::uuid,
    p_store_id,
    NULLIF(p_payload ->> 'estimateId', '')::uuid
  )
  RETURNING id, sales_order_number INTO v_order_id, v_so_number;

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

    v_final_price := public.erp_resolve_sales_order_final_price(v_item, v_product.price);

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

  PERFORM public.inventory_apply_order_stock(v_order_id, -1);

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'salesOrderNumber', COALESCE(v_so_number, v_order_id::text)
  );
END;
$$;


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

  PERFORM public.assert_erp_salesman_id(NULLIF(p_payload ->> 'salesPersonId', '')::uuid);

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

    v_final_price := public.erp_resolve_sales_order_final_price(v_item, v_product.price);

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


COMMIT;
