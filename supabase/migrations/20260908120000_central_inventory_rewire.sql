-- Central inventory rewire: store stock is product-level (ERP/physical);
-- online inventory is variant-level per store, fed only via store→online transfers + allocation.

BEGIN;

-- ─── 1. Product-level pricing (single price for all variants) ───────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS mrp numeric,
  ADD COLUMN IF NOT EXISTS purchase_price numeric,
  ADD COLUMN IF NOT EXISTS tax_rate_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS barcode text;

UPDATE public.products p
SET
  price = COALESCE(p.price, sub.price),
  mrp = COALESCE(p.mrp, sub.mrp),
  purchase_price = COALESCE(p.purchase_price, sub.purchase_price),
  tax_rate_percent = COALESCE(p.tax_rate_percent, sub.tax_rate_percent),
  barcode = COALESCE(p.barcode, sub.barcode)
FROM (
  SELECT DISTINCT ON (pv.product_id)
    pv.product_id,
    pv.price,
    pv.mrp,
    pv.purchase_price,
    pv.tax_rate_percent,
    pv.barcode
  FROM public.product_variants pv
  ORDER BY pv.product_id, pv.created_at
) sub
WHERE p.id = sub.product_id;

-- Sync all variant prices from product master
UPDATE public.product_variants pv
SET
  price = COALESCE(p.price, pv.price),
  mrp = COALESCE(p.mrp, pv.mrp),
  purchase_price = COALESCE(p.purchase_price, pv.purchase_price),
  tax_rate_percent = COALESCE(p.tax_rate_percent, pv.tax_rate_percent)
FROM public.products p
WHERE p.id = pv.product_id;

CREATE OR REPLACE FUNCTION public.sync_variant_prices_from_product()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.price IS DISTINCT FROM OLD.price OR
    NEW.mrp IS DISTINCT FROM OLD.mrp OR
    NEW.purchase_price IS DISTINCT FROM OLD.purchase_price OR
    NEW.tax_rate_percent IS DISTINCT FROM OLD.tax_rate_percent
  ) THEN
    UPDATE public.product_variants
    SET
      price = COALESCE(NEW.price, price),
      mrp = COALESCE(NEW.mrp, mrp),
      purchase_price = COALESCE(NEW.purchase_price, purchase_price),
      tax_rate_percent = COALESCE(NEW.tax_rate_percent, tax_rate_percent)
    WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_sync_variant_prices ON public.products;
CREATE TRIGGER products_sync_variant_prices
  AFTER UPDATE OF price, mrp, purchase_price, tax_rate_percent ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_variant_prices_from_product();

CREATE OR REPLACE FUNCTION public.sync_new_variant_price_from_product()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  IF FOUND THEN
    NEW.price := COALESCE(NEW.price, v_product.price, 0);
    NEW.mrp := COALESCE(NEW.mrp, v_product.mrp, NEW.price);
    NEW.purchase_price := COALESCE(NEW.purchase_price, v_product.purchase_price);
    NEW.tax_rate_percent := COALESCE(NEW.tax_rate_percent, v_product.tax_rate_percent);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_variants_inherit_product_price ON public.product_variants;
CREATE TRIGGER product_variants_inherit_product_price
  BEFORE INSERT ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_new_variant_price_from_product();

-- ─── 2. Store product inventory (ERP / physical authority) ────────────────────

CREATE TABLE IF NOT EXISTS public.store_product_inventory (
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  stock numeric NOT NULL DEFAULT 0,
  purchase_price numeric,
  sales_price numeric,
  opening_stock numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, product_id),
  CONSTRAINT store_product_inventory_stock_non_negative CHECK (stock >= 0)
);

CREATE INDEX IF NOT EXISTS store_product_inventory_product_id_idx
  ON public.store_product_inventory (product_id);

-- Migrate aggregated variant stock → product stock
INSERT INTO public.store_product_inventory (store_id, product_id, stock, purchase_price, sales_price, opening_stock)
SELECT
  si.store_id,
  pv.product_id,
  COALESCE(SUM(si.stock), 0),
  AVG(si.purchase_price),
  AVG(si.sales_price),
  COALESCE(SUM(si.opening_stock), 0)
FROM public.store_inventory si
JOIN public.product_variants pv ON pv.id = si.variant_id
GROUP BY si.store_id, pv.product_id
ON CONFLICT (store_id, product_id) DO UPDATE
SET
  stock = EXCLUDED.stock,
  purchase_price = EXCLUDED.purchase_price,
  sales_price = EXCLUDED.sales_price,
  opening_stock = EXCLUDED.opening_stock,
  updated_at = now();

ALTER TABLE public.store_product_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_product_inventory_staff" ON public.store_product_inventory;
CREATE POLICY "store_product_inventory_staff"
  ON public.store_product_inventory FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- ─── 3. Online inventory (per store, variant-level) ─────────────────────────

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reserved_stock numeric NOT NULL DEFAULT 0;

UPDATE public.inventory
SET store_id = public.get_default_store_id()
WHERE store_id IS NULL;

