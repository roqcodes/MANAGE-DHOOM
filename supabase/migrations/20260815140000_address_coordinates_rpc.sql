-- Persist map coordinates when customers create/update addresses.

DROP FUNCTION IF EXISTS public.create_address(uuid, text, text, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.create_address(uuid, text, text, text, text, text, text, text, boolean, numeric, numeric);
DROP FUNCTION IF EXISTS public.update_address(uuid, uuid, text, text, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.update_address(uuid, uuid, text, text, text, text, text, text, text, boolean, numeric, numeric);

CREATE OR REPLACE FUNCTION public.create_address(
  p_user_id uuid,
  p_label text,
  p_line1 text,
  p_line2 text,
  p_city text,
  p_state text,
  p_pincode text,
  p_phone text,
  p_is_default boolean DEFAULT false,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  IF p_is_default THEN
    UPDATE public.addresses
    SET is_default = false, updated_at = now()
    WHERE user_id = p_user_id AND is_default = true;
  END IF;

  INSERT INTO public.addresses (
    user_id, label, line1, line2, city, state, pincode, phone, is_default,
    latitude, longitude
  )
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_label), ''), 'Address'),
    COALESCE(NULLIF(trim(p_line1), ''), 'Address pending'),
    NULLIF(trim(p_line2), ''),
    COALESCE(NULLIF(trim(p_city), ''), '—'),
    COALESCE(NULLIF(trim(p_state), ''), '—'),
    COALESCE(NULLIF(trim(p_pincode), ''), '000000'),
    COALESCE(NULLIF(trim(p_phone), ''), '0000000000'),
    COALESCE(p_is_default, false),
    p_latitude,
    p_longitude
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
    'latitude', latitude,
    'longitude', longitude,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;

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
  p_is_default boolean,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  IF COALESCE(p_is_default, false) THEN
    UPDATE public.addresses
    SET is_default = false, updated_at = now()
    WHERE user_id = p_user_id
      AND id != p_address_id
      AND is_default = true;
  END IF;

  UPDATE public.addresses
  SET
    label = COALESCE(NULLIF(trim(p_label), ''), label),
    line1 = COALESCE(NULLIF(trim(p_line1), ''), line1),
    line2 = CASE
      WHEN p_line2 IS NULL THEN line2
      ELSE NULLIF(trim(p_line2), '')
    END,
    city = COALESCE(NULLIF(trim(p_city), ''), city),
    state = COALESCE(NULLIF(trim(p_state), ''), state),
    pincode = COALESCE(NULLIF(trim(p_pincode), ''), pincode),
    phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
    is_default = COALESCE(p_is_default, is_default),
    latitude = COALESCE(p_latitude, latitude),
    longitude = COALESCE(p_longitude, longitude),
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
    'latitude', latitude,
    'longitude', longitude,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_address(uuid, text, text, text, text, text, text, text, boolean, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_address(uuid, uuid, text, text, text, text, text, text, text, boolean, numeric, numeric) TO authenticated;
