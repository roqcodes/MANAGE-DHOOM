-- Phase 2: Items + Sales ERP extension (extends Phase 1 foundations).
-- Preserves existing orders/inventory/checkout/invoice RPC contracts.

BEGIN;

-- ─── Items: variant-level ERP fields ────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'goods',
  ADD COLUMN IF NOT EXISTS hsn_sac text;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_item_type_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_item_type_check
  CHECK (item_type IN ('goods', 'service'));

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS product_code text,
  ADD COLUMN IF NOT EXISTS purchase_price numeric,
  ADD COLUMN IF NOT EXISTS tax_rate_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.item_units (id),
  ADD COLUMN IF NOT EXISTS markup_percent numeric(5,2);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_barcode_unique_idx
  ON public.product_variants (barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_variants_product_code_idx
  ON public.product_variants (product_code)
  WHERE product_code IS NOT NULL;

-- Store-wise stock (additive; central `inventory` remains checkout authority)
CREATE TABLE IF NOT EXISTS public.store_inventory (
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants (id) ON DELETE CASCADE,
  stock numeric NOT NULL DEFAULT 0,
  purchase_price numeric,
  sales_price numeric,
  opening_stock numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, variant_id)
);

CREATE INDEX IF NOT EXISTS store_inventory_variant_id_idx
  ON public.store_inventory (variant_id);

-- ─── Customers: extend users (no second customer table) ─────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS customer_number text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS trn text,
  ADD COLUMN IF NOT EXISTS contact_display_name text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS po_box text,
  ADD COLUMN IF NOT EXISTS customer_notes text,
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_date date;

CREATE UNIQUE INDEX IF NOT EXISTS users_customer_number_unique_idx
  ON public.users (customer_number)
  WHERE customer_number IS NOT NULL;

-- ─── Sales orders: extend existing orders ───────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS shipment_date date,
  ADD COLUMN IF NOT EXISTS delivery_method text,
  ADD COLUMN IF NOT EXISTS sales_person_id uuid REFERENCES public.users (id),
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores (id),
  ADD COLUMN IF NOT EXISTS sales_order_number text,
  ADD COLUMN IF NOT EXISTS estimate_id uuid;

CREATE INDEX IF NOT EXISTS orders_store_id_idx ON public.orders (store_id);
CREATE INDEX IF NOT EXISTS orders_sales_order_number_idx
  ON public.orders (sales_order_number)
  WHERE sales_order_number IS NOT NULL;

-- ─── Invoices: extend for ERP standalone invoices ───────────────────────────

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores (id),
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_applied numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'order',
  ADD COLUMN IF NOT EXISTS sales_person_id uuid REFERENCES public.users (id),
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimate_id uuid,
  ADD COLUMN IF NOT EXISTS inventory_committed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.invoices
  ALTER COLUMN order_id DROP NOT NULL;

-- Original schema used UNIQUE on order_id (constraint, not a standalone index).
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_order_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_order_id_unique_idx
  ON public.invoices (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('pending', 'issued', 'paid', 'partial', 'overdue', 'cancelled'));

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.item_units (id),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric NOT NULL DEFAULT 0;

UPDATE public.invoices
SET
  balance_due = COALESCE(total_amount, 0) - COALESCE(amount_paid, 0) - COALESCE(credits_applied, 0)
WHERE balance_due = 0
  AND COALESCE(total_amount, 0) > 0;

-- ─── Estimates ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id),
  user_id uuid NOT NULL REFERENCES public.users (id),
  estimate_number text NOT NULL,
  reference text,
  estimate_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'converted', 'cancelled')),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  tax_inclusive boolean NOT NULL DEFAULT false,
  notes text,
  converted_invoice_id uuid,
  sales_person_id uuid REFERENCES public.users (id),
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_estimates_number_unique UNIQUE (estimate_number)
);

CREATE TABLE IF NOT EXISTS public.erp_estimate_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.erp_estimates (id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants (id),
  product_name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  unit_id uuid REFERENCES public.item_units (id)
);

CREATE INDEX IF NOT EXISTS erp_estimate_lines_estimate_id_idx
  ON public.erp_estimate_lines (estimate_id);

