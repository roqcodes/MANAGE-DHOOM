-- GL COGS on sales, deferred cost recognition, P&L / finance dashboard alignment.
-- Does NOT backfill historical invoice COGS journals — use erp_audit_missing_sale_cogs_gl.

BEGIN;

-- ─── Deferred COGS posting audit trail (one journal per cost-resolution event) ─

CREATE TABLE IF NOT EXISTS public.erp_invoice_deferred_cogs_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  invoice_item_id uuid NOT NULL REFERENCES public.invoice_items (id) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  amount numeric NOT NULL CHECK (amount > 0),
  journal_entry_id uuid REFERENCES public.journal_entries (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_invoice_deferred_cogs_postings_invoice_idx
  ON public.erp_invoice_deferred_cogs_postings (invoice_id);

CREATE INDEX IF NOT EXISTS erp_invoice_deferred_cogs_postings_item_idx
  ON public.erp_invoice_deferred_cogs_postings (invoice_item_id);

ALTER TABLE public.erp_invoice_deferred_cogs_postings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_invoice_deferred_cogs_postings_staff ON public.erp_invoice_deferred_cogs_postings;
CREATE POLICY erp_invoice_deferred_cogs_postings_staff
  ON public.erp_invoice_deferred_cogs_postings
  FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

-- ─── Helpers ────────────────────────────────────────────────────────────────

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
      r.taxable_amount
    );
    v_total := v_total + COALESCE(mc.line_cogs, 0);
  END LOOP;

  RETURN ROUND(COALESCE(v_total, 0), 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_credit_note_recognized_cogs_total(
  p_credit_note_id uuid,
  p_store_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric := 0;
  r record;
  v_unit_cost numeric;
BEGIN
  FOR r IN
    SELECT cl.quantity, cl.variant_id, cl.product_id, cl.unit_price
    FROM public.erp_credit_note_lines cl
    WHERE cl.credit_note_id = p_credit_note_id
  LOOP
    v_unit_cost := public.erp_resolve_invoice_line_cost(
      NULL,
      r.variant_id,
      r.product_id,
      p_store_id
    );
    IF COALESCE(v_unit_cost, 0) <= 0 THEN
      v_unit_cost := public.erp_invoice_line_unit_cost(
        NULL,
        r.unit_price,
        r.variant_id,
        r.product_id,
        p_store_id
      );
    END IF;
    v_total := v_total + ROUND(COALESCE(v_unit_cost, 0) * GREATEST(COALESCE(r.quantity, 0), 0), 2);
  END LOOP;

  RETURN ROUND(COALESCE(v_total, 0), 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_post_invoice_item_deferred_cogs(
  p_invoice_item_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_actor uuid DEFAULT auth.uid(),
  p_transaction_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posting_id uuid;
  v_invoice_id uuid;
  v_store_id uuid;
  v_number text;
  v_amount numeric;
  v_lines jsonb;
  v_journal_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 OR COALESCE(p_unit_cost, 0) < 0 THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_posting_enabled('invoice') THEN
    RETURN NULL;
  END IF;

  SELECT ii.invoice_id, i.store_id, i.invoice_number
  INTO v_invoice_id, v_store_id, v_number
  FROM public.invoice_items ii
  JOIN public.invoices i ON i.id = ii.invoice_id
  WHERE ii.id = p_invoice_item_id;

  IF v_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_amount := ROUND(p_quantity * p_unit_cost, 2);
  IF v_amount <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.erp_invoice_deferred_cogs_postings (
    invoice_id, invoice_item_id, quantity, unit_cost, amount
  )
  VALUES (v_invoice_id, p_invoice_item_id, p_quantity, p_unit_cost, v_amount)
  RETURNING id INTO v_posting_id;

  PERFORM public.ensure_system_ledger_account('COST_OF_GOODS_SOLD', 'Cost of Goods Sold');
  PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', 'COST_OF_GOODS_SOLD',
      'debit', v_amount,
      'description', 'Deferred COGS — invoice ' || COALESCE(v_number, v_invoice_id::text)
    ),
    jsonb_build_object(
      'account_code', 'STOCK',
      'credit', v_amount,
      'description', 'Inventory — deferred COGS'
    )
  );

  v_journal_id := public.create_posted_journal_entry(
    COALESCE(p_transaction_date, CURRENT_DATE),
    'Deferred COGS — invoice ' || COALESCE(v_number, ''),
    v_store_id,
    'invoice_deferred_cogs',
    v_posting_id,
    v_lines,
    p_actor
  );

  UPDATE public.erp_invoice_deferred_cogs_postings
  SET journal_entry_id = v_journal_id
  WHERE id = v_posting_id;

  RETURN v_journal_id;
END;
$$;

-- ─── Void invoice journals + deferred COGS ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.void_journals_for_entity(p_source_type text, p_source_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_source_type IS NULL OR p_source_id IS NULL THEN
    RETURN;
  END IF;

  IF p_source_type = 'invoice' THEN
    FOR v_id IN
      SELECT d.journal_entry_id
      FROM public.erp_invoice_deferred_cogs_postings d
      WHERE d.invoice_id = p_source_id
        AND d.journal_entry_id IS NOT NULL
    LOOP
      PERFORM public.void_posted_journal(v_id);
    END LOOP;
  END IF;

  FOR v_id IN
    SELECT id FROM public.journal_entries
    WHERE source_entity_type = p_source_type
      AND source_entity_id = p_source_id
      AND status = 'posted'
  LOOP
    PERFORM public.void_posted_journal(v_id);
  END LOOP;
END;
$$;

-- ─── Sale invoice GL: revenue + recognized COGS ─────────────────────────────

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

-- ─── Credit note: revenue/tax reversal + COGS / stock reversal ──────────────

CREATE OR REPLACE FUNCTION public.post_journal_for_credit_note(
  p_credit_note_id uuid,
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
  WHERE source_entity_type = 'credit_note'
    AND source_entity_id = p_credit_note_id
    AND status = 'posted';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT public.is_posting_enabled('credit_note') THEN
    RETURN NULL;
  END IF;

  SELECT subtotal, tax_amount, total_amount, store_id, credit_note_date, credit_note_number
  INTO v_subtotal, v_tax, v_total, v_store_id, v_date, v_number
  FROM public.erp_credit_notes
  WHERE id = p_credit_note_id AND status IN ('issued', 'applied');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note not found or not eligible for journal posting';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Credit note total must be positive';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_subtotal := COALESCE(v_subtotal, GREATEST(v_total - COALESCE(v_tax, 0), 0));
  v_tax := COALESCE(v_tax, 0);
  v_cogs := public.erp_credit_note_recognized_cogs_total(p_credit_note_id, v_store_id);

  PERFORM public.ensure_system_ledger_account('INCOME', 'Income');
  PERFORM public.ensure_system_ledger_account('ACCOUNTS_RECIEVABLE', 'Accounts Recievable');
  PERFORM public.ensure_system_ledger_account('OVERSEAS_TAX_PAYABLE', 'Overseas Tax Payable');
  IF v_cogs > 0 THEN
    PERFORM public.ensure_system_ledger_account('COST_OF_GOODS_SOLD', 'Cost of Goods Sold');
    PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');
  END IF;

  v_lines := jsonb_build_array();

  IF v_subtotal > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'INCOME', 'debit', v_subtotal, 'description', 'Credit note revenue reversal')
    );
  END IF;

  IF v_tax > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'OVERSEAS_TAX_PAYABLE', 'debit', v_tax, 'description', 'Output tax reversal')
    );
  END IF;

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('account_code', 'ACCOUNTS_RECIEVABLE', 'credit', v_total, 'description', 'AR reduction')
  );

  IF v_cogs > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', 'STOCK', 'debit', v_cogs, 'description', 'Inventory return'),
      jsonb_build_object('account_code', 'COST_OF_GOODS_SOLD', 'credit', v_cogs, 'description', 'COGS reversal')
    );
  END IF;

  RETURN public.create_posted_journal_entry(
    v_date, 'Credit note ' || v_number, v_store_id, 'credit_note', p_credit_note_id, v_lines, p_actor
  );
