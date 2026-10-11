-- Online channel stats: include app orders with null store_id (store-scoped POS still matches store_id).

CREATE OR REPLACE FUNCTION public.get_admin_order_channel_stats(
  p_store_id uuid,
  p_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_pending integer := 0;
  v_processing integer := 0;
  v_shipped integer := 0;
  v_delivered integer := 0;
  v_cancelled integer := 0;
  v_reversals numeric := 0;
  v_items numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  IF p_channel NOT IN ('erp', 'online') THEN
    RAISE EXCEPTION 'Invalid channel';
  END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE o.status = 'pending')::int,
    COUNT(*) FILTER (WHERE o.status = 'processing')::int,
    COUNT(*) FILTER (WHERE o.status = 'shipped')::int,
    COUNT(*) FILTER (WHERE o.status = 'delivered')::int,
    COUNT(*) FILTER (WHERE o.status = 'cancelled')::int,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'cancelled'), 0)
  INTO v_total, v_pending, v_processing, v_shipped, v_delivered, v_cancelled, v_reversals
  FROM public.orders o
  WHERE (
      (p_channel = 'erp' AND o.store_id = p_store_id)
      OR (p_channel = 'online' AND (o.store_id = p_store_id OR o.store_id IS NULL))
    )
    AND (
      (p_channel = 'erp' AND o.source = 'sales_order')
      OR (
        p_channel = 'online'
        AND (o.source IS NULL OR o.source IN ('online', 'manual'))
      )
    );

  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO v_items
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE (
      (p_channel = 'erp' AND o.store_id = p_store_id)
      OR (p_channel = 'online' AND (o.store_id = p_store_id OR o.store_id IS NULL))
    )
    AND (
      (p_channel = 'erp' AND o.source = 'sales_order')
      OR (
        p_channel = 'online'
        AND (o.source IS NULL OR o.source IN ('online', 'manual'))
      )
    );

  RETURN jsonb_build_object(
    'total_orders', v_total,
    'pending_count', v_pending,
    'processing_count', v_processing,
    'shipped_count', v_shipped,
    'delivered_count', v_delivered,
    'cancelled_count', v_cancelled,
    'items_ordered', v_items,
    'orders_fulfilled', v_delivered + v_shipped,
    'sales_reversals', ROUND(v_reversals, 2)
  );
END;
$$;
