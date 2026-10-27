-- Inter-account transfers: mirror cash-book rows must use account_transfer (not generic / "Other income" label).

BEGIN;

CREATE OR REPLACE FUNCTION public.journal_is_inter_account_transfer(p_journal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = p_journal_id
      AND je.status = 'posted'
      AND je.source_entity_type = 'banking_transaction'
  )
  AND (
    SELECT COUNT(*)::int FROM public.journal_entry_lines WHERE journal_entry_id = p_journal_id
  ) = 2
  AND (
    SELECT COUNT(*)::int
    FROM public.journal_entry_lines jel
    WHERE jel.journal_entry_id = p_journal_id
      AND public.is_cash_book_account(jel.account_id)
  ) = 2
  AND NOT EXISTS (
    SELECT 1
    FROM public.journal_entry_lines jel
    JOIN public.accounts a ON a.id = jel.account_id
    JOIN public.account_types t ON t.id = a.account_type_id
    WHERE jel.journal_entry_id = p_journal_id
      AND t.account_category IN ('Income', 'Expense')
  );
$$;

CREATE OR REPLACE FUNCTION public.cash_book_transfer_details(
  p_debit numeric,
  p_credit numeric,
  p_line_description text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF COALESCE(p_debit, 0) > 0 THEN
    RETURN 'Transfer in';
  END IF;
  IF COALESCE(p_credit, 0) > 0 THEN
    RETURN 'Transfer out';
  END IF;
  RETURN COALESCE(NULLIF(BTRIM(p_line_description), ''), 'Account transfer');
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_banking_transfer_cash_book_metadata(p_journal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eat record;
  v_counter uuid;
BEGIN
  IF NOT public.journal_is_inter_account_transfer(p_journal_id) THEN
    RETURN;
  END IF;

  FOR v_eat IN
    SELECT eat.id, eat.account_id, eat.debit_amount, eat.credit_amount
    FROM public.erp_account_transactions eat
    WHERE eat.journal_entry_id = p_journal_id
      AND public.is_cash_book_account(eat.account_id)
  LOOP
    SELECT l.account_id INTO v_counter
    FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = p_journal_id
      AND l.account_id <> v_eat.account_id
    ORDER BY l.line_order
    LIMIT 1;

    UPDATE public.erp_account_transactions
    SET
      transaction_type = 'account_transfer',
      counter_account_id = v_counter,
      details = public.cash_book_transfer_details(
        v_eat.debit_amount, v_eat.credit_amount, NULL
      )
    WHERE id = v_eat.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_cash_book_from_journal(p_journal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_je public.journal_entries%ROWTYPE;
  v_line public.journal_entry_lines%ROWTYPE;
  v_counter uuid;
  v_type text;
  v_details text;
  v_balance numeric;
  v_tx_id uuid;
  v_tx_number text;
  v_is_transfer boolean;
BEGIN
  SELECT * INTO v_je FROM public.journal_entries WHERE id = p_journal_id;
  IF NOT FOUND OR v_je.status <> 'posted' THEN
    RETURN;
  END IF;

  v_is_transfer := public.journal_is_inter_account_transfer(p_journal_id);

  FOR v_line IN
    SELECT * FROM public.journal_entry_lines
    WHERE journal_entry_id = p_journal_id
    ORDER BY line_order
  LOOP
    IF NOT public.is_cash_book_account(v_line.account_id) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.erp_account_transactions
      WHERE journal_entry_id = p_journal_id
        AND account_id = v_line.account_id
    ) THEN
      CONTINUE;
    END IF;

    SELECT l.account_id INTO v_counter
    FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = p_journal_id
      AND l.account_id <> v_line.account_id
    ORDER BY l.line_order
    LIMIT 1;

    IF v_is_transfer THEN
      v_type := 'account_transfer';
      v_details := public.cash_book_transfer_details(
        v_line.debit_amount, v_line.credit_amount, v_line.description
      );
    ELSE
      v_type := public.cash_book_type_for_source(v_je.source_entity_type);
      v_details := COALESCE(NULLIF(v_line.description, ''), v_je.description);
    END IF;

    v_balance := public.get_account_balance(v_line.account_id);

    v_tx_id := gen_random_uuid();
    v_tx_number := public.erp_format_document_ref('AT', v_tx_id);

    INSERT INTO public.erp_account_transactions (
      id, transaction_number, account_id, counter_account_id, store_id,
      transaction_date, transaction_type, details,
      debit_amount, credit_amount, running_balance, reference,
      journal_entry_id, created_by
    )
    VALUES (
      v_tx_id, v_tx_number, v_line.account_id, v_counter, v_je.store_id,
      v_je.transaction_date, v_type, v_details,
      v_line.debit_amount, v_line.credit_amount, v_balance,
      v_je.journal_number, p_journal_id, v_je.created_by
    );
  END LOOP;

  IF v_is_transfer THEN
    PERFORM public.sync_banking_transfer_cash_book_metadata(p_journal_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_account_transaction(
  p_account_id uuid,
  p_store_id uuid,
  p_transaction_date date,
  p_transaction_type text,
  p_debit_amount numeric DEFAULT 0,
  p_credit_amount numeric DEFAULT 0,
  p_counter_account_id uuid DEFAULT NULL,
  p_details text DEFAULT NULL,
  p_payment_type text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_number text;
  v_journal_id uuid;
  v_lines jsonb;
  v_balance numeric;
  v_cash_account uuid;
  v_equity_account uuid;
  v_other_income uuid;
  v_other_expense uuid;
  v_counter_cat text;
  v_counter_type text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_debit_amount < 0 OR p_credit_amount < 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF p_debit_amount = 0 AND p_credit_amount = 0 THEN
    RAISE EXCEPTION 'Debit or credit required';
  END IF;

  IF p_debit_amount > 0 AND p_credit_amount > 0 THEN
    RAISE EXCEPTION 'Cannot set both debit and credit';
  END IF;

  IF p_transaction_type = 'account_transfer' AND p_credit_amount > 0 AND p_counter_account_id IS NULL THEN
    RAISE EXCEPTION 'Transfer destination account is required';
  END IF;

  IF p_counter_account_id IS NOT NULL THEN
    SELECT t.account_category, t.name
    INTO v_counter_cat, v_counter_type
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    WHERE a.id = p_counter_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Counter account not found';
    END IF;

    IF p_transaction_type IN ('owner_contribution', 'owner_drawing', 'profit_withdrawal') THEN
      IF v_counter_cat <> 'Equity' THEN
        RAISE EXCEPTION 'Use an Equity account (e.g. Owner''s Equity)—not a cash or bank account';
      END IF;
    ELSIF p_transaction_type = 'generic' AND p_debit_amount > 0 THEN
      IF v_counter_cat <> 'Income' THEN
        RAISE EXCEPTION 'Other income must credit an Income account from the chart of accounts';
      END IF;
    ELSIF p_transaction_type = 'generic' AND p_credit_amount > 0 THEN
      IF v_counter_cat <> 'Expense' THEN
        RAISE EXCEPTION 'Other payment must debit an Expense account from the chart of accounts';
      END IF;
    ELSIF p_transaction_type = 'account_transfer' THEN
      IF p_counter_account_id = p_account_id OR NOT public.is_cash_book_account(p_counter_account_id) THEN
        RAISE EXCEPTION 'Transfer destination must be a different cash or bank account';
      END IF;
    END IF;
  END IF;

  v_number := public.next_erp_document_number('account_transaction');
  v_cash_account := public.get_account_by_code('CASH');
  v_equity_account := COALESCE(
    public.get_account_by_code('OWNERS_EQUITY'),
    public.get_account_by_code('EQUITY'),
    public.get_account_by_code('RETAINED_EARNING')
  );
  v_other_income := COALESCE(
    public.get_account_by_code('OTHER_INCOME'),
    public.get_account_by_code('INCOME')
  );
  v_other_expense := COALESCE(
    public.get_account_by_code('OTHER_EXPENSE'),
    public.get_account_by_code('EXPENSE')
  );

  IF p_transaction_type = 'owner_contribution' AND p_debit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_account_id, 'debit', p_debit_amount, 'description', 'Owner contribution'),
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_equity_account), 'credit', p_debit_amount, 'description', 'Equity')
    );
  ELSIF p_transaction_type IN ('owner_drawing', 'profit_withdrawal') AND p_credit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_equity_account), 'debit', p_credit_amount, 'description', p_transaction_type),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', p_transaction_type)
    );
  ELSIF p_transaction_type = 'account_transfer' AND p_credit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_counter_account_id, 'debit', p_credit_amount, 'description', 'Transfer in'),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', 'Transfer out')
    );
  ELSIF p_transaction_type = 'loan_taking' AND p_debit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_account_id, 'debit', p_debit_amount, 'description', 'Loan taking'),
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'credit', p_debit_amount, 'description', 'Loan liability')
    );
  ELSIF p_transaction_type = 'loan_repayment' AND p_credit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'debit', p_credit_amount, 'description', 'Loan repayment'),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', 'Loan repayment')
    );
  ELSIF p_transaction_type = 'generic' AND p_debit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_account_id, 'debit', p_debit_amount, 'description', COALESCE(p_details, 'Other income')),
      jsonb_build_object(
        'account_id', COALESCE(p_counter_account_id, v_other_income),
        'credit', p_debit_amount,
        'description', COALESCE(p_details, 'Other income')
      )
    );
  ELSIF p_transaction_type = 'generic' AND p_credit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id', COALESCE(p_counter_account_id, v_other_expense),
        'debit', p_credit_amount,
        'description', COALESCE(p_details, 'Other payment')
      ),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', COALESCE(p_details, 'Other payment'))
    );
  ELSIF p_debit_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', p_account_id, 'debit', p_debit_amount, 'description', COALESCE(p_details, 'Debit')),
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'credit', p_debit_amount, 'description', 'Counter')
    );
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(p_counter_account_id, v_cash_account), 'debit', p_credit_amount, 'description', 'Counter'),
      jsonb_build_object('account_id', p_account_id, 'credit', p_credit_amount, 'description', COALESCE(p_details, 'Credit'))
    );
  END IF;

  IF public.is_posting_enabled('banking_transaction') THEN
    v_journal_id := public.create_posted_journal_entry(
      p_transaction_date, COALESCE(p_details, p_transaction_type), p_store_id,
      'banking_transaction', NULL, v_lines, p_created_by
    );
  END IF;

  v_balance := public.get_account_balance(p_account_id);

  IF v_journal_id IS NOT NULL THEN
    UPDATE public.erp_account_transactions
    SET
      transaction_type = p_transaction_type,
      details = COALESCE(p_details, details),
      payment_type = p_payment_type,
      reference = COALESCE(p_reference, reference),
      running_balance = v_balance,
      counter_account_id = CASE
        WHEN p_transaction_type = 'generic' AND p_debit_amount > 0 THEN COALESCE(p_counter_account_id, v_other_income)
        WHEN p_transaction_type = 'generic' AND p_credit_amount > 0 THEN COALESCE(p_counter_account_id, v_other_expense)
        WHEN p_transaction_type = 'account_transfer' THEN p_counter_account_id
        ELSE counter_account_id
      END
    WHERE journal_entry_id = v_journal_id
      AND account_id = p_account_id
    RETURNING id INTO v_tx_id;
  END IF;

  IF v_tx_id IS NULL THEN
    INSERT INTO public.erp_account_transactions (
      transaction_number, account_id, counter_account_id, store_id,
      transaction_date, transaction_type, details, payment_type,
      debit_amount, credit_amount, running_balance, reference,
      journal_entry_id, created_by
    )
    VALUES (
      v_number, p_account_id,
      CASE
        WHEN p_transaction_type = 'generic' AND p_debit_amount > 0 THEN COALESCE(p_counter_account_id, v_other_income)
        WHEN p_transaction_type = 'generic' AND p_credit_amount > 0 THEN COALESCE(p_counter_account_id, v_other_expense)
        WHEN p_transaction_type = 'account_transfer' THEN p_counter_account_id
        ELSE p_counter_account_id
      END,
      p_store_id,
      p_transaction_date, p_transaction_type, COALESCE(p_details, ''), p_payment_type,
      COALESCE(p_debit_amount, 0), COALESCE(p_credit_amount, 0), v_balance, p_reference,
      v_journal_id, p_created_by
    )
    RETURNING id INTO v_tx_id;
  END IF;

  IF v_journal_id IS NOT NULL THEN
    UPDATE public.journal_entries
    SET source_entity_id = v_tx_id
    WHERE id = v_journal_id AND source_entity_id IS NULL;

    PERFORM public.sync_banking_transfer_cash_book_metadata(v_journal_id);
  END IF;

  RETURN v_tx_id;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT je.id AS journal_id
    FROM public.journal_entries je
    WHERE public.journal_is_inter_account_transfer(je.id)
  LOOP
    PERFORM public.sync_banking_transfer_cash_book_metadata(r.journal_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.journal_is_inter_account_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_banking_transfer_cash_book_metadata(uuid) TO authenticated;

COMMIT;
