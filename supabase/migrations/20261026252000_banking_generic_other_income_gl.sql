-- Banking "Other income" / "Other payment" (generic) must hit P&L accounts, not main CASH.
-- Previously: Dr Bank/Cash, Cr CASH (asset shuffle) — invisible on P&L and cash-flow net income.

BEGIN;

SELECT public.ensure_system_ledger_account('OTHER_INCOME', 'Other Income');
SELECT public.ensure_system_ledger_account('OTHER_EXPENSE', 'Other Expense');

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
  END IF;

  RETURN v_tx_id;
END;
$$;

-- Repair posted generic money-in journals that credited CASH instead of OTHER_INCOME.
DO $$
DECLARE
  v_cash_id uuid := public.get_account_by_code('CASH');
  v_other_income uuid := COALESCE(
    public.get_account_by_code('OTHER_INCOME'),
    public.get_account_by_code('INCOME')
  );
  r record;
BEGIN
  IF v_cash_id IS NULL OR v_other_income IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT DISTINCT je.id AS journal_id
    FROM public.journal_entries je
    JOIN public.erp_account_transactions t ON t.journal_entry_id = je.id
    WHERE je.status = 'posted'
      AND je.source_entity_type = 'banking_transaction'
      AND t.transaction_type = 'generic'
      AND t.debit_amount > 0.001
      AND EXISTS (
        SELECT 1
        FROM public.journal_entry_lines jel
        WHERE jel.journal_entry_id = je.id
          AND jel.account_id = v_cash_id
          AND jel.credit_amount > 0.001
      )
  LOOP
    UPDATE public.journal_entry_lines jel
    SET account_id = v_other_income
    WHERE jel.journal_entry_id = r.journal_id
      AND jel.account_id = v_cash_id
      AND jel.credit_amount > 0.001;

    DELETE FROM public.erp_account_transactions
    WHERE journal_entry_id = r.journal_id;

    PERFORM public.sync_cash_book_from_journal(r.journal_id);

    UPDATE public.erp_account_transactions t
    SET counter_account_id = v_other_income
    WHERE t.journal_entry_id = r.journal_id
      AND t.debit_amount > 0.001;
  END LOOP;

  FOR r IN
    SELECT DISTINCT je.id AS journal_id
    FROM public.journal_entries je
    JOIN public.erp_account_transactions t ON t.journal_entry_id = je.id
    WHERE je.status = 'posted'
      AND je.source_entity_type = 'banking_transaction'
      AND t.transaction_type = 'generic'
      AND t.credit_amount > 0.001
      AND EXISTS (
        SELECT 1
        FROM public.journal_entry_lines jel
        WHERE jel.journal_entry_id = je.id
          AND jel.account_id = v_cash_id
          AND jel.debit_amount > 0.001
      )
  LOOP
    UPDATE public.journal_entry_lines jel
    SET account_id = public.get_account_by_code('OTHER_EXPENSE')
    WHERE jel.journal_entry_id = r.journal_id
      AND jel.account_id = v_cash_id
      AND jel.debit_amount > 0.001;

    DELETE FROM public.erp_account_transactions
    WHERE journal_entry_id = r.journal_id;

    PERFORM public.sync_cash_book_from_journal(r.journal_id);

    UPDATE public.erp_account_transactions t
    SET counter_account_id = public.get_account_by_code('OTHER_EXPENSE')
    WHERE t.journal_entry_id = r.journal_id
      AND t.credit_amount > 0.001;
  END LOOP;

  FOR r IN
    SELECT DISTINCT account_id
    FROM public.erp_account_transactions
  LOOP
    WITH ordered AS (
      SELECT
        x.id,
        SUM(x.debit_amount - x.credit_amount) OVER (
          PARTITION BY x.account_id
          ORDER BY x.transaction_date ASC, x.created_at ASC, x.id ASC
        ) AS new_running_balance
      FROM public.erp_account_transactions x
      WHERE x.account_id = r.account_id
    )
    UPDATE public.erp_account_transactions t
    SET running_balance = o.new_running_balance
    FROM ordered o
    WHERE t.id = o.id;
  END LOOP;
END;
$$;

COMMIT;
