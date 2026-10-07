-- Phase 3: Purchases — vendors, POs, purchase bills, supplier payments,
-- vendor credits, expenses, landed cost master. Extends existing procurement.

BEGIN;

-- ─── Extend vendors ─────────────────────────────────────────────────────────

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS vendor_type text,
  ADD COLUMN IF NOT EXISTS trn text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS fax text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS po_box text,
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ─── Extend purchase orders ─────────────────────────────────────────────────

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS po_number text,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores (id),
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS po_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_po_number_unique
  ON public.purchase_orders (po_number)
  WHERE po_number IS NOT NULL;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;

-- ─── Landed cost item master ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_landed_cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  rate numeric NOT NULL DEFAULT 0,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Purchase bills ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_purchase_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_number text NOT NULL,
  vendor_bill_number text,
  vendor_id uuid NOT NULL REFERENCES public.vendors (id),
  po_id uuid REFERENCES public.purchase_orders (id),
  store_id uuid NOT NULL REFERENCES public.stores (id),
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  grn_reference text,
  batch_reference text,
  batch_code text,
  batch_number text,
  reference text,
  sales_person_id uuid REFERENCES public.users (id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'partial', 'paid', 'cancelled')),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  landed_cost_total numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  credits_applied numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  notes text,
  inventory_committed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_purchase_bills_number_unique UNIQUE (purchase_bill_number)
);

CREATE TABLE IF NOT EXISTS public.erp_purchase_bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_id uuid NOT NULL REFERENCES public.erp_purchase_bills (id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants (id),
  product_name text NOT NULL,
  barcode text,
  expiry_date date,
  quantity numeric NOT NULL DEFAULT 1,
  purchase_price numeric NOT NULL DEFAULT 0,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  unit_id uuid REFERENCES public.item_units (id)
);

CREATE TABLE IF NOT EXISTS public.erp_purchase_bill_landed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_id uuid NOT NULL REFERENCES public.erp_purchase_bills (id) ON DELETE CASCADE,
  landed_cost_item_id uuid REFERENCES public.erp_landed_cost_items (id),
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  rate numeric NOT NULL DEFAULT 0,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS erp_purchase_bills_vendor_id_idx
  ON public.erp_purchase_bills (vendor_id);
CREATE INDEX IF NOT EXISTS erp_purchase_bills_store_id_idx
  ON public.erp_purchase_bills (store_id);
CREATE INDEX IF NOT EXISTS erp_purchase_bills_po_id_idx
  ON public.erp_purchase_bills (po_id);

-- ─── Expenses ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  account_id uuid NOT NULL REFERENCES public.accounts (id),
  amount numeric NOT NULL DEFAULT 0,
  tax_mode text NOT NULL DEFAULT 'none'
    CHECK (tax_mode IN ('none', 'exclusive', 'inclusive')),
  tax_percent numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_through_account_id uuid REFERENCES public.accounts (id),
  vendor_id uuid REFERENCES public.vendors (id),
  user_id uuid REFERENCES public.users (id),
  reference text,
  notes text,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_expenses_number_unique UNIQUE (expense_number)
);

-- ─── Supplier payments ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors (id),
  store_id uuid NOT NULL REFERENCES public.stores (id),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode text NOT NULL,
  account_id uuid REFERENCES public.accounts (id),
  total_amount numeric NOT NULL DEFAULT 0,
  reference text,
  notes text,
  is_bulk boolean NOT NULL DEFAULT false,
  unallocated_amount numeric NOT NULL DEFAULT 0,
  bills_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_supplier_payments_number_unique UNIQUE (payment_number)
);

CREATE TABLE IF NOT EXISTS public.erp_supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.erp_supplier_payments (id) ON DELETE CASCADE,
  purchase_bill_id uuid NOT NULL REFERENCES public.erp_purchase_bills (id),
  amount numeric NOT NULL,
  CONSTRAINT erp_supplier_payment_allocations_amount_positive CHECK (amount > 0),
  CONSTRAINT erp_supplier_payment_allocations_unique UNIQUE (payment_id, purchase_bill_id)
);

CREATE INDEX IF NOT EXISTS erp_supplier_payment_allocations_bill_idx
  ON public.erp_supplier_payment_allocations (purchase_bill_id);