END;
$$;

-- ─── Pending cost resolution → deferred COGS GL ─────────────────────────────

CREATE OR REPLACE FUNCTION public.erp_allocate_receipt_cost_to_pending_sales(
  p_store_id uuid,
  p_product_id uuid,
  p_receipt_qty numeric,
  p_unit_cost numeric,
  p_actor uuid DEFAULT auth.uid(),
  p_posting_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric;
  v_pending_total numeric;
  r record;
  v_alloc numeric;
BEGIN
  IF p_store_id IS NULL OR p_product_id IS NULL THEN
    RETURN;
  END IF;
  IF COALESCE(p_receipt_qty, 0) <= 0 OR COALESCE(p_unit_cost, 0) < 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(ii.pending_cost_qty), 0)
  INTO v_pending_total
  FROM public.invoice_items ii
  INNER JOIN public.invoices i ON i.id = ii.invoice_id
  WHERE i.store_id = p_store_id
    AND ii.product_id = p_product_id
    AND i.status NOT IN ('cancelled', 'pending', 'draft')
    AND COALESCE(ii.pending_cost_qty, 0) > 0;

  IF COALESCE(v_pending_total, 0) <= 0 THEN
    RETURN;
  END IF;

  v_remaining := LEAST(p_receipt_qty, v_pending_total);

  FOR r IN
    SELECT
      ii.id,
      ii.pending_cost_qty
    FROM public.invoice_items ii
    INNER JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.store_id = p_store_id
      AND ii.product_id = p_product_id
      AND i.status NOT IN ('cancelled', 'pending', 'draft')
      AND COALESCE(ii.pending_cost_qty, 0) > 0
    ORDER BY COALESCE(i.issued_at, i.created_at), i.id, ii.id
    FOR UPDATE OF ii
  LOOP
    IF v_remaining <= 0 THEN
      EXIT;
    END IF;

    v_alloc := LEAST(r.pending_cost_qty, v_remaining);
    IF v_alloc <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.invoice_items
    SET
      base_price = ROUND(p_unit_cost, 4),
      pending_cost_qty = pending_cost_qty - v_alloc
    WHERE id = r.id;

    PERFORM public.erp_post_invoice_item_deferred_cogs(
      r.id,
      v_alloc,
      p_unit_cost,
      p_actor,
      p_posting_date
    );

    v_remaining := v_remaining - v_alloc;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_product_inventory_apply_receipt_cost(
  p_store_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_cost numeric;
  v_new_stock numeric;
  v_new_cost numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_store_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Store and product are required';
  END IF;

  IF p_qty = 0 THEN
    RETURN NULL;
  END IF;

  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be zero or positive';
  END IF;

  SELECT stock, purchase_price
  INTO v_stock, v_cost
  FROM public.store_product_inventory
  WHERE store_id = p_store_id AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock: no inventory for product % at store %', p_product_id, p_store_id;
    END IF;
    INSERT INTO public.store_product_inventory (store_id, product_id, stock, purchase_price, updated_at)
    VALUES (p_store_id, p_product_id, p_qty, ROUND(p_unit_cost, 4), now());
    PERFORM public.erp_allocate_receipt_cost_to_pending_sales(
      p_store_id, p_product_id, p_qty, p_unit_cost, p_user_id, CURRENT_DATE
    );
    RETURN ROUND(p_unit_cost, 4);
  END IF;

  v_new_stock := COALESCE(v_stock, 0) + p_qty;
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: product % at store %', p_product_id, p_store_id;
  END IF;

  IF p_qty > 0 THEN
    IF COALESCE(v_stock, 0) <= 0 OR v_cost IS NULL THEN
      v_new_cost := p_unit_cost;
    ELSE
      v_new_cost := (COALESCE(v_stock, 0) * COALESCE(v_cost, 0) + p_qty * p_unit_cost)
        / NULLIF(COALESCE(v_stock, 0) + p_qty, 0);
    END IF;
    v_new_cost := ROUND(v_new_cost, 4);
  ELSE
    v_new_cost := v_cost;
    IF v_new_stock = 0 THEN
      v_new_cost := NULL;
    END IF;
  END IF;

  UPDATE public.store_product_inventory
  SET stock = v_new_stock, purchase_price = v_new_cost, updated_at = now()
  WHERE store_id = p_store_id AND product_id = p_product_id;

  IF p_qty > 0 THEN
    PERFORM public.erp_allocate_receipt_cost_to_pending_sales(
      p_store_id, p_product_id, p_qty, p_unit_cost, p_user_id, CURRENT_DATE
    );
  END IF;

  RETURN v_new_cost;
END;
$$;

-- ─── P&L: gross profit = income − COGS; net = gross − operating expenses ───

CREATE OR REPLACE FUNCTION public.get_erp_profit_and_loss(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_income jsonb;
  v_cogs jsonb;
  v_expense jsonb;
  v_income_total numeric := 0;
  v_cogs_total numeric := 0;
  v_operating_total numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb),
         COALESCE(SUM(r.amount), 0)
  INTO v_income, v_income_total
  FROM (
    SELECT
      a.code AS account_code,
      a.name AS account_name,
      ROUND(
        COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0),
        2
      ) AS amount
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE t.account_category = 'Income'
      AND a.is_active = true
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND (
        p_store_id IS NULL
        OR je.store_id = p_store_id
        OR je.store_id IS NULL
      )
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)) > 0.001
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb),
         COALESCE(SUM(r.amount), 0)
  INTO v_cogs, v_cogs_total
  FROM (
    SELECT
      a.code AS account_code,
      a.name AS account_name,
      ROUND(
        COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0),
        2
      ) AS amount
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE t.account_category = 'Expense'
      AND t.name = 'Cost of Goods Sold'
      AND a.is_active = true
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND (
        p_store_id IS NULL
        OR je.store_id = p_store_id
        OR je.store_id IS NULL
      )
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.001
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.account_code), '[]'::jsonb),
         COALESCE(SUM(r.amount), 0)
  INTO v_expense, v_operating_total
  FROM (
    SELECT
      a.code AS account_code,
      a.name AS account_name,
      ROUND(
        COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0),
        2
      ) AS amount
    FROM public.accounts a
    JOIN public.account_types t ON t.id = a.account_type_id
    JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE t.account_category = 'Expense'
      AND t.name <> 'Cost of Goods Sold'
      AND a.is_active = true
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_date_from AND p_date_to
      AND (
        p_store_id IS NULL
        OR je.store_id = p_store_id
        OR je.store_id IS NULL
      )
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.001
  ) r;

  RETURN jsonb_build_object(
    'date_from', p_date_from,
    'date_to', p_date_to,
    'store_id', p_store_id,
    'income', v_income,
    'cogs', v_cogs,
    'expenses', v_expense,
    'total_income', ROUND(v_income_total, 2),
    'total_cogs', ROUND(v_cogs_total, 2),
    'total_operating_expenses', ROUND(v_operating_total, 2),
    'total_expenses', ROUND(v_cogs_total + v_operating_total, 2),
    'gross_profit', ROUND(v_income_total - v_cogs_total, 2),
    'net_profit', ROUND(v_income_total - v_cogs_total - v_operating_total, 2)
  );
