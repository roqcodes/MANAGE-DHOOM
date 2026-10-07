-- Phase 7: VAT Payments

ALTER TABLE public.erp_vat_returns
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public.erp_vat_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL,
  vat_return_id uuid NOT NULL REFERENCES public.erp_vat_returns (id) ON DELETE RESTRICT,
  store_id uuid REFERENCES public.stores (id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  payment_type text NOT NULL DEFAULT 'Cash',
  paid_from_account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  amount numeric NOT NULL,
  notes text,
  account_transaction_id uuid REFERENCES public.erp_account_transactions (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_vat_payments_number_unique UNIQUE (payment_number),
  CONSTRAINT erp_vat_payments_amount_check CHECK (amount <> 0)
);

CREATE INDEX IF NOT EXISTS erp_vat_payments_return_idx
  ON public.erp_vat_payments (vat_return_id);

CREATE INDEX IF NOT EXISTS erp_vat_payments_store_idx
  ON public.erp_vat_payments (store_id);

DROP TRIGGER IF EXISTS trg_erp_vat_payments_updated_at ON public.erp_vat_payments;
CREATE TRIGGER trg_erp_vat_payments_updated_at
  BEFORE UPDATE ON public.erp_vat_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES ('vat_payment', '', 101, 0)
ON CONFLICT (document_type) DO NOTHING;

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

  v_number := public.next_erp_document_number('vat_return');
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
    return_number, period_start, period_end, period_label, store_id,
    output_tax, input_tax, total_tax_payable, balance_due, notes, created_by
  )
  VALUES (
    v_number, p_period_start, p_period_end, v_label, p_store_id,
    v_output, v_input, v_output - v_input, v_output - v_input,
    COALESCE(p_notes, ''), p_created_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
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
    RAISE EXCEPTION 'VAT return must be filed before recording payment';
  END IF;

  v_number := public.next_erp_document_number('vat_payment');
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
      jsonb_build_object('account_id', p_paid_from_account_id, 'debit', ABS(p_amount), 'description', 'VAT refund'),
      jsonb_build_object('account_id', v_tax_account, 'credit', ABS(p_amount), 'description', 'VAT refund')
    );
  END IF;

  IF public.is_posting_enabled('banking_transaction') AND v_tax_account IS NOT NULL THEN
    v_journal_id := public.create_posted_journal_entry(
      p_payment_date,
      COALESCE(p_reference, 'VAT payment'),
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
    payment_number, vat_return_id, store_id, payment_date, reference,
    payment_type, paid_from_account_id, amount, notes,
    account_transaction_id, created_by
  )
  VALUES (
    v_number, p_vat_return_id, v_return.store_id, p_payment_date, p_reference,
    COALESCE(p_payment_type, 'Cash'), p_paid_from_account_id, p_amount, p_notes,
    v_tx_id, p_created_by
  )
  RETURNING id INTO v_id;

  UPDATE public.erp_vat_returns
  SET balance_due = balance_due - p_amount,
      updated_at = now()
  WHERE id = p_vat_return_id;

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

  UPDATE public.erp_vat_returns
  SET balance_due = balance_due + v_payment.amount,
      updated_at = now()
  WHERE id = v_payment.vat_return_id;

  DELETE FROM public.erp_vat_payments
  WHERE id = p_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_erp_vat_return(
  p_return_id uuid,
  p_deleted_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_payment_count int;
BEGIN
  IF NOT public.is_staff_user(p_deleted_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status INTO v_status
  FROM public.erp_vat_returns
  WHERE id = p_return_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return not found';
  END IF;

  SELECT COUNT(*) INTO v_payment_count
  FROM public.erp_vat_payments
  WHERE vat_return_id = p_return_id;

  IF v_payment_count > 0 THEN
    RAISE EXCEPTION 'Delete VAT payments before deleting this return';
  END IF;

  IF v_status = 'unfiled' THEN
    DELETE FROM public.erp_vat_returns WHERE id = p_return_id;
    RETURN;
  END IF;

  DELETE FROM public.erp_vat_returns
  WHERE id = p_return_id AND status = 'filed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return could not be deleted';
  END IF;
END;
$$;

ALTER TABLE public.erp_vat_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_vat_payments_staff" ON public.erp_vat_payments;
CREATE POLICY "erp_vat_payments_staff"
  ON public.erp_vat_payments FOR ALL
  USING (public.is_staff_user(auth.uid()))
  WITH CHECK (public.is_staff_user(auth.uid()));

GRANT EXECUTE ON FUNCTION public.create_erp_vat_return(uuid, date, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_vat_payment(uuid, date, text, uuid, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_erp_vat_payment(uuid, uuid) TO authenticated;
