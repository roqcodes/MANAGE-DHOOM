-- Phase 4: Inventory + multi-store transfers.
-- Evolves store_inventory as per-store authority; inventory remains checkout aggregate.

BEGIN;

-- ─── Extend stores ────────────────────────────────────────────────────────────

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS store_type text,
  ADD COLUMN IF NOT EXISTS markup_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS trn text,
  ADD COLUMN IF NOT EXISTS tax_template text;

-- ─── Extend stock_movements (numeric qty + store context) ───────────────────

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_check CHECK (type IN (
    'receipt', 'sale', 'adjustment', 'transfer', 'damaged', 'return',
    'purchase', 'vendor_credit', 'transfer_out', 'transfer_in'
  ));

ALTER TABLE public.stock_movements
  ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores (id),
  ADD COLUMN IF NOT EXISTS transfer_store_id uuid REFERENCES public.stores (id),
  ADD COLUMN IF NOT EXISTS transaction_price numeric,
  ADD COLUMN IF NOT EXISTS balance_after numeric;

CREATE INDEX IF NOT EXISTS stock_movements_store_id_idx
  ON public.stock_movements (store_id);

-- ─── Document sequences ─────────────────────────────────────────────────────

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES
  ('transfer_request', 'STR', 1, 0),
  ('transfer_payment', 'STP', 1, 0)
ON CONFLICT (document_type) DO NOTHING;

-- ─── Stock adjustments ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_number text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id),
  adjustment_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'cancelled')),
  note text,
  total_add_cost numeric NOT NULL DEFAULT 0,
  total_remove_cost numeric NOT NULL DEFAULT 0,
  inventory_committed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_stock_adjustments_number_unique UNIQUE (adjustment_number)
);

CREATE TABLE IF NOT EXISTS public.erp_stock_adjustment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id uuid NOT NULL REFERENCES public.erp_stock_adjustments (id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants (id),
  direction text NOT NULL CHECK (direction IN ('add', 'remove')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  purchase_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);

-- ─── Transfer requests (no stock mutation) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL,
  from_store_id uuid NOT NULL REFERENCES public.stores (id),
  to_store_id uuid NOT NULL REFERENCES public.stores (id),
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'linked', 'cancelled')),
  note text,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_transfer_requests_number_unique UNIQUE (request_number),
  CONSTRAINT erp_transfer_requests_stores_distinct CHECK (from_store_id <> to_store_id)
);

CREATE TABLE IF NOT EXISTS public.erp_transfer_request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.erp_transfer_requests (id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants (id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  source_available numeric NOT NULL DEFAULT 0,
  transfer_price numeric NOT NULL DEFAULT 0,
  sales_price numeric NOT NULL DEFAULT 0,
  average_purchase_cost numeric NOT NULL DEFAULT 0,
  note text
);

-- ─── Store transfers ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_store_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL,
  from_store_id uuid NOT NULL REFERENCES public.stores (id),
  to_store_id uuid NOT NULL REFERENCES public.stores (id),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'in_transit', 'completed', 'cancelled')),
  request_id uuid REFERENCES public.erp_transfer_requests (id),
  note text,
  inventory_committed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_store_transfers_number_unique UNIQUE (transfer_number),
  CONSTRAINT erp_store_transfers_stores_distinct CHECK (from_store_id <> to_store_id)
);

CREATE TABLE IF NOT EXISTS public.erp_store_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.erp_store_transfers (id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants (id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  purchase_price numeric NOT NULL DEFAULT 0,
  sales_price numeric NOT NULL DEFAULT 0,
  markup_percent numeric(5,2) NOT NULL DEFAULT 0,
  markup_type text,
  markup_amount numeric NOT NULL DEFAULT 0,
  transfer_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);

-- ─── Transfer payments (financial only — no stock) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_transfer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL,
  transfer_id uuid NOT NULL REFERENCES public.erp_store_transfers (id),
  from_store_id uuid NOT NULL REFERENCES public.stores (id),
  to_store_id uuid NOT NULL REFERENCES public.stores (id),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode text NOT NULL,
  account_id uuid REFERENCES public.accounts (id),
  amount numeric NOT NULL CHECK (amount > 0),
  reference text,
  notes text,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_transfer_payments_number_unique UNIQUE (payment_number)
);

