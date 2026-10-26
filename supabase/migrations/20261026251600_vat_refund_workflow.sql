-- VAT refund vs payment: eligibility, carry-forward net of refunds, balance_due integrity.

BEGIN;

ALTER TABLE public.erp_vat_returns
  ADD COLUMN IF NOT EXISTS refund_received_total numeric NOT NULL DEFAULT 0;

ALTER TABLE public.erp_vat_payments
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'tax_payment';

ALTER TABLE public.erp_vat_payments
  DROP CONSTRAINT IF EXISTS erp_vat_payments_entry_kind_check;

ALTER TABLE public.erp_vat_payments
  ADD CONSTRAINT erp_vat_payments_entry_kind_check
  CHECK (entry_kind IN ('tax_payment', 'tax_refund'));

COMMENT ON COLUMN public.erp_vat_returns.refund_received_total IS
  'Sum of VAT refunds received from authority for this return (reduces carry-forward credit).';
COMMENT ON COLUMN public.erp_vat_payments.entry_kind IS
  'tax_payment = liability settlement; tax_refund = authority repayment into bank/cash.';

UPDATE public.erp_vat_payments
SET entry_kind = CASE WHEN amount < 0 THEN 'tax_refund' ELSE 'tax_payment' END
WHERE entry_kind = 'tax_payment' AND amount < 0;

UPDATE public.erp_vat_returns vr
SET refund_received_total = COALESCE((
  SELECT SUM(ABS(p.amount))
  FROM public.erp_vat_payments p
  WHERE p.vat_return_id = vr.id
    AND p.entry_kind = 'tax_refund'
), 0);

UPDATE public.erp_vat_returns vr
SET balance_due = GREATEST(
  0,
  vr.total_tax_payable - COALESCE((
    SELECT SUM(p.amount)
    FROM public.erp_vat_payments p
    WHERE p.vat_return_id = vr.id
      AND p.entry_kind = 'tax_payment'
      AND p.amount > 0
  ), 0)
);

CREATE OR REPLACE FUNCTION public.erp_vat_return_refund_remaining(p_return_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    COALESCE(vr.recoverable_tax, 0) - COALESCE(vr.refund_received_total, 0)
  )
  FROM public.erp_vat_returns vr
  WHERE vr.id = p_return_id;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_vat_carry_forward_credit(
  p_store_id uuid,
  p_period_start date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT GREATEST(
        0,
        COALESCE(vr.recoverable_tax, 0) - COALESCE(vr.refund_received_total, 0)
      )
      FROM public.erp_vat_returns vr
      WHERE vr.store_id = p_store_id
        AND vr.status = 'filed'
        AND vr.period_end < p_period_start
      ORDER BY vr.period_end DESC, vr.filed_date DESC NULLS LAST, vr.created_at DESC
      LIMIT 1
    ),
    0
  );
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
  v_paid_positive numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_amount = 0 THEN
    RAISE EXCEPTION 'Amount is required';
  END IF;

  SELECT * INTO v_return
  FROM public.erp_vat_returns
  WHERE id = p_vat_return_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return not found';
  END IF;

  IF v_return.status <> 'filed' THEN
    RAISE EXCEPTION 'VAT return must be filed before recording payment or refund';
  END IF;

  IF v_return.store_id IS NOT NULL THEN
    PERFORM public.require_store_access(v_return.store_id, p_created_by);
  END IF;

  v_kind := CASE WHEN p_amount > 0 THEN 'tax_payment' ELSE 'tax_refund' END;
  v_abs_amount := ABS(p_amount);

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
    v_refund_remaining := public.erp_vat_return_refund_remaining(p_vat_return_id);
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

  IF p_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_tax_account, 'debit', p_amount, 'description', 'VAT payment'),
      jsonb_build_object('account_id', p_paid_from_account_id, 'credit', p_amount, 'description', 'VAT payment')
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
    COALESCE(p_payment_type, 'Cash'), p_paid_from_account_id, p_amount, p_notes, v_kind,
    v_tx_id, p_created_by
  );

  IF v_kind = 'tax_payment' THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_positive
    FROM public.erp_vat_payments
    WHERE vat_return_id = p_vat_return_id
      AND entry_kind = 'tax_payment'
      AND amount > 0;

    UPDATE public.erp_vat_returns
    SET
      balance_due = GREATEST(0, total_tax_payable - v_paid_positive),
      updated_at = now()
    WHERE id = p_vat_return_id;
  ELSE
    UPDATE public.erp_vat_returns
    SET
      refund_received_total = refund_received_total + v_abs_amount,
      updated_at = now()
    WHERE id = p_vat_return_id;
  END IF;

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
  v_paid_positive numeric;
BEGIN
  IF NOT public.is_staff_user(p_deleted_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_payment
  FROM public.erp_vat_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT payment not found';
  END IF;

  IF v_payment.store_id IS NOT NULL THEN
    PERFORM public.require_store_access(v_payment.store_id, p_deleted_by);
  END IF;

  IF v_payment.entry_kind = 'tax_payment' OR v_payment.amount > 0 THEN
    UPDATE public.erp_vat_returns
    SET balance_due = balance_due + v_payment.amount,
        updated_at = now()
    WHERE id = v_payment.vat_return_id;
  ELSE
    UPDATE public.erp_vat_returns
    SET refund_received_total = GREATEST(0, refund_received_total - ABS(v_payment.amount)),
        updated_at = now()
    WHERE id = v_payment.vat_return_id;
  END IF;

  DELETE FROM public.erp_vat_payments
  WHERE id = p_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_positive
  FROM public.erp_vat_payments
  WHERE vat_return_id = v_payment.vat_return_id
    AND entry_kind = 'tax_payment'
    AND amount > 0;

  UPDATE public.erp_vat_returns
  SET balance_due = GREATEST(0, total_tax_payable - v_paid_positive),
      updated_at = now()
  WHERE id = v_payment.vat_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_vat_return_refund_remaining(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_vat_payment(uuid, date, text, uuid, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_erp_vat_payment(uuid, uuid) TO authenticated;

COMMIT;
