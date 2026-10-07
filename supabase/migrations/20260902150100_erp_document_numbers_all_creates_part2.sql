-- Part 2: patch remaining ERP create/record RPCs for explicit document refs.

BEGIN;

-- ─── Invoice ─────────────────────────────────────────────────────────────────

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

  SELECT t.out_id, t.out_ref INTO v_invoice_id, v_invoice_number
  FROM public.erp_next_document_ref('sales_invoice') AS t;

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
      invoice_id, variant_id, product_name, quantity, unit_price,
      base_price, gst_rate, gst_amount, total_amount, vendor_id,
      unit_id, description, taxable_amount
    )
    VALUES (
      v_invoice_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_qty, v_unit_price,
      COALESCE((v_line ->> 'purchase_price')::numeric, v_unit_price),
      v_tax_rate, v_line_tax, v_line_total,
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

-- ─── Credit note (latest shape) ──────────────────────────────────────────────

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

    INSERT INTO public.erp_credit_note_lines (
      credit_note_id, variant_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_cn_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
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
      FOR v_line IN
        SELECT variant_id, quantity, unit_price
        FROM public.erp_credit_note_lines
        WHERE credit_note_id = v_cn_id AND variant_id IS NOT NULL
      LOOP
        PERFORM public.store_inventory_apply_delta(
          p_store_id, v_line.variant_id, v_line.quantity, true, p_created_by
        );
        PERFORM public.log_stock_movement(
          v_line.variant_id, v_line.quantity, 'return', v_cn_id, 'credit_note',
          'Credit note stock restore', p_store_id, NULL, v_line.unit_price, p_created_by
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

-- ─── Vendor credit ───────────────────────────────────────────────────────────

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

    INSERT INTO public.erp_vendor_credit_lines (
      vendor_credit_id, variant_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_credit_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
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
    PERFORM public.inventory_apply_vendor_credit_stock(v_credit_id);
    UPDATE public.erp_vendor_credits SET inventory_committed = true WHERE id = v_credit_id;
  END IF;

  IF p_finalize AND p_source_bill_id IS NOT NULL AND v_total > 0 THEN
    v_apply_amount := LEAST(v_total, COALESCE(v_bill_balance, 0));
    IF v_apply_amount > 0 THEN
      PERFORM public.apply_erp_vendor_credit(v_credit_id, p_source_bill_id, v_apply_amount, p_created_by);
    END IF;
  END IF;

  RETURN v_credit_id;
END;
$$;

-- ─── Stock adjustment ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_stock_adjustment(
  p_store_id uuid,
  p_adjustment_date date,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_finalize boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj_id uuid;
  v_adj_number text;
  v_line jsonb;
  v_qty numeric;
  v_cost numeric;
  v_total numeric;
  v_add_cost numeric := 0;
  v_remove_cost numeric := 0;
  v_direction text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line is required';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_adj_id, v_adj_number
  FROM public.erp_next_document_ref('stock_adjustment') AS t;

  INSERT INTO public.erp_stock_adjustments (
    id, adjustment_number, store_id, adjustment_date, status, note, created_by
  )
  VALUES (
    v_adj_id, v_adj_number, p_store_id, p_adjustment_date,
    CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,
    p_note, p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_direction := v_line ->> 'direction';
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_cost := COALESCE((v_line ->> 'purchase_cost')::numeric, 0);

    IF v_qty <= 0 OR v_direction NOT IN ('add', 'remove') THEN
      RAISE EXCEPTION 'Invalid adjustment line';
    END IF;

    IF v_direction = 'add' AND v_cost <= 0 THEN
      RAISE EXCEPTION 'Purchase cost is required when adding stock';
    END IF;

    IF v_direction = 'remove' THEN
      v_cost := 0;
    END IF;

    v_total := CASE WHEN v_direction = 'add' THEN ROUND(v_qty * v_cost, 2) ELSE 0 END;

    INSERT INTO public.erp_stock_adjustment_lines (
      adjustment_id, variant_id, direction, quantity, purchase_cost, line_total
    )
    VALUES (
      v_adj_id,
      (v_line ->> 'variant_id')::uuid,
      v_direction, v_qty, v_cost, v_total
    );

    IF v_direction = 'add' THEN
      v_add_cost := v_add_cost + v_total;
    ELSE
      v_remove_cost := v_remove_cost + v_total;
    END IF;
  END LOOP;

  UPDATE public.erp_stock_adjustments
  SET add_cost_total = v_add_cost, remove_cost_total = v_remove_cost, updated_at = now()
  WHERE id = v_adj_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_stock_adjustment(v_adj_id, p_created_by);
  END IF;

  RETURN v_adj_id;
END;
$$;

-- ─── Transfer request / store transfer ───────────────────────────────────────

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
    INSERT INTO public.erp_transfer_request_lines (
      request_id, variant_id, quantity, source_available, transfer_price,
      sales_price, average_purchase_cost, note
    )
    VALUES (
      v_req_id,
      (v_line ->> 'variant_id')::uuid,
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
  p_request_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
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

    INSERT INTO public.erp_store_transfer_lines (
      transfer_id, variant_id, quantity, transfer_price, line_total
    )
    VALUES (
      v_transfer_id,
      (v_line ->> 'variant_id')::uuid,
      v_qty, v_transfer_price, v_line_total
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

-- ─── Purchase bill (use shared helper) ───────────────────────────────────────

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

COMMIT;
