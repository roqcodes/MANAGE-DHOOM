-- Cart system tables for B2B wholesale marketplace
-- Run in Supabase SQL Editor or as migration

BEGIN;

-- Cart header: one active cart per user
CREATE TABLE IF NOT EXISTS public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_carts_user_id ON public.carts(user_id);

-- Cart items: products/variants in cart
CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cart_id, variant_id)
);

CREATE INDEX idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX idx_cart_items_variant_id ON public.cart_items(variant_id);

-- Function: Get or create cart for user
CREATE OR REPLACE FUNCTION public.get_or_create_cart(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_id uuid;
BEGIN
  -- Try to get existing cart
  SELECT id INTO v_cart_id FROM public.carts WHERE user_id = p_user_id;

  -- Create new cart if none exists
  IF v_cart_id IS NULL THEN
    INSERT INTO public.carts (user_id)
    VALUES (p_user_id)
    RETURNING id INTO v_cart_id;
  END IF;

  RETURN v_cart_id;
END;
$$;

-- Function: Add item to cart (upsert quantity)
CREATE OR REPLACE FUNCTION public.add_to_cart(
  p_user_id uuid,
  p_variant_id uuid,
  p_quantity integer DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_id uuid;
  v_result json;
BEGIN
  -- Get or create cart
  v_cart_id := public.get_or_create_cart(p_user_id);

  -- Upsert cart item
  INSERT INTO public.cart_items (cart_id, variant_id, quantity, updated_at)
  VALUES (v_cart_id, p_variant_id, p_quantity, now())
  ON CONFLICT (cart_id, variant_id) DO UPDATE
  SET
    quantity = LEAST(cart_items.quantity + p_quantity, 10000),
    updated_at = now()
  RETURNING json_build_object(
    'id', id,
    'cart_id', cart_id,
    'variant_id', variant_id,
    'quantity', quantity
  ) INTO v_result;

  -- Update cart timestamp
  UPDATE public.carts SET updated_at = now() WHERE id = v_cart_id;

  RETURN v_result;
END;
$$;

-- Function: Update cart item quantity
CREATE OR REPLACE FUNCTION public.update_cart_item(
  p_user_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_id uuid;
  v_result json;
BEGIN
  -- Get user's cart
  SELECT id INTO v_cart_id FROM public.carts WHERE user_id = p_user_id;

  IF v_cart_id IS NULL THEN
    RAISE EXCEPTION 'Cart not found';
  END IF;

  -- Update or delete based on quantity
  IF p_quantity <= 0 THEN
    DELETE FROM public.cart_items
    WHERE cart_id = v_cart_id AND variant_id = p_variant_id;

    UPDATE public.carts SET updated_at = now() WHERE id = v_cart_id;

    RETURN NULL;
  ELSE
    UPDATE public.cart_items
    SET quantity = LEAST(p_quantity, 10000),
        updated_at = now()
    WHERE cart_id = v_cart_id AND variant_id = p_variant_id
    RETURNING json_build_object(
      'id', id,
      'cart_id', cart_id,
      'variant_id', variant_id,
      'quantity', quantity
    ) INTO v_result;

    UPDATE public.carts SET updated_at = now() WHERE id = v_cart_id;

    RETURN v_result;
  END IF;
END;
$$;

-- Function: Remove item from cart
CREATE OR REPLACE FUNCTION public.remove_from_cart(
  p_user_id uuid,
  p_variant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_id uuid;
BEGIN
  SELECT id INTO v_cart_id FROM public.carts WHERE user_id = p_user_id;

  IF v_cart_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.cart_items
  WHERE cart_id = v_cart_id AND variant_id = p_variant_id;

  UPDATE public.carts SET updated_at = now() WHERE id = v_cart_id;

  RETURN true;
END;
$$;

-- Function: Clear entire cart
CREATE OR REPLACE FUNCTION public.clear_cart(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_id uuid;
BEGIN
  SELECT id INTO v_cart_id FROM public.carts WHERE user_id = p_user_id;

  IF v_cart_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;
  UPDATE public.carts SET updated_at = now() WHERE id = v_cart_id;

  RETURN true;
END;
$$;

-- Function: Get cart with items and product details
CREATE OR REPLACE FUNCTION public.get_cart_with_items(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_id uuid;
  v_result json;
BEGIN
  SELECT id INTO v_cart_id FROM public.carts WHERE user_id = p_user_id;

  IF v_cart_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'items', COALESCE(
      json_agg(
        json_build_object(
          'id', ci.id,
          'cart_id', ci.cart_id,
          'variant_id', ci.variant_id,
          'quantity', ci.quantity,
          'added_at', ci.added_at,
          'product', json_build_object(
            'id', p.id,
            'name', p.name,
            'image_url', p.image_url
          ),
          'variant', json_build_object(
            'id', pv.id,
            'name', pv.name,
            'price', pv.price,
            'mrp', pv.mrp
          )
        )
      ) FILTER (WHERE ci.id IS NOT NULL),
      '[]'::json
    )
  )
  INTO v_result
  FROM public.carts c
  LEFT JOIN public.cart_items ci ON ci.cart_id = c.id
  LEFT JOIN public.product_variants pv ON pv.id = ci.variant_id
  LEFT JOIN public.products p ON p.id = pv.product_id
  WHERE c.id = v_cart_id
  GROUP BY c.id, c.user_id, c.created_at, c.updated_at;

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_or_create_cart(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_to_cart(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_cart_item(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_from_cart(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_cart(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cart_with_items(uuid) TO authenticated;

-- Row Level Security
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see their own cart
CREATE POLICY "Users can view own cart"
  ON public.carts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cart"
  ON public.carts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cart"
  ON public.carts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cart"
  ON public.carts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS: Users can only see items in their own cart
CREATE POLICY "Users can view own cart items"
  ON public.cart_items FOR SELECT
  USING (
    cart_id IN (
      SELECT id FROM public.carts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own cart items"
  ON public.cart_items FOR INSERT
  WITH CHECK (
    cart_id IN (
      SELECT id FROM public.carts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own cart items"
  ON public.cart_items FOR UPDATE
  USING (
    cart_id IN (
      SELECT id FROM public.carts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own cart items"
  ON public.cart_items FOR DELETE
  USING (
    cart_id IN (
      SELECT id FROM public.carts WHERE user_id = auth.uid()
    )
  );

COMMIT;
