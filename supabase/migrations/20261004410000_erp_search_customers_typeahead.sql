-- Customer picker typeahead: prefix + trigram, one SQL round-trip.

CREATE INDEX IF NOT EXISTS idx_users_customer_name_prefix
  ON public.users (name text_pattern_ops)
  WHERE role IS NULL OR role = 'customer';

CREATE INDEX IF NOT EXISTS idx_users_customer_number
  ON public.users (customer_number)
  WHERE (role IS NULL OR role = 'customer') AND customer_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_customer_number_trgm
  ON public.users USING gin (customer_number extensions.gin_trgm_ops)
  WHERE (role IS NULL OR role = 'customer') AND customer_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.erp_search_customers(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  customer_number text
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
  v_role_ok boolean;
BEGIN
  IF v_q = '' THEN
    RETURN;
  END IF;

  v_escaped := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_prefix := v_escaped || '%';
  v_contains := '%' || v_escaped || '%';

  -- Exact customer number
  RETURN QUERY
  SELECT u.id, u.name, u.email, u.phone, u.customer_number
  FROM public.users u
  WHERE (u.role IS NULL OR u.role = 'customer')
    AND u.customer_number IS NOT NULL
    AND u.customer_number = v_q
  ORDER BY u.name NULLS LAST
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Exact email (case-insensitive)
  IF position('@' IN v_q) > 0 THEN
    RETURN QUERY
    SELECT u.id, u.name, u.email, u.phone, u.customer_number
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

  -- Prefix match (fast path)
  RETURN QUERY
  SELECT u.id, u.name, u.email, u.phone, u.customer_number
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

  -- Substring fallback (trigram-backed)
  RETURN QUERY
  SELECT u.id, u.name, u.email, u.phone, u.customer_number
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
