  -- Fix duplicate journal_entries_number_unique on convert-to-invoice.
  -- create_posted_journal_entry inserted journal_number = '' expecting a BEFORE INSERT
  -- trigger; when invoice + payment journals post in one transaction, both got ''.

  BEGIN;

  -- Backfill any blank journal numbers before applying the stricter insert path.
  UPDATE public.journal_entries
  SET journal_number = public.erp_format_document_ref('JE', id)
  WHERE journal_number IS NULL OR BTRIM(journal_number) = '';

  UPDATE public.erp_account_transactions
  SET transaction_number = public.erp_format_document_ref(
    CASE WHEN transaction_type = 'profit_withdrawal' THEN 'PW' ELSE 'AT' END,
    id
  )
  WHERE transaction_number IS NULL OR BTRIM(transaction_number) = '';

  CREATE OR REPLACE FUNCTION public.create_posted_journal_entry(
    p_transaction_date date,
    p_description text,
    p_store_id uuid,
    p_source_entity_type text,
    p_source_entity_id uuid,
    p_lines jsonb,
    p_created_by uuid DEFAULT auth.uid()
  )
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_existing uuid;
    v_journal_id uuid;
    v_journal_number text;
    v_line jsonb;
    v_debit numeric := 0;
    v_credit numeric := 0;
    v_line_debit numeric;
    v_line_credit numeric;
    v_account_id uuid;
    v_company_id uuid;
    v_order integer := 0;
  BEGIN
    IF p_created_by IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT public.is_staff_user(p_created_by) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    IF p_store_id IS NOT NULL THEN
      PERFORM public.require_store_access(p_store_id, p_created_by);
    END IF;

    IF p_source_entity_type IS NOT NULL AND p_source_entity_id IS NOT NULL THEN
      SELECT id INTO v_existing
      FROM public.journal_entries
      WHERE source_entity_type = p_source_entity_type
        AND source_entity_id = p_source_entity_id
        AND status = 'posted';

      IF v_existing IS NOT NULL THEN
        PERFORM public.sync_cash_book_from_journal(v_existing);
        RETURN v_existing;
      END IF;
    END IF;

    IF jsonb_array_length(p_lines) < 2 THEN
      RAISE EXCEPTION 'Journal requires at least two lines';
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_debit := COALESCE((v_line ->> 'debit')::numeric, 0);
      v_line_credit := COALESCE((v_line ->> 'credit')::numeric, 0);
      IF v_line_debit < 0 OR v_line_credit < 0 THEN
        RAISE EXCEPTION 'Negative amounts not allowed';
      END IF;
      IF v_line_debit > 0 AND v_line_credit > 0 THEN
        RAISE EXCEPTION 'Line cannot have both debit and credit';
      END IF;
      IF v_line_debit = 0 AND v_line_credit = 0 THEN
        RAISE EXCEPTION 'Line must have debit or credit';
      END IF;
      v_debit := v_debit + v_line_debit;
      v_credit := v_credit + v_line_credit;
    END LOOP;

    IF v_debit <> v_credit THEN
      RAISE EXCEPTION 'Journal unbalanced: debit % credit %', v_debit, v_credit;
    END IF;

    IF v_debit = 0 THEN
      RAISE EXCEPTION 'Journal total must be greater than zero';
    END IF;

    IF p_store_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.stores WHERE id = p_store_id;
    END IF;

    v_journal_id := gen_random_uuid();
    v_journal_number := public.erp_format_document_ref('JE', v_journal_id);

    INSERT INTO public.journal_entries (
      id, journal_number, transaction_date, description, store_id, company_id,
      source_entity_type, source_entity_id, status, total_debit, total_credit,
      created_by, posted_by, posted_at
    )
    VALUES (
      v_journal_id, v_journal_number, p_transaction_date, COALESCE(p_description, ''),
      p_store_id, v_company_id, p_source_entity_type, p_source_entity_id,
      'posted', v_debit, v_credit, p_created_by, p_created_by, now()
    );

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_order := v_order + 1;
      v_line_debit := COALESCE((v_line ->> 'debit')::numeric, 0);
      v_line_credit := COALESCE((v_line ->> 'credit')::numeric, 0);

      IF v_line ? 'account_id' THEN
        v_account_id := (v_line ->> 'account_id')::uuid;
      ELSE
        v_account_id := public.get_account_by_code(v_line ->> 'account_code');
      END IF;

      IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Account not found for journal line';
      END IF;

      INSERT INTO public.journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount,
        description, line_order
      )
      VALUES (
        v_journal_id, v_account_id, v_line_debit, v_line_credit,
        COALESCE(v_line ->> 'description', ''), v_order
      );
    END LOOP;

    PERFORM public.sync_cash_book_from_journal(v_journal_id);
    RETURN v_journal_id;
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
    v_balance numeric;
    v_tx_id uuid;
    v_tx_number text;
  BEGIN
    SELECT * INTO v_je FROM public.journal_entries WHERE id = p_journal_id;
    IF NOT FOUND OR v_je.status <> 'posted' THEN
      RETURN;
    END IF;

    v_type := public.cash_book_type_for_source(v_je.source_entity_type);

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
        v_je.transaction_date, v_type,
        COALESCE(NULLIF(v_line.description, ''), v_je.description),
        v_line.debit_amount, v_line.credit_amount, v_balance,
        v_je.journal_number, p_journal_id, v_je.created_by
      );  
    END LOOP;
  END;
  $$;

  GRANT EXECUTE ON FUNCTION public.create_posted_journal_entry(date, text, uuid, text, uuid, jsonb, uuid) TO authenticated;

  COMMIT;
