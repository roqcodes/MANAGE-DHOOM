-- Stock movements table for inventory audit trail
-- Run in Supabase SQL Editor or as migration

BEGIN;

-- Stock movements: audit trail for all inventory changes
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL, -- positive = in, negative = out
  type text NOT NULL CHECK (type IN (
    'receipt',      -- vendor PO receipt
    'sale',         -- order fulfillment
    'adjustment',   -- manual correction
    'transfer',     -- warehouse transfer
    'damaged',      -- damaged stock write-off
    'return'        -- customer return
  )),
  reference_id uuid, -- order_id, po_id, or null for manual adjustments
  reference_type text, -- 'order', 'purchase_order', 'adjustment', etc.
  reason text,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_variant_id ON public.stock_movements(variant_id);
CREATE INDEX idx_stock_movements_type ON public.stock_movements(type);
CREATE INDEX idx_stock_movements_reference ON public.stock_movements(reference_id, reference_type);
CREATE INDEX idx_stock_movements_created_at ON public.stock_movements(created_at DESC);
CREATE INDEX idx_stock_movements_user_id ON public.stock_movements(user_id);

-- Function: Log stock movement
CREATE OR REPLACE FUNCTION public.log_stock_movement(
  p_variant_id uuid,
  p_quantity integer,
  p_type text,
  p_reference_id uuid DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.stock_movements (
    variant_id, quantity, type, reference_id, reference_type, reason, user_id
  ) VALUES (
    p_variant_id, p_quantity, p_type, p_reference_id, p_reference_type, p_reason, v_user_id
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

-- Function: Get movements for variant
CREATE OR REPLACE FUNCTION public.get_movements_for_variant(
  p_variant_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', sm.id,
          'variant_id', sm.variant_id,
          'quantity', sm.quantity,
          'type', sm.type,
          'reference_id', sm.reference_id,
          'reference_type', sm.reference_type,
          'reason', sm.reason,
          'user_id', sm.user_id,
          'created_at', sm.created_at,
          'user', json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email
          )
        ) ORDER BY sm.created_at DESC
      )
      FROM public.stock_movements sm
      LEFT JOIN users u ON u.id = sm.user_id
      WHERE sm.variant_id = p_variant_id
      LIMIT p_limit OFFSET p_offset
    ),
    '[]'::json
  );
END;
$$;

-- Function: Get movements count for variant
CREATE OR REPLACE FUNCTION public.get_movements_count(p_variant_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.stock_movements WHERE variant_id = p_variant_id;
  RETURN v_count;
END;
$$;

-- Function: Get all movements (admin view)
CREATE OR REPLACE FUNCTION public.get_all_movements(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_type_filter text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', sm.id,
          'variant_id', sm.variant_id,
          'quantity', sm.quantity,
          'type', sm.type,
          'reference_id', sm.reference_id,
          'reference_type', sm.reference_type,
          'reason', sm.reason,
          'user_id', sm.user_id,
          'created_at', sm.created_at,
          'variant', json_build_object(
            'id', pv.id,
            'name', pv.name,
            'product', json_build_object(
              'id', p.id,
              'name', p.name
            )
          ),
          'user', json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email
          )
        ) ORDER BY sm.created_at DESC
      )
      FROM public.stock_movements sm
      LEFT JOIN product_variants pv ON pv.id = sm.variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      LEFT JOIN users u ON u.id = sm.user_id
      WHERE (p_type_filter IS NULL OR sm.type = p_type_filter)
      LIMIT p_limit OFFSET p_offset
    ),
    '[]'::json
  );
END;
$$;

-- Grant execute to authenticated users (admin-only checks done in app layer)
GRANT EXECUTE ON FUNCTION public.log_stock_movement(uuid, integer, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_movements_for_variant(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_movements_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_movements(integer, integer, text) TO authenticated;

-- Row Level Security
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- RLS: Authenticated users can view movements (admin checks in app layer)
CREATE POLICY "Authenticated users can view stock movements"
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (true);

-- RLS: Only insert via function (handled by log_stock_movement)
CREATE POLICY "Authenticated users can insert stock movements"
  ON public.stock_movements FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
