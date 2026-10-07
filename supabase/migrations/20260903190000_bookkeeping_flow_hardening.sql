-- Bookkeeping flow hardening: prevent double stock, wallet AR gaps, PO/bill tracking issues.

BEGIN;

-- ─── Invoice balance: never resurrect cancelled invoices ─────────────────────

CREATE OR REPLACE FUNCTION public.recalculate_invoice_balance(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_paid numeric;
  v_credits numeric;
  v_balance numeric;
  v_due date;
  v_status text;
BEGIN
  SELECT total_amount, due_date, status
  INTO v_total, v_due, v_status
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid
  FROM public.erp_payment_allocations
  WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_credits
  FROM public.erp_credit_note_applications
  WHERE invoice_id = p_invoice_id;

  v_balance := GREATEST(0, COALESCE(v_total, 0) - v_paid - v_credits);

  IF v_balance <= 0 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 OR v_credits > 0 THEN
    v_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < CURRENT_DATE AND v_balance > 0 THEN
    v_status := 'overdue';
  ELSE
    v_status := 'issued';
  END IF;

  UPDATE public.invoices
  SET
    amount_paid = v_paid,
    credits_applied = v_credits,
    balance_due = v_balance,
    status = v_status
  WHERE id = p_invoice_id;
END;
$$;

-- ─── Purchase bill cancel: void journals + revert PO when no active bills ─────

CREATE OR REPLACE FUNCTION public.cancel_erp_purchase_bill(
  p_bill_id uuid,
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
  v_po_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id, po_id
  INTO v_status, v_store_id, v_po_id
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_supplier_payment_allocations
  WHERE purchase_bill_id = p_bill_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.erp_vendor_credit_applications
  WHERE purchase_bill_id = p_bill_id;

  IF v_paid > 0 OR v_credits > 0 THEN
    RAISE EXCEPTION 'Cannot cancel bill with payments or vendor credits applied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.erp_purchase_bills
    WHERE id = p_bill_id AND inventory_committed = true
  ) THEN
    PERFORM public.inventory_apply_purchase_bill_stock(p_bill_id, -1);
  END IF;

  PERFORM public.void_journals_for_entity('purchase_bill', p_bill_id);

  UPDATE public.erp_purchase_bills
  SET status = 'cancelled', balance_due = 0, updated_at = now()
  WHERE id = p_bill_id;

  IF v_po_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.erp_purchase_bills
    WHERE po_id = v_po_id
      AND status <> 'cancelled'
      AND id <> p_bill_id
  ) THEN
    UPDATE public.purchase_orders
    SET status = 'accepted', updated_at = now()
    WHERE id = v_po_id AND status = 'converted';
  END IF;
END;
$$;

