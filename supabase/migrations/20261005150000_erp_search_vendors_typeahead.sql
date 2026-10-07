-- Vendor picker typeahead: browse on empty query, prefix + substring on active vendors.

CREATE INDEX IF NOT EXISTS idx_vendors_name_prefix
  ON public.vendors (name text_pattern_ops)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_vendors_trn_trgm
  ON public.vendors USING gin (trn extensions.gin_trgm_ops)
  WHERE is_active = true AND trn IS NOT NULL;

CREATE OR REPLACE FUNCTION public.erp_search_vendors(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  contact text,
  trn text
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
    SELECT v.id, v.name, v.email, v.phone, v.contact, v.trn
    FROM public.vendors v
    WHERE v.is_active = true
    ORDER BY v.name NULLS LAST
    LIMIT v_limit;
    RETURN;
  END IF;

  v_escaped := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_prefix := v_escaped || '%';
  v_contains := '%' || v_escaped || '%';

  -- Exact TRN
  RETURN QUERY
  SELECT v.id, v.name, v.email, v.phone, v.contact, v.trn
  FROM public.vendors v
  WHERE v.is_active = true
    AND v.trn IS NOT NULL
    AND v.trn = v_q
  ORDER BY v.name NULLS LAST
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Prefix match
  RETURN QUERY
  SELECT v.id, v.name, v.email, v.phone, v.contact, v.trn
  FROM public.vendors v
  WHERE v.is_active = true
    AND (
      v.name ILIKE v_prefix ESCAPE '\'
      OR v.contact ILIKE v_prefix ESCAPE '\'
      OR v.email ILIKE v_prefix ESCAPE '\'
      OR v.phone ILIKE v_prefix ESCAPE '\'
      OR v.trn ILIKE v_prefix ESCAPE '\'
    )
  ORDER BY v.name NULLS LAST
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Substring fallback
  RETURN QUERY
  SELECT v.id, v.name, v.email, v.phone, v.contact, v.trn
  FROM public.vendors v
  WHERE v.is_active = true
    AND (
      v.name ILIKE v_contains ESCAPE '\'
      OR v.contact ILIKE v_contains ESCAPE '\'
      OR v.email ILIKE v_contains ESCAPE '\'
      OR v.phone ILIKE v_contains ESCAPE '\'
      OR v.trn ILIKE v_contains ESCAPE '\'
    )
  ORDER BY v.name NULLS LAST
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_search_vendors(text, integer) TO authenticated;

-- Customer picker: allow browse on empty query (focus / loadOnFocus parity with vendors).
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
BEGIN
  IF v_q = '' THEN
    RETURN QUERY
    SELECT u.id, u.name, u.email, u.phone, u.customer_number
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