-- ─── ERP customer payments (NOT wallet) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id),
  user_id uuid NOT NULL REFERENCES public.users (id),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode text NOT NULL,
  account_id uuid REFERENCES public.accounts (id),
  total_amount numeric NOT NULL,
  reference text,
  notes text,
  is_bulk boolean NOT NULL DEFAULT false,
  unallocated_amount numeric NOT NULL DEFAULT 0,
  customer_count integer NOT NULL DEFAULT 1,
  invoices_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_customer_payments_number_unique UNIQUE (payment_number),
  CONSTRAINT erp_customer_payments_total_positive CHECK (total_amount > 0)
);

CREATE TABLE IF NOT EXISTS public.erp_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.erp_customer_payments (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices (id),
  amount numeric NOT NULL,
  CONSTRAINT erp_payment_allocations_amount_positive CHECK (amount > 0),
  CONSTRAINT erp_payment_allocations_unique UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS erp_payment_allocations_invoice_id_idx
  ON public.erp_payment_allocations (invoice_id);

-- ─── Credit notes (distinct from returns) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id),
  user_id uuid NOT NULL REFERENCES public.users (id),
  reference text,
  credit_note_date date NOT NULL DEFAULT CURRENT_DATE,
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
  CONSTRAINT erp_credit_notes_number_unique UNIQUE (credit_note_number)
);