-- Online stock starts fresh; physical stock lives in store_product_inventory
UPDATE public.inventory SET stock = 0, reserved_stock = 0;

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_pkey;
ALTER TABLE public.inventory ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_reserved_non_negative;
ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_reserved_non_negative CHECK (reserved_stock >= 0);
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_reserved_lte_stock;
ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_reserved_lte_stock CHECK (reserved_stock <= stock);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inventory'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.inventory
      ADD PRIMARY KEY (store_id, variant_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inventory_variant_id_idx
  ON public.inventory (variant_id);

-- ─── 4. Online stock transfers (store → online pool, product-level) ─────────

CREATE TABLE IF NOT EXISTS public.online_stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending_allocation',
  notes text,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  allocated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT online_stock_transfers_qty_positive CHECK (quantity > 0),
  CONSTRAINT online_stock_transfers_status_check CHECK (
    status IN ('pending_allocation', 'allocated', 'cancelled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS online_stock_transfers_number_idx
  ON public.online_stock_transfers (transfer_number);

CREATE INDEX IF NOT EXISTS online_stock_transfers_store_idx
  ON public.online_stock_transfers (store_id, status);

CREATE TABLE IF NOT EXISTS public.online_stock_transfer_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.online_stock_transfers (id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants (id) ON DELETE RESTRICT,
  quantity numeric NOT NULL,
  CONSTRAINT online_stock_transfer_alloc_qty_positive CHECK (quantity > 0),
  CONSTRAINT online_stock_transfer_alloc_unique UNIQUE (transfer_id, variant_id)
);

CREATE INDEX IF NOT EXISTS online_stock_transfer_alloc_transfer_idx
  ON public.online_stock_transfer_allocations (transfer_id);

ALTER TABLE public.online_stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_stock_transfer_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "online_stock_transfers_staff" ON public.online_stock_transfers;
CREATE POLICY "online_stock_transfers_staff"
  ON public.online_stock_transfers FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "online_stock_transfer_allocations_staff" ON public.online_stock_transfer_allocations;
CREATE POLICY "online_stock_transfer_allocations_staff"
  ON public.online_stock_transfer_allocations FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- ─── 5. ERP document lines: product_id support ──────────────────────────────

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

ALTER TABLE public.erp_stock_adjustment_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

ALTER TABLE public.erp_purchase_receive_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

ALTER TABLE public.erp_store_transfer_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

ALTER TABLE public.erp_transfer_request_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

UPDATE public.invoice_items ii
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = ii.variant_id AND ii.product_id IS NULL;

UPDATE public.order_items oi
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = oi.variant_id AND oi.product_id IS NULL;

UPDATE public.erp_stock_adjustment_lines l
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = l.variant_id AND l.product_id IS NULL;

UPDATE public.erp_purchase_receive_lines l
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = l.variant_id AND l.product_id IS NULL;

UPDATE public.erp_store_transfer_lines l
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = l.variant_id AND l.product_id IS NULL;

UPDATE public.erp_transfer_request_lines l
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = l.variant_id AND l.product_id IS NULL;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

ALTER TABLE public.stock_movements
  ALTER COLUMN variant_id DROP NOT NULL;

-- ─── 6. Store product inventory RPCs ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.store_product_inventory_available(
  p_store_id uuid,
  p_product_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(spi.stock, 0)
  FROM public.store_product_inventory spi
  WHERE spi.store_id = p_store_id AND spi.product_id = p_product_id;
$$;

CREATE OR REPLACE FUNCTION public.store_product_inventory_apply_delta(
  p_store_id uuid,
  p_product_id uuid,
  p_delta numeric,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_new numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_store_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Store and product are required';
  END IF;

  SELECT stock INTO v_stock
  FROM public.store_product_inventory
  WHERE store_id = p_store_id AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_delta < 0 THEN
      RAISE EXCEPTION 'Insufficient stock: no inventory for product % at store %', p_product_id, p_store_id;
    END IF;
    INSERT INTO public.store_product_inventory (store_id, product_id, stock, updated_at)
    VALUES (p_store_id, p_product_id, p_delta, now());
    RETURN p_delta;
  END IF;

  v_new := COALESCE(v_stock, 0) + p_delta;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: product % at store % (available %, requested %)',
      p_product_id, p_store_id, COALESCE(v_stock, 0), ABS(p_delta);
  END IF;

  UPDATE public.store_product_inventory
  SET stock = v_new, updated_at = now()
  WHERE store_id = p_store_id AND product_id = p_product_id;

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_store_product_inventory_stock(
  p_store_id uuid,
  p_product_id uuid,
  p_stock numeric,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_stock < 0 THEN
    RAISE EXCEPTION 'Stock cannot be negative';
  END IF;

  INSERT INTO public.store_product_inventory (store_id, product_id, stock, updated_at)
  VALUES (p_store_id, p_product_id, p_stock, now())
  ON CONFLICT (store_id, product_id)
  DO UPDATE SET stock = EXCLUDED.stock, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.log_product_stock_movement(
  p_product_id uuid,
  p_quantity numeric,
  p_type text,
  p_reference_id uuid DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_transfer_store_id uuid DEFAULT NULL,
  p_transaction_price numeric DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
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
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_store_id IS NOT NULL THEN
    SELECT stock INTO v_balance
    FROM public.store_product_inventory
    WHERE store_id = p_store_id AND product_id = p_product_id;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, quantity, type, reference_id, reference_type, reason, user_id,
    store_id, transfer_store_id, transaction_price, balance_after
  )
  VALUES (
    p_product_id, p_quantity, p_type, p_reference_id, p_reference_type, p_reason, v_user_id,
    p_store_id, p_transfer_store_id, p_transaction_price, v_balance
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

-- ─── 7. Online inventory RPCs ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.online_inventory_available(
  p_store_id uuid,
  p_variant_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(i.stock, 0) - COALESCE(i.reserved_stock, 0)
  FROM public.inventory i
  WHERE i.store_id = p_store_id AND i.variant_id = p_variant_id;
$$;

CREATE OR REPLACE FUNCTION public.get_variant_online_available(p_variant_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(public.online_inventory_available(s.id, p_variant_id)), 0)
  FROM public.stores s
  WHERE s.is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.online_inventory_reserve(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_reserved numeric;
  v_available numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Reserve quantity must be positive';
  END IF;

  SELECT stock, reserved_stock INTO v_stock, v_reserved
  FROM public.inventory
  WHERE store_id = p_store_id AND variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No online inventory for variant % at store %', p_variant_id, p_store_id;
  END IF;

  v_available := COALESCE(v_stock, 0) - COALESCE(v_reserved, 0);
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient online stock: variant % at store % (available %, requested %)',
      p_variant_id, p_store_id, v_available, p_quantity;
  END IF;

  UPDATE public.inventory
  SET reserved_stock = reserved_stock + p_quantity, updated_at = now()
  WHERE store_id = p_store_id AND variant_id = p_variant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.online_inventory_release_reservation(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.inventory
  SET reserved_stock = GREATEST(0, reserved_stock - p_quantity), updated_at = now()
  WHERE store_id = p_store_id AND variant_id = p_variant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.online_inventory_ship_reserved(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_reference_id uuid,
  p_reference_type text,
  p_reason text DEFAULT 'Order shipped',
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_reserved numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN;
  END IF;

  SELECT stock, reserved_stock INTO v_stock, v_reserved
  FROM public.inventory
  WHERE store_id = p_store_id AND variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No online inventory for variant % at store %', p_variant_id, p_store_id;
  END IF;

  IF COALESCE(v_reserved, 0) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient reserved online stock';
  END IF;

  IF COALESCE(v_stock, 0) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient online stock';
  END IF;

  UPDATE public.inventory
  SET
    stock = stock - p_quantity,
    reserved_stock = reserved_stock - p_quantity,
    updated_at = now()
  WHERE store_id = p_store_id AND variant_id = p_variant_id;

  PERFORM public.log_stock_movement(
    p_variant_id, -p_quantity, 'sale', p_reference_id, p_reference_type, p_reason,
    p_store_id, NULL, NULL, p_user_id
  );
END;
$$;

-- ─── 8. Online stock transfer + allocation ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_online_stock_transfer(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_number text;
  v_available numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be positive';
  END IF;

  v_available := public.store_product_inventory_available(p_store_id, p_product_id);
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient store stock: product % (available %, requested %)',
      p_product_id, v_available, p_quantity;
  END IF;

  PERFORM public.store_product_inventory_apply_delta(p_store_id, p_product_id, -p_quantity, p_user_id);

  v_number := public.next_erp_document_number('online_stock_transfer');

  INSERT INTO public.online_stock_transfers (
    transfer_number, store_id, product_id, quantity, status, notes, created_by
  )
  VALUES (
    v_number, p_store_id, p_product_id, p_quantity, 'pending_allocation', p_notes, p_user_id
  )
  RETURNING id INTO v_transfer_id;

  PERFORM public.log_product_stock_movement(
    p_product_id, -p_quantity, 'transfer_out', v_transfer_id, 'online_stock_transfer',
    'Store to online transfer', p_store_id, NULL, NULL, p_user_id
  );

  RETURN v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_online_stock_transfer(
  p_transfer_id uuid,
  p_allocations jsonb,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_line jsonb;
  v_variant_id uuid;
  v_qty numeric;
  v_total numeric := 0;
  v_product_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_transfer
  FROM public.online_stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF v_transfer.status <> 'pending_allocation' THEN
    RAISE EXCEPTION 'Transfer is not pending allocation';
  END IF;

  PERFORM public.require_store_access(v_transfer.store_id, p_user_id);

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Allocations are required';
  END IF;

  DELETE FROM public.online_stock_transfer_allocations
  WHERE transfer_id = p_transfer_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_variant_id := (v_line ->> 'variantId')::uuid;
    v_qty := (v_line ->> 'quantity')::numeric;

    IF v_variant_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid allocation line';
    END IF;

    SELECT product_id INTO v_product_id
    FROM public.product_variants
    WHERE id = v_variant_id;

    IF v_product_id IS DISTINCT FROM v_transfer.product_id THEN
      RAISE EXCEPTION 'Variant % does not belong to product %', v_variant_id, v_transfer.product_id;
    END IF;

    INSERT INTO public.online_stock_transfer_allocations (transfer_id, variant_id, quantity)
    VALUES (p_transfer_id, v_variant_id, v_qty);

    v_total := v_total + v_qty;
  END LOOP;

  IF v_total <> v_transfer.quantity THEN
    RAISE EXCEPTION 'Allocation total (%) must equal transfer quantity (%)', v_total, v_transfer.quantity;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_variant_id := (v_line ->> 'variantId')::uuid;
    v_qty := (v_line ->> 'quantity')::numeric;

    INSERT INTO public.inventory (store_id, variant_id, stock, reserved_stock, updated_at)
    VALUES (v_transfer.store_id, v_variant_id, v_qty, 0, now())
    ON CONFLICT (store_id, variant_id)
    DO UPDATE SET stock = public.inventory.stock + EXCLUDED.stock, updated_at = now();

    PERFORM public.log_stock_movement(
      v_variant_id, v_qty, 'transfer_in', p_transfer_id, 'online_stock_transfer',
      'Online stock allocation', v_transfer.store_id, NULL, NULL, p_user_id
    );
  END LOOP;

  UPDATE public.online_stock_transfers
  SET status = 'allocated', allocated_at = now(), updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_online_stock_transfer(
  p_transfer_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_transfer
  FROM public.online_stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF v_transfer.status <> 'pending_allocation' THEN
    RAISE EXCEPTION 'Only pending transfers can be cancelled';
  END IF;

  PERFORM public.require_store_access(v_transfer.store_id, p_user_id);

  PERFORM public.store_product_inventory_apply_delta(
    v_transfer.store_id, v_transfer.product_id, v_transfer.quantity, p_user_id
  );

  PERFORM public.log_product_stock_movement(
    v_transfer.product_id, v_transfer.quantity, 'return', p_transfer_id, 'online_stock_transfer',
    'Online transfer cancelled', v_transfer.store_id, NULL, NULL, p_user_id
  );

  UPDATE public.online_stock_transfers
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- Document number sequence for online transfers
INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES ('online_stock_transfer', 'OST', 1, 5)
ON CONFLICT (document_type) DO NOTHING;

-- ─── 9. ERP stock RPCs → product-level store inventory ──────────────────────

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
  v_store_id uuid;
  v_committed boolean;
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

  SELECT store_id, inventory_committed
  INTO v_store_id, v_committed
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Invoice store is required for stock deduction';
  END IF;

  IF p_multiplier = -1 AND v_committed THEN
    RETURN;
  END IF;

  IF p_multiplier = 1 AND NOT v_committed THEN
    RETURN;
  END IF;

  PERFORM public.require_store_access(v_store_id);

  FOR r IN
    SELECT
      COALESCE(ii.product_id, pv.product_id) AS product_id,
      SUM(ii.quantity)::numeric AS qty,
      MAX(ii.unit_price) AS unit_price
    FROM public.invoice_items ii
    LEFT JOIN public.product_variants pv ON pv.id = ii.variant_id
    WHERE ii.invoice_id = p_invoice_id
      AND COALESCE(ii.product_id, pv.product_id) IS NOT NULL
    GROUP BY COALESCE(ii.product_id, pv.product_id)
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    PERFORM public.store_product_inventory_apply_delta(v_store_id, r.product_id, v_delta);

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta,
      CASE WHEN p_multiplier = -1 THEN 'sale' ELSE 'return' END,
      p_invoice_id, 'invoice',
      CASE WHEN p_multiplier = -1 THEN 'ERP invoice sale' ELSE 'ERP invoice stock restore' END,
      v_store_id, NULL, r.unit_price
    );
  END LOOP;

  UPDATE public.invoices
  SET inventory_committed = (p_multiplier = -1)
  WHERE id = p_invoice_id;
END;
$$;

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
    SELECT
      COALESCE(prl.product_id, pv.product_id) AS product_id,
      SUM(prl.accepted_qty)::numeric AS qty,
      AVG(prl.purchase_price) AS avg_price
    FROM public.erp_purchase_receive_lines prl
    LEFT JOIN public.product_variants pv ON pv.id = prl.variant_id
    WHERE prl.purchase_receive_id = p_receive_id
      AND COALESCE(prl.product_id, pv.product_id) IS NOT NULL
      AND prl.accepted_qty > 0
    GROUP BY COALESCE(prl.product_id, pv.product_id)
  LOOP
    v_delta := r.qty * p_multiplier;

    PERFORM public.store_product_inventory_apply_delta(v_store_id, r.product_id, v_delta, v_actor);

    IF r.avg_price > 0 THEN
      UPDATE public.store_product_inventory
      SET purchase_price = r.avg_price, updated_at = now()
      WHERE store_id = v_store_id AND product_id = r.product_id;
    END IF;

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta, 'purchase', p_receive_id, 'purchase_receive',
      'Purchase Receive', v_store_id, NULL, r.avg_price, v_actor
    );
  END LOOP;
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
  v_product_id uuid;
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
    SELECT l.variant_id, l.product_id, l.direction, l.quantity, l.purchase_cost
    FROM public.erp_stock_adjustment_lines l
    WHERE l.adjustment_id = p_adjustment_id
  LOOP
    v_product_id := COALESCE(
      r.product_id,
      (SELECT product_id FROM public.product_variants WHERE id = r.variant_id)
    );

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required for adjustment line';
    END IF;

    v_delta := CASE WHEN r.direction = 'add' THEN r.quantity ELSE -r.quantity END;

    PERFORM public.store_product_inventory_apply_delta(
      v_store_id, v_product_id, v_delta, p_finalized_by
    );

    PERFORM public.log_product_stock_movement(
      v_product_id, v_delta,
      CASE WHEN r.direction = 'add' THEN 'adjustment' ELSE 'damaged' END,
      p_adjustment_id, 'stock_adjustment',
      'Stock adjustment finalized', v_store_id, NULL, r.purchase_cost, p_finalized_by
    );
  END LOOP;

  UPDATE public.erp_stock_adjustments
  SET status = 'finalized', inventory_committed = true, updated_at = now()
  WHERE id = p_adjustment_id;
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
  v_available numeric;
  v_product_id uuid;
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

  FOR r IN
    SELECT l.variant_id, l.product_id, l.quantity, l.transfer_price
    FROM public.erp_store_transfer_lines l
    WHERE l.transfer_id = p_transfer_id
  LOOP
    v_product_id := COALESCE(
      r.product_id,
      (SELECT product_id FROM public.product_variants WHERE id = r.variant_id)
    );

    v_available := public.store_product_inventory_available(v_from, v_product_id);
    IF v_available < r.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product % at source store (available %, requested %)',
        v_product_id, v_available, r.quantity;
    END IF;
  END LOOP;

  IF v_status = 'draft' THEN
    UPDATE public.erp_store_transfers SET status = 'approved' WHERE id = p_transfer_id;
  END IF;

  FOR r IN
    SELECT l.variant_id, l.product_id, l.quantity, l.transfer_price
    FROM public.erp_store_transfer_lines l
    WHERE l.transfer_id = p_transfer_id
  LOOP
    v_product_id := COALESCE(
      r.product_id,
      (SELECT product_id FROM public.product_variants WHERE id = r.variant_id)
    );

    PERFORM public.store_product_inventory_apply_delta(v_from, v_product_id, -r.quantity, p_completed_by);
    PERFORM public.store_product_inventory_apply_delta(v_to, v_product_id, r.quantity, p_completed_by);

    PERFORM public.log_product_stock_movement(
      v_product_id, -r.quantity, 'transfer_out', p_transfer_id, 'store_transfer',
      'Store transfer out', v_from, v_to, r.transfer_price, p_completed_by
    );
    PERFORM public.log_product_stock_movement(
      v_product_id, r.quantity, 'transfer_in', p_transfer_id, 'store_transfer',
      'Store transfer in', v_to, v_from, r.transfer_price, p_completed_by
    );
  END LOOP;

  UPDATE public.erp_store_transfers
  SET status = 'completed', inventory_committed = true, updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── 10. Online order fulfillment → online inventory ────────────────────────

CREATE OR REPLACE FUNCTION public.setup_order_fulfillments_and_reserve(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_default_store uuid;
  v_line record;
  v_store_id uuid;
  v_fulfillment_id uuid;
  v_can_whole_order uuid[];
  v_best_store uuid;
  v_fulfillment_map jsonb := '{}'::jsonb;
  v_fid_text text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, user_id, source, inventory_reserved, inventory_committed, status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.user_id <> v_uid AND NOT public.is_staff_user(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_order.inventory_committed THEN
    RETURN;
  END IF;

  IF v_order.inventory_reserved THEN
    PERFORM public.release_order_inventory_reservations(p_order_id);
  END IF;

  v_default_store := public.get_default_store_id();

  SELECT array_agg(s.id)
  INTO v_can_whole_order
  FROM public.stores s
  WHERE s.is_active = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.variant_id IS NOT NULL
        AND COALESCE(public.online_inventory_available(s.id, oi.variant_id), 0) < oi.quantity
    );

  IF v_can_whole_order IS NOT NULL AND array_length(v_can_whole_order, 1) > 0 THEN
    IF v_default_store IS NOT NULL AND v_default_store = ANY(v_can_whole_order) THEN
      v_best_store := v_default_store;
    ELSIF array_length(v_can_whole_order, 1) = 1 THEN
      v_best_store := v_can_whole_order[1];
    ELSE
      UPDATE public.orders
      SET fulfillment_status = 'pending_assignment', store_id = NULL
      WHERE id = p_order_id;

      INSERT INTO public.order_fulfillments (order_id, store_id, status)
      VALUES (p_order_id, NULL, 'pending_assignment');
      RETURN;
    END IF;

    v_fulfillment_id := gen_random_uuid();
    INSERT INTO public.order_fulfillments (id, order_id, store_id, status, reserved_at)
    VALUES (v_fulfillment_id, p_order_id, v_best_store, 'reserved', now());

    FOR v_line IN
      SELECT oi.id AS order_item_id, oi.variant_id, oi.quantity::numeric AS qty
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
    LOOP
      INSERT INTO public.order_fulfillment_items (
        fulfillment_id, order_item_id, variant_id, quantity, reserved_quantity
      )
      VALUES (v_fulfillment_id, v_line.order_item_id, v_line.variant_id, v_line.qty, v_line.qty);

      PERFORM public.online_inventory_reserve(v_best_store, v_line.variant_id, v_line.qty, v_uid);
    END LOOP;

    UPDATE public.orders
    SET store_id = v_best_store, fulfillment_status = 'reserved', inventory_reserved = true
    WHERE id = p_order_id;
    RETURN;
  END IF;

  FOR v_line IN
    SELECT oi.id AS order_item_id, oi.variant_id, oi.quantity::numeric AS qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
  LOOP
    SELECT s.id INTO v_store_id
    FROM public.stores s
    WHERE s.is_active = true
      AND COALESCE(public.online_inventory_available(s.id, v_line.variant_id), 0) >= v_line.qty
    ORDER BY CASE WHEN s.id = v_default_store THEN 0 ELSE 1 END,
             public.online_inventory_available(s.id, v_line.variant_id) DESC
    LIMIT 1;

    IF v_store_id IS NULL THEN
      RAISE EXCEPTION 'Insufficient online stock for variant %', v_line.variant_id;
    END IF;

    v_fid_text := v_fulfillment_map ->> v_store_id::text;
    IF v_fid_text IS NULL THEN
      v_fulfillment_id := gen_random_uuid();
      INSERT INTO public.order_fulfillments (id, order_id, store_id, status, reserved_at)
      VALUES (v_fulfillment_id, p_order_id, v_store_id, 'reserved', now());
      v_fulfillment_map := v_fulfillment_map || jsonb_build_object(v_store_id::text, v_fulfillment_id::text);
    ELSE
      v_fulfillment_id := v_fid_text::uuid;
    END IF;

    INSERT INTO public.order_fulfillment_items (
      fulfillment_id, order_item_id, variant_id, quantity, reserved_quantity
    )
    VALUES (v_fulfillment_id, v_line.order_item_id, v_line.variant_id, v_line.qty, v_line.qty);

    PERFORM public.online_inventory_reserve(v_store_id, v_line.variant_id, v_line.qty, v_uid);
  END LOOP;

  UPDATE public.orders
  SET fulfillment_status = 'multi_shipment', inventory_reserved = true
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_inventory_reservations(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_uid uuid := auth.uid();
  v_order record;
BEGIN
  SELECT user_id, inventory_reserved, inventory_committed INTO v_order
  FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_uid IS NOT NULL AND v_order.user_id <> v_uid AND NOT public.is_staff_user(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT v_order.inventory_reserved THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT ofi.variant_id, ofi.reserved_quantity - ofi.shipped_quantity AS qty, of.store_id
    FROM public.order_fulfillment_items ofi
    JOIN public.order_fulfillments of ON of.id = ofi.fulfillment_id
    WHERE of.order_id = p_order_id
      AND of.store_id IS NOT NULL
      AND ofi.reserved_quantity > ofi.shipped_quantity
  LOOP
    PERFORM public.online_inventory_release_reservation(r.store_id, r.variant_id, r.qty);
  END LOOP;

  UPDATE public.order_fulfillments
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id AND status NOT IN ('shipped', 'cancelled');

  UPDATE public.orders
  SET inventory_reserved = false, fulfillment_status = 'cancelled'
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ship_order_fulfillment(
  p_fulfillment_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fulfillment record;
  r record;
  v_qty numeric;
BEGIN
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_fulfillment
  FROM public.order_fulfillments
  WHERE id = p_fulfillment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fulfillment not found';
  END IF;

  IF v_fulfillment.inventory_committed THEN
    RETURN;
  END IF;

  IF v_fulfillment.store_id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment store not assigned';
  END IF;

  PERFORM public.require_store_access(v_fulfillment.store_id, p_actor);

  FOR r IN
    SELECT variant_id, reserved_quantity - shipped_quantity AS qty
    FROM public.order_fulfillment_items
    WHERE fulfillment_id = p_fulfillment_id
      AND reserved_quantity > shipped_quantity
  LOOP
    v_qty := r.qty;
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    PERFORM public.online_inventory_ship_reserved(
      v_fulfillment.store_id, r.variant_id, v_qty,
      v_fulfillment.order_id, 'order', 'Order shipped', p_actor
    );

    UPDATE public.order_fulfillment_items
    SET shipped_quantity = shipped_quantity + v_qty
    WHERE fulfillment_id = p_fulfillment_id AND variant_id = r.variant_id;
  END LOOP;

  UPDATE public.order_fulfillments
  SET status = 'shipped', shipped_at = now(), inventory_committed = true, updated_at = now()
  WHERE id = p_fulfillment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_apply_order_stock(
  p_order_id uuid,
  p_multiplier integer DEFAULT -1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_is_staff boolean;
  r record;
  v_delta numeric;
  v_product_id uuid;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order id is required';
  END IF;

  IF p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid stock multiplier';
  END IF;

  SELECT user_id, inventory_committed, store_id, source, inventory_reserved
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Online / manual online sales use online inventory reservation flow
  IF COALESCE(v_order.source, 'online') = 'online' THEN
    IF p_multiplier = -1 THEN
      PERFORM public.setup_order_fulfillments_and_reserve(p_order_id);
    ELSE
      PERFORM public.release_order_inventory_reservations(p_order_id);
    END IF;
    RETURN;
  END IF;

  IF p_multiplier = -1 AND v_order.inventory_committed THEN
    RETURN;
  END IF;

  IF p_multiplier = 1 AND NOT v_order.inventory_committed THEN
    RETURN;
  END IF;

  IF v_order.store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required for ERP stock movement';
  END IF;

  v_is_staff := public.is_staff_user(v_uid);
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(v_order.store_id, v_uid);

  -- Physical sales orders deduct product-level store stock
  FOR r IN
    SELECT
      COALESCE(oi.product_id, pv.product_id) AS product_id,
      SUM(oi.quantity)::numeric AS qty
    FROM public.order_items oi
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    WHERE oi.order_id = p_order_id
      AND COALESCE(oi.product_id, pv.product_id) IS NOT NULL
    GROUP BY COALESCE(oi.product_id, pv.product_id)
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_delta := r.qty * p_multiplier;

    PERFORM public.store_product_inventory_apply_delta(
      v_order.store_id, r.product_id, v_delta, v_uid
    );

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta,
      CASE WHEN p_multiplier = -1 THEN 'sale' ELSE 'return' END,
      p_order_id, 'order',
      CASE WHEN p_multiplier = -1 THEN 'ERP sales order' ELSE 'ERP sales order restore' END,
      v_order.store_id, NULL, NULL, v_uid
    );
  END LOOP;

  UPDATE public.orders
  SET inventory_committed = (p_multiplier = -1)
  WHERE id = p_order_id;
END;
$$;

-- Deprecate central reconcile from store_inventory (no longer authoritative for online)
CREATE OR REPLACE FUNCTION public.reconcile_central_inventory_from_stores(
  p_variant_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Online inventory is fed via online_stock_transfers only; no auto-reconcile.
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_order_fulfillment_store(
  p_order_id uuid,
  p_store_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fulfillment_id uuid;
  v_line record;
BEGIN
  IF NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  PERFORM public.require_store_access(p_store_id, p_actor);

  PERFORM public.release_order_inventory_reservations(p_order_id);

  DELETE FROM public.order_fulfillment_items
  WHERE fulfillment_id IN (
    SELECT id FROM public.order_fulfillments WHERE order_id = p_order_id
  );
  DELETE FROM public.order_fulfillments WHERE order_id = p_order_id;

  v_fulfillment_id := gen_random_uuid();
  INSERT INTO public.order_fulfillments (id, order_id, store_id, status, reserved_at)
  VALUES (v_fulfillment_id, p_order_id, p_store_id, 'reserved', now());

  FOR v_line IN
    SELECT oi.id AS order_item_id, oi.variant_id, oi.quantity::numeric AS qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
  LOOP
    IF COALESCE(public.online_inventory_available(p_store_id, v_line.variant_id), 0) < v_line.qty THEN
      RAISE EXCEPTION 'Insufficient online stock at assigned store for variant %', v_line.variant_id;
    END IF;

    INSERT INTO public.order_fulfillment_items (
      fulfillment_id, order_item_id, variant_id, quantity, reserved_quantity
    )
    VALUES (v_fulfillment_id, v_line.order_item_id, v_line.variant_id, v_line.qty, v_line.qty);

    PERFORM public.online_inventory_reserve(p_store_id, v_line.variant_id, v_line.qty, p_actor);
  END LOOP;

  UPDATE public.orders
  SET store_id = p_store_id, fulfillment_status = 'reserved', inventory_reserved = true
  WHERE id = p_order_id;
END;
$$;

-- Patch create_erp_invoice to persist product_id on lines
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

  PERFORM public.require_store_access(p_store_id, p_created_by);

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
      invoice_id, variant_id, product_id, product_name, quantity, unit_price,
      base_price, gst_rate, gst_amount, total_amount, vendor_id,
      unit_id, description, taxable_amount
    )
    VALUES (
      v_invoice_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      NULLIF(v_line ->> 'product_id', '')::uuid,
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
  END IF;

  IF p_estimate_id IS NOT NULL THEN
    UPDATE public.erp_estimates
    SET status = 'converted', converted_invoice_id = v_invoice_id, updated_at = now()
    WHERE id = p_estimate_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;


GRANT EXECUTE ON FUNCTION public.store_product_inventory_available(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_product_inventory_apply_delta(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_store_product_inventory_stock(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_product_stock_movement(uuid, numeric, text, uuid, text, text, uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_inventory_available(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_inventory_reserve(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_inventory_release_reservation(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_inventory_ship_reserved(uuid, uuid, numeric, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_online_stock_transfer(uuid, uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_online_stock_transfer(uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_online_stock_transfer(uuid, uuid) TO authenticated;

-- Patch stock adjustment create for product-level lines
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
  v_product_id uuid;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line is required';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_adj_id, v_adj_number
  FROM public.erp_next_document_ref('stock_adjustment') AS t;

  INSERT INTO public.erp_stock_adjustments (
    id, adjustment_number, store_id, adjustment_date, status, note, created_by
  )
  VALUES (
    v_adj_id, v_adj_number, p_store_id, p_adjustment_date,
    CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,
    p_note, p_created_by
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_direction := v_line ->> 'direction';
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_cost := COALESCE((v_line ->> 'purchase_cost')::numeric, 0);
    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;

    IF v_product_id IS NULL THEN
      v_product_id := (
        SELECT product_id FROM public.product_variants
        WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid
      );
    END IF;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required for adjustment line';
    END IF;

    IF v_qty <= 0 OR v_direction NOT IN ('add', 'remove') THEN
      RAISE EXCEPTION 'Invalid adjustment line';
    END IF;

    IF v_direction = 'add' AND v_cost <= 0 THEN
      RAISE EXCEPTION 'Purchase cost is required when adding stock';
    END IF;

    IF v_direction = 'remove' THEN
      v_cost := 0;
    END IF;

    v_total := CASE WHEN v_direction = 'add' THEN ROUND(v_qty * v_cost, 2) ELSE 0 END;

    INSERT INTO public.erp_stock_adjustment_lines (
      adjustment_id, variant_id, product_id, direction, quantity, purchase_cost, line_total
    )
    VALUES (
      v_adj_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
      v_product_id,
      v_direction, v_qty, v_cost, v_total
    );

    IF v_direction = 'add' THEN
      v_add_cost := v_add_cost + v_total;
    ELSE
      v_remove_cost := v_remove_cost + v_total;
    END IF;
  END LOOP;

  UPDATE public.erp_stock_adjustments
  SET add_cost_total = v_add_cost, remove_cost_total = v_remove_cost, updated_at = now()
  WHERE id = v_adj_id;

  IF p_finalize THEN
    PERFORM public.finalize_erp_stock_adjustment(v_adj_id, p_created_by);
  END IF;

  RETURN v_adj_id;
END;
$$;


-- ─── 6b. Purchase document lines + create RPC patches ─────────────────────

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

ALTER TABLE public.erp_purchase_bill_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id);

UPDATE public.purchase_order_items poi
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = poi.variant_id AND poi.product_id IS NULL;

UPDATE public.erp_purchase_bill_lines bl
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = bl.variant_id AND bl.product_id IS NULL;

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
  v_product_id uuid;
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

    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    IF v_product_id IS NULL AND NULLIF(v_line ->> 'variant_id', '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid;
    END IF;

    INSERT INTO public.purchase_order_items (
      po_id, product_id, variant_id, quantity, price, tax_rate_percent, tax_amount, line_total
    )
    VALUES (
      v_po_id,
      v_product_id,
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

  v_total := GREATEST(0, ROUND(v_total - COALESCE(p_discount, 0), 2));

  UPDATE public.purchase_orders
  SET subtotal = ROUND(v_subtotal, 2),
      tax_total = ROUND(v_tax, 2),
      total_amount = v_total
  WHERE id = v_po_id;

  RETURN v_po_id;
END;
$$;

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
  v_product_id uuid;
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
    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    IF v_product_id IS NULL AND NULLIF(v_line ->> 'variant_id', '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid;
    END IF;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'product_id is required on transfer request lines';
    END IF;

    INSERT INTO public.erp_transfer_request_lines (
      request_id, product_id, variant_id, quantity, source_available, transfer_price,
      sales_price, average_purchase_cost, note
    )
    VALUES (
      v_req_id,
      v_product_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
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
  v_product_id uuid;
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

    v_product_id := NULLIF(v_line ->> 'product_id', '')::uuid;
    IF v_product_id IS NULL AND NULLIF(v_line ->> 'variant_id', '') IS NOT NULL THEN
      SELECT product_id INTO v_product_id
      FROM public.product_variants
      WHERE id = NULLIF(v_line ->> 'variant_id', '')::uuid;
    END IF;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'product_id is required on store transfer lines';
    END IF;

    INSERT INTO public.erp_store_transfer_lines (
      transfer_id, product_id, variant_id, quantity, purchase_price, sales_price,
      markup_percent, markup_type, markup_amount, transfer_price, line_total
    )
    VALUES (
      v_transfer_id,
      v_product_id,
      NULLIF(v_line ->> 'variant_id', '')::uuid,
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

CREATE OR REPLACE FUNCTION public.get_erp_reconciliation_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_journal_unbalanced integer;
  v_online_inventory numeric;
  v_physical_inventory numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(*) INTO v_journal_unbalanced
  FROM public.journal_entries
  WHERE status = 'posted' AND total_debit <> total_credit;

  SELECT COALESCE(SUM(stock), 0) INTO v_online_inventory FROM public.inventory;
  SELECT COALESCE(SUM(stock), 0) INTO v_physical_inventory FROM public.store_product_inventory;

  v_result := jsonb_build_object(
    'journal_balanced', v_journal_unbalanced = 0,
    'journal_unbalanced_count', v_journal_unbalanced,
    'central_inventory_total', v_online_inventory,
    'store_inventory_total', v_physical_inventory,
    'inventory_store_gap', v_online_inventory - v_physical_inventory,
    'legacy_unallocated_stock', GREATEST(0, v_online_inventory - v_physical_inventory),
    'customer_checks', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT u.id AS user_id, u.name,
          COALESCE(u.opening_balance, 0) AS opening_balance,
          COALESCE(inv.total_invoiced, 0) AS total_invoiced,
          COALESCE(pay.total_paid, 0) AS total_paid,
          COALESCE(u.opening_balance, 0) + COALESCE(inv.total_invoiced, 0) - COALESCE(pay.total_paid, 0) AS computed_balance,
          COALESCE(u.balance, 0) AS stored_balance
        FROM public.users u
        LEFT JOIN (
          SELECT user_id, SUM(total_amount) AS total_invoiced
          FROM public.invoices
          WHERE status IN ('issued', 'partial', 'paid', 'overdue')
          GROUP BY user_id
        ) inv ON inv.user_id = u.id
        LEFT JOIN (
          SELECT user_id, SUM(amount) AS total_paid
          FROM public.customer_payments
          GROUP BY user_id
        ) pay ON pay.user_id = u.id
        WHERE u.role = 'customer'
        LIMIT 50
      ) r
    )
  );

  RETURN v_result;
END;
$$;

COMMIT;