END;
$$;

-- ─── Financial dashboard (posted GL, purchases separate from COGS) ───────────

DROP FUNCTION IF EXISTS public.get_erp_financial_dashboard();

CREATE OR REPLACE FUNCTION public.get_erp_financial_dashboard(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_to date;
  v_pl jsonb;
  v_ar numeric;
  v_ap numeric;
  v_purchases numeric;
  v_daily_sales jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_from := COALESCE(p_date_from, date_trunc('year', CURRENT_DATE)::date);
  v_to := COALESCE(p_date_to, CURRENT_DATE);

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  v_pl := public.get_erp_profit_and_loss(v_from, v_to, p_store_id);

  IF p_store_id IS NULL THEN
    v_ar := public.get_account_balance(public.get_account_by_code('ACCOUNTS_RECIEVABLE'));
    v_ap := public.get_account_balance(public.get_account_by_code('ACCOUNTS_PAYABLE'));
  ELSE
    SELECT COALESCE(SUM(balance_due), 0) INTO v_ar
    FROM public.invoices
    WHERE store_id = p_store_id
      AND status IN ('issued', 'partial', 'paid', 'overdue')
      AND balance_due > 0;

    SELECT COALESCE(SUM(balance_due), 0) INTO v_ap
    FROM public.erp_purchase_bills
    WHERE store_id = p_store_id
      AND status IN ('finalized', 'partial', 'paid')
      AND balance_due > 0;
  END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_purchases
  FROM public.erp_purchase_bills
  WHERE status IN ('finalized', 'partial', 'paid')
    AND purchase_date BETWEEN v_from AND v_to
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_daily_sales
  FROM (
    SELECT COALESCE(i.issued_at::date, i.created_at::date) AS day, SUM(i.total_amount) AS total
    FROM public.invoices i
    WHERE i.status IN ('issued', 'partial', 'paid')
      AND COALESCE(i.issued_at::date, i.created_at::date) >= (CURRENT_DATE - 30)
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
    GROUP BY COALESCE(i.issued_at::date, i.created_at::date)
    ORDER BY day
  ) r;

  RETURN jsonb_build_object(
    'accounts_receivable', ROUND(v_ar, 2),
    'accounts_payable', ROUND(v_ap, 2),
    'net_income_ytd', (v_pl ->> 'total_income')::numeric,
    'cogs_ytd', (v_pl ->> 'total_cogs')::numeric,
    'purchases_ytd', ROUND(v_purchases, 2),
    'expenses_ytd', (v_pl ->> 'total_operating_expenses')::numeric,
    'gross_profit_ytd', (v_pl ->> 'gross_profit')::numeric,
    'net_profit_ytd', (v_pl ->> 'net_profit')::numeric,
    'date_from', v_from,
    'date_to', v_to,
    'store_id', p_store_id,
    'low_stock_count', (
      SELECT COUNT(*) FROM public.inventory i
      WHERE i.stock <= COALESCE(i.reorder_point, 0)
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
    ),
    'daily_sales', v_daily_sales,
    'invoice_status_ytd', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT status, COUNT(*) AS count, SUM(total_amount) AS total
        FROM public.invoices i
        WHERE COALESCE(i.issued_at::date, i.created_at::date) BETWEEN v_from AND v_to
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
        GROUP BY status
      ) r
    )
  );
