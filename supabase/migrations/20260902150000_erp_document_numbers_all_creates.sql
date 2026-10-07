-- ERP document numbers: self-contained helpers, backfill broken rows, and patch
-- all create/record RPCs that still call next_erp_document_number(text) with ''/NULL.

BEGIN;

-- ─── Core helpers ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.erp_format_document_ref(
  p_prefix text,
  p_id uuid,
  p_code_length int DEFAULT 5
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    CASE
      WHEN p_id IS NULL THEN NULL
      WHEN p_prefix IS NULL OR BTRIM(p_prefix) = '' THEN
        UPPER(SUBSTRING(REPLACE(p_id::text, '-', ''), 1, GREATEST(p_code_length, 1)))
      ELSE
        BTRIM(p_prefix) || '-' ||
        UPPER(SUBSTRING(REPLACE(p_id::text, '-', ''), 1, GREATEST(p_code_length, 1)))
    END;
$$;

CREATE OR REPLACE FUNCTION public.erp_alloc_document_ref(p_prefix text)
RETURNS TABLE(out_id uuid, out_ref text)
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  out_id := gen_random_uuid();
  out_ref := public.erp_format_document_ref(p_prefix, out_id);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_next_document_ref(p_document_type text)
RETURNS TABLE(out_id uuid, out_ref text)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_prefix text;
BEGIN
  SELECT prefix INTO v_prefix
  FROM public.erp_document_sequences
  WHERE document_type = p_document_type;

  IF NOT FOUND OR v_prefix IS NULL OR BTRIM(v_prefix) = '' THEN
    RAISE EXCEPTION 'Unknown document type: %', p_document_type;
  END IF;

  RETURN QUERY
  SELECT a.out_id, a.out_ref
  FROM public.erp_alloc_document_ref(v_prefix) AS a;
END;
$$;

DROP FUNCTION IF EXISTS public.next_erp_document_number(text);

CREATE OR REPLACE FUNCTION public.next_erp_document_number(
  p_document_type text,
  p_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
BEGIN
  SELECT prefix INTO v_prefix
  FROM public.erp_document_sequences
  WHERE document_type = p_document_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown document type: %', p_document_type;
  END IF;

  IF p_id IS NOT NULL THEN
    RETURN public.erp_format_document_ref(v_prefix, p_id);
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_format_document_ref(text, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_alloc_document_ref(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_next_document_ref(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_erp_document_number(text, uuid) TO authenticated;

-- ─── Backfill empty / null document numbers ──────────────────────────────────

UPDATE public.invoices
SET invoice_number = public.erp_format_document_ref('INV'::text, id)
WHERE invoice_number IS NULL OR BTRIM(invoice_number) = '';

UPDATE public.erp_estimates
SET estimate_number = public.erp_format_document_ref('EST'::text, id)
WHERE estimate_number IS NULL OR BTRIM(estimate_number) = '';

UPDATE public.orders
SET sales_order_number = public.erp_format_document_ref('SO'::text, id)
WHERE source = 'sales_order'
  AND (sales_order_number IS NULL OR BTRIM(sales_order_number) = '');

UPDATE public.erp_credit_notes
SET credit_note_number = public.erp_format_document_ref('CN'::text, id)
WHERE credit_note_number IS NULL OR BTRIM(credit_note_number) = '';

UPDATE public.erp_purchase_bills
SET purchase_bill_number = public.erp_format_document_ref('PB'::text, id)
WHERE purchase_bill_number IS NULL OR BTRIM(purchase_bill_number) = '';

UPDATE public.purchase_orders
SET po_number = public.erp_format_document_ref('PO'::text, id)
WHERE po_number IS NULL OR BTRIM(po_number) = '';

UPDATE public.erp_vendor_credits
SET credit_number = public.erp_format_document_ref('VC'::text, id)
WHERE credit_number IS NULL OR BTRIM(credit_number) = '';

UPDATE public.erp_expenses
SET expense_number = public.erp_format_document_ref('EXP'::text, id)
WHERE expense_number IS NULL OR BTRIM(expense_number) = '';

UPDATE public.erp_customer_payments
SET payment_number = public.erp_format_document_ref(
  CASE WHEN COALESCE(is_bulk, false) THEN 'CPM' ELSE 'PR' END, id)
WHERE payment_number IS NULL OR BTRIM(payment_number) = '';

UPDATE public.erp_supplier_payments
SET payment_number = public.erp_format_document_ref(
  CASE WHEN COALESCE(is_bulk, false) THEN 'CPM' ELSE 'PM' END, id)
WHERE payment_number IS NULL OR BTRIM(payment_number) = '';

UPDATE public.erp_stock_adjustments
SET adjustment_number = public.erp_format_document_ref('SA'::text, id)
WHERE adjustment_number IS NULL OR BTRIM(adjustment_number) = '';

UPDATE public.erp_transfer_requests
SET request_number = public.erp_format_document_ref('TR'::text, id)
WHERE request_number IS NULL OR BTRIM(request_number) = '';

UPDATE public.erp_store_transfers
SET transfer_number = public.erp_format_document_ref('ST'::text, id)
WHERE transfer_number IS NULL OR BTRIM(transfer_number) = '';

UPDATE public.journal_entries
SET journal_number = public.erp_format_document_ref('JE'::text, id)
WHERE journal_number IS NULL OR BTRIM(journal_number) = '';

UPDATE public.erp_account_transactions
SET transaction_number = public.erp_format_document_ref(
  CASE WHEN transaction_type = 'profit_withdrawal' THEN 'PW' ELSE 'AT' END, id)
WHERE transaction_number IS NULL OR BTRIM(transaction_number) = '';

UPDATE public.erp_vat_returns
SET return_number = public.erp_format_document_ref('VR'::text, id)
WHERE return_number IS NULL OR BTRIM(return_number) = '';

UPDATE public.erp_vat_payments
SET payment_number = public.erp_format_document_ref('VP'::text, id)
WHERE payment_number IS NULL OR BTRIM(payment_number) = '';

UPDATE public.erp_fixed_assets
SET asset_number = public.erp_format_document_ref('FA'::text, id)
WHERE asset_number IS NULL OR BTRIM(asset_number) = '';

UPDATE public.erp_transfer_payments
SET payment_number = public.erp_format_document_ref('TP'::text, id)
WHERE payment_number IS NULL OR BTRIM(payment_number) = '';

-- ─── Patch: purchase order ───────────────────────────────────────────────────

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

    INSERT INTO public.purchase_order_items (
      po_id, variant_id, quantity, price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_po_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_qty, v_price, v_tax_rate, v_line_tax, v_line_total
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

  UPDATE public.purchase_orders
  SET subtotal = v_subtotal, tax_total = v_tax, total_amount = v_total, updated_at = now()
  WHERE id = v_po_id;

  RETURN v_po_id;
END;
$$;

-- ─── Patch: expense ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_expense(
  p_store_id uuid,
  p_expense_date date,
  p_account_id uuid,
  p_amount numeric,
  p_tax_mode text DEFAULT 'none',
  p_tax_percent numeric DEFAULT 0,
  p_paid_through_account_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id uuid;
  v_expense_number text;
  v_tax_amount numeric := 0;
  v_total numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be positive';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_expense_id, v_expense_number
  FROM public.erp_next_document_ref('expense') AS t;

  IF p_tax_mode = 'exclusive' THEN
    v_tax_amount := ROUND(p_amount * COALESCE(p_tax_percent, 0) / 100, 2);
    v_total := p_amount + v_tax_amount;
  ELSIF p_tax_mode = 'inclusive' THEN
    v_total := p_amount;
    v_tax_amount := ROUND(v_total * COALESCE(p_tax_percent, 0) / (100 + COALESCE(p_tax_percent, 0)), 2);
  ELSE
    v_total := p_amount;
    v_tax_amount := 0;
  END IF;

  INSERT INTO public.erp_expenses (
    id, expense_number, store_id, expense_date, account_id, amount,
    tax_mode, tax_percent, tax_amount, total_amount,
    paid_through_account_id, vendor_id, user_id, reference, notes, created_by
  )
  VALUES (
    v_expense_id, v_expense_number, p_store_id, p_expense_date, p_account_id, p_amount,
    COALESCE(p_tax_mode, 'none'), COALESCE(p_tax_percent, 0), v_tax_amount, v_total,
    p_paid_through_account_id, p_vendor_id, p_user_id, p_reference, p_notes, p_created_by
  );

  RETURN v_expense_id;
END;
$$;

-- ─── Patch: estimate ─────────────────────────────────────────────────────────

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

    INSERT INTO public.erp_estimate_lines (
      estimate_id, variant_id, product_name, description, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total, unit_id
    )
    VALUES (
      v_estimate_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
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

-- ─── Patch: fixed asset ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_fixed_asset(
  p_name text,
  p_purchase_amount numeric,
  p_store_id uuid,
  p_purchase_date date DEFAULT CURRENT_DATE,
  p_paid_through_account_id uuid DEFAULT NULL,
  p_serial_number text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_details text DEFAULT NULL,
  p_tax_amount numeric DEFAULT 0,
  p_tax_mode text DEFAULT 'exclusive',
  p_vendor_id uuid DEFAULT NULL,
  p_warranty_expiry date DEFAULT NULL,
  p_warranty_details text DEFAULT NULL,
  p_maintenance_info text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_purchase_amount IS NULL OR p_purchase_amount <= 0 THEN
    RAISE EXCEPTION 'Purchase amount must be positive';
  END IF;

  IF p_paid_through_account_id IS NULL THEN
    RAISE EXCEPTION 'Paid-through account is required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  SELECT t.out_id, t.out_ref INTO v_id, v_number
  FROM public.erp_next_document_ref('fixed_asset') AS t;

  INSERT INTO public.erp_fixed_assets (
    id, asset_number, name, serial_number, brand, reference, details,
    purchase_date, purchase_amount, paid_through_account_id,
    tax_amount, tax_mode, vendor_id, warranty_expiry, warranty_details,
    maintenance_info, store_id, created_by
  )
  VALUES (
    v_id, v_number, p_name, p_serial_number, p_brand, p_reference, p_details,
    p_purchase_date, p_purchase_amount, p_paid_through_account_id,
    COALESCE(p_tax_amount, 0), COALESCE(p_tax_mode, 'exclusive'), p_vendor_id,
    p_warranty_expiry, p_warranty_details, p_maintenance_info, p_store_id, p_created_by
  );

  PERFORM public.post_journal_for_fixed_asset(v_id, p_created_by);
  RETURN v_id;
END;
$$;

-- ─── Patch: VAT return / payment ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_vat_return(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
  v_output numeric := 0;
  v_input numeric := 0;
  v_label text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_id, v_number
  FROM public.erp_next_document_ref('vat_return') AS t;

  v_label := to_char(p_period_start, 'Mon - YYYY');

  SELECT COALESCE(SUM(gst_amount), 0) INTO v_output
  FROM public.invoices
  WHERE status IN ('issued', 'partial', 'paid')
    AND created_at::date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_input
  FROM public.erp_purchase_bills
  WHERE status IN ('finalized', 'partial', 'paid')
    AND purchase_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  INSERT INTO public.erp_vat_returns (
    id, return_number, period_start, period_end, period_label, store_id,
    output_tax, input_tax, total_tax_payable, balance_due, notes, created_by
  )
  VALUES (
    v_id, v_number, p_period_start, p_period_end, v_label, p_store_id,
    v_output, v_input, v_output - v_input, v_output - v_input,
    COALESCE(p_notes, ''), p_created_by
  );

  RETURN v_id;
END;
$$;

COMMIT;
