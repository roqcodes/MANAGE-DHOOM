-- Single-round-trip customer ERP profile for admin edit form.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_invoices_user_open_receivables
  ON public.invoices (user_id)
  WHERE status <> 'cancelled' AND COALESCE(balance_due, 0) > 0;

CREATE OR REPLACE FUNCTION public.get_customer_erp_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_exposure numeric := 0;
  v_city_id uuid;
  v_street_id uuid;
  v_mall_id uuid;
  v_city_name text;
  v_street_name text;
  v_mall_name text;
  v_composed text;
  v_legacy text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT
    u.id,
    u.customer_number,
    u.name,
    u.email,
    u.phone,
    u.avatar_url,
    u.company_name,
    u.trn,
    u.contact_display_name,
    u.location,
    u.po_box,
    u.customer_notes,
    COALESCE(u.opening_balance, 0) AS opening_balance,
    u.opening_balance_date,
    u.is_verified,
    u.created_at,
    ccl.credit_limit,
    a.line1,
    a.line2,
    a.city AS addr_city,
    a.state,
    a.pincode,
    a.city_id,
    a.street_id,
    a.mall_id,
    st.name AS st_name,
    st.city_id AS st_city_id,
    ml.name AS ml_name,
    ml.street_id AS ml_street_id,
    ct.name AS ct_name
  INTO v_row
  FROM public.users u
  LEFT JOIN public.customer_credit_limits ccl ON ccl.user_id = u.id
  LEFT JOIN public.addresses a
    ON a.user_id = u.id AND a.is_default = true
  LEFT JOIN public.erp_address_streets st ON st.id = a.street_id
  LEFT JOIN public.erp_address_malls ml ON ml.id = a.mall_id
  LEFT JOIN public.erp_address_cities ct ON ct.id = a.city_id
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(i.balance_due), 0)
  INTO v_exposure
  FROM public.invoices i
  WHERE i.user_id = p_user_id
    AND i.status <> 'cancelled'
    AND COALESCE(i.balance_due, 0) > 0;

  v_exposure := COALESCE(v_row.opening_balance, 0) + COALESCE(v_exposure, 0);

  v_city_id := v_row.city_id;
  v_street_id := v_row.street_id;
  v_mall_id := v_row.mall_id;

  IF v_street_id IS NOT NULL THEN
    IF v_row.st_city_id IS NULL
      OR (v_city_id IS NOT NULL AND v_row.st_city_id IS DISTINCT FROM v_city_id)
    THEN
      v_street_id := NULL;
      v_mall_id := NULL;
    ELSIF v_city_id IS NULL THEN
      v_city_id := v_row.st_city_id;
    END IF;
  END IF;

  IF v_mall_id IS NOT NULL THEN
    IF v_row.ml_street_id IS NULL
      OR (v_street_id IS NOT NULL AND v_row.ml_street_id IS DISTINCT FROM v_street_id)
    THEN
      v_mall_id := NULL;
    ELSIF v_street_id IS NULL THEN
      v_street_id := v_row.ml_street_id;
      IF v_city_id IS NULL THEN
        SELECT s.city_id INTO v_city_id
        FROM public.erp_address_streets s
        WHERE s.id = v_street_id;
      END IF;
    END IF;
  END IF;

  v_city_name := NULL;
  v_street_name := NULL;
  v_mall_name := NULL;

  IF v_city_id IS NOT NULL THEN
    SELECT c.name INTO v_city_name FROM public.erp_address_cities c WHERE c.id = v_city_id;
  END IF;
  IF v_street_id IS NOT NULL THEN
    SELECT s.name INTO v_street_name FROM public.erp_address_streets s WHERE s.id = v_street_id;
  END IF;
  IF v_mall_id IS NOT NULL THEN
    SELECT m.name INTO v_mall_name FROM public.erp_address_malls m WHERE m.id = v_mall_id;
  END IF;

  v_composed := NULLIF(
    trim(both FROM concat_ws(', ', v_mall_name, v_street_name, v_city_name)),
    ''
  );

  IF v_composed IS NULL AND (
    v_row.line1 IS NOT NULL
    OR v_row.line2 IS NOT NULL
    OR v_row.addr_city IS NOT NULL
    OR v_row.state IS NOT NULL
    OR v_row.pincode IS NOT NULL
  ) THEN
    v_legacy := NULLIF(
      trim(both FROM concat_ws(
        ', ',
        NULLIF(trim(both FROM COALESCE(v_row.line1, '')), ''),
        NULLIF(trim(both FROM COALESCE(v_row.line2, '')), ''),
        NULLIF(trim(both FROM COALESCE(v_row.addr_city, '')), ''),
        NULLIF(trim(both FROM COALESCE(v_row.state, '')), ''),
        NULLIF(trim(both FROM COALESCE(v_row.pincode, '')), '')
      )),
      ''
    );
    v_composed := v_legacy;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'customer_number', v_row.customer_number,
    'name', v_row.name,
    'email', v_row.email,
    'phone', v_row.phone,
    'avatar_url', NULLIF(trim(both FROM COALESCE(v_row.avatar_url, '')), ''),
    'company_name', v_row.company_name,
    'trn', v_row.trn,
    'contact_display_name', v_row.contact_display_name,
    'location', v_row.location,
    'po_box', v_row.po_box,
    'customer_notes', v_row.customer_notes,
    'opening_balance', COALESCE(v_row.opening_balance, 0),
    'opening_balance_date', v_row.opening_balance_date,
    'credit_limit', v_row.credit_limit,
    'outstanding_balance', v_exposure,
    'address', v_composed,
    'address_city_id', v_city_id,
    'address_city_name', COALESCE(v_city_name, v_row.addr_city, v_row.location),
    'address_mall_id', v_mall_id,
    'address_mall_name', v_mall_name,
    'address_street_id', v_street_id,
    'address_street_name', v_street_name,
    'is_verified', COALESCE(v_row.is_verified, true),
    'created_at', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_erp_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_erp_profile(uuid) TO authenticated;

COMMIT;
