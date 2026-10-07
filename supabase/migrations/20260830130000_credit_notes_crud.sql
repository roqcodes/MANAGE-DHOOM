-- Credit note & vendor credit: finalize and delete draft RPCs

BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_erp_credit_note(
  p_credit_note_id uuid,
  p_restore_stock boolean DEFAULT false,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_store_id uuid;
  v_total numeric;
  v_source_invoice_id uuid;
  v_invoice_balance numeric;
  v_apply_amount numeric;
  v_already_committed boolean;
  v_line record;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id, total_amount, source_invoice_id, inventory_committed
  INTO v_status, v_store_id, v_total, v_source_invoice_id, v_already_committed
  FROM public.erp_credit_notes
  WHERE id = p_credit_note_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note not found';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft credit notes can be finalized';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  UPDATE public.erp_credit_notes
  SET
    status = 'issued',
    balance_remaining = v_total,
    updated_at = now()
  WHERE id = p_credit_note_id;

  IF p_restore_stock AND NOT COALESCE(v_already_committed, false) THEN
    FOR v_line IN
      SELECT variant_id, quantity, unit_price
      FROM public.erp_credit_note_lines
      WHERE credit_note_id = p_credit_note_id AND variant_id IS NOT NULL
    LOOP
      PERFORM public.store_inventory_apply_delta(
        v_store_id, v_line.variant_id, v_line.quantity, true, p_actor
      );

      PERFORM public.log_stock_movement(
        v_line.variant_id,
        v_line.quantity,
        'return',
        p_credit_note_id,
        'credit_note',
        'Credit note stock restore',
        v_store_id,
        NULL,
        v_line.unit_price
      );
    END LOOP;

    UPDATE public.erp_credit_notes
    SET inventory_committed = true
    WHERE id = p_credit_note_id;
  END IF;

  IF v_source_invoice_id IS NOT NULL AND v_total > 0 THEN
    SELECT balance_due
    INTO v_invoice_balance
    FROM public.invoices
    WHERE id = v_source_invoice_id AND status <> 'cancelled';

    v_apply_amount := LEAST(v_total, COALESCE(v_invoice_balance, 0));
    IF v_apply_amount > 0 THEN
      PERFORM public.apply_erp_credit_note(
        p_credit_note_id, v_source_invoice_id, v_apply_amount, p_actor
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_erp_credit_note(
  p_credit_note_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_store_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id
  INTO v_status, v_store_id
  FROM public.erp_credit_notes
  WHERE id = p_credit_note_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note not found';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft credit notes can be deleted';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  DELETE FROM public.erp_credit_notes WHERE id = p_credit_note_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_erp_vendor_credit(
  p_credit_id uuid,
  p_reduce_stock boolean DEFAULT false,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_store_id uuid;
  v_total numeric;
  v_source_bill_id uuid;
  v_bill_balance numeric;
  v_apply_amount numeric;
  v_committed boolean;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id, total_amount, source_bill_id, inventory_committed
  INTO v_status, v_store_id, v_total, v_source_bill_id, v_committed
  FROM public.erp_vendor_credits
  WHERE id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor credit not found';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft vendor credits can be finalized';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  UPDATE public.erp_vendor_credits
  SET
    status = 'issued',
    balance_remaining = v_total,
    updated_at = now()
  WHERE id = p_credit_id;

  IF p_reduce_stock AND NOT COALESCE(v_committed, false) THEN
    PERFORM public.inventory_apply_vendor_credit_stock(p_credit_id);
    UPDATE public.erp_vendor_credits
    SET inventory_committed = true
    WHERE id = p_credit_id;
  END IF;

  IF v_source_bill_id IS NOT NULL AND v_total > 0 THEN
    SELECT balance_due
    INTO v_bill_balance
    FROM public.erp_purchase_bills
    WHERE id = v_source_bill_id AND status <> 'cancelled';

    v_apply_amount := LEAST(v_total, COALESCE(v_bill_balance, 0));
    IF v_apply_amount > 0 THEN
      PERFORM public.apply_erp_vendor_credit(
        p_credit_id, v_source_bill_id, v_apply_amount, p_actor
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_erp_vendor_credit(
  p_credit_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_store_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id
  INTO v_status, v_store_id
  FROM public.erp_vendor_credits
  WHERE id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor credit not found';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft vendor credits can be deleted';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  DELETE FROM public.erp_vendor_credits WHERE id = p_credit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_erp_credit_note(uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_erp_credit_note(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_erp_vendor_credit(uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_erp_vendor_credit(uuid, uuid) TO authenticated;

COMMIT;
