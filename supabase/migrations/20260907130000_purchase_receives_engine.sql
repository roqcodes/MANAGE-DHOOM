-- Purchase Receive engine: separate physical receipt from AP posting.
-- Bill finalize = AP/accounting only. Receive finalize = store_inventory only.

BEGIN;

-- ─── Document sequence ───────────────────────────────────────────────────────

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES ('purchase_receive', 'PR', 1, 0)
ON CONFLICT (document_type) DO NOTHING;

-- ─── Purchasing settings (over-receive policy) ─────────────────────────────

ALTER TABLE public.procurement_settings
  ADD COLUMN IF NOT EXISTS over_receive_policy text NOT NULL DEFAULT 'block'
    CHECK (over_receive_policy IN ('block', 'allow_with_authorization', 'allow_with_tolerance')),
  ADD COLUMN IF NOT EXISTS over_receive_tolerance_percent numeric(5,2) NOT NULL DEFAULT 0;

-- ─── Extend PO / bill tables ─────────────────────────────────────────────────

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS received_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_qty numeric NOT NULL DEFAULT 0;

ALTER TABLE public.erp_purchase_bills
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,
  ADD COLUMN IF NOT EXISTS accounting_posted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_stock_via_bill boolean NOT NULL DEFAULT false;

ALTER TABLE public.erp_purchase_bill_lines
  ADD COLUMN IF NOT EXISTS original_quantity numeric,
  ADD COLUMN IF NOT EXISTS received_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_qty numeric NOT NULL DEFAULT 0;

UPDATE public.erp_purchase_bill_lines
SET original_quantity = quantity
WHERE original_quantity IS NULL;

UPDATE public.erp_purchase_bills
SET legacy_stock_via_bill = true
WHERE inventory_committed = true;

-- ─── Purchase receives ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_purchase_receives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receive_number text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors (id),
  store_id uuid NOT NULL REFERENCES public.stores (id),
  po_id uuid REFERENCES public.purchase_orders (id),
  purchase_bill_id uuid REFERENCES public.erp_purchase_bills (id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'cancelled')),
  receive_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  reference text,
  notes text,
  reconcile_bill boolean NOT NULL DEFAULT true,
  inventory_committed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users (id),
  updated_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_purchase_receives_number_unique UNIQUE (receive_number)
);

CREATE TABLE IF NOT EXISTS public.erp_purchase_receive_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_receive_id uuid NOT NULL REFERENCES public.erp_purchase_receives (id) ON DELETE CASCADE,
  po_line_id uuid REFERENCES public.purchase_order_items (id),
  bill_line_id uuid REFERENCES public.erp_purchase_bill_lines (id),
  variant_id uuid REFERENCES public.product_variants (id),
  product_name text NOT NULL,
  barcode text,
  ordered_qty numeric NOT NULL DEFAULT 0,
  billed_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  accepted_qty numeric NOT NULL DEFAULT 0,
  rejected_qty numeric NOT NULL DEFAULT 0,
  purchase_price numeric NOT NULL DEFAULT 0,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  expiry_date date,
  batch_reference text,
  batch_code text,
  batch_number text
);

CREATE INDEX IF NOT EXISTS erp_purchase_receives_store_id_idx
  ON public.erp_purchase_receives (store_id);
CREATE INDEX IF NOT EXISTS erp_purchase_receives_po_id_idx
  ON public.erp_purchase_receives (po_id)
  WHERE po_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_purchase_receives_bill_id_idx
  ON public.erp_purchase_receives (purchase_bill_id)
  WHERE purchase_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_purchase_receives_status_idx
  ON public.erp_purchase_receives (status);
CREATE INDEX IF NOT EXISTS erp_purchase_receive_lines_receive_id_idx
  ON public.erp_purchase_receive_lines (purchase_receive_id);
CREATE INDEX IF NOT EXISTS erp_purchase_receive_lines_variant_id_idx
  ON public.erp_purchase_receive_lines (variant_id)
  WHERE variant_id IS NOT NULL;

ALTER TABLE public.erp_purchase_receives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_purchase_receive_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_purchase_receives_staff"
  ON public.erp_purchase_receives FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_purchase_receive_lines_staff"
  ON public.erp_purchase_receive_lines FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

INSERT INTO public.erp_posting_rules (event_type, description, is_enabled, is_winner_exact, mapping_notes)
VALUES (
  'purchase_receive',
  'Capitalize received inventory (clear goods receipt pending)',
  true,
  false,
  'DR STOCK, CR GOODS_RECEIPT_PENDING for accepted receive value.'
)
ON CONFLICT (event_type) DO NOTHING;