-- ─── One active bill per PO ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_purchase_bill(
  p_vendor_id uuid,
  p_store_id uuid,
  p_purchase_date date,
  p_due_date date DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_landed_costs jsonb DEFAULT '[]'::jsonb,
  p_discount numeric DEFAULT 0,
  p_po_id uuid DEFAULT NULL,
  p_vendor_bill_number text DEFAULT NULL,
  p_grn_reference text DEFAULT NULL,
  p_batch_reference text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sales_person_id uuid DEFAULT NULL,
  p_finalize boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id uuid;
  v_bill_number text;
  v_line jsonb;
  v_lc jsonb;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_landed_total numeric := 0;
  v_qty numeric;
  v_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
  v_batch_code text;
  v_batch_number text;
BEGIN
  IF p_created_by IS NULL OR NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_vendor_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Vendor and store are required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF p_po_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.erp_purchase_bills
    WHERE po_id = p_po_id
      AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'An active purchase bill already exists for this purchase order';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  IF p_batch_reference IS NULL OR p_batch_reference = '' THEN
    v_batch_code := format('%s_%s', p_store_id::text, to_char(now(), 'YYYYMMDDHH24MISS'));
    v_batch_number := substr(to_char(floor(random() * 100000)::integer, 'FM99999'), 1, 10);
  ELSE
    v_batch_code := p_batch_reference;
    v_batch_number := p_batch_reference;
  END IF;

  SELECT t.out_id, t.out_ref INTO v_bill_id, v_bill_number
  FROM public.erp_next_document_ref('purchase_bill') AS t;

  INSERT INTO public.erp_purchase_bills (
    id, purchase_bill_number, vendor_bill_number, vendor_id, po_id, store_id,
    purchase_date, due_date, grn_reference, batch_reference, batch_code, batch_number,
    reference, sales_person_id, status, notes, created_by
  )
  VALUES (
    v_bill_id, v_bill_number, p_vendor_bill_number, p_vendor_id, p_po_id, p_store_id,
    p_purchase_date, p_due_date, p_grn_reference, p_batch_reference,
    v_batch_code, v_batch_number, p_reference, p_sales_person_id,
    'draft', p_notes, p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_price := COALESCE((v_line ->> 'purchase_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    INSERT INTO public.erp_purchase_bill_lines (
      purchase_bill_id, variant_id, product_name, barcode, expiry_date,
      quantity, purchase_price, tax_rate_percent, tax_amount, line_total, unit_id
    )
    VALUES (
      v_bill_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_line ->> 'barcode',
      NULLIF(v_line ->> 'expiry_date', '')::date,
      v_qty, v_price, v_tax_rate, v_line_tax, v_line_total,
      NULLIF(v_line ->> 'unit_id', '')::uuid
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  FOR v_lc IN SELECT * FROM jsonb_array_elements(p_landed_costs)
  LOOP
    v_qty := COALESCE((v_lc ->> 'quantity')::numeric, 1);
    v_price := COALESCE((v_lc ->> 'rate')::numeric, 0);
    v_tax_rate := COALESCE((v_lc ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    INSERT INTO public.erp_purchase_bill_landed_costs (
      purchase_bill_id, landed_cost_item_id, name, quantity, rate,
      tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_bill_id,
      NULLIF(v_lc ->> 'landed_cost_item_id', '')::uuid,
      v_lc ->> 'name',
      v_qty, v_price, v_tax_rate, v_line_tax, v_line_total
    );

    v_landed_total := v_landed_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_subtotal + v_tax - COALESCE(p_discount, 0)) + v_landed_total;

  UPDATE public.erp_purchase_bills
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax,
    discount = COALESCE(p_discount, 0),
    landed_cost_total = v_landed_total,
    total_amount = v_total,
    balance_due = CASE WHEN p_finalize THEN v_total ELSE 0 END,
    status = CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,
    updated_at = now()
  WHERE id = v_bill_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, p_created_by);
  END IF;

  RETURN v_bill_id;
END;
$$;

-- ─── Order → invoice: ship-first for online, auto-allocate wallet payments ───

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
  v_is_pos boolean;
  v_is_online boolean;
  v_wallet_account uuid;
  v_allocations jsonb;
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

  v_is_pos := COALESCE(v_order.merchant_note, '') ILIKE '%POS counter sale%';
  v_is_online := v_order.source IS NULL OR v_order.source IN ('online', 'manual');

  IF v_is_online AND NOT v_is_pos AND NOT COALESCE(v_order.inventory_committed, false) THEN
    RAISE EXCEPTION 'Ship the order before creating an invoice — inventory must be committed first';
  END IF;

  IF v_order.source = 'sales_order' THEN
    v_source := 'sales_order';
    v_ref := COALESCE(v_order.reference_number, v_order.sales_order_number);
    v_notes := 'Converted from sales order ' || COALESCE(v_order.sales_order_number, p_order_id::text);
  ELSIF v_is_pos THEN
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

  IF v_order.payment_status = 'paid' AND v_total > 0 THEN
    v_wallet_account := COALESCE(
      public.get_account_by_code('PAYMENT_CLEARING'),
      public.ensure_system_ledger_account('PAYMENT_CLEARING', 'Payment Clearing')
    );

    IF v_wallet_account IS NOT NULL THEN
      v_allocations := jsonb_build_array(
        jsonb_build_object('invoice_id', v_invoice_id, 'amount', v_total)
      );

      PERFORM public.record_erp_customer_payment(
        v_order.user_id,
        v_order.store_id,
        CURRENT_DATE,
        'wallet',
        v_wallet_account,
        v_total,
        'Wallet payment for order ' || p_order_id::text,
        'Auto-recorded from prepaid wallet order',
        false,
        v_allocations,
        p_created_by,
        0,
        NULL
      );
    END IF;
  END IF;

  RETURN v_invoice_id;
END;
$$;

-- ─── Storefront invoice: return existing ERP invoice instead of duplicating ──

CREATE OR REPLACE FUNCTION public.generate_invoice_for_order(
  p_order_id uuid,
  p_gst_number text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 0;
  v_gst_total numeric := 0;
  v_total numeric := 0;
  v_item RECORD;
  v_gst_rate numeric := 18;
BEGIN
  SELECT id INTO v_invoice_id
  FROM public.invoices
  WHERE order_id = p_order_id
    AND status <> 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    RETURN (
      SELECT json_build_object(
        'id', i.id,
        'order_id', i.order_id,
        'user_id', i.user_id,
        'invoice_number', i.invoice_number,
        'gst_number', i.gst_number,
        'subtotal', i.subtotal,
        'gst_amount', i.gst_amount,
        'total_amount', i.total_amount,
        'balance_due', i.balance_due,
        'status', i.status,
        'created_at', i.created_at,
        'due_date', i.due_date,
        'issued_at', i.issued_at,
        'items', (
          SELECT COALESCE(json_agg(json_build_object(
            'id', ii.id,
            'variant_id', ii.variant_id,
            'product_name', ii.product_name,
            'quantity', ii.quantity,
            'unit_price', ii.unit_price,
            'base_price', ii.base_price,
            'gst_rate', ii.gst_rate,
            'gst_amount', ii.gst_amount,
            'total_amount', ii.total_amount
          )), '[]'::json)
          FROM public.invoice_items ii
          WHERE ii.invoice_id = i.id
        )
      )
      FROM public.invoices i
      WHERE i.id = v_invoice_id
    );
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_invoice_number := public.generate_invoice_number();

  INSERT INTO public.invoices (
    order_id, user_id, invoice_number, gst_number,
    subtotal, gst_amount, total_amount, status,
    created_at, due_date, source, balance_due, amount_paid, credits_applied
  ) VALUES (
    p_order_id, v_order.user_id, v_invoice_number, p_gst_number,
    0, 0, 0, 'issued',
    now(), now() + interval '30 days', 'order', 0, 0, 0
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT * FROM public.order_items WHERE order_id = p_order_id
  LOOP
    v_gst_rate := 18;
    v_item.base_price := v_item.final_price;
    v_item.gst_amount := (v_item.final_price * v_gst_rate / 100) * v_item.quantity;
    v_item.total_amount := v_item.final_price * v_item.quantity + v_item.gst_amount;

    INSERT INTO public.invoice_items (
      invoice_id, variant_id, product_name, quantity,
      unit_price, base_price, gst_rate, gst_amount, total_amount, vendor_id,
      taxable_amount
    ) VALUES (
      v_invoice_id, v_item.variant_id, v_item.product_name, v_item.quantity,
      v_item.price, v_item.base_price, v_gst_rate, v_item.gst_amount, v_item.total_amount, v_item.vendor_id,
      v_item.final_price * v_item.quantity
    );

    v_subtotal := v_subtotal + (v_item.final_price * v_item.quantity);
    v_gst_total := v_gst_total + v_item.gst_amount;
    v_total := v_total + v_item.total_amount;
  END LOOP;

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    gst_amount = v_gst_total,
    total_amount = v_total,
    balance_due = v_total,
    issued_at = now()
  WHERE id = v_invoice_id;

  RETURN (
    SELECT json_build_object(
      'id', i.id,
      'order_id', i.order_id,
      'user_id', i.user_id,
      'invoice_number', i.invoice_number,
      'gst_number', i.gst_number,
      'subtotal', i.subtotal,
      'gst_amount', i.gst_amount,
      'total_amount', i.total_amount,
      'balance_due', i.balance_due,
      'status', i.status,
      'created_at', i.created_at,
      'due_date', i.due_date,
      'issued_at', i.issued_at,
      'items', (
        SELECT COALESCE(json_agg(json_build_object(
          'id', ii.id,
          'variant_id', ii.variant_id,
          'product_name', ii.product_name,
          'quantity', ii.quantity,
          'unit_price', ii.unit_price,
          'base_price', ii.base_price,
          'gst_rate', ii.gst_rate,
          'gst_amount', ii.gst_amount,
          'total_amount', ii.total_amount
        )), '[]'::json)
        FROM public.invoice_items ii
        WHERE ii.invoice_id = i.id
      )
    )
    FROM public.invoices i
    WHERE i.id = v_invoice_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_invoice_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_erp_purchase_bill(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_purchase_bill(
  uuid, uuid, date, date, jsonb, jsonb, numeric, uuid, text, text, text, text, text, uuid, boolean, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_order_to_erp_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invoice_for_order(uuid, text) TO authenticated;

COMMIT;