END;
$$;

-- ─── Store P&L series: COGS vs operating expenses ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_erp_store_pl_series(
  p_store_id uuid,
  p_date_from date,
  p_date_to date,
  p_granularity text DEFAULT 'month'
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
  PERFORM public.require_store_access(p_store_id);

  IF p_granularity = 'day' THEN
    RETURN COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'period_key', x.period_key,
            'income', x.income,
            'cogs', x.cogs,
            'expenses', x.operating_expenses,
            'net_profit', ROUND(x.income - x.cogs - x.operating_expenses, 2)
          )
          ORDER BY x.period_key
        )
        FROM (
          SELECT
            je.transaction_date::text AS period_key,
            ROUND(COALESCE(SUM(
              CASE WHEN t.account_category = 'Income'
                THEN COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)
                ELSE 0
              END
            ), 0), 2) AS income,
            ROUND(COALESCE(SUM(
              CASE WHEN t.account_category = 'Expense' AND t.name = 'Cost of Goods Sold'
                THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
                ELSE 0
              END
            ), 0), 2) AS cogs,
            ROUND(COALESCE(SUM(
              CASE WHEN t.account_category = 'Expense' AND t.name <> 'Cost of Goods Sold'
                THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
                ELSE 0
              END
            ), 0), 2) AS operating_expenses
          FROM public.journal_entries je
          JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
          JOIN public.accounts a ON a.id = jel.account_id
          JOIN public.account_types t ON t.id = a.account_type_id
          WHERE je.status = 'posted'
            AND je.store_id = p_store_id
            AND je.transaction_date BETWEEN p_date_from AND p_date_to
          GROUP BY je.transaction_date
        ) x
      ),
      '[]'::jsonb
    );
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'period_key', x.period_key,
          'income', x.income,
          'cogs', x.cogs,
          'expenses', x.operating_expenses,
          'net_profit', ROUND(x.income - x.cogs - x.operating_expenses, 2)
        )
        ORDER BY x.period_key
      )
      FROM (
        SELECT
          to_char(date_trunc('month', je.transaction_date), 'YYYY-MM') AS period_key,
          ROUND(COALESCE(SUM(
            CASE WHEN t.account_category = 'Income'
              THEN COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)
              ELSE 0
            END
          ), 0), 2) AS income,
          ROUND(COALESCE(SUM(
            CASE WHEN t.account_category = 'Expense' AND t.name = 'Cost of Goods Sold'
              THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
              ELSE 0
            END
          ), 0), 2) AS cogs,
          ROUND(COALESCE(SUM(
            CASE WHEN t.account_category = 'Expense' AND t.name <> 'Cost of Goods Sold'
              THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
              ELSE 0
          END
          ), 0), 2) AS operating_expenses
        FROM public.journal_entries je
        JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
        JOIN public.accounts a ON a.id = jel.account_id
        JOIN public.account_types t ON t.id = a.account_type_id
        WHERE je.status = 'posted'
          AND je.store_id = p_store_id
          AND je.transaction_date BETWEEN p_date_from AND p_date_to
        GROUP BY date_trunc('month', je.transaction_date)
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

