-- Online → physical (store) stock transfers: variant-level deduct, product-level credit.

CREATE TABLE IF NOT EXISTS public.online_to_physical_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  notes text,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS online_to_physical_transfers_number_idx
  ON public.online_to_physical_transfers (transfer_number);

CREATE INDEX IF NOT EXISTS online_to_physical_transfers_store_idx
  ON public.online_to_physical_transfers (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.online_to_physical_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.online_to_physical_transfers (id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants (id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity numeric NOT NULL,
  CONSTRAINT online_to_physical_transfer_lines_qty_positive CHECK (quantity > 0),
  CONSTRAINT online_to_physical_transfer_lines_unique UNIQUE (transfer_id, variant_id)
);

CREATE INDEX IF NOT EXISTS online_to_physical_transfer_lines_transfer_idx
  ON public.online_to_physical_transfer_lines (transfer_id);

ALTER TABLE public.online_to_physical_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_to_physical_transfer_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "online_to_physical_transfers_staff" ON public.online_to_physical_transfers;
CREATE POLICY "online_to_physical_transfers_staff"
  ON public.online_to_physical_transfers FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "online_to_physical_transfer_lines_staff" ON public.online_to_physical_transfer_lines;
CREATE POLICY "online_to_physical_transfer_lines_staff"
  ON public.online_to_physical_transfer_lines FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES ('online_to_physical_transfer', 'OPT', 1, 5)
ON CONFLICT (document_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_online_to_physical_transfer(
  p_store_id uuid,
  p_lines jsonb,
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
  v_line jsonb;
  v_variant_id uuid;
  v_qty numeric;
  v_product_id uuid;
  v_available numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Transfer lines are required';
  END IF;

  v_number := public.next_erp_document_number('online_to_physical_transfer');

  INSERT INTO public.online_to_physical_transfers (
    transfer_number, store_id, notes, created_by
  )
  VALUES (v_number, p_store_id, p_notes, p_user_id)
  RETURNING id INTO v_transfer_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := (v_line ->> 'variantId')::uuid;
    v_qty := (v_line ->> 'quantity')::numeric;

    IF v_variant_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid transfer line';
    END IF;

    SELECT product_id INTO v_product_id
    FROM public.product_variants
    WHERE id = v_variant_id;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Variant not found: %', v_variant_id;
    END IF;

    v_available := public.online_inventory_available(p_store_id, v_variant_id);
    IF v_available < v_qty THEN
      RAISE EXCEPTION 'Insufficient online stock for variant % (available %, requested %)',
        v_variant_id, v_available, v_qty;
    END IF;

    PERFORM 1
    FROM public.inventory
    WHERE store_id = p_store_id AND variant_id = v_variant_id
    FOR UPDATE;

    UPDATE public.inventory
    SET stock = stock - v_qty, updated_at = now()
    WHERE store_id = p_store_id AND variant_id = v_variant_id;

    PERFORM public.store_product_inventory_apply_delta(
      p_store_id, v_product_id, v_qty, p_user_id
    );

    INSERT INTO public.online_to_physical_transfer_lines (
      transfer_id, variant_id, product_id, quantity
    )
    VALUES (v_transfer_id, v_variant_id, v_product_id, v_qty);

    PERFORM public.log_stock_movement(
      v_variant_id, -v_qty, 'transfer_out', v_transfer_id, 'online_to_physical_transfer',
      'Online to store transfer', p_store_id, NULL, NULL, p_user_id
    );

    PERFORM public.log_product_stock_movement(
      v_product_id, v_qty, 'transfer_in', v_transfer_id, 'online_to_physical_transfer',
      'Online to store transfer', p_store_id, NULL, NULL, p_user_id
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_online_to_physical_transfer(uuid, jsonb, text, uuid) TO authenticated;