-- ─── Access helpers ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_has_store_access(
  p_user_id uuid,
  p_store_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_staff_user(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_store_access usa
      WHERE usa.user_id = p_user_id
        AND usa.store_id = p_store_id
    );
$$;

CREATE OR REPLACE FUNCTION public.require_store_access(
  p_store_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.user_has_store_access(p_user_id, p_store_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to store';
  END IF;
END;
$$;

-- ─── Store + central inventory mutation ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.store_inventory_apply_delta(
  p_store_id uuid,
  p_variant_id uuid,
  p_delta numeric,
  p_update_central boolean DEFAULT true,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_stock numeric;
  v_new_store numeric;
  v_central numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  SELECT stock INTO v_store_stock
  FROM public.store_inventory
  WHERE store_id = p_store_id AND variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_delta < 0 THEN
      RAISE EXCEPTION 'No store inventory for variant % at store %', p_variant_id, p_store_id;
    END IF;

    INSERT INTO public.store_inventory (store_id, variant_id, stock, updated_at)
    VALUES (p_store_id, p_variant_id, p_delta, now());
    v_new_store := p_delta;
  ELSE
    v_new_store := GREATEST(0, COALESCE(v_store_stock, 0) + p_delta);
    UPDATE public.store_inventory
    SET stock = v_new_store, updated_at = now()
    WHERE store_id = p_store_id AND variant_id = p_variant_id;
  END IF;

  IF p_update_central THEN
    SELECT stock INTO v_central
    FROM public.inventory
    WHERE variant_id = p_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      IF p_delta < 0 THEN
        RAISE EXCEPTION 'No central inventory for variant %', p_variant_id;
      END IF;
      INSERT INTO public.inventory (variant_id, stock, updated_at)
      VALUES (p_variant_id, GREATEST(0, p_delta), now());
    ELSE
      UPDATE public.inventory
      SET stock = GREATEST(0, COALESCE(v_central, 0) + p_delta), updated_at = now()
      WHERE variant_id = p_variant_id;
    END IF;
  END IF;

  RETURN v_new_store;
END;
$$;

-- Replace log_stock_movement with numeric + store context (drop old signature)
DROP FUNCTION IF EXISTS public.log_stock_movement(uuid, integer, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.log_stock_movement(
  p_variant_id uuid,
  p_quantity numeric,
  p_type text,
  p_reference_id uuid DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_transfer_store_id uuid DEFAULT NULL,
  p_transaction_price numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
  v_user_id uuid;
  v_balance numeric;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_store_id IS NOT NULL THEN
    SELECT stock INTO v_balance
    FROM public.store_inventory
    WHERE store_id = p_store_id AND variant_id = p_variant_id;
  END IF;

  INSERT INTO public.stock_movements (
    variant_id, quantity, type, reference_id, reference_type, reason, user_id,
    store_id, transfer_store_id, transaction_price, balance_after
  )
  VALUES (
    p_variant_id, p_quantity, p_type, p_reference_id, p_reference_type, p_reason, v_user_id,
    p_store_id, p_transfer_store_id, p_transaction_price, v_balance
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

-- ─── Stock adjustment RPCs ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_stock_adjustment(
  p_store_id uuid,
  p_adjustment_date date,
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
  v_adj_id uuid;
  v_adj_number text;
  v_line jsonb;
  v_qty numeric;
  v_cost numeric;
  v_total numeric;
  v_add_cost numeric := 0;
  v_remove_cost numeric := 0;
  v_direction text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line is required';
  END IF;

  v_adj_number := public.next_erp_document_number('stock_adjustment');

  INSERT INTO public.erp_stock_adjustments (
    adjustment_number, store_id, adjustment_date, status, note, created_by
  )
  VALUES (
    v_adj_number, p_store_id, p_adjustment_date,
    CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,
    p_note, p_created_by
  )
  RETURNING id INTO v_adj_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_direction := v_line ->> 'direction';
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_cost := COALESCE((v_line ->> 'purchase_cost')::numeric, 0);
    v_total := ROUND(v_qty * v_cost, 2);

    IF v_qty <= 0 OR v_direction NOT IN ('add', 'remove') THEN
      RAISE EXCEPTION 'Invalid adjustment line';
    END IF;

    INSERT INTO public.erp_stock_adjustment_lines (
      adjustment_id, variant_id, direction, quantity, purchase_cost, line_total
    )
    VALUES (
      v_adj_id,
      (v_line ->> 'variant_id')::uuid,
      v_direction,
      v_qty,
      v_cost,
      v_total
    );

    IF v_direction = 'add' THEN
      v_add_cost := v_add_cost + v_total;
    ELSE
      v_remove_cost := v_remove_cost + v_total;
    END IF;
  END LOOP;

  UPDATE public.erp_stock_adjustments
  SET total_add_cost = v_add_cost, total_remove_cost = v_remove_cost, updated_at = now()
  WHERE id = v_adj_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_stock_adjustment(v_adj_id, p_created_by);
  END IF;

  RETURN v_adj_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_erp_stock_adjustment(
  p_adjustment_id uuid,
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
  v_delta numeric;
BEGIN
  IF NOT public.is_staff_user(p_finalized_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, inventory_committed, status
  INTO v_store_id, v_committed, v_status
  FROM public.erp_stock_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot finalize cancelled adjustment';
  END IF;

  IF v_committed THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id, p_finalized_by);

  FOR r IN
    SELECT variant_id, direction, quantity, purchase_cost
    FROM public.erp_stock_adjustment_lines
    WHERE adjustment_id = p_adjustment_id
  LOOP
    v_delta := CASE WHEN r.direction = 'add' THEN r.quantity ELSE -r.quantity END;

    PERFORM public.store_inventory_apply_delta(
      v_store_id, r.variant_id, v_delta, true, p_finalized_by
    );

    PERFORM public.log_stock_movement(
      r.variant_id,
      v_delta,
      CASE WHEN r.direction = 'add' THEN 'adjustment' ELSE 'damaged' END,
      p_adjustment_id,
      'stock_adjustment',
      'Stock adjustment finalized',
      v_store_id,
      NULL,
      r.purchase_cost
    );
  END LOOP;

  UPDATE public.erp_stock_adjustments
  SET status = 'finalized', inventory_committed = true, updated_at = now()
  WHERE id = p_adjustment_id;
END;
$$;

-- ─── Transfer request RPCs (no stock) ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_transfer_request(
  p_from_store_id uuid,
  p_to_store_id uuid,
  p_request_date date,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_submit boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req_id uuid;
  v_req_number text;
  v_line jsonb;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_from_store_id = p_to_store_id THEN
    RAISE EXCEPTION 'From and to store must differ';
  END IF;

  PERFORM public.require_store_access(p_from_store_id, p_created_by);
  PERFORM public.require_store_access(p_to_store_id, p_created_by);

  v_req_number := public.next_erp_document_number('transfer_request');

  INSERT INTO public.erp_transfer_requests (
    request_number, from_store_id, to_store_id, request_date, status, note, created_by
  )
  VALUES (
    v_req_number, p_from_store_id, p_to_store_id, p_request_date,
    CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END,
    p_note, p_created_by
  )
  RETURNING id INTO v_req_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO public.erp_transfer_request_lines (
      request_id, variant_id, quantity, source_available, transfer_price,
      sales_price, average_purchase_cost, note
    )
    VALUES (
      v_req_id,
      (v_line ->> 'variant_id')::uuid,
      COALESCE((v_line ->> 'quantity')::numeric, 0),
      COALESCE((v_line ->> 'source_available')::numeric, 0),
      COALESCE((v_line ->> 'transfer_price')::numeric, 0),
      COALESCE((v_line ->> 'sales_price')::numeric, 0),
      COALESCE((v_line ->> 'average_purchase_cost')::numeric, 0),
      v_line ->> 'note'
    );
  END LOOP;

  RETURN v_req_id;
END;
$$;

-- ─── Store transfer RPCs ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_erp_store_transfer(
  p_from_store_id uuid,
  p_to_store_id uuid,
  p_transfer_date date,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_transfer_number text;
  v_line jsonb;
  v_qty numeric;
  v_transfer_price numeric;
  v_line_total numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_from_store_id = p_to_store_id THEN
    RAISE EXCEPTION 'From and to store must differ';
  END IF;

  PERFORM public.require_store_access(p_from_store_id, p_created_by);
  PERFORM public.require_store_access(p_to_store_id, p_created_by);

  v_transfer_number := public.next_erp_document_number('stock_transfer');

  INSERT INTO public.erp_store_transfers (
    transfer_number, from_store_id, to_store_id, transfer_date,
    status, request_id, note, created_by
  )
  VALUES (
    v_transfer_number, p_from_store_id, p_to_store_id, p_transfer_date,
    'draft', p_request_id, p_note, p_created_by
  )
  RETURNING id INTO v_transfer_id;

  IF p_request_id IS NOT NULL THEN
    UPDATE public.erp_transfer_requests
    SET status = 'linked', updated_at = now()
    WHERE id = p_request_id AND status IN ('draft', 'submitted');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_transfer_price := COALESCE((v_line ->> 'transfer_price')::numeric, 0);
    v_line_total := ROUND(v_qty * v_transfer_price, 2);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    INSERT INTO public.erp_store_transfer_lines (
      transfer_id, variant_id, quantity, purchase_price, sales_price,
      markup_percent, markup_type, markup_amount, transfer_price, line_total
    )
    VALUES (
      v_transfer_id,
      (v_line ->> 'variant_id')::uuid,
      v_qty,
      COALESCE((v_line ->> 'purchase_price')::numeric, 0),
      COALESCE((v_line ->> 'sales_price')::numeric, 0),
      COALESCE((v_line ->> 'markup_percent')::numeric, 0),
      v_line ->> 'markup_type',
      COALESCE((v_line ->> 'markup_amount')::numeric, 0),
      v_transfer_price,
      v_line_total
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_erp_store_transfer(
  p_transfer_id uuid,
  p_approved_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_from uuid;
  v_to uuid;
BEGIN
  IF NOT public.is_staff_user(p_approved_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, from_store_id, to_store_id
  INTO v_status, v_from, v_to
  FROM public.erp_store_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF v_status NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Transfer cannot be approved in status %', v_status;
  END IF;

  PERFORM public.require_store_access(v_from, p_approved_by);
  PERFORM public.require_store_access(v_to, p_approved_by);

  IF v_status = 'approved' THEN
    RETURN;
  END IF;

  UPDATE public.erp_store_transfers
  SET status = 'approved', updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_erp_store_transfer(
  p_transfer_id uuid,
  p_completed_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid;
  v_to uuid;
  v_committed boolean;
  v_status text;
  r record;
BEGIN
  IF NOT public.is_staff_user(p_completed_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT from_store_id, to_store_id, inventory_committed, status
  INTO v_from, v_to, v_committed, v_status
  FROM public.erp_store_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot complete cancelled transfer';
  END IF;

  IF v_committed THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_from, p_completed_by);
  PERFORM public.require_store_access(v_to, p_completed_by);

  IF v_status = 'draft' THEN
    UPDATE public.erp_store_transfers SET status = 'approved' WHERE id = p_transfer_id;
  END IF;

  FOR r IN
    SELECT variant_id, quantity, transfer_price
    FROM public.erp_store_transfer_lines
    WHERE transfer_id = p_transfer_id
  LOOP
    PERFORM public.store_inventory_apply_delta(v_from, r.variant_id, -r.quantity, false, p_completed_by);
    PERFORM public.store_inventory_apply_delta(v_to, r.variant_id, r.quantity, false, p_completed_by);

    PERFORM public.log_stock_movement(
      r.variant_id, -r.quantity, 'transfer_out', p_transfer_id, 'store_transfer',
      'Store transfer out', v_from, v_to, r.transfer_price
    );
    PERFORM public.log_stock_movement(
      r.variant_id, r.quantity, 'transfer_in', p_transfer_id, 'store_transfer',
      'Store transfer in', v_to, v_from, r.transfer_price
    );
  END LOOP;

  UPDATE public.erp_store_transfers
  SET status = 'completed', inventory_committed = true, updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── Transfer payment (financial only) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_erp_transfer_payment(
  p_transfer_id uuid,
  p_payment_date date,
  p_payment_mode text,
  p_amount numeric,
  p_account_id uuid DEFAULT NULL,
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
  v_payment_id uuid;
  v_payment_number text;
  v_from uuid;
  v_to uuid;
  v_status text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT from_store_id, to_store_id, status
  INTO v_from, v_to, v_status
  FROM public.erp_store_transfers
  WHERE id = p_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF v_status NOT IN ('approved', 'in_transit', 'completed') THEN
    RAISE EXCEPTION 'Transfer not eligible for payment';
  END IF;

  PERFORM public.require_store_access(v_from, p_created_by);
  PERFORM public.require_store_access(v_to, p_created_by);

  v_payment_number := public.next_erp_document_number('transfer_payment');

  INSERT INTO public.erp_transfer_payments (
    payment_number, transfer_id, from_store_id, to_store_id,
    payment_date, payment_mode, account_id, amount, reference, notes, created_by
  )
  VALUES (
    v_payment_number, p_transfer_id, v_from, v_to,
    p_payment_date, p_payment_mode, p_account_id, p_amount, p_reference, p_notes, p_created_by
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;

-- ─── Transfer statement helper ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_transfer_statement(
  p_from_store_id uuid,
  p_to_store_id uuid DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_from_store_id);

  SELECT COALESCE(jsonb_agg(row ORDER BY row ->> 'date'), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'date', t.transfer_date,
      'type', 'transfer',
      'reference', t.transfer_number,
      'stock_out', COALESCE((SELECT SUM(l.quantity) FROM erp_store_transfer_lines l WHERE l.transfer_id = t.id), 0),
      'stock_in', 0,
      'amount', COALESCE((SELECT SUM(l.line_total) FROM erp_store_transfer_lines l WHERE l.transfer_id = t.id), 0),
      'payments', COALESCE((SELECT SUM(p.amount) FROM erp_transfer_payments p WHERE p.transfer_id = t.id), 0)
    ) AS row
    FROM public.erp_store_transfers t
    WHERE t.from_store_id = p_from_store_id
      AND (p_to_store_id IS NULL OR t.to_store_id = p_to_store_id)
      AND t.status = 'completed'
      AND (p_from_date IS NULL OR t.transfer_date >= p_from_date)
      AND (p_to_date IS NULL OR t.transfer_date <= p_to_date)
    UNION ALL
    SELECT jsonb_build_object(
      'date', t.transfer_date,
      'type', 'transfer_in',
      'reference', t.transfer_number,
      'stock_out', 0,
      'stock_in', COALESCE((SELECT SUM(l.quantity) FROM erp_store_transfer_lines l WHERE l.transfer_id = t.id), 0),
      'amount', COALESCE((SELECT SUM(l.line_total) FROM erp_store_transfer_lines l WHERE l.transfer_id = t.id), 0),
      'payments', 0
    ) AS row
    FROM public.erp_store_transfers t
    WHERE t.to_store_id = p_from_store_id
      AND (p_to_store_id IS NULL OR t.from_store_id = p_to_store_id)
      AND t.status = 'completed'
      AND (p_from_date IS NULL OR t.transfer_date >= p_from_date)
      AND (p_to_date IS NULL OR t.transfer_date <= p_to_date)
  ) sub;

  RETURN v_result;
END;
$$;

-- ─── Update purchase bill stock to also affect store_inventory ──────────────

CREATE OR REPLACE FUNCTION public.inventory_apply_purchase_bill_stock(
  p_bill_id uuid,
  p_multiplier integer DEFAULT 1
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
BEGIN
  IF p_bill_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill id is required';
  END IF;

  IF p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid stock multiplier';
  END IF;

  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id INTO v_store_id
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill store not found';
  END IF;

  FOR r IN
    SELECT pbl.variant_id, SUM(pbl.quantity)::numeric AS qty
    FROM public.erp_purchase_bill_lines pbl
    WHERE pbl.purchase_bill_id = p_bill_id AND pbl.variant_id IS NOT NULL
    GROUP BY pbl.variant_id
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    PERFORM public.store_inventory_apply_delta(v_store_id, r.variant_id, v_delta, true);

    PERFORM public.log_stock_movement(
      r.variant_id, v_delta, 'purchase', p_bill_id, 'purchase_bill',
      'Purchase Bill Receipt', v_store_id, NULL, NULL
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_apply_vendor_credit_stock(
  p_credit_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_store_id uuid;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id INTO v_store_id
  FROM public.erp_vendor_credits
  WHERE id = p_credit_id;

  FOR r IN
    SELECT variant_id, SUM(quantity)::numeric AS qty
    FROM public.erp_vendor_credit_lines
    WHERE vendor_credit_id = p_credit_id AND variant_id IS NOT NULL
    GROUP BY variant_id
  LOOP
    PERFORM public.store_inventory_apply_delta(v_store_id, r.variant_id, -r.qty, true);

    PERFORM public.log_stock_movement(
      r.variant_id, -r.qty, 'vendor_credit', p_credit_id, 'vendor_credit',
      'Vendor Credit', v_store_id, NULL, NULL
    );
  END LOOP;
END;
$$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.erp_stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_stock_adjustment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_transfer_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_store_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_store_transfer_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_transfer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_stock_adjustments_staff"
  ON public.erp_stock_adjustments FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_stock_adjustment_lines_staff"
  ON public.erp_stock_adjustment_lines FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_transfer_requests_staff"
  ON public.erp_transfer_requests FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_transfer_request_lines_staff"
  ON public.erp_transfer_request_lines FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_store_transfers_staff"
  ON public.erp_store_transfers FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_store_transfer_lines_staff"
  ON public.erp_store_transfer_lines FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_transfer_payments_staff"
  ON public.erp_transfer_payments FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

GRANT EXECUTE ON FUNCTION public.user_has_store_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.require_store_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_inventory_apply_delta(uuid, uuid, numeric, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_stock_movement(uuid, numeric, text, uuid, text, text, uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_stock_adjustment(uuid, date, jsonb, text, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_erp_stock_adjustment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_transfer_request(uuid, uuid, date, jsonb, text, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_store_transfer(uuid, uuid, date, jsonb, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_erp_store_transfer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_erp_store_transfer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_transfer_payment(uuid, date, text, numeric, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transfer_statement(uuid, uuid, date, date) TO authenticated;

COMMIT;
