-- Net acquisition cost: prorate purchase/sales header discounts into line economics.
-- WAC / compute_purchase_bill_inventory_amount / movement resolve use unit_net_acquisition_cost.

BEGIN;

ALTER TABLE public.erp_purchase_bill_lines
  ADD COLUMN IF NOT EXISTS discount_allocated numeric NOT NULL DEFAULT 0;

ALTER TABLE public.erp_purchase_bill_lines
  ADD COLUMN IF NOT EXISTS unit_net_acquisition_cost numeric;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS discount_allocated numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.erp_purchase_bill_lines.unit_net_acquisition_cost IS
  '(qty×price + landed − line discount) / qty; used for WAC receipt and GL inventory compute.';
COMMENT ON COLUMN public.invoice_items.discount_allocated IS
  'Header invoice discount prorated to this line (ex-tax extension basis).';

CREATE OR REPLACE FUNCTION public.erp_allocate_purchase_bill_discount(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discount numeric := 0;
  v_basis_total numeric := 0;
  v_line_count integer := 0;
  v_allocated numeric := 0;
  v_line_no integer := 0;
  r record;
  v_alloc numeric;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(discount, 0)
  INTO v_discount
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id;

  v_discount := GREATEST(0, COALESCE(v_discount, 0));

  UPDATE public.erp_purchase_bill_lines
  SET discount_allocated = 0
  WHERE purchase_bill_id = p_bill_id;

  IF v_discount <= 0 THEN
    PERFORM public.erp_refresh_purchase_bill_line_net_unit(p_bill_id);
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(public.erp_round_calc(GREATEST(0, quantity) * COALESCE(purchase_price, 0))), 0),
    COUNT(*)::integer
  INTO v_basis_total, v_line_count
  FROM public.erp_purchase_bill_lines
  WHERE purchase_bill_id = p_bill_id
    AND quantity > 0;

  IF v_basis_total <= 0 OR v_line_count = 0 THEN
    PERFORM public.erp_refresh_purchase_bill_line_net_unit(p_bill_id);
    RETURN;
  END IF;

  v_line_no := 0;
  FOR r IN
    SELECT id, quantity, purchase_price
    FROM public.erp_purchase_bill_lines
    WHERE purchase_bill_id = p_bill_id
      AND quantity > 0
    ORDER BY id
  LOOP
    v_line_no := v_line_no + 1;
    IF v_line_no < v_line_count THEN
      v_alloc := public.erp_round_calc(
        v_discount * (public.erp_round_calc(r.quantity * COALESCE(r.purchase_price, 0)) / v_basis_total)
      );
      v_allocated := public.erp_round_calc(v_allocated + v_alloc);
    ELSE
      v_alloc := public.erp_round_calc(v_discount - v_allocated);
    END IF;

    UPDATE public.erp_purchase_bill_lines
    SET discount_allocated = GREATEST(0, v_alloc)
    WHERE id = r.id;
  END LOOP;

  PERFORM public.erp_refresh_purchase_bill_line_net_unit(p_bill_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_refresh_purchase_bill_line_net_unit(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.erp_purchase_bill_lines pbl
  SET unit_net_acquisition_cost = CASE
    WHEN COALESCE(pbl.quantity, 0) <= 0 THEN COALESCE(pbl.purchase_price, 0)
    ELSE ROUND(
      (
        GREATEST(0, pbl.quantity) * COALESCE(pbl.purchase_price, 0)
        + GREATEST(0, COALESCE(pbl.landed_cost_allocated, 0))
        - GREATEST(0, COALESCE(pbl.discount_allocated, 0))
      ) / NULLIF(pbl.quantity, 0),
      4
    )
  END
  WHERE pbl.purchase_bill_id = p_bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_purchase_bill_inventory_amount(p_bill_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := 0;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(
    SUM(
      public.erp_round_calc(
        GREATEST(0, pbl.quantity) * COALESCE(pbl.purchase_price, 0)
        + GREATEST(0, COALESCE(pbl.landed_cost_allocated, 0))
        - GREATEST(0, COALESCE(pbl.discount_allocated, 0))
      )
    ),
    0
  )
  INTO v_amount
  FROM public.erp_purchase_bill_lines pbl
  WHERE pbl.purchase_bill_id = p_bill_id
    AND pbl.quantity > 0;

  RETURN GREATEST(0, COALESCE(v_amount, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_allocate_invoice_discount(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discount numeric := 0;
  v_basis_total numeric := 0;
  v_line_count integer := 0;
  v_allocated numeric := 0;
  v_line_no integer := 0;
  r record;
  v_alloc numeric;
  v_ext numeric;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(discount, 0)
  INTO v_discount
  FROM public.invoices
  WHERE id = p_invoice_id;

  v_discount := GREATEST(0, COALESCE(v_discount, 0));

  UPDATE public.invoice_items
  SET discount_allocated = 0
  WHERE invoice_id = p_invoice_id;

  IF v_discount <= 0 THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(COALESCE(taxable_amount, total_amount - gst_amount, 0)), 0),
    COUNT(*)::integer
  INTO v_basis_total, v_line_count
  FROM public.invoice_items
  WHERE invoice_id = p_invoice_id
    AND quantity > 0;

  IF v_basis_total <= 0 OR v_line_count = 0 THEN
    RETURN;
  END IF;

  v_line_no := 0;
  FOR r IN
    SELECT
      id,
      quantity,
      COALESCE(taxable_amount, total_amount - gst_amount, 0) AS ext
    FROM public.invoice_items
    WHERE invoice_id = p_invoice_id
      AND quantity > 0
    ORDER BY id
  LOOP
    v_line_no := v_line_no + 1;
    v_ext := GREATEST(0, COALESCE(r.ext, 0));
    IF v_line_no < v_line_count THEN
      v_alloc := public.erp_round_calc(v_discount * (v_ext / v_basis_total));
      v_allocated := public.erp_round_calc(v_allocated + v_alloc);
    ELSE
      v_alloc := public.erp_round_calc(v_discount - v_allocated);
    END IF;

    UPDATE public.invoice_items
    SET discount_allocated = GREATEST(0, v_alloc)
    WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_invoice_item_margin_components(
  p_base_price numeric,
  p_unit_price numeric,
  p_variant_id uuid,
  p_product_id uuid,
  p_store_id uuid,
  p_quantity numeric,
  p_pending_cost_qty numeric,
  p_taxable_amount numeric,
  p_discount_allocated numeric DEFAULT 0
)
RETURNS TABLE (
  line_cogs numeric,
  uncosted_revenue numeric,
  recognized_profit numeric,
  net_revenue_ex_tax numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty numeric := GREATEST(COALESCE(p_quantity, 0), 0);
  v_pending numeric := GREATEST(COALESCE(p_pending_cost_qty, 0), 0);
  v_costed_qty numeric;
  v_unit_cost numeric;
  v_taxable numeric := COALESCE(p_taxable_amount, 0);
  v_discount numeric := GREATEST(0, COALESCE(p_discount_allocated, 0));
  v_net_revenue numeric;
  v_cogs numeric;
  v_uncosted numeric;
BEGIN
  IF v_qty <= 0 THEN
    line_cogs := 0;
    uncosted_revenue := 0;
    recognized_profit := 0;
    net_revenue_ex_tax := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_pending := LEAST(v_pending, v_qty);
  v_costed_qty := v_qty - v_pending;
  v_net_revenue := GREATEST(0, v_taxable - v_discount);

  IF v_pending >= v_qty THEN
    v_unit_cost := 0;
  ELSIF COALESCE(p_base_price, 0) > 0
    AND (
      p_unit_price IS NULL
      OR abs(p_base_price - p_unit_price) > 0.0001
    )
  THEN
    v_unit_cost := p_base_price;
  ELSE
    v_unit_cost := public.erp_invoice_line_unit_cost(
      p_base_price,
      p_unit_price,
      p_variant_id,
      p_product_id,
      p_store_id
    );
  END IF;

  v_cogs := ROUND(COALESCE(v_unit_cost, 0) * v_costed_qty, 2);
  v_uncosted := ROUND(v_net_revenue * (v_pending / v_qty), 2);

  line_cogs := v_cogs;
  uncosted_revenue := v_uncosted;
  net_revenue_ex_tax := ROUND(v_net_revenue, 2);
  recognized_profit := ROUND(v_net_revenue - v_cogs - v_uncosted, 2);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_invoice_recognized_cogs_total(p_invoice_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric := 0;
  r record;
  mc record;
BEGIN
  FOR r IN
    SELECT
      ii.base_price,
      ii.unit_price,
      ii.variant_id,
      ii.product_id,
      ii.quantity,
      ii.pending_cost_qty,
      COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount) AS taxable_amount,
      COALESCE(ii.discount_allocated, 0) AS discount_allocated,
      i.store_id
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE ii.invoice_id = p_invoice_id
  LOOP
    SELECT * INTO mc
    FROM public.erp_invoice_item_margin_components(
      r.base_price,
      r.unit_price,
      r.variant_id,
      r.product_id,
      r.store_id,
      r.quantity,
      r.pending_cost_qty,
      r.taxable_amount,
      r.discount_allocated
    );
    v_total := v_total + COALESCE(mc.line_cogs, 0);
  END LOOP;

  RETURN ROUND(COALESCE(v_total, 0), 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_resolve_stock_movement_unit_cost(
  p_product_id uuid,
  p_reference_type text,
  p_reference_id uuid,
  p_transaction_price numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit numeric;
BEGIN
  IF p_reference_type = 'purchase_bill' AND p_reference_id IS NOT NULL THEN
    SELECT COALESCE(
      pbl.unit_net_acquisition_cost,
      pbl.unit_loaded_cost,
      pbl.purchase_price
    )
    INTO v_unit
    FROM public.erp_purchase_bill_lines pbl
    LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
    WHERE pbl.purchase_bill_id = p_reference_id
      AND COALESCE(pbl.product_id, pv.product_id) = p_product_id
      AND pbl.quantity > 0
    ORDER BY pbl.id
    LIMIT 1;
    IF v_unit IS NOT NULL AND v_unit > 0 THEN
      RETURN v_unit;
    END IF;
  END IF;

  IF p_reference_type = 'purchase_receive' AND p_reference_id IS NOT NULL THEN
    SELECT public.resolve_receive_line_loaded_unit_cost(prl.bill_line_id, prl.purchase_price)
    INTO v_unit
    FROM public.erp_purchase_receive_lines prl
    LEFT JOIN public.product_variants pv ON pv.id = prl.variant_id
    WHERE prl.purchase_receive_id = p_reference_id
      AND COALESCE(prl.product_id, pv.product_id) = p_product_id
      AND COALESCE(prl.accepted_qty, 0) > 0
    ORDER BY prl.id
    LIMIT 1;
    IF v_unit IS NOT NULL AND v_unit > 0 THEN
      RETURN v_unit;
    END IF;
  END IF;

  IF COALESCE(p_transaction_price, 0) > 0 THEN
    RETURN p_transaction_price;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_apply_purchase_bill_stock(
  p_bill_id uuid,
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
  v_unit numeric;
  v_actor uuid;
  v_committed boolean;
BEGIN
  v_actor := COALESCE(p_user_id, auth.uid());

  IF p_bill_id IS NULL OR p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid purchase bill stock request';
  END IF;

  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_multiplier = 1 AND NOT public.purchase_bill_should_increase_stock_on_finalize(p_bill_id) THEN
    RETURN;
  END IF;

  SELECT store_id, inventory_committed
  INTO v_store_id, v_committed
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill store not found';
  END IF;

  PERFORM public.require_store_access(v_store_id, v_actor);

  IF p_multiplier = 1 AND COALESCE(v_committed, false) THEN
    RETURN;
  END IF;

  IF p_multiplier = -1 AND NOT COALESCE(v_committed, false) THEN
    RETURN;
  END IF;

  PERFORM public.refresh_purchase_bill_landed_allocations(p_bill_id);
  PERFORM public.erp_allocate_purchase_bill_discount(p_bill_id);

  FOR r IN
    SELECT
      pbl.id,
      COALESCE(pbl.product_id, pv.product_id) AS product_id,
      pbl.quantity,
      COALESCE(
        pbl.unit_net_acquisition_cost,
        pbl.unit_loaded_cost,
        pbl.purchase_price
      ) AS unit_cost
    FROM public.erp_purchase_bill_lines pbl
    LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
    WHERE pbl.purchase_bill_id = p_bill_id
      AND COALESCE(pbl.product_id, pv.product_id) IS NOT NULL
      AND pbl.quantity > 0
  LOOP
    v_delta := r.quantity * p_multiplier;
    v_unit := COALESCE(r.unit_cost, 0);

    PERFORM public.store_product_inventory_apply_receipt_cost(
      v_store_id, r.product_id, v_delta, v_unit, v_actor
    );

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta, 'purchase', p_bill_id, 'purchase_bill',
      'Purchase Bill Receipt', v_store_id, NULL, v_unit, v_actor
    );
  END LOOP;
END;
$$;

-- Read-only: historical COGS true-up proposal (does not post journals).
CREATE OR REPLACE FUNCTION public.erp_audit_invoice_cogs_trueup(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted numeric := 0;
  v_expected numeric := 0;
  v_store_id uuid;
  v_number text;
BEGIN
  PERFORM public.erp_require_staff_or_service_role();

  SELECT i.store_id, i.invoice_number
  INTO v_store_id, v_number
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_expected := public.erp_invoice_recognized_cogs_total(p_invoice_id);

  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
  INTO v_posted
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE je.source_entity_type = 'invoice'
    AND je.source_entity_id = p_invoice_id
    AND je.status = 'posted'
    AND a.code = 'STOCK';

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'invoice_number', v_number,
    'store_id', v_store_id,
    'posted_stock_credit', ROUND(COALESCE(v_posted, 0), 2),
    'expected_cogs_at_current_spi_wac', ROUND(COALESCE(v_expected, 0), 2),
    'proposed_stock_credit_adjustment',
      ROUND(COALESCE(v_expected, 0) - COALESCE(v_posted, 0), 2),
    'note',
      'Proposal only — post a manual or approved adjusting journal; this RPC does not mutate GL.'
  );
END;
$$;

-- Backfill line discount + net unit on existing bills (metadata only; does not repost journals or SPI).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.erp_purchase_bills
    WHERE COALESCE(discount, 0) > 0
  LOOP
    PERFORM public.refresh_purchase_bill_landed_allocations(r.id);
    PERFORM public.erp_allocate_purchase_bill_discount(r.id);
  END LOOP;

  FOR r IN
    SELECT id FROM public.invoices
    WHERE COALESCE(discount, 0) > 0
  LOOP
    PERFORM public.erp_allocate_invoice_discount(r.id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_allocate_purchase_bill_discount(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_refresh_purchase_bill_line_net_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_allocate_invoice_discount(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_audit_invoice_cogs_trueup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_audit_invoice_cogs_trueup(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.post_journal_for_invoice(
  p_invoice_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_subtotal numeric;
  v_tax numeric;
  v_total numeric;
  v_income numeric;
  v_cogs numeric;
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
  WHERE source_entity_type = 'invoice'
    AND source_entity_id = p_invoice_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    PERFORM public.sync_cash_book_from_journal(v_existing);
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('invoice') THEN
    RETURN NULL;
  END IF;

  PERFORM public.erp_allocate_invoice_discount(p_invoice_id);

  SELECT subtotal, gst_amount, total_amount, store_id, invoice_number,
         COALESCE(issued_at::date, created_at::date)
  INTO v_subtotal, v_tax, v_total, v_store_id, v_number, v_date
  FROM public.invoices
  WHERE id = p_invoice_id
    AND status IN ('issued', 'partial', 'paid');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found or not eligible for journal posting';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Invoice total must be positive for journal posting';
  END IF;

  IF v_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(v_store_id, p_actor);
  END IF;

  v_tax := COALESCE(v_tax, 0);
  v_total := COALESCE(v_total, 0);
  v_income := GREATEST(v_total - v_tax, 0);
  v_cogs := public.erp_invoice_recognized_cogs_total(p_invoice_id);

  PERFORM public.ensure_system_ledger_account('ACCOUNTS_RECIEVABLE', 'Accounts Recievable');
  PERFORM public.ensure_system_ledger_account('INCOME', 'Income');
  PERFORM public.ensure_system_ledger_account('OVERSEAS_TAX_PAYABLE', 'Overseas Tax Payable');
  IF v_cogs > 0 THEN
    PERFORM public.ensure_system_ledger_account('COST_OF_GOODS_SOLD', 'Cost of Goods Sold');
    PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'ACCOUNTS_RECIEVABLE', 'debit', v_total, 'description', 'Invoice ' || v_number)
  );

  IF v_income > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'INCOME', 'credit', v_income, 'description', 'Sales')
    );
  END IF;

  IF v_tax > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'OVERSEAS_TAX_PAYABLE', 'credit', v_tax, 'description', 'Output tax')
    );
  END IF;

  IF v_cogs > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'COST_OF_GOODS_SOLD', 'debit', v_cogs, 'description', 'COGS'),
      jsonb_build_object('account_code', 'STOCK', 'credit', v_cogs, 'description', 'Inventory')
    );
  END IF;

  RETURN public.create_posted_journal_entry(
    v_date, 'Invoice ' || v_number, v_store_id, 'invoice', p_invoice_id, v_lines, p_actor
  );
END;
$$;

COMMIT;
