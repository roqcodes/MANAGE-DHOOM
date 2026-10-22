-- The 10-arg log_audit_event (salesmen) coexists with the legacy 9-arg overload.
-- Partial / named calls match both and raise "function ... is not unique".
-- Safe to drop 9-arg: the 10-arg version is a superset (p_salesman_id defaults to NULL).

BEGIN;

DROP FUNCTION IF EXISTS public.log_audit_event(text, text, uuid, text, jsonb, jsonb, jsonb, uuid, uuid);

REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, text, jsonb, jsonb, jsonb, uuid, uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, text, jsonb, jsonb, jsonb, uuid, uuid, uuid)
  TO authenticated;

-- Re-deploy discount RPC so audit uses the unambiguous 10-arg positional call
-- (in case 20261021140000 was applied before that fix).
CREATE OR REPLACE FUNCTION public.record_erp_commercial_discount(
  p_side text,
  p_party_id uuid,
  p_store_id uuid,
  p_discount_date date,
  p_amount numeric,
  p_tax_rate_percent numeric DEFAULT 0,
  p_source_document_id uuid DEFAULT NULL,
  p_discount_account_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor, auth.uid());
  v_total numeric;
  v_tax numeric;
  v_subtotal numeric;
  v_tax_rate numeric := COALESCE(p_tax_rate_percent, 0);
  v_id uuid;
  v_number text;
  v_source_party uuid;
  v_source_store uuid;
  v_source_status text;
  v_source_balance numeric := 0;
  v_apply_amount numeric := 0;
  v_account_category text;
  v_line_name text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_side NOT IN ('supplier', 'customer') THEN
    RAISE EXCEPTION 'Side must be supplier or customer';
  END IF;

  IF p_party_id IS NULL THEN
    RAISE EXCEPTION 'Party is required';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_actor);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Discount amount must be greater than zero';
  END IF;

  IF p_amount > 1000000000 THEN
    RAISE EXCEPTION 'Discount amount is too large';
  END IF;

  IF v_tax_rate < 0 OR v_tax_rate > 100 THEN
    RAISE EXCEPTION 'Tax rate must be between 0 and 100';
  END IF;

  v_total := ROUND(p_amount, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Discount amount must be greater than zero';
  END IF;

  IF v_tax_rate > 0 THEN
    v_tax := ROUND(v_total * v_tax_rate / (100 + v_tax_rate), 2);
  ELSE
    v_tax := 0;
  END IF;
  v_subtotal := ROUND(v_total - v_tax, 2);
  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Discount net amount must be greater than zero';
  END IF;

  IF p_discount_account_id IS NOT NULL THEN
    SELECT at.account_category
    INTO v_account_category
    FROM public.accounts a
    JOIN public.account_types at ON at.id = a.account_type_id
    WHERE a.id = p_discount_account_id
      AND a.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Discount account not found or inactive';
    END IF;

    IF p_side = 'supplier' AND v_account_category IS DISTINCT FROM 'Income' THEN
      RAISE EXCEPTION 'Purchase discount must post to an income account';
    END IF;
    IF p_side = 'customer' AND v_account_category IS DISTINCT FROM 'Expense' THEN
      RAISE EXCEPTION 'Sales discount must post to an expense account';
    END IF;
  END IF;

  IF p_side = 'supplier' THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_party_id) THEN
      RAISE EXCEPTION 'Vendor not found';
    END IF;

    IF p_source_document_id IS NOT NULL THEN
      SELECT vendor_id, store_id, status, balance_due
      INTO v_source_party, v_source_store, v_source_status, v_source_balance
      FROM public.erp_purchase_bills
      WHERE id = p_source_document_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Source purchase bill not found';
      END IF;
      IF v_source_status IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot record a discount against a draft or cancelled bill';
      END IF;
      IF v_source_party IS DISTINCT FROM p_party_id THEN
        RAISE EXCEPTION 'Discount vendor must match the source bill';
      END IF;
      IF v_source_store IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Discount store must match the source bill';
      END IF;
    END IF;

    SELECT t.out_id, t.out_ref INTO v_id, v_number
    FROM public.erp_next_document_ref('commercial_discount') AS t;

    v_line_name := 'Purchase discount';

    INSERT INTO public.erp_vendor_credits (
      id, credit_number, vendor_id, store_id, reference, credit_date,
      status, notes, subtotal, tax_amount, total_amount, balance_remaining,
      created_by, source_bill_id, credit_kind, discount_account_id,
      inventory_committed
    )
    VALUES (
      v_id, v_number, p_party_id, p_store_id, p_reference, p_discount_date,
      'issued', p_notes, v_subtotal, v_tax, v_total, v_total,
      v_actor, p_source_document_id, 'discount', p_discount_account_id,
      false
    );

    INSERT INTO public.erp_vendor_credit_lines (
      vendor_credit_id, variant_id, product_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_id, NULL, NULL, v_line_name, 1,
      v_subtotal, v_tax_rate, v_tax, v_total
    );

    v_apply_amount := LEAST(v_total, GREATEST(COALESCE(v_source_balance, 0), 0));
    IF p_source_document_id IS NOT NULL AND v_apply_amount > 0 THEN
      PERFORM public.apply_erp_vendor_credit(v_id, p_source_document_id, v_apply_amount, v_actor);
    END IF;

    PERFORM public.log_audit_event(
      'record_commercial_discount',
      'vendor_credit',
      v_id,
      format(
        'Purchase discount %s of %s recorded%s',
        v_number,
        v_total::text,
        CASE
          WHEN v_apply_amount > 0 THEN format(' and applied %s to bill', v_apply_amount::text)
          ELSE ''
        END
      ),
      jsonb_build_object(
        'side', p_side,
        'amount', v_total,
        'tax_amount', v_tax,
        'applied_amount', v_apply_amount,
        'unapplied_amount', ROUND(v_total - v_apply_amount, 2),
        'source_bill_id', p_source_document_id,
        'vendor_id', p_party_id,
        'discount_account_id', p_discount_account_id
      ),
      NULL,
      NULL,
      p_store_id,
      v_actor,
      NULL
    );
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_party_id) THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;

    IF p_source_document_id IS NOT NULL THEN
      SELECT user_id, store_id, status, balance_due
      INTO v_source_party, v_source_store, v_source_status, v_source_balance
      FROM public.invoices
      WHERE id = p_source_document_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Source invoice not found';
      END IF;
      IF v_source_status IN ('draft', 'cancelled', 'pending') THEN
        RAISE EXCEPTION 'Cannot record a discount against a draft, pending, or cancelled invoice';
      END IF;
      IF v_source_party IS DISTINCT FROM p_party_id THEN
        RAISE EXCEPTION 'Discount customer must match the source invoice';
      END IF;
      IF v_source_store IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Discount store must match the source invoice';
      END IF;
    END IF;

    SELECT t.out_id, t.out_ref INTO v_id, v_number
    FROM public.erp_next_document_ref('commercial_discount') AS t;

    v_line_name := 'Sales discount';

    INSERT INTO public.erp_credit_notes (
      id, credit_note_number, store_id, user_id, reference, credit_note_date,
      status, notes, subtotal, tax_amount, total_amount, balance_remaining,
      created_by, inventory_committed, source_invoice_id, credit_kind, discount_account_id
    )
    VALUES (
      v_id, v_number, p_store_id, p_party_id, p_reference, p_discount_date,
      'issued', p_notes, v_subtotal, v_tax, v_total, v_total,
      v_actor, false, p_source_document_id, 'discount', p_discount_account_id
    );

    INSERT INTO public.erp_credit_note_lines (
      credit_note_id, variant_id, product_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_id, NULL, NULL, v_line_name, 1,
      v_subtotal, v_tax_rate, v_tax, v_total
    );

    v_apply_amount := LEAST(v_total, GREATEST(COALESCE(v_source_balance, 0), 0));
    IF p_source_document_id IS NOT NULL AND v_apply_amount > 0 THEN
      PERFORM public.apply_erp_credit_note(v_id, p_source_document_id, v_apply_amount, v_actor);
    END IF;

    PERFORM public.log_audit_event(
      'record_commercial_discount',
      'credit_note',
      v_id,
      format(
        'Sales discount %s of %s recorded%s',
        v_number,
        v_total::text,
        CASE
          WHEN v_apply_amount > 0 THEN format(' and applied %s to invoice', v_apply_amount::text)
          ELSE ''
        END
      ),
      jsonb_build_object(
        'side', p_side,
        'amount', v_total,
        'tax_amount', v_tax,
        'applied_amount', v_apply_amount,
        'unapplied_amount', ROUND(v_total - v_apply_amount, 2),
        'source_invoice_id', p_source_document_id,
        'user_id', p_party_id,
        'discount_account_id', p_discount_account_id
      ),
      NULL,
      NULL,
      p_store_id,
      v_actor,
      NULL
    );
  END IF;

  RETURN v_id;
END;
$$;

COMMIT;
