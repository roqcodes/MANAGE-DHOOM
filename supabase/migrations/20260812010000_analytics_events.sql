-- Optimized reach tables (unique customer × target). No total-hit event spam.
BEGIN;

-- ─── Product view reach: one row per customer × product ─────────────────────
CREATE TABLE IF NOT EXISTS public.product_view_reach (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_view_reach_seen_at
  ON public.product_view_reach (first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_view_reach_product_seen
  ON public.product_view_reach (product_id, first_seen_at DESC);

COMMENT ON TABLE public.product_view_reach IS
  'Reach: whether a customer has seen a product (PK lookup).';

-- ─── Cart reach: one row per customer × variant ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.cart_reach (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  value_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (value_amount >= 0),
  first_carted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_reach_carted_at
  ON public.cart_reach (first_carted_at DESC);

CREATE INDEX IF NOT EXISTS idx_cart_reach_product_carted
  ON public.cart_reach (product_id, first_carted_at DESC)
  WHERE product_id IS NOT NULL;

-- ─── Order funnel reach: one row per order ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_funnel_reach (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total_amount numeric(14, 2) NOT NULL DEFAULT 0,
  checkout_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_order_funnel_checkout_at
  ON public.order_funnel_reach (checkout_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_funnel_completed_at
  ON public.order_funnel_reach (completed_at DESC)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_funnel_user
  ON public.order_funnel_reach (user_id)
  WHERE user_id IS NOT NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.product_view_reach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_reach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_funnel_reach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers read own product views" ON public.product_view_reach;
CREATE POLICY "Customers read own product views"
  ON public.product_view_reach FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Customers insert own product views" ON public.product_view_reach;
CREATE POLICY "Customers insert own product views"
  ON public.product_view_reach FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage product views" ON public.product_view_reach;
CREATE POLICY "Admins manage product views"
  ON public.product_view_reach FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Customers read own cart reach" ON public.cart_reach;
CREATE POLICY "Customers read own cart reach"
  ON public.cart_reach FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage cart reach" ON public.cart_reach;
CREATE POLICY "Admins manage cart reach"
  ON public.cart_reach FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Customers read own order funnel" ON public.order_funnel_reach;
CREATE POLICY "Customers read own order funnel"
  ON public.order_funnel_reach FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage order funnel" ON public.order_funnel_reach;
CREATE POLICY "Admins manage order funnel"
  ON public.order_funnel_reach FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager')
    )
  );

-- ─── Hot path: record product view (INSERT … ON CONFLICT DO NOTHING) ────────
CREATE OR REPLACE FUNCTION public.record_product_view(
  p_product_id uuid,
  p_variant_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL OR p_product_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.product_view_reach (user_id, product_id, variant_id)
  VALUES (v_uid, p_product_id, p_variant_id)
  ON CONFLICT (user_id, product_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_product_view(uuid, uuid) TO authenticated;

-- PK lookup: did this customer see the product?
CREATE OR REPLACE FUNCTION public.customer_has_viewed_product(
  p_user_id uuid,
  p_product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.product_view_reach r
    WHERE r.user_id = p_user_id
      AND r.product_id = p_product_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.customer_has_viewed_product(uuid, uuid) TO authenticated;

-- Funnel reach counts for admin date window (single round-trip aggregates)
CREATE OR REPLACE FUNCTION public.analytics_funnel_reach(
  p_from timestamptz,
  p_to timestamptz,
  p_product_id uuid DEFAULT NULL
)
RETURNS TABLE (
  view_reach bigint,
  cart_reach bigint,
  checkout_reach bigint,
  purchase_reach bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      SELECT COUNT(*)::bigint
      FROM public.product_view_reach v
      WHERE v.first_seen_at >= p_from
        AND v.first_seen_at <= p_to
        AND (p_product_id IS NULL OR v.product_id = p_product_id)
    ) AS view_reach,
    (
      SELECT COUNT(DISTINCT c.user_id)::bigint
      FROM public.cart_reach c
      WHERE c.first_carted_at >= p_from
        AND c.first_carted_at <= p_to
        AND (p_product_id IS NULL OR c.product_id = p_product_id)
    ) AS cart_reach,
    (
      SELECT COUNT(DISTINCT o.user_id)::bigint
      FROM public.order_funnel_reach o
      WHERE o.checkout_at >= p_from
        AND o.checkout_at <= p_to
        AND o.user_id IS NOT NULL
        AND (
          p_product_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.order_items oi
            JOIN public.product_variants pv ON pv.id = oi.variant_id
            WHERE oi.order_id = o.order_id
              AND pv.product_id = p_product_id
          )
        )
    ) AS checkout_reach,
    (
      SELECT COUNT(DISTINCT o.user_id)::bigint
      FROM public.order_funnel_reach o
      WHERE o.completed_at IS NOT NULL
        AND o.completed_at >= p_from
        AND o.completed_at <= p_to
        AND o.user_id IS NOT NULL
        AND (
          p_product_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.order_items oi
            JOIN public.product_variants pv ON pv.id = oi.variant_id
            WHERE oi.order_id = o.order_id
              AND pv.product_id = p_product_id
          )
        )
    ) AS purchase_reach;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_funnel_reach(timestamptz, timestamptz, uuid)
  TO authenticated;

-- ─── Triggers: write-only, no pre-SELECT ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_cart_reach_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_product_id uuid;
  v_price numeric(14, 2);
BEGIN
  SELECT c.user_id INTO v_user_id
  FROM public.carts c
  WHERE c.id = NEW.cart_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pv.product_id, COALESCE(pv.price, 0)
  INTO v_product_id, v_price
  FROM public.product_variants pv
  WHERE pv.id = NEW.variant_id;

  INSERT INTO public.cart_reach (
    user_id, variant_id, product_id, quantity, value_amount
  )
  VALUES (
    v_user_id,
    NEW.variant_id,
    v_product_id,
    NEW.quantity,
    COALESCE(v_price, 0) * NEW.quantity
  )
  ON CONFLICT (user_id, variant_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analytics_cart_item_insert ON public.cart_items;
DROP TRIGGER IF EXISTS cart_reach_insert ON public.cart_items;
CREATE TRIGGER cart_reach_insert
  AFTER INSERT ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_cart_reach_insert();

CREATE OR REPLACE FUNCTION public.trg_order_funnel_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_funnel_reach (
    order_id,
    user_id,
    total_amount,
    checkout_at,
    completed_at
  )
  VALUES (
    NEW.id,
    NEW.user_id,
    COALESCE(NEW.total_amount, 0),
    COALESCE(NEW.created_at, now()),
    CASE
      WHEN NEW.status IN ('processing', 'shipped', 'delivered')
        THEN COALESCE(NEW.created_at, now())
      ELSE NULL
    END
  )
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analytics_order_insert ON public.orders;
DROP TRIGGER IF EXISTS order_funnel_insert ON public.orders;
CREATE TRIGGER order_funnel_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_order_funnel_insert();

CREATE OR REPLACE FUNCTION public.trg_order_funnel_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('processing', 'shipped', 'delivered')
     AND COALESCE(OLD.status, '') NOT IN ('processing', 'shipped', 'delivered')
  THEN
    INSERT INTO public.order_funnel_reach (
      order_id, user_id, total_amount, checkout_at, completed_at
    )
    VALUES (
      NEW.id,
      NEW.user_id,
      COALESCE(NEW.total_amount, 0),
      COALESCE(NEW.created_at, now()),
      now()
    )
    ON CONFLICT (order_id) DO UPDATE
      SET completed_at = COALESCE(public.order_funnel_reach.completed_at, EXCLUDED.completed_at),
          total_amount = EXCLUDED.total_amount;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analytics_order_status_update ON public.orders;
DROP TRIGGER IF EXISTS order_funnel_status ON public.orders;
CREATE TRIGGER order_funnel_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_order_funnel_status();

-- Product-wise reach detail: counts + customer names per stage
CREATE OR REPLACE FUNCTION public.analytics_product_reach_detail(
  p_from timestamptz,
  p_to timestamptz,
  p_product_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  view_count bigint,
  cart_count bigint,
  order_count bigint,
  units_sold bigint,
  revenue numeric,
  viewers jsonb,
  carters jsonb,
  buyers jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH products_in_scope AS (
    SELECT p.id, COALESCE(p.name, 'Product') AS name
    FROM public.products p
    WHERE p_product_id IS NULL OR p.id = p_product_id
  ),
  views AS (
    SELECT
      v.product_id,
      COUNT(*)::bigint AS view_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'customerId', v.user_id,
            'customerName', COALESCE(u.name, 'Customer'),
            'phone', u.phone,
            'at', v.first_seen_at
          )
          ORDER BY v.first_seen_at DESC
        ) FILTER (WHERE v.user_id IS NOT NULL),
        '[]'::jsonb
      ) AS viewers
    FROM public.product_view_reach v
    LEFT JOIN public.users u ON u.id = v.user_id
    WHERE v.first_seen_at >= p_from
      AND v.first_seen_at <= p_to
      AND (p_product_id IS NULL OR v.product_id = p_product_id)
    GROUP BY v.product_id
  ),
  carts AS (
    SELECT
      c.product_id,
      COUNT(DISTINCT c.user_id)::bigint AS cart_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'customerId', c.user_id,
            'customerName', COALESCE(u.name, 'Customer'),
            'phone', u.phone,
            'at', c.first_carted_at,
            'quantity', c.quantity,
            'value', c.value_amount
          )
          ORDER BY c.first_carted_at DESC
        ) FILTER (WHERE c.user_id IS NOT NULL),
        '[]'::jsonb
      ) AS carters
    FROM public.cart_reach c
    LEFT JOIN public.users u ON u.id = c.user_id
    WHERE c.first_carted_at >= p_from
      AND c.first_carted_at <= p_to
      AND c.product_id IS NOT NULL
      AND (p_product_id IS NULL OR c.product_id = p_product_id)
    GROUP BY c.product_id
  ),
  orders_raw AS (
    SELECT
      pv.product_id,
      o.user_id,
      COALESCE(NULLIF(o.customer_name, ''), u.name, 'Customer') AS customer_name,
      COALESCE(o.phone, u.phone) AS phone,
      COALESCE(ofr.completed_at, o.created_at) AS occurred_at,
      COALESCE(oi.quantity, 0) AS quantity,
      COALESCE(oi.final_price, oi.price, 0) * COALESCE(oi.quantity, 0) AS line_value
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.order_funnel_reach ofr ON ofr.order_id = o.id
    LEFT JOIN public.users u ON u.id = o.user_id
    WHERE o.created_at >= p_from
      AND o.created_at <= p_to
      AND o.status IN ('processing', 'shipped', 'delivered')
      AND (p_product_id IS NULL OR pv.product_id = p_product_id)
  ),
  orders AS (
    SELECT
      r.product_id,
      COUNT(DISTINCT r.user_id)::bigint AS order_count,
      COALESCE(SUM(r.quantity), 0)::bigint AS units_sold,
      COALESCE(SUM(r.line_value), 0)::numeric AS revenue,
      COALESCE(
        (
          SELECT jsonb_agg(customer_row ORDER BY customer_row->>'at' DESC)
          FROM (
            SELECT DISTINCT ON (r2.user_id)
              jsonb_build_object(
                'customerId', r2.user_id,
                'customerName', r2.customer_name,
                'phone', r2.phone,
                'at', r2.occurred_at,
                'quantity', r2.quantity,
                'value', r2.line_value
              ) AS customer_row
            FROM orders_raw r2
            WHERE r2.product_id = r.product_id
              AND r2.user_id IS NOT NULL
            ORDER BY r2.user_id, r2.occurred_at DESC
          ) d
        ),
        '[]'::jsonb
      ) AS buyers
    FROM orders_raw r
    GROUP BY r.product_id
  )
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    COALESCE(v.view_count, 0) AS view_count,
    COALESCE(c.cart_count, 0) AS cart_count,
    COALESCE(ord.order_count, 0) AS order_count,
    COALESCE(ord.units_sold, 0) AS units_sold,
    COALESCE(ord.revenue, 0) AS revenue,
    COALESCE(v.viewers, '[]'::jsonb) AS viewers,
    COALESCE(c.carters, '[]'::jsonb) AS carters,
    COALESCE(ord.buyers, '[]'::jsonb) AS buyers
  FROM products_in_scope p
  LEFT JOIN views v ON v.product_id = p.id
  LEFT JOIN carts c ON c.product_id = p.id
  LEFT JOIN orders ord ON ord.product_id = p.id
  WHERE COALESCE(v.view_count, 0) > 0
     OR COALESCE(c.cart_count, 0) > 0
     OR COALESCE(ord.order_count, 0) > 0
  ORDER BY COALESCE(ord.revenue, 0) DESC, COALESCE(v.view_count, 0) DESC
  LIMIT GREATEST(COALESCE(p_limit, 40), 1);
$$;

GRANT EXECUTE ON FUNCTION public.analytics_product_reach_detail(
  timestamptz, timestamptz, uuid, integer
) TO authenticated;

-- Drop legacy polymorphic event table/RPC if a prior draft was applied
DROP FUNCTION IF EXISTS public.record_analytics_event(text, uuid, uuid, uuid, integer, numeric, text, jsonb);
DROP FUNCTION IF EXISTS public.trg_analytics_cart_item_insert();
DROP FUNCTION IF EXISTS public.trg_analytics_order_insert();
DROP FUNCTION IF EXISTS public.trg_analytics_order_status_update();
DROP TABLE IF EXISTS public.analytics_events;

COMMIT;
