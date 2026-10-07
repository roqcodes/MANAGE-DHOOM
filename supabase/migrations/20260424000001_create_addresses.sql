-- Address management tables for B2B wholesale marketplace
-- Run in Supabase SQL Editor or as migration

BEGIN;

-- Customer addresses
CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL, -- e.g., "Home", "Office", "Warehouse"
  line1 text NOT NULL,
  line2 text,
  city text NOT NULL,
  state text NOT NULL,
  pincode text NOT NULL,
  phone text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_addresses_user_id ON public.addresses(user_id);
CREATE INDEX idx_addresses_is_default ON public.addresses(user_id, is_default) WHERE is_default = true;

-- Function: Get addresses for user
CREATE OR REPLACE FUNCTION public.get_addresses_for_user(p_user_id uuid)
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
          'id', a.id,
          'user_id', a.user_id,
          'label', a.label,
          'line1', a.line1,
          'line2', a.line2,
          'city', a.city,
          'state', a.state,
          'pincode', a.pincode,
          'phone', a.phone,
          'is_default', a.is_default,
          'created_at', a.created_at,
          'updated_at', a.updated_at
        ) ORDER BY a.is_default DESC, a.created_at DESC
      )
      FROM public.addresses a
      WHERE a.user_id = p_user_id
    ),
    '[]'::json
  );
END;
$$;

-- Function: Create address
CREATE OR REPLACE FUNCTION public.create_address(
  p_user_id uuid,
  p_label text,
  p_line1 text,
  p_line2 text,
  p_city text,
  p_state text,
  p_pincode text,
  p_phone text,
  p_is_default boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_existing_default boolean;
BEGIN
  -- If this is default, unset other defaults
  IF p_is_default THEN
    UPDATE public.addresses
    SET is_default = false, updated_at = now()
    WHERE user_id = p_user_id AND is_default = true;
  END IF;

  -- Insert new address
  INSERT INTO public.addresses (
    user_id, label, line1, line2, city, state, pincode, phone, is_default
  )
  VALUES (
    p_user_id, p_label, p_line1, p_line2, p_city, p_state, p_pincode, p_phone, p_is_default
  )
  RETURNING json_build_object(
    'id', id,
    'user_id', user_id,
    'label', label,
    'line1', line1,
    'line2', line2,
    'city', city,
    'state', state,
    'pincode', pincode,
    'phone', phone,
    'is_default', is_default,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Function: Update address
CREATE OR REPLACE FUNCTION public.update_address(
  p_user_id uuid,
  p_address_id uuid,
  p_label text,
  p_line1 text,
  p_line2 text,
  p_city text,
  p_state text,
  p_pincode text,
  p_phone text,
  p_is_default boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- If setting as default, unset other defaults
  IF p_is_default THEN
    UPDATE public.addresses
    SET is_default = false, updated_at = now()
    WHERE user_id = p_user_id
      AND id != p_address_id
      AND is_default = true;
  END IF;

  -- Update address
  UPDATE public.addresses
  SET
    label = COALESCE(p_label, label),
    line1 = COALESCE(p_line1, line1),
    line2 = COALESCE(p_line2, line2),
    city = COALESCE(p_city, city),
    state = COALESCE(p_state, state),
    pincode = COALESCE(p_pincode, pincode),
    phone = COALESCE(p_phone, phone),
    is_default = COALESCE(p_is_default, is_default),
    updated_at = now()
  WHERE id = p_address_id AND user_id = p_user_id
  RETURNING json_build_object(
    'id', id,
    'user_id', user_id,
    'label', label,
    'line1', line1,
    'line2', line2,
    'city', city,
    'state', state,
    'pincode', pincode,
    'phone', phone,
    'is_default', is_default,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Function: Delete address
CREATE OR REPLACE FUNCTION public.delete_address(p_user_id uuid, p_address_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted boolean;
BEGIN
  DELETE FROM public.addresses
  WHERE id = p_address_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;

-- Function: Set default address
CREATE OR REPLACE FUNCTION public.set_default_address(p_user_id uuid, p_address_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Unset all defaults
  UPDATE public.addresses
  SET is_default = false, updated_at = now()
  WHERE user_id = p_user_id AND is_default = true;

  -- Set new default
  UPDATE public.addresses
  SET is_default = true, updated_at = now()
  WHERE id = p_address_id AND user_id = p_user_id
  RETURNING json_build_object(
    'id', id,
    'user_id', user_id,
    'label', label,
    'line1', line1,
    'line2', line2,
    'city', city,
    'state', state,
    'pincode', pincode,
    'phone', phone,
    'is_default', is_default,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_addresses_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_address(uuid, text, text, text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_address(uuid, uuid, text, text, text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_address(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_address(uuid, uuid) TO authenticated;

-- Row Level Security
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see their own addresses
CREATE POLICY "Users can view own addresses"
  ON public.addresses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own addresses"
  ON public.addresses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own addresses"
  ON public.addresses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own addresses"
  ON public.addresses FOR DELETE
  USING (auth.uid() = user_id);

COMMIT;