-- ─── Sales reports: document date + sales-by-item ex-tax column ─────────────

CREATE OR REPLACE FUNCTION public.get_erp_sales_by_customer(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_channel text DEFAULT 'all'
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.sales_with_tax DESC), '[]'::jsonb)
    FROM (
      SELECT
        u.id AS customer_id,
        u.name AS customer_name,
        i.source AS channel,
        COUNT(DISTINCT i.id) AS invoice_count,
        ROUND(COALESCE(SUM(i.total_amount), 0), 2) AS sales_with_tax,
        ROUND(COALESCE(SUM(i.discount), 0), 2) AS total_discount,
        ROUND(COALESCE(SUM(i.gst_amount), 0), 2) AS tax,
        ROUND(COALESCE(SUM(i.subtotal), 0), 2) AS net_sales_value,
        ROUND(COALESCE(SUM(m.line_cogs), 0), 2) AS purchase_cost,
        ROUND(COALESCE(SUM(m.uncosted_revenue), 0), 2) AS uncosted_revenue,
        ROUND(COALESCE(SUM(m.recognized_profit), 0), 2) AS net_profit,
        ROUND(
          CASE
            WHEN COALESCE(SUM(i.subtotal), 0) - COALESCE(SUM(m.uncosted_revenue), 0) > 0 THEN
              100.0 * COALESCE(SUM(m.recognized_profit), 0)
              / (COALESCE(SUM(i.subtotal), 0) - COALESCE(SUM(m.uncosted_revenue), 0))
            ELSE 0
          END,
          3
        ) AS profit_percent,
        ROUND(COALESCE(SUM(i.balance_due), 0), 2) AS balance_due
      FROM public.invoices i
      JOIN public.users u ON u.id = i.user_id
      LEFT JOIN LATERAL (
        SELECT
          SUM(mc.line_cogs) AS line_cogs,
          SUM(mc.uncosted_revenue) AS uncosted_revenue,
          SUM(mc.recognized_profit) AS recognized_profit
        FROM public.invoice_items ii
        CROSS JOIN LATERAL public.erp_invoice_item_margin_components(
          ii.base_price,
          ii.unit_price,
          ii.variant_id,
          ii.product_id,
          i.store_id,
          ii.quantity,
          ii.pending_cost_qty,
          COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount)
        ) mc
        WHERE ii.invoice_id = i.id
      ) m ON true
      WHERE i.status NOT IN ('cancelled', 'pending')
        AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
        AND (
          p_channel = 'all'
          OR (p_channel = 'erp' AND i.source = 'erp')
          OR (p_channel = 'online' AND i.source <> 'erp')
        )
      GROUP BY u.id, u.name, i.source
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_sales_by_item(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_channel text DEFAULT 'all'
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.net_sales_ex_tax DESC), '[]'::jsonb)
    FROM (
      SELECT
        ii.product_name,
        ii.variant_id,
        i.source AS channel,
        ROUND(COALESCE(SUM(ii.quantity), 0), 2) AS total_qty,
        ROUND(COALESCE(SUM(COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount)), 0), 2) AS net_sales_ex_tax,
        ROUND(COALESCE(SUM(ii.total_amount), 0), 2) AS total_amount,
        ROUND(COALESCE(SUM(ii.gst_amount), 0), 2) AS total_tax,
        ROUND(COALESCE(SUM(mc.line_cogs), 0), 2) AS purchase_cost,
        ROUND(COALESCE(SUM(mc.uncosted_revenue), 0), 2) AS uncosted_revenue,
        ROUND(COALESCE(SUM(mc.recognized_profit), 0), 2) AS profit
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
      CROSS JOIN LATERAL public.erp_invoice_item_margin_components(
        ii.base_price,
        ii.unit_price,
        ii.variant_id,
        ii.product_id,
        i.store_id,
        ii.quantity,
        ii.pending_cost_qty,
        COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount)
      ) mc
      WHERE i.status NOT IN ('cancelled', 'pending')
        AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
        AND (
          p_channel = 'all'
          OR (p_channel = 'erp' AND i.source = 'erp')
          OR (p_channel = 'online' AND i.source <> 'erp')
        )
      GROUP BY ii.product_name, ii.variant_id, i.source
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_sales_by_salesman(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_channel text DEFAULT 'all'
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
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.total_sales DESC), '[]'::jsonb)
    FROM (
      WITH invoice_stats AS (
        SELECT
          i.sales_person_id,
          COUNT(*) AS invoice_count,
          SUM(i.total_amount) AS total_sales,
          SUM(i.subtotal) AS total_sales_without_tax,
          SUM(m.line_cogs) AS purchase_cost,
          SUM(m.uncosted_revenue) AS uncosted_revenue,
          SUM(m.recognized_profit) AS recognized_profit
        FROM public.invoices i
        LEFT JOIN LATERAL (
          SELECT
            SUM(mc.line_cogs) AS line_cogs,
            SUM(mc.uncosted_revenue) AS uncosted_revenue,
            SUM(mc.recognized_profit) AS recognized_profit
          FROM public.invoice_items ii
          CROSS JOIN LATERAL public.erp_invoice_item_margin_components(
            ii.base_price,
            ii.unit_price,
            ii.variant_id,
            ii.product_id,
            i.store_id,
            ii.quantity,
            ii.pending_cost_qty,
            COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount)
          ) mc
          WHERE ii.invoice_id = i.id
        ) m ON true
        WHERE i.status NOT IN ('cancelled', 'pending')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND i.source = 'erp')
            OR (p_channel = 'online' AND i.source <> 'erp')
          )
        GROUP BY i.sales_person_id
      ),
      credit_stats AS (
        SELECT
          i.sales_person_id,
          COUNT(cn.id) AS credit_note_count,
          SUM(cn.total_amount) AS credit_note_total
        FROM public.erp_credit_notes cn
        JOIN public.invoices i ON i.id = cn.source_invoice_id
        WHERE cn.status <> 'cancelled'
          AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR cn.store_id = p_store_id)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND i.source = 'erp')
            OR (p_channel = 'online' AND i.source <> 'erp')
          )
        GROUP BY i.sales_person_id
      ),
      combined AS (
        SELECT sales_person_id FROM invoice_stats
        UNION
        SELECT sales_person_id FROM credit_stats
      )
      SELECT
        COALESCE(sp.id, '00000000-0000-0000-0000-000000000000'::uuid) AS salesman_id,
        COALESCE(sp.name, 'Unassigned') AS salesman_name,
        COALESCE(inv.invoice_count, 0) AS invoice_count,
        ROUND(COALESCE(inv.total_sales, 0), 2) AS total_sales,
        ROUND(COALESCE(inv.total_sales_without_tax, 0), 2) AS total_sales_without_tax,
        COALESCE(cn.credit_note_count, 0) AS credit_note_count,
        ROUND(COALESCE(cn.credit_note_total, 0), 2) AS credit_note_total,
        ROUND(COALESCE(inv.purchase_cost, 0), 2) AS purchase_cost,
        ROUND(COALESCE(inv.uncosted_revenue, 0), 2) AS uncosted_revenue,
        ROUND(
          COALESCE(inv.recognized_profit, 0) - COALESCE(cn.credit_note_total, 0),
          2
        ) AS profit,
        ROUND(
          CASE
            WHEN COALESCE(inv.total_sales_without_tax, 0) - COALESCE(inv.uncosted_revenue, 0) > 0 THEN
              100.0 * (
                COALESCE(inv.recognized_profit, 0) - COALESCE(cn.credit_note_total, 0)
              ) / (COALESCE(inv.total_sales_without_tax, 0) - COALESCE(inv.uncosted_revenue, 0))
            ELSE 0
          END,
          3
        ) AS profit_percent
      FROM combined c
      LEFT JOIN invoice_stats inv ON inv.sales_person_id IS NOT DISTINCT FROM c.sales_person_id
      LEFT JOIN credit_stats cn ON cn.sales_person_id IS NOT DISTINCT FROM c.sales_person_id
      LEFT JOIN public.users sp ON sp.id = c.sales_person_id
    ) r
  );