CREATE TABLE IF NOT EXISTS public.erp_credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.erp_credit_notes (id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants (id),
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.erp_credit_note_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.erp_credit_notes (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices (id),
  amount numeric NOT NULL,
  CONSTRAINT erp_credit_note_applications_amount_positive CHECK (amount > 0),
  CONSTRAINT erp_credit_note_applications_unique UNIQUE (credit_note_id, invoice_id)
);

-- ─── User store preference (change store) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_erp_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  active_store_id uuid REFERENCES public.stores (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalculate_invoice_balance(p_invoice_id uuid)
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
  v_due date;
  v_status text;
BEGIN
  SELECT total_amount, due_date, status
  INTO v_total, v_due, v_status
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid
  FROM public.erp_payment_allocations
  WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_credits
  FROM public.erp_credit_note_applications
  WHERE invoice_id = p_invoice_id;

  v_balance := GREATEST(0, COALESCE(v_total, 0) - v_paid - v_credits);

  IF v_balance <= 0 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 OR v_credits > 0 THEN
    v_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < CURRENT_DATE AND v_balance > 0 THEN
    v_status := 'overdue';
  ELSE
    v_status := 'issued';
  END IF;

  UPDATE public.invoices
  SET
    amount_paid = v_paid,
    credits_applied = v_credits,
    balance_due = v_balance,
    status = v_status
  WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_apply_invoice_stock(
  p_invoice_id uuid,
  p_multiplier integer DEFAULT -1
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
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice id is required';
  END IF;

  IF p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid stock multiplier';
  END IF;

  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR r IN
    SELECT
      ii.variant_id,
      SUM(ii.quantity)::numeric AS qty
    FROM public.invoice_items ii
    WHERE ii.invoice_id = p_invoice_id
      AND ii.variant_id IS NOT NULL
    GROUP BY ii.variant_id
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

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
      CONTINUE;
    END IF;

    v_new := GREATEST(0, COALESCE(v_stock, 0) + v_delta);

    UPDATE public.inventory
    SET stock = v_new, updated_at = now()
    WHERE variant_id = r.variant_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_active_store(
  p_store_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND is_active = true) THEN
    RAISE EXCEPTION 'Invalid store';
  END IF;

  INSERT INTO public.user_erp_preferences (user_id, active_store_id, updated_at)
  VALUES (p_user_id, p_store_id, now())
  ON CONFLICT (user_id)
  DO UPDATE SET active_store_id = EXCLUDED.active_store_id, updated_at = now();

  INSERT INTO public.user_store_access (user_id, store_id, is_default)
  VALUES (p_user_id, p_store_id, true)
  ON CONFLICT (user_id, store_id)
  DO UPDATE SET is_default = true;

  UPDATE public.user_store_access
  SET is_default = false
  WHERE user_id = p_user_id AND store_id <> p_store_id;

  RETURN public.get_erp_context(p_user_id);
END;
$$;

-- Patch get_erp_context to prefer user_erp_preferences
CREATE OR REPLACE FUNCTION public.get_erp_context(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_company_id uuid;
  v_store record;
  v_company record;
BEGIN
  SELECT active_store_id INTO v_store_id
  FROM public.user_erp_preferences
  WHERE user_id = p_user_id;

  IF v_store_id IS NULL THEN
    SELECT usa.store_id INTO v_store_id
    FROM public.user_store_access usa
    WHERE usa.user_id = p_user_id AND usa.is_default = true
    LIMIT 1;
  END IF;

  IF v_store_id IS NULL THEN
    SELECT s.id, s.company_id INTO v_store_id, v_company_id
    FROM public.app_settings a
    JOIN public.stores s ON s.id = a.default_store_id
    WHERE a.id = 1;
  END IF;

  IF v_store_id IS NULL THEN
    SELECT s.id, s.company_id INTO v_store_id, v_company_id
    FROM public.stores s
    WHERE s.is_default = true
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL AND v_store_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id FROM public.stores WHERE id = v_store_id;
  END IF;

  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id FROM public.companies WHERE is_default = true LIMIT 1;
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = v_store_id;
  SELECT * INTO v_company FROM public.companies WHERE id = v_company_id;

  RETURN jsonb_build_object(
    'store_id', v_store_id,
    'company_id', v_company_id,
    'store', CASE WHEN v_store.id IS NULL THEN NULL
      ELSE jsonb_build_object('id', v_store.id, 'name', v_store.name, 'code', v_store.code, 'company_id', v_store.company_id)
    END,
    'company', CASE WHEN v_company.id IS NULL THEN NULL
      ELSE jsonb_build_object('id', v_company.id, 'name', v_company.name, 'legal_name', v_company.legal_name, 'tax_id', v_company.tax_id)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_erp_customer_payment(
  p_user_id uuid,
  p_store_id uuid,
  p_payment_date date,
  p_payment_mode text,
  p_account_id uuid,
  p_total_amount numeric,
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
  v_invoice_user uuid;
  v_invoice_store uuid;
  v_customer_count integer;
  v_invoice_count integer;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_alloc_total := v_alloc_total + COALESCE((v_row ->> 'amount')::numeric, 0);
  END LOOP;

  IF v_alloc_total > p_total_amount THEN
    RAISE EXCEPTION 'Allocation total exceeds payment amount';
  END IF;

  v_payment_number := public.next_erp_document_number(
    CASE WHEN p_is_bulk THEN 'payment_bulk' ELSE 'payment_received' END
  );

  INSERT INTO public.erp_customer_payments (
    payment_number, store_id, user_id, payment_date, payment_mode,
    account_id, total_amount, reference, notes, is_bulk,
    unallocated_amount, customer_count, invoices_count, created_by
  )
  VALUES (
    v_payment_number, p_store_id, p_user_id, p_payment_date, p_payment_mode,
    p_account_id, p_total_amount, p_reference, p_notes, p_is_bulk,
    p_total_amount - v_alloc_total,
    CASE WHEN p_is_bulk THEN 1 ELSE 1 END,
    jsonb_array_length(p_allocations),
    p_created_by
  )
  RETURNING id INTO v_payment_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    SELECT user_id, store_id INTO v_invoice_user, v_invoice_store
    FROM public.invoices
    WHERE id = (v_row ->> 'invoice_id')::uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice not found';
    END IF;

    IF v_invoice_user <> p_user_id THEN
      RAISE EXCEPTION 'Invoice does not belong to customer';
    END IF;

    INSERT INTO public.erp_payment_allocations (payment_id, invoice_id, amount)
    VALUES (v_payment_id, (v_row ->> 'invoice_id')::uuid, (v_row ->> 'amount')::numeric);

    PERFORM public.recalculate_invoice_balance((v_row ->> 'invoice_id')::uuid);
  END LOOP;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_invoice(
  p_user_id uuid,
  p_store_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_lines jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sales_person_id uuid DEFAULT NULL,
  p_estimate_id uuid DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
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

  IF p_user_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Customer and store are required';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_invoice_number := public.next_erp_document_number('sales_invoice');

  INSERT INTO public.invoices (
    order_id, user_id, invoice_number, subtotal, gst_amount, total_amount,
    status, created_at, due_date, issued_at, store_id, amount_paid,
    credits_applied, balance_due, discount, source, sales_person_id,
    reference, tax_inclusive, estimate_id, notes, inventory_committed
  )
  VALUES (
    NULL, p_user_id, v_invoice_number, 0, 0, 0,
    'pending', now(), p_due_date, CASE WHEN p_finalize THEN now() ELSE NULL END,
    p_store_id, 0, 0, 0, COALESCE(p_discount, 0), 'erp',
    p_sales_person_id, p_reference, COALESCE(p_tax_inclusive, false),
    p_estimate_id, p_notes, false
  )
  RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    IF p_tax_inclusive THEN
      v_taxable := ROUND(v_unit_price * v_qty / (1 + v_tax_rate / 100), 2);
      v_line_tax := ROUND(v_unit_price * v_qty - v_taxable, 2);
      v_line_total := ROUND(v_unit_price * v_qty, 2);
    ELSE
      v_taxable := ROUND(v_unit_price * v_qty, 2);
      v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
      v_line_total := v_taxable + v_line_tax;
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, variant_id, product_name, quantity, unit_price,
      base_price, gst_rate, gst_amount, total_amount, vendor_id,
      unit_id, description, taxable_amount
    )
    VALUES (
      v_invoice_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_qty,
      v_unit_price,
      COALESCE((v_line ->> 'purchase_price')::numeric, v_unit_price),
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(v_line ->> 'vendor_id', '')::uuid,
      NULLIF(v_line ->> 'unit_id', '')::uuid,
      v_line ->> 'description',
      v_taxable
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    gst_amount = v_tax,
    total_amount = v_total,
    balance_due = v_total,
    status = CASE WHEN p_finalize THEN 'issued' ELSE 'pending' END
  WHERE id = v_invoice_id;

  IF p_finalize THEN
    PERFORM public.inventory_apply_invoice_stock(v_invoice_id, -1);
    UPDATE public.invoices SET inventory_committed = true WHERE id = v_invoice_id;
  END IF;

  IF p_estimate_id IS NOT NULL THEN
    UPDATE public.erp_estimates
    SET status = 'converted', converted_invoice_id = v_invoice_id, updated_at = now()
    WHERE id = p_estimate_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_estimate(
  p_user_id uuid,
  p_store_id uuid,
  p_estimate_date date,
  p_valid_until date,
  p_lines jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sales_person_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate_id uuid;
  v_estimate_number text;
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

  v_estimate_number := public.next_erp_document_number('estimate');

  INSERT INTO public.erp_estimates (
    store_id, user_id, estimate_number, reference, estimate_date, valid_until,
    status, tax_inclusive, notes, sales_person_id, created_by
  )
  VALUES (
    p_store_id, p_user_id, v_estimate_number, p_reference, p_estimate_date, p_valid_until,
    'draft', COALESCE(p_tax_inclusive, false), p_notes, p_sales_person_id, p_created_by
  )
  RETURNING id INTO v_estimate_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);

    IF p_tax_inclusive THEN
      v_taxable := ROUND(v_unit_price * v_qty / (1 + v_tax_rate / 100), 2);
      v_line_tax := ROUND(v_unit_price * v_qty - v_taxable, 2);
      v_line_total := ROUND(v_unit_price * v_qty, 2);
    ELSE
      v_taxable := ROUND(v_unit_price * v_qty, 2);
      v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
      v_line_total := v_taxable + v_line_tax;
    END IF;

    INSERT INTO public.erp_estimate_lines (
      estimate_id, variant_id, product_name, description, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total, unit_id
    )
    VALUES (
      v_estimate_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      v_line ->> 'description',
      v_qty,
      v_unit_price,
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(v_line ->> 'unit_id', '')::uuid
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

  UPDATE public.erp_estimates
  SET subtotal = v_subtotal, tax_amount = v_tax, discount = COALESCE(p_discount, 0), total_amount = v_total
  WHERE id = v_estimate_id;

  RETURN v_estimate_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_credit_note(
  p_user_id uuid,
  p_store_id uuid,
  p_credit_note_date date,
  p_lines jsonb,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_restore_stock boolean DEFAULT false,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn_id uuid;
  v_cn_number text;
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

  v_cn_number := public.next_erp_document_number('credit_note');

  INSERT INTO public.erp_credit_notes (
    credit_note_number, store_id, user_id, reference, credit_note_date,
    status, notes, balance_remaining, created_by
  )
  VALUES (
    v_cn_number, p_store_id, p_user_id, p_reference, p_credit_note_date,
    CASE WHEN p_finalize THEN 'issued' ELSE 'draft' END,
    p_notes, 0, p_created_by
  )
  RETURNING id INTO v_cn_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_taxable := ROUND(v_unit_price * v_qty, 2);
    v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
    v_line_total := v_taxable + v_line_tax;

    INSERT INTO public.erp_credit_note_lines (
      credit_note_id, variant_id, product_name, quantity,
      unit_price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_cn_id,
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

  UPDATE public.erp_credit_notes
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax,
    total_amount = v_total,
    balance_remaining = v_total
  WHERE id = v_cn_id;

  IF p_finalize AND p_restore_stock THEN
  -- restore stock for returned goods
    FOR v_line IN
      SELECT variant_id, quantity
      FROM public.erp_credit_note_lines
      WHERE credit_note_id = v_cn_id AND variant_id IS NOT NULL
    LOOP
      UPDATE public.inventory
      SET stock = COALESCE(stock, 0) + v_line.quantity, updated_at = now()
      WHERE variant_id = v_line.variant_id;
    END LOOP;
    UPDATE public.erp_credit_notes SET inventory_committed = true WHERE id = v_cn_id;
  END IF;

  RETURN v_cn_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_erp_credit_note(
  p_credit_note_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_applied_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn_user uuid;
  v_invoice_user uuid;
  v_remaining numeric;
BEGIN
  IF NOT public.is_staff_user(p_applied_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT user_id, balance_remaining INTO v_cn_user, v_remaining
  FROM public.erp_credit_notes
  WHERE id = p_credit_note_id AND status IN ('issued', 'applied');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note not found or not applicable';
  END IF;

  SELECT user_id INTO v_invoice_user FROM public.invoices WHERE id = p_invoice_id;

  IF v_cn_user <> v_invoice_user THEN
    RAISE EXCEPTION 'Credit note and invoice must belong to same customer';
  END IF;

  IF p_amount <= 0 OR p_amount > v_remaining THEN
    RAISE EXCEPTION 'Invalid application amount';
  END IF;

  INSERT INTO public.erp_credit_note_applications (credit_note_id, invoice_id, amount)
  VALUES (p_credit_note_id, p_invoice_id, p_amount)
  ON CONFLICT (credit_note_id, invoice_id)
  DO UPDATE SET amount = public.erp_credit_note_applications.amount + EXCLUDED.amount;

  UPDATE public.erp_credit_notes
  SET
    balance_remaining = balance_remaining - p_amount,
    status = CASE WHEN balance_remaining - p_amount <= 0 THEN 'applied' ELSE 'issued' END,
    updated_at = now()
  WHERE id = p_credit_note_id;

  PERFORM public.recalculate_invoice_balance(p_invoice_id);
END;
$$;

-- Extend generate_invoice_for_order to set balance fields (non-breaking)
CREATE OR REPLACE FUNCTION public.generate_invoice_for_order(p_order_id uuid, p_gst_number text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 0;
  v_gst_total numeric := 0;
  v_total numeric := 0;
  v_item RECORD;
  v_gst_rate numeric := 18;
BEGIN
  SELECT id INTO v_invoice_id FROM public.invoices WHERE order_id = p_order_id;
  IF v_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice already exists for this order';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_invoice_number := public.generate_invoice_number();

  INSERT INTO public.invoices (
    order_id, user_id, invoice_number, gst_number,
    subtotal, gst_amount, total_amount, status,
    created_at, due_date, source, balance_due, amount_paid, credits_applied
  ) VALUES (
    p_order_id, v_order.user_id, v_invoice_number, p_gst_number,
    0, 0, 0, 'issued',
    now(), now() + interval '30 days', 'order', 0, 0, 0
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT * FROM public.order_items WHERE order_id = p_order_id
  LOOP
    v_gst_rate := 18;
    v_item.base_price := v_item.final_price;
    v_item.gst_amount := (v_item.final_price * v_gst_rate / 100) * v_item.quantity;
    v_item.total_amount := v_item.final_price * v_item.quantity + v_item.gst_amount;

    INSERT INTO public.invoice_items (
      invoice_id, variant_id, product_name, quantity,
      unit_price, base_price, gst_rate, gst_amount, total_amount, vendor_id,
      taxable_amount
    ) VALUES (
      v_invoice_id, v_item.variant_id, v_item.product_name, v_item.quantity,
      v_item.price, v_item.base_price, v_gst_rate, v_item.gst_amount, v_item.total_amount, v_item.vendor_id,
      v_item.final_price * v_item.quantity
    );

    v_subtotal := v_subtotal + (v_item.final_price * v_item.quantity);
    v_gst_total := v_gst_total + v_item.gst_amount;
    v_total := v_total + v_item.total_amount;
  END LOOP;

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    gst_amount = v_gst_total,
    total_amount = v_total,
    balance_due = v_total,
    issued_at = now()
  WHERE id = v_invoice_id;

  RETURN (
    SELECT json_build_object(
      'id', i.id,
      'order_id', i.order_id,
      'user_id', i.user_id,
      'invoice_number', i.invoice_number,
      'gst_number', i.gst_number,
      'subtotal', i.subtotal,
      'gst_amount', i.gst_amount,
      'total_amount', i.total_amount,
      'balance_due', i.balance_due,
      'status', i.status,
      'created_at', i.created_at,
      'due_date', i.due_date,
      'issued_at', i.issued_at,
      'items', (
        SELECT COALESCE(json_agg(json_build_object(
          'id', ii.id,
          'variant_id', ii.variant_id,
          'product_name', ii.product_name,
          'quantity', ii.quantity,
          'unit_price', ii.unit_price,
          'base_price', ii.base_price,
          'gst_rate', ii.gst_rate,
          'gst_amount', ii.gst_amount,
          'total_amount', ii.total_amount
        )), '[]'::json)
        FROM public.invoice_items ii
        WHERE ii.invoice_id = i.id
      )
    )
    FROM public.invoices i
    WHERE i.id = v_invoice_id
  );
END;
$$;

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES ('payment_bulk', 'CPM', 1, 0)
ON CONFLICT (document_type) DO NOTHING;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.store_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_estimate_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_credit_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_credit_note_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_erp_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_inventory_staff"
  ON public.store_inventory FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_estimates_staff"
  ON public.erp_estimates FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_estimate_lines_staff"
  ON public.erp_estimate_lines FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_customer_payments_staff"
  ON public.erp_customer_payments FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_payment_allocations_staff"
  ON public.erp_payment_allocations FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_credit_notes_staff"
  ON public.erp_credit_notes FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_credit_note_lines_staff"
  ON public.erp_credit_note_lines FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "erp_credit_note_applications_staff"
  ON public.erp_credit_note_applications FOR ALL
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

CREATE POLICY "user_erp_preferences_self"
  ON public.user_erp_preferences FOR ALL
  USING (user_id = auth.uid() OR public.is_staff_user())
  WITH CHECK (user_id = auth.uid() OR public.is_staff_user());

GRANT EXECUTE ON FUNCTION public.recalculate_invoice_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_apply_invoice_stock(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_active_store(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_erp_customer_payment(uuid, uuid, date, text, uuid, numeric, text, text, boolean, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_invoice(uuid, uuid, date, date, jsonb, numeric, boolean, text, text, uuid, uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_estimate(uuid, uuid, date, date, jsonb, numeric, boolean, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_credit_note(uuid, uuid, date, jsonb, text, text, boolean, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_erp_credit_note(uuid, uuid, numeric, uuid) TO authenticated;

COMMIT;
