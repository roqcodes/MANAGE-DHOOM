-- Align legacy addresses (address_line) with canonical line1/line2/phone schema.
-- Allow admin/manager to read customer addresses for order fulfillment.

BEGIN;

ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS line1 text;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS line2 text;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.addresses
SET is_default = false
WHERE is_default IS NULL;

-- Copy legacy street field into line1.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'addresses'
      AND column_name = 'address_line'
  ) THEN
    UPDATE public.addresses
    SET line1 = COALESCE(NULLIF(trim(line1), ''), NULLIF(trim(address_line), ''))
    WHERE line1 IS NULL OR trim(line1) = '';
  END IF;
END $$;

UPDATE public.addresses a
SET phone = COALESCE(
  NULLIF(trim(a.phone), ''),
  NULLIF(trim(u.phone), ''),
  '0000000000'
)
FROM public.users u
WHERE u.id = a.user_id
  AND (a.phone IS NULL OR trim(a.phone) = '');

UPDATE public.addresses
SET label = COALESCE(NULLIF(trim(label), ''), 'Address')
WHERE label IS NULL OR trim(label) = '';

UPDATE public.addresses
SET line1 = 'Address pending'
WHERE line1 IS NULL OR trim(line1) = '';

UPDATE public.addresses
SET city = COALESCE(NULLIF(trim(city), ''), '—')
WHERE city IS NULL OR trim(city) = '';

UPDATE public.addresses
SET state = COALESCE(NULLIF(trim(state), ''), '—')
WHERE state IS NULL OR trim(state) = '';

UPDATE public.addresses
SET pincode = COALESCE(NULLIF(trim(pincode), ''), '000000')
WHERE pincode IS NULL OR trim(pincode) = '';

UPDATE public.addresses
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

-- Keep legacy column in sync when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'addresses'
      AND column_name = 'address_line'
  ) THEN
    UPDATE public.addresses
    SET address_line = line1
    WHERE address_line IS DISTINCT FROM line1;
  END IF;
END $$;

ALTER TABLE public.addresses ALTER COLUMN line1 SET DEFAULT '';
ALTER TABLE public.addresses ALTER COLUMN line1 SET NOT NULL;

ALTER TABLE public.addresses ALTER COLUMN phone SET DEFAULT '0000000000';
ALTER TABLE public.addresses ALTER COLUMN phone SET NOT NULL;

ALTER TABLE public.addresses ALTER COLUMN label SET DEFAULT 'Address';
ALTER TABLE public.addresses ALTER COLUMN label SET NOT NULL;

ALTER TABLE public.addresses ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.addresses ALTER COLUMN updated_at SET NOT NULL;

DROP POLICY IF EXISTS "Admins and managers can view all addresses" ON public.addresses;
CREATE POLICY "Admins and managers can view all addresses"
  ON public.addresses FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'manager')
    )
  );

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
          'latitude', a.latitude,
          'longitude', a.longitude,
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
BEGIN
  IF p_is_default THEN
    UPDATE public.addresses
    SET is_default = false, updated_at = now()
    WHERE user_id = p_user_id AND is_default = true;
  END IF;

  INSERT INTO public.addresses (
    user_id, label, line1, line2, city, state, pincode, phone, is_default
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
    COALESCE(p_is_default, false)
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

-- Sync address_line when the legacy column still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'addresses'
      AND column_name = 'address_line'
  ) THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION public.sync_address_line_from_line1()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $body$
      BEGIN
        NEW.address_line := NEW.line1;
        RETURN NEW;
      END;
      $body$;
    $func$;

    DROP TRIGGER IF EXISTS trg_addresses_sync_address_line ON public.addresses;
    CREATE TRIGGER trg_addresses_sync_address_line
      BEFORE INSERT OR UPDATE OF line1 ON public.addresses
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_address_line_from_line1();
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.get_addresses_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_address(uuid, text, text, text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_address(uuid, uuid, text, text, text, text, text, text, text, boolean) TO authenticated;

COMMIT;
