-- VAT payment/refund delete: void posted journals; row locks; authoritative total sync.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_erp_vat_return_payment_totals(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return public.erp_vat_returns%ROWTYPE;
  v_paid numeric;
  v_refunded numeric;
BEGIN
  SELECT * INTO v_return
  FROM public.erp_vat_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return not found';
  END IF;

  SELECT COALESCE(SUM(p.amount), 0) INTO v_paid
  FROM public.erp_vat_payments p
  WHERE p.vat_return_id = p_return_id
    AND p.entry_kind = 'tax_payment'
    AND p.amount > 0;

  SELECT COALESCE(SUM(ABS(p.amount)), 0) INTO v_refunded
  FROM public.erp_vat_payments p
  WHERE p.vat_return_id = p_return_id
    AND p.entry_kind = 'tax_refund';

  UPDATE public.erp_vat_returns
  SET
    balance_due = GREATEST(0, v_return.total_tax_payable - v_paid),
    refund_received_total = v_refunded,
    updated_at = now()
  WHERE id = p_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_vat_payment(
  p_vat_return_id uuid,
  p_payment_date date,
  p_payment_type text,
  p_paid_from_account_id uuid,
  p_amount numeric,
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
  v_id uuid;
  v_number text;
  v_return public.erp_vat_returns%ROWTYPE;
  v_tax_account uuid;
  v_tx_id uuid;
  v_lines jsonb;
  v_journal_id uuid;
  v_kind text;
  v_abs_amount numeric;
  v_refund_remaining numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_amount = 0 THEN
    RAISE EXCEPTION 'Amount is required';
  END IF;

  IF p_amount > 0 THEN
    v_kind := 'tax_payment';
    v_abs_amount := p_amount;
  ELSE
    v_kind := 'tax_refund';
    v_abs_amount := ABS(p_amount);
  END IF;

  SELECT * INTO v_return
  FROM public.erp_vat_returns
  WHERE id = p_vat_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return not found';
  END IF;

  IF v_return.status <> 'filed' THEN
    RAISE EXCEPTION 'VAT return must be filed before recording payment or refund';
  END IF;

  IF v_return.store_id IS NOT NULL THEN
    PERFORM public.require_store_access(v_return.store_id, p_created_by);
  END IF;

  IF v_kind = 'tax_payment' THEN
    IF v_return.total_tax_payable <= 0 THEN
      RAISE EXCEPTION 'This return has no tax payable; use Record VAT refund for recoverable credit';
    END IF;
    IF p_amount > v_return.balance_due + 0.001 THEN
      RAISE EXCEPTION 'Payment % exceeds balance due %', p_amount, v_return.balance_due;
    END IF;
  ELSE
    IF v_return.recoverable_tax <= 0 THEN
      RAISE EXCEPTION 'This return has no recoverable VAT credit to refund';
    END IF;
    SELECT GREATEST(
      0,
      COALESCE(v_return.recoverable_tax, 0) - COALESCE((
        SELECT SUM(ABS(p.amount))
        FROM public.erp_vat_payments p
        WHERE p.vat_return_id = p_vat_return_id
          AND p.entry_kind = 'tax_refund'
      ), 0)
    ) INTO v_refund_remaining;
    IF v_abs_amount > v_refund_remaining + 0.001 THEN
      RAISE EXCEPTION 'Refund % exceeds remaining refundable credit %', v_abs_amount, v_refund_remaining;
    END IF;
  END IF;

  SELECT t.out_id, t.out_ref
  INTO v_id, v_number
  FROM public.erp_next_document_ref('vat_payment') AS t;

  v_tax_account := public.get_account_by_code('OVERSEAS_TAX_PAYABLE');

  IF v_tax_account IS NULL THEN
    SELECT a.id INTO v_tax_account
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    WHERE t.name = 'Overseas Tax Payable'
    LIMIT 1;
  END IF;

  IF v_kind = 'tax_payment' THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_tax_account, 'debit', v_abs_amount, 'description', 'VAT payment'),
      jsonb_build_object('account_id', p_paid_from_account_id, 'credit', v_abs_amount, 'description', 'VAT payment')
    );
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_paid_from_account_id, 'debit', v_abs_amount, 'description', 'VAT refund received'),
      jsonb_build_object('account_id', v_tax_account, 'credit', v_abs_amount, 'description', 'VAT refund received')
    );
  END IF;

  IF public.is_posting_enabled('banking_transaction') AND v_tax_account IS NOT NULL THEN
    v_journal_id := public.create_posted_journal_entry(
      p_payment_date,
      COALESCE(p_reference, CASE WHEN v_kind = 'tax_refund' THEN 'VAT refund' ELSE 'VAT payment' END),
      v_return.store_id,
      'vat_payment',
      NULL,
      v_lines,
      p_created_by
    );
  END IF;

  IF v_journal_id IS NOT NULL THEN
    SELECT id INTO v_tx_id
    FROM public.erp_account_transactions
    WHERE journal_entry_id = v_journal_id
    LIMIT 1;
  END IF;

  INSERT INTO public.erp_vat_payments (
    id, payment_number, vat_return_id, store_id, payment_date, reference,
    payment_type, paid_from_account_id, amount, notes, entry_kind,
    account_transaction_id, created_by
  )
  VALUES (
    v_id, v_number, p_vat_return_id, v_return.store_id, p_payment_date, p_reference,
    COALESCE(p_payment_type, 'Cash'), p_paid_from_account_id,
    CASE WHEN v_kind = 'tax_refund' THEN -v_abs_amount ELSE v_abs_amount END,
    p_notes, v_kind,
    v_tx_id, p_created_by
  );

  PERFORM public.sync_erp_vat_return_payment_totals(p_vat_return_id);

  IF v_journal_id IS NOT NULL THEN
    UPDATE public.journal_entries
    SET source_entity_id = v_id
    WHERE id = v_journal_id AND source_entity_id IS NULL;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_erp_vat_payment(
  p_payment_id uuid,
  p_deleted_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.erp_vat_payments%ROWTYPE;
  v_return_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_deleted_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_payment
  FROM public.erp_vat_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT payment not found';
  END IF;

  v_return_id := v_payment.vat_return_id;

  IF v_payment.store_id IS NOT NULL THEN
    PERFORM public.require_store_access(v_payment.store_id, p_deleted_by);
  END IF;

  PERFORM public.void_journals_for_entity('vat_payment', p_payment_id);

  DELETE FROM public.erp_vat_payments
  WHERE id = p_payment_id;

  PERFORM public.sync_erp_vat_return_payment_totals(v_return_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_erp_vat_payment(uuid, date, text, uuid, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_erp_vat_payment(uuid, uuid) TO authenticated;

COMMIT;
