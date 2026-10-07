-- Online billing stores product_id + variant_id.
-- Accounting invoices/estimates/credit notes store product_id only.

BEGIN;

-- ─── Backfill online order lines ─────────────────────────────────────────────

UPDATE public.order_items oi
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = oi.variant_id
  AND oi.product_id IS NULL;

-- ─── Accounting line items: never persist variant_id ─────────────────────────

CREATE OR REPLACE FUNCTION public.erp_accounting_line_product_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.product_id IS NULL AND NEW.variant_id IS NOT NULL THEN
    SELECT product_id INTO NEW.product_id
    FROM public.product_variants
    WHERE id = NEW.variant_id;
  END IF;

  NEW.variant_id := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_items_product_only ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_product_only
  BEFORE INSERT OR UPDATE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.erp_accounting_line_product_only();

DROP TRIGGER IF EXISTS trg_estimate_lines_product_only ON public.erp_estimate_lines;
CREATE TRIGGER trg_estimate_lines_product_only
  BEFORE INSERT OR UPDATE ON public.erp_estimate_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.erp_accounting_line_product_only();

DROP TRIGGER IF EXISTS trg_credit_note_lines_product_only ON public.erp_credit_note_lines;
CREATE TRIGGER trg_credit_note_lines_product_only
  BEFORE INSERT OR UPDATE ON public.erp_credit_note_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.erp_accounting_line_product_only();

UPDATE public.invoice_items ii
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = ii.variant_id AND ii.product_id IS NULL;

UPDATE public.invoice_items SET variant_id = NULL WHERE variant_id IS NOT NULL;
UPDATE public.erp_estimate_lines SET variant_id = NULL WHERE variant_id IS NOT NULL;
UPDATE public.erp_credit_note_lines SET variant_id = NULL WHERE variant_id IS NOT NULL;

-- ─── Online checkout: persist product_id + variant_id ────────────────────────