-- ─── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_purchasing_over_receive_policy()
RETURNS TABLE(policy text, tolerance_percent numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ps.over_receive_policy, 'block'),
    COALESCE(ps.over_receive_tolerance_percent, 0)
  FROM public.procurement_settings ps
  WHERE ps.id = 1;
$$;

CREATE OR REPLACE FUNCTION public.get_variant_accepted_qty_for_bill_line(p_bill_line_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(prl.accepted_qty), 0)
  FROM public.erp_purchase_receive_lines prl
  JOIN public.erp_purchase_receives pr ON pr.id = prl.purchase_receive_id
  WHERE prl.bill_line_id = p_bill_line_id
    AND pr.status = 'finalized'
    AND pr.inventory_committed = true;
$$;

CREATE OR REPLACE FUNCTION public.get_variant_accepted_qty_for_po_line(p_po_line_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(prl.accepted_qty), 0)
  FROM public.erp_purchase_receive_lines prl
  JOIN public.erp_purchase_receives pr ON pr.id = prl.purchase_receive_id
  WHERE prl.po_line_id = p_po_line_id
    AND pr.status = 'finalized'
    AND pr.inventory_committed = true;
$$;

CREATE OR REPLACE FUNCTION public.sync_purchase_order_receiving_status(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_ordered numeric := 0;
  v_total_accepted numeric := 0;
  v_status text;
BEGIN
  IF p_po_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_status FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND OR v_status IN ('cancelled', 'closed') THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(poi.quantity), 0),
    COALESCE(SUM(poi.accepted_qty), 0)
  INTO v_total_ordered, v_total_accepted
  FROM public.purchase_order_items poi
  WHERE poi.po_id = p_po_id;

  IF v_total_ordered <= 0 THEN
    RETURN;
  END IF;

  IF v_total_accepted <= 0 THEN
    IF v_status IN ('converted') THEN
      UPDATE public.purchase_orders SET status = 'accepted', updated_at = now() WHERE id = p_po_id;
    END IF;
    RETURN;
  END IF;

  IF v_total_accepted >= v_total_ordered THEN
    UPDATE public.purchase_orders SET status = 'fully_received', updated_at = now()
    WHERE id = p_po_id AND status NOT IN ('cancelled', 'closed');
  ELSE
    UPDATE public.purchase_orders SET status = 'partially_received', updated_at = now()
    WHERE id = p_po_id AND status NOT IN ('cancelled', 'closed', 'fully_received');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_purchase_receive_over_qty(
  p_bill_line_id uuid,
  p_po_line_id uuid,
  p_max_qty numeric,
  p_new_accepted numeric,
  p_allow_over_authorization boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy text;
  v_tolerance numeric;
  v_prior numeric := 0;
  v_max_allowed numeric;
  v_total numeric;
BEGIN
  IF p_max_qty IS NULL OR p_max_qty <= 0 THEN
    RETURN;
  END IF;

  IF p_bill_line_id IS NOT NULL THEN
    v_prior := public.get_variant_accepted_qty_for_bill_line(p_bill_line_id);
  ELSIF p_po_line_id IS NOT NULL THEN
    v_prior := public.get_variant_accepted_qty_for_po_line(p_po_line_id);
  END IF;

  v_total := v_prior + COALESCE(p_new_accepted, 0);

  IF v_total <= p_max_qty THEN
    RETURN;
  END IF;

  SELECT policy, tolerance_percent
  INTO v_policy, v_tolerance
  FROM public.get_purchasing_over_receive_policy();

  IF v_policy = 'allow_with_authorization' AND p_allow_over_authorization THEN
    RETURN;
  END IF;

  IF v_policy = 'allow_with_tolerance' THEN
    v_max_allowed := p_max_qty * (1 + COALESCE(v_tolerance, 0) / 100);
    IF v_total <= v_max_allowed THEN
      RETURN;
    END IF;
  END IF;

  RAISE EXCEPTION 'Over-receive not allowed: max %, attempted % (prior % + new %)',
    p_max_qty, v_total, v_prior, p_new_accepted;
END;
$$;

-- ─── Receive stock application ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inventory_apply_purchase_receive_stock(
  p_receive_id uuid,
  p_multiplier integer DEFAULT 1,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_store_id uuid;
  v_delta numeric;
  v_actor uuid;
BEGIN
  v_actor := COALESCE(p_user_id, auth.uid());

  IF p_receive_id IS NULL THEN
    RAISE EXCEPTION 'Purchase receive id is required';
  END IF;

  IF p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid stock multiplier';
  END IF;

  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id INTO v_store_id
  FROM public.erp_purchase_receives
  WHERE id = p_receive_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Purchase receive store not found';
  END IF;

  PERFORM public.require_store_access(v_store_id, v_actor);

  FOR r IN
    SELECT prl.variant_id, SUM(prl.accepted_qty)::numeric AS qty, AVG(prl.purchase_price) AS avg_price
    FROM public.erp_purchase_receive_lines prl
    WHERE prl.purchase_receive_id = p_receive_id
      AND prl.variant_id IS NOT NULL
      AND prl.accepted_qty > 0
    GROUP BY prl.variant_id
  LOOP
    v_delta := r.qty * p_multiplier;

    PERFORM public.store_inventory_apply_delta(v_store_id, r.variant_id, v_delta, true, v_actor);

    UPDATE public.store_inventory
    SET purchase_price = r.avg_price, updated_at = now()
    WHERE store_id = v_store_id
      AND variant_id = r.variant_id
      AND r.avg_price > 0;

    PERFORM public.log_stock_movement(
      r.variant_id, v_delta, 'purchase', p_receive_id, 'purchase_receive',
      'Purchase Receive', v_store_id, NULL, r.avg_price, v_actor
    );
  END LOOP;
END;
$$;

-- ─── Reconcile draft bill to accepted quantities ─────────────────────────────

CREATE OR REPLACE FUNCTION public.reconcile_draft_purchase_bill_from_receive(
  p_receive_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id uuid;
  v_status text;
  r record;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_landed numeric := 0;
  v_discount numeric := 0;
  v_taxable numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_new_qty numeric;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT pr.purchase_bill_id INTO v_bill_id
  FROM public.erp_purchase_receives pr
  WHERE pr.id = p_receive_id;

  IF v_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status, discount, landed_cost_total
  INTO v_status, v_discount, v_landed
  FROM public.erp_purchase_bills
  WHERE id = v_bill_id
  FOR UPDATE;

  IF v_status <> 'draft' THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT pbl.id AS bill_line_id, pbl.accepted_qty
    FROM public.erp_purchase_bill_lines pbl
    WHERE pbl.purchase_bill_id = v_bill_id
  LOOP
    UPDATE public.erp_purchase_bill_lines pbl
    SET
      original_quantity = COALESCE(pbl.original_quantity, pbl.quantity),
      quantity = GREATEST(0, r.accepted_qty),
      tax_amount = ROUND(GREATEST(0, r.accepted_qty) * pbl.purchase_price * pbl.tax_rate_percent / 100, 2),
      line_total = ROUND(
        GREATEST(0, r.accepted_qty) * pbl.purchase_price
        + ROUND(GREATEST(0, r.accepted_qty) * pbl.purchase_price * pbl.tax_rate_percent / 100, 2),
        2
      )
    WHERE pbl.id = r.bill_line_id;
  END LOOP;

  FOR r IN
    SELECT quantity, purchase_price, tax_rate_percent, tax_amount, line_total
    FROM public.erp_purchase_bill_lines
    WHERE purchase_bill_id = v_bill_id
  LOOP
    v_taxable := ROUND(r.quantity * r.purchase_price, 2);
    v_line_tax := ROUND(v_taxable * r.tax_rate_percent / 100, 2);
    v_line_total := v_taxable + v_line_tax;
    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_subtotal + v_tax - COALESCE(v_discount, 0)) + COALESCE(v_landed, 0);

  UPDATE public.erp_purchase_bills
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax,
    total_amount = v_total,
    balance_due = 0,
    updated_at = now()
  WHERE id = v_bill_id;
END;
$$;

-- ─── Journal: bill = AP / GRNI, receive = stock capitalization ───────────────

CREATE OR REPLACE FUNCTION public.post_journal_for_purchase_bill(
  p_bill_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_total numeric;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_lines jsonb;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'purchase_bill'
    AND source_entity_id = p_bill_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('purchase_bill') THEN
    RETURN NULL;
  END IF;

  SELECT total_amount, store_id, purchase_date, purchase_bill_number
  INTO v_total, v_store_id, v_date, v_number
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
    AND status IN ('finalized', 'partial', 'paid');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found or not eligible for journal posting';
  END IF;

  IF COALESCE(v_total, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  PERFORM public.ensure_system_ledger_account('GOODS_RECEIPT_PENDING', 'Goods Receipt Pending');
  PERFORM public.ensure_system_ledger_account('ACCOUNTS_PAYABLE', 'Accounts Payable');

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'GOODS_RECEIPT_PENDING', 'debit', v_total, 'description', 'Purchase bill ' || v_number),
    jsonb_build_object('account_code', 'ACCOUNTS_PAYABLE', 'credit', v_total, 'description', 'AP')
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Purchase bill ' || v_number, v_store_id, 'purchase_bill', p_bill_id, v_lines, p_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_for_purchase_receive(
  p_receive_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_total numeric := 0;
  v_lines jsonb;
  r record;
  v_line_value numeric;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'purchase_receive'
    AND source_entity_id = p_receive_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('purchase_receive') THEN
    RETURN NULL;
  END IF;

  SELECT store_id, receive_date, receive_number
  INTO v_store_id, v_date, v_number
  FROM public.erp_purchase_receives
  WHERE id = p_receive_id AND status = 'finalized';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase receive not found or not finalized';
  END IF;

  FOR r IN
    SELECT accepted_qty, purchase_price, tax_rate_percent
    FROM public.erp_purchase_receive_lines
    WHERE purchase_receive_id = p_receive_id AND accepted_qty > 0
  LOOP
    v_line_value := ROUND(r.accepted_qty * r.purchase_price * (1 + r.tax_rate_percent / 100), 2);
    v_total := v_total + v_line_value;
  END LOOP;

  IF v_total <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);
  PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');
  PERFORM public.ensure_system_ledger_account('GOODS_RECEIPT_PENDING', 'Goods Receipt Pending');

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'STOCK', 'debit', v_total, 'description', 'Receive ' || v_number),
    jsonb_build_object('account_code', 'GOODS_RECEIPT_PENDING', 'credit', v_total, 'description', 'GRNI clearance')
  );

  RETURN public.create_posted_journal_entry(
    v_date, 'Purchase receive ' || v_number, v_store_id, 'purchase_receive', p_receive_id, v_lines, p_actor
  );
