-- Product-first ERP: optional variants, product-level document lines, physical stock RPCs.

BEGIN;

-- ─── 1. Schema: nullable variant_id + product_id on remaining line tables ───

ALTER TABLE public.erp_stock_adjustment_lines
  ALTER COLUMN variant_id DROP NOT NULL;

ALTER TABLE public.erp_transfer_request_lines
  ALTER COLUMN variant_id DROP NOT NULL;

ALTER TABLE public.erp_store_transfer_lines
  ALTER COLUMN variant_id DROP NOT NULL;

ALTER TABLE public.erp_estimate_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

ALTER TABLE public.erp_credit_note_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

ALTER TABLE public.erp_vendor_credit_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

UPDATE public.erp_estimate_lines el
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = el.variant_id AND el.product_id IS NULL;

UPDATE public.erp_credit_note_lines cl
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = cl.variant_id AND cl.product_id IS NULL;

UPDATE public.erp_vendor_credit_lines vcl
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = vcl.variant_id AND vcl.product_id IS NULL;

-- ─── 2. Purchase bill stock: product-level store inventory ───────────────────

CREATE OR REPLACE FUNCTION public.inventory_apply_purchase_bill_stock(
  p_bill_id uuid,
  p_multiplier integer DEFAULT 1,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_store_id uuid;
  v_delta numeric;
  v_actor uuid;
BEGIN
  v_actor := COALESCE(p_user_id, auth.uid());

  IF p_bill_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill id is required';
  END IF;

  IF p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid stock multiplier';
  END IF;

  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id INTO v_store_id
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill store not found';
  END IF;

  PERFORM public.require_store_access(v_store_id, v_actor);

  FOR r IN
    SELECT
      COALESCE(pbl.product_id, pv.product_id) AS product_id,
      SUM(pbl.quantity)::numeric AS qty,
      AVG(pbl.purchase_price) AS avg_price
    FROM public.erp_purchase_bill_lines pbl
    LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
    WHERE pbl.purchase_bill_id = p_bill_id
      AND COALESCE(pbl.product_id, pv.product_id) IS NOT NULL
    GROUP BY COALESCE(pbl.product_id, pv.product_id)
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    PERFORM public.store_product_inventory_apply_delta(v_store_id, r.product_id, v_delta, v_actor);

    IF r.avg_price > 0 THEN
      UPDATE public.store_product_inventory
      SET purchase_price = r.avg_price, updated_at = now()
      WHERE store_id = v_store_id AND product_id = r.product_id;
    END IF;

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta, 'purchase', p_bill_id, 'purchase_bill',
      'Purchase Bill Receipt', v_store_id, NULL, r.avg_price, v_actor
    );
  END LOOP;
END;
$$;

-- Patch purchase bill create: persist product_id on lines
-- Drop legacy overload (no p_expected_delivery_date) before replacing canonical signature.
DROP FUNCTION IF EXISTS public.create_erp_purchase_bill(
  uuid,
  uuid,
  date,
  date,
  jsonb,
  jsonb,
  numeric,
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  uuid
);

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
  p_expected_delivery_date date DEFAULT NULL,
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
  v_expected_delivery date;
  v_product_id uuid;