-- ─── Vendor credits ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_vendor_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_number text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors (id),
  store_id uuid NOT NULL REFERENCES public.stores (id),
  reference text,
  credit_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'applied', 'cancelled')),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  balance_remaining numeric NOT NULL DEFAULT 0,
  notes text,
  inventory_committed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_vendor_credits_number_unique UNIQUE (credit_number)
);

CREATE TABLE IF NOT EXISTS public.erp_vendor_credit_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_credit_id uuid NOT NULL REFERENCES public.erp_vendor_credits (id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants (id),
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.erp_vendor_credit_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_credit_id uuid NOT NULL REFERENCES public.erp_vendor_credits (id) ON DELETE CASCADE,
  purchase_bill_id uuid NOT NULL REFERENCES public.erp_purchase_bills (id),
  amount numeric NOT NULL,
  CONSTRAINT erp_vendor_credit_applications_amount_positive CHECK (amount > 0),
  CONSTRAINT erp_vendor_credit_applications_unique UNIQUE (vendor_credit_id, purchase_bill_id)
);

-- ─── Document sequence for bulk supplier payments ───────────────────────────

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES ('payment_made_bulk', 'SPM', 1, 0)
ON CONFLICT (document_type) DO NOTHING;

-- ─── Helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalculate_purchase_bill_balance(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_paid numeric;
  v_credits numeric;
  v_balance numeric;
  v_status text;
  v_current_status text;
BEGIN
  SELECT total_amount, status
  INTO v_total, v_current_status
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  IF v_current_status = 'cancelled' OR v_current_status = 'draft' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid
  FROM public.erp_supplier_payment_allocations
  WHERE purchase_bill_id = p_bill_id;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_credits
  FROM public.erp_vendor_credit_applications
  WHERE purchase_bill_id = p_bill_id;

  v_balance := GREATEST(0, COALESCE(v_total, 0) - v_paid - v_credits);

  IF v_balance <= 0 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 OR v_credits > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'finalized';
  END IF;

  UPDATE public.erp_purchase_bills
  SET
    amount_paid = v_paid,
    credits_applied = v_credits,
    balance_due = v_balance,
    status = v_status,
    updated_at = now()
  WHERE id = p_bill_id;
END;
$$;

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
  v_stock numeric;
  v_new numeric;
  v_delta numeric;
  v_qty_int integer;
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

  FOR r IN
    SELECT
      pbl.variant_id,
      SUM(pbl.quantity)::numeric AS qty
    FROM public.erp_purchase_bill_lines pbl
    WHERE pbl.purchase_bill_id = p_bill_id
      AND pbl.variant_id IS NOT NULL
    GROUP BY pbl.variant_id
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;
    v_qty_int := ROUND(v_delta)::integer;

    SELECT stock INTO v_stock
    FROM public.inventory
    WHERE variant_id = r.variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      IF v_delta < 0 THEN
        RAISE EXCEPTION 'No inventory row for variant %', r.variant_id;
      END IF;

      INSERT INTO public.inventory (variant_id, stock, updated_at)
      VALUES (r.variant_id, v_delta, now());

      IF v_qty_int <> 0 THEN
        PERFORM public.log_stock_movement(
          r.variant_id, v_qty_int, 'purchase', p_bill_id, 'purchase_bill', 'Purchase Bill Receipt'
        );
      END IF;
      CONTINUE;
    END IF;

    v_new := GREATEST(0, COALESCE(v_stock, 0) + v_delta);

    UPDATE public.inventory
    SET stock = v_new, updated_at = now()
    WHERE variant_id = r.variant_id;

    IF v_qty_int <> 0 THEN
      PERFORM public.log_stock_movement(
        r.variant_id, v_qty_int, 'purchase', p_bill_id, 'purchase_bill', 'Purchase Bill Receipt'
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_purchase_order(
  p_vendor_id uuid,
  p_store_id uuid,
  p_po_date date,
  p_expected_delivery_date date DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_discount numeric DEFAULT 0,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id uuid;
  v_po_number text;
  v_line jsonb;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_vendor_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Vendor and store are required';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_po_number := public.next_erp_document_number('purchase_order');

  INSERT INTO public.purchase_orders (
    vendor_id, store_id, po_number, status, po_date, expected_delivery_date,
    reference, notes, subtotal, tax_total, discount, total_amount
  )
  VALUES (
    p_vendor_id, p_store_id, v_po_number, 'pending', p_po_date,
    p_expected_delivery_date, p_reference, p_notes, 0, 0,
    COALESCE(p_discount, 0), 0
  )
  RETURNING id INTO v_po_id;

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

    INSERT INTO public.purchase_order_items (
      po_id, variant_id, quantity, price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_po_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_qty,
      v_price,
      v_tax_rate,
      v_line_tax,
      v_line_total
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

  UPDATE public.purchase_orders
  SET subtotal = v_subtotal, tax_total = v_tax, total_amount = v_total, updated_at = now()
  WHERE id = v_po_id;

  RETURN v_po_id;
END;
$$;

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
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_vendor_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Vendor and store are required';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_bill_number := public.next_erp_document_number('purchase_bill');

  IF p_batch_reference IS NULL OR p_batch_reference = '' THEN
    v_batch_code := format('%s_%s', p_store_id::text, to_char(now(), 'YYYYMMDDHH24MISS'));
    v_batch_number := substr(to_char(floor(random() * 100000)::integer, 'FM99999'), 1, 10);
  ELSE
    v_batch_code := p_batch_reference;
    v_batch_number := p_batch_reference;
  END IF;

  INSERT INTO public.erp_purchase_bills (
    purchase_bill_number, vendor_bill_number, vendor_id, po_id, store_id,
    purchase_date, due_date, grn_reference, batch_reference, batch_code, batch_number,
    reference, sales_person_id, status, notes, created_by
  )
  VALUES (
    v_bill_number, p_vendor_bill_number, p_vendor_id, p_po_id, p_store_id,
    p_purchase_date, p_due_date, p_grn_reference, p_batch_reference,
    v_batch_code, v_batch_number, p_reference, p_sales_person_id,
    'draft', p_notes, p_created_by
  )
  RETURNING id INTO v_bill_id;

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
      quantity, purchase_price, tax_rate_percent, tax_amount, line_total,
      unit_id
    )
    VALUES (
      v_bill_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_line ->> 'barcode',
      NULLIF(v_line ->> 'expiry_date', '')::date,
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
    balance_due = CASE WHEN p_finalize THEN v_total ELSE 0 END,
    status = CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,
    updated_at = now()
  WHERE id = v_bill_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, p_created_by);
  END IF;

  RETURN v_bill_id;
END;
$$;

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
  v_committed boolean;
  v_total numeric;
BEGIN
  IF NOT public.is_staff_user(p_finalized_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT status, inventory_committed, total_amount
  INTO v_status, v_committed, v_total
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot finalize cancelled bill';
  END IF;

  IF v_status <> 'draft' AND v_committed THEN
  -- already finalized — idempotent
    RETURN;
  END IF;

  IF NOT v_committed THEN
    PERFORM public.inventory_apply_purchase_bill_stock(p_bill_id, 1);
    UPDATE public.erp_purchase_bills
    SET inventory_committed = true
    WHERE id = p_bill_id;
  END IF;

  UPDATE public.erp_purchase_bills
  SET
    status = 'finalized',
    balance_due = v_total,
    updated_at = now()
  WHERE id = p_bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_erp_supplier_payment(
  p_vendor_id uuid,
  p_store_id uuid,
  p_payment_date date,
  p_payment_mode text,
  p_total_amount numeric,
  p_account_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_bulk boolean DEFAULT false,
  p_allocations jsonb DEFAULT '[]'::jsonb,
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
  v_alloc_total numeric := 0;
  v_row jsonb;
  v_bill_vendor uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  IF p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Vendor is required';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_alloc_total := v_alloc_total + COALESCE((v_row ->> 'amount')::numeric, 0);
  END LOOP;

  IF v_alloc_total > p_total_amount THEN
    RAISE EXCEPTION 'Allocation total exceeds payment amount';
  END IF;

  v_payment_number := public.next_erp_document_number(
    CASE WHEN p_is_bulk THEN 'payment_made_bulk' ELSE 'payment_made' END
  );

  INSERT INTO public.erp_supplier_payments (
    payment_number, vendor_id, store_id, payment_date, payment_mode,
    account_id, total_amount, reference, notes, is_bulk,
    unallocated_amount, bills_count, created_by
  )
  VALUES (
    v_payment_number, p_vendor_id, p_store_id, p_payment_date, p_payment_mode,
    p_account_id, p_total_amount, p_reference, p_notes, p_is_bulk,
    p_total_amount - v_alloc_total,
    jsonb_array_length(p_allocations),
    p_created_by
  )
  RETURNING id INTO v_payment_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    SELECT vendor_id INTO v_bill_vendor
    FROM public.erp_purchase_bills
    WHERE id = (v_row ->> 'purchase_bill_id')::uuid
      AND status IN ('finalized', 'partial', 'paid');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase bill not found or not payable';
    END IF;

    IF v_bill_vendor <> p_vendor_id THEN
      RAISE EXCEPTION 'Purchase bill does not belong to vendor';
    END IF;

    INSERT INTO public.erp_supplier_payment_allocations (payment_id, purchase_bill_id, amount)
    VALUES (v_payment_id, (v_row ->> 'purchase_bill_id')::uuid, (v_row ->> 'amount')::numeric);

    PERFORM public.recalculate_purchase_bill_balance((v_row ->> 'purchase_bill_id')::uuid);
  END LOOP;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_vendor_credit(
  p_vendor_id uuid,
  p_store_id uuid,
  p_credit_date date,
  p_lines jsonb,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_reduce_stock boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_id uuid;
  v_credit_number text;
  v_line jsonb;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_unit_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_credit_number := public.next_erp_document_number('vendor_credit');

  INSERT INTO public.erp_vendor_credits (
    credit_number, vendor_id, store_id, reference, credit_date,
    status, notes, balance_remaining, created_by
  )
  VALUES (
    v_credit_number, p_vendor_id, p_store_id, p_reference, p_credit_date,
    CASE WHEN p_finalize THEN 'issued' ELSE 'draft' END,
    p_notes, 0, p_created_by
  )
  RETURNING id INTO v_credit_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_unit_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    INSERT INTO public.erp_vendor_credit_lines (
      vendor_credit_id, variant_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_credit_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_qty,
      v_unit_price,
      v_tax_rate,
      v_line_tax,
      v_line_total
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  UPDATE public.erp_vendor_credits
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax,
    total_amount = v_total,
    balance_remaining = v_total
  WHERE id = v_credit_id;

  IF p_finalize AND p_reduce_stock THEN
    PERFORM public.inventory_apply_vendor_credit_stock(v_credit_id);
    UPDATE public.erp_vendor_credits SET inventory_committed = true WHERE id = v_credit_id;
  END IF;

  RETURN v_credit_id;
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
  v_stock numeric;
  v_new numeric;
  v_delta numeric;
  v_qty_int integer;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR r IN
    SELECT variant_id, SUM(quantity)::numeric AS qty
    FROM public.erp_vendor_credit_lines
    WHERE vendor_credit_id = p_credit_id AND variant_id IS NOT NULL
    GROUP BY variant_id
  LOOP
    v_delta := -r.qty;
    v_qty_int := ROUND(v_delta)::integer;

    SELECT stock INTO v_stock
    FROM public.inventory
    WHERE variant_id = r.variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No inventory row for variant %', r.variant_id;
    END IF;

    v_new := GREATEST(0, COALESCE(v_stock, 0) + v_delta);

    UPDATE public.inventory
    SET stock = v_new, updated_at = now()
    WHERE variant_id = r.variant_id;

    IF v_qty_int <> 0 THEN
      PERFORM public.log_stock_movement(
        r.variant_id, v_qty_int, 'vendor_credit', p_credit_id, 'vendor_credit', 'Vendor Credit'
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_erp_vendor_credit(
  p_credit_id uuid,
  p_bill_id uuid,
  p_amount numeric,
  p_applied_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_vendor uuid;
  v_bill_vendor uuid;
  v_remaining numeric;
BEGIN
  IF NOT public.is_staff_user(p_applied_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT vendor_id, balance_remaining INTO v_credit_vendor, v_remaining
  FROM public.erp_vendor_credits
  WHERE id = p_credit_id AND status IN ('issued', 'applied');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor credit not found or not applicable';
  END IF;

  SELECT vendor_id INTO v_bill_vendor
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id AND status IN ('finalized', 'partial', 'paid');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found or not payable';
  END IF;

  IF v_credit_vendor <> v_bill_vendor THEN
    RAISE EXCEPTION 'Credit and bill must belong to same vendor';
  END IF;

  IF p_amount <= 0 OR p_amount > v_remaining THEN
    RAISE EXCEPTION 'Invalid application amount';
  END IF;

  INSERT INTO public.erp_vendor_credit_applications (vendor_credit_id, purchase_bill_id, amount)
  VALUES (p_credit_id, p_bill_id, p_amount)
  ON CONFLICT (vendor_credit_id, purchase_bill_id)
  DO UPDATE SET amount = public.erp_vendor_credit_applications.amount + EXCLUDED.amount;

  UPDATE public.erp_vendor_credits
  SET
    balance_remaining = balance_remaining - p_amount,
    status = CASE WHEN balance_remaining - p_amount <= 0 THEN 'applied' ELSE 'issued' END,
    updated_at = now()
  WHERE id = p_credit_id;

  PERFORM public.recalculate_purchase_bill_balance(p_bill_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_expense(
  p_store_id uuid,
  p_expense_date date,
  p_account_id uuid,
  p_amount numeric,
  p_tax_mode text DEFAULT 'none',
  p_tax_percent numeric DEFAULT 0,
  p_paid_through_account_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
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
  v_expense_id uuid;
  v_expense_number text;
  v_tax_amount numeric := 0;
  v_total numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be positive';
  END IF;

  v_expense_number := public.next_erp_document_number('expense');

  IF p_tax_mode = 'exclusive' THEN
    v_tax_amount := ROUND(p_amount * COALESCE(p_tax_percent, 0) / 100, 2);
    v_total := p_amount + v_tax_amount;
  ELSIF p_tax_mode = 'inclusive' THEN
    v_total := p_amount;
    v_tax_amount := ROUND(v_total * COALESCE(p_tax_percent, 0) / (100 + COALESCE(p_tax_percent, 0)), 2);
  ELSE
    v_total := p_amount;
    v_tax_amount := 0;
  END IF;

  INSERT INTO public.erp_expenses (
    expense_number, store_id, expense_date, account_id, amount,
    tax_mode, tax_percent, tax_amount, total_amount,
    paid_through_account_id, vendor_id, user_id, reference, notes, created_by
  )
  VALUES (
    v_expense_number, p_store_id, p_expense_date, p_account_id, p_amount,
    COALESCE(p_tax_mode, 'none'), COALESCE(p_tax_percent, 0), v_tax_amount, v_total,
    p_paid_through_account_id, p_vendor_id, p_user_id, p_reference, p_notes, p_created_by
  )
  RETURNING id INTO v_expense_id;

  RETURN v_expense_id;
END;
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.erp_landed_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_purchase_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_purchase_bill_landed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_vendor_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_vendor_credit_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_vendor_credit_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_landed_cost_items_staff"
  ON public.erp_landed_cost_items FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_purchase_bills_staff"
  ON public.erp_purchase_bills FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_purchase_bill_lines_staff"
  ON public.erp_purchase_bill_lines FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_purchase_bill_landed_costs_staff"
  ON public.erp_purchase_bill_landed_costs FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_expenses_staff"
  ON public.erp_expenses FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_supplier_payments_staff"
  ON public.erp_supplier_payments FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_supplier_payment_allocations_staff"
  ON public.erp_supplier_payment_allocations FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_vendor_credits_staff"
  ON public.erp_vendor_credits FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_vendor_credit_lines_staff"
  ON public.erp_vendor_credit_lines FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_vendor_credit_applications_staff"
  ON public.erp_vendor_credit_applications FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

GRANT EXECUTE ON FUNCTION public.recalculate_purchase_bill_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_apply_purchase_bill_stock(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_purchase_order(uuid, uuid, date, date, text, text, jsonb, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_purchase_bill(uuid, uuid, date, date, jsonb, jsonb, numeric, uuid, text, text, text, text, text, uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_erp_purchase_bill(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_supplier_payment(uuid, uuid, date, text, numeric, uuid, text, text, boolean, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_vendor_credit(uuid, uuid, date, jsonb, text, text, boolean, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_apply_vendor_credit_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_erp_vendor_credit(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_expense(uuid, date, uuid, numeric, text, numeric, uuid, uuid, uuid, text, text, uuid) TO authenticated;

COMMIT;