CREATE OR REPLACE FUNCTION public.place_customer_order(
  p_address_id uuid,
  p_items jsonb,
  p_merchant_note text DEFAULT NULL,
  p_preferred_delivery_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_grand_total numeric := 0;
  v_balance numeric;
  v_note text;
  v_order jsonb;
  v_capture_payments boolean := true;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_address_id IS NULL THEN
    RAISE EXCEPTION 'Delivery address is required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.addresses WHERE id = p_address_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Selected delivery address was not found';
  END IF;

  SELECT COALESCE(capture_payments, true) INTO v_capture_payments
  FROM public.app_settings WHERE id = 1;

  v_note := nullif(trim(coalesce(p_merchant_note, '')), '');

  SELECT COALESCE(sum((elem->>'final_price')::numeric * (elem->>'quantity')::numeric), 0)
  INTO v_grand_total
  FROM jsonb_array_elements(p_items) AS elem;

  IF v_grand_total IS NULL OR v_grand_total <= 0 THEN
    RAISE EXCEPTION 'Invalid order total';
  END IF;

  IF v_capture_payments THEN
    SELECT balance INTO v_balance FROM public.wallet WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
    IF v_balance < v_grand_total THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  END IF;

  INSERT INTO public.orders (
    user_id, address_id, total_amount, status, payment_status,
    merchant_note, inventory_committed, inventory_reserved, source, fulfillment_status,
    preferred_delivery_date
  )
  VALUES (
    v_uid, p_address_id, round(v_grand_total, 2), 'pending',
    CASE WHEN v_capture_payments THEN 'pending' ELSE 'not_required' END,
    v_note, false, false, 'online', 'none',
    p_preferred_delivery_date
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, quantity, price, vendor_id,
    base_price, final_price, margin_amount, product_name
  )
  SELECT
    v_order_id,
    COALESCE(
      NULLIF(max(elem->>'product_id'), '')::uuid,
      pv.product_id
    ),
    (elem->>'variant_id')::uuid,
    sum((elem->>'quantity')::int)::int,
    max((elem->>'final_price')::numeric),
    nullif(max(elem->>'vendor_id'), '')::uuid,
    max((elem->>'base_price')::numeric),
    max((elem->>'final_price')::numeric),
    max((elem->>'margin_amount')::numeric),
    max(elem->>'product_name')
  FROM jsonb_array_elements(p_items) AS elem
  JOIN public.product_variants pv ON pv.id = (elem->>'variant_id')::uuid
  GROUP BY (elem->>'variant_id')::uuid, pv.product_id;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = v_order_id) THEN
    RAISE EXCEPTION 'Order items could not be created — variants are required for online sales';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = v_order_id AND (product_id IS NULL OR variant_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Online order lines require both product and variant';
  END IF;

  PERFORM public.setup_order_fulfillments_and_reserve(v_order_id);

  IF v_capture_payments THEN
    PERFORM public.wallet_debit(v_grand_total, 'Order ' || v_order_id::text);
    UPDATE public.orders SET payment_status = 'paid' WHERE id = v_order_id;
  END IF;

  SELECT to_jsonb(o) INTO v_order FROM public.orders o WHERE o.id = v_order_id;
  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_customer_order(uuid, jsonb, text, date) TO authenticated;

-- ─── Customer edit: keep product_id + variant_id ─────────────────────────────

CREATE OR REPLACE FUNCTION public.customer_edit_order(p_order_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_old_total numeric;
  v_new_total numeric := 0;
  v_diff numeric;
  v_balance numeric;
  v_committed boolean;
  v_capture_payments boolean := true;
  v_was_paid boolean;
  r_old record;
  v_flag text;
  v_order_json jsonb;
  v_product_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Order id is required'; END IF;

  SELECT o.*, o.inventory_committed AS inv_committed
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.user_id <> v_uid THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_order.status IN ('shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Order cannot be edited in status %', v_order.status;
  END IF;

  v_committed := COALESCE(v_order.inventory_committed, false);

  IF v_committed THEN
    RAISE EXCEPTION 'Cannot edit order after shipment';
  END IF;

  PERFORM public.release_order_inventory_reservations(p_order_id);

  CREATE TEMP TABLE _old_order_items ON COMMIT DROP AS
  SELECT variant_id, quantity::int AS quantity
  FROM public.order_items
  WHERE order_id = p_order_id AND variant_id IS NOT NULL;

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  FOR r_old IN
    SELECT
      (elem->>'variant_id')::uuid AS variant_id,
      COALESCE(NULLIF(max(elem->>'product_id'), '')::uuid, pv.product_id) AS product_id,
      sum((elem->>'quantity')::int)::int AS quantity,
      max((elem->>'final_price')::numeric) AS final_price,
      nullif(max(elem->>'vendor_id'), '')::uuid AS vendor_id,
      max((elem->>'base_price')::numeric) AS base_price,
      max((elem->>'margin_amount')::numeric) AS margin_amount,
      max(elem->>'product_name') AS product_name
    FROM jsonb_array_elements(p_items) AS elem
    JOIN public.product_variants pv ON pv.id = (elem->>'variant_id')::uuid
    GROUP BY (elem->>'variant_id')::uuid, pv.product_id
  LOOP
    IF r_old.variant_id IS NULL OR r_old.product_id IS NULL THEN
      RAISE EXCEPTION 'Online order lines require both product and variant';
    END IF;

    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM _old_order_items o WHERE o.variant_id = r_old.variant_id) THEN 'added'
      WHEN EXISTS (
        SELECT 1 FROM _old_order_items o
        WHERE o.variant_id = r_old.variant_id AND o.quantity IS DISTINCT FROM r_old.quantity
      ) THEN 'modified'
      ELSE NULL
    END INTO v_flag;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, quantity, price, vendor_id,
      base_price, final_price, margin_amount, product_name, customer_edit_flag
    )
    VALUES (
      p_order_id, r_old.product_id, r_old.variant_id, r_old.quantity, r_old.final_price, r_old.vendor_id,
      r_old.base_price, r_old.final_price, r_old.margin_amount, r_old.product_name, v_flag
    );

    v_new_total := v_new_total + r_old.final_price * r_old.quantity;
  END LOOP;

  PERFORM public.setup_order_fulfillments_and_reserve(p_order_id);

  SELECT COALESCE(capture_payments, true) INTO v_capture_payments FROM public.app_settings WHERE id = 1;
  v_was_paid := v_order.payment_status = 'paid';
  v_old_total := COALESCE(v_order.total_amount, 0);
  v_diff := round(v_new_total - v_old_total, 2);

  IF v_capture_payments AND v_was_paid THEN
    IF v_diff > 0 THEN
      PERFORM public.wallet_debit(v_diff, 'Order edit ' || p_order_id::text);
    ELSIF v_diff < 0 THEN
      UPDATE public.wallet SET balance = balance + abs(v_diff), updated_at = now() WHERE user_id = v_uid;
      INSERT INTO public.transactions (user_id, amount, type, reference)
      VALUES (v_uid, abs(v_diff), 'credit', 'Order edit ' || p_order_id::text);
    END IF;
  END IF;

  UPDATE public.orders
  SET total_amount = v_new_total, subtotal = v_new_total, tax = 0, discount = 0,
      status = 'pending', customer_edited_at = now()
  WHERE id = p_order_id;

  SELECT to_jsonb(o) INTO v_order_json FROM public.orders o WHERE o.id = p_order_id;
  RETURN v_order_json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_edit_order(uuid, jsonb) TO authenticated;

-- ─── Convert order → accounting invoice: product_id only ─────────────────────

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
  v_product_id uuid;
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
    LIMIT 1;
  END IF;

  IF v_existing_invoice IS NOT NULL THEN
    UPDATE public.orders SET invoice_id = v_existing_invoice WHERE id = p_order_id AND invoice_id IS NULL;
    RETURN v_existing_invoice;
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
        NULLIF(p.tax_rate_percent, 0),
        0
      ) AS resolved_tax_rate
    FROM public.order_items oi
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = COALESCE(oi.product_id, pv.product_id)
    WHERE oi.order_id = p_order_id
  LOOP
    v_qty := COALESCE(v_item.quantity, 0);
    v_unit_price := COALESCE(v_item.final_price, v_item.price, 0);
    v_tax_rate := COALESCE(v_item.resolved_tax_rate, 0);
    v_product_id := COALESCE(
      v_item.product_id,
      (SELECT product_id FROM public.product_variants WHERE id = v_item.variant_id)
    );

    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required on invoice lines (%)', COALESCE(v_item.product_name, 'Item');
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
      invoice_id, variant_id, product_id, product_name, quantity, unit_price,
      base_price, gst_rate, gst_amount, total_amount, vendor_id, taxable_amount
    )
    VALUES (
      v_invoice_id,
      NULL,
      v_product_id,
      COALESCE(v_item.product_name, 'Item'),
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

GRANT EXECUTE ON FUNCTION public.convert_order_to_erp_invoice(uuid, uuid) TO authenticated;

-- ─── Credit note create: persist product_id (variant stripped by trigger) ────

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
  v_stock record;
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
  v_product_id uuid;
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

  SELECT t.out_id, t.out_ref INTO v_cn_id, v_cn_number
  FROM public.erp_next_document_ref('credit_note') AS t;

  INSERT INTO public.erp_credit_notes (
    id, credit_note_number, store_id, user_id, reference, credit_note_date,
    status, notes, balance_remaining, created_by, inventory_committed,
    source_invoice_id, attachment_url
  )
  VALUES (
    v_cn_id, v_cn_number, p_store_id, p_user_id, p_reference, p_credit_note_date,
    CASE WHEN p_finalize THEN 'issued' ELSE 'draft' END,
    p_notes, 0, p_created_by, false,
    p_source_invoice_id, p_attachment_url
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_unit_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    IF v_product_id IS NULL AND NULLIF(v_line ->> 'variant_id', '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid;
    END IF;

    INSERT INTO public.erp_credit_note_lines (
      credit_note_id, variant_id, product_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_cn_id,
      NULL,
      v_product_id,
      v_line ->> 'product_name',
      v_qty, v_unit_price, v_tax_rate, v_line_tax, v_line_total
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  UPDATE public.erp_credit_notes
  SET subtotal = v_subtotal, tax_amount = v_tax, total_amount = v_total, balance_remaining = v_total
  WHERE id = v_cn_id;

  IF p_finalize AND p_restore_stock THEN
    SELECT inventory_committed INTO v_already_committed
    FROM public.erp_credit_notes WHERE id = v_cn_id FOR UPDATE;

    IF NOT COALESCE(v_already_committed, false) THEN
      FOR v_stock IN
        SELECT product_id, quantity, unit_price
        FROM public.erp_credit_note_lines
        WHERE credit_note_id = v_cn_id AND product_id IS NOT NULL
      LOOP
        PERFORM public.store_product_inventory_apply_delta(
          p_store_id, v_stock.product_id, v_stock.quantity, p_created_by
        );
        PERFORM public.log_product_stock_movement(
          v_stock.product_id,
          v_stock.quantity,
          'return',
          v_cn_id,
          'credit_note',
          'Credit note stock restore',
          p_store_id,
          NULL,
          v_stock.unit_price,
          p_created_by
        );
      END LOOP;
      UPDATE public.erp_credit_notes SET inventory_committed = true WHERE id = v_cn_id;
    END IF;
  END IF;

  IF p_finalize AND p_source_invoice_id IS NOT NULL AND v_total > 0 THEN
    v_apply_amount := LEAST(v_total, COALESCE(v_invoice_balance, 0));
    IF v_apply_amount > 0 THEN
      PERFORM public.apply_erp_credit_note(v_cn_id, p_source_invoice_id, v_apply_amount, p_created_by);
    END IF;
  END IF;

  RETURN v_cn_id;
END;
$$;

COMMIT;
