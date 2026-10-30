-- City → street → mall filters for customer-linked lists and reports.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_user_matches_address_filter(
  p_user_id uuid,
  p_city_id uuid DEFAULT NULL,
  p_street_id uuid DEFAULT NULL,
  p_mall_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN p_city_id IS NULL AND p_street_id IS NULL AND p_mall_id IS NULL THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.addresses a
      LEFT JOIN public.erp_address_streets st ON st.id = a.street_id
      LEFT JOIN public.erp_address_malls ml ON ml.id = a.mall_id
      WHERE a.user_id = p_user_id
        AND a.is_default = true
        AND (p_mall_id IS NULL OR a.mall_id = p_mall_id)
        AND (p_street_id IS NULL OR a.street_id = p_street_id)
        AND (
          p_city_id IS NULL
          OR a.city_id = p_city_id
          OR st.city_id = p_city_id
        )
        AND (p_street_id IS NULL OR p_mall_id IS NULL OR ml.street_id = p_street_id)
        AND (
          p_city_id IS NULL
          OR p_street_id IS NULL
          OR a.city_id = p_city_id
          OR st.city_id = p_city_id
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.erp_filter_user_ids_by_address(
  p_city_id uuid DEFAULT NULL,
  p_street_id uuid DEFAULT NULL,
  p_mall_id uuid DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE public.erp_user_matches_address_filter(u.id, p_city_id, p_street_id, p_mall_id)
    AND (p_city_id IS NOT NULL OR p_street_id IS NOT NULL OR p_mall_id IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.erp_user_matches_address_filter(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_filter_user_ids_by_address(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_user_matches_address_filter(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_filter_user_ids_by_address(uuid, uuid, uuid) TO authenticated;

COMMIT;
