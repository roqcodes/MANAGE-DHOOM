-- Hierarchical address lookups: city → street → mall (scoped search & unique per parent).

BEGIN;

ALTER TABLE public.erp_address_streets
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.erp_address_cities (id) ON DELETE CASCADE;

ALTER TABLE public.erp_address_malls
  ADD COLUMN IF NOT EXISTS street_id uuid REFERENCES public.erp_address_streets (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.erp_address_streets_name_unique;
DROP INDEX IF EXISTS public.erp_address_malls_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS erp_address_streets_city_name_unique
  ON public.erp_address_streets (city_id, lower(trim(name)))
  WHERE city_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS erp_address_malls_street_name_unique
  ON public.erp_address_malls (street_id, lower(trim(name)))
  WHERE street_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_address_streets_city_id
  ON public.erp_address_streets (city_id);

CREATE INDEX IF NOT EXISTS idx_erp_address_malls_street_id
  ON public.erp_address_malls (street_id);

CREATE INDEX IF NOT EXISTS idx_erp_address_streets_city_name_prefix
  ON public.erp_address_streets (city_id, name text_pattern_ops)
  WHERE city_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_address_malls_street_name_prefix
  ON public.erp_address_malls (street_id, name text_pattern_ops)
  WHERE street_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.erp_search_address_lookups(text, text, integer);

CREATE OR REPLACE FUNCTION public.erp_search_address_lookups(
  p_kind text,
  p_query text,
  p_limit integer DEFAULT 25,
  p_city_id uuid DEFAULT NULL,
  p_street_id uuid DEFAULT NULL
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

  IF v_kind = 'city' THEN
    IF v_q = '' THEN
      RETURN QUERY
      SELECT c.id, c.name
      FROM public.erp_address_cities c
      ORDER BY c.name
      LIMIT v_limit;
      RETURN;
    END IF;

    v_escaped := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
    v_prefix := v_escaped || '%';
    v_contains := '%' || v_escaped || '%';

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

  IF v_kind = 'street' THEN
    IF p_city_id IS NULL THEN
      RETURN;
    END IF;

    IF v_q = '' THEN
      RETURN QUERY
      SELECT s.id, s.name
      FROM public.erp_address_streets s
      WHERE s.city_id = p_city_id
      ORDER BY s.name
      LIMIT v_limit;
      RETURN;
    END IF;

    v_escaped := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
    v_prefix := v_escaped || '%';
    v_contains := '%' || v_escaped || '%';

    RETURN QUERY
    SELECT s.id, s.name
    FROM public.erp_address_streets s
    WHERE s.city_id = p_city_id
      AND s.name ILIKE v_prefix ESCAPE '\'
    ORDER BY s.name
    LIMIT v_limit;

    IF FOUND THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT s.id, s.name
    FROM public.erp_address_streets s
    WHERE s.city_id = p_city_id
      AND s.name ILIKE v_contains ESCAPE '\'
    ORDER BY s.name
    LIMIT v_limit;
    RETURN;
  END IF;

  IF p_street_id IS NULL THEN
    RETURN;
  END IF;

  IF p_city_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.erp_address_streets s
      WHERE s.id = p_street_id
        AND s.city_id = p_city_id
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF v_q = '' THEN
    RETURN QUERY
    SELECT m.id, m.name
    FROM public.erp_address_malls m
    WHERE m.street_id = p_street_id
    ORDER BY m.name
    LIMIT v_limit;
    RETURN;
  END IF;

  v_escaped := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_prefix := v_escaped || '%';
  v_contains := '%' || v_escaped || '%';

  RETURN QUERY
  SELECT m.id, m.name
  FROM public.erp_address_malls m
  WHERE m.street_id = p_street_id
    AND m.name ILIKE v_prefix ESCAPE '\'
  ORDER BY m.name
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.name
  FROM public.erp_address_malls m
  WHERE m.street_id = p_street_id
    AND m.name ILIKE v_contains ESCAPE '\'
  ORDER BY m.name
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_search_address_lookups(text, text, integer, uuid, uuid) TO authenticated;

COMMIT;
