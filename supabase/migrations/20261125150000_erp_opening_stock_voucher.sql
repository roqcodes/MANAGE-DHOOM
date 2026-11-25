-- Opening stock voucher: seeds store WAC, logs movement type opening, Dr STOCK / Cr equity.

BEGIN;

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_check CHECK (type IN (
    'receipt', 'sale', 'adjustment', 'transfer', 'damaged', 'return',
    'purchase', 'vendor_credit', 'transfer_out', 'transfer_in', 'opening'
  ));

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES ('opening_stock', 'OS', 1, 0)
ON CONFLICT (document_type) DO NOTHING;

INSERT INTO public.erp_posting_rules (event_type, description, is_enabled, is_winner_exact, mapping_notes)
VALUES (
  'opening_stock',
  'Opening stock finalize',
  true,
  false,
  'DR STOCK (total value at unit cost), CR Owner''s Equity / equity offset. Balance sheet only; not P&L.'
)
ON CONFLICT (event_type) DO UPDATE
SET
  description = EXCLUDED.description,
  is_enabled = EXCLUDED.is_enabled,
  mapping_notes = EXCLUDED.mapping_notes;

CREATE TABLE IF NOT EXISTS public.erp_opening_stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_number text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id),
  opening_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'cancelled')),
  note text,
  total_value numeric NOT NULL DEFAULT 0,
  inventory_committed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_opening_stocks_number_unique UNIQUE (opening_number)
);

CREATE TABLE IF NOT EXISTS public.erp_opening_stock_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id uuid NOT NULL REFERENCES public.erp_opening_stocks (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost > 0),
  line_total numeric NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS erp_opening_stocks_store_date_idx
  ON public.erp_opening_stocks (store_id, opening_date DESC);

CREATE INDEX IF NOT EXISTS erp_opening_stock_lines_opening_idx
  ON public.erp_opening_stock_lines (opening_id);

CREATE INDEX IF NOT EXISTS erp_opening_stock_lines_product_idx
  ON public.erp_opening_stock_lines (product_id);

ALTER TABLE public.erp_opening_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_opening_stock_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_opening_stocks_store_access ON public.erp_opening_stocks;
CREATE POLICY erp_opening_stocks_store_access
  ON public.erp_opening_stocks FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS erp_opening_stock_lines_store_access ON public.erp_opening_stock_lines;
CREATE POLICY erp_opening_stock_lines_store_access
  ON public.erp_opening_stock_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_opening_stocks o
      WHERE o.id = opening_id
        AND public.rls_user_can_access_store(o.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_opening_stocks o
      WHERE o.id = opening_id
        AND public.rls_user_can_access_store(o.store_id)
    )
  );

