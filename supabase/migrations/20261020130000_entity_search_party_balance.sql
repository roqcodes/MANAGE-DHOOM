-- Party pickers: expose current AR/AP balance; keep customer_number for search only (not displayed in UI).

CREATE OR REPLACE FUNCTION public.get_vendor_ap_exposure(p_vendor_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening numeric := 0;
  v_payables numeric := 0; 
  v_credits numeric := 0;
BEGIN
  IF p_vendor_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(v.opening_balance, 0)
  INTO v_opening
  FROM public.vendors v
  WHERE v.id = p_vendor_id;

  SELECT COALESCE(SUM(b.balance_due), 0)
  INTO v_payables
  FROM public.erp_purchase_bills b
  WHERE b.vendor_id = p_vendor_id
    AND b.status IN ('finalized', 'partial', 'paid');

  SELECT COALESCE(SUM(c.balance_remaining), 0)
  INTO v_credits
  FROM public.erp_vendor_credits c
  WHERE c.vendor_id = p_vendor_id
    AND c.status IN ('issued', 'applied');

  RETURN COALESCE(v_opening, 0) + COALESCE(v_payables, 0) - COALESCE(v_credits, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vendor_ap_exposure(uuid) TO authenticated;

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
  avatar_url text,
  current_balance numeric
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
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      u.customer_number,
      u.avatar_url,
      public.get_customer_ar_exposure(u.id) AS current_balance
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
  SELECT
    u.id,
    u.name,
    u.email,
    u.phone,
    u.customer_number,
    u.avatar_url,
    public.get_customer_ar_exposure(u.id) AS current_balance
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
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      u.customer_number,
      u.avatar_url,
      public.get_customer_ar_exposure(u.id) AS current_balance
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
  SELECT
    u.id,
    u.name,
    u.email,
    u.phone,
    u.customer_number,
    u.avatar_url,
    public.get_customer_ar_exposure(u.id) AS current_balance
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
  SELECT
    u.id,
    u.name,
    u.email,
    u.phone,
    u.customer_number,
    u.avatar_url,
    public.get_customer_ar_exposure(u.id) AS current_balance
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

DROP FUNCTION IF EXISTS public.erp_search_vendors(text, integer);

CREATE FUNCTION public.erp_search_vendors(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  contact text,
  trn text,
  current_balance numeric
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
    SELECT
      v.id,
      v.name,
      v.email,
      v.phone,
      v.contact,
      v.trn,
      public.get_vendor_ap_exposure(v.id) AS current_balance
    FROM public.vendors v
    WHERE v.is_active = true
    ORDER BY v.name NULLS LAST
    LIMIT v_limit;
    RETURN;
  END IF;

  v_escaped := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_prefix := v_escaped || '%';
  v_contains := '%' || v_escaped || '%';

  RETURN QUERY
  SELECT
    v.id,
    v.name,
    v.email,
    v.phone,
    v.contact,
    v.trn,
    public.get_vendor_ap_exposure(v.id) AS current_balance
  FROM public.vendors v
  WHERE v.is_active = true
    AND v.trn IS NOT NULL
    AND v.trn = v_q
  ORDER BY v.name NULLS LAST
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.name,
    v.email,
    v.phone,
    v.contact,
    v.trn,
    public.get_vendor_ap_exposure(v.id) AS current_balance
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

  RETURN QUERY
  SELECT
    v.id,
    v.name,
    v.email,
    v.phone,
    v.contact,
    v.trn,
    public.get_vendor_ap_exposure(v.id) AS current_balance
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
