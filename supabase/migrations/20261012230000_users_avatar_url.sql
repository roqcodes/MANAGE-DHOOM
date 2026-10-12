-- Customer / user profile photo (Cloudinary URL or external link).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.users.avatar_url IS 'Profile image URL (uploaded or pasted). Shown in admin and customer app when set.';

-- Return type adds avatar_url; CREATE OR REPLACE cannot change OUT row shape.
DROP FUNCTION IF EXISTS public.erp_search_customers(text, integer);

CREATE FUNCTION public.erp_search_customers(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  customer_number text,
  avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_q text := btrim(COALESCE(p_query, ''));
  v_escaped text;
  v_prefix text;
  v_contains text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
BEGIN
  IF v_q = '' THEN
    RETURN QUERY
    SELECT u.id, u.name, u.email, u.phone, u.customer_number, u.avatar_url
    FROM public.users u
    WHERE (u.role IS NULL OR u.role = 'customer')
    ORDER BY u.name NULLS LAST
    LIMIT v_limit;
    RETURN;
  END IF;

  v_escaped := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_prefix := v_escaped || '%';
  v_contains := '%' || v_escaped || '%';

  RETURN QUERY
  SELECT u.id, u.name, u.email, u.phone, u.customer_number, u.avatar_url
  FROM public.users u
  WHERE (u.role IS NULL OR u.role = 'customer')
    AND u.customer_number IS NOT NULL
    AND u.customer_number = v_q
  ORDER BY u.name NULLS LAST
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  IF position('@' IN v_q) > 0 THEN
    RETURN QUERY
    SELECT u.id, u.name, u.email, u.phone, u.customer_number, u.avatar_url
    FROM public.users u
    WHERE (u.role IS NULL OR u.role = 'customer')
      AND u.email IS NOT NULL
      AND lower(u.email) = lower(v_q)
    ORDER BY u.name NULLS LAST
    LIMIT v_limit;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT u.id, u.name, u.email, u.phone, u.customer_number, u.avatar_url
  FROM public.users u
  WHERE (u.role IS NULL OR u.role = 'customer')
    AND (
      u.name ILIKE v_prefix ESCAPE '\'
      OR u.email ILIKE v_prefix ESCAPE '\'
      OR u.phone ILIKE v_prefix ESCAPE '\'
      OR u.customer_number ILIKE v_prefix ESCAPE '\'
    )
  ORDER BY u.name NULLS LAST
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.name, u.email, u.phone, u.customer_number, u.avatar_url
  FROM public.users u
  WHERE (u.role IS NULL OR u.role = 'customer')
    AND (
      u.name ILIKE v_contains ESCAPE '\'
      OR u.email ILIKE v_contains ESCAPE '\'
      OR u.phone ILIKE v_contains ESCAPE '\'
      OR u.customer_number ILIKE v_contains ESCAPE '\'
    )
  ORDER BY u.name NULLS LAST
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_search_customers(text, integer) TO authenticated;