CREATE OR REPLACE FUNCTION public.post_journal_for_opening_stock(
  p_opening_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_date date;
  v_number text;
  v_total numeric;
  v_equity_account uuid;
  v_lines jsonb := '[]'::jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT public.is_posting_enabled('opening_stock') THEN
    RETURN NULL;
  END IF;

  SELECT o.store_id, o.opening_date, o.opening_number, o.total_value
  INTO v_store_id, v_date, v_number, v_total
  FROM public.erp_opening_stocks o
  WHERE o.id = p_opening_id;

  IF NOT FOUND OR COALESCE(v_total, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_equity_account := COALESCE(
    public.get_account_by_code('OWNERS_EQUITY'),
    public.get_account_by_code('EQUITY'),
    public.get_account_by_code('RETAINED_EARNING')
  );

  IF v_equity_account IS NULL THEN
    RAISE EXCEPTION 'No equity account configured for opening stock journal';
  END IF;

  PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', 'STOCK',
      'debit', ROUND(v_total, 2),
      'description', 'Opening stock ' || v_number
    ),
    jsonb_build_object(
      'account_id', v_equity_account,
      'credit', ROUND(v_total, 2),
      'description', 'Opening stock ' || v_number
    )
  );

  RETURN public.create_posted_journal_entry(
    v_date,
    'Opening stock ' || v_number,
    v_store_id,
    'opening_stock',
    p_opening_id,
    v_lines,
    p_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_erp_opening_stock(
  p_opening_id uuid,
  p_finalized_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_committed boolean;
  v_status text;
  r record;
  v_stock numeric;
  v_existing_opening uuid;
BEGIN
  IF NOT public.is_staff_user(p_finalized_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, inventory_committed, status
  INTO v_store_id, v_committed, v_status
  FROM public.erp_opening_stocks
  WHERE id = p_opening_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opening stock document not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot finalize cancelled opening stock';
  END IF;

  IF v_committed THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_finalized_by);

  FOR r IN
  SELECT l.product_id, l.quantity, l.unit_cost
    FROM public.erp_opening_stock_lines l
    WHERE l.opening_id = p_opening_id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.store_id = v_store_id
        AND sm.product_id = r.product_id
    ) THEN
      RAISE EXCEPTION
        'Cannot record opening stock after inventory transactions exist for product % at this store',
        r.product_id;
    END IF;

    SELECT o.id
    INTO v_existing_opening
    FROM public.erp_opening_stock_lines ol
    JOIN public.erp_opening_stocks o ON o.id = ol.opening_id
    WHERE o.store_id = v_store_id
      AND ol.product_id = r.product_id
      AND o.status = 'finalized'
      AND o.id <> p_opening_id
    LIMIT 1;

    IF v_existing_opening IS NOT NULL THEN
      RAISE EXCEPTION
        'Opening stock already finalized for product % at this store',
        r.product_id;
    END IF;

    SELECT spi.stock
    INTO v_stock
    FROM public.store_product_inventory spi
    WHERE spi.store_id = v_store_id AND spi.product_id = r.product_id;

    IF COALESCE(v_stock, 0) <> 0 THEN
      RAISE EXCEPTION
        'Opening stock requires zero on-hand for product %; use Stock Adjustment for corrections',
        r.product_id;
    END IF;

    PERFORM public.store_product_inventory_apply_receipt_cost(
      v_store_id, r.product_id, r.quantity, r.unit_cost, p_finalized_by
    );

    UPDATE public.store_product_inventory
    SET opening_stock = r.quantity, updated_at = now()
    WHERE store_id = v_store_id AND product_id = r.product_id;

    PERFORM public.log_product_stock_movement(
      r.product_id,
      r.quantity,
      'opening',
      p_opening_id,
      'opening_stock',
      'Opening stock finalized',
      v_store_id,
      NULL,
      r.unit_cost,
      p_finalized_by
    );
  END LOOP;

  UPDATE public.erp_opening_stocks
  SET
    status = 'finalized',
    inventory_committed = true,
    updated_at = now()
  WHERE id = p_opening_id;

  PERFORM public.post_journal_for_opening_stock(p_opening_id, p_finalized_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_opening_stock(
  p_store_id uuid,
  p_opening_date date,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_finalize boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening_id uuid;
  v_opening_number text;
  v_line jsonb;
  v_qty numeric;
  v_cost numeric;
  v_total numeric;
  v_doc_total numeric := 0;
  v_product_id uuid;
  v_seen_products uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line is required';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_opening_id, v_opening_number
  FROM public.erp_next_document_ref('opening_stock') AS t;

  INSERT INTO public.erp_opening_stocks (
    id, opening_number, store_id, opening_date, status, note, created_by
  )
  VALUES (
    v_opening_id,
    v_opening_number,
    p_store_id,
    p_opening_date,
    CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,
    p_note,
    p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_cost := COALESCE((v_line ->> 'unit_cost')::numeric, 0);
    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required for opening stock line';
    END IF;

    IF v_qty <= 0 OR v_cost <= 0 THEN
      RAISE EXCEPTION 'Quantity and unit cost must be positive';
    END IF;

    IF v_product_id = ANY (v_seen_products) THEN
      RAISE EXCEPTION 'Duplicate product on opening stock document';
    END IF;
    v_seen_products := v_seen_products || v_product_id;

    v_total := ROUND(v_qty * v_cost, 2);
    v_doc_total := v_doc_total + v_total;

    INSERT INTO public.erp_opening_stock_lines (
      opening_id, product_id, quantity, unit_cost, line_total
    )
    VALUES (
      v_opening_id, v_product_id, v_qty, v_cost, v_total
    );
  END LOOP;

  UPDATE public.erp_opening_stocks
  SET total_value = v_doc_total, updated_at = now()
  WHERE id = v_opening_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_opening_stock(v_opening_id, p_created_by);
  END IF;

  RETURN v_opening_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_erp_opening_stock(uuid, date, jsonb, text, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_erp_opening_stock(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_for_opening_stock(uuid, uuid) TO authenticated;

COMMIT;