BEGIN
  IF p_created_by IS NULL OR NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_vendor_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Vendor and store are required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_expected_delivery := p_expected_delivery_date;
  IF v_expected_delivery IS NULL AND p_po_id IS NOT NULL THEN
    SELECT expected_delivery_date INTO v_expected_delivery
    FROM public.purchase_orders WHERE id = p_po_id;
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
    purchase_date, due_date, expected_delivery_date, grn_reference, batch_reference, batch_code, batch_number,
    reference, sales_person_id, status, notes, created_by
  )
  VALUES (
    v_bill_id, v_bill_number, p_vendor_bill_number, p_vendor_id, p_po_id, p_store_id,
    p_purchase_date, p_due_date, v_expected_delivery, p_grn_reference, p_batch_reference,
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

    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    IF v_product_id IS NULL AND NULLIF(v_line ->> 'variant_id', '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid;
    END IF;

    INSERT INTO public.erp_purchase_bill_lines (
      purchase_bill_id, variant_id, product_id, product_name, barcode, expiry_date,
      quantity, original_quantity, purchase_price, tax_rate_percent, tax_amount, line_total,
      unit_id
    )
    VALUES (
      v_bill_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_product_id,
      v_line ->> 'product_name',
      v_line ->> 'barcode',
      NULLIF(v_line ->> 'expiry_date', '')::date,
      v_qty,
      v_qty,
      v_price,
      v_tax_rate,
      v_line_tax,
      v_line_total,
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
      v_qty,
      v_price,
      v_tax_rate,
      v_line_tax,
      v_line_total
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
    balance_due = 0,
    updated_at = now()
  WHERE id = v_bill_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, p_created_by);
  END IF;

  RETURN v_bill_id;
END;
$$;

-- ─── 3. Vendor credit stock: product-level store inventory ─────────────────────

CREATE OR REPLACE FUNCTION public.inventory_apply_vendor_credit_stock(
  p_credit_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_store_id uuid;
  v_delta numeric;
  v_actor uuid;
BEGIN
  v_actor := COALESCE(p_user_id, auth.uid());

  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id INTO v_store_id
  FROM public.erp_vendor_credits
  WHERE id = p_credit_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Vendor credit store not found';
  END IF;

  PERFORM public.require_store_access(v_store_id, v_actor);

  FOR r IN
    SELECT
      COALESCE(vcl.product_id, pv.product_id) AS product_id,
      SUM(vcl.quantity)::numeric AS qty
    FROM public.erp_vendor_credit_lines vcl
    LEFT JOIN public.product_variants pv ON pv.id = vcl.variant_id
    WHERE vcl.vendor_credit_id = p_credit_id
      AND COALESCE(vcl.product_id, pv.product_id) IS NOT NULL
    GROUP BY COALESCE(vcl.product_id, pv.product_id)
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := -r.qty;

    PERFORM public.store_product_inventory_apply_delta(v_store_id, r.product_id, v_delta, v_actor);

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta, 'vendor_credit', p_credit_id, 'vendor_credit',
      'Vendor Credit', v_store_id, NULL, NULL, v_actor
    );
  END LOOP;
END;
$$;

-- ─── 4. Credit note finalize: restore physical store stock by product ──────────

CREATE OR REPLACE FUNCTION public.finalize_erp_credit_note(
  p_credit_note_id uuid,
  p_restore_stock boolean DEFAULT false,
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
  v_total numeric;
  v_source_invoice_id uuid;
  v_invoice_balance numeric;
  v_apply_amount numeric;
  v_already_committed boolean;
  v_line record;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id, total_amount, source_invoice_id, inventory_committed
  INTO v_status, v_store_id, v_total, v_source_invoice_id, v_already_committed
  FROM public.erp_credit_notes
  WHERE id = p_credit_note_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note not found';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft credit notes can be finalized';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  UPDATE public.erp_credit_notes
  SET
    status = 'issued',
    balance_remaining = v_total,
    updated_at = now()
  WHERE id = p_credit_note_id;

  IF p_restore_stock AND NOT COALESCE(v_already_committed, false) THEN
    FOR v_line IN
      SELECT
        COALESCE(cl.product_id, pv.product_id) AS product_id,
        cl.quantity,
        cl.unit_price
      FROM public.erp_credit_note_lines cl
      LEFT JOIN public.product_variants pv ON pv.id = cl.variant_id
      WHERE cl.credit_note_id = p_credit_note_id
        AND COALESCE(cl.product_id, pv.product_id) IS NOT NULL
    LOOP
      PERFORM public.store_product_inventory_apply_delta(
        v_store_id, v_line.product_id, v_line.quantity, p_actor
      );

      PERFORM public.log_product_stock_movement(
        v_line.product_id,
        v_line.quantity,
        'return',
        p_credit_note_id,
        'credit_note',
        'Credit note stock restore',
        v_store_id,
        NULL,
        v_line.unit_price,
        p_actor
      );
    END LOOP;

    UPDATE public.erp_credit_notes
    SET inventory_committed = true
    WHERE id = p_credit_note_id;
  END IF;

  IF v_source_invoice_id IS NOT NULL AND v_total > 0 THEN
    SELECT balance_due
    INTO v_invoice_balance
    FROM public.invoices
    WHERE id = v_source_invoice_id AND status <> 'cancelled';

    v_apply_amount := LEAST(v_total, COALESCE(v_invoice_balance, 0));
    IF v_apply_amount > 0 THEN
      PERFORM public.apply_erp_credit_note(
        p_credit_note_id, v_source_invoice_id, v_apply_amount, p_actor
      );
    END IF;
  END IF;
END;
$$;

-- ─── 5. Estimate / vendor credit lines: persist product_id ───────────────────

CREATE OR REPLACE FUNCTION public.create_erp_estimate(
  p_user_id uuid,
  p_store_id uuid,
  p_estimate_date date,
  p_valid_until date DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sales_person_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate_id uuid;
  v_estimate_number text;
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
  v_product_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_estimate_id, v_estimate_number
  FROM public.erp_next_document_ref('estimate') AS t;

  INSERT INTO public.erp_estimates (
    id, store_id, user_id, estimate_number, reference, estimate_date, valid_until,
    status, tax_inclusive, notes, sales_person_id, created_by
  )
  VALUES (
    v_estimate_id, p_store_id, p_user_id, v_estimate_number, p_reference, p_estimate_date,
    p_valid_until, 'draft', COALESCE(p_tax_inclusive, false), p_notes, p_sales_person_id, p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);

    IF p_tax_inclusive THEN
      v_taxable := ROUND(v_unit_price * v_qty / (1 + v_tax_rate / 100), 2);
      v_line_tax := ROUND(v_unit_price * v_qty - v_taxable, 2);
      v_line_total := ROUND(v_unit_price * v_qty, 2);
    ELSE
      v_taxable := ROUND(v_unit_price * v_qty, 2);
      v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
      v_line_total := v_taxable + v_line_tax;
    END IF;

    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    IF v_product_id IS NULL AND NULLIF(v_line ->> 'variant_id', '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid;
    END IF;

    INSERT INTO public.erp_estimate_lines (
      estimate_id, variant_id, product_id, product_name, description, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total, unit_id
    )
    VALUES (
      v_estimate_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_product_id,
      v_line ->> 'product_name',
      v_line ->> 'description',
      v_qty, v_unit_price, v_tax_rate, v_line_tax, v_line_total,
      NULLIF(v_line ->> 'unit_id', '')::uuid
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

  UPDATE public.erp_estimates
  SET subtotal = v_subtotal, tax_amount = v_tax, total_amount = v_total, updated_at = now()
  WHERE id = v_estimate_id;

  RETURN v_estimate_id;
END;
$$;

-- ─── 6. Document numbers: PO, transfer request, store transfer ───────────────

CREATE OR REPLACE FUNCTION public.create_erp_purchase_order(
  p_vendor_id uuid,
  p_store_id uuid,
  p_po_date date,
  p_expected_delivery_date date DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_discount numeric DEFAULT 0,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id uuid;
  v_po_number text;
  v_line jsonb;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
  v_product_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_vendor_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Vendor and store are required';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_po_id, v_po_number
  FROM public.erp_next_document_ref('purchase_order') AS t;

  INSERT INTO public.purchase_orders (
    id, vendor_id, store_id, po_number, status, po_date, expected_delivery_date,
    reference, notes, subtotal, tax_total, discount, total_amount
  )
  VALUES (
    v_po_id, p_vendor_id, p_store_id, v_po_number, 'pending', p_po_date,
    p_expected_delivery_date, p_reference, p_notes, 0, 0,
    COALESCE(p_discount, 0), 0
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

    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    IF v_product_id IS NULL AND NULLIF(v_line ->> 'variant_id', '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid;
    END IF;

    INSERT INTO public.purchase_order_items (
      po_id, product_id, variant_id, quantity, price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_po_id,
      v_product_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_qty,
      v_price,
      v_tax_rate,
      v_line_tax,
      v_line_total
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, ROUND(v_total - COALESCE(p_discount, 0), 2));

  UPDATE public.purchase_orders
  SET subtotal = ROUND(v_subtotal, 2),
      tax_total = ROUND(v_tax, 2),
      total_amount = v_total
  WHERE id = v_po_id;

  RETURN v_po_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_transfer_request(
  p_from_store_id uuid,
  p_to_store_id uuid,
  p_request_date date,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_submit boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req_id uuid;
  v_req_number text;
  v_line jsonb;
  v_product_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_from_store_id = p_to_store_id THEN
    RAISE EXCEPTION 'From and to store must differ';
  END IF;

  PERFORM public.require_store_access(p_from_store_id, p_created_by);
  PERFORM public.require_store_access(p_to_store_id, p_created_by);

  SELECT t.out_id, t.out_ref INTO v_req_id, v_req_number
  FROM public.erp_next_document_ref('transfer_request') AS t;

  INSERT INTO public.erp_transfer_requests (
    id, request_number, from_store_id, to_store_id, request_date, status, note, created_by
  )
  VALUES (
    v_req_id, v_req_number, p_from_store_id, p_to_store_id, p_request_date,
    CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END,
    p_note, p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    IF v_product_id IS NULL AND NULLIF(v_line ->> 'variant_id', '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid;
    END IF;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'product_id is required on transfer request lines';
    END IF;

    INSERT INTO public.erp_transfer_request_lines (
      request_id, product_id, variant_id, quantity, source_available, transfer_price,
      sales_price, average_purchase_cost, note
    )
    VALUES (
      v_req_id,
      v_product_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      COALESCE((v_line ->> 'quantity')::numeric, 0),
      COALESCE((v_line ->> 'source_available')::numeric, 0),
      COALESCE((v_line ->> 'transfer_price')::numeric, 0),
      COALESCE((v_line ->> 'sales_price')::numeric, 0),
      COALESCE((v_line ->> 'average_purchase_cost')::numeric, 0),
      v_line ->> 'note'
    );
  END LOOP;

  RETURN v_req_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_store_transfer(
  p_from_store_id uuid,
  p_to_store_id uuid,
  p_transfer_date date,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_transfer_number text;
  v_line jsonb;
  v_qty numeric;
  v_transfer_price numeric;
  v_line_total numeric;
  v_product_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_from_store_id = p_to_store_id THEN
    RAISE EXCEPTION 'From and to store must differ';
  END IF;

  PERFORM public.require_store_access(p_from_store_id, p_created_by);
  PERFORM public.require_store_access(p_to_store_id, p_created_by);

  SELECT t.out_id, t.out_ref INTO v_transfer_id, v_transfer_number
  FROM public.erp_next_document_ref('stock_transfer') AS t;

  INSERT INTO public.erp_store_transfers (
    id, transfer_number, from_store_id, to_store_id, transfer_date,
    status, request_id, note, created_by
  )
  VALUES (
    v_transfer_id, v_transfer_number, p_from_store_id, p_to_store_id, p_transfer_date,
    'draft', p_request_id, p_note, p_created_by
  );

  IF p_request_id IS NOT NULL THEN
    UPDATE public.erp_transfer_requests
    SET status = 'linked', updated_at = now()
    WHERE id = p_request_id AND status IN ('draft', 'submitted');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_transfer_price := COALESCE((v_line ->> 'transfer_price')::numeric, 0);
    v_line_total := ROUND(v_qty * v_transfer_price, 2);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    IF v_product_id IS NULL AND NULLIF(v_line ->> 'variant_id', '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid;
    END IF;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'product_id is required on store transfer lines';
    END IF;

    INSERT INTO public.erp_store_transfer_lines (
      transfer_id, product_id, variant_id, quantity, purchase_price, sales_price,
      markup_percent, markup_type, markup_amount, transfer_price, line_total
    )
    VALUES (
      v_transfer_id,
      v_product_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_qty,
      COALESCE((v_line ->> 'purchase_price')::numeric, 0),
      COALESCE((v_line ->> 'sales_price')::numeric, 0),
      COALESCE((v_line ->> 'markup_percent')::numeric, 0),
      v_line ->> 'markup_type',
      COALESCE((v_line ->> 'markup_amount')::numeric, 0),
      v_transfer_price,
      v_line_total
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

-- Patch vendor credit create: persist product_id on lines
CREATE OR REPLACE FUNCTION public.create_erp_vendor_credit(
  p_vendor_id uuid,
  p_store_id uuid,
  p_credit_date date,
  p_lines jsonb,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_reduce_stock boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid(),
  p_source_bill_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_id uuid;
  v_credit_number text;
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
  v_bill_vendor uuid;
  v_bill_balance numeric;
  v_apply_amount numeric;
  v_product_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_source_bill_id IS NOT NULL THEN
    SELECT vendor_id, balance_due INTO v_bill_vendor, v_bill_balance
    FROM public.erp_purchase_bills
    WHERE id = p_source_bill_id AND status <> 'cancelled';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source purchase bill not found';
    END IF;

    IF v_bill_vendor <> p_vendor_id THEN
      RAISE EXCEPTION 'Vendor credit must match source bill vendor';
    END IF;
  END IF;

  SELECT t.out_id, t.out_ref INTO v_credit_id, v_credit_number
  FROM public.erp_next_document_ref('vendor_credit') AS t;

  INSERT INTO public.erp_vendor_credits (
    id, credit_number, vendor_id, store_id, reference, credit_date,
    status, notes, balance_remaining, created_by, source_bill_id
  )
  VALUES (
    v_credit_id, v_credit_number, p_vendor_id, p_store_id, p_reference, p_credit_date,
    CASE WHEN p_finalize THEN 'issued' ELSE 'draft' END,
    p_notes, 0, p_created_by, p_source_bill_id
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

    INSERT INTO public.erp_vendor_credit_lines (
      vendor_credit_id, variant_id, product_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_credit_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_product_id,
      v_line ->> 'product_name',
      v_qty, v_unit_price, v_tax_rate, v_line_tax, v_line_total
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  UPDATE public.erp_vendor_credits
  SET subtotal = v_subtotal, tax_amount = v_tax, total_amount = v_total, balance_remaining = v_total
  WHERE id = v_credit_id;

  IF p_finalize AND p_reduce_stock THEN
    PERFORM public.inventory_apply_vendor_credit_stock(v_credit_id, p_created_by);
    UPDATE public.erp_vendor_credits SET inventory_committed = true WHERE id = v_credit_id;
  END IF;

  IF p_finalize AND p_source_bill_id IS NOT NULL AND v_total > 0 THEN
    v_apply_amount := LEAST(v_total, COALESCE(v_bill_balance, 0));
    IF v_apply_amount > 0 THEN
      PERFORM public.apply_erp_vendor_credit(
        v_credit_id, p_source_bill_id, v_apply_amount, p_created_by
      );
    END IF;
  END IF;

  RETURN v_credit_id;
END;
$$;

COMMIT;