END;
$$;

-- ─── Rewire bill finalize: AP only, no stock ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.finalize_erp_purchase_bill(
  p_bill_id uuid,
  p_finalized_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_posted boolean;
  v_total numeric;
  v_po_id uuid;
  v_store_id uuid;
BEGIN
  IF p_finalized_by IS NULL OR NOT public.is_staff_user(p_finalized_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, accounting_posted, total_amount, po_id, store_id
  INTO v_status, v_posted, v_total, v_po_id, v_store_id
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot finalize cancelled bill';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_finalized_by);

  IF v_status <> 'draft' AND v_posted THEN
    RETURN;
  END IF;

  UPDATE public.erp_purchase_bills
  SET
    status = 'finalized',
    balance_due = v_total,
    accounting_posted = true,
    updated_at = now()
  WHERE id = p_bill_id;

  PERFORM public.post_journal_for_purchase_bill(p_bill_id, p_finalized_by);

  IF v_po_id IS NOT NULL THEN
    PERFORM public.sync_purchase_order_receiving_status(v_po_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_erp_purchase_bill(
  p_bill_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_paid numeric;
  v_credits numeric;
  v_store_id uuid;
  v_legacy boolean;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, store_id, (legacy_stock_via_bill OR inventory_committed)
  INTO v_status, v_store_id, v_legacy
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_supplier_payment_allocations
  WHERE purchase_bill_id = p_bill_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.erp_vendor_credit_applications
  WHERE purchase_bill_id = p_bill_id;

  IF v_paid > 0 OR v_credits > 0 THEN
    RAISE EXCEPTION 'Cannot cancel bill with payments or vendor credits applied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.erp_purchase_receives
    WHERE purchase_bill_id = p_bill_id AND status = 'finalized'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel bill with finalized purchase receives; cancel receives first';
  END IF;

  IF v_legacy THEN
    PERFORM public.inventory_apply_purchase_bill_stock(p_bill_id, -1, p_actor);
  END IF;

  UPDATE public.erp_purchase_bills
  SET status = 'cancelled', balance_due = 0, updated_at = now()
  WHERE id = p_bill_id;
END;
$$;

-- ─── Create purchase receive ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_purchase_receive(
  p_vendor_id uuid,
  p_store_id uuid,
  p_receive_date date,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_po_id uuid DEFAULT NULL,
  p_purchase_bill_id uuid DEFAULT NULL,
  p_expected_delivery_date date DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reconcile_bill boolean DEFAULT true,
  p_finalize boolean DEFAULT false,
  p_allow_over_authorization boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receive_id uuid;
  v_receive_number text;
  v_line jsonb;
  v_variant_id uuid;
  v_po_line_id uuid;
  v_bill_line_id uuid;
  v_ordered numeric;
  v_billed numeric;
  v_received numeric;
  v_accepted numeric;
  v_rejected numeric;
  v_price numeric;
  v_tax_rate numeric;
  v_max_qty numeric;
BEGIN
  IF p_created_by IS NULL OR NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_vendor_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Vendor and store are required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  SELECT out_id, out_ref INTO v_receive_id, v_receive_number
  FROM public.erp_next_document_ref('purchase_receive') AS t;

  INSERT INTO public.erp_purchase_receives (
    id, receive_number, vendor_id, store_id, po_id, purchase_bill_id,
    receive_date, expected_delivery_date, reference, notes, reconcile_bill,
    status, created_by, updated_by
  )
  VALUES (
    v_receive_id, v_receive_number, p_vendor_id, p_store_id, p_po_id, p_purchase_bill_id,
    p_receive_date, p_expected_delivery_date, p_reference, p_notes, COALESCE(p_reconcile_bill, true),
    'draft', p_created_by, p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_po_line_id := NULLIF(v_line ->> 'po_line_id', '')::uuid;
    v_bill_line_id := NULLIF(v_line ->> 'bill_line_id', '')::uuid;
    v_variant_id := NULLIF(v_line ->> 'variant_id', '')::uuid;
    v_ordered := COALESCE((v_line ->> 'ordered_qty')::numeric, 0);
    v_billed := COALESCE((v_line ->> 'billed_qty')::numeric, 0);
    v_received := COALESCE((v_line ->> 'received_qty')::numeric, 0);
    v_accepted := COALESCE((v_line ->> 'accepted_qty')::numeric, 0);
    v_rejected := COALESCE((v_line ->> 'rejected_qty')::numeric, 0);
    v_price := COALESCE((v_line ->> 'purchase_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);

    IF v_accepted < 0 OR v_rejected < 0 OR v_received < 0 THEN
      RAISE EXCEPTION 'Quantities cannot be negative';
    END IF;

    IF v_accepted + v_rejected > v_received THEN
      RAISE EXCEPTION 'Accepted + rejected cannot exceed received quantity';
    END IF;

    IF v_po_line_id IS NOT NULL THEN
      SELECT quantity INTO v_ordered FROM public.purchase_order_items WHERE id = v_po_line_id;
    END IF;

    IF v_bill_line_id IS NOT NULL THEN
      SELECT quantity, purchase_price, tax_rate_percent
      INTO v_billed, v_price, v_tax_rate
      FROM public.erp_purchase_bill_lines WHERE id = v_bill_line_id;
    END IF;

    v_max_qty := NULLIF(GREATEST(COALESCE(v_billed, 0), COALESCE(v_ordered, 0)), 0);

    IF v_max_qty IS NOT NULL AND v_accepted > 0 THEN
      PERFORM public.validate_purchase_receive_over_qty(
        v_bill_line_id, v_po_line_id, v_max_qty, v_accepted, p_allow_over_authorization
      );
    END IF;

    INSERT INTO public.erp_purchase_receive_lines (
      purchase_receive_id, po_line_id, bill_line_id, variant_id, product_name, barcode,
      ordered_qty, billed_qty, received_qty, accepted_qty, rejected_qty,
      purchase_price, tax_rate_percent, expiry_date, batch_reference, batch_code, batch_number
    )
    VALUES (
      v_receive_id,
      v_po_line_id,
      v_bill_line_id,
      v_variant_id,
      COALESCE(v_line ->> 'product_name', 'Item'),
      v_line ->> 'barcode',
      COALESCE(v_ordered, 0),
      COALESCE(v_billed, 0),
      v_received,
      v_accepted,
      v_rejected,
      v_price,
      v_tax_rate,
      NULLIF(v_line ->> 'expiry_date', '')::date,
      v_line ->> 'batch_reference',
      v_line ->> 'batch_code',
      v_line ->> 'batch_number'
    );
  END LOOP;

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_receive(v_receive_id, p_reconcile_bill, p_created_by);
  END IF;

  RETURN v_receive_id;
END;
$$;

-- ─── Finalize purchase receive ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.finalize_erp_purchase_receive(
  p_receive_id uuid,
  p_reconcile_bill boolean DEFAULT NULL,
  p_finalized_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_committed boolean;
  v_store_id uuid;
  v_po_id uuid;
  v_bill_id uuid;
  v_reconcile boolean;
  r record;
BEGIN
  IF p_finalized_by IS NULL OR NOT public.is_staff_user(p_finalized_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, inventory_committed, store_id, po_id, purchase_bill_id, reconcile_bill
  INTO v_status, v_committed, v_store_id, v_po_id, v_bill_id, v_reconcile
  FROM public.erp_purchase_receives
  WHERE id = p_receive_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase receive not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot finalize cancelled receive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_finalized_by);

  IF v_status = 'finalized' AND v_committed THEN
    RETURN;
  END IF;

  v_reconcile := COALESCE(p_reconcile_bill, v_reconcile, true);

  IF NOT v_committed THEN
    PERFORM public.inventory_apply_purchase_receive_stock(p_receive_id, 1, p_finalized_by);

    FOR r IN
      SELECT prl.po_line_id, prl.bill_line_id, prl.accepted_qty, prl.rejected_qty, prl.received_qty
      FROM public.erp_purchase_receive_lines prl
      WHERE prl.purchase_receive_id = p_receive_id
    LOOP
      IF r.po_line_id IS NOT NULL THEN
        UPDATE public.purchase_order_items poi
        SET
          received_qty = COALESCE(poi.received_qty, 0) + COALESCE(r.received_qty, 0),
          accepted_qty = COALESCE(poi.accepted_qty, 0) + COALESCE(r.accepted_qty, 0),
          rejected_qty = COALESCE(poi.rejected_qty, 0) + COALESCE(r.rejected_qty, 0)
        WHERE poi.id = r.po_line_id;
      END IF;

      IF r.bill_line_id IS NOT NULL THEN
        UPDATE public.erp_purchase_bill_lines pbl
        SET
          received_qty = COALESCE(pbl.received_qty, 0) + COALESCE(r.received_qty, 0),
          accepted_qty = COALESCE(pbl.accepted_qty, 0) + COALESCE(r.accepted_qty, 0),
          rejected_qty = COALESCE(pbl.rejected_qty, 0) + COALESCE(r.rejected_qty, 0)
        WHERE pbl.id = r.bill_line_id;
      END IF;
    END LOOP;

    UPDATE public.erp_purchase_receives
    SET inventory_committed = true
    WHERE id = p_receive_id;
  END IF;

  IF v_reconcile AND v_bill_id IS NOT NULL THEN
    PERFORM public.reconcile_draft_purchase_bill_from_receive(p_receive_id, p_finalized_by);
  END IF;

  UPDATE public.erp_purchase_receives
  SET
    status = 'finalized',
    reconcile_bill = v_reconcile,
    updated_by = p_finalized_by,
    updated_at = now()
  WHERE id = p_receive_id;

  PERFORM public.post_journal_for_purchase_receive(p_receive_id, p_finalized_by);

  IF v_po_id IS NOT NULL THEN
    PERFORM public.sync_purchase_order_receiving_status(v_po_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_erp_purchase_receive(
  p_receive_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_committed boolean;
  v_store_id uuid;
  r record;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, inventory_committed, store_id
  INTO v_status, v_committed, v_store_id
  FROM public.erp_purchase_receives
  WHERE id = p_receive_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase receive not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  IF v_committed THEN
    PERFORM public.inventory_apply_purchase_receive_stock(p_receive_id, -1, p_actor);

    FOR r IN
      SELECT prl.po_line_id, prl.bill_line_id, prl.accepted_qty, prl.rejected_qty, prl.received_qty
      FROM public.erp_purchase_receive_lines prl
      WHERE prl.purchase_receive_id = p_receive_id
    LOOP
      IF r.po_line_id IS NOT NULL THEN
        UPDATE public.purchase_order_items poi
        SET
          received_qty = GREATEST(0, COALESCE(poi.received_qty, 0) - COALESCE(r.received_qty, 0)),
          accepted_qty = GREATEST(0, COALESCE(poi.accepted_qty, 0) - COALESCE(r.accepted_qty, 0)),
          rejected_qty = GREATEST(0, COALESCE(poi.rejected_qty, 0) - COALESCE(r.rejected_qty, 0))
        WHERE poi.id = r.po_line_id;
      END IF;

      IF r.bill_line_id IS NOT NULL THEN
        UPDATE public.erp_purchase_bill_lines pbl
        SET
          received_qty = GREATEST(0, COALESCE(pbl.received_qty, 0) - COALESCE(r.received_qty, 0)),
          accepted_qty = GREATEST(0, COALESCE(pbl.accepted_qty, 0) - COALESCE(r.accepted_qty, 0)),
          rejected_qty = GREATEST(0, COALESCE(pbl.rejected_qty, 0) - COALESCE(r.rejected_qty, 0))
        WHERE pbl.id = r.bill_line_id;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.erp_purchase_receives
  SET status = 'cancelled', updated_by = p_actor, updated_at = now()
  WHERE id = p_receive_id;
END;
$$;

-- ─── Incoming stock report helper ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_item_stock_report(
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.product_name), '[]'::jsonb)
    FROM (
      SELECT
        pv.id AS variant_id,
        p.name AS product_name,
        pv.name AS variant_name,
        pv.barcode,
        s.name AS store_name,
        si.store_id,
        ROUND(COALESCE(si.stock, 0), 2) AS stock,
        ROUND(COALESCE(si.reserved_stock, 0), 2) AS reserved_stock,
        ROUND(COALESCE(si.stock, 0) - COALESCE(si.reserved_stock, 0), 2) AS available_stock,
        ROUND(COALESCE(inb.incoming_qty, 0), 2) AS incoming_qty,
        ROUND(COALESCE(si.stock, 0) + COALESCE(inb.incoming_qty, 0), 2) AS expected_stock,
        COALESCE(inb.inbound_breakdown, '[]'::jsonb) AS inbound_breakdown,
        ROUND(COALESCE(si.purchase_price, pv.purchase_price, 0), 2) AS purchase_price,
        ROUND(COALESCE(si.sales_price, pv.price, 0), 2) AS sales_price
      FROM public.store_inventory si
      JOIN public.product_variants pv ON pv.id = si.variant_id
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.stores s ON s.id = si.store_id
      LEFT JOIN LATERAL (
        SELECT
          SUM(GREATEST(0, pending.pending_qty)) AS incoming_qty,
          COALESCE(jsonb_agg(
            jsonb_build_object(
              'document_type', pending.doc_type,
              'document_number', pending.doc_number,
              'quantity', pending.pending_qty,
              'expected_delivery_date', pending.expected_delivery_date
            )
            ORDER BY pending.expected_delivery_date NULLS LAST
          ) FILTER (WHERE pending.pending_qty > 0), '[]'::jsonb) AS inbound_breakdown
        FROM (
          SELECT
            'PO'::text AS doc_type,
            po.po_number AS doc_number,
            GREATEST(0, poi.quantity - COALESCE(poi.accepted_qty, 0)) AS pending_qty,
            po.expected_delivery_date
          FROM public.purchase_order_items poi
          JOIN public.purchase_orders po ON po.id = poi.po_id
          WHERE poi.variant_id = si.variant_id
            AND po.store_id = si.store_id
            AND po.status NOT IN ('cancelled', 'closed', 'fully_received')
          UNION ALL
          SELECT
            'PB'::text,
            pb.purchase_bill_number,
            GREATEST(0, pbl.quantity - COALESCE(pbl.accepted_qty, 0)),
            pb.expected_delivery_date
          FROM public.erp_purchase_bill_lines pbl
          JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
          WHERE pbl.variant_id = si.variant_id
            AND pb.store_id = si.store_id
            AND pb.status = 'draft'
            AND pb.legacy_stock_via_bill = false
        ) pending
      ) inb ON true
      WHERE (p_store_id IS NULL OR si.store_id = p_store_id)
        AND (
          COALESCE(si.stock, 0) <> 0
          OR COALESCE(inb.incoming_qty, 0) <> 0
        )
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_inbound_purchasing_pipeline(
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.expected_delivery_date NULLS LAST, r.created_at DESC), '[]'::jsonb)
    FROM (
      SELECT
        pr.id,
        pr.receive_number,
        pr.status,
        pr.receive_date,
        pr.expected_delivery_date,
        pr.reference,
        pr.po_id,
        po.po_number,
        pr.purchase_bill_id,
        pb.purchase_bill_number,
        pr.vendor_id,
        v.name AS vendor_name,
        pr.store_id,
        s.name AS store_name,
        po.status AS po_status,
        pb.status AS bill_status,
        (po.status = 'delivered') AS vendor_marked_delivered,
        pr.created_at,
        (
          SELECT COALESCE(SUM(GREATEST(0, prl.ordered_qty - COALESCE(prl.accepted_qty, 0))), 0)
          FROM public.erp_purchase_receive_lines prl
          WHERE prl.purchase_receive_id = pr.id
        ) AS pending_qty,
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', prl.id,
            'variant_id', prl.variant_id,
            'product_name', prl.product_name,
            'ordered_qty', prl.ordered_qty,
            'billed_qty', prl.billed_qty,
            'received_qty', prl.received_qty,
            'accepted_qty', prl.accepted_qty,
            'rejected_qty', prl.rejected_qty,
            'pending_qty', GREATEST(0, COALESCE(prl.billed_qty, prl.ordered_qty, 0) - COALESCE(prl.accepted_qty, 0)),
            'purchase_price', prl.purchase_price
          )), '[]'::jsonb)
          FROM public.erp_purchase_receive_lines prl
          WHERE prl.purchase_receive_id = pr.id
        ) AS lines
      FROM public.erp_purchase_receives pr
      JOIN public.vendors v ON v.id = pr.vendor_id
      JOIN public.stores s ON s.id = pr.store_id
      LEFT JOIN public.purchase_orders po ON po.id = pr.po_id
      LEFT JOIN public.erp_purchase_bills pb ON pb.id = pr.purchase_bill_id
      WHERE pr.status IN ('draft', 'finalized')
        AND (p_store_id IS NULL OR pr.store_id = p_store_id)
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_apply_purchase_receive_stock(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_purchase_receive(uuid, uuid, date, jsonb, uuid, uuid, date, text, text, boolean, boolean, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_erp_purchase_receive(uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_erp_purchase_receive(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_inbound_purchasing_pipeline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_purchase_receive(uuid, uuid) TO authenticated;

-- ─── Allow multiple bills per PO + expected delivery on bill create ──────────

CREATE OR REPLACE FUNCTION public.create_erp_purchase_bill(
  p_vendor_id uuid,
  p_store_id uuid,
  p_purchase_date date,
  p_due_date date DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_landed_costs jsonb DEFAULT '[]'::jsonb,
  p_discount numeric DEFAULT 0,
  p_po_id uuid DEFAULT NULL,
  p_vendor_bill_number text DEFAULT NULL,
  p_grn_reference text DEFAULT NULL,
  p_batch_reference text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sales_person_id uuid DEFAULT NULL,
  p_expected_delivery_date date DEFAULT NULL,
  p_finalize boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id uuid;
  v_bill_number text;
  v_line jsonb;
  v_lc jsonb;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_landed_total numeric := 0;
  v_qty numeric;
  v_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
  v_batch_code text;
  v_batch_number text;
  v_expected_delivery date;
BEGIN
  IF p_created_by IS NULL OR NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_vendor_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Vendor and store are required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_expected_delivery := p_expected_delivery_date;
  IF v_expected_delivery IS NULL AND p_po_id IS NOT NULL THEN
    SELECT expected_delivery_date INTO v_expected_delivery
    FROM public.purchase_orders WHERE id = p_po_id;
  END IF;

  IF p_batch_reference IS NULL OR p_batch_reference = '' THEN
    v_batch_code := format('%s_%s', p_store_id::text, to_char(now(), 'YYYYMMDDHH24MISS'));
    v_batch_number := substr(to_char(floor(random() * 100000)::integer, 'FM99999'), 1, 10);
  ELSE
    v_batch_code := p_batch_reference;
    v_batch_number := p_batch_reference;
  END IF;

  SELECT t.out_id, t.out_ref INTO v_bill_id, v_bill_number
  FROM public.erp_next_document_ref('purchase_bill') AS t;

  INSERT INTO public.erp_purchase_bills (
    id, purchase_bill_number, vendor_bill_number, vendor_id, po_id, store_id,
    purchase_date, due_date, expected_delivery_date, grn_reference, batch_reference, batch_code, batch_number,
    reference, sales_person_id, status, notes, created_by
  )
  VALUES (
    v_bill_id, v_bill_number, p_vendor_bill_number, p_vendor_id, p_po_id, p_store_id,
    p_purchase_date, p_due_date, v_expected_delivery, p_grn_reference, p_batch_reference,
    v_batch_code, v_batch_number, p_reference, p_sales_person_id,
    'draft', p_notes, p_created_by
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

    INSERT INTO public.erp_purchase_bill_lines (
      purchase_bill_id, variant_id, product_name, barcode, expiry_date,
      quantity, original_quantity, purchase_price, tax_rate_percent, tax_amount, line_total,
      unit_id
    )
    VALUES (
      v_bill_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_line ->> 'barcode',
      NULLIF(v_line ->> 'expiry_date', '')::date,
      v_qty,
      v_qty,
      v_price,
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(v_line ->> 'unit_id', '')::uuid
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  FOR v_lc IN SELECT * FROM jsonb_array_elements(p_landed_costs)
  LOOP
    v_qty := COALESCE((v_lc ->> 'quantity')::numeric, 1);
    v_price := COALESCE((v_lc ->> 'rate')::numeric, 0);
    v_tax_rate := COALESCE((v_lc ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    INSERT INTO public.erp_purchase_bill_landed_costs (
      purchase_bill_id, landed_cost_item_id, name, quantity, rate,
      tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_bill_id,
      NULLIF(v_lc ->> 'landed_cost_item_id', '')::uuid,
      v_lc ->> 'name',
      v_qty,
      v_price,
      v_tax_rate,
      v_line_tax,
      v_line_total
    );

    v_landed_total := v_landed_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_subtotal + v_tax - COALESCE(p_discount, 0)) + v_landed_total;

  UPDATE public.erp_purchase_bills
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax,
    discount = COALESCE(p_discount, 0),
    landed_cost_total = v_landed_total,
    total_amount = v_total,
    balance_due = 0,
    updated_at = now()
  WHERE id = v_bill_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, p_created_by);
  END IF;

  RETURN v_bill_id;
END;
$$;

COMMIT;
