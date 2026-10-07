-- Sidebar nav badges: count in SQL instead of loading every inventory row every poll.

CREATE OR REPLACE FUNCTION public.count_inventory_nav_badges()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'critical',
    (
      SELECT count(*)::int
      FROM public.inventory
      WHERE coalesce(stock, 0) < 1
    ),
    'low',
    (
      SELECT count(*)::int
      FROM public.inventory
      WHERE coalesce(stock, 0) >= 1
        AND coalesce(stock, 0) < greatest(coalesce(reorder_point, 10), 1)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.count_inventory_nav_badges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_inventory_nav_badges() TO authenticated;
