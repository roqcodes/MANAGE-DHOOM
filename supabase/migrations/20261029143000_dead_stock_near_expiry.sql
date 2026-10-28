-- Dead stock report: expired lots + expiring-soon lots (same FIFO estimate model).

BEGIN;

DROP FUNCTION IF EXISTS public.get_erp_dead_stock_report(date, uuid, uuid, uuid, integer, integer, text);

CREATE OR REPLACE FUNCTION public.get_erp_dead_stock_report(
  p_as_of date DEFAULT CURRENT_DATE,
  p_store_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_days_expired_min integer DEFAULT NULL,
  p_days_expired_max integer DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_expiry_view text DEFAULT 'expired',
  p_expiry_window_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(BTRIM(p_search), '');
  v_view text := lower(NULLIF(BTRIM(p_expiry_view), ''));
  v_window integer := GREATEST(COALESCE(p_expiry_window_days, 30), 1);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id);

  IF v_view IS NULL OR v_view NOT IN ('expired', 'near_expiry', 'expiring_soon') THEN
    v_view := 'expired';
  END IF;
  IF v_view = 'expiring_soon' THEN
    v_view := 'near_expiry';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.sort_key, r.product_name)
    FROM (
      WITH lot_sources AS (
        SELECT
          pb.store_id,
          COALESCE(pbl.product_id, pv.product_id) AS product_id,
          pbl.id AS line_id,
          pbl.product_name,
          pbl.barcode,
          pbl.expiry_date,
          GREATEST(
            0::numeric,
            COALESCE(
              NULLIF(pbl.accepted_qty, 0),
              NULLIF(pbl.received_qty, 0),
              pbl.quantity
            )
          ) AS lot_qty,
          pbl.purchase_price,
          pb.purchase_bill_number AS source_ref,
          'purchase_bill'::text AS source_type
        FROM public.erp_purchase_bill_lines pbl
        JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
        LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
        WHERE pb.inventory_committed = true
          AND pb.status <> 'cancelled'
          AND pbl.expiry_date IS NOT NULL
          AND COALESCE(pbl.product_id, pv.product_id) IS NOT NULL
          AND (
            (v_view = 'expired' AND pbl.expiry_date < p_as_of)
            OR (
              v_view = 'near_expiry'
              AND pbl.expiry_date >= p_as_of
              AND pbl.expiry_date <= p_as_of + v_window
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.erp_purchase_receives pr
            WHERE pr.purchase_bill_id = pb.id
              AND pr.inventory_committed = true
              AND pr.status NOT IN ('cancelled', 'reversed')
          )

        UNION ALL

        SELECT
          pr.store_id,
          COALESCE(pbl.product_id, pv.product_id) AS product_id,
          prl.id AS line_id,
          prl.product_name,
          prl.barcode,
          prl.expiry_date,
          GREATEST(0::numeric, COALESCE(prl.accepted_qty, 0)) AS lot_qty,
          prl.purchase_price,
          pr.receive_number AS source_ref,
          'purchase_receive'::text AS source_type
        FROM public.erp_purchase_receive_lines prl
        JOIN public.erp_purchase_receives pr ON pr.id = prl.purchase_receive_id
        LEFT JOIN public.erp_purchase_bill_lines pbl ON pbl.id = prl.bill_line_id
        LEFT JOIN public.product_variants pv ON pv.id = prl.variant_id
        WHERE pr.inventory_committed = true
          AND pr.status NOT IN ('cancelled', 'reversed')
          AND prl.expiry_date IS NOT NULL
          AND COALESCE(pbl.product_id, pv.product_id) IS NOT NULL
          AND COALESCE(prl.accepted_qty, 0) > 0
          AND (
            (v_view = 'expired' AND prl.expiry_date < p_as_of)
            OR (
              v_view = 'near_expiry'
              AND prl.expiry_date >= p_as_of
              AND prl.expiry_date <= p_as_of + v_window
            )
          )
      ),
      lots AS (
        SELECT
          ls.*,
          (p_as_of - ls.expiry_date)::integer AS days_expired,
          (ls.expiry_date - p_as_of)::integer AS days_to_expiry,
          SUM(ls.lot_qty) OVER (
            PARTITION BY ls.store_id, ls.product_id
            ORDER BY ls.expiry_date, ls.line_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cum_lot_qty,
          COALESCE(
            SUM(ls.lot_qty) OVER (
              PARTITION BY ls.store_id, ls.product_id
              ORDER BY ls.expiry_date, ls.line_id
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0::numeric
          ) AS prev_cum_lot_qty
        FROM lot_sources ls
        WHERE ls.lot_qty > 0
      ),
      allocated AS (
        SELECT
          l.store_id,
          l.product_id,
          l.line_id,
          l.product_name,
          l.barcode,
          l.expiry_date,
          l.days_expired,
          l.days_to_expiry,
          l.purchase_price,
          l.source_ref,
          l.source_type,
          GREATEST(
            0::numeric,
            LEAST(
              l.lot_qty,
              GREATEST(0::numeric, COALESCE(spi.stock, 0)) - l.prev_cum_lot_qty
            )
          ) AS dead_qty
        FROM lots l
        JOIN public.store_product_inventory spi
          ON spi.store_id = l.store_id
         AND spi.product_id = l.product_id
        WHERE COALESCE(spi.stock, 0) > 0
      )
      SELECT
        a.line_id AS id,
        COALESCE(p.barcode, p.id::text) AS product_code,
        COALESCE(p.name, a.product_name) AS product_name,
        c.name AS category_name,
        b.name AS brand_name,
        s.name AS store_name,
        a.store_id,
        a.expiry_date,
        CASE WHEN v_view = 'expired' THEN a.days_expired ELSE NULL END AS days_expired,
        CASE WHEN v_view = 'near_expiry' THEN a.days_to_expiry ELSE NULL END AS days_to_expiry,
        ROUND(a.dead_qty, 2) AS quantity,
        ROUND(COALESCE(a.purchase_price, spi.purchase_price, p.purchase_price, 0), 2) AS purchase_price,
        ROUND(
          a.dead_qty * COALESCE(a.purchase_price, spi.purchase_price, p.purchase_price, 0),
          2
        ) AS stock_purchase_value,
        a.source_ref,
        a.source_type,
        CASE
          WHEN v_view = 'near_expiry' THEN a.days_to_expiry
          ELSE -a.days_expired
        END AS sort_key
      FROM allocated a
      JOIN public.products p ON p.id = a.product_id
      JOIN public.stores s ON s.id = a.store_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN public.store_product_inventory spi
        ON spi.store_id = a.store_id
       AND spi.product_id = a.product_id
      WHERE a.dead_qty > 0.0001
        AND a.store_id = p_store_id
        AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (
          v_view = 'near_expiry'
          OR p_days_expired_min IS NULL
          OR a.days_expired >= p_days_expired_min
        )
        AND (
          v_view = 'near_expiry'
          OR p_days_expired_max IS NULL
          OR a.days_expired <= p_days_expired_max
        )
        AND (
          v_view = 'expired'
          OR p_days_expired_min IS NULL
          OR a.days_to_expiry >= p_days_expired_min
        )
        AND (
          v_view = 'expired'
          OR p_days_expired_max IS NULL
          OR a.days_to_expiry <= p_days_expired_max
        )
        AND (
          v_search IS NULL
          OR p.name ILIKE '%' || v_search || '%'
          OR p.barcode ILIKE '%' || v_search || '%'
          OR a.product_name ILIKE '%' || v_search || '%'
          OR a.source_ref ILIKE '%' || v_search || '%'
        )
    ) r
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_erp_dead_stock_report(
  date, uuid, uuid, uuid, integer, integer, text, text, integer
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