END;
$$;

-- ─── Dry-run: invoices missing GL COGS vs recognized margin COGS ─────────────

CREATE OR REPLACE FUNCTION public.erp_audit_missing_sale_cogs_gl(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := COALESCE(p_date_from, '1970-01-01'::date);
  v_to date := COALESCE(p_date_to, CURRENT_DATE);
  v_cogs_account uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  v_cogs_account := public.get_account_by_code('COST_OF_GOODS_SOLD');

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT
          i.id AS invoice_id,
          i.invoice_number,
          i.store_id,
          COALESCE(i.issued_at::date, i.created_at::date) AS invoice_date,
          public.erp_invoice_recognized_cogs_total(i.id) AS expected_cogs,
          ROUND(COALESCE((
            SELECT SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
            FROM public.journal_entries je
            JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
            WHERE jel.account_id = v_cogs_account
              AND je.status = 'posted'
              AND (
                (je.source_entity_type = 'invoice' AND je.source_entity_id = i.id)
                OR (
                  je.source_entity_type = 'invoice_deferred_cogs'
                  AND je.source_entity_id IN (
                    SELECT d.id FROM public.erp_invoice_deferred_cogs_postings d WHERE d.invoice_id = i.id
                  )
                )
              )
          ), 0), 2) AS posted_cogs,
          ROUND(
            public.erp_invoice_recognized_cogs_total(i.id)
            - COALESCE((
              SELECT SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
              FROM public.journal_entries je
              JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
              WHERE jel.account_id = v_cogs_account
                AND je.status = 'posted'
                AND (
                  (je.source_entity_type = 'invoice' AND je.source_entity_id = i.id)
                  OR (
                    je.source_entity_type = 'invoice_deferred_cogs'
                    AND je.source_entity_id IN (
                      SELECT d.id FROM public.erp_invoice_deferred_cogs_postings d WHERE d.invoice_id = i.id
                    )
                  )
                )
            ), 0),
            2
          ) AS cogs_gap
        FROM public.invoices i
        WHERE i.status IN ('issued', 'partial', 'paid')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN v_from AND v_to
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
          AND public.erp_invoice_recognized_cogs_total(i.id) > 0.01
        ORDER BY cogs_gap DESC
        LIMIT p_limit
      ) x
      WHERE x.cogs_gap > 0.01
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_invoice_recognized_cogs_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_credit_note_recognized_cogs_total(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_post_invoice_item_deferred_cogs(uuid, numeric, numeric, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_audit_missing_sale_cogs_gl(date, date, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_financial_dashboard(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_allocate_receipt_cost_to_pending_sales(uuid, uuid, numeric, numeric, uuid, date) TO authenticated;

COMMIT;
