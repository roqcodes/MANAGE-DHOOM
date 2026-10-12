  -- Journal triggers run on payment INSERT before allocations exist.
  -- Use payment + settlement_discount for AP/AR clearance (equals allocation total when discounted).

  BEGIN;

  CREATE OR REPLACE FUNCTION public.post_journal_for_customer_payment(
    p_payment_id uuid,
    p_actor uuid DEFAULT auth.uid()
  )
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_existing uuid;
    v_amount numeric;
    v_discount numeric;
    v_discount_account uuid;
    v_ar_clearance numeric;
    v_bank_charges numeric;
    v_account_id uuid;
    v_bank_charges_account_id uuid;
    v_store_id uuid;
    v_date date;
    v_number text;
    v_lines jsonb := '[]'::jsonb;
    v_net_deposit numeric;
  BEGIN
    IF p_actor IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT public.is_staff_user(p_actor) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT id INTO v_existing
    FROM public.journal_entries
    WHERE source_entity_type = 'customer_payment'
      AND source_entity_id = p_payment_id
      AND status = 'posted';
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;

    IF NOT public.is_posting_enabled('customer_payment') THEN
      RETURN NULL;
    END IF;

    SELECT
      total_amount, account_id, store_id, payment_date, payment_number,
      bank_charges, bank_charges_account_id,
      settlement_discount, settlement_discount_account_id
    INTO
      v_amount, v_account_id, v_store_id, v_date, v_number,
      v_bank_charges, v_bank_charges_account_id,
      v_discount, v_discount_account
    FROM public.erp_customer_payments
    WHERE id = p_payment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer payment not found';
    END IF;

    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Customer payment amount must be positive';
    END IF;

    PERFORM public.require_store_access(v_store_id, p_actor);

    v_discount := COALESCE(v_discount, 0);
    v_bank_charges := COALESCE(v_bank_charges, 0);
    v_net_deposit := v_amount - v_bank_charges;
    v_ar_clearance := v_amount + v_discount;

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id', v_account_id,
        'debit', v_net_deposit,
        'description', 'Payment deposit ' || v_number
      )
    );

    IF v_bank_charges > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_id', v_bank_charges_account_id,
          'debit', v_bank_charges,
          'description', 'Bank charges ' || v_number
        )
      );
    END IF;

    IF v_discount > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_id', v_discount_account,
          'debit', v_discount,
          'description', 'Settlement discount ' || v_number
        )
      );
    END IF;

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', 'ACCOUNTS_RECIEVABLE',
        'credit', v_ar_clearance,
        'description', 'AR clearance'
      )
    );

    RETURN public.create_posted_journal_entry(
      v_date, 'Customer payment ' || v_number, v_store_id,
      'customer_payment', p_payment_id, v_lines, p_actor
    );
  END;
  $$;

  CREATE OR REPLACE FUNCTION public.post_journal_for_supplier_payment(
    p_payment_id uuid,
    p_actor uuid DEFAULT auth.uid()
  )
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_existing uuid;
    v_amount numeric;
    v_discount numeric;
    v_discount_account uuid;
    v_ap_clearance numeric;
    v_bank_charges numeric;
    v_account_id uuid;
    v_bank_charges_account_id uuid;
    v_store_id uuid;
    v_date date;
    v_number text;
    v_lines jsonb := '[]'::jsonb;
    v_net_payment numeric;
  BEGIN
    IF p_actor IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT public.is_staff_user(p_actor) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT id INTO v_existing
    FROM public.journal_entries
    WHERE source_entity_type = 'supplier_payment'
      AND source_entity_id = p_payment_id
      AND status = 'posted';

    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;

    IF NOT public.is_posting_enabled('supplier_payment') THEN
      RETURN NULL;
    END IF;

    SELECT
      total_amount, account_id, store_id, payment_date, payment_number,
      bank_charges, bank_charges_account_id,
      settlement_discount, settlement_discount_account_id
    INTO
      v_amount, v_account_id, v_store_id, v_date, v_number,
      v_bank_charges, v_bank_charges_account_id,
      v_discount, v_discount_account
    FROM public.erp_supplier_payments
    WHERE id = p_payment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Supplier payment not found';
    END IF;

    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Supplier payment amount must be positive';
    END IF;

    PERFORM public.require_store_access(v_store_id, p_actor);

    v_discount := COALESCE(v_discount, 0);
    v_bank_charges := COALESCE(v_bank_charges, 0);
    v_net_payment := v_amount - v_bank_charges;
    v_ap_clearance := v_amount + v_discount;

    IF v_account_id IS NULL THEN
      v_account_id := public.get_account_by_code('CASH');
    END IF;

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', 'ACCOUNTS_PAYABLE',
        'debit', v_ap_clearance,
        'description', 'AP payment ' || v_number
      )
    );

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', v_account_id,
        'credit', v_net_payment,
        'description', 'Payment ' || v_number
      )
    );

    IF v_bank_charges > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_id', v_bank_charges_account_id,
          'credit', v_bank_charges,
          'description', 'Bank charges ' || v_number
        )
      );
    END IF;

    IF v_discount > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_id', v_discount_account,
          'credit', v_discount,
          'description', 'Settlement discount ' || v_number
        )
      );
    END IF;

    RETURN public.create_posted_journal_entry(
      v_date, 'Supplier payment ' || v_number, v_store_id,
      'supplier_payment', p_payment_id, v_lines, p_actor
    );
  END;
  $$;

  COMMIT;
