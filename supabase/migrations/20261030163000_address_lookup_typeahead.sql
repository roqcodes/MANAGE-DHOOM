-- Fast city / mall / street picker: browse on focus, prefix then substring.

CREATE INDEX IF NOT EXISTS idx_erp_address_cities_name_prefix
  ON public.erp_address_cities (name text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_erp_address_malls_name_prefix
  ON public.erp_address_malls (name text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_erp_address_streets_name_prefix
  ON public.erp_address_streets (name text_pattern_ops);

CREATE OR REPLACE FUNCTION public.erp_search_address_lookups(
  p_kind text,
  p_query text,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  name text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_kind text := lower(btrim(COALESCE(p_kind, '')));
  v_q text := btrim(COALESCE(p_query, ''));
  v_escaped text;
  v_prefix text;
  v_contains text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
BEGIN
  IF v_kind NOT IN ('city', 'mall', 'street') THEN
    RETURN;
  END IF;

  IF v_q = '' THEN
    IF v_kind = 'city' THEN
      RETURN QUERY
      SELECT c.id, c.name
      FROM public.erp_address_cities c
      ORDER BY c.name
      LIMIT v_limit;
    ELSIF v_kind = 'mall' THEN
      RETURN QUERY
      SELECT m.id, m.name
      FROM public.erp_address_malls m
      ORDER BY m.name
      LIMIT v_limit;
    ELSE
      RETURN QUERY
      SELECT s.id, s.name
      FROM public.erp_address_streets s
      ORDER BY s.name
      LIMIT v_limit;
    END IF;
    RETURN;
  END IF;

  v_escaped := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_prefix := v_escaped || '%';
  v_contains := '%' || v_escaped || '%';

  IF v_kind = 'city' THEN
    RETURN QUERY
    SELECT c.id, c.name
    FROM public.erp_address_cities c
    WHERE c.name ILIKE v_prefix ESCAPE '\'
    ORDER BY c.name
    LIMIT v_limit;

    IF FOUND THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT c.id, c.name
    FROM public.erp_address_cities c
    WHERE c.name ILIKE v_contains ESCAPE '\'
    ORDER BY c.name
    LIMIT v_limit;
    RETURN;
  END IF;

  IF v_kind = 'mall' THEN
    RETURN QUERY
    SELECT m.id, m.name
    FROM public.erp_address_malls m
    WHERE m.name ILIKE v_prefix ESCAPE '\'
    ORDER BY m.name
    LIMIT v_limit;

    IF FOUND THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT m.id, m.name
    FROM public.erp_address_malls m
    WHERE m.name ILIKE v_contains ESCAPE '\'
    ORDER BY m.name
    LIMIT v_limit;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id, s.name
  FROM public.erp_address_streets s
  WHERE s.name ILIKE v_prefix ESCAPE '\'
  ORDER BY s.name
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id, s.name
  FROM public.erp_address_streets s
  WHERE s.name ILIKE v_contains ESCAPE '\'
  ORDER BY s.name
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_search_address_lookups(text, text, integer) TO authenticated;
