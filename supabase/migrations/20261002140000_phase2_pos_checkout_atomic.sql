-- Phase 2: POS checkout — single transaction, row locks on store inventory, idempotency.

BEGIN;

-- ─── Idempotency ledger (RPC-only; no direct client access) ─────────────────

CREATE TABLE IF NOT EXISTS public.pos_checkout_operations (
  idempotency_key uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_checkout_operations_order_id_idx
  ON public.pos_checkout_operations (order_id);

ALTER TABLE public.pos_checkout_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pos_checkout_operations FROM PUBLIC;
REVOKE ALL ON TABLE public.pos_checkout_operations FROM authenticated;

-- ─── Immediate POS sale at store (online inventory row; no reservation hop) ─

CREATE OR REPLACE FUNCTION public.pos_store_variant_sale_immediate(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_reference_id uuid,
  p_reference_type text,
  p_reason text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_reserved numeric;
  v_available numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN;
  END IF;

  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  SELECT stock, reserved_stock
  INTO v_stock, v_reserved
  FROM public.inventory
  WHERE store_id = p_store_id AND variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_STOCK_UNAVAILABLE: variant % has no sellable stock at this store', p_variant_id
      USING ERRCODE = 'P0001';
  END IF;

  v_available := COALESCE(v_stock, 0) - COALESCE(v_reserved, 0);
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'POS_STOCK_UNAVAILABLE: insufficient stock (available %, requested %)',
      v_available, p_quantity
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_stock, 0) < p_quantity THEN
    RAISE EXCEPTION 'POS_STOCK_UNAVAILABLE: insufficient stock'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.inventory
  SET stock = stock - p_quantity, updated_at = now()
  WHERE store_id = p_store_id AND variant_id = p_variant_id;

  PERFORM public.log_stock_movement(
    p_variant_id, -p_quantity, 'sale', p_reference_id, p_reference_type, p_reason,
    p_store_id, NULL, NULL, p_user_id
  );
END;
$$;

-- ─── Atomic POS counter sale ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_pos_counter_sale(
  p_idempotency_key uuid,
  p_store_id uuid,
  p_lines jsonb,
  p_subtotal numeric,
  p_tax numeric,
  p_discount numeric,
  p_total_amount numeric,
  p_customer_user_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_company text DEFAULT NULL,
  p_gst_number text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_order_id uuid;
  v_invoice_id uuid;
  v_fulfillment_id uuid;
  v_line jsonb;
  v_variant_id uuid;
  v_qty numeric;
  v_fulfillment_line record;
  v_item_count integer := 0;
  v_agg record;
  v_customer_id uuid;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'POS_CHECKOUT_INVALID: idempotency key is required';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'POS_CHECKOUT_INVALID: store is required';
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'POS_CHECKOUT_INVALID: at least one line is required';
  END IF;

  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  PERFORM pg_advisory_xact_lock(hashtext(p_idempotency_key::text));

  SELECT o.order_id, o.invoice_id
  INTO v_existing
  FROM public.pos_checkout_operations o
  WHERE o.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'order_id', v_existing.order_id,
      'invoice_id', v_existing.invoice_id,
      'idempotent_replay', true
    );
  END IF;

  SET LOCAL lock_timeout = '15s';

  v_customer_id := p_customer_user_id;
  IF v_customer_id IS NULL THEN
    v_customer_id := public.ensure_walk_in_customer();
  END IF;

  v_order_id := gen_random_uuid();

  INSERT INTO public.orders (
    id, user_id, address_id, total_amount, status, payment_status,
    customer_name, phone, company, gst_number, source, store_id,
    subtotal, tax, discount, merchant_note, created_by_admin_id,
    fulfillment_status, inventory_committed, inventory_reserved
  )
  VALUES (
    v_order_id, v_customer_id, NULL, p_total_amount, 'processing', 'paid',
    NULLIF(trim(p_customer_name), ''), NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_company), ''), NULLIF(trim(p_gst_number), ''),
    'online', p_store_id, p_subtotal, p_tax, p_discount,
    'POS counter sale', p_created_by, 'none', false, false
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line ->> 'variant_id', '')::uuid;
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);

    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'POS_CHECKOUT_INVALID: each line needs a variant and positive quantity';
    END IF;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, quantity, price, vendor_id,
      base_price, final_price, margin_amount, product_name
    )
    VALUES (
      v_order_id,
      NULLIF(v_line ->> 'product_id', '')::uuid,
      v_variant_id,
      v_qty::integer,
      COALESCE((v_line ->> 'final_price')::numeric, (v_line ->> 'unit_price')::numeric, 0),
      NULLIF(v_line ->> 'vendor_id', '')::uuid,
      COALESCE((v_line ->> 'base_price')::numeric, 0),
      COALESCE((v_line ->> 'final_price')::numeric, (v_line ->> 'unit_price')::numeric, 0),
      COALESCE((v_line ->> 'margin_amount')::numeric, 0),
      COALESCE(v_line ->> 'product_name', 'Item')
    );

    v_item_count := v_item_count + v_qty::integer;
  END LOOP;

  FOR v_agg IN
    SELECT variant_id, SUM(quantity)::numeric AS qty
    FROM public.order_items
    WHERE order_id = v_order_id AND variant_id IS NOT NULL
    GROUP BY variant_id
    ORDER BY variant_id
  LOOP
    PERFORM public.pos_store_variant_sale_immediate(
      p_store_id,
      v_agg.variant_id,
      v_agg.qty,
      v_order_id,
      'order',
      'POS counter sale',
      p_created_by
    );
  END LOOP;

  v_fulfillment_id := gen_random_uuid();
  INSERT INTO public.order_fulfillments (
    id, order_id, store_id, status, reserved_at, shipped_at, inventory_committed
  )
  VALUES (
    v_fulfillment_id, v_order_id, p_store_id, 'shipped', now(), now(), true
  );

  FOR v_fulfillment_line IN
    SELECT oi.id AS order_item_id, oi.variant_id, oi.quantity::numeric AS qty
    FROM public.order_items oi
    WHERE oi.order_id = v_order_id AND oi.variant_id IS NOT NULL
    ORDER BY oi.variant_id, oi.id
  LOOP
    INSERT INTO public.order_fulfillment_items (
      fulfillment_id, order_item_id, variant_id, quantity,
      reserved_quantity, shipped_quantity
    )
    VALUES (
      v_fulfillment_id,
      v_fulfillment_line.order_item_id,
      v_fulfillment_line.variant_id,
      v_fulfillment_line.qty,
      v_fulfillment_line.qty,
      v_fulfillment_line.qty
    );
  END LOOP;

  UPDATE public.orders
  SET
    status = 'delivered',
    fulfillment_status = 'shipped',
    inventory_committed = true,
    inventory_reserved = false
  WHERE id = v_order_id;

  v_invoice_id := public.convert_order_to_erp_invoice(v_order_id, p_created_by);

  INSERT INTO public.pos_checkout_operations (
    idempotency_key, store_id, order_id, invoice_id, created_by
  )
  VALUES (
    p_idempotency_key, p_store_id, v_order_id, v_invoice_id, p_created_by
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'invoice_id', v_invoice_id,
    'total_amount', p_total_amount,
    'item_count', v_item_count,
    'idempotent_replay', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_store_variant_sale_immediate(
  uuid, uuid, numeric, uuid, text, text, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.complete_pos_counter_sale(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric,
  uuid, text, text, text, text, uuid
) TO authenticated;

-- ─── Restore POS walk-in + cash payment on order → invoice (regression fix) ─

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
  v_payment_account uuid;
  v_payment_mode text;
  v_allocations jsonb;
  v_customer_id uuid;
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

  v_is_pos := COALESCE(v_order.merchant_note, '') ILIKE '%POS counter sale%';

  v_customer_id := v_order.user_id;
  IF v_customer_id IS NULL THEN
    IF v_is_pos THEN
      v_customer_id := public.ensure_walk_in_customer();
      UPDATE public.orders SET user_id = v_customer_id WHERE id = p_order_id;
      v_order.user_id := v_customer_id;
    ELSE
      RAISE EXCEPTION 'Order has no customer — link a customer before invoicing';
    END IF;
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
    IF COALESCE(v_order.customer_name, '') <> '' THEN
      v_notes := v_notes || ' · Walk-in: ' || v_order.customer_name;
    END IF;
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
    v_invoice_id, p_order_id, v_customer_id, v_invoice_number, 0, 0, 0,
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

  IF v_order.payment_status = 'paid' AND v_total > 0 THEN
    IF v_is_pos THEN
      v_payment_account := COALESCE(
        public.get_account_by_code('CASH'),
        public.ensure_system_ledger_account('CASH', 'Cash')
      );
      v_payment_mode := 'cash';
    ELSE
      v_payment_account := COALESCE(
        public.get_account_by_code('PAYMENT_CLEARING'),
        public.ensure_system_ledger_account('PAYMENT_CLEARING', 'Payment Clearing')
      );
      v_payment_mode := 'wallet';
    END IF;

    IF v_payment_account IS NOT NULL THEN
      v_allocations := jsonb_build_array(
        jsonb_build_object('invoice_id', v_invoice_id, 'amount', v_total)
      );

      PERFORM public.record_erp_customer_payment(
        v_customer_id,
        v_order.store_id,
        CURRENT_DATE,
        v_payment_mode,
        v_payment_account,
        v_total,
        CASE
          WHEN v_is_pos THEN 'Cash sale for order ' || p_order_id::text
          ELSE 'Wallet payment for order ' || p_order_id::text
        END,
        CASE
          WHEN v_is_pos THEN 'Auto-recorded POS cash sale'
          ELSE 'Auto-recorded from prepaid wallet order'
        END,
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

GRANT EXECUTE ON FUNCTION public.convert_order_to_erp_invoice(uuid, uuid) TO authenticated;

COMMIT;